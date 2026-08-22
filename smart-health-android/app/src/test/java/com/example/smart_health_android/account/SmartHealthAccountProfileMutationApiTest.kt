package com.example.smart_health_android.account

import com.example.smart_health_android.data.AccountProfileUpdateIntent
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
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
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class SmartHealthAccountProfileMutationApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("account-a-token")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun `profile mutation excludes workspace authority and accepts exact owner receipt`() =
        runBlocking {
            server.enqueue(jsonResponse(validReceipt()))

            val receipt = api.updateAccountProfile(profileIntent())

            val request = server.takeRequest()
            val body = JSONObject(request.body.readUtf8())
            assertEquals("PATCH", request.method)
            assertEquals("/api/v1/me", request.path)
            assertEquals("profile-update-key-0001", request.getHeader("Idempotency-Key"))
            assertEquals("Bearer account-a-token", request.getHeader("Authorization"))
            assertEquals(setOf("address"), body.keys().asSequence().toSet())
            assertFalse(body.has("organizationId"))
            assertFalse(body.has("workspaceId"))
            assertFalse(body.has("currentWorkspaceId"))
            assertEquals("user_1", receipt.userId)
            assertEquals(listOf("address"), receipt.changedFields)
            assertEquals("clinic_1", receipt.user.organizationId)
        }

    @Test
    fun `profile mutation rejects foreign malformed and changed field receipts`() = runBlocking {
        val invalidReceipts = listOf(
            validReceipt().put("userId", "foreign-user"),
            validReceipt().put("unexpected", true),
            validReceipt().apply {
                put("changedFields", org.json.JSONArray().put("hospital"))
            },
            validReceipt().apply {
                getJSONObject("user").put("organizationId", "foreign-workspace")
            },
            validReceipt().apply {
                getJSONObject("user").put("address", "Unconfirmed address")
            },
        )

        invalidReceipts.forEach { invalid ->
            server.enqueue(jsonResponse(invalid))
            try {
                api.updateAccountProfile(profileIntent())
                fail("Expected invalid profile receipt")
            } catch (error: SmartHealthApiException) {
                assertEquals("ACCOUNT_PROFILE_RESPONSE_INVALID", error.code)
            }
        }
    }

    @Test
    fun `late profile response cannot update a replacement account`() = runBlocking {
        server.enqueue(
            jsonResponse(validReceipt()).setBodyDelay(250, TimeUnit.MILLISECONDS),
        )
        val accountAEpoch = api.currentAuthSessionEpoch()

        val mutation = async(Dispatchers.IO) {
            runCatching {
                api.updateAccountProfile(
                    profileIntent(expectedAuthSessionEpoch = accountAEpoch),
                )
            }.exceptionOrNull()
        }
        val request = checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = mutation.await() as SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("Bearer account-a-token", request.getHeader("Authorization"))
        assertEquals("account-b-token", api.currentAuthToken())
    }

    private fun profileIntent(
        expectedAuthSessionEpoch: Long = api.currentAuthSessionEpoch(),
    ) = AccountProfileUpdateIntent(
        userId = "user_1",
        name = "Bac si An",
        expectedPhone = "0912345678",
        license = "CCHN-001",
        hospital = "Phong kham Shcare",
        department = "Tim mach",
        specialty = "Tim mach",
        address = "Dia chi moi",
        expectedOrganizationId = "clinic_1",
        expectedChangedFields = listOf("address"),
        idempotencyKey = "profile-update-key-0001",
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
    )

    private fun validReceipt() = JSONObject(
        """
            {
              "userId": "user_1",
              "intent": "profile_update",
              "changedFields": ["address"],
              "user": {
                "id": "user_1",
                "name": "Bac si An",
                "title": "",
                "phone": "0912345678",
                "license": "CCHN-001",
                "hospital": "Phong kham Shcare",
                "department": "Tim mach",
                "specialty": "Tim mach",
                "address": "Dia chi moi",
                "organizationId": "clinic_1",
                "updatedAt": "2026-08-09T10:00:00.000Z"
              },
              "replayed": false
            }
        """.trimIndent(),
    )

    private fun jsonResponse(body: JSONObject) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.toString())
}
