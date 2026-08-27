package com.example.smart_health_android.clinical

import com.example.smart_health_android.clinical.alerts.ApiClinicalAlertsRepository
import com.example.smart_health_android.clinical.alerts.ClinicalAlertAction
import com.example.smart_health_android.clinical.alerts.ClinicalAlertConfirmationException
import com.example.smart_health_android.clinical.patients.ApiClinicalPatientsRepository
import com.example.smart_health_android.clinical.patients.ClinicalPatientWorkspaceMismatchException
import com.example.smart_health_android.data.ClinicalAlert
import com.example.smart_health_android.data.ClinicalAlertStatus
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthClinicalApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("clinical-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `patient search parses the canonical workspace-bound list`() = runBlocking {
        server.enqueue(jsonResponse(patientListResponse()))

        val response = api.listClinicalPatients("Nguyễn An")

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/patients?q=Nguy%E1%BB%85n%20An", request.path)
        assertEquals("Bearer clinical-token", request.getHeader("Authorization"))
        assertEquals("workspace-1", response.workspaceId)
        assertEquals(1, response.patients.size)
        assertEquals("patient-1", response.patients.single().id)
        assertEquals(3, response.patients.single().scanCount)
    }

    @Test
    fun `dashboard status uses authenticated bounded clinical endpoint`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {
                  "workspaceId": "workspace-1",
                  "devicesCount": 4,
                  "devicesOnline": 2,
                  "recording": true,
                  "activeScanId": "scan-1",
                  "updatedAt": "2026-07-29T08:00:00.000Z"
                }
                """.trimIndent(),
            ),
        )

        val status = api.getStatus(expectedWorkspaceId = "workspace-1")

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/doctor/status", request.path)
        assertEquals("Bearer clinical-token", request.getHeader("Authorization"))
        assertEquals(2, status.espCount)
        assertEquals(true, status.recording)
        assertEquals("scan-1", status.activeScanId)
        assertEquals(0, status.listeners)
        assertEquals(0, status.udpPort)
    }

    @Test
    fun `dashboard status rejects a response owned by another workspace`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {
                  "workspaceId": "workspace-2",
                  "devicesCount": 1,
                  "devicesOnline": 1,
                  "recording": false,
                  "activeScanId": null,
                  "updatedAt": "2026-07-29T08:00:00.000Z"
                }
                """.trimIndent(),
            ),
        )

        val failure = runCatching {
            api.getStatus(expectedWorkspaceId = "workspace-1")
        }.exceptionOrNull()

        assertTrue(failure is SmartHealthApiException)
        assertEquals(
            "CLINICAL_DASHBOARD_WORKSPACE_MISMATCH",
            (failure as SmartHealthApiException).code,
        )
    }

    @Test
    fun `alert list sends a bounded status filter and parses versioned entries`() = runBlocking {
        server.enqueue(jsonResponse(alertListResponse()))

        val response = api.listClinicalAlerts(
            status = ClinicalAlertStatus.Open,
            limit = 50,
        )

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/portal/alerts?status=open&limit=50", request.path)
        assertEquals("workspace-1", response.workspaceId)
        assertEquals(ClinicalAlertStatus.Open, response.alerts.single().status)
        assertEquals(1, response.alerts.single().version)
    }

    @Test
    fun `acknowledge sends optimistic version and stable idempotency key`() = runBlocking {
        server.enqueue(
            jsonResponse(
                alertMutationResponse(
                    status = "acknowledged",
                    version = 2,
                    acknowledgementNote = "Đang kiểm tra",
                ),
            ),
        )

        val response = api.acknowledgeClinicalAlert(
            alertId = "alert-1",
            note = "Đang kiểm tra",
            expectedVersion = 1,
            idempotencyKey = "alert-ack-operation-1",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("POST", request.method)
        assertEquals("/api/v1/portal/alerts/alert-1/acknowledge", request.path)
        assertEquals("alert-ack-operation-1", request.getHeader("Idempotency-Key"))
        assertEquals(setOf("note", "expectedVersion"), body.keys().asSequence().toSet())
        assertEquals("Đang kiểm tra", body.getString("note"))
        assertEquals(1, body.getInt("expectedVersion"))
        assertEquals(ClinicalAlertStatus.Acknowledged, response.alert.status)
        assertEquals(2, response.alert.version)
    }

    @Test
    fun `resolve requires a note before making a request`() = runBlocking {
        val failure = runCatching {
            api.resolveClinicalAlert(
                alertId = "alert-1",
                note = "   ",
                expectedVersion = 2,
                idempotencyKey = "alert-resolve-operation-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `patient repository rejects a list bound to another workspace`() = runBlocking {
        server.enqueue(
            jsonResponse(
                patientListResponse().replace(
                    "\"workspaceId\": \"workspace-1\"",
                    "\"workspaceId\": \"workspace-2\"",
                ),
            ),
        )

        val failure = runCatching {
            ApiClinicalPatientsRepository(api).load(
                query = "",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is ClinicalPatientWorkspaceMismatchException)
    }

    @Test
    fun `alert repository rejects a transition with an unconfirmed version`() = runBlocking {
        server.enqueue(
            jsonResponse(
                alertMutationResponse(
                    status = "acknowledged",
                    version = 3,
                    acknowledgementNote = "Đang kiểm tra",
                ),
            ),
        )
        val original = ClinicalAlert(
            id = "alert-1",
            organizationId = "workspace-1",
            sourceType = "scan",
            sourceId = "scan-1",
            status = ClinicalAlertStatus.Open,
            severity = "warning",
            title = "Cần xem lại",
            message = "Lượt đo có nhiễu.",
            version = 1,
        )

        val failure = runCatching {
            ApiClinicalAlertsRepository(api).transition(
                alert = original,
                action = ClinicalAlertAction.Acknowledge,
                note = "Đang kiểm tra",
                idempotencyKey = "alert-ack-operation-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is ClinicalAlertConfirmationException)
    }

    private fun patientListResponse(): String = """
        {
          "workspaceId": "workspace-1",
          "patients": [
            {
              "id": "patient-1",
              "patientCode": "SHC-001",
              "name": "Nguyễn An",
              "age": 42,
              "dateOfBirth": "1984-02-15",
              "gender": "female",
              "phone": "0900000001",
              "notes": "",
              "bloodType": "A+",
              "allergies": [],
              "emergencyContact": {
                "name": "",
                "phone": "",
                "relationship": ""
              },
              "profileType": "workspace",
              "relationship": "",
              "ownerUserId": "",
              "scanCount": 3,
              "lastScanAt": "2026-07-28T08:30:00.000Z",
              "lastAiLabel": "Cần xem lại"
            }
          ]
        }
    """.trimIndent()

    private fun alertListResponse(): String = """
        {
          "workspaceId": "workspace-1",
          "alerts": [${alertJson(status = "open", version = 1)}]
        }
    """.trimIndent()

    private fun alertMutationResponse(
        status: String,
        version: Int,
        acknowledgementNote: String = "",
    ): String = """
        {
          "workspaceId": "workspace-1",
          "alert": ${alertJson(status, version, acknowledgementNote)}
        }
    """.trimIndent()

    private fun alertJson(
        status: String,
        version: Int,
        acknowledgementNote: String = "",
    ): String = """
        {
          "id": "alert-1",
          "organizationId": "workspace-1",
          "sourceType": "scan",
          "sourceId": "scan-1",
          "dedupeKey": "scan:scan-1",
          "occurrenceNumber": 1,
          "previousAlertId": "",
          "occurredAt": "2026-07-28T09:00:00.000Z",
          "status": "$status",
          "severity": "warning",
          "title": "Cần xem lại chất lượng tín hiệu",
          "message": "Lượt đo có nhiễu.",
          "patientId": "patient-1",
          "deviceId": "device-1",
          "scanId": "scan-1",
          "acknowledgedByUserId": "",
          "acknowledgedAt": "",
          "acknowledgementNote": "$acknowledgementNote",
          "resolvedByUserId": "",
          "resolvedAt": "",
          "resolutionNote": "",
          "version": $version,
          "metadata": {},
          "createdAt": "2026-07-28T09:00:00.000Z",
          "updatedAt": "2026-07-28T09:05:00.000Z"
        }
    """.trimIndent()

    private fun jsonResponse(body: String): MockResponse =
        MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody(body)
}
