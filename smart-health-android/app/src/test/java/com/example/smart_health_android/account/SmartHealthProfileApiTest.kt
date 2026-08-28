package com.example.smart_health_android.account

import com.example.smart_health_android.data.AuthResult
import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.security.DoctorApprovalBackend
import com.example.smart_health_android.security.DoctorApprovalFirebaseSession
import com.example.smart_health_android.security.DoctorApprovalIdentity
import com.example.smart_health_android.security.DoctorApprovalNeedsInfoRequest
import com.example.smart_health_android.security.DoctorApprovalOwnerEnvironment
import com.example.smart_health_android.security.DoctorApprovalOwnerGuard
import com.example.smart_health_android.security.DoctorApprovalPushRegistrar
import com.example.smart_health_android.security.ProductionDoctorApprovalRepository
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
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

    @Test
    fun `doctor role request carries the complete profile and parses confirmed lifecycle`() = runBlocking {
        server.enqueue(
            jsonResponse(
                """
                    {
                      "user": {
                        "id": "user_1",
                        "firebaseUid": "firebase_user_1",
                        "email": "doctor@example.com",
                        "verifiedEmail": true,
                        "accountStatus": "active",
                        "deletedAt": null,
                        "role": "patient",
                        "requestedRole": "doctor",
                        "roleRequestStatus": "pending",
                        "organizationId": "clinic_2",
                        "roleRequestOrganizationId": "clinic_2",
                        "name": "Bác sĩ An",
                        "phone": "0912345678",
                        "license": "CCHN-2026-001",
                        "hospital": "Phòng khám An Khang",
                        "department": "Tim mạch",
                        "registrationReason": "Theo dõi bệnh nhân từ xa",
                        "accountType": "doctor",
                        "workspaceType": "clinic"
                      },
                      "roleRequest": {
                        "requestedRole": "doctor",
                        "status": "pending",
                        "requestedAt": "2026-07-30T10:00:00.000Z"
                      },
                      "operationId": "role_operation_1",
                      "replayed": false
                    }
                """
            )
        )

        val user = api.requestRole(
            requestedRole = "doctor",
            name = "Bác sĩ An",
            phone = "0912345678",
            license = "CCHN-2026-001",
            hospital = "Phòng khám An Khang",
            department = "Tim mạch",
            organizationId = "clinic_2",
            reason = "Theo dõi bệnh nhân từ xa",
            accountType = "doctor",
            workspaceType = "clinic",
            idempotencyKey = "role-request-key-stable",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            expectedUserId = "user_1",
            expectedWorkspaceId = "clinic_2",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("POST", request.method)
        assertEquals("/api/v1/auth/role-request", request.path)
        assertEquals("Bearer primary-token", request.getHeader("Authorization"))
        assertEquals("role-request-key-stable", request.getHeader("Idempotency-Key"))
        assertEquals("doctor", body.getString("requestedRole"))
        assertEquals("Bác sĩ An", body.getString("name"))
        assertEquals("0912345678", body.getString("phone"))
        assertEquals("CCHN-2026-001", body.getString("license"))
        assertEquals("Phòng khám An Khang", body.getString("hospital"))
        assertEquals("Tim mạch", body.getString("department"))
        assertEquals("Tim mạch", body.getString("specialty"))
        assertEquals("clinic_2", body.getString("organizationId"))
        assertEquals("Theo dõi bệnh nhân từ xa", body.getString("reason"))
        assertEquals("doctor", body.getString("accountType"))
        assertEquals("clinic", body.getString("workspaceType"))
        assertEquals("user_1", body.getString("expectedUserId"))
        assertEquals("clinic_2", body.getString("expectedWorkspaceId"))
        assertEquals("user_1", user.id)
        assertEquals("doctor", user.requestedRole)
        assertEquals("pending", user.roleRequestStatus)
    }

    @Test
    fun `doctor role request omits optional owner preconditions for compatibility callers`() =
        runBlocking {
            server.enqueue(jsonResponse(validRoleRequestResponse().toString()))

            api.requestRole(
                requestedRole = "doctor",
                organizationId = "clinic_2",
                accountType = "doctor",
                workspaceType = "clinic",
                idempotencyKey = "compat-role-request-key",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )

            val body = JSONObject(server.takeRequest().body.readUtf8())
            assertFalse(body.has("expectedUserId"))
            assertFalse(body.has("expectedWorkspaceId"))
        }

    @Test
    fun `pending patient membership is parsed and accepted by doctor approval repository`() =
        runBlocking {
            val response = backendProjectedRoleRequestResponse(
                status = "pending",
                currentWorkspaceId = PERSONAL_WORKSPACE_ID,
                currentRole = "patient",
            )
            server.enqueue(jsonResponse(response.toString()))
            val owner = FirebaseOwnerBinding(
                firebaseUserId = "firebase_user_1",
                email = "doctor@example.com",
                sessionEpoch = 1L,
            )
            val environment = ApiBackedDoctorApprovalOwnerEnvironment(
                api = api,
                firebaseOwner = owner,
            )
            val repository = ProductionDoctorApprovalRepository(
                expectedFirebaseOwner = owner,
                ownerGuard = DoctorApprovalOwnerGuard(environment),
                firebaseSession = UnusedDoctorApprovalFirebaseSession,
                backend = ApiBackedDoctorApprovalBackend(api),
                pushRegistrar = NoOpDoctorApprovalPushRegistrar,
            )

            val user = repository.submitNeedsInfo(
                expectedIdentity = DoctorApprovalIdentity(
                    firebaseOwner = owner,
                    backendUserId = "user_1",
                    currentWorkspaceId = PERSONAL_WORKSPACE_ID,
                ),
                request = DoctorApprovalNeedsInfoRequest(
                    name = "Doctor An",
                    phone = "0912345678",
                    license = "CCHN-2026-001",
                    clinicName = "An Khang Clinic",
                    specialtyName = "Cardiology",
                    organizationId = "clinic_2",
                    reason = "Complete profile",
                    accountType = "doctor",
                    workspaceType = "clinic",
                ),
                idempotencyKey = "repository-parser-pipeline-key",
            )

            assertEquals("patient", user.role)
            assertEquals("patient", user.currentMembership?.role)
            assertEquals("pending", user.roleRequestStatus)
            assertEquals(PERSONAL_WORKSPACE_ID, user.organizationId)
            assertEquals("clinic_2", user.roleRequestOrganizationId)
            assertEquals(PERSONAL_WORKSPACE_ID, user.canonicalWorkspaceId())
        }

    @Test
    fun `role request mutation rejects needs info because only refresh can return that state`() =
        runBlocking {
            server.enqueue(
                jsonResponse(
                    backendProjectedRoleRequestResponse(
                        status = "needs_info",
                        currentWorkspaceId = PERSONAL_WORKSPACE_ID,
                        currentRole = "patient",
                    ).toString(),
                ),
            )

            try {
                api.requestRole(
                    requestedRole = "doctor",
                    organizationId = "clinic_2",
                    accountType = "doctor",
                    workspaceType = "clinic",
                    idempotencyKey = "needs-info-personal-authority-key",
                    expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                    expectedUserId = "user_1",
                    expectedWorkspaceId = PERSONAL_WORKSPACE_ID,
                )
                fail("Expected the mutation-only lifecycle contract to reject needs_info")
            } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
                assertEquals("ROLE_REQUEST_RESPONSE_INVALID", error.code)
            }
        }

    @Test
    fun `pending receipt rejects an arbitrary current workspace outside caller precondition`() =
        runBlocking {
            server.enqueue(
                jsonResponse(
                    backendProjectedRoleRequestResponse(
                        status = "pending",
                        currentWorkspaceId = "personal_foreign_user",
                        currentRole = "patient",
                    ).toString(),
                ),
            )

            try {
                api.requestRole(
                    requestedRole = "doctor",
                    organizationId = "clinic_2",
                    accountType = "doctor",
                    workspaceType = "clinic",
                    idempotencyKey = "foreign-personal-authority-key",
                    expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                    expectedUserId = "user_1",
                    expectedWorkspaceId = PERSONAL_WORKSPACE_ID,
                )
                fail("Expected arbitrary current workspace to be rejected")
            } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
                assertEquals("ROLE_REQUEST_RESPONSE_INVALID", error.code)
            }
        }

    @Test
    fun `role request rejects a lifecycle receipt that disagrees with the returned user`() = runBlocking {
        val response = validRoleRequestResponse()
        response.getJSONObject("roleRequest").put("status", "approved")
        server.enqueue(jsonResponse(response.toString()))

        try {
            api.requestRole(
                requestedRole = "doctor",
                organizationId = "clinic_2",
                accountType = "doctor",
                workspaceType = "clinic",
                idempotencyKey = "role-request-key-stable",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
            fail("Expected a rejected role-request receipt")
        } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
            assertEquals("ROLE_REQUEST_RESPONSE_INVALID", error.code)
        }
    }

    @Test
    fun `role request rejects missing operation identity`() = runBlocking {
        val response = validRoleRequestResponse().apply { remove("operationId") }
        server.enqueue(jsonResponse(response.toString()))

        assertRoleRequestContractRejected()
    }

    @Test
    fun `role request rejects non-boolean replay acknowledgement`() = runBlocking {
        val response = validRoleRequestResponse().put("replayed", "false")
        server.enqueue(jsonResponse(response.toString()))

        assertRoleRequestContractRejected()
    }

    @Test
    fun `role request rejects extra lifecycle receipt keys`() = runBlocking {
        val response = validRoleRequestResponse()
        response.getJSONObject("roleRequest").put("unexpected", true)
        server.enqueue(jsonResponse(response.toString()))

        assertRoleRequestContractRejected()
    }

    @Test
    fun `role request rejects extra top-level receipt keys`() = runBlocking {
        val response = validRoleRequestResponse().put("unexpected", true)
        server.enqueue(jsonResponse(response.toString()))

        assertRoleRequestContractRejected()
    }

    @Test
    fun `role request rejects non ISO lifecycle timestamp`() = runBlocking {
        val response = validRoleRequestResponse()
        response.getJSONObject("roleRequest").put("requestedAt", "0")
        server.enqueue(jsonResponse(response.toString()))

        assertRoleRequestContractRejected()
    }

    @Test
    fun `role request rejects user receipt without explicit account status`() = runBlocking {
        val response = validRoleRequestResponse()
        response.getJSONObject("user").remove("accountStatus")
        server.enqueue(jsonResponse(response.toString()))

        assertRoleRequestContractRejected()
    }

    @Test
    fun `role request rejects user receipt without explicit role`() = runBlocking {
        val response = validRoleRequestResponse()
        response.getJSONObject("user").remove("role")
        server.enqueue(jsonResponse(response.toString()))

        assertRoleRequestContractRejected()
    }

    @Test
    fun `firebase authentication rejects fail-open identity and lifecycle defaults`() = runBlocking {
        val invalidReceipts = listOf(
            validFirebaseAuthResponse().apply { getJSONObject("user").remove("role") },
            validFirebaseAuthResponse().apply { getJSONObject("user").remove("accountStatus") },
            validFirebaseAuthResponse().apply {
                getJSONObject("user").put("accountStatus", "locked")
            },
            validFirebaseAuthResponse().apply {
                getJSONObject("user").put("role", "unrecognized_authority")
            },
            validFirebaseAuthResponse().apply {
                getJSONObject("user").put(
                    "currentMembership",
                    JSONObject()
                        .put("id", "membership_1")
                        .put("userId", "user_1")
                        .put("workspaceId", "clinic_2")
                        .put("organizationId", "clinic_2")
                        .put("role", "unrecognized_authority")
                        .put("status", "active"),
                )
            },
        )

        invalidReceipts.forEach { response ->
            server.enqueue(jsonResponse(response.toString()))
            try {
                api.authenticateFirebase(
                    idToken = "firebase-token",
                    expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                )
                fail("Expected a rejected Firebase authentication receipt")
            } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
                assertEquals("FIREBASE_AUTH_RESPONSE_INVALID", error.code)
            }
        }
    }

    @Test
    fun `malformed Firebase receipt clears only the bearer adopted by that exchange`() =
        runBlocking {
            val malformed = validFirebaseAuthResponse().apply {
                getJSONObject("user").put("role", "unrecognized_authority")
            }
            server.enqueue(jsonResponse(malformed.toString()))

            try {
                api.authenticateFirebase(
                    idToken = "malformed-owner-token",
                    expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                )
                fail("Expected malformed Firebase receipt")
            } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
                assertEquals("FIREBASE_AUTH_RESPONSE_INVALID", error.code)
            }

            assertEquals(null, api.currentAuthToken())
        }

    @Test
    fun `malformed late Firebase receipt cannot clear a replacement bearer`() = runBlocking {
        val malformed = validFirebaseAuthResponse().apply {
            getJSONObject("user").put("role", "unrecognized_authority")
        }
        val accountAEpoch = api.currentAuthSessionEpoch()
        server.enqueue(
            jsonResponse(malformed.toString())
                .setBodyDelay(250, TimeUnit.MILLISECONDS),
        )

        val exchange = async(Dispatchers.IO) {
            runCatching {
                api.authenticateFirebase(
                    idToken = "account-a-malformed-token",
                    expectedAuthSessionEpoch = accountAEpoch,
                )
            }.exceptionOrNull()
        }
        checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
        api.setAuthToken("account-b-token")

        val error = exchange.await() as com.example.smart_health_android.data.SmartHealthApiException
        assertEquals("AUTH_SESSION_REPLACED", error.code)
        assertEquals("account-b-token", api.currentAuthToken())
    }

    @Test
    fun `role request rejects account workspace and tenant receipt mismatches`() = runBlocking {
        val invalidReceipts = listOf(
            validRoleRequestResponse().apply {
                getJSONObject("user").put("accountType", "patient")
            },
            validRoleRequestResponse().apply {
                getJSONObject("user").put("workspaceType", "personal")
            },
            validRoleRequestResponse().apply {
                getJSONObject("user").put("roleRequestOrganizationId", "foreign_clinic")
            },
            validRoleRequestResponse().apply {
                getJSONObject("user").put("currentWorkspaceId", "foreign_clinic")
            },
            validRoleRequestResponse().apply {
                getJSONObject("user").put(
                    "currentMembership",
                    workspaceMembership("foreign_clinic"),
                )
            },
        )

        invalidReceipts.forEach { response ->
            server.enqueue(jsonResponse(response.toString()))
            assertRoleRequestContractRejected(expectedWorkspaceId = "clinic_2")
        }
    }

    @Test
    fun `solo doctor role receipt accepts only an internally consistent dynamic workspace`() =
        runBlocking {
            val valid = validRoleRequestResponse().apply {
                getJSONObject("user")
                    .put("organizationId", PERSONAL_WORKSPACE_ID)
                    .put("roleRequestOrganizationId", "org_solo_user_1")
                    .put("currentWorkspaceId", PERSONAL_WORKSPACE_ID)
                    .put(
                        "currentMembership",
                        workspaceMembership(PERSONAL_WORKSPACE_ID, workspaceType = "personal"),
                    )
                    .put("accountType", "solo_doctor")
                    .put("workspaceType", "solo_practice")
            }
            server.enqueue(jsonResponse(valid.toString()))

            val user = api.requestRole(
                requestedRole = "doctor",
                accountType = "solo_doctor",
                workspaceType = "solo_practice",
                idempotencyKey = "solo-doctor-role-request",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )

            assertEquals(PERSONAL_WORKSPACE_ID, user.canonicalWorkspaceId())
            assertEquals("org_solo_user_1", user.roleRequestOrganizationId)
            val request = server.takeRequest()
            val requestBody = JSONObject(request.body.readUtf8())
            assertFalse(requestBody.has("organizationId"))

            val mismatched = validRoleRequestResponse().apply {
                getJSONObject("user")
                    .put("organizationId", PERSONAL_WORKSPACE_ID)
                    .put("roleRequestOrganizationId", "org_solo_user_1")
                    .put("currentWorkspaceId", PERSONAL_WORKSPACE_ID)
                    .put("currentMembership", workspaceMembership("foreign_solo_workspace"))
                    .put("accountType", "solo_doctor")
                    .put("workspaceType", "solo_practice")
            }
            server.enqueue(jsonResponse(mismatched.toString()))
            try {
                api.requestRole(
                    requestedRole = "doctor",
                    accountType = "solo_doctor",
                    workspaceType = "solo_practice",
                    idempotencyKey = "solo-doctor-role-request-2",
                    expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                )
                fail("Expected mismatched dynamic solo workspace to be rejected")
            } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
                assertEquals("ROLE_REQUEST_RESPONSE_INVALID", error.code)
            }
        }

    @Test
    fun `approved doctor receipt requires and accepts a clinical effective role`() = runBlocking {
        val response = backendProjectedRoleRequestResponse(
            status = "approved",
            currentWorkspaceId = "clinic_2",
            currentRole = "doctor",
        )
        server.enqueue(jsonResponse(response.toString()))

        val user = api.requestRole(
            requestedRole = "doctor",
            organizationId = "clinic_2",
            accountType = "doctor",
            workspaceType = "clinic",
            idempotencyKey = "approved-doctor-role-request",
            expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            expectedUserId = "user_1",
            expectedWorkspaceId = "clinic_2",
        )

        assertEquals("approved", user.roleRequestStatus)
        assertEquals("doctor", user.role)
        assertEquals("doctor", user.currentMembership?.role)
        assertEquals("clinic_2", user.canonicalWorkspaceId())
    }

    @Test
    fun `conditional authorization cleanup cannot clear a replacement account`() {
        api.setAuthToken("account-a-token")
        val accountA = requireNotNull(
            api.currentAuthSessionAuthorityFor("account-a-token"),
        )
        api.setAuthToken("account-b-token")

        assertFalse(api.clearAuthTokenIfCurrent(accountA))
        assertEquals("account-b-token", api.currentAuthToken())
    }

    @Test
    fun `stale Firebase exchange cannot overwrite a replacement account token`() = runBlocking {
        api.setAuthToken("account-a-token")
        val accountAEpoch = api.currentAuthSessionEpoch()
        api.setAuthToken("account-b-token")

        try {
            api.authenticateFirebase(
                idToken = "late-account-a-token",
                expectedAuthSessionEpoch = accountAEpoch,
            )
            fail("Expected stale Firebase exchange to be rejected")
        } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
            assertEquals("AUTH_SESSION_REPLACED", error.code)
        }

        assertEquals("account-b-token", api.currentAuthToken())
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `role request pins account A authorization while account B replaces the session`() =
        runBlocking {
            api.setAuthToken("account-a-token")
            val accountAEpoch = api.currentAuthSessionEpoch()
            server.enqueue(
                jsonResponse(validRoleRequestResponse().toString())
                    .setBodyDelay(250, TimeUnit.MILLISECONDS),
            )

            val mutation = async(Dispatchers.IO) {
                runCatching {
                    api.requestRole(
                        requestedRole = "doctor",
                        organizationId = "clinic_2",
                        accountType = "doctor",
                        workspaceType = "clinic",
                        idempotencyKey = "account-a-role-request",
                        expectedAuthSessionEpoch = accountAEpoch,
                    )
                }.exceptionOrNull()
            }
            val request = checkNotNull(server.takeRequest(1, TimeUnit.SECONDS))
            api.setAuthToken("account-b-token")

            val error = mutation.await() as com.example.smart_health_android.data.SmartHealthApiException
            assertEquals("AUTH_SESSION_REPLACED", error.code)
            assertEquals("Bearer account-a-token", request.getHeader("Authorization"))
            assertEquals("account-b-token", api.currentAuthToken())
        }

    @Test
    fun `role request requires a caller-owned stable idempotency key`() = runBlocking {
        try {
            api.requestRole(
                requestedRole = "doctor",
                organizationId = "clinic_2",
                accountType = "doctor",
                workspaceType = "clinic",
                idempotencyKey = "",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
            )
            fail("Expected an explicit Idempotency-Key")
        } catch (_: IllegalArgumentException) {
            assertEquals(0, server.requestCount)
        }
    }

    private suspend fun assertRoleRequestContractRejected(expectedWorkspaceId: String = "") {
        try {
            api.requestRole(
                requestedRole = "doctor",
                organizationId = "clinic_2",
                accountType = "doctor",
                workspaceType = "clinic",
                idempotencyKey = "role-request-key-stable",
                expectedAuthSessionEpoch = api.currentAuthSessionEpoch(),
                expectedUserId = if (expectedWorkspaceId.isEmpty()) "" else "user_1",
                expectedWorkspaceId = expectedWorkspaceId,
            )
            fail("Expected a rejected role-request contract")
        } catch (error: com.example.smart_health_android.data.SmartHealthApiException) {
            assertEquals("ROLE_REQUEST_RESPONSE_INVALID", error.code)
        }
    }

    private fun validRoleRequestResponse(): JSONObject {
        return JSONObject()
            .put(
                "user",
                JSONObject()
                    .put("id", "user_1")
                    .put("firebaseUid", "firebase_user_1")
                    .put("email", "doctor@example.com")
                    .put("verifiedEmail", true)
                    .put("accountStatus", "active")
                    .put("deletedAt", JSONObject.NULL)
                    .put("role", "patient")
                    .put("requestedRole", "doctor")
                    .put("roleRequestStatus", "pending")
                    .put("organizationId", "clinic_2")
                    .put("roleRequestOrganizationId", "clinic_2")
                    .put("currentWorkspaceId", "clinic_2")
                    .put("accountType", "doctor")
                    .put("workspaceType", "clinic"),
            )
            .put(
                "roleRequest",
                JSONObject()
                    .put("requestedRole", "doctor")
                    .put("status", "pending")
                    .put("requestedAt", "2026-07-30T10:00:00.000Z"),
            )
            .put("operationId", "role_operation_1")
            .put("replayed", false)
    }

    private fun backendProjectedRoleRequestResponse(
        status: String,
        currentWorkspaceId: String,
        currentRole: String,
    ): JSONObject {
        val workspaceType = if (currentWorkspaceId == "clinic_2") "clinic" else "personal"
        val membership = workspaceMembership(
            workspaceId = currentWorkspaceId,
            role = currentRole,
            workspaceType = workspaceType,
        )
        return validRoleRequestResponse().apply {
            getJSONObject("roleRequest").put("status", status)
            getJSONObject("user")
                .put("roleRequestStatus", status)
                .put("role", currentRole)
                .put("organizationId", currentWorkspaceId)
                .put("roleRequestOrganizationId", "clinic_2")
                .put("currentWorkspaceId", currentWorkspaceId)
                .put("currentMembership", membership)
                .put("memberships", JSONArray().put(membership))
                .put(
                    "currentWorkspace",
                    JSONObject()
                        .put("id", currentWorkspaceId)
                        .put("name", currentWorkspaceId)
                        .put("type", workspaceType)
                        .put("workspaceType", workspaceType),
                )
        }
    }

    private fun workspaceMembership(
        workspaceId: String,
        role: String = "patient",
        workspaceType: String = "clinic",
    ): JSONObject = JSONObject()
        .put("id", "membership_$workspaceId")
        .put("userId", "user_1")
        .put("workspaceId", workspaceId)
        .put("organizationId", workspaceId)
        .put("workspaceType", workspaceType)
        .put("role", role)
        .put("status", "active")
        .put("operational", true)

    private fun validFirebaseAuthResponse(): JSONObject {
        return JSONObject()
            .put(
                "user",
                JSONObject()
                    .put("id", "user_1")
                    .put("firebaseUid", "firebase_user_1")
                    .put("email", "doctor@example.com")
                    .put("verifiedEmail", true)
                    .put("accountStatus", "active")
                    .put("deletedAt", JSONObject.NULL)
                    .put("role", "doctor")
                    .put("organizationId", "clinic_2")
                    .put("accountType", "doctor")
                    .put("workspaceType", "clinic"),
            )
    }

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body.trimIndent())

    companion object {
        private const val PERSONAL_WORKSPACE_ID = "personal_user_1"
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
    }
}

