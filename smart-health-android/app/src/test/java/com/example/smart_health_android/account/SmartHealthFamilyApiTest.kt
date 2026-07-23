package com.example.smart_health_android.account

import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.SmartHealthApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
    fun `dependent delete carries idempotency key`() = runBlocking {
        server.enqueue(jsonResponse("{}"))

        assertTrue(api.deletePatient("dependent_1", "delete_profile_key"))

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/patients/dependent_1", request.path)
        assertEquals("delete_profile_key", request.getHeader("Idempotency-Key"))
    }

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())

    companion object {
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
