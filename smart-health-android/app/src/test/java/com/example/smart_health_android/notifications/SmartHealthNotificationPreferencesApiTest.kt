package com.example.smart_health_android.notifications

import com.example.smart_health_android.data.SmartHealthApi
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

class SmartHealthNotificationPreferencesApiTest {
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
    fun `GET parses canonical owner workspace preferences and channel truth`() = runBlocking {
        server.enqueue(jsonResponse(preferencesResponse()))

        val result = api.getNotificationPreferences()

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/me/notification-preferences", request.path)
        assertEquals("Bearer primary-token", request.getHeader("Authorization"))
        assertEquals("user-1", result.userId)
        assertEquals("workspace-1", result.workspaceId)
        assertEquals("self", result.ownership.kind)
        assertEquals("user-1", result.ownership.userId)
        assertEquals(true, result.preferences.enabled)
        assertEquals(false, result.preferences.aiUpdates)
        assertEquals("ready", result.channels.inApp.status)
        assertEquals("unavailable", result.channels.push.status)
        assertFalse(result.replayed)
    }

    @Test
    fun `PATCH sends one field and idempotency key then parses confirmed response`() = runBlocking {
        server.enqueue(
            jsonResponse(
                preferencesResponse(
                    appointments = false,
                    replayed = true,
                ),
            ),
        )

        val result = api.patchNotificationPreference(
            field = NotificationPreferenceField.Appointments,
            enabled = false,
            idempotencyKey = "notification-preference-op-1",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/me/notification-preferences", request.path)
        assertEquals("notification-preference-op-1", request.getHeader("Idempotency-Key"))
        assertEquals(
            setOf("key", "enabled"),
            body.keys().asSequence().toSet(),
        )
        assertEquals("appointments", body.getString("key"))
        assertEquals(false, body.getBoolean("enabled"))
        assertEquals(false, result.preferences.appointments)
        assertEquals(true, result.replayed)
    }

    @Test
    fun `repository rejects mismatched canonical owner and workspace`() = runBlocking {
        server.enqueue(
            jsonResponse(
                preferencesResponse(
                    userId = "user-other",
                    workspaceId = "workspace-other",
                ),
            ),
        )
        val repository = repository()

        val failure = runCatching {
            repository.load(
                expectedUserId = "user-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is NotificationPreferenceOwnershipException)
    }

    @Test
    fun `repository rejects PATCH response that does not confirm the exact field`() = runBlocking {
        server.enqueue(jsonResponse(preferencesResponse(appointments = true)))
        val repository = repository()

        val failure = runCatching {
            repository.patch(
                field = NotificationPreferenceField.Appointments,
                enabled = false,
                idempotencyKey = "operation-exact-field",
                expectedUserId = "user-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is NotificationPreferenceConfirmationException)
    }

    private fun preferencesResponse(
        appointments: Boolean = true,
        replayed: Boolean = false,
        userId: String = "user-1",
        workspaceId: String = "workspace-1",
    ): String = """
        {
          "userId": "$userId",
          "workspaceId": "$workspaceId",
          "ownership": {
            "kind": "self",
            "userId": "$userId"
          },
          "preferences": {
            "enabled": true,
            "doctorRequests": true,
            "abnormalResults": true,
            "deviceOffline": true,
            "appointments": $appointments,
            "messages": true,
            "aiUpdates": false,
            "newLogin": true
          },
          "channels": {
            "inApp": {
              "available": true,
              "status": "ready",
              "reasonCode": ""
            },
            "email": {
              "available": false,
              "status": "disabled",
              "reasonCode": "PROVIDER_DISABLED"
            },
            "push": {
              "available": false,
              "status": "unavailable",
              "reasonCode": "PROVIDER_UNAVAILABLE"
            }
          },
          "updatedAt": "2026-07-27T10:00:00.000Z",
          "replayed": $replayed
        }
    """.trimIndent()

    private fun jsonResponse(body: String): MockResponse =
        MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody(body)

    private fun repository(): ApiNotificationSettingsRepository =
        ApiNotificationSettingsRepository(
            api = api,
            runtimeState = object : NotificationRuntimeState {
                override fun readiness(
                    expectedUserId: String,
                    expectedWorkspaceId: String,
                ): NotificationRuntimeReadiness = NotificationRuntimeReadiness()
            },
        )
}
