package com.example.smart_health_android.scan

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.CodingErrorAction
import org.json.JSONObject

data class LiveAudioExpectation(
    val workspaceId: String,
    val patientId: String,
    val deviceId: String,
    val scanId: String,
) {
    init {
        require(workspaceId.isNotBlank()) { "Workspace ID is required" }
        require(patientId.isNotBlank()) { "Patient ID is required" }
        require(deviceId.isNotBlank()) { "Device ID is required" }
        require(scanId.isNotBlank()) { "Scan ID is required" }
    }
}

data class LiveAudioIdentity(
    val workspaceId: String,
    val patientId: String,
    val deviceId: String,
    val scanId: String,
    val sessionId: String,
)

data class LiveAudioSession(
    val workspaceId: String,
    val patientId: String,
    val deviceId: String,
    val scanId: String,
    val sessionId: String,
    val sampleRate: Int,
    val startedAt: String,
) {
    fun identity() = LiveAudioIdentity(
        workspaceId = workspaceId,
        patientId = patientId,
        deviceId = deviceId,
        scanId = scanId,
        sessionId = sessionId,
    )
}

data class LiveAudioMetricsSnapshot(
    val identity: LiveAudioIdentity,
    val peak: Int,
    val rms: Int,
    val levelPercent: Int,
    val bpm: Int,
    val updatedAt: String,
)

sealed interface LiveAudioTextEvent {
    data class SessionBound(val session: LiveAudioSession) : LiveAudioTextEvent
    data class SessionActive(
        val identity: LiveAudioIdentity,
        val updatedAt: String,
    ) : LiveAudioTextEvent

    data object SessionIdle : LiveAudioTextEvent
    data class Metrics(val snapshot: LiveAudioMetricsSnapshot) : LiveAudioTextEvent
    data class ScanLifecycle(val scanId: String, val state: String) : LiveAudioTextEvent
    data class Rejected(val reason: String) : LiveAudioTextEvent
    data object Ignored : LiveAudioTextEvent
}

object LiveAudioTextEventParser {
    fun parse(
        text: String,
        expected: LiveAudioExpectation,
        activeSession: LiveAudioIdentity?,
    ): LiveAudioTextEvent = runCatching {
        val json = JSONObject(text)
        when (json.requiredString("type")) {
            "audio.session" -> parseSession(json, expected, activeSession)
            "status" -> parseStatus(json, expected, activeSession)
            "metrics" -> parseMetrics(json, expected, activeSession)
            "scan_start_accepted", "scan_started", "scan_stopped", "scan_interrupted" -> {
                val scan = json.optJSONObject("scan")
                    ?: error("Realtime scan event is missing its scan object")
                val scanId = scan.requiredString("id")
                require(scanId == expected.scanId) { "Realtime scan event identity mismatch" }
                LiveAudioTextEvent.ScanLifecycle(scanId, json.requiredString("type"))
            }

            "pong" -> LiveAudioTextEvent.Ignored
            "error" -> error(json.optString("message").ifBlank { "Backend realtime error" })
            else -> error("Unsupported realtime event type")
        }
    }.getOrElse { error ->
        LiveAudioTextEvent.Rejected(error.message ?: "Invalid realtime event")
    }

    private fun parseSession(
        json: JSONObject,
        expected: LiveAudioExpectation,
        activeSession: LiveAudioIdentity?,
    ): LiveAudioTextEvent {
        require(json.requiredInt("protocolVersion") == 2) { "Unsupported audio protocol" }
        require(json.requiredString("frameEncoding") == "shcare_audio_v2") {
            "Unsupported listener frame encoding"
        }
        require(json.requiredInt("sampleRate") == SAMPLE_RATE) { "Unsupported sample rate" }
        require(json.requiredInt("channels") == 1) { "Audio must be mono" }
        require(json.requiredInt("bitsPerSample") == 16) { "Audio must be PCM16" }
        require(json.requiredString("encoding") == "pcm_s16le") { "Unsupported PCM encoding" }

        val identity = json.identity()
        requireExpectedIdentity(identity, expected)
        require(activeSession == null || activeSession == identity) {
            "Realtime source changed without an explicit reset"
        }
        val startedAt = json.requiredIsoTimestamp("startedAt")
        return LiveAudioTextEvent.SessionBound(
            LiveAudioSession(
                workspaceId = identity.workspaceId,
                patientId = identity.patientId,
                deviceId = identity.deviceId,
                scanId = identity.scanId,
                sessionId = identity.sessionId,
                sampleRate = SAMPLE_RATE,
                startedAt = startedAt,
            ),
        )
    }

    private fun parseStatus(
        json: JSONObject,
        expected: LiveAudioExpectation,
        activeSession: LiveAudioIdentity?,
    ): LiveAudioTextEvent {
        val recording = json.requiredBoolean("recording")
        json.requiredIsoTimestamp("updatedAt")
        if (!recording) {
            IDENTITY_FIELDS.forEach { field ->
                require(!json.has(field) || json.isNull(field)) {
                    "Inactive realtime status must clear source identity"
                }
            }
            return LiveAudioTextEvent.SessionIdle
        }

        val identity = json.identity()
        requireExpectedIdentity(identity, expected)
        require(activeSession == null || activeSession == identity) {
            "Realtime status does not match the bound session"
        }
        return LiveAudioTextEvent.SessionActive(
            identity = identity,
            updatedAt = json.requiredIsoTimestamp("updatedAt"),
        )
    }

