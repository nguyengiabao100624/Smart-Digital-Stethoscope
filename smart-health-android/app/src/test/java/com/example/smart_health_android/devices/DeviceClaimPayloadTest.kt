package com.example.smart_health_android.devices

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class DeviceClaimPayloadTest {
    private val now = Instant.parse("2026-07-18T00:00:00Z")

    @Test
    fun parsesOnlyCanonicalSecureSetupQrV1AndPreservesCaseSensitiveClaimMaterial() {
        val payload = DeviceClaimPayloadParser.parse(
            secureQr(
                deviceId = "dev_Alpha-01",
                claimCode = "Claim_aB12",
                expiresAt = "2026-07-18T00:10:00Z",
            ),
            now = now,
        )

        requireNotNull(payload)
        assertEquals("dev_Alpha-01", payload.deviceId)
        assertEquals("Claim_aB12", payload.claimCode)
        assertEquals(Instant.parse("2026-07-18T00:10:00Z"), payload.claimExpiresAt)
        assertEquals(DeviceClaimSource.SecureSetupQr, payload.source)
        assertTrue(payload.supportsSecureSetup)
        assertEquals("Shcare-9487FC14F3E6", payload.setupAp?.ssid)
        assertEquals("WPA2_PSK", payload.setupAp?.security)
        assertEquals("4hxulJ_mCLIz2XhP-KXh", payload.setupAp?.proofOfPossession)
    }

    @Test
    fun rejectsLegacyQrAndAnyMissingOrMismatchedV1ContractField() {
        val canonical = secureQr()
        val invalidPayloads = listOf(
            """{"deviceId":"dev_alpha","claimCode":"Claim123"}""",
            "shcare://device/claim?deviceId=dev_alpha&claimCode=Claim123",
            canonical.replace("shcare.device.setup", "shcare.device.claim"),
            canonical.replace("\"protocolVersion\": 1", "\"protocolVersion\": 2"),
            canonical.replace("\"protocolVersion\": 1", "\"protocolVersion\": \"1\""),
            canonical.replace("\"protocolVersion\": 1", "\"protocolVersion\": 1.0"),
            canonical.replace("\"deviceId\": \"dev_alpha\"", "\"deviceId\": \"dev.alpha\""),
            canonical.replace("\"claimCode\": \"Claim123\"", "\"claimCode\": \"bad code\""),
            canonical.replace("WPA2_PSK", "OPEN"),
            canonical.replace("Shcare-9487FC14F3E6", "shcare-9487FC14F3E6"),
            canonical.replace("4hxulJ_mCLIz2XhP-KXh", "4hxulJ+mCLIz2XhP-KXh"),
            canonical.replace("4hxulJ_mCLIz2XhP-KXh", "too-short"),
        )

        invalidPayloads.forEach { raw ->
            assertNull(raw, DeviceClaimPayloadParser.parse(raw, now = now))
        }
    }

    @Test
    fun rejectsExpiredClaimAndExactBoundaryWithoutTrimmingCanonicalIdentity() {
        assertNull(
            DeviceClaimPayloadParser.parse(
                secureQr(expiresAt = "2026-07-17T23:59:59Z"),
                now = now,
            ),
        )
        assertNull(
            DeviceClaimPayloadParser.parse(
                secureQr(expiresAt = "2026-07-18T00:00:00Z"),
                now = now,
            ),
        )
        assertNull(
            DeviceClaimPayloadParser.parse(
                secureQr(deviceId = " dev_alpha"),
                now = now,
            ),
        )
        assertNull(
            DeviceClaimPayloadParser.parse(
                secureQr(deviceId = "a".repeat(64)),
                now = now,
            ),
        )
    }

    @Test
    fun manualEntryIsExplicitClaimOnlyAndNeverInventsSetupCapability() {
        val payload = DeviceClaimPayloadParser.fromManualEntry(
            deviceId = "  DEV_001  ",
            claimCode = " Claim_aB12 ",
        )

        requireNotNull(payload)
        assertEquals("DEV_001", payload.deviceId)
        assertEquals("Claim_aB12", payload.claimCode)
        assertEquals(DeviceClaimSource.ManualClaimOnly, payload.source)
        assertFalse(payload.supportsSecureSetup)
        assertNull(payload.claimExpiresAt)
        assertNull(payload.setupAp)
    }

    @Test
    fun manualEntryUsesTheSameCanonicalDeviceIdBoundary() {
        assertNull(DeviceClaimPayloadParser.fromManualEntry("dev.001", "Claim123"))
        assertNull(DeviceClaimPayloadParser.fromManualEntry("ab", "Claim123"))
        assertNull(DeviceClaimPayloadParser.fromManualEntry("a".repeat(64), "Claim123"))
        assertNull(DeviceClaimPayloadParser.fromManualEntry("dev_001", "short"))
    }

    private fun secureQr(
        deviceId: String = "dev_alpha",
        claimCode: String = "Claim123",
        expiresAt: String = "2026-07-19T00:00:00Z",
    ): String =
        """
        {
          "type": "shcare.device.setup",
          "protocolVersion": 1,
          "deviceId": "$deviceId",
          "claimCode": "$claimCode",
          "claimExpiresAt": "$expiresAt",
          "setupAp": {
            "ssid": "Shcare-9487FC14F3E6",
            "security": "WPA2_PSK",
            "proofOfPossession": "4hxulJ_mCLIz2XhP-KXh"
          }
        }
        """.trimIndent()
}
