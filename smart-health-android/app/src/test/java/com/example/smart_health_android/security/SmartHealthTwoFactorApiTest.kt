package com.example.smart_health_android.security

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.twoFactorChallengeOrNull
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthTwoFactorApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `status fails closed when secure storage is unavailable`() = runBlocking {
        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse("""
            {
              "availability": {
                "available": false,
                "status": "unavailable",
                "methods": [],
                "reason": "secure_storage_not_configured"
              },
              "twoFactor": {
                "enabled": false,
                "method": "",
                "enrollmentPending": false
              }
            }
        """))

        val result = api.getTwoFactorStatus()

        assertFalse(result.availability.available)
        assertTrue(result.availability.methods.isEmpty())
        assertFalse(result.twoFactor.enabled)
        assertNull(api.currentTwoFactorToken())
    }

    @Test
    fun `enrollment alone never enables or creates a second factor token`() = runBlocking {
        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse("""
            {
              "twoFactor": {"enabled": false, "method": "", "enrollmentPending": true},
              "enrollment": {
                "id": "enroll_1",
                "method": "app",
                "manualKey": "JBSWY3DPEHPK3PXP",
                "otpauthUri": "otpauth://totp/Shcare:user?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
                "expiresAt": "2026-07-14T14:15:00.000Z"
              }
            }
        """))

        val result = api.startTwoFactorEnrollment()

        assertFalse(result.twoFactor.enabled)
        assertTrue(result.twoFactor.enrollmentPending)
        assertEquals("JBSWY3DPEHPK3PXP", result.enrollment.manualKey)
        assertNull(api.currentTwoFactorToken())
    }

    @Test
    fun `verified enrollment stores the bounded second factor only in memory`() = runBlocking {
        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse("""
            {
              "twoFactor": {"enabled": true, "method": "app", "enrollmentPending": false},
              "recoveryCodes": ["A1","A2","A3","A4","A5","A6","A7","A8"],
              "twoFactorToken": "verified-tfa-token-0123456789abcdef",
              "tokenExpiresAt": "2026-07-14T22:00:00.000Z"
            }
        """))
        server.enqueue(jsonResponse("""{"user":{"id":"usr_1","role":"patient"}}"""))

        val verified = api.verifyTwoFactorEnrollment("enroll_1", "123456")
        assertTrue(verified.twoFactor.enabled)
        assertEquals("verified-tfa-token-0123456789abcdef", api.currentTwoFactorToken())

        api.getMe()
        val verifyRequest = server.takeRequest()
        val meRequest = server.takeRequest()
        assertEquals("Bearer primary-token", verifyRequest.getHeader("Authorization"))
        assertNull(verifyRequest.getHeader("X-Shcare-2FA-Token"))
        assertEquals("Bearer primary-token", meRequest.getHeader("Authorization"))
        assertEquals(
            "verified-tfa-token-0123456789abcdef",
            meRequest.getHeader("X-Shcare-2FA-Token"),
        )
    }

    @Test
    fun `firebase challenge preserves primary token until OTP succeeds`() = runBlocking {
        server.enqueue(jsonResponse("""
            {
              "code": "TWO_FACTOR_REQUIRED",
              "message": "Cần mã OTP",
              "requestId": "req_1",
              "details": {
                "challengeId": "challenge_1",
                "method": "app",
                "expiresAt": "2026-07-14T14:10:00.000Z"
              }
            }
        """, 401))

        val error = runCatching { api.authenticateFirebase("firebase-id-token") }.exceptionOrNull()
            as SmartHealthApiException
        assertEquals("TWO_FACTOR_REQUIRED", error.code)
        assertEquals("challenge_1", error.twoFactorChallengeOrNull()?.challengeId)
        assertEquals("firebase-id-token", api.currentAuthToken())
        assertNull(api.currentTwoFactorToken())

        server.enqueue(jsonResponse("""
            {
              "twoFactorToken": "firebase-tfa-token-0123456789abcdef",
              "expiresAt": "2026-07-14T22:00:00.000Z",
              "user": {"id":"usr_1","role":"patient"}
            }
        """))
        api.completeTwoFactorChallenge("challenge_1", "123456")
        server.takeRequest()
        val challengeRequest = server.takeRequest()
        assertEquals("/api/v1/auth/2fa/challenge", challengeRequest.path)
        assertEquals("Bearer firebase-id-token", challengeRequest.getHeader("Authorization"))
        assertEquals("firebase-tfa-token-0123456789abcdef", api.currentTwoFactorToken())
    }

    @Test
    fun `demo login creates no primary token before challenge success`() = runBlocking {
        server.enqueue(jsonResponse("""
            {
              "twoFactorRequired": true,
              "challengeId": "demo_challenge_1",
              "method": "app",
              "expiresAt": "2026-07-14T14:10:00.000Z"
            }
        """, 202))

        val error = runCatching { api.login("doctor@example.com", "password", "doctor") }
            .exceptionOrNull() as SmartHealthApiException
        assertEquals("TWO_FACTOR_REQUIRED", error.code)
        assertNull(api.currentAuthToken())

        server.enqueue(jsonResponse("""
            {
              "token": "demo-primary-session-token-0123456789",
              "twoFactorToken": "demo-tfa-session-token-0123456789abcdef",
              "expiresAt": "2026-07-14T22:00:00.000Z",
              "user": {"id":"usr_demo","role":"doctor"}
            }
        """))
        val result = api.completeTwoFactorChallenge("demo_challenge_1", "123456")
        assertEquals("demo-primary-session-token-0123456789", result.token)
        assertEquals(result.token, api.currentAuthToken())
        assertEquals(result.twoFactorToken, api.currentTwoFactorToken())
    }

    @Test
    fun `session revoke sends stable idempotency key and parses server confirmation`() = runBlocking {
        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse("""
            {
              "session": {
                "id": "session_remote",
                "device": "Chrome",
                "current": false,
                "revokedAt": "2026-07-14T00:00:00.000Z"
              }
            }
        """))

        val revoked = api.revokeAuthSession("session_remote", "stable_revoke_key")
        val request = server.takeRequest()

        assertEquals("/api/v1/auth/sessions/session_remote/revoke", request.path)
        assertEquals("stable_revoke_key", request.getHeader("Idempotency-Key"))
        assertEquals("2026-07-14T00:00:00.000Z", revoked.revokedAt)
    }

    private fun jsonResponse(body: String, status: Int = 200) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())
}