    private fun parseMetrics(
        json: JSONObject,
        expected: LiveAudioExpectation,
        activeSession: LiveAudioIdentity?,
    ): LiveAudioTextEvent {
        require(json.requiredBoolean("recording")) { "Metrics require an active recording" }
        require(activeSession != null) { "Session metadata must arrive before metrics" }
        require(json.requiredInt("sampleRate") == SAMPLE_RATE) { "Unsupported metrics sample rate" }
        val identity = json.identity()
        requireExpectedIdentity(identity, expected)
        require(identity == activeSession) { "Metrics do not match the bound session" }
        return LiveAudioTextEvent.Metrics(
            LiveAudioMetricsSnapshot(
                identity = identity,
                peak = json.boundedInt("peak", 0, 32_768),
                rms = json.boundedInt("rms", 0, 32_768),
                levelPercent = json.boundedInt("levelPercent", 0, 100),
                bpm = json.boundedInt("bpm", 0, 300),
                updatedAt = json.requiredIsoTimestamp("updatedAt"),
            ),
        )
    }

    private fun requireExpectedIdentity(
        identity: LiveAudioIdentity,
        expected: LiveAudioExpectation,
    ) {
        require(identity.workspaceId == expected.workspaceId) { "Workspace identity mismatch" }
        require(identity.patientId == expected.patientId) { "Patient identity mismatch" }
        require(identity.deviceId == expected.deviceId) { "Device identity mismatch" }
        require(identity.scanId == expected.scanId) { "Scan identity mismatch" }
    }

    private fun JSONObject.identity() = LiveAudioIdentity(
        workspaceId = requiredString("workspaceId"),
        patientId = requiredString("patientId"),
        deviceId = requiredString("deviceId"),
        scanId = requiredString("scanId"),
        sessionId = requiredString("sessionId"),
    )

    private fun JSONObject.requiredString(name: String): String {
        require(has(name) && !isNull(name)) { "$name is required" }
        return optString(name).also { require(it.isNotBlank()) { "$name is required" } }
    }

    private fun JSONObject.requiredInt(name: String): Int {
        require(has(name) && !isNull(name) && opt(name) is Number) { "$name must be a number" }
        return getInt(name)
    }

    private fun JSONObject.requiredBoolean(name: String): Boolean {
        require(has(name) && !isNull(name) && opt(name) is Boolean) { "$name must be a boolean" }
        return getBoolean(name)
    }

    private fun JSONObject.boundedInt(name: String, minimum: Int, maximum: Int): Int =
        requiredInt(name).also { value ->
            require(value in minimum..maximum) { "$name is outside the supported range" }
        }

    private fun JSONObject.requiredIsoTimestamp(name: String): String = requiredString(name).also {
        require(runCatching { java.time.Instant.parse(it) }.isSuccess) { "$name is invalid" }
    }

    private const val SAMPLE_RATE = 16_000
    private val IDENTITY_FIELDS = listOf(
        "workspaceId",
        "patientId",
        "deviceId",
        "scanId",
        "sessionId",
    )
}

object LiveAudioFrameFlags {
    const val Start = 1 shl 0
    const val End = 1 shl 1
    const val Discontinuity = 1 shl 2
    const val Retransmit = 1 shl 3
    const val KnownMask = Start or End or Discontinuity or Retransmit
}

data class LiveAudioFrame(
    val sessionId: String,
    val scanId: String,
    val sequence: Long,
    val timestampMillis: Long,
    val flags: Int,
    val samples: FloatArray,
    val pcm16: ShortArray = shortArrayOf(),
)

