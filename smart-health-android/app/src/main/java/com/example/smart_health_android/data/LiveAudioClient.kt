package com.example.smart_health_android.data

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.example.smart_health_android.scan.LiveAudioExpectation
import com.example.smart_health_android.scan.LiveAudioFrameDecoder
import com.example.smart_health_android.scan.LiveAudioFrameFlags
import com.example.smart_health_android.scan.LiveAudioIdentity
import com.example.smart_health_android.scan.LiveAudioReconnectPolicy
import com.example.smart_health_android.scan.LiveAudioSequenceGuard
import com.example.smart_health_android.scan.LiveAudioTextEvent
import com.example.smart_health_android.scan.LiveAudioTextEventParser
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

class LiveAudioClient(
    context: Context,
    private val expected: LiveAudioExpectation,
    private val wsUrl: String = BackendConfig.APP_WS_URL,
    private val onConnectionChanged: (Boolean, String) -> Unit,
    private val onStatus: (BackendStatus) -> Unit,
    private val onMetrics: (LiveMetrics) -> Unit,
    private val onSamples: (FloatArray) -> Unit,
    private val onScanLifecycle: (String, String) -> Unit = { _, _ -> },
    private val onDroppedPackets: (Long) -> Unit = {},
) {
    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audioManager = appContext.getSystemService(AudioManager::class.java)
    private val connectivityManager = appContext.getSystemService(ConnectivityManager::class.java)
    private val reconnectPolicy = LiveAudioReconnectPolicy()
    private val sequenceGuard = LiveAudioSequenceGuard()
    private val stateLock = Any()
    private val bufferLock = Any()
    private val audioExecutor = ThreadPoolExecutor(
        1,
        1,
        0,
        TimeUnit.MILLISECONDS,
        ArrayBlockingQueue(8),
        { task -> Thread(task, "shcare-live-audio").apply { isDaemon = true } },
        ThreadPoolExecutor.DiscardOldestPolicy(),
    )

    @Volatile
    private var webSocket: WebSocket? = null
    private var audioTrack: AudioTrack? = null
    private var activeIdentity: LiveAudioIdentity? = null
    private var playbackEnabled = true
    private var hasAudioFocus = false
    private var closedByClient = false
    private var contractFailed = false
    private var sampleBuffer = FloatArray(WAVEFORM_SAMPLE_COUNT)
    private var sampleDispatchScheduled = false

    private val audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()

    private val audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(audioAttributes)
        .setOnAudioFocusChangeListener { change ->
            when (change) {
                AudioManager.AUDIOFOCUS_GAIN -> {
                    hasAudioFocus = true
                    if (playbackEnabled) audioTrack?.play()
                }

                AudioManager.AUDIOFOCUS_LOSS,
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
                -> {
                    hasAudioFocus = false
                    audioTrack?.pause()
                }
            }
        }
        .build()

    private val reconnectRunnable = Runnable { connectSocket() }

    fun connect() {
        if (webSocket != null || audioExecutor.isShutdown) return
        closedByClient = false
        contractFailed = false
        ensureAudioTrack()
        connectSocket()
    }

    fun close() {
        closedByClient = true
        mainHandler.removeCallbacks(reconnectRunnable)
        val socket = webSocket
        webSocket = null
        socket?.close(1000, "screen closed")
        resetSession()
        abandonAudioFocus()
        audioTrack?.pause()
        audioTrack?.flush()
        audioTrack?.release()
        audioTrack = null
        audioExecutor.shutdownNow()
        postConnection(false, "Đã ngắt kết nối")
    }

    fun setPlaybackEnabled(enabled: Boolean) {
        playbackEnabled = enabled
        if (enabled) {
            requestAudioFocus()
        } else {
            abandonAudioFocus()
            audioTrack?.pause()
            audioTrack?.flush()
        }
    }

    private fun connectSocket() {
        if (closedByClient || contractFailed || webSocket != null) return
        if (!networkAvailable()) {
            scheduleReconnect("Thiết bị đang ngoại tuyến")
            return
        }

        mainHandler.removeCallbacks(reconnectRunnable)
        postConnection(false, "Đang kết nối luồng âm thanh bảo mật…")
        val requestBuilder = Request.Builder()
            .url(wsUrl)
            .header(
                "Sec-WebSocket-Protocol",
                "$REALTIME_SUBPROTOCOL, $SCAN_SELECTOR_PREFIX${expected.scanId.toRealtimeSelector()}",
            )
        SmartHealthRepository.api.currentAuthToken()?.let { token ->
            requestBuilder.header("Authorization", "Bearer $token")
        }
        SmartHealthRepository.api.currentTwoFactorToken()?.let { token ->
            requestBuilder.header("X-Shcare-2FA-Token", token)
        }
        webSocket = SmartHealthApi.sharedClient.newWebSocket(
            requestBuilder.build(),
            socketListener,
        )
    }

    private val socketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            if (this@LiveAudioClient.webSocket !== webSocket || closedByClient) return
            reconnectPolicy.reset()
            postConnection(true, "Đã kết nối; đang chờ metadata phiên đo")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (this@LiveAudioClient.webSocket === webSocket) handleTextMessage(text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            if (this@LiveAudioClient.webSocket === webSocket) handleAudio(bytes.toByteArray())
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (this@LiveAudioClient.webSocket !== webSocket) return
            this@LiveAudioClient.webSocket = null
            resetSession()
            if (!closedByClient && !contractFailed) {
                scheduleReconnect("Kết nối realtime đã đóng")
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            if (this@LiveAudioClient.webSocket !== webSocket) return
            this@LiveAudioClient.webSocket = null
            resetSession()
            if (!closedByClient && !contractFailed) {
                scheduleReconnect(t.message ?: "Không kết nối được máy chủ")
            }
        }
    }

    private fun handleTextMessage(text: String) {
        val currentIdentity = synchronized(stateLock) { activeIdentity }
        when (val event = LiveAudioTextEventParser.parse(text, expected, currentIdentity)) {
            is LiveAudioTextEvent.SessionBound -> {
                val nextIdentity = event.session.identity()
                synchronized(stateLock) {
                    if (activeIdentity != nextIdentity) sequenceGuard.reset()
                    activeIdentity = nextIdentity
                }
                postStatus(
                    BackendStatus(
                        recording = true,
                        activeScanId = nextIdentity.scanId,
                        sampleRate = event.session.sampleRate,
                    ),
                )
                postConnection(true, "Đang nhận âm thanh từ ${nextIdentity.deviceId}")
                if (playbackEnabled) requestAudioFocus()
            }

            is LiveAudioTextEvent.SessionActive -> {
                if (currentIdentity == event.identity) {
                    postStatus(
                        BackendStatus(
                            recording = true,
                            activeScanId = event.identity.scanId,
                            sampleRate = SAMPLE_RATE,
                            updatedAt = event.updatedAt,
                        ),
                    )
                } else {
                    postConnection(true, "Thiết bị đã xác nhận; đang chờ metadata phiên đo")
                }
            }

            LiveAudioTextEvent.SessionIdle -> {
                resetSession()
                postStatus(BackendStatus(recording = false, activeScanId = null))
            }

            is LiveAudioTextEvent.Metrics -> {
                val metrics = event.snapshot
                postMetrics(
                    LiveMetrics(
                        peak = metrics.peak,
                        rms = metrics.rms,
                        levelPercent = metrics.levelPercent,
                        bpm = metrics.bpm,
                        recording = true,
                        activeScanId = metrics.identity.scanId,
                        updatedAt = metrics.updatedAt,
                    ),
                )
            }

            is LiveAudioTextEvent.ScanLifecycle -> {
                if (event.state == "scan_stopped" || event.state == "scan_interrupted") {
                    resetSession()
                    postStatus(BackendStatus(recording = false, activeScanId = null))
                }
                mainHandler.post { onScanLifecycle(event.scanId, event.state) }
            }

            is LiveAudioTextEvent.Rejected -> failContract(event.reason)
            LiveAudioTextEvent.Ignored -> Unit
        }
    }

    private fun handleAudio(bytes: ByteArray) {
        val identity = synchronized(stateLock) { activeIdentity }
            ?: return failContract("Metadata phiên đo phải đến trước dữ liệu âm thanh")
        val frame = runCatching { LiveAudioFrameDecoder.decode(bytes, identity) }
            .getOrElse { error ->
                failContract(error.message ?: "Khung âm thanh SHC2 không hợp lệ")
                return
            }
        val sequence = runCatching {
            synchronized(stateLock) { sequenceGuard.accept(frame) }
        }.getOrElse { error ->
            failContract(error.message ?: "Thứ tự khung âm thanh SHC2 không hợp lệ")
            return
        }

        if (sequence.droppedPackets > 0) {
            val total = synchronized(stateLock) { sequenceGuard.droppedPackets }
            mainHandler.post { onDroppedPackets(total) }
        }
        if (playbackEnabled && hasAudioFocus && frame.pcm16.isNotEmpty()) {
            val pcm = frame.pcm16.copyOf()
            audioExecutor.execute {
                audioTrack?.write(pcm, 0, pcm.size, AudioTrack.WRITE_BLOCKING)
            }
        }
        enqueueWaveform(frame.samples)
        if (frame.flags and LiveAudioFrameFlags.End != 0) {
            postConnection(true, "Thiết bị đã kết thúc luồng; đang chờ backend xác nhận")
        }
    }

    private fun enqueueWaveform(newSamples: FloatArray) {
        synchronized(bufferLock) {
            if (newSamples.size >= sampleBuffer.size) {
                newSamples.copyInto(
                    destination = sampleBuffer,
                    startIndex = newSamples.size - sampleBuffer.size,
                    endIndex = newSamples.size,
                )
            } else {
                sampleBuffer.copyInto(
                    destination = sampleBuffer,
                    destinationOffset = 0,
                    startIndex = newSamples.size,
                    endIndex = sampleBuffer.size,
                )
                newSamples.copyInto(sampleBuffer, sampleBuffer.size - newSamples.size)
            }
            if (sampleDispatchScheduled) return
            sampleDispatchScheduled = true
        }
        mainHandler.postDelayed({
            val snapshot = synchronized(bufferLock) {
                sampleDispatchScheduled = false
                sampleBuffer.copyOf()
            }
            onSamples(snapshot)
        }, WAVEFORM_DISPATCH_MILLIS)
    }

    private fun resetSession() {
        synchronized(stateLock) {
            activeIdentity = null
            sequenceGuard.reset()
        }
        synchronized(bufferLock) {
            sampleBuffer.fill(0f)
        }
        abandonAudioFocus()
    }

    private fun failContract(reason: String) {
        contractFailed = true
        postConnection(false, "Luồng realtime bị từ chối: $reason")
        val socket = webSocket
        webSocket = null
        socket?.close(1008, "REALTIME_CONTRACT_ERROR")
        resetSession()
    }

    private fun scheduleReconnect(reason: String) {
        if (closedByClient || contractFailed) return
        val delayMillis = reconnectPolicy.nextDelayMillis()
        postConnection(false, "$reason. Thử lại sau ${delayMillis / 1_000} giây…")
        mainHandler.removeCallbacks(reconnectRunnable)
        mainHandler.postDelayed(reconnectRunnable, delayMillis)
    }

    private fun ensureAudioTrack() {
        if (audioTrack != null) return
        val minimumBuffer = AudioTrack.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        ).coerceAtLeast(4_096)
        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(audioAttributes)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(SAMPLE_RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build(),
            )
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(minimumBuffer * 4)
            .build()
    }

    private fun requestAudioFocus() {
        if (hasAudioFocus) {
            audioTrack?.play()
            return
        }
        hasAudioFocus = audioManager.requestAudioFocus(audioFocusRequest) ==
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (hasAudioFocus && playbackEnabled) audioTrack?.play()
    }

    private fun abandonAudioFocus() {
        if (hasAudioFocus) audioManager.abandonAudioFocusRequest(audioFocusRequest)
        hasAudioFocus = false
    }

    private fun networkAvailable(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun String.toRealtimeSelector(): String = Base64.encodeToString(
        toByteArray(Charsets.UTF_8),
        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
    )

    private fun postConnection(connected: Boolean, message: String) {
        mainHandler.post { onConnectionChanged(connected, message) }
    }

    private fun postStatus(status: BackendStatus) {
        mainHandler.post { onStatus(status) }
    }

    private fun postMetrics(metrics: LiveMetrics) {
        mainHandler.post { onMetrics(metrics) }
    }

    private companion object {
        const val SAMPLE_RATE = 16_000
        const val WAVEFORM_SAMPLE_COUNT = 1_024
        const val WAVEFORM_DISPATCH_MILLIS = 16L
        const val REALTIME_SUBPROTOCOL = "shcare.realtime.v1"
        const val SCAN_SELECTOR_PREFIX = "shcare.scan."
    }
}
