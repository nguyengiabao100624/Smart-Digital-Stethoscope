package com.example.smart_health_android.devices

import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartDeviceTelemetry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Duration
import java.time.Instant

class DeviceHealthSnapshotTest {
    private val now = Instant.parse("2026-07-18T12:00:00Z")

    @Test
    fun onlineRequiresCanonicalBackendPresenceAndNeverUsesConnectedAsProof() {
        val connectedOnly = SmartDevice(
            id = "dev-001",
            connected = true,
            online = false,
            lastSeenAt = "2026-07-18T11:59:30Z",
        )

        val snapshot = DeviceHealthSnapshot.from(connectedOnly, now)

        assertEquals(DevicePresenceStatus.Offline, snapshot.presence)
        assertEquals(DeviceFreshnessStatus.Fresh, snapshot.freshness.status)
    }

    @Test
    fun freshOnlineDeviceStaysOnlineAndKeepsMissingTelemetryMissing() {
        val device = SmartDevice(
            id = "dev-001",
            online = true,
            lastSeenAt = "2026-07-18T11:59:30Z",
        )

        val snapshot = DeviceHealthSnapshot.from(device, now)

        assertEquals(DevicePresenceStatus.Online, snapshot.presence)
        assertEquals(DeviceFreshnessStatus.Fresh, snapshot.freshness.status)
        assertNull(snapshot.firmwareVersion)
        assertNull(snapshot.i2sStatus)
        assertNull(snapshot.uptimeMs)
        assertNull(snapshot.freeHeapBytes)
        assertNull(snapshot.audioPacketsDropped)
        assertNull(snapshot.audioSendFailures)
        assertNull(snapshot.lastCommandState)
        assertNull(snapshot.otaStatus)
    }

    @Test
    fun staleHeartbeatDowngradesAnOtherwiseOnlineDevice() {
        val device = SmartDevice(
            id = "dev-001",
            online = true,
            lastSeenAt = "2026-07-18T11:55:00Z",
        )

        val snapshot = DeviceHealthSnapshot.from(
            device = device,
            now = now,
            staleAfter = Duration.ofMinutes(2),
        )

        assertEquals(DevicePresenceStatus.Stale, snapshot.presence)
        assertEquals(DeviceFreshnessStatus.Stale, snapshot.freshness.status)
        assertEquals(300L, snapshot.freshness.ageSeconds)
    }

    @Test
    fun explicitFirmwareHealthFailureMarksConfirmedPresenceDegraded() {
        val device = SmartDevice(
            id = "dev-001",
            online = true,
            lastSeenAt = "2026-07-18T11:59:30Z",
            telemetry = SmartDeviceTelemetry(
                i2sStatus = "failed",
                audioPacketsDropped = 14,
                audioSendFailures = 2,
                lastCommandId = "cmd-very-long-identifier",
                lastCommandState = "failed",
                lastCommandCode = "DEVICE_BUSY",
                otaStatus = "rolled_back",
            ),
        )

        val snapshot = DeviceHealthSnapshot.from(device, now)

        assertEquals(DevicePresenceStatus.Degraded, snapshot.presence)
        assertEquals("failed", snapshot.i2sStatus)
        assertEquals(14L, snapshot.audioPacketsDropped)
        assertEquals(2L, snapshot.audioSendFailures)
        assertEquals("cmd-very-long-identifier", snapshot.lastCommandId)
        assertEquals("DEVICE_BUSY", snapshot.lastCommandCode)
        assertEquals("rolled_back", snapshot.otaStatus)
    }

    @Test
    fun malformedOrMissingHeartbeatIsReportedAsUnknownWithoutInventingAge() {
        val malformed = DeviceHealthSnapshot.from(
            SmartDevice(id = "dev-001", online = true, lastSeenAt = "not-a-date"),
            now,
        )
        val missing = DeviceHealthSnapshot.from(
            SmartDevice(id = "dev-002", online = true, lastSeenAt = null),
            now,
        )

        assertEquals(DeviceFreshnessStatus.Invalid, malformed.freshness.status)
        assertNull(malformed.freshness.ageSeconds)
        assertEquals(DeviceFreshnessStatus.Missing, missing.freshness.status)
        assertNull(missing.freshness.ageSeconds)
        assertEquals(DevicePresenceStatus.Online, malformed.presence)
        assertEquals(DevicePresenceStatus.Online, missing.presence)
    }
}
