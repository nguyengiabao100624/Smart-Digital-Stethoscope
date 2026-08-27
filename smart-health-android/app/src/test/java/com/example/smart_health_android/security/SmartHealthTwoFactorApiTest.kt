package com.example.smart_health_android.security

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.TwoFactorEnrollmentIntent
import com.example.smart_health_android.data.TwoFactorEnrollmentStartIntent
import com.example.smart_health_android.data.TwoFactorRecoveryAcknowledgementIntent
import com.example.smart_health_android.data.twoFactorChallengeOrNull
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
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
              "userId": "usr_1",
              "twoFactor": {"enabled": false, "method": "", "enrollmentPending": true},
              "enrollment": {
                "id": "enroll_1",
                "method": "app",
                "manualKey": "JBSWY3DPEHPK3PXP",
                "otpauthUri": "otpauth://totp/Shcare:user?secret=JBSWY3DPEHPK3PXP&issuer=Shcare",
                "expiresAt": "2026-07-14T14:15:00.000Z"
              },
              "replayed": false,
              "superseded": false
            }
        """))

        val intent = TwoFactorEnrollmentStartIntent(
            userId = "usr_1",
            idempotencyKey = "stable-start-key",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )
        val result = api.startTwoFactorEnrollment(intent)
        val request = server.takeRequest()

        assertEquals("usr_1", result.userId)
        assertFalse(result.twoFactor.enabled)
        assertTrue(result.twoFactor.enrollmentPending)
        assertEquals("JBSWY3DPEHPK3PXP", result.enrollment.manualKey)
        assertFalse(result.replayed)
        assertFalse(result.superseded)
        assertEquals("stable-start-key", request.getHeader("Idempotency-Key"))
        assertEquals(
            setOf("method"),
            JSONObject(request.body.readUtf8()).keys().asSequence().toSet(),
        )
        assertNull(api.currentTwoFactorToken())
    }

    @Test
    fun `late enrollment start cannot cross into a replacement auth session`() = runBlocking {
        api.setAuthToken("account-a-token")
        val accountAEpoch = api.currentAuthSessionEpoch()
        server.enqueue(
            jsonResponse(sharedContractFixture("two-factor-enrollment.json"))
                .setBodyDelay(250, TimeUnit.MILLISECONDS),
        )

        val completion = async(Dispatchers.IO) {
            runCatching {
                api.startTwoFactorEnrollment(
                    TwoFactorEnrollmentStartIntent(
                        userId = "user_two_factor_fixture",
                        idempotencyKey = "late-start-key",
                        expectedAuthSessionEpoch = accountAEpoch,
                    ),
                )
            }.exceptionOrNull()
        }
        checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = completion.await() as SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("account-b-token", api.currentAuthToken())
        assertNull(api.currentTwoFactorToken())
    }

    @Test
    fun `verified OTP remains pending and cannot install a completed second factor`() = runBlocking {
        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse("""
            {
              "userId": "usr_1",
              "enrollmentId": "enroll_1",
              "twoFactor": {"enabled": false, "method": "", "enrollmentPending": true},
              "recoveryCodes": [
                "A8F2C6-6A9F31","B4A7F2-BA9C4D","C9F3A8-BAC5AD","D6A4C7-A2AF31",
                "E3B8A5-CA7FAB","F7A2A9-AB4C31","A5C9F3-ADB8AA","B2A6C4-FA9ACA"
              ],
              "recoveryDelivery": {
                "id": "delivery_1",
                "expiresAt": "2099-07-14T22:00:00.000Z",
                "acknowledged": false
              },
              "recoveryAckToken": "recovery-ack-token-0123456789abcdef",
              "replayed": false
            }
        """))
        server.enqueue(jsonResponse("""{"user":{"id":"usr_1","role":"patient"}}"""))

        val verified = api.verifyTwoFactorEnrollment(
            TwoFactorEnrollmentIntent(
                userId = "usr_1",
                enrollmentId = "enroll_1",
                code = "123456",
                idempotencyKey = "stable-enrollment-key",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            ),
        )
        assertFalse(verified.twoFactor.enabled)
        assertTrue(verified.twoFactor.enrollmentPending)
        assertEquals("usr_1", verified.userId)
        assertEquals("enroll_1", verified.enrollmentId)
        assertEquals("delivery_1", verified.recoveryDelivery.id)
        assertEquals("recovery-ack-token-0123456789abcdef", verified.recoveryAckToken)
        assertFalse(verified.toString().contains(verified.recoveryAckToken))
        assertFalse(verified.toString().contains(verified.recoveryCodes.first()))
        assertNull(api.currentTwoFactorToken())

        api.getMe()
        val verifyRequest = server.takeRequest()
        val meRequest = server.takeRequest()
        assertEquals("Bearer primary-token", verifyRequest.getHeader("Authorization"))
        assertEquals("stable-enrollment-key", verifyRequest.getHeader("Idempotency-Key"))
        assertNull(verifyRequest.getHeader("X-Shcare-2FA-Token"))
        assertEquals("Bearer primary-token", meRequest.getHeader("Authorization"))
        assertNull(meRequest.getHeader("X-Shcare-2FA-Token"))
        val verifyBody = JSONObject(verifyRequest.body.readUtf8())
        assertEquals(setOf("enrollmentId", "otp"), verifyBody.keys().asSequence().toSet())
        assertEquals("123456", verifyBody.getString("otp"))
    }

    @Test
    fun `exact recovery acknowledgement is the only step that installs the second factor`() = runBlocking {
        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse(sharedContractFixture("two-factor-recovery-acknowledged.json")))
        server.enqueue(jsonResponse("""{"user":{"id":"user_two_factor_fixture","role":"patient"}}"""))

        val acknowledgementIntent = TwoFactorRecoveryAcknowledgementIntent(
            userId = "user_two_factor_fixture",
            enrollmentId = "tfa_enroll_fixture_01",
            deliveryId = "2fa_delivery_fixture_01",
            recoveryAckToken = "recovery_ack_fixture_token_0123456789",
            idempotencyKey = "stable-enrollment-key",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )
        assertFalse(acknowledgementIntent.toString().contains(acknowledgementIntent.recoveryAckToken))
        val receipt = api.acknowledgeTwoFactorRecoveryCodes(acknowledgementIntent)
        val request = server.takeRequest()
        api.getMe()
        val meRequest = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())

        assertEquals(
            "/api/v1/me/2fa/recovery-codes/ack",
            request.path,
        )
        assertEquals("stable-enrollment-key", request.getHeader("Idempotency-Key"))
        assertNull(request.getHeader("X-Shcare-2FA-Token"))
        assertEquals(setOf("deliveryId", "recoveryAckToken"), body.keys().asSequence().toSet())
        assertEquals("2fa_delivery_fixture_01", body.getString("deliveryId"))
        assertEquals("recovery_ack_fixture_token_0123456789", body.getString("recoveryAckToken"))
        assertEquals("user_two_factor_fixture", receipt.userId)
        assertEquals("tfa_enroll_fixture_01", receipt.enrollmentId)
        assertTrue(receipt.recoveryDelivery.acknowledged)
        assertEquals("2fa_delivery_fixture_01", receipt.recoveryDelivery.id)
        assertFalse(receipt.toString().contains(receipt.twoFactorToken))
        assertEquals(receipt.twoFactorToken, api.currentTwoFactorToken())
        assertEquals(receipt.twoFactorToken, meRequest.getHeader("X-Shcare-2FA-Token"))
    }

    @Test
    fun `verification rejects foreign owner or non canonical receipt without installing token`() = runBlocking {
        api.setAuthToken("primary-token")
        val canonical = JSONObject(sharedContractFixture("two-factor-verified.json"))
        val invalidReceipts = listOf(
            JSONObject(canonical.toString()).put("userId", "user_foreign").toString(),
            JSONObject(canonical.toString()).also { it.remove("replayed") }.toString(),
            JSONObject(canonical.toString()).also { it.put("unexpected", true) }.toString(),
            JSONObject(canonical.toString()).also {
                it.getJSONObject("recoveryDelivery").put("acknowledged", true)
            }.toString(),
            JSONObject(canonical.toString()).put("recoveryAckToken", "short").toString(),
            JSONObject(canonical.toString()).put("recoveryAckToken", "a".repeat(1025)).toString(),
        )

        invalidReceipts.forEachIndexed { index, body ->
            server.enqueue(jsonResponse(body))
            val error = runCatching {
                api.verifyTwoFactorEnrollment(
                    TwoFactorEnrollmentIntent(
                        userId = "user_two_factor_fixture",
                        enrollmentId = "tfa_enroll_fixture_01",
                        code = "123456",
                        idempotencyKey = "invalid-receipt-key-$index",
                        expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                    ),
                )
            }.exceptionOrNull() as SmartHealthApiException

            assertTrue(
                error.code == "TWO_FACTOR_ENROLLMENT_RESPONSE_INVALID" ||
                    error.code == "TWO_FACTOR_ENROLLMENT_RESPONSE_SCOPE_MISMATCH",
            )
            assertNull(api.currentTwoFactorToken())
        }
    }

    @Test
    fun `acknowledgement rejects foreign or malformed completion without installing token`() = runBlocking {
        api.setAuthToken("primary-token")
        val canonical = JSONObject(sharedContractFixture("two-factor-recovery-acknowledged.json"))
        val invalidReceipts = listOf(
            JSONObject(canonical.toString()).put("userId", "user_foreign").toString(),
            JSONObject(canonical.toString()).put("enrollmentId", "enroll_foreign").toString(),
            JSONObject(canonical.toString()).put("twoFactorToken", "bad token").toString(),
            JSONObject(canonical.toString()).put("twoFactorToken", "short").toString(),
            JSONObject(canonical.toString()).put("twoFactorToken", "a".repeat(1025)).toString(),
            JSONObject(canonical.toString()).also { it.remove("tokenExpiresAt") }.toString(),
            JSONObject(canonical.toString()).put("unexpected", true).toString(),
        )

        invalidReceipts.forEachIndexed { index, body ->
            server.enqueue(jsonResponse(body))
            val error = runCatching {
                api.acknowledgeTwoFactorRecoveryCodes(
                    TwoFactorRecoveryAcknowledgementIntent(
                        userId = "user_two_factor_fixture",
                        enrollmentId = "tfa_enroll_fixture_01",
                        deliveryId = "2fa_delivery_fixture_01",
                        recoveryAckToken = "recovery_ack_fixture_token_0123456789",
                        idempotencyKey = "invalid-ack-key-$index",
                        expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                    ),
                )
            }.exceptionOrNull() as SmartHealthApiException

            assertTrue(
                error.code == "TWO_FACTOR_RECOVERY_ACK_RESPONSE_INVALID" ||
                    error.code == "TWO_FACTOR_RECOVERY_ACK_RESPONSE_SCOPE_MISMATCH",
            )
            assertNull(api.currentTwoFactorToken())
        }
    }

    @Test
    fun `late acknowledgement cannot enable two factor on a replacement account`() = runBlocking {
        api.setAuthToken("account-a-token")
        val accountAEpoch = api.currentAuthSessionEpoch()
        server.enqueue(
            jsonResponse(sharedContractFixture("two-factor-recovery-acknowledged.json"))
                .setBodyDelay(250, TimeUnit.MILLISECONDS),
        )

        val completion = async(Dispatchers.IO) {
            runCatching {
                api.acknowledgeTwoFactorRecoveryCodes(
                    TwoFactorRecoveryAcknowledgementIntent(
                        userId = "user_two_factor_fixture",
                        enrollmentId = "tfa_enroll_fixture_01",
                        deliveryId = "2fa_delivery_fixture_01",
                        recoveryAckToken = "recovery_ack_fixture_token_0123456789",
                        idempotencyKey = "late-ack-key",
                        expectedAuthSessionEpoch = accountAEpoch,
                    ),
                )
            }.exceptionOrNull()
        }
        checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = completion.await() as SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("account-b-token", api.currentAuthToken())
        assertNull(api.currentTwoFactorToken())
    }

    @Test
    fun `late verification response cannot install factor on replacement account`() = runBlocking {
        api.setAuthToken("account-a-token")
        val accountAEpoch = api.currentAuthSessionEpoch()
        server.enqueue(
            jsonResponse(sharedContractFixture("two-factor-verified.json"))
                .setBodyDelay(250, TimeUnit.MILLISECONDS),
        )

        val completion = async(Dispatchers.IO) {
            runCatching {
                api.verifyTwoFactorEnrollment(
                    TwoFactorEnrollmentIntent(
                        userId = "user_two_factor_fixture",
                        enrollmentId = "tfa_enroll_fixture_01",
                        code = "123456",
                        idempotencyKey = "late-verification-key",
                        expectedAuthSessionEpoch = accountAEpoch,
                    ),
                )
            }.exceptionOrNull()
        }
        checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = completion.await() as SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("account-b-token", api.currentAuthToken())
        assertNull(api.currentTwoFactorToken())
    }

    @Test
    fun `firebase challenge preserves primary token until OTP succeeds`() = runBlocking {
        server.enqueue(jsonResponse("""
            {
              "code": "TWO_FACTOR_CHALLENGE_REQUIRED",
              "message": "Cần mã OTP",
              "requestId": "req_1",
              "details": {
                "challengeId": "challenge_1",
                "method": "app",
                "expiresAt": "2026-07-14T14:10:00.000Z"
              }
            }
        """, 401))

        val error = runCatching {
            api.authenticateFirebase(
                idToken = "firebase-id-token",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
        }.exceptionOrNull()
            as SmartHealthApiException
        assertEquals("TWO_FACTOR_CHALLENGE_REQUIRED", error.code)
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
        api.completeTwoFactorChallenge(
            challengeId = "challenge_1",
            code = "123456",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )
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
        val result = api.completeTwoFactorChallenge(
            challengeId = "demo_challenge_1",
            code = "123456",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )
        assertEquals("demo-primary-session-token-0123456789", result.token)
        assertEquals(result.token, api.currentAuthToken())
        assertEquals(result.twoFactorToken, api.currentTwoFactorToken())
    }

    @Test
    fun `late two factor response cannot overwrite replacement account token`() = runBlocking {
        api.setAuthToken("account-a-token")
        val accountAEpoch = api.currentAuthSessionEpoch()
        server.enqueue(
            jsonResponse(
                """
                    {
                      "token": "late-account-a-token",
                      "twoFactorToken": "account-a-two-factor-token-0123456789",
                      "expiresAt": "2026-07-14T22:00:00.000Z",
                      "user": {"id":"usr_a","role":"patient"}
                    }
                """,
            ).setBodyDelay(250, TimeUnit.MILLISECONDS),
        )

        val completion = async(Dispatchers.IO) {
            runCatching {
                api.completeTwoFactorChallenge(
                    challengeId = "challenge_a",
                    code = "123456",
                    expectedAuthSessionEpoch = accountAEpoch,
                )
            }.exceptionOrNull()
        }
        checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = completion.await() as SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("account-b-token", api.currentAuthToken())
    }

    @Test
    fun `session revoke parses the shared canonical receipt and sends the stable idempotency key`() = runBlocking {
        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse(sharedContractFixture("auth-session-revoke-response.json")))

        val receipt = api.revokeAuthSession(
            "session_fixture_revoked_001",
            "stable_revoke_key",
        )
        val request = server.takeRequest()

        assertEquals("/api/v1/auth/sessions/session_fixture_revoked_001/revoke", request.path)
        assertEquals("stable_revoke_key", request.getHeader("Idempotency-Key"))
        assertEquals("session_fixture_revoked_001", receipt.session.id)
        assertEquals("2026-08-06T03:00:00.000Z", receipt.session.revokedAt)
        assertEquals(true, receipt.revoked)
        assertEquals(false, receipt.replayed)
    }

    @Test
    fun `session revoke rejects malformed or unconfirmed receipts`() = runBlocking {
        api.setAuthToken("primary-token")
        val canonical = JSONObject(sharedContractFixture("auth-session-revoke-response.json"))
        fun mutatedReceipt(mutator: (JSONObject) -> Unit): String =
            JSONObject(canonical.toString()).also(mutator).toString()
        val invalidReceipts = listOf(
            """{"session":{"id":"session_remote","revokedAt":"2026-08-06T03:00:00.000Z"},"revoked":false,"replayed":false}""",
            """{"session":{"id":"session_other","revokedAt":"2026-08-06T03:00:00.000Z"},"revoked":true,"replayed":false}""",
            """{"session":{"id":"session_remote","revokedAt":null},"revoked":true,"replayed":false}""",
            """{"session":{"id":"session_remote","revokedAt":"2026-08-06T03:00:00.000Z"},"revoked":"true","replayed":false}""",
            """{"session":{"id":"session_remote","revokedAt":"2026-08-06T03:00:00.000Z"},"revoked":true,"replayed":"false"}""",
            mutatedReceipt { it.put("unexpected", true) },
            mutatedReceipt { it.getJSONObject("session").put("unexpected", true) },
            mutatedReceipt { it.getJSONObject("session").remove("provider") },
            mutatedReceipt { it.getJSONObject("session").put("current", true) },
            mutatedReceipt { it.getJSONObject("session").put("createdAt", "not-a-date") },
            mutatedReceipt { it.getJSONObject("session").put("lastSeenAt", 42) },
            mutatedReceipt { it.getJSONObject("session").put("revokedAt", "tomorrow") },
            mutatedReceipt { it.getJSONObject("session").put("provider", 7) },
            mutatedReceipt { it.getJSONObject("session").put("provider", "p".repeat(81)) },
        )

        invalidReceipts.forEachIndexed { index, body ->
            server.enqueue(jsonResponse(body))

            val error = runCatching {
                api.revokeAuthSession(
                    if (index < 5) "session_remote" else "session_fixture_revoked_001",
                    "stable_revoke_key_$index",
                )
            }.exceptionOrNull() as SmartHealthApiException

            assertEquals("AUTH_SESSION_REVOCATION_RESPONSE_INVALID", error.code)
        }
    }

    @Test
    fun `late session revoke response cannot cross into a replacement auth session`() = runBlocking {
        api.setAuthToken("account-a-token")
        server.enqueue(
            jsonResponse(
                sharedContractFixture("auth-session-revoke-response.json"),
            ).setBodyDelay(250, TimeUnit.MILLISECONDS),
        )

        val completion = async(Dispatchers.IO) {
            runCatching {
                api.revokeAuthSession(
                    "session_fixture_revoked_001",
                    "stable_revoke_key",
                )
            }.exceptionOrNull()
        }
        checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = completion.await() as SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("account-b-token", api.currentAuthToken())
    }

    private fun jsonResponse(body: String, status: Int = 200) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())

    private fun sharedContractFixture(name: String): String {
        val workingDirectory = checkNotNull(System.getProperty("user.dir"))
        var cursor = File(workingDirectory).canonicalFile
        repeat(8) {
            val candidate = File(
                cursor,
                "packages/shcare-contracts/http/v1/fixtures/$name",
            )
            if (candidate.isFile) return candidate.readText(Charsets.UTF_8)
            cursor = cursor.parentFile ?: return@repeat
        }
        error("Shared Shcare contract fixture not found: $name")
    }
}
