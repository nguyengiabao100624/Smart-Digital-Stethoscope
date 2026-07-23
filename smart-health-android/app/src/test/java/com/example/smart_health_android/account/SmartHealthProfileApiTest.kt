package com.example.smart_health_android.account

import com.example.smart_health_android.data.SmartHealthApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test

class SmartHealthProfileApiTest {
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
    fun `profile update carries idempotency key without contact fields`() = runBlocking {
        server.enqueue(jsonResponse(USER_RESPONSE))

        api.updateMe(
            JSONObject()
                .put("name", "Bác sĩ An")
                .put("address", "Địa chỉ mới"),
            idempotencyKey = "profile_key",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/me", request.path)
        assertEquals("profile_key", request.getHeader("Idempotency-Key"))
        assertFalse(body.has("phone"))
        assertFalse(body.has("email"))
    }

    @Test
    fun `avatar upload carries filename auth and idempotency headers`() = runBlocking {
        server.enqueue(jsonResponse(USER_WITH_AVATAR_RESPONSE))

        api.uploadMyAvatar(
            fileName = "avatar.png",
            contentType = "image/png",
            bytes = byteArrayOf(1, 2, 3),
            idempotencyKey = "avatar_upload_key",
        )

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/me/avatar", request.path)
        assertEquals("avatar.png", request.getHeader("X-File-Name"))
        assertEquals("avatar_upload_key", request.getHeader("Idempotency-Key"))
        assertEquals("Bearer primary-token", request.getHeader("Authorization"))
        assertEquals("image/png", request.getHeader("Content-Type"))
    }

    @Test
    fun `avatar delete carries idempotency key`() = runBlocking {
        server.enqueue(jsonResponse(USER_RESPONSE))

        api.deleteMyAvatar("avatar_delete_key")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/me/avatar", request.path)
        assertEquals("avatar_delete_key", request.getHeader("Idempotency-Key"))
    }

    @Test
    fun `workspace switch carries idempotency key and parses confirmed workspace`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                    {
                      "user": {
                        "id": "user_1",
                        "role": "doctor",
                        "organizationId": "workspace_2",
                        "currentWorkspaceId": "workspace_2"
                      }
                    }
                """
            )
        )

        val user = api.switchWorkspace("workspace_2", "workspace_switch_key")

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/v1/me", request.path)
        assertEquals("workspace_switch_key", request.getHeader("Idempotency-Key"))
        assertEquals("workspace_2", JSONObject(request.body.readUtf8()).getString("organizationId"))
        assertEquals("workspace_2", user.currentWorkspaceId)
    }

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())

    companion object {
        private const val USER_RESPONSE = """
            {
              "user": {
                "id": "user_1",
                "role": "doctor",
                "name": "Bác sĩ An",
                "address": "Địa chỉ mới"
              }
            }
        """
        private const val USER_WITH_AVATAR_RESPONSE = """
            {
              "user": {
                "id": "user_1",
                "role": "doctor",
                "name": "Bác sĩ An",
                "avatarFileId": "avatar_new",
                "avatarUrl": "/api/v1/me/avatar"
              }
            }
        """
    }
}
