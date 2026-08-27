package com.example.smart_health_android.account

import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.PatientMutationIntent
import com.example.smart_health_android.data.PatientMutationReceipt
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class SmartHealthFamilyApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("primary-token")
        runBlocking {
            server.enqueue(jsonResponse(FIREBASE_AUTH_RESPONSE))
            api.authenticateFirebase(
                idToken = "primary-token",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
            server.takeRequest()
        }
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `dependent create sends canonical fields and idempotency key`() = runBlocking {
        server.enqueue(jsonResponse(PATIENT_RESPONSE))

        val patient = api.createPatient(
            patientCode = "",
            name = "Bé An",
            dateOfBirth = "2016-01-02",
            gender = "female",
            phone = "0901000000",
            bloodType = "O+",
            allergies = listOf("Phấn hoa", "Hải sản"),
            emergencyContact = EmergencyContact("Nguyễn An", "0902000000", "Mẹ"),
            profileType = "dependent",
            relationship = "Con",
            idempotencyKey = "create_patient_key",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("POST", request.method)
        assertEquals("/api/v1/patients", request.path)
        assertEquals("create_patient_key", request.getHeader("Idempotency-Key"))
        assertEquals("2016-01-02", body.getString("dateOfBirth"))
        assertEquals("O+", body.getString("bloodType"))
        assertEquals(2, body.getJSONArray("allergies").length())
        assertEquals("0902000000", body.getJSONObject("emergencyContact").getString("phone"))
        assertEquals("2016-01-02", patient.dateOfBirth)
        assertEquals(listOf("Phấn hoa", "Hải sản"), patient.allergies)
    }

    @Test
    fun `active profile switch parses only backend confirmed identity`() = runBlocking {
        server.enqueue(jsonResponse("""
            {
              "user": {
                "id": "user_1",
                "role": "patient",
                "activePatientId": "dependent_1"
              },
              "activePatient": ${JSONObject(PATIENT_RESPONSE).getJSONObject("patient")}
            }
        """))

        val result = api.switchActiveProfile("dependent_1", "switch_profile_key")

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/me/active-profile", request.path)
        assertEquals("switch_profile_key", request.getHeader("Idempotency-Key"))
        assertEquals("dependent_1", JSONObject(request.body.readUtf8()).getString("patientId"))
        assertEquals("dependent_1", result.user.activePatientId)
        assertEquals("dependent_1", result.activePatient.id)
    }

    @Test
    fun `family create parses an exact account workspace patient and intent receipt`() = runBlocking {
        server.enqueue(jsonResponse(canonicalMutationResponse(intent = "create").toString()))

        val receipt = api.createPatientWithReceipt(
            patientCode = "",
            name = "Dependent",
            dateOfBirth = "2016-01-02",
            gender = "female",
            phone = "0901000000",
            notes = "",
            bloodType = "O+",
            allergies = emptyList(),
            emergencyContact = EmergencyContact(),
            profileType = "dependent",
            relationship = "Child",
            idempotencyKey = "create_receipt_key",
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
            expectedAuthSessionId = AUTH_SESSION_ID,
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )

        assertEquals("user_1", receipt.userId)
        assertEquals("workspace_1", receipt.workspaceId)
        assertEquals("dependent_1", receipt.patientId)
        assertEquals("dependent_1", receipt.patient?.id)
        val request = server.takeRequest()
        assertEquals("create_receipt_key", request.getHeader("Idempotency-Key"))
        assertAuthorityHeaders(request)
    }

    @Test
    fun `family create rejects foreign owner workspace or intent receipts`() = runBlocking {
        val invalidResponses = listOf(
            canonicalMutationResponse(intent = "create", userId = "foreign_user"),
            canonicalMutationResponse(intent = "create", workspaceId = "foreign_workspace"),
            canonicalMutationResponse(intent = "update"),
            canonicalMutationResponse(intent = "create").apply {
                getJSONObject("patient").put("ownerUserId", "foreign_user")
            },
        )

        invalidResponses.forEachIndexed { index, response ->
            server.enqueue(jsonResponse(response.toString()))
            try {
                api.createPatientWithReceipt(
                    patientCode = "",
                    name = "Dependent",
                    dateOfBirth = "2016-01-02",
                    gender = "female",
                    phone = "",
                    notes = "",
                    bloodType = "unknown",
                    allergies = emptyList(),
                    emergencyContact = EmergencyContact(),
                    profileType = "dependent",
                    relationship = "Child",
                    idempotencyKey = "invalid_create_$index",
                    expectedUserId = "user_1",
                    expectedWorkspaceId = "workspace_1",
                    expectedAuthSessionId = AUTH_SESSION_ID,
                    expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                )
                fail("Expected a foreign or mismatched receipt to be rejected")
            } catch (error: SmartHealthApiException) {
                assertEquals("PATIENT_MUTATION_RESPONSE_INVALID", error.code)
            }
        }
    }

    @Test
    fun `family update rejects a receipt for a different requested patient id`() = runBlocking {
        server.enqueue(
            jsonResponse(
                canonicalMutationResponse(
                    intent = "update",
                    patientId = "dependent_other",
                ).toString(),
            ),
        )

        try {
            api.updatePatientWithReceipt(
                patientId = "dependent_1",
                name = "Updated dependent",
                dateOfBirth = null,
                gender = null,
                phone = null,
                notes = null,
                bloodType = null,
                allergies = null,
                emergencyContact = null,
                relationship = null,
                idempotencyKey = "update_receipt_key",
                expectedUserId = "user_1",
                expectedWorkspaceId = "workspace_1",
                expectedAuthSessionId = AUTH_SESSION_ID,
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
            fail("Expected a mismatched patient receipt to be rejected")
        } catch (error: SmartHealthApiException) {
            assertEquals("PATIENT_MUTATION_RESPONSE_INVALID", error.code)
        }

        val request = server.takeRequest()
        assertEquals("/api/v1/patients/dependent_1", request.path)
        assertEquals("update_receipt_key", request.getHeader("Idempotency-Key"))
        assertAuthorityHeaders(request)
    }

    @Test
    fun `dependent delete requires a canonical receipt and carries idempotency key`() = runBlocking {
        server.enqueue(
            jsonResponse(
                canonicalMutationResponse(intent = "delete", includePatient = false)
                    .put("deleted", true)
                    .toString(),
            ),
        )

        val receipt = api.deletePatientWithReceipt(
            patientId = "dependent_1",
            idempotencyKey = "delete_profile_key",
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
            expectedAuthSessionId = AUTH_SESSION_ID,
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/patients/dependent_1", request.path)
        assertEquals("delete_profile_key", request.getHeader("Idempotency-Key"))
        assertAuthorityHeaders(request)
        assertTrue(receipt.deleted)
        assertEquals("dependent_1", receipt.patientId)
    }

    @Test
    fun `legacy delete success body fails closed without canonical ownership receipt`() = runBlocking {
        server.enqueue(jsonResponse("{\"deleted\":true,\"patientId\":\"dependent_1\",\"replayed\":false}"))

        try {
            api.deletePatientWithReceipt(
                patientId = "dependent_1",
                idempotencyKey = "delete_profile_key",
                expectedUserId = "user_1",
                expectedWorkspaceId = "workspace_1",
                expectedAuthSessionId = AUTH_SESSION_ID,
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
            fail("Expected the legacy unbound delete response to be rejected")
        } catch (error: SmartHealthApiException) {
            assertEquals("PATIENT_MUTATION_RESPONSE_INVALID", error.code)
        }
    }

    @Test
    fun `create update and delete captured under a replaced auth epoch never dispatch`() = runBlocking {
        val staleEpoch = api.currentAuthSessionEpoch()
        val requestCountBefore = server.requestCount
        api.setAuthToken("replacement-token")
        val operations = listOf<suspend () -> Unit>(
            {
                api.createPatientWithReceipt(
                    patientCode = "",
                    name = "Dependent",
                    dateOfBirth = "2016-01-02",
                    gender = "female",
                    phone = "",
                    notes = "",
                    bloodType = "unknown",
                    allergies = emptyList(),
                    emergencyContact = EmergencyContact(),
                    profileType = "dependent",
                    relationship = "Child",
                    idempotencyKey = "stale-create",
                    expectedUserId = "user_1",
                    expectedWorkspaceId = "workspace_1",
                    expectedAuthSessionId = AUTH_SESSION_ID,
                    expectedAuthSessionEpoch = staleEpoch,
                )
                Unit
            },
            {
                api.updatePatientWithReceipt(
                    patientId = "dependent_1",
                    name = "Updated",
                    dateOfBirth = null,
                    gender = null,
                    phone = null,
                    notes = null,
                    bloodType = null,
                    allergies = null,
                    emergencyContact = null,
                    relationship = null,
                    idempotencyKey = "stale-update",
                    expectedUserId = "user_1",
                    expectedWorkspaceId = "workspace_1",
                    expectedAuthSessionId = AUTH_SESSION_ID,
                    expectedAuthSessionEpoch = staleEpoch,
                )
                Unit
            },
            {
                api.deletePatientWithReceipt(
                    patientId = "dependent_1",
                    idempotencyKey = "stale-delete",
                    expectedUserId = "user_1",
                    expectedWorkspaceId = "workspace_1",
                    expectedAuthSessionId = AUTH_SESSION_ID,
                    expectedAuthSessionEpoch = staleEpoch,
                )
                Unit
            },
        )

        operations.forEach { operation ->
            val error = runCatching { operation() }.exceptionOrNull() as SmartHealthApiException
            assertEquals("AUTH_SESSION_REPLACED", error.code)
        }
        assertEquals(requestCountBefore, server.requestCount)
    }

    @Test
    fun `post commit create update and delete quarantine replacement account and replay for original authority`() =
        runBlocking {
            PatientMutationIntent.entries.forEach { intent ->
                assertPostCommitReplacementReconciles(intent)
            }
        }

    private suspend fun assertPostCommitReplacementReconciles(intent: PatientMutationIntent) = coroutineScope {
        val idempotencyKey = "late-${intent.wireValue}"
        server.enqueue(
            jsonResponse(canonicalMutationResponse(intent = intent.wireValue).forIntent(intent).toString())
                .setBodyDelay(150, TimeUnit.MILLISECONDS),
        )
        val capturedEpoch = api.currentAuthSessionEpoch()
        val mutation = async(Dispatchers.IO) {
            runCatching { executeFamilyMutation(intent, idempotencyKey, capturedEpoch) }
        }
        val firstRequest = checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        assertEquals(idempotencyKey, firstRequest.getHeader("Idempotency-Key"))
        assertAuthorityHeaders(firstRequest)
        api.setAuthToken("replacement-token-${intent.wireValue}")

        val postDispatchError = mutation.await().exceptionOrNull() as SmartHealthApiException
        assertEquals("PATIENT_MUTATION_RECONCILIATION_REQUIRED", postDispatchError.code)
        assertEquals("post_dispatch", postDispatchError.details["patientMutationStage"])
        assertEquals("unknown", postDispatchError.details["mutationDisposition"])

        server.enqueue(
            jsonResponse(
                firebaseAuthResponse(
                    userId = "user_replacement",
                    workspaceId = "workspace_replacement",
                    authSessionId = "auth-session-replacement",
                ),
            ),
        )
        api.authenticateFirebase(
            idToken = "replacement-token-${intent.wireValue}",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )
        server.takeRequest()
        val requestCountBeforeForeignReplay = server.requestCount
        val foreignReplayError = runCatching {
            executeFamilyMutation(intent, idempotencyKey, api.currentAuthSessionEpoch())
        }.exceptionOrNull() as SmartHealthApiException
        assertEquals("PATIENT_MUTATION_AUTHORITY_MISMATCH", foreignReplayError.code)
        assertEquals(requestCountBeforeForeignReplay, server.requestCount)

        api.setAuthToken("primary-token")
        server.enqueue(jsonResponse(FIREBASE_AUTH_RESPONSE))
        api.authenticateFirebase(
            idToken = "primary-token",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )
        server.takeRequest()

        server.enqueue(
            jsonResponse(
                canonicalMutationResponse(intent = intent.wireValue, replayed = true)
                    .forIntent(intent)
                    .toString(),
            ),
        )
        val replay = executeFamilyMutation(intent, idempotencyKey, api.currentAuthSessionEpoch())
        val replayRequest = server.takeRequest()
        assertEquals(idempotencyKey, replayRequest.getHeader("Idempotency-Key"))
        assertAuthorityHeaders(replayRequest)
        assertTrue(replay.replayed)
        assertEquals(intent, replay.intent)
    }

    private suspend fun executeFamilyMutation(
        intent: PatientMutationIntent,
        idempotencyKey: String,
        expectedAuthSessionEpoch: Long,
    ): PatientMutationReceipt = when (intent) {
        PatientMutationIntent.Create -> api.createPatientWithReceipt(
            patientCode = "",
            name = "Dependent",
            dateOfBirth = "2016-01-02",
            gender = "female",
            phone = "",
            notes = "",
            bloodType = "unknown",
            allergies = emptyList(),
            emergencyContact = EmergencyContact(),
            profileType = "dependent",
            relationship = "Child",
            idempotencyKey = idempotencyKey,
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
            expectedAuthSessionId = AUTH_SESSION_ID,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        PatientMutationIntent.Update -> api.updatePatientWithReceipt(
            patientId = "dependent_1",
            name = "Updated dependent",
            dateOfBirth = null,
            gender = null,
            phone = null,
            notes = null,
            bloodType = null,
            allergies = null,
            emergencyContact = null,
            relationship = null,
            idempotencyKey = idempotencyKey,
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
            expectedAuthSessionId = AUTH_SESSION_ID,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        PatientMutationIntent.Delete -> api.deletePatientWithReceipt(
            patientId = "dependent_1",
            idempotencyKey = idempotencyKey,
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
            expectedAuthSessionId = AUTH_SESSION_ID,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
    }

    private fun assertAuthorityHeaders(request: okhttp3.mockwebserver.RecordedRequest) {
        assertEquals("user_1", request.getHeader("X-Shcare-Expected-User-Id"))
        assertEquals("workspace_1", request.getHeader("X-Shcare-Expected-Workspace-Id"))
        assertEquals(AUTH_SESSION_ID, request.getHeader("X-Shcare-Expected-Auth-Session-Id"))
    }

    private fun canonicalMutationResponse(
        intent: String,
        userId: String = "user_1",
        workspaceId: String = "workspace_1",
        patientId: String = "dependent_1",
        includePatient: Boolean = true,
        replayed: Boolean = false,
    ): JSONObject = JSONObject()
        .put("userId", userId)
        .put("workspaceId", workspaceId)
        .put("patientId", patientId)
        .put("intent", intent)
        .put("replayed", replayed)
        .apply {
            if (includePatient) {
                put(
                    "patient",
                    JSONObject(PATIENT_RESPONSE).getJSONObject("patient")
                        .put("id", patientId)
                        .put("organizationId", workspaceId),
                )
            }
        }

    private fun JSONObject.forIntent(intent: PatientMutationIntent): JSONObject = apply {
        if (intent == PatientMutationIntent.Delete) {
            remove("patient")
            put("deleted", true)
        }
    }

    private fun firebaseAuthResponse(
        userId: String,
        workspaceId: String,
        authSessionId: String,
    ): String = JSONObject()
        .put("session", JSONObject().put("id", authSessionId))
        .put(
            "user",
            JSONObject()
                .put("id", userId)
                .put("firebaseUid", "firebase-$userId")
                .put("email", "$userId@example.com")
                .put("verifiedEmail", true)
                .put("accountStatus", "active")
                .put("deletedAt", JSONObject.NULL)
                .put("role", "patient")
                .put("currentWorkspaceId", workspaceId),
        )
        .toString()

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())

    companion object {
        private const val AUTH_SESSION_ID = "auth-session-family"
        private const val FIREBASE_AUTH_RESPONSE = """
            {
              "session": { "id": "auth-session-family" },
              "user": {
                "id": "user_1",
                "firebaseUid": "firebase-user-1",
                "email": "patient@example.com",
                "verifiedEmail": true,
                "accountStatus": "active",
                "deletedAt": null,
                "role": "patient",
                "currentWorkspaceId": "workspace_1"
              }
            }
        """
        private const val PATIENT_RESPONSE = """
            {
              "patient": {
                "id": "dependent_1",
                "patientCode": "P002",
                "name": "Bé An",
                "dateOfBirth": "2016-01-02",
                "gender": "female",
                "phone": "0901000000",
                "bloodType": "O+",
                "allergies": ["Phấn hoa", "Hải sản"],
                "emergencyContact": {
                  "name": "Nguyễn An",
                  "phone": "0902000000",
                  "relationship": "Mẹ"
                },
                "profileType": "dependent",
                "relationship": "Con",
                "ownerUserId": "user_1"
              }
            }
        """
    }
}
