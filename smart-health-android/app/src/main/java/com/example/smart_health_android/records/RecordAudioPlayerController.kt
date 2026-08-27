package com.example.smart_health_android.records

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import androidx.core.net.toUri
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.example.smart_health_android.data.ScanAudioPlaybackSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class RecordPlaybackStatus {
    Idle,
    Preparing,
    Ready,
    Playing,
    Paused,
    Completed,
    Error,
}

data class RecordPlaybackState(
    val status: RecordPlaybackStatus = RecordPlaybackStatus.Idle,
    val positionMillis: Int = 0,
    val durationMillis: Int = 0,
    val errorMessage: String = "",
)

class RecordAudioPlayerController(
    context: Context,
) : DefaultLifecycleObserver {
    private val applicationContext = context.applicationContext
    private val audioManager = applicationContext.getSystemService(AudioManager::class.java)
    private val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(audioAttributes)
        .setOnAudioFocusChangeListener(::onAudioFocusChanged)
        .setWillPauseWhenDucked(true)
        .build()

    private var player: MediaPlayer? = null
    private var hasAudioFocus = false
    private val _state = MutableStateFlow(RecordPlaybackState())
    val state = _state.asStateFlow()

    fun prepare(
        source: ScanAudioPlaybackSource,
        autoPlay: Boolean = true,
    ) {
        releasePlayer(resetState = false)
        _state.value = RecordPlaybackState(status = RecordPlaybackStatus.Preparing)
        val nextPlayer = MediaPlayer()
        player = nextPlayer
        runCatching {
            nextPlayer.setAudioAttributes(audioAttributes)
            nextPlayer.setDataSource(
                applicationContext,
                source.url.toUri(),
                source.headers,
            )
            nextPlayer.setOnPreparedListener { prepared ->
                if (player !== prepared) return@setOnPreparedListener
                _state.value = RecordPlaybackState(
                    status = RecordPlaybackStatus.Ready,
                    durationMillis = prepared.duration.coerceAtLeast(0),
                )
                if (autoPlay) {
                    togglePlayback()
                }
            }
            nextPlayer.setOnCompletionListener { completed ->
                if (player !== completed) return@setOnCompletionListener
                abandonAudioFocus()
                _state.update {
                    it.copy(
                        status = RecordPlaybackStatus.Completed,
                        positionMillis = it.durationMillis,
                    )
                }
            }
            nextPlayer.setOnErrorListener { failed, _, _ ->
                if (player === failed) {
                    abandonAudioFocus()
                    _state.update {
                        it.copy(
                            status = RecordPlaybackStatus.Error,
                            errorMessage = "Không thể phát bản ghi âm thanh.",
                        )
                    }
                }
                true
            }
            nextPlayer.prepareAsync()
        }.onFailure {
            releasePlayer(resetState = false)
            _state.value = RecordPlaybackState(
                status = RecordPlaybackStatus.Error,
                errorMessage = "Không thể chuẩn bị bản ghi âm thanh.",
            )
        }
    }

    fun togglePlayback() {
        val currentPlayer = player ?: return
        when (_state.value.status) {
            RecordPlaybackStatus.Playing -> pause()
            RecordPlaybackStatus.Ready,
            RecordPlaybackStatus.Paused,
            RecordPlaybackStatus.Completed,
            -> {
                if (!requestAudioFocus()) {
                    _state.update {
                        it.copy(
                            status = RecordPlaybackStatus.Error,
                            errorMessage = "Thiết bị chưa cấp quyền phát âm thanh.",
                        )
                    }
                    return
                }
                runCatching {
                    if (_state.value.status == RecordPlaybackStatus.Completed) {
                        currentPlayer.seekTo(0)
                    }
                    currentPlayer.start()
                    _state.update {
                        it.copy(
                            status = RecordPlaybackStatus.Playing,
                            positionMillis = currentPlayer.currentPosition.coerceAtLeast(0),
                            errorMessage = "",
                        )
                    }
                }.onFailure {
                    abandonAudioFocus()
                    _state.update {
                        it.copy(
                            status = RecordPlaybackStatus.Error,
                            errorMessage = "Không thể tiếp tục phát bản ghi.",
                        )
                    }
                }
            }
            else -> Unit
        }
    }

    fun seekBy(deltaMillis: Int) {
        val currentPlayer = player ?: return
        if (_state.value.status !in setOf(
                RecordPlaybackStatus.Ready,
                RecordPlaybackStatus.Playing,
                RecordPlaybackStatus.Paused,
                RecordPlaybackStatus.Completed,
            )
        ) {
            return
        }
        val duration = _state.value.durationMillis.coerceAtLeast(0)
        val target = (currentPlayer.currentPosition + deltaMillis).coerceIn(0, duration)
        runCatching {
            currentPlayer.seekTo(target)
            _state.update {
                it.copy(
                    positionMillis = target,
                    status = if (target >= duration && duration > 0) {
                        RecordPlaybackStatus.Completed
                    } else {
                        it.status
                    },
                )
            }
        }
    }

    fun refreshPosition() {
        val currentPlayer = player ?: return
        if (_state.value.status != RecordPlaybackStatus.Playing) return
        runCatching { currentPlayer.currentPosition }
            .onSuccess { position ->
                _state.update {
                    it.copy(positionMillis = position.coerceAtLeast(0))
                }
            }
    }

    fun pause() {
        val currentPlayer = player ?: return
        if (_state.value.status != RecordPlaybackStatus.Playing) return
        runCatching { currentPlayer.pause() }
        abandonAudioFocus()
        _state.update {
            it.copy(
                status = RecordPlaybackStatus.Paused,
                positionMillis = runCatching { currentPlayer.currentPosition }.getOrDefault(
                    it.positionMillis,
                ),
            )
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        pause()
    }

    override fun onDestroy(owner: LifecycleOwner) {
        release()
    }

    fun release() {
        releasePlayer(resetState = true)
    }

    private fun onAudioFocusChanged(change: Int) {
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
            -> pause()
        }
    }

    private fun requestAudioFocus(): Boolean {
        if (hasAudioFocus) return true
        hasAudioFocus = audioManager.requestAudioFocus(focusRequest) ==
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasAudioFocus
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return
        audioManager.abandonAudioFocusRequest(focusRequest)
        hasAudioFocus = false
    }

    private fun releasePlayer(resetState: Boolean) {
        abandonAudioFocus()
        player?.let { current ->
            runCatching { current.stop() }
            runCatching { current.reset() }
            runCatching { current.release() }
        }
        player = null
        if (resetState) {
            _state.value = RecordPlaybackState()
        }
    }
}
