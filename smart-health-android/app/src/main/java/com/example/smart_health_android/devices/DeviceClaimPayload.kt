package com.example.smart_health_android.devices

import org.json.JSONObject
import java.time.Instant

enum class DeviceClaimSource {
    SecureSetupQr,
    SecureSetupManual,
}

enum class DeviceManualSetupField {
    DeviceId,
    ClaimCode,
    SetupSsid,
    ProofOfPossession,
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
    val setupExpiresAt: Instant? = claimExpiresAt,
    val setupAp: DeviceSetupAccessPoint? = null,
    val source: DeviceClaimSource,
) {
    val supportsSecureSetup: Boolean
        get() = setupAp != null && setupExpiresAt != null
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
    fun parse(raw: String, now: Instant = Instant.now()): DeviceClaimPayload? =
        parseCanonical(raw = raw, now = now, source = DeviceClaimSource.SecureSetupQr)

    /**
     * Manual fallback uses the human-readable fields printed with the provision artifact.
     * Device ID + claim code alone is deliberately insufficient because it would silently
     * downgrade secure provisioning and cannot prove access to the per-device setup AP.
     * The backend remains authoritative for claim expiry; local setup material is retained
     * for at most one short foreground provisioning session.
     */
    fun fromManualSetupFields(
        deviceId: String,
        claimCode: String,
        setupSsid: String,
        proofOfPossession: String,
        now: Instant = Instant.now(),
    ): DeviceClaimPayload? {
        val canonicalDeviceId = deviceId.trim()
        val canonicalClaimCode = claimCode.trim()
        val canonicalSetupSsid = setupSsid.trim()
        val canonicalProof = proofOfPossession.trim()
        if (
            validateManualSetupFields(
                deviceId = canonicalDeviceId,
                claimCode = canonicalClaimCode,
                setupSsid = canonicalSetupSsid,
                proofOfPossession = canonicalProof,
            ).isNotEmpty()
        ) return null
        return DeviceClaimPayload(
            deviceId = canonicalDeviceId,
            claimCode = canonicalClaimCode,
            claimExpiresAt = null,
            setupExpiresAt = now.plusSeconds(ManualSetupMaterialLifetimeSeconds),
            setupAp = DeviceSetupAccessPoint(
                ssid = canonicalSetupSsid,
                security = CanonicalSetupSecurity,
                proofOfPossession = canonicalProof,
            ),
            source = DeviceClaimSource.SecureSetupManual,
        )
    }

    fun validateManualSetupFields(
        deviceId: String,
        claimCode: String,
        setupSsid: String,
        proofOfPossession: String,
    ): Set<DeviceManualSetupField> = buildSet {
        if (!deviceIdPattern.matches(deviceId.trim())) add(DeviceManualSetupField.DeviceId)
        if (!claimCodePattern.matches(claimCode.trim())) add(DeviceManualSetupField.ClaimCode)
        if (!setupSsidPattern.matches(setupSsid.trim())) add(DeviceManualSetupField.SetupSsid)
        if (!proofOfPossessionPattern.matches(proofOfPossession.trim())) {
            add(DeviceManualSetupField.ProofOfPossession)
        }
    }

    private fun parseCanonical(
        raw: String,
        now: Instant,
        source: DeviceClaimSource,
    ): DeviceClaimPayload? {
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
            setupExpiresAt = claimExpiresAt,
            setupAp = DeviceSetupAccessPoint(
                ssid = ssid,
                security = security,
                proofOfPossession = proofOfPossession,
            ),
            source = source,
        )
    }

    private fun JSONObject.exactString(key: String): String? {
        val value = opt(key) as? String ?: return null
        return value.takeIf { it.isNotEmpty() }
    }

    private const val ManualSetupMaterialLifetimeSeconds = 15L * 60L
}
