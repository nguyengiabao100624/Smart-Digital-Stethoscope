package com.example.smart_health_android.data

import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthAuthorityApiTest {
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
    fun `me keeps backend id firebase identity and membership lifecycle separate`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                {
                  "user": {
                    "id": "usr_internal_42",
                    "firebaseUid": "firebase_uid_42",
                    "accountStatus": "active",
                    "deletedAt": "",
                    "role": "doctor",
                    "currentWorkspaceId": "workspace_42",
                    "currentMembership": {
                      "id": "membership_42",
                      "workspaceId": "workspace_42",
                      "role": "doctor",
                      "status": "active",
                      "operational": true
                    },
                    "memberships": [{
                      "id": "membership_suspended",
                      "workspaceId": "workspace_old",
                      "role": "doctor",
                      "status": "suspended",
                      "operational": false,
                      "suspendedAt": "2026-07-26T12:00:00.000Z"
                    }],
                    "capabilities": ["workspace.dashboard.view"]
                  }
                }
                """,
            ),
        )

        val user = api.getMe()

        assertEquals("usr_internal_42", user.id)
        assertEquals("firebase_uid_42", user.firebaseUid)
        assertEquals("active", user.accountStatus)
        assertNull(user.deletedAt)
        assertTrue(user.currentMembership!!.operational)
        assertEquals("active", user.currentMembership!!.status)
        assertFalse(user.memberships.single().operational)
        assertEquals("suspended", user.memberships.single().status)
    }

    @Test
    fun `captured logout authority never clears replacement account after unregister wait`() =
        runBlocking {
            val authorityA = requireNotNull(
                api.currentAuthSessionAuthorityFor("primary-token"),
            )
            server.enqueue(
                jsonResponse("""{"unregistered":true}""")
                    .setBodyDelay(150, TimeUnit.MILLISECONDS),
            )
            val pendingUnregister = async(start = CoroutineStart.UNDISPATCHED) {
                api.unregisterNotificationDevice(
                    fcmToken = "fcm-a",
                    expectedAuthority = authorityA,
                )
            }
            val unregisterRequest = server.takeRequest(1, TimeUnit.SECONDS)
            assertEquals("Bearer primary-token", unregisterRequest?.getHeader("Authorization"))

            api.setAuthToken("replacement-token")
            assertTrue(pendingUnregister.await())
            assertEquals("replacement-token", api.currentAuthToken())

            server.enqueue(jsonResponse("""{"loggedOut":true}"""))
            assertTrue(api.logout(authorityA))
            val logoutRequest = server.takeRequest(1, TimeUnit.SECONDS)
            assertEquals("Bearer primary-token", logoutRequest?.getHeader("Authorization"))
            assertEquals("replacement-token", api.currentAuthToken())
        }

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())
}
