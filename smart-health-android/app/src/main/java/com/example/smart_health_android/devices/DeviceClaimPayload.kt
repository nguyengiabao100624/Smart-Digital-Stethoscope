package com.example.smart_health_android.devices

import org.json.JSONObject
import java.time.Instant

enum class DeviceClaimSource {
    SecureSetupQr,
    ManualClaimOnly,
}

data class DeviceSetupAccessPoint(
    val ssid: String,
    val security: String,
    val proofOfPossession: String,
)

data class DeviceClaimPayload(
    val deviceId: String,
    val claimCode: String,
    val claimExpiresAt: Instant? = null,
    val setupAp: DeviceSetupAccessPoint? = null,
    val source: DeviceClaimSource = DeviceClaimSource.ManualClaimOnly,
) {
    val supportsSecureSetup: Boolean
        get() = source == DeviceClaimSource.SecureSetupQr && setupAp != null && claimExpiresAt != null
}

object DeviceClaimPayloadParser {
    private const val MaxQrLength = 4_096
    private const val CanonicalQrType = "shcare.device.setup"
    private const val CanonicalProtocolVersion = 1
    private const val CanonicalSetupSecurity = "WPA2_PSK"

    private val deviceIdPattern = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$")
    private val claimCodePattern = Regex("^[A-Za-z0-9_-]{6,80}$")
    private val setupSsidPattern = Regex("^Shcare-[A-F0-9]{12}$")
    private val proofOfPossessionPattern = Regex("^[A-Za-z0-9_-]{20}$")

    /**
     * Parses the versioned secure setup QR contract only. Legacy URI and minimal JSON
     * payloads are deliberately rejected so a QR can never silently downgrade to a
     * claim-only flow.
     */
    fun parse(raw: String, now: Instant = Instant.now()): DeviceClaimPayload? {
        if (raw.isEmpty() || raw.length > MaxQrLength || !raw.startsWith("{")) return null
        val json = runCatching { JSONObject(raw) }.getOrNull() ?: return null
        if (json.opt("type") !is String || json.optString("type") != CanonicalQrType) return null

        val protocolVersion = json.opt("protocolVersion")
        if (protocolVersion !is Int || protocolVersion != CanonicalProtocolVersion) return null

        val deviceId = json.exactString("deviceId") ?: return null
        val claimCode = json.exactString("claimCode") ?: return null
        val claimExpiresAtRaw = json.exactString("claimExpiresAt") ?: return null
        val claimExpiresAt = runCatching { Instant.parse(claimExpiresAtRaw) }.getOrNull() ?: return null
        if (!claimExpiresAt.isAfter(now)) return null

        val setupAp = json.opt("setupAp") as? JSONObject ?: return null
        val ssid = setupAp.exactString("ssid") ?: return null
        val security = setupAp.exactString("security") ?: return null
        val proofOfPossession = setupAp.exactString("proofOfPossession") ?: return null

        if (!deviceIdPattern.matches(deviceId)) return null
        if (!claimCodePattern.matches(claimCode)) return null
        if (!setupSsidPattern.matches(ssid)) return null
        if (security != CanonicalSetupSecurity) return null
        if (!proofOfPossessionPattern.matches(proofOfPossession)) return null

        return DeviceClaimPayload(
            deviceId = deviceId,
            claimCode = claimCode,
            claimExpiresAt = claimExpiresAt,
            setupAp = DeviceSetupAccessPoint(
                ssid = ssid,
                security = security,
                proofOfPossession = proofOfPossession,
            ),
            source = DeviceClaimSource.SecureSetupQr,
        )
    }

    /** Manual entry is intentionally claim-only and never invents local setup data. */
    fun fromManualEntry(deviceId: String, claimCode: String): DeviceClaimPayload? {
        val normalizedDeviceId = deviceId.trim()
        val normalizedClaimCode = claimCode.trim()
        if (!deviceIdPattern.matches(normalizedDeviceId)) return null
        if (!claimCodePattern.matches(normalizedClaimCode)) return null
        return DeviceClaimPayload(
            deviceId = normalizedDeviceId,
            claimCode = normalizedClaimCode,
            source = DeviceClaimSource.ManualClaimOnly,
        )
    }

    private fun JSONObject.exactString(key: String): String? {
        val value = opt(key) as? String ?: return null
        return value.takeIf { it.isNotEmpty() }
    }
}
