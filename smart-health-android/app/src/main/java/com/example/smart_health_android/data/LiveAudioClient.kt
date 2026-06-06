package com.example.smart_health_android.data

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder

class LiveAudioClient(
    private val wsUrl: String = BackendConfig.APP_WS_URL,
    private val onConnectionChanged: (Boolean, String) -> Unit,
    private val onStatus: (BackendStatus) -> Unit,
    private val onMetrics: (LiveMetrics) -> Unit,
    private val onSamples: (FloatArray) -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var webSocket: WebSocket? = null
    private var audioTrack: AudioTrack? = null
    private var playbackEnabled = true
    private var sampleBuffer = FloatArray(1024)
    private val bufferLock = Any()

    fun connect() {
        if (webSocket != null) return
        startAudioTrack()
        val requestBuilder = Request.Builder().url(wsUrl)
        SmartHealthRepository.api.currentAuthToken()?.let { token ->
            requestBuilder.header("Authorization", "Bearer $token")
        }
        val request = requestBuilder.build()
        webSocket = SmartHealthApi.sharedClient.newWebSocket(request, socketListener)
    }

    fun close() {
        webSocket?.close(1000, "screen closed")
        webSocket = null
        audioTrack?.pause()
        audioTrack?.flush()
        audioTrack?.release()
        audioTrack = null
        postConnection(false, "Đã ngắt kết nối")
    }

    fun setPlaybackEnabled(enabled: Boolean) {
        playbackEnabled = enabled
        if (enabled) {
            audioTrack?.play()
        } else {
            audioTrack?.pause()
            audioTrack?.flush()
        }
    }

    private val socketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            postConnection(true, "Đã kết nối máy chủ")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleTextMessage(text)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            handleAudio(bytes.toByteArray())
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            this@LiveAudioClient.webSocket = null
            postConnection(false, "Đã đóng kết nối")
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            this@LiveAudioClient.webSocket = null
            postConnection(false, t.message ?: "Không kết nối được máy chủ")
        }
    }

    private fun startAudioTrack() {
        val minBuffer = AudioTrack.getMinBufferSize(
            16000,
            AudioFormat.CHANNEL_OUT_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(4096)

        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(16000)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(minBuffer * 4)
            .build()

        audioTrack?.play()
    }

    private fun handleTextMessage(text: String) {
        runCatching {
            val json = JSONObject(text)
            when (json.optString("type")) {
                "status" -> postStatus(
                    BackendStatus(
                        espCount = json.optInt("esp"),
                        listeners = json.optInt("listeners"),
                        recording = json.optBoolean("recording"),
                        activeScanId = json.stringOrNull("activeScanId"),
                        sampleRate = json.optInt("sampleRate", 16000),
                        udpPort = json.optInt("udpPort", 3001),
                        updatedAt = json.stringOrNull("updatedAt")
                    )
                )

                "metrics" -> postMetrics(
                    LiveMetrics(
                        peak = json.optInt("peak"),
                        rms = json.optInt("rms"),
                        levelPercent = json.optInt("levelPercent"),
                        bpm = json.optInt("bpm"),
                        recording = json.optBoolean("recording"),
                        activeScanId = json.stringOrNull("activeScanId"),
                        updatedAt = json.stringOrNull("updatedAt")
                    )
                )
            }
        }
    }

    private fun handleAudio(bytes: ByteArray) {
        if (bytes.isEmpty() || bytes.size % 2 != 0) return

        if (playbackEnabled) {
            audioTrack?.write(bytes, 0, bytes.size)
        }

        val newSamples = FloatArray(bytes.size / 2)
        val byteBuffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        for (index in newSamples.indices) {
            newSamples[index] = byteBuffer.short / 32768f
        }

        val snapshot = synchronized(bufferLock) {
            if (newSamples.size >= sampleBuffer.size) {
                sampleBuffer = newSamples.takeLastSamples(sampleBuffer.size)
            } else {
                sampleBuffer.copyInto(sampleBuffer, 0, newSamples.size, sampleBuffer.size)
                newSamples.copyInto(sampleBuffer, sampleBuffer.size - newSamples.size)
            }
            sampleBuffer.copyOf()
        }

        mainHandler.post { onSamples(snapshot) }
    }

    private fun FloatArray.takeLastSamples(count: Int): FloatArray {
        val result = FloatArray(count)
        copyInto(result, 0, size - count, size)
        return result
    }

    private fun postConnection(connected: Boolean, message: String) {
        mainHandler.post { onConnectionChanged(connected, message) }
    }

    private fun postStatus(status: BackendStatus) {
        mainHandler.post { onStatus(status) }
    }

    private fun postMetrics(metrics: LiveMetrics) {
        mainHandler.post { onMetrics(metrics) }
    }
}
