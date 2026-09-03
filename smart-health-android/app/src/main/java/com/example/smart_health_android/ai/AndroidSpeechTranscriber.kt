package com.example.smart_health_android.ai

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import kotlin.math.roundToInt

interface SpeechTranscriberListener {
    fun onReady()
    fun onAmplitude(level: Int)
    fun onPartialTranscript(text: String)
    fun onFinalTranscript(text: String)
    fun onStopped()
    fun onError(message: String)
}

class AndroidSpeechTranscriber(
    context: Context,
    private val listener: SpeechTranscriberListener,
) : RecognitionListener {
    private val appContext = context.applicationContext
    private var recognizer: SpeechRecognizer? = null
    private var stoppedByUser = false

    fun isAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(appContext)

    fun start() {
        if (!isAvailable()) {
            listener.onError("Thiết bị chưa có dịch vụ nhận dạng giọng nói.")
            return
        }
        destroyRecognizer()
        stoppedByUser = false
        recognizer = SpeechRecognizer.createSpeechRecognizer(appContext).also {
            it.setRecognitionListener(this)
            it.startListening(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "vi-VN")
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "vi-VN")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                },
            )
        }
    }

    fun stop() {
        stoppedByUser = true
        recognizer?.stopListening()
    }

    fun cancel() {
        stoppedByUser = true
        recognizer?.cancel()
        listener.onStopped()
    }

    fun destroy() {
        destroyRecognizer()
    }

    private fun destroyRecognizer() {
        recognizer?.destroy()
        recognizer = null
    }

    override fun onReadyForSpeech(params: Bundle?) = listener.onReady()
    override fun onBeginningOfSpeech() = Unit
    override fun onRmsChanged(rmsdB: Float) {
        listener.onAmplitude(((rmsdB + 2f) / 14f * 100f).roundToInt().coerceIn(4, 100))
    }
    override fun onBufferReceived(buffer: ByteArray?) = Unit
    override fun onEndOfSpeech() = listener.onStopped()
    override fun onEvent(eventType: Int, params: Bundle?) = Unit

    override fun onError(error: Int) {
        val message = when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "Không thu được âm thanh. Hãy kiểm tra micro."
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Shcare chưa được cấp quyền micro."
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Dịch vụ nhận dạng giọng nói chưa kết nối được mạng."
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Chưa nhận rõ lời nói. Hãy thử lại."
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Micro đang bận. Hãy dừng rồi thử lại."
            else -> "Không thể chuyển giọng nói thành văn bản."
        }
        if (stoppedByUser && error == SpeechRecognizer.ERROR_CLIENT) listener.onStopped()
        else listener.onError(message)
    }

    override fun onPartialResults(partialResults: Bundle?) {
        bestTranscript(partialResults)?.let(listener::onPartialTranscript)
    }

    override fun onResults(results: Bundle?) {
        val transcript = bestTranscript(results).orEmpty()
        if (transcript.isNotBlank()) listener.onFinalTranscript(transcript)
        listener.onStopped()
    }

    private fun bestTranscript(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()
            ?.trim()
            ?.takeIf(String::isNotBlank)
}
