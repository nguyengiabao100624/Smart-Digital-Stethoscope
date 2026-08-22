package com.example.smart_health_android.notifications

import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class SmartHealthNotificationDeviceApiTest {
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
    fun `registration declares privacy gated notification protocol and app version`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "device": {
                        "id": "notification-device-1",
                        "userId": "user-1",
                        "workspaceId": "workspace-1",
                        "fcmToken": "fcm-token-1",
                        "authSessionId": "auth-session-1",
                        "notificationProtocolVersion": 2,
                        "appVersion": "1.0.0-rc.2",
                        "enabled": true
                      }
                    }
                    """.trimIndent(),
                ),
        )

        val acknowledgement = api.registerNotificationDevice(
            fcmToken = "fcm-token-1",
            notificationProtocolVersion = 2,
            appVersion = "1.0.0-rc.2",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("/api/v1/notifications/register-device", request.path)
        assertEquals("Bearer primary-token", request.getHeader("Authorization"))
        assertEquals("fcm-token-1", body.getString("fcmToken"))
        assertEquals("android", body.getString("platform"))
        assertEquals(true, body.getBoolean("enabled"))
        assertEquals(2, body.getInt("notificationProtocolVersion"))
        assertEquals("1.0.0-rc.2", body.getString("appVersion"))
        assertFalse("The backend must derive the binding from the bearer session", body.has("authSessionId"))
        assertEquals("notification-device-1", acknowledgement.id)
        assertEquals("user-1", acknowledgement.userId)
        assertEquals("workspace-1", acknowledgement.workspaceId)
        assertEquals("fcm-token-1", acknowledgement.fcmToken)
        assertEquals("auth-session-1", acknowledgement.authSessionId)
        assertEquals(2, acknowledgement.notificationProtocolVersion)
        assertEquals("1.0.0-rc.2", acknowledgement.appVersion)
        assertEquals(true, acknowledgement.enabled)
    }

    @Test
    fun `Firebase authentication binds backend session id and bearer replacement clears it`() =
        runBlocking {
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody(
                        """
                        {
                          "session": {
                            "id": "auth-session-a"
                          },
                          "user": {
                            "id": "user-a",
                            "firebaseUid": "firebase-user-a",
                            "email": "patient@example.com",
                            "verifiedEmail": true,
                            "accountStatus": "active",
                            "deletedAt": null,
                            "role": "patient",
                            "currentWorkspaceId": "workspace-a"
                          }
                        }
                        """.trimIndent(),
                    ),
            )

            api.authenticateFirebase(
                idToken = "firebase-token-a",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )

            assertEquals("auth-session-a", api.currentAuthSessionId())
            assertEquals("firebase-token-a", api.currentAuthToken())

            api.setAuthToken("firebase-token-b")
            assertNull(api.currentAuthSessionId())

            api.setAuthToken(null)
            assertNull(api.currentAuthSessionId())
            assertNull(api.currentAuthToken())
        }

    @Test
    fun `registration acknowledgement accepts compatibility protocol alias`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "device": {
                        "id": "notification-device-2",
                        "userId": "user-2",
                        "organizationId": "workspace-2",
                        "fcmToken": "fcm-token-2",
                        "authSessionId": "auth-session-2",
                        "protocolVersion": 2,
                        "appVersion": "1.0.0-rc.2",
                        "enabled": true
                      }
                    }
                    """.trimIndent(),
                ),
        )

        val acknowledgement = api.registerNotificationDevice(
            fcmToken = "fcm-token-2",
            notificationProtocolVersion = 2,
            appVersion = "1.0.0-rc.2",
        )

        assertEquals(2, acknowledgement.notificationProtocolVersion)
        assertEquals("workspace-2", acknowledgement.workspaceId)
        assertEquals(
            true,
            acknowledgement.confirmsPrivacyGatedDelivery(
                minimumProtocolVersion = 2,
                expectedUserId = "user-2",
                expectedWorkspaceId = "workspace-2",
                expectedFcmToken = "fcm-token-2",
                expectedAuthSessionId = "auth-session-2",
                expectedAppVersion = "1.0.0-rc.2",
            ),
        )
    }

    @Test
    fun `protocol v2 acknowledgement without an auth session binding fails closed`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "application/json")
                .setBody(
                    """
                    {
                      "device": {
                        "id": "notification-device-unbound",
                        "userId": "user-3",
                        "workspaceId": "workspace-3",
                        "fcmToken": "fcm-token-3",
                        "notificationProtocolVersion": 2,
                        "appVersion": "1.0.0-rc.2",
                        "enabled": true
                      }
                    }
                    """.trimIndent(),
                ),
        )

        try {
            api.registerNotificationDevice(
                fcmToken = "fcm-token-3",
                notificationProtocolVersion = 2,
                appVersion = "1.0.0-rc.2",
            )
            fail("Expected an acknowledgement without session ownership to fail closed")
        } catch (error: SmartHealthApiException) {
            assertEquals("NOTIFICATION_DEVICE_REGISTRATION_RESPONSE_INVALID", error.code)
        }
    }

    @Test
    fun `auth session binding parser rejects null non string and whitespace values`() = runBlocking {
        listOf("null", "123", "\"   \"").forEachIndexed { index, encodedAuthSessionId ->
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody(
                        """
                        {
                          "device": {
                            "id": "notification-device-invalid-$index",
                            "userId": "user-invalid",
                            "workspaceId": "workspace-invalid",
                            "fcmToken": "fcm-token-invalid",
                            "authSessionId": $encodedAuthSessionId,
                            "notificationProtocolVersion": 2,
                            "appVersion": "1.0.0-rc.2",
                            "enabled": true
                          }
                        }
                        """.trimIndent(),
                    ),
            )

            try {
                api.registerNotificationDevice(
                    fcmToken = "fcm-token-invalid",
                    notificationProtocolVersion = 2,
                    appVersion = "1.0.0-rc.2",
                )
                fail("Expected invalid authSessionId value $encodedAuthSessionId to fail closed")
            } catch (error: SmartHealthApiException) {
                assertEquals("NOTIFICATION_DEVICE_REGISTRATION_RESPONSE_INVALID", error.code)
            }
        }
    }

    @Test
    fun `registration acknowledgement rejects coercive security field types`() = runBlocking {
        val invalidFields = listOf(
            "id" to "123",
            "userId" to "123",
            "workspaceId" to "123",
            "fcmToken" to "123",
            "authSessionId" to "123",
            "notificationProtocolVersion" to "\"2\"",
            "appVersion" to "123",
            "enabled" to "\"true\"",
        )

        invalidFields.forEachIndexed { index, (field, encodedValue) ->
            val device = JSONObject()
                .put("id", "notification-device-$index")
                .put("userId", "user-$index")
                .put("workspaceId", "workspace-$index")
                .put("fcmToken", "fcm-token-$index")
                .put("authSessionId", "auth-session-$index")
                .put("notificationProtocolVersion", 2)
                .put("appVersion", "1.0.0-rc.2")
                .put("enabled", true)
                .put(field, JSONObject("{\"value\":$encodedValue}").get("value"))
            server.enqueue(
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody(JSONObject().put("device", device).toString()),
            )

            try {
                api.registerNotificationDevice(
                    fcmToken = "fcm-token-$index",
                    notificationProtocolVersion = 2,
                    appVersion = "1.0.0-rc.2",
                )
                fail("Expected $field with a coercive JSON type to fail closed")
            } catch (error: SmartHealthApiException) {
                assertEquals("NOTIFICATION_DEVICE_REGISTRATION_RESPONSE_INVALID", error.code)
            }
        }
    }
}
