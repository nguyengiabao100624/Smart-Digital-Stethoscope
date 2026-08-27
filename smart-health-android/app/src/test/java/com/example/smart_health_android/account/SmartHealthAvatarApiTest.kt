package com.example.smart_health_android.account

import com.example.smart_health_android.data.AvatarDeleteIntent
import com.example.smart_health_android.data.AvatarDownloadIntent
import com.example.smart_health_android.data.AvatarCleanupAction
import com.example.smart_health_android.data.AvatarCleanupStatus
import com.example.smart_health_android.data.AvatarUploadIntent
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
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class SmartHealthAvatarApiTest {
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
    fun `avatar upload sends exact bytes and accepts only the owner bound receipt`() = runBlocking {
        server.enqueue(jsonResponse(validUploadReceipt()))
        val intent = uploadIntent()

        val receipt = api.uploadMyAvatar(intent)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/me/avatar", request.path)
        assertEquals("profile.png", request.getHeader("X-File-Name"))
        assertEquals("avatar-upload-key-0001", request.getHeader("Idempotency-Key"))
        assertEquals("Bearer account-a-token", request.getHeader("Authorization"))
        assertEquals("image/png", request.getHeader("Content-Type"))
        assertArrayEquals(AVATAR_BYTES, request.body.readByteArray())
        assertEquals("user-avatar-owner", receipt.avatar.ownerUserId)
        assertEquals(AVATAR_SHA256, receipt.avatar.sha256)
        assertEquals("avatar_upload_operation_1", receipt.operationId)
    }

    @Test
    fun `avatar upload rejects foreign malformed and byte identity receipts`() = runBlocking {
        val invalidReceipts = listOf(
            validUploadReceipt().apply {
                getJSONObject("avatar").put("ownerUserId", "foreign-user")
            },
            validUploadReceipt().put("unexpected", true),
            validUploadReceipt().apply {
                getJSONObject("avatar").put("sha256", "0".repeat(64))
            },
            validUploadReceipt().apply {
                getJSONObject("avatar").put("byteSize", AVATAR_BYTES.size + 1)
            },
        )

        invalidReceipts.forEach { invalid ->
            server.enqueue(jsonResponse(invalid))
            try {
                api.uploadMyAvatar(uploadIntent())
                fail("Expected invalid upload receipt")
            } catch (error: SmartHealthApiException) {
                assertEquals("AVATAR_UPLOAD_RESPONSE_INVALID", error.code)
            }
        }
    }

    @Test
    fun `late avatar upload response cannot cross an account replacement`() = runBlocking {
        server.enqueue(
            jsonResponse(validUploadReceipt()).setBodyDelay(250, TimeUnit.MILLISECONDS),
        )
        val accountAEpoch = api.currentAuthSessionEpoch()

        val mutation = async(Dispatchers.IO) {
            runCatching {
                api.uploadMyAvatar(uploadIntent(expectedAuthSessionEpoch = accountAEpoch))
            }.exceptionOrNull()
        }
        val request = checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = mutation.await() as SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("Bearer account-a-token", request.getHeader("Authorization"))
        assertEquals("account-b-token", api.currentAuthToken())
    }

    @Test
    fun `avatar delete sends exact precondition and validates owner operation receipt`() = runBlocking {
        server.enqueue(jsonResponse(validDeleteReceipt()))
        val intent = deleteIntent()

        val receipt = api.deleteMyAvatar(intent)

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/me/avatar", request.path)
        assertEquals("avatar-delete-key-0001", request.getHeader("Idempotency-Key"))
        assertEquals(
            "file_avatar_3c6c37e77f5e7e046418d808e6510ee5",
            JSONObject(request.body.readUtf8()).getString("expectedAvatarFileId"),
        )
        assertEquals(intent.userId, receipt.avatar.ownerUserId)
        assertEquals(intent.expectedAvatarFileId, receipt.avatar.fileId)
        assertEquals(intent.expectedAvatarFileId, receipt.cleanup.previousFileId)
    }

    @Test
    fun `avatar delete rejects a foreign owner receipt`() = runBlocking {
        server.enqueue(
            jsonResponse(
                validDeleteReceipt().apply {
                    getJSONObject("avatar").put("ownerUserId", "foreign-user")
                },
            ),
        )

        try {
            api.deleteMyAvatar(deleteIntent())
            fail("Expected foreign delete receipt")
        } catch (error: SmartHealthApiException) {
            assertEquals("AVATAR_DELETE_RESPONSE_INVALID", error.code)
        }
    }

    @Test
    fun `avatar cleanup status is owner bound and exposes dead letter manual support`() = runBlocking {
        server.enqueue(
            jsonResponse(
                validCleanupStatus(),
            ),
        )

        val status = api.getMyAvatarCleanupStatus(
            expectedUserId = "user-avatar-owner",
            expectedWorkspaceId = "workspace-avatar-owner",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
        )

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/me/avatar/cleanup", request.path)
        assertEquals("Bearer account-a-token", request.getHeader("Authorization"))
        assertEquals(AvatarCleanupStatus.DeadLetter, status.status)
        assertEquals(AvatarCleanupAction.Delete, status.action)
        assertEquals(true, status.manualSupportRequired)

        server.enqueue(
            jsonResponse(validCleanupStatus().put("userId", "foreign-user")),
        )
        try {
            api.getMyAvatarCleanupStatus(
                expectedUserId = "user-avatar-owner",
                expectedWorkspaceId = "workspace-avatar-owner",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
            fail("Expected foreign cleanup status to fail closed")
        } catch (error: SmartHealthApiException) {
            assertEquals("AVATAR_CLEANUP_STATUS_INVALID", error.code)
        }

        server.enqueue(
            jsonResponse(validCleanupStatus().put("workspaceId", "foreign-workspace")),
        )
        try {
            api.getMyAvatarCleanupStatus(
                expectedUserId = "user-avatar-owner",
                expectedWorkspaceId = "workspace-avatar-owner",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
            fail("Expected foreign workspace cleanup status to fail closed")
        } catch (error: SmartHealthApiException) {
            assertEquals("AVATAR_CLEANUP_STATUS_INVALID", error.code)
        }
    }

    @Test
    fun `confirmed avatar download is pinned and hash verified`() = runBlocking {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setHeader("Content-Type", "image/png")
                .setBody(okio.Buffer().write(AVATAR_BYTES)),
        )

        val bytes = api.downloadMyAvatarBytes(
            AvatarDownloadIntent(
                userId = "user-avatar-owner",
                fileId = "file_avatar_3c6c37e77f5e7e046418d808e6510ee5",
                sha256 = AVATAR_SHA256,
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            ),
        )

        assertArrayEquals(AVATAR_BYTES, bytes)
        assertEquals("GET", server.takeRequest().method)
    }

    private fun uploadIntent(
        expectedAuthSessionEpoch: Long = api.currentAuthSessionEpoch(),
    ) = AvatarUploadIntent(
        userId = "user-avatar-owner",
        fileName = "profile.png",
        contentType = "image/png",
        bytes = AVATAR_BYTES,
        sha256 = AVATAR_SHA256,
        idempotencyKey = "avatar-upload-key-0001",
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
    )

    private fun deleteIntent() = AvatarDeleteIntent(
        userId = "user-avatar-owner",
        expectedAvatarFileId = "file_avatar_3c6c37e77f5e7e046418d808e6510ee5",
        idempotencyKey = "avatar-delete-key-0001",
        expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
    )

    private fun validUploadReceipt() = JSONObject(
        """
            {
              "avatar": {
                "fileId": "file_avatar_3c6c37e77f5e7e046418d808e6510ee5",
                "ownerUserId": "user-avatar-owner",
                "name": "profile.png",
                "contentType": "image/png",
                "byteSize": ${AVATAR_BYTES.size},
                "sha256": "$AVATAR_SHA256",
                "downloadUrl": "/api/v1/me/avatar",
                "uploadedAt": "2026-08-09T09:00:00.000Z"
              },
              "cleanup": {
                "status": "completed",
                "previousFileId": "file_avatar_previous"
              },
              "operationId": "avatar_upload_operation_1",
              "replayed": false
            }
        """.trimIndent(),
    )

    private fun validDeleteReceipt() = JSONObject(
        """
            {
              "deleted": true,
              "avatar": {
                "fileId": "file_avatar_3c6c37e77f5e7e046418d808e6510ee5",
                "ownerUserId": "user-avatar-owner",
                "deletedAt": "2026-08-09T09:05:00.000Z"
              },
              "cleanup": {
                "status": "pending",
                "previousFileId": "file_avatar_3c6c37e77f5e7e046418d808e6510ee5"
              },
              "operationId": "avatar_delete_operation_1",
              "replayed": false
            }
        """.trimIndent(),
    )

    private fun validCleanupStatus() = JSONObject(
        """
            {
              "userId": "user-avatar-owner",
              "workspaceId": "workspace-avatar-owner",
              "status": "dead_letter",
              "operationId": "avatar_delete_operation_1",
              "action": "delete",
              "previousFileId": "file_avatar_3c6c37e77f5e7e046418d808e6510ee5",
              "attempts": 8,
              "lastErrorCode": "PROVIDER_UNAVAILABLE",
              "updatedAt": "2026-08-09T09:10:00.000Z",
              "manualSupportRequired": true
            }
        """.trimIndent(),
    )

    private fun jsonResponse(body: JSONObject) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.toString())

    private companion object {
        val AVATAR_BYTES = byteArrayOf(1, 2, 3)
        const val AVATAR_SHA256 =
            "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81"
    }
}
