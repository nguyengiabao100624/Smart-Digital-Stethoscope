package com.example.smart_health_android.patientdashboard

import com.example.smart_health_android.data.PatientDashboardSectionAvailability
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthPatientDashboardApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("patient-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `patient dashboard parses the exact active profile and device ownership envelope`() =
        runBlocking {
            server.enqueue(jsonResponse(dashboardResponse()))

            val snapshot = api.getPatientDashboard(
                expectedUserId = "patient-1",
                expectedWorkspaceId = "workspace-1",
            )

            val request = server.takeRequest()
            assertEquals("GET", request.method)
            assertEquals("/api/v1/patient/dashboard", request.path)
            assertEquals("Bearer patient-token", request.getHeader("Authorization"))
            assertEquals("patient-child", snapshot.activePatientId)
            assertEquals("Bé An", snapshot.patient.name)
            assertEquals("scan-1", snapshot.recentScans.single().id)
            assertEquals("workspace-1", snapshot.recentScans.single().organizationId)
            assertEquals(PatientDashboardSectionAvailability.Ready, snapshot.sections.scans)
            assertEquals(0, snapshot.device?.reportedBatteryPercent)
            assertEquals(-73, snapshot.device?.reportedSignalDbm)
            assertEquals("workspace-1", snapshot.device?.organizationId)
            assertEquals("patient-child", snapshot.device?.assignedPatientId)
        }

    @Test
    fun `patient dashboard keeps missing telemetry unknown instead of inventing defaults`() =
        runBlocking {
            server.enqueue(
                jsonResponse(
                    dashboardResponse()
                        .replace("\"battery\": 0,", "\"battery\": null,")
                        .replace("\"signal\": -73,", "\"signal\": null,"),
                ),
            )

            val snapshot = api.getPatientDashboard(
                expectedUserId = "patient-1",
                expectedWorkspaceId = "workspace-1",
            )

            assertNull(snapshot.device?.reportedBatteryPercent)
            assertNull(snapshot.device?.reportedSignalDbm)
        }

    @Test
    fun `patient dashboard rejects unsupported protocol and inconsistent section content`() =
        runBlocking {
            server.enqueue(
                jsonResponse(
                    dashboardResponse().replace(
                        "\"protocolVersion\": 1",
                        "\"protocolVersion\": 2",
                    ),
                ),
            )
            val protocolFailure = runCatching {
                api.getPatientDashboard(
                    expectedUserId = "patient-1",
                    expectedWorkspaceId = "workspace-1",
                )
            }.exceptionOrNull()

            assertTrue(protocolFailure is SmartHealthApiException)
            assertEquals(
                "PATIENT_DASHBOARD_CONTRACT_INVALID",
                (protocolFailure as SmartHealthApiException).code,
            )

            server.enqueue(
                jsonResponse(
                    dashboardResponse().replace(
                        "\"scans\": \"ready\"",
                        "\"scans\": \"unavailable\"",
                    ),
                ),
            )
            val sectionFailure = runCatching {
                api.getPatientDashboard(
                    expectedUserId = "patient-1",
                    expectedWorkspaceId = "workspace-1",
                )
            }.exceptionOrNull()

            assertTrue(sectionFailure is SmartHealthApiException)
            assertEquals(
                "PATIENT_DASHBOARD_CONTRACT_INVALID",
                (sectionFailure as SmartHealthApiException).code,
            )
        }

    @Test
    fun `patient dashboard rejects a workspace or active profile mismatch`() = runBlocking {
        server.enqueue(
            jsonResponse(
                dashboardResponse().replace(
                    "\"workspaceId\": \"workspace-1\"",
                    "\"workspaceId\": \"workspace-other\"",
                ),
            ),
        )

        val workspaceFailure = runCatching {
            api.getPatientDashboard(
                expectedUserId = "patient-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(workspaceFailure is SmartHealthApiException)
        assertEquals(
            "PATIENT_DASHBOARD_AUTHORITY_MISMATCH",
            (workspaceFailure as SmartHealthApiException).code,
        )

        server.enqueue(
            jsonResponse(
                dashboardResponse().replace(
                    "\"patientId\": \"patient-child\"",
                    "\"patientId\": \"patient-sibling\"",
                ),
            ),
        )
        val scanFailure = runCatching {
            api.getPatientDashboard(
                expectedUserId = "patient-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(scanFailure is SmartHealthApiException)
        assertEquals(
            "PATIENT_DASHBOARD_PROFILE_MISMATCH",
            (scanFailure as SmartHealthApiException).code,
        )
    }

    @Test
    fun `patient dashboard rejects foreign device identity`() = runBlocking {
        server.enqueue(
            jsonResponse(
                dashboardResponse().replaceJsonStringAfterAnchor(
                    anchor = "\"id\": \"device-1\"",
                    field = "ownerUserId",
                    expectedValue = "patient-1",
                    replacementValue = "patient-other",
                ),
            ),
        )

        val failure = runCatching {
            api.getPatientDashboard(
                expectedUserId = "patient-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is SmartHealthApiException)
        assertEquals(
            "PATIENT_DASHBOARD_DEVICE_MISMATCH",
            (failure as SmartHealthApiException).code,
        )
    }

    @Test
    fun `patient dashboard rejects a scan from another workspace`() = runBlocking {
        server.enqueue(
            jsonResponse(
                dashboardResponse().replaceJsonStringAfterAnchor(
                    anchor = "\"id\": \"scan-1\"",
                    field = "organizationId",
                    expectedValue = "workspace-1",
                    replacementValue = "workspace-other",
                ),
            ),
        )

        val failure = runCatching {
            api.getPatientDashboard(
                expectedUserId = "patient-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is SmartHealthApiException)
        assertEquals(
            "PATIENT_DASHBOARD_PROFILE_MISMATCH",
            (failure as SmartHealthApiException).code,
        )
    }

    @Test
    fun `patient dashboard rejects provider and clinical fields outside the closed DTO`() =
        runBlocking {
            server.enqueue(
                jsonResponse(
                    dashboardResponse().replaceFirst(
                        "\"mode\": \"heart\"",
                        "\"mode\": \"heart\",\n                \"aiSummary\": \"unreviewed diagnosis\"",
                    ),
                ),
            )

            val failure = runCatching {
                api.getPatientDashboard(
                    expectedUserId = "patient-1",
                    expectedWorkspaceId = "workspace-1",
                )
            }.exceptionOrNull()

            assertTrue(failure is SmartHealthApiException)
            assertEquals(
                "PATIENT_DASHBOARD_CONTRACT_INVALID",
                (failure as SmartHealthApiException).code,
            )
        }

    @Test
    fun `patient dashboard rejects coercible values that violate exact DTO types`() =
        runBlocking {
            val invalidPayloads = listOf(
                dashboardResponse().replaceFirst(
                    Regex("\"name\"\\s*:\\s*\"[^\"]*\""),
                    "\"name\": 123",
                ),
                dashboardResponse().replaceFirst(
                    "\"status\": \"completed\"",
                    "\"status\": false",
                ),
                dashboardResponse().replaceFirst(
                    "\"online\": true",
                    "\"online\": \"true\"",
                ),
                dashboardResponse().replaceFirst(
                    "\"battery\": 0",
                    "\"battery\": 1.5",
                ),
                dashboardResponse().replaceFirst(
                    "\"signal\": -73",
                    "\"signal\": -128",
                ),
            )

            invalidPayloads.forEach { payload ->
                server.enqueue(jsonResponse(payload))

                val failure = runCatching {
                    api.getPatientDashboard(
                        expectedUserId = "patient-1",
                        expectedWorkspaceId = "workspace-1",
                    )
                }.exceptionOrNull()

                assertTrue(failure is SmartHealthApiException)
                assertEquals(
                    "PATIENT_DASHBOARD_CONTRACT_INVALID",
                    (failure as SmartHealthApiException).code,
                )
            }
        }

    @Test
    fun `patient dashboard preserves an assigned guardian authority profile`() = runBlocking {
        server.enqueue(
            jsonResponse(
                dashboardResponse().replaceFirst(
                    "\"ownerUserId\": \"patient-1\",",
                    """
                    "ownerUserId": "patient-owner",
                    "guardianUserId": "patient-1",
                    """.trimIndent(),
                ),
            ),
        )

        val snapshot = api.getPatientDashboard(
            expectedUserId = "patient-1",
            expectedWorkspaceId = "workspace-1",
        )

        assertEquals("patient-owner", snapshot.patient.ownerUserId)
        assertEquals("patient-1", snapshot.patient.guardianUserId)
        assertEquals("workspace-1", snapshot.patient.organizationId)
    }

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .addHeader("Content-Type", "application/json")
        .setBody(body)

    private fun String.replaceJsonStringAfterAnchor(
        anchor: String,
        field: String,
        expectedValue: String,
        replacementValue: String,
    ): String {
        val anchorIndex = indexOf(anchor)
        check(anchorIndex >= 0) { "Missing JSON fixture anchor: $anchor" }

        val expectedField = "\"$field\": \"$expectedValue\""
        val fieldIndex = indexOf(expectedField, startIndex = anchorIndex + anchor.length)
        check(fieldIndex >= 0) {
            "Missing JSON fixture field $expectedField after anchor $anchor"
        }

        val valueStart = fieldIndex + expectedField.indexOf(expectedValue)
        return replaceRange(
            startIndex = valueStart,
            endIndex = valueStart + expectedValue.length,
            replacement = replacementValue,
        )
    }

    private fun dashboardResponse(): String = """
        {
          "dashboard": {
            "protocolVersion": 1,
            "generatedAt": "2026-07-29T12:00:00.000Z",
            "userId": "patient-1",
            "workspaceId": "workspace-1",
            "activePatientId": "patient-child",
            "patient": {
              "id": "patient-child",
              "patientCode": "SHC-CHILD",
              "name": "Bé An",
              "profileType": "dependent",
              "relationship": "child",
              "ownerUserId": "patient-1",
              "organizationId": "workspace-1"
            },
            "sections": {
              "scans": "ready",
              "device": "ready"
            },
            "recentScans": [
              {
                "id": "scan-1",
                "patientId": "patient-child",
                "organizationId": "workspace-1",
                "status": "completed",
                "mode": "heart"
              }
            ],
            "device": {
              "id": "device-1",
              "name": "Ống nghe tại nhà",
              "organizationId": "workspace-1",
              "ownerUserId": "patient-1",
              "assignedPatientId": "patient-child",
              "battery": 0,
              "signal": -73,
              "online": true
            }
          },
          "patient": {},
          "stats": {},
          "recentScans": []
        }
    """.trimIndent()
}
