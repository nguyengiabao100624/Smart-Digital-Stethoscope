package com.example.smart_health_android.devices

import com.example.smart_health_android.data.SmartDevice
import java.time.Duration
import java.time.Instant

enum class DevicePresenceStatus {
    Online,
    Degraded,
    Stale,
    Offline,
}

enum class DeviceFreshnessStatus {
    Fresh,
    Stale,
    Missing,
    Invalid,
    Future,
}

data class DeviceFreshness(
    val status: DeviceFreshnessStatus,
    val ageSeconds: Long? = null,
)

data class DeviceHealthSnapshot(
    val deviceId: String,
    val deviceName: String?,
    val presence: DevicePresenceStatus,
    val freshness: DeviceFreshness,
    val lastSeenAt: String?,
    val firmwareVersion: String?,
    val connectionMethod: String?,
    val i2sStatus: String?,
    val uptimeMs: Long?,
    val freeHeapBytes: Long?,
    val audioPacketsSent: Long?,
    val audioPacketsDropped: Long?,
    val audioSendFailures: Long?,
    val lastCommandId: String?,
    val lastCommandState: String?,
    val lastCommandCode: String?,
    val lastCommandUptimeMs: Long?,
    val otaStatus: String?,
    val audioStatus: String?,
) {
    companion object {
        private val DefaultStaleAfter: Duration = Duration.ofMinutes(2)
        private val AllowedClockSkew: Duration = Duration.ofMinutes(1)

        fun from(
            device: SmartDevice,
            now: Instant = Instant.now(),
            staleAfter: Duration = DefaultStaleAfter,
        ): DeviceHealthSnapshot {
            val telemetry = device.telemetry
            val freshness = resolveFreshness(
                reportedAt = device.lastSeenAt,
                now = now,
                staleAfter = staleAfter,
            )
            val i2sStatus = telemetry.i2sStatus.reportedValue()
            val audioStatus = telemetry.audioStatus.reportedValue()
                ?: device.audioStatus.reportedValue()
            val otaStatus = telemetry.otaStatus.reportedValue()
                ?: device.otaStatus.reportedValue()
            val lastCommandState = telemetry.lastCommandState.reportedValue()
            val explicitlyDegraded = sequenceOf(
                i2sStatus,
                audioStatus,
                otaStatus,
                lastCommandState,
            ).any(::isExplicitFailureStatus)
            val presence = when {
                !device.online -> DevicePresenceStatus.Offline
                explicitlyDegraded -> DevicePresenceStatus.Degraded
                freshness.status == DeviceFreshnessStatus.Stale ||
                    freshness.status == DeviceFreshnessStatus.Future -> DevicePresenceStatus.Stale
                else -> DevicePresenceStatus.Online
            }

            return DeviceHealthSnapshot(
                deviceId = device.id,
                deviceName = device.name.reportedValue(),
                presence = presence,
                freshness = freshness,
                lastSeenAt = device.lastSeenAt.reportedValue(),
                firmwareVersion = device.firmwareVersion.reportedValue(),
                connectionMethod = telemetry.connectionMethod.reportedValue()
                    ?: device.connectionMethod.reportedValue(),
                i2sStatus = i2sStatus,
                uptimeMs = telemetry.uptimeMs,
                freeHeapBytes = telemetry.freeHeapBytes,
                audioPacketsSent = telemetry.audioPacketsSent,
                audioPacketsDropped = telemetry.audioPacketsDropped,
                audioSendFailures = telemetry.audioSendFailures,
                lastCommandId = telemetry.lastCommandId.reportedValue(),
                lastCommandState = lastCommandState,
                lastCommandCode = telemetry.lastCommandCode.reportedValue(),
                lastCommandUptimeMs = telemetry.lastCommandUptimeMs,
                otaStatus = otaStatus,
                audioStatus = audioStatus,
            )
        }

        private fun resolveFreshness(
            reportedAt: String?,
            now: Instant,
            staleAfter: Duration,
        ): DeviceFreshness {
            val normalized = reportedAt.reportedValue()
                ?: return DeviceFreshness(DeviceFreshnessStatus.Missing)
            val instant = runCatching { Instant.parse(normalized) }.getOrNull()
                ?: return DeviceFreshness(DeviceFreshnessStatus.Invalid)
            val age = Duration.between(instant, now)
            if (age < AllowedClockSkew.negated()) {
                return DeviceFreshness(DeviceFreshnessStatus.Future)
            }
            val ageSeconds = age.seconds.coerceAtLeast(0L)
            val status = if (age <= staleAfter) {
                DeviceFreshnessStatus.Fresh
            } else {
                DeviceFreshnessStatus.Stale
            }
            return DeviceFreshness(status = status, ageSeconds = ageSeconds)
        }

        private fun isExplicitFailureStatus(value: String?): Boolean {
            val normalized = value?.trim()?.lowercase().orEmpty()
            if (normalized.isBlank()) return false
            return ExplicitFailureTokens.any { token ->
                normalized == token || normalized.contains("_${token}") || normalized.contains("${token}_")
            }
        }

        private val ExplicitFailureTokens = setOf(
            "degraded",
            "error",
            "failed",
            "fault",
            "rolled_back",
            "unavailable",
        )
    }
}

private fun String?.reportedValue(): String? = this?.trim()?.takeIf(String::isNotEmpty)
