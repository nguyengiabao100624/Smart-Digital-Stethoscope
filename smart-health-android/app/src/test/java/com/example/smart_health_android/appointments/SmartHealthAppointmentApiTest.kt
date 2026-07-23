package com.example.smart_health_android.appointments

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit
import kotlin.system.measureTimeMillis

class SmartHealthAppointmentApiTest {
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
    fun listAppointmentsUsesTheScopedBackendContractAndParsesNestedActors() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "appointments": [{
                        "id": "appt-1",
                        "organizationId": "workspace-1",
                        "patientId": "patient-1",
                        "doctorUserId": "doctor-1",
                        "type": "follow_up",
                        "status": "confirmed",
                        "startsAt": "2026-07-15T02:30:00.000Z",
                        "endsAt": "2026-07-15T03:00:00.000Z",
                        "reason": "Tái khám",
                        "patient": {"id":"patient-1","patientCode":"BN-01","name":"Nguyễn An"},
                        "doctor": {"id":"doctor-1","name":"Bác sĩ Minh","specialty":"Tim mạch"}
                      }]
                    }
                    """.trimIndent(),
                ),
        )

        val result = api.listAppointments(
            status = AppointmentStatus.Confirmed,
            from = "2026-07-15T00:00:00.000Z",
            to = "2026-07-16T00:00:00.000Z",
        )

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("Bearer firebase-id-token", request.getHeader("Authorization"))
        assertEquals("/api/appointments", request.requestUrl?.encodedPath)
        assertEquals("confirmed", request.requestUrl?.queryParameter("status"))
        assertEquals("2026-07-15T00:00:00.000Z", request.requestUrl?.queryParameter("from"))
        assertEquals("2026-07-16T00:00:00.000Z", request.requestUrl?.queryParameter("to"))
        assertEquals("appt-1", result.single().id)
        assertEquals(AppointmentType.FollowUp, result.single().type)
        assertEquals("Nguyễn An", result.single().patient?.name)
        assertEquals("Bác sĩ Minh", result.single().doctor?.name)
    }

    @Test
    fun createAppointmentSendsIdempotencyKeyAndReturnsOnlyBackendConfirmedData() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {"appointment":{
                      "id":"server-appt-9",
                      "patientId":"patient-1",
                      "type":"clinic_visit",
                      "status":"scheduled",
                      "startsAt":"2026-07-18T03:00:00.000Z",
                      "endsAt":"2026-07-18T03:30:00.000Z"
                    }}
                    """.trimIndent(),
                ),
        )

        val result = api.createAppointment(
            mutation = AppointmentMutation(
                patientId = "patient-1",
                type = AppointmentType.ClinicVisit,
                startsAt = "2026-07-18T03:00:00.000Z",
                endsAt = "2026-07-18T03:30:00.000Z",
                reason = "Tái khám",
            ),
            idempotencyKey = "appointment-create-9",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("POST", request.method)
        assertEquals("appointment-create-9", request.getHeader("Idempotency-Key"))
        assertEquals("patient-1", body.getString("patientId"))
        assertEquals("clinic_visit", body.getString("type"))
        assertEquals("server-appt-9", result.id)
        assertTrue(result.id != "appointment-create-9")
    }

    @Test
    fun updateAppointmentPatchesLifecycleFieldsWithAnIdempotencyKey() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {"appointment":{
                      "id":"appt-cancel-1",
                      "patientId":"patient-1",
                      "type":"clinic_visit",
                      "status":"cancelled",
                      "startsAt":"2026-07-18T03:00:00.000Z",
                      "endsAt":"2026-07-18T03:30:00.000Z",
                      "cancellationReason":"Không thể đến khám"
                    }}
                    """.trimIndent(),
                ),
        )

        val result = api.updateAppointment(
            appointmentId = "appt-cancel-1",
            patch = AppointmentPatch(
                status = AppointmentStatus.Cancelled,
                cancellationReason = "Không thể đến khám",
            ),
            idempotencyKey = "appointment-cancel-1",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("PATCH", request.method)
        assertEquals("/api/appointments/appt-cancel-1", request.requestUrl?.encodedPath)
        assertEquals("appointment-cancel-1", request.getHeader("Idempotency-Key"))
        assertEquals("cancelled", body.getString("status"))
        assertEquals("Không thể đến khám", body.getString("cancellationReason"))
        assertEquals(AppointmentStatus.Cancelled, result.status)
        assertEquals("Không thể đến khám", result.cancellationReason)
    }

    @Test
    fun repositoryUsesBackendRoleAndCapabilitiesInsteadOfInferringPermissionsLocally() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {"user":{
                      "id":"doctor-7",
                      "role":"doctor",
                      "capabilities":[
                        "workspace.appointments.view",
                        "workspace.appointments.manage"
                      ]
                    }}
                    """.trimIndent(),
                ),
        )

        val session = ApiAppointmentRepository(api).getSession()

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/me", request.requestUrl?.encodedPath)
        assertEquals(AppointmentActor.Doctor, session.actor)
        assertEquals("doctor-7", session.userId)
        assertEquals(
            setOf("workspace.appointments.view", "workspace.appointments.manage"),
            session.capabilities,
        )
    }

    @Test
    fun apiErrorsPreservePermissionAndRequestMetadataForNativeRecoveryStates() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(403)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "code":"FORBIDDEN",
                      "message":"Không có quyền xem lịch hẹn",
                      "requestId":"req-403",
                      "fieldErrors":{"patientId":"Ngoài phạm vi làm việc"}
                    }
                    """.trimIndent(),
                ),
        )

        try {
            api.listAppointments()
            fail("Expected SmartHealthApiException")
        } catch (error: SmartHealthApiException) {
            assertEquals(403, error.statusCode)
            assertEquals("FORBIDDEN", error.code)
            assertEquals("req-403", error.requestId)
            assertEquals("Ngoài phạm vi làm việc", error.fieldErrors["patientId"])
        }
    }

    @Test
    fun sharedRestClientHasFiniteLifecycleFriendlyTimeouts() {
        val client = SmartHealthApi.sharedClient

        assertTrue(client.connectTimeoutMillis in 1..30_000)
        assertTrue(client.readTimeoutMillis in 1..30_000)
        assertTrue(client.writeTimeoutMillis in 1..30_000)
        assertTrue(client.callTimeoutMillis in 1..60_000)
    }

    @Test
    fun cancellingTheCoroutineCancelsTheInFlightRestCall() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody("{\"appointments\":[]}")
                .setBodyDelay(5, TimeUnit.SECONDS),
        )
        val requestJob = launch { api.listAppointments() }
        delay(100)

        val cancellationMillis = measureTimeMillis {
            requestJob.cancelAndJoin()
        }

        assertTrue("Cancellation took ${cancellationMillis}ms", cancellationMillis < 2_000)
    }
}