object LiveAudioFrameDecoder {
    fun decode(bytes: ByteArray, expected: LiveAudioIdentity): LiveAudioFrame {
        require(bytes.size >= FIXED_HEADER_SIZE) { "SHC2 frame is shorter than its header" }
        require(bytes.copyOfRange(0, 4).contentEquals(MAGIC)) { "SHC2 magic mismatch" }
        val header = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        header.position(4)
        require(header.get().toInt() and 0xff == 2) { "Unsupported SHC2 version" }
        val flags = header.get().toInt() and 0xff
        require(flags and LiveAudioFrameFlags.KnownMask.inv() == 0) { "Unsupported SHC2 flags" }
        val headerLength = header.short.toInt() and 0xffff
        val payloadLength = header.int
        val sequence = header.int.toLong() and 0xffff_ffffL
        val timestampMillis = header.long
        val sampleCount = header.short.toInt() and 0xffff
        val sessionLength = header.short.toInt() and 0xffff
        val scanLength = header.short.toInt() and 0xffff

        require(timestampMillis >= 0) { "SHC2 timestamp is invalid" }
        require(sessionLength in 1..MAX_SESSION_ID_BYTES) { "SHC2 session ID length is invalid" }
        require(scanLength in 1..MAX_SCAN_ID_BYTES) { "SHC2 scan ID length is invalid" }
        require(headerLength == FIXED_HEADER_SIZE + sessionLength + scanLength) {
            "SHC2 header length mismatch"
        }
        require(headerLength <= bytes.size && payloadLength == bytes.size - headerLength) {
            "SHC2 payload length mismatch"
        }
        require(sampleCount in 1..MAX_SAMPLES && payloadLength == sampleCount * 2) {
            "SHC2 sample count mismatch"
        }

        val sessionId = decodeIdentity(bytes, FIXED_HEADER_SIZE, sessionLength, "session")
        val scanId = decodeIdentity(bytes, FIXED_HEADER_SIZE + sessionLength, scanLength, "scan")
        require(sessionId == expected.sessionId && scanId == expected.scanId) {
            "SHC2 frame identity mismatch"
        }

        val samples = FloatArray(sampleCount)
        val pcm16 = ShortArray(sampleCount)
        val payload = ByteBuffer.wrap(bytes, headerLength, payloadLength).order(ByteOrder.LITTLE_ENDIAN)
        for (index in samples.indices) {
            pcm16[index] = payload.short
            samples[index] = pcm16[index] / 32_768f
        }
        return LiveAudioFrame(
            sessionId = sessionId,
            scanId = scanId,
            sequence = sequence,
            timestampMillis = timestampMillis,
            flags = flags,
            samples = samples,
            pcm16 = pcm16,
        )
    }

    private fun decodeIdentity(
        bytes: ByteArray,
        offset: Int,
        length: Int,
        label: String,
    ): String {
        val decoder = Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
        val value = decoder.decode(ByteBuffer.wrap(bytes, offset, length)).toString()
        require(value.isNotBlank() && value.none { it.code <= 0x1f || it.code == 0x7f }) {
            "SHC2 $label ID is invalid"
        }
        return value
    }

    private const val FIXED_HEADER_SIZE = 30
    private const val MAX_SESSION_ID_BYTES = 160
    private const val MAX_SCAN_ID_BYTES = 120
    private const val MAX_SAMPLES = 1_024
    private val MAGIC = byteArrayOf('S'.code.toByte(), 'H'.code.toByte(), 'C'.code.toByte(), '2'.code.toByte())
}

data class LiveAudioSequenceResult(
    val droppedPackets: Long,
    val sequence: Long,
)

class LiveAudioSequenceGuard {
    var droppedPackets: Long = 0
        private set

    private var sessionId = ""
    private var scanId = ""
    private var lastSequence: Long? = null
    private var lastTimestampMillis: Long? = null
    private var ended = false

    fun accept(frame: LiveAudioFrame): LiveAudioSequenceResult {
        if (lastSequence == null) {
            require(frame.flags and LiveAudioFrameFlags.Start != 0) { "First SHC2 frame requires start" }
            require(frame.sequence == 0L) { "First SHC2 frame requires sequence zero" }
            sessionId = frame.sessionId
            scanId = frame.scanId
            lastSequence = frame.sequence
            lastTimestampMillis = frame.timestampMillis
            ended = frame.flags and LiveAudioFrameFlags.End != 0
            return LiveAudioSequenceResult(0, frame.sequence)
        }

        require(!ended) { "SHC2 session has ended" }
        require(frame.sessionId == sessionId && frame.scanId == scanId) { "SHC2 source changed" }
        require(frame.flags and LiveAudioFrameFlags.Start == 0) { "Unexpected SHC2 start flag" }
        val previousSequence = requireNotNull(lastSequence)
        require(frame.sequence > previousSequence) { "SHC2 replay or out-of-order frame" }
        require(frame.timestampMillis >= requireNotNull(lastTimestampMillis)) { "SHC2 timestamp moved backwards" }
        val gap = frame.sequence - previousSequence - 1
        require(gap == 0L || frame.flags and LiveAudioFrameFlags.Discontinuity != 0) {
            "SHC2 sequence gap requires discontinuity"
        }
        droppedPackets += gap
        lastSequence = frame.sequence
        lastTimestampMillis = frame.timestampMillis
        ended = frame.flags and LiveAudioFrameFlags.End != 0
        return LiveAudioSequenceResult(gap, frame.sequence)
    }

    fun reset() {
        droppedPackets = 0
        sessionId = ""
        scanId = ""
        lastSequence = null
        lastTimestampMillis = null
        ended = false
    }
}

class LiveAudioReconnectPolicy(
    private val delaysMillis: List<Long> = listOf(1_000, 2_000, 4_000, 8_000, 15_000, 30_000),
) {
    private var attempt = 0

    init {
        require(delaysMillis.isNotEmpty() && delaysMillis.all { it > 0 }) {
            "Reconnect delays must be positive"
        }
    }

    fun nextDelayMillis(): Long = delaysMillis[attempt.coerceAtMost(delaysMillis.lastIndex)].also {
        if (attempt < delaysMillis.lastIndex) attempt += 1
    }

    fun reset() {
        attempt = 0
    }
}
