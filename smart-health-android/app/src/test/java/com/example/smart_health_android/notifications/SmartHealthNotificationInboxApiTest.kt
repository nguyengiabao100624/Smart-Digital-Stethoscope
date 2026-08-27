package com.example.smart_health_android.notifications

import com.example.smart_health_android.data.SmartHealthApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthNotificationInboxApiTest {
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
    fun `GET parses canonical account and active-workspace inbox`() = runBlocking {
        server.enqueue(jsonResponse(inboxResponse()))

        val result = api.getNotificationInbox()

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/notifications/inbox", request.path)
        assertEquals("Bearer primary-token", request.getHeader("Authorization"))
        assertEquals("user-1", result.userId)
        assertEquals("workspace-1", result.workspaceId)
        assertEquals(1, result.notifications.size)
        assertEquals("notification-1", result.notifications.single().id)
        assertEquals("workspace-1", result.notifications.single().workspaceId)
        assertFalse(result.notifications.single().read)
    }

    @Test
    fun `POST read sends idempotency key and parses full confirmation receipt`() =
        runBlocking {
            server.enqueue(
                jsonResponse(
                    mutationResponse(
                        action = "read",
                        notificationRead = true,
                        affectedIds = listOf("notification-1"),
                    ),
                ),
            )

            val result = api.markNotificationInboxRead(
                id = "notification-1",
                idempotencyKey = "notification-read-key",
            )

            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals(
                "/api/v1/notifications/inbox/notification-1/read",
                request.path,
            )
            assertEquals(
                "notification-read-key",
                request.getHeader("Idempotency-Key"),
            )
            assertEquals(NotificationInboxAction.Read, result.action)
            assertEquals(true, result.notification?.read)
            assertEquals(listOf("notification-1"), result.affectedIds)
            assertEquals(true, result.notifications.single().read)
        }

    @Test
    fun `DELETE sends idempotency key and never accepts a bare boolean`() = runBlocking {
        server.enqueue(
            jsonResponse(
                mutationResponse(
                    action = "delete",
                    notificationRead = false,
                    deletedId = "notification-1",
                    affectedIds = listOf("notification-1"),
                    includeInSnapshot = false,
                ),
            ),
        )

        val result = api.deleteNotificationInboxItem(
            id = "notification-1",
            idempotencyKey = "notification-delete-key",
        )

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals(
            "/api/v1/notifications/inbox/notification-1",
            request.path,
        )
        assertEquals(
            "notification-delete-key",
            request.getHeader("Idempotency-Key"),
        )
        assertEquals(NotificationInboxAction.Delete, result.action)
        assertEquals("notification-1", result.deletedId)
        assertTrue(result.notifications.isEmpty())
    }

    @Test
    fun `repository rejects stale account workspace and alias mismatches`() = runBlocking {
        server.enqueue(
            jsonResponse(
                inboxResponse(
                    userId = "user-other",
                    workspaceId = "workspace-other",
                    organizationId = "workspace-third",
                ),
            ),
        )
        val repository = ApiNotificationInboxRepository(api)

        val failure = runCatching {
            repository.load(
                expectedUserId = "user-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is NotificationInboxOwnershipException)
    }

    @Test
    fun `repository rejects read receipt that does not confirm backend state`() =
        runBlocking {
            server.enqueue(
                jsonResponse(
                    mutationResponse(
                        action = "read",
                        notificationRead = false,
                        affectedIds = listOf("notification-1"),
                    ),
                ),
            )
            val repository = ApiNotificationInboxRepository(api)

            val failure = runCatching {
                repository.markRead(
                    notificationId = "notification-1",
                    idempotencyKey = "unconfirmed-read",
                    expectedUserId = "user-1",
                    expectedWorkspaceId = "workspace-1",
                )
            }.exceptionOrNull()

            assertTrue(failure is NotificationInboxConfirmationException)
        }

    private fun inboxResponse(
        userId: String = "user-1",
        workspaceId: String = "workspace-1",
        organizationId: String = workspaceId,
        read: Boolean = false,
    ): String = """
        {
          "userId": "$userId",
          "workspaceId": "$workspaceId",
          "notifications": [
            ${notificationJson(userId, workspaceId, organizationId, read)}
          ],
          "updatedAt": "2026-07-29T08:00:01.000Z"
        }
    """.trimIndent()

    private fun mutationResponse(
        action: String,
        notificationRead: Boolean,
        affectedIds: List<String>,
        deletedId: String? = null,
        includeInSnapshot: Boolean = true,
    ): String {
        val item = notificationJson(
            userId = "user-1",
            workspaceId = "workspace-1",
            organizationId = "workspace-1",
            read = notificationRead,
        )
        val snapshot = if (includeInSnapshot) item else ""
        val affected = affectedIds.joinToString(",") { "\"$it\"" }
        val deleted = deletedId?.let { "\"$it\"" } ?: "null"
        return """
            {
              "userId": "user-1",
              "workspaceId": "workspace-1",
              "action": "$action",
              "notification": $item,
              "notifications": [$snapshot],
              "affectedIds": [$affected],
              "deletedId": $deleted,
              "updatedAt": "2026-07-29T08:01:00.000Z",
              "replayed": false
            }
        """.trimIndent()
    }

    private fun notificationJson(
        userId: String,
        workspaceId: String,
        organizationId: String,
        read: Boolean,
    ): String {
        val readAt = if (read) "\"2026-07-29T08:01:00.000Z\"" else "null"
        return """
            {
              "id": "notification-1",
              "userId": "$userId",
              "workspaceId": "$workspaceId",
              "organizationId": "$organizationId",
              "type": "appointment_scheduled",
              "title": "Lịch hẹn mới",
              "message": "Một lịch hẹn đã được xác nhận.",
              "campaignId": "",
              "audienceType": "direct",
              "audienceRole": "doctor",
              "requestedChannels": ["in_app", "push"],
              "inAppStatus": "ready",
              "emailStatus": "skipped",
              "pushStatus": "sent",
              "read": $read,
              "readAt": $readAt,
              "createdAt": "2026-07-29T08:00:00.000Z",
              "updatedAt": "2026-07-29T08:01:00.000Z"
            }
        """.trimIndent()
    }

    private fun jsonResponse(body: String): MockResponse =
        MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody(body)
}
