package com.example.smart_health_android.consent

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthConsentApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api").toString().trimEnd('/'))
        api.setAuthToken("firebase-id-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun listSharesUsesBackendAuthorityStatusRecipientAndAuditActorsVerbatim() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {"shares":[{
                  "id":"share-1",
                  "patientId":"patient-1",
                  "authorityType":"clinician_access_grant",
                  "status":"expired",
                  "recipient":{
                    "type":"doctor",
                    "id":"doctor-7",
                    "name":"Bác sĩ Minh",
                    "workspaceId":"workspace-1"
                  },
                  "grantedByActor":{"id":"patient-user","name":"Nguyễn An","role":"patient"},
                  "scope":"selected_scans",
                  "scanIds":["scan-1"],
                  "expiresAt":"2026-07-01T23:59:59.999Z",
                  "active":true,
                  "createdAt":"2026-06-01T08:00:00.000Z"
                }]}
                """.trimIndent()
            )
        )

        val share = api.listPatientShares("patient-1").single()

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/patients/patient-1/shares", request.requestUrl?.encodedPath)
        assertEquals("Bearer firebase-id-token", request.getHeader("Authorization"))
        assertEquals("clinician_access_grant", share.authorityType)
        assertEquals("expired", share.status)
        assertEquals("Bác sĩ Minh", share.recipient.name)
        assertEquals("patient-user", share.grantedByActor?.id)
        assertFalse(share.isActive)
    }

    @Test
    fun legacyActiveAndPrincipalFieldsNeverBecomeCanonicalLifecycleOrRecipient() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {"shares":[{
                  "id":"legacy-share",
                  "patientId":"patient-1",
                  "doctorUserId":"doctor-legacy",
                  "organizationId":"workspace-legacy",
                  "active":true,
                  "scope":"patient_profile"
                }]}
                """.trimIndent()
            )
        )

        val share = api.listPatientShares("patient-1").single()

        assertEquals("", share.status)
        assertEquals("", share.authorityType)
        assertEquals("", share.recipient.id)
        assertFalse(share.isActive)
        assertFalse(share.hasCanonicalAccessContract)
    }

    @Test
    fun createSendsStableIntentKeyButNeverLetsTheAppAssignAuthorityType() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {"share":{
                  "id":"share-server-9",
                  "patientId":"patient-1",
                  "authorityType":"administrative_assignment",
                  "status":"active",
                  "recipient":{"type":"workspace","id":"workspace-9","name":"Phòng khám 9","workspaceId":"workspace-9"},
                  "scope":"selected_scans",
                  "scanIds":["scan-2","scan-7"]
                }}
                """.trimIndent(),
                responseCode = 201,
            )
        )

        val share = api.sharePatientRecord(
            patientId = "patient-1",
            targetWorkspaceId = "workspace-9",
            scope = "selected_scans",
            scanIds = listOf("scan-2", "scan-7"),
            expiresAt = "2026-08-01T23:59:59.999Z",
            idempotencyKey = "stable-share-intent-9",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("POST", request.method)
        assertEquals("stable-share-intent-9", request.getHeader("Idempotency-Key"))
        assertEquals("workspace-9", body.getString("targetWorkspaceId"))
        assertEquals("selected_scans", body.getString("scope"))
        assertEquals(2, body.getJSONArray("scanIds").length())
        assertFalse(body.has("authorityType"))
        assertEquals("administrative_assignment", share.authorityType)
        assertEquals("share-server-9", share.id)
    }

    @Test
    fun revokeSendsStableIntentKeyAndReturnsOnlyBackendConfirmedLifecycle() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {"revoked":true,"share":{
                  "id":"share-1",
                  "patientId":"patient-1",
                  "authorityType":"patient_consent",
                  "status":"revoked",
                  "recipient":{"type":"doctor","id":"doctor-7","name":"Bác sĩ Minh","workspaceId":"workspace-1"},
                  "revokedAt":"2026-07-18T08:00:00.000Z",
                  "revokedByActor":{"id":"patient-user","name":"Nguyễn An","role":"patient"}
                }}
                """.trimIndent()
            )
        )

        val share = api.revokePatientShare(
            patientId = "patient-1",
            shareId = "share-1",
            idempotencyKey = "stable-revoke-intent-1",
        )

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/patients/patient-1/shares/share-1", request.requestUrl?.encodedPath)
        assertEquals("stable-revoke-intent-1", request.getHeader("Idempotency-Key"))
        assertEquals("revoked", share.status)
        assertEquals("Nguyễn An", share.revokedByActor?.name)
        assertFalse(share.isActive)
    }

    @Test
    fun mutationsRejectBlankIdempotencyKeysBeforeMakingANetworkRequest() = runBlocking {
        val grantFailure = runCatching {
            api.sharePatientRecord(
                patientId = "patient-1",
                targetDoctorUserId = "doctor-1",
                idempotencyKey = "",
            )
        }.exceptionOrNull()
        val revokeFailure = runCatching {
            api.revokePatientShare("patient-1", "share-1", "")
        }.exceptionOrNull()

        assertTrue(grantFailure is IllegalArgumentException)
        assertTrue(revokeFailure is IllegalArgumentException)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun mutationResponseMissingCanonicalFieldsIsRejectedInsteadOfCreatingSuccess() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {"share":{
                  "id":"incomplete-share",
                  "patientId":"patient-1",
                  "status":"active",
                  "recipient":{"type":"doctor","id":"doctor-1","name":"Bác sĩ Minh","workspaceId":"workspace-1"}
                }}
                """.trimIndent(),
                responseCode = 201,
            )
        )

        val failure = runCatching {
            api.sharePatientRecord(
                patientId = "patient-1",
                targetDoctorUserId = "doctor-1",
                idempotencyKey = "incomplete-contract-intent",
            )
        }.exceptionOrNull()

        assertTrue(failure is SmartHealthApiException)
        assertEquals("PATIENT_SHARE_CONTRACT_INVALID", (failure as SmartHealthApiException).code)
    }

    private fun jsonResponse(body: String, responseCode: Int = 200): MockResponse {
        return MockResponse()
            .setResponseCode(responseCode)
            .setHeader("Content-Type", "application/json")
            .setBody(body)
    }
}