private class ApiBackedDoctorApprovalOwnerEnvironment(
    private val api: SmartHealthApi,
    private val firebaseOwner: FirebaseOwnerBinding,
) : DoctorApprovalOwnerEnvironment {
    override fun currentFirebaseOwner(): FirebaseOwnerBinding = firebaseOwner

    override fun currentBackendEpoch(): Long = api.currentAuthSessionEpoch()

    override fun currentBackendAuthority(): AuthSessionAuthority? =
        api.currentAuthToken()?.let(api::currentAuthSessionAuthorityFor)

    override fun clearBackendAuthorityIfCurrent(
        expectedAuthority: AuthSessionAuthority,
    ): Boolean = api.clearAuthTokenIfCurrent(expectedAuthority)
}

private class ApiBackedDoctorApprovalBackend(
    private val api: SmartHealthApi,
) : DoctorApprovalBackend {
    override suspend fun listClinics(): List<ClinicOption> = api.listClinics()

    override suspend fun listSpecialties(): List<SpecialtyOption> = api.listSpecialties()

    override suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult = api.authenticateFirebase(
        idToken = idToken,
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
    )

    override suspend fun requestRole(
        expectedIdentity: DoctorApprovalIdentity,
        request: DoctorApprovalNeedsInfoRequest,
        idempotencyKey: String,
        expectedAuthSessionEpoch: Long,
    ): AuthUser = api.requestRole(
        requestedRole = "doctor",
        name = request.name,
        phone = request.phone,
        license = request.license,
        hospital = request.clinicName,
        department = request.specialtyName,
        organizationId = request.organizationId,
        reason = request.reason,
        accountType = request.accountType,
        workspaceType = request.workspaceType,
        idempotencyKey = idempotencyKey,
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        expectedUserId = expectedIdentity.backendUserId,
        expectedWorkspaceId = expectedIdentity.currentWorkspaceId,
    )
}

private object UnusedDoctorApprovalFirebaseSession : DoctorApprovalFirebaseSession {
    override suspend fun getFreshIdToken(expectedOwner: FirebaseOwnerBinding): String =
        error("Firebase refresh is not part of the submit pipeline under test")
}

private object NoOpDoctorApprovalPushRegistrar : DoctorApprovalPushRegistrar {
    override suspend fun register(backendUserId: String, workspaceId: String): Boolean = true
}
