package com.example.smart_health_android.scan

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveAudioContractTest {
    private val expected = LiveAudioExpectation(
        workspaceId = "workspace_a",
        patientId = "patient_a",
        deviceId = "device_a",
        scanId = "scan_a",
    )

    @Test
    fun exactAudioSessionMetadataBindsAllBackendIdentities() {
        val event = LiveAudioTextEventParser.parse(
            text = metadata(),
            expected = expected,
            activeSession = null,
        )

        val session = (event as LiveAudioTextEvent.SessionBound).session
        assertEquals("workspace_a", session.workspaceId)
        assertEquals("patient_a", session.patientId)
        assertEquals("device_a", session.deviceId)
        assertEquals("scan_a", session.scanId)
        assertEquals("session_a", session.sessionId)
    }

    @Test
    fun legacyMetadataTypeAndIdentityMismatchFailClosed() {
        val legacy = metadata().replace("audio.session", "audio-session")
        val otherWorkspace = metadata().replace("workspace_a", "workspace_b")

        assertTrue(
            LiveAudioTextEventParser.parse(legacy, expected, null) is LiveAudioTextEvent.Rejected,
        )
        assertTrue(
            LiveAudioTextEventParser.parse(otherWorkspace, expected, null) is LiveAudioTextEvent.Rejected,
        )
    }

    @Test
    fun protocolAndFrameEncodingDriftFailClosed() {
        val wrongVersion = metadata().replace("\"protocolVersion\": 2", "\"protocolVersion\": 1")
        val rawPcm = metadata().replace("shcare_audio_v2", "raw_pcm_s16le")

        assertTrue(
            LiveAudioTextEventParser.parse(wrongVersion, expected, null) is LiveAudioTextEvent.Rejected,
        )
        assertTrue(
            LiveAudioTextEventParser.parse(rawPcm, expected, null) is LiveAudioTextEvent.Rejected,
        )
    }

    @Test
    fun activeMetricsRequireTheBoundSessionAndEveryIdentity() {
        val session = (LiveAudioTextEventParser.parse(metadata(), expected, null)
            as LiveAudioTextEvent.SessionBound).session
        val accepted = LiveAudioTextEventParser.parse(
            text = metrics(recording = true),
            expected = expected,
            activeSession = session.identity(),
        )
        val missingSession = LiveAudioTextEventParser.parse(
            text = metrics(recording = true).replace(", \"sessionId\": \"session_a\"", ""),
            expected = expected,
            activeSession = session.identity(),
        )

        assertTrue(accepted is LiveAudioTextEvent.Metrics)
        assertTrue(missingSession is LiveAudioTextEvent.Rejected)
    }

    @Test
    fun inactiveStatusMustCarryNoIdentityAndResetsTheSession() {
        val accepted = LiveAudioTextEventParser.parse(
            text = """{"type":"status","recording":false,"workspaceId":null,"patientId":null,"deviceId":null,"scanId":null,"sessionId":null,"updatedAt":"2026-07-18T00:00:02Z"}""",
            expected = expected,
            activeSession = identity(),
        )
        val staleIdentity = LiveAudioTextEventParser.parse(
            text = """{"type":"status","recording":false,"workspaceId":"workspace_a","patientId":null,"deviceId":null,"scanId":null,"sessionId":null,"updatedAt":"2026-07-18T00:00:02Z"}""",
            expected = expected,
            activeSession = identity(),
        )

        assertTrue(accepted is LiveAudioTextEvent.SessionIdle)
        assertTrue(staleIdentity is LiveAudioTextEvent.Rejected)
    }

    @Test
    fun activeStatusCannotSwitchAwayFromTheBoundSession() {
        val active = """{"type":"status","recording":true,"workspaceId":"workspace_a","patientId":"patient_a","deviceId":"device_a","scanId":"scan_a","sessionId":"session_a","updatedAt":"2026-07-18T00:00:02Z"}"""
        assertTrue(
            LiveAudioTextEventParser.parse(active, expected, identity()) is
                LiveAudioTextEvent.SessionActive,
        )
        assertTrue(
            LiveAudioTextEventParser.parse(
                active.replace("session_a", "session_other"),
                expected,
                identity(),
            ) is LiveAudioTextEvent.Rejected,
        )
    }

    @Test
    fun scanLifecycleEventIsBoundToTheExpectedScan() {
        val stopped = """{"type":"scan_stopped","scan":{"id":"scan_a"}}"""
        assertTrue(
            LiveAudioTextEventParser.parse(stopped, expected, identity()) is
                LiveAudioTextEvent.ScanLifecycle,
        )
        assertTrue(
            LiveAudioTextEventParser.parse(
                stopped.replace("scan_a", "scan_other"),
                expected,
                identity(),
            ) is LiveAudioTextEvent.Rejected,
        )
    }

    @Test
    fun shc2FrameRequiresMatchingBoundScanAndSession() {
        val frame = LiveAudioFrameDecoder.decode(
            frame(
                sessionId = "session_a",
                scanId = "scan_a",
                sequence = 0,
                flags = LiveAudioFrameFlags.Start,
                samples = shortArrayOf(0, 16384, -16384),
            ),
            identity(),
        )

        assertEquals(0L, frame.sequence)
        assertEquals(3, frame.samples.size)
        assertEquals(0.5f, frame.samples[1], 0.0001f)
        assertEquals(-0.5f, frame.samples[2], 0.0001f)

        val wrongSession = runCatching {
            LiveAudioFrameDecoder.decode(
                frame("session_b", "scan_a", 0, LiveAudioFrameFlags.Start),
                identity(),
            )
        }
        assertTrue(wrongSession.isFailure)
    }

    @Test
    fun sequenceGuardRejectsReplayAndUndeclaredGap() {
        val guard = LiveAudioSequenceGuard()
        guard.accept(decoded(sequence = 0, flags = LiveAudioFrameFlags.Start))

        assertTrue(runCatching { guard.accept(decoded(sequence = 0)) }.isFailure)
        assertTrue(runCatching { guard.accept(decoded(sequence = 2)) }.isFailure)
        assertEquals(0L, guard.droppedPackets)
    }

    @Test
    fun sequenceGuardAcceptsDeclaredGapAndRejectsFramesAfterEnd() {
        val guard = LiveAudioSequenceGuard()
        guard.accept(decoded(sequence = 0, flags = LiveAudioFrameFlags.Start))
        val accepted = guard.accept(
            decoded(sequence = 3, flags = LiveAudioFrameFlags.Discontinuity),
        )
        guard.accept(decoded(sequence = 4, flags = LiveAudioFrameFlags.End))

        assertEquals(2L, accepted.droppedPackets)
        assertEquals(2L, guard.droppedPackets)
        assertTrue(runCatching { guard.accept(decoded(sequence = 5)) }.isFailure)
    }

    @Test
    fun reconnectBackoffIsBoundedAndCanResetAfterAStableConnection() {
        val policy = LiveAudioReconnectPolicy(
            delaysMillis = listOf(1_000L, 2_000L, 4_000L, 8_000L, 15_000L, 30_000L),
        )

        assertEquals(1_000L, policy.nextDelayMillis())
        assertEquals(2_000L, policy.nextDelayMillis())
        repeat(10) { policy.nextDelayMillis() }
        assertEquals(30_000L, policy.nextDelayMillis())
        policy.reset()
        assertEquals(1_000L, policy.nextDelayMillis())
    }

    @Test
    fun malformedFrameNeverProducesSamples() {
        val malformed = frame("session_a", "scan_a", 0, LiveAudioFrameFlags.Start)
            .copyOf(31)
        assertFalse(runCatching { LiveAudioFrameDecoder.decode(malformed, identity()) }.isSuccess)
    }

    @Test
    fun unknownFrameFlagsAndBackwardsTimestampsFailClosed() {
        val unknownFlags = frame("session_a", "scan_a", 0, 0x80)
        assertFalse(runCatching { LiveAudioFrameDecoder.decode(unknownFlags, identity()) }.isSuccess)

        val guard = LiveAudioSequenceGuard()
        guard.accept(decoded(sequence = 0, flags = LiveAudioFrameFlags.Start))
        val backwards = decoded(sequence = 1).copy(timestampMillis = 1L)
        assertFalse(runCatching { guard.accept(backwards) }.isSuccess)
    }

    private fun metadata(): String = """
        {
          "type": "audio.session",
          "protocolVersion": 2,
          "frameEncoding": "shcare_audio_v2",
          "workspaceId": "workspace_a",
          "patientId": "patient_a",
          "deviceId": "device_a",
          "scanId": "scan_a",
          "sessionId": "session_a",
          "sampleRate": 16000,
          "channels": 1,
          "bitsPerSample": 16,
          "encoding": "pcm_s16le",
          "startedAt": "2026-07-18T00:00:00Z"
        }
    """.trimIndent()

    private fun metrics(recording: Boolean): String = """
        {"type":"metrics","recording":$recording,"workspaceId":"workspace_a","patientId":"patient_a","deviceId":"device_a","scanId":"scan_a", "sessionId": "session_a","sampleRate":16000,"peak":200,"rms":80,"levelPercent":64,"bpm":72,"updatedAt":"2026-07-18T00:00:01Z"}
    """.trimIndent()

    private fun identity() = LiveAudioIdentity(
        workspaceId = "workspace_a",
        patientId = "patient_a",
        deviceId = "device_a",
        scanId = "scan_a",
        sessionId = "session_a",
    )

    private fun decoded(
        sequence: Long,
        flags: Int = 0,
    ): LiveAudioFrame = LiveAudioFrame(
        sessionId = "session_a",
        scanId = "scan_a",
        sequence = sequence,
        timestampMillis = 1_752_796_800_000L + sequence,
        flags = flags,
        samples = floatArrayOf(0f),
    )

    private fun frame(
        sessionId: String,
        scanId: String,
        sequence: Long,
        flags: Int,
        samples: ShortArray = shortArrayOf(1),
    ): ByteArray {
        val session = sessionId.toByteArray(Charsets.UTF_8)
        val scan = scanId.toByteArray(Charsets.UTF_8)
        val headerLength = 30 + session.size + scan.size
        return ByteBuffer.allocate(headerLength + samples.size * 2)
            .order(ByteOrder.BIG_ENDIAN)
            .put(byteArrayOf('S'.code.toByte(), 'H'.code.toByte(), 'C'.code.toByte(), '2'.code.toByte()))
            .put(2)
            .put(flags.toByte())
            .putShort(headerLength.toShort())
            .putInt(samples.size * 2)
            .putInt(sequence.toInt())
            .putLong(1_752_796_800_000L + sequence)
            .putShort(samples.size.toShort())
            .putShort(session.size.toShort())
            .putShort(scan.size.toShort())
            .put(session)
            .put(scan)
            .apply {
                order(ByteOrder.LITTLE_ENDIAN)
                samples.forEach { putShort(it) }
            }
            .array()
    }
}
