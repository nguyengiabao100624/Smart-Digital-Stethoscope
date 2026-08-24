package com.example.smart_health_android.devices

import org.json.JSONObject
import java.io.IOException
import java.nio.charset.StandardCharsets

data class LocalDeviceSetupSession(
    val protocolVersion: Int,
    val deviceId: String,
    val csrfToken: String,
    val expiresInSeconds: Int,
)

object LocalDeviceSetupHttpCodec {
    private const val Host = "192.168.4.1"
    private const val MaxResponseBytes = 64 * 1024
    private val canonicalDeviceId = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$")
    private val csrfToken = Regex("^[A-F0-9]{64}$")

    fun buildSessionRequest(): ByteArray = (
        "GET /api/v1/setup/session HTTP/1.1\r\n" +
            "Host: $Host\r\n" +
            "Accept: application/json\r\n" +
            "Connection: close\r\n\r\n"
        ).toByteArray(StandardCharsets.US_ASCII)

    fun buildProvisionRequest(
        session: LocalDeviceSetupSession,
        targetSsid: String,
        targetPassword: String,
    ): ByteArray {
        val body = JSONObject()
            .put("protocolVersion", 1)
            .put("deviceId", session.deviceId)
            .put("csrfToken", session.csrfToken)
            .put("ssid", targetSsid)
            .put("password", targetPassword)
            .toString()
            .toByteArray(StandardCharsets.UTF_8)
        val headers = (
            "POST /api/v1/setup/wifi HTTP/1.1\r\n" +
                "Host: $Host\r\n" +
                "Content-Type: application/json\r\n" +
                "Accept: application/json\r\n" +
                "Content-Length: ${body.size}\r\n" +
                "Connection: close\r\n\r\n"
            ).toByteArray(StandardCharsets.US_ASCII)
        return headers + body
    }

    fun parseSessionResponse(response: ByteArray, expectedDeviceId: String): LocalDeviceSetupSession {
        val body = parseJsonResponse(response, expectedStatus = 200)
        val protocolVersion = body.opt("protocolVersion") as? Int
            ?: throw IOException("Setup session is missing protocolVersion")
        if (protocolVersion != 1) throw IOException("Unsupported setup protocol")
        val deviceId = body.opt("deviceId") as? String
            ?: throw IOException("Setup session is missing deviceId")
        if (!canonicalDeviceId.matches(deviceId) || deviceId != expectedDeviceId) {
            throw IOException("Setup device identity mismatch")
        }
        val token = body.opt("csrfToken") as? String
            ?: throw IOException("Setup session is missing csrfToken")
        if (!csrfToken.matches(token)) throw IOException("Invalid setup session token")
        val expiresInSeconds = body.opt("expiresInSeconds") as? Int
            ?: throw IOException("Setup session is missing expiry")
        if (expiresInSeconds !in 1..900) throw IOException("Invalid setup session expiry")
        return LocalDeviceSetupSession(protocolVersion, deviceId, token, expiresInSeconds)
    }

    fun requireProvisionAccepted(response: ByteArray, expectedDeviceId: String) {
        val body = parseJsonResponse(response, expectedStatus = 202)
        if (body.opt("accepted") != true || body.opt("deviceId") != expectedDeviceId) {
            throw IOException("Device did not accept the Wi-Fi configuration")
        }
    }

    private fun parseJsonResponse(response: ByteArray, expectedStatus: Int): JSONObject {
        if (response.isEmpty() || response.size > MaxResponseBytes) {
            throw IOException("Local setup response is outside bounds")
        }
        val separator = "\r\n\r\n".toByteArray(StandardCharsets.US_ASCII)
        val headerEnd = response.indexOf(separator)
        if (headerEnd < 0) throw IOException("Malformed local setup response")
        val headerText = response.copyOfRange(0, headerEnd)
            .toString(StandardCharsets.ISO_8859_1)
        val headerLines = headerText.split("\r\n")
        val status = headerLines.firstOrNull()
            ?.split(' ')
            ?.getOrNull(1)
            ?.toIntOrNull()
            ?: throw IOException("Malformed local setup status")
        if (status != expectedStatus) throw IOException("Local setup returned HTTP $status")
        if (headerLines.drop(1).any { it.startsWith("Transfer-Encoding:", ignoreCase = true) }) {
            throw IOException("Chunked local setup response is unsupported")
        }
        val contentLength = headerLines.drop(1)
            .firstOrNull { it.startsWith("Content-Length:", ignoreCase = true) }
            ?.substringAfter(':')
            ?.trim()
            ?.toIntOrNull()
            ?: throw IOException("Local setup response is missing Content-Length")
        val bodyStart = headerEnd + separator.size
        if (contentLength !in 2..MaxResponseBytes || bodyStart + contentLength != response.size) {
            throw IOException("Local setup response length mismatch")
        }
        val bodyText = response.copyOfRange(bodyStart, response.size)
            .toString(StandardCharsets.UTF_8)
        return runCatching { JSONObject(bodyText) }
            .getOrElse { throw IOException("Malformed local setup JSON", it) }
    }

    private fun ByteArray.indexOf(needle: ByteArray): Int {
        if (needle.isEmpty() || size < needle.size) return -1
        for (index in 0..size - needle.size) {
            var matches = true
            for (offset in needle.indices) {
                if (this[index + offset] != needle[offset]) {
                    matches = false
                    break
                }
            }
            if (matches) return index
        }
        return -1
    }
}
