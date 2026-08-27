package com.example.smart_health_android.devices

import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeviceSmartConfigV2ContractTest {
    @Test
    fun matchesTheSharedEspTouchV2KdfGoldenVector() {
        val deviceId = "dev_alpha"
        val rawSecret = "0123456789abcdef0123456789abcdef"
        val verificationKey = MessageDigest.getInstance("SHA-256")
            .digest(rawSecret.toByteArray())
        try {
            val key = Mac.getInstance("HmacSHA256")
                .apply { init(SecretKeySpec(verificationKey, "HmacSHA256")) }
                .doFinal("shcare/esptouch-v2/aes128\n$deviceId".toByteArray())
                .copyOf(16)
            // ESPTouch V2 in the tested Android 2.2.1/ESP-IDF pairing does
            // not reliably round-trip arbitrary high-bit custom bytes.  The
            // binding remains encrypted inside the V2 AES payload, but has a
            // deliberately ASCII-safe wire form: v2: + 16-byte digest hex.
            val bindingDigest = MessageDigest.getInstance("SHA-256")
                .digest("shcare/esptouch-v2/device\n$deviceId".toByteArray())
                .copyOf(16)
            val binding = buildString {
                append("v2:")
                bindingDigest.forEach { byte -> append("%02x".format(byte.toInt() and 0xff)) }
            }.toByteArray(Charsets.US_ASCII)

            assertEquals("CwvrODXsPpP9lFz2EhaEKQ", Base64.getUrlEncoder().withoutPadding().encodeToString(key))
            assertEquals("v2:ec1ed31a41a7430defd880bc96532810", binding.toString(Charsets.US_ASCII))
            bindingDigest.fill(0)
        } finally {
            verificationKey.fill(0)
        }
    }

    @Test
    fun acceptsOnlyBoundEspTouchV2MaterialShapes() {
        assertTrue(
            isValidSmartConfigV2Material(
                deviceId = "dev_alpha",
                provisioningKey = ByteArray(16) { 0x2a },
                reservedData = "v2:${"31".repeat(16)}".toByteArray(),
            ),
        )
    }

    @Test
    fun rejectsWrongDeviceOrProtocolMaterial() {
        assertFalse(
            isValidSmartConfigV2Material(
                deviceId = "bad.device",
                provisioningKey = ByteArray(16),
                reservedData = "v2:${"00".repeat(16)}".toByteArray(),
            ),
        )
        assertFalse(
            isValidSmartConfigV2Material(
                deviceId = "dev_alpha",
                provisioningKey = ByteArray(15),
                reservedData = "v2:${"00".repeat(16)}".toByteArray(),
            ),
        )
        assertFalse(
            isValidSmartConfigV2Material(
                deviceId = "dev_alpha",
                provisioningKey = ByteArray(16),
                reservedData = "v1:${"00".repeat(16)}".toByteArray(),
            ),
        )
    }
}
