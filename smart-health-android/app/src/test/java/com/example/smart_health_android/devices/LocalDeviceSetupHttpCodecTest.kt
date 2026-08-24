package com.example.smart_health_android.devices

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class LocalDeviceSetupHttpCodecTest {
    @Test
    fun parsesBoundedCanonicalSessionForTheExpectedDevice() {
        val body =
            """{"protocolVersion":1,"deviceId":"dev_alpha","csrfToken":"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF","expiresInSeconds":420}"""
        val response = (
            "HTTP/1.1 200 OK\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: ${body.toByteArray().size}\r\n" +
                "Connection: close\r\n\r\n" +
                body
            ).toByteArray()

        val session = LocalDeviceSetupHttpCodec.parseSessionResponse(
            response = response,
            expectedDeviceId = "dev_alpha",
        )

        assertEquals(1, session.protocolVersion)
        assertEquals("dev_alpha", session.deviceId)
        assertEquals(
            "0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF",
            session.csrfToken,
        )
        assertEquals(420, session.expiresInSeconds)
    }

    @Test
    fun rejectsSessionFromAnotherDevice() {
        val response = jsonResponse(
            status = 200,
            body = """{"protocolVersion":1,"deviceId":"dev_other","csrfToken":"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF","expiresInSeconds":420}""",
        )

        assertThrows(IOException::class.java) {
            LocalDeviceSetupHttpCodec.parseSessionResponse(response, expectedDeviceId = "dev_alpha")
        }
    }

    @Test
    fun acceptsProvisioningOnlyAfterHttp202ForTheExpectedDevice() {
        val accepted = jsonResponse(
            status = 202,
            body = """{"accepted":true,"deviceId":"dev_alpha"}""",
        )
        LocalDeviceSetupHttpCodec.requireProvisionAccepted(accepted, expectedDeviceId = "dev_alpha")

        val wrongDevice = jsonResponse(
            status = 202,
            body = """{"accepted":true,"deviceId":"dev_other"}""",
        )
        assertThrows(IOException::class.java) {
            LocalDeviceSetupHttpCodec.requireProvisionAccepted(
                wrongDevice,
                expectedDeviceId = "dev_alpha",
            )
        }
    }

    @Test
    fun rejectsChunkedOrLengthMismatchedResponses() {
        val chunked = (
            "HTTP/1.1 200 OK\r\n" +
                "Transfer-Encoding: chunked\r\n\r\n" +
                "2\r\n{}\r\n0\r\n\r\n"
            ).toByteArray()
        assertThrows(IOException::class.java) {
            LocalDeviceSetupHttpCodec.parseSessionResponse(chunked, expectedDeviceId = "dev_alpha")
        }

        val mismatched = (
            "HTTP/1.1 200 OK\r\n" +
                "Content-Length: 12\r\n\r\n{}"
            ).toByteArray()
        assertThrows(IOException::class.java) {
            LocalDeviceSetupHttpCodec.parseSessionResponse(mismatched, expectedDeviceId = "dev_alpha")
        }
    }

    @Test
    fun targetWifiValidationUsesEsp32ByteAndWpaBounds() {
        assertTrue(validateTargetWifiCredentials("Phòng khám", "matkhau8").isEmpty())
        assertTrue(validateTargetWifiCredentials("Open network", "").isEmpty())
        assertEquals(
            setOf(DeviceTargetWifiField.Ssid),
            validateTargetWifiCredentials("ộ".repeat(17), "matkhau8"),
        )
        assertEquals(
            setOf(DeviceTargetWifiField.Password),
            validateTargetWifiCredentials("Home", "short"),
        )
    }

    private fun jsonResponse(status: Int, body: String): ByteArray = (
        "HTTP/1.1 $status Test\r\n" +
            "Content-Type: application/json\r\n" +
            "Content-Length: ${body.toByteArray().size}\r\n" +
            "Connection: close\r\n\r\n" +
            body
        ).toByteArray()
}
