package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthResult
import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class DoctorApprovalRepositoryTest {
    @Test
    fun `refresh repins backend authority and accepts only the exact owner workspace and receipt`() =
        runTest {
            val authorityA = AuthSessionAuthority("bearer-a", 7L)
            val refreshedAuthorityA = AuthSessionAuthority("firebase-token-a", 8L)
            val environment = environment(authorityA)
            val backend = FakeDoctorApprovalBackend().apply {
                authenticateBlock = { _, expectedEpoch ->
                    assertEquals(7L, expectedEpoch)
                    environment.backendEpoch = refreshedAuthorityA.epoch
                    environment.backendAuthority = refreshedAuthorityA
                    AuthResult(
                        token = refreshedAuthorityA.bearerToken,
                        user = doctorUser(status = "pending"),
                        authority = refreshedAuthorityA,
                    )
                }
            }
            val push = FakeDoctorApprovalPushRegistrar()
            val repository = repository(environment, backend, push)

            val user = repository.refreshStatus(
                approvalIdentity(),
            )

            assertEquals("backend-a", user.id)
            assertEquals(listOf("backend-a" to "clinic-a"), push.registrations)
            assertEquals(refreshedAuthorityA, environment.backendAuthority)
        }

    @Test
    fun `replacement account or workspace suppresses stale refresh and push side effects`() =
        runTest {
            listOf("account", "workspace").forEach { race ->
                val authorityA = AuthSessionAuthority("bearer-a-$race", 7L)
                val refreshedAuthorityA = AuthSessionAuthority("firebase-token-a-$race", 8L)
                val environment = environment(authorityA)
                val backend = FakeDoctorApprovalBackend().apply {
                    authenticateBlock = { _, _ ->
                        environment.backendEpoch = refreshedAuthorityA.epoch
                        environment.backendAuthority = refreshedAuthorityA
                        if (race == "account") {
                            environment.firebaseOwner = owner("firebase-b", "doctor-b@shcare.vn", 2L)
                        }
                        AuthResult(
                            token = refreshedAuthorityA.bearerToken,
                            user = if (race == "workspace") {
                                doctorUser(status = "pending", workspaceId = "clinic-b")
                            } else {
                                doctorUser(status = "pending")
                            },
                            authority = refreshedAuthorityA,
                        )
                    }
                }
                val push = FakeDoctorApprovalPushRegistrar()
                val repository = repository(environment, backend, push)

                assertThrows(IllegalStateException::class.java) {
                    kotlinx.coroutines.runBlocking {
                        repository.refreshStatus(
                            approvalIdentity(),
                        )
                    }
                }

                assertTrue(push.registrations.isEmpty())
            }
        }

    @Test
    fun `needs info submit requires exact guarded receipt and preserves caller idempotency key`() =
        runTest {
            val authorityA = AuthSessionAuthority("bearer-a", 7L)
            val environment = environment(authorityA)
            val backend = FakeDoctorApprovalBackend().apply {
                requestBlock = { request, key, expectedEpoch ->
                    assertEquals("intent-key-stable", key)
                    assertEquals(7L, expectedEpoch)
                    assertEquals("clinic-a", request.organizationId)
                    doctorUser(status = "pending").copy(
                        requestedRole = "doctor",
                        name = request.name,
                    )
                }
            }
            val repository = repository(environment, backend)

            val result = repository.submitNeedsInfo(
                expectedIdentity = approvalIdentity(),
                request = needsInfoRequest(),
                idempotencyKey = "intent-key-stable",
            )

            assertEquals("Bác sĩ An", result.name)
            assertEquals(listOf("intent-key-stable"), backend.requestKeys)
        }

    @Test
    fun `stale account screen is rejected before any replacement account mutation`() = runTest {
        val authorityB = AuthSessionAuthority("bearer-b", 12L)
        val environment = FakeDoctorApprovalRepositoryEnvironment(
            firebaseOwner = owner("firebase-b", "doctor-b@shcare.vn", 2L),
            backendEpoch = authorityB.epoch,
            backendAuthority = authorityB,
        )
        val backend = FakeDoctorApprovalBackend().apply {
            requestBlock = { _, _, _ ->
                doctorUser(status = "pending", workspaceId = "clinic-b").copy(
                    id = "backend-b",
                    firebaseUid = "firebase-b",
                    email = "doctor-b@shcare.vn",
                )
            }
        }
        val repository = repository(environment, backend)

        assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking {
                repository.submitNeedsInfo(
                    expectedIdentity = approvalIdentity(),
                    request = needsInfoRequest(),
                    idempotencyKey = "intent-key-stable",
                )
            }
        }

        assertTrue(backend.requestKeys.isEmpty())
        assertEquals(authorityB, environment.backendAuthority)
    }

    @Test
    fun `route owner cannot rebind a replacement account or the same account at a new epoch`() =
        runTest {
            listOf(
                owner("firebase-b", "doctor-b@shcare.vn", 2L),
                routeOwner(sessionEpoch = 3L),
            ).forEachIndexed { index, currentOwner ->
                val replacementAuthority = AuthSessionAuthority("bearer-replacement-$index", 12L)
                val environment = FakeDoctorApprovalRepositoryEnvironment(
                    firebaseOwner = currentOwner,
                    backendEpoch = replacementAuthority.epoch,
                    backendAuthority = replacementAuthority,
                )
                val firebaseSession = FakeDoctorApprovalFirebaseSession(environment)
                val backend = FakeDoctorApprovalBackend()
                val repository = repository(
                    environment = environment,
                    backend = backend,
                    expectedFirebaseOwner = routeOwner(),
                    firebaseSession = firebaseSession,
                )

                assertThrows(IllegalStateException::class.java) {
                    kotlinx.coroutines.runBlocking {
                        repository.refreshStatus(expectedIdentity = null)
                    }
                }
                assertThrows(IllegalStateException::class.java) {
                    kotlinx.coroutines.runBlocking {
                        repository.submitNeedsInfo(
                            expectedIdentity = approvalIdentity(),
                            request = needsInfoRequest(),
                            idempotencyKey = "intent-key-route-$index",
                        )
                    }
                }

                assertTrue(firebaseSession.tokenRequests.isEmpty())
                assertTrue(backend.requestKeys.isEmpty())
                assertEquals(replacementAuthority, environment.backendAuthority)
            }
        }

    @Test
    fun `identity from a newer epoch is rejected before current route work begins`() = runTest {
        val authorityA = AuthSessionAuthority("bearer-a", 7L)
        val environment = environment(authorityA)
        val firebaseSession = FakeDoctorApprovalFirebaseSession(environment)
        val repository = repository(
            environment = environment,
            expectedFirebaseOwner = routeOwner(),
            firebaseSession = firebaseSession,
        )

        assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking {
                repository.refreshStatus(
                    approvalIdentity(firebaseOwner = routeOwner(sessionEpoch = 3L)),
                )
            }
        }

        assertTrue(firebaseSession.tokenRequests.isEmpty())
        assertEquals(authorityA, environment.backendAuthority)
    }

    @Test
    fun `malformed needs info receipt cannot replace current account or workspace state`() =
        runTest {
            listOf(
                doctorUser(status = "pending", workspaceId = "clinic-b"),
                doctorUser(status = "pending").copy(id = "backend-b"),
                doctorUser(status = "approved").copy(role = "patient"),
            ).forEach { malformedReceipt ->
                val authorityA = AuthSessionAuthority(
                    "bearer-${malformedReceipt.id}-${malformedReceipt.currentWorkspaceId}",
                    7L,
                )
                val environment = environment(authorityA)
                val backend = FakeDoctorApprovalBackend().apply {
                    requestBlock = { _, _, _ -> malformedReceipt }
                }
                val repository = repository(environment, backend)

                assertThrows(IllegalStateException::class.java) {
                    kotlinx.coroutines.runBlocking {
                        repository.submitNeedsInfo(
                            expectedIdentity = approvalIdentity(),
                            request = needsInfoRequest(),
                            idempotencyKey = "intent-key-stable",
                        )
                    }
                }
            }
        }

    @Test
    fun `approved receipt with incoherent membership role is rejected`() = runTest {
        val authorityA = AuthSessionAuthority("bearer-a", 7L)
        val environment = environment(authorityA)
        val approvedReceipt = doctorUser(status = "approved")
        val backend = FakeDoctorApprovalBackend().apply {
            requestBlock = { _, _, _ ->
                approvedReceipt.copy(
                    currentMembership = approvedReceipt.currentMembership?.copy(role = "patient"),
                )
            }
        }
        val repository = repository(environment, backend)

        assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking {
                repository.submitNeedsInfo(
                    expectedIdentity = approvalIdentity(),
                    request = needsInfoRequest(),
                    idempotencyKey = "intent-key-stable",
                )
            }
        }
    }

    @Test
    fun `needs info receipt may keep the actor personal workspace while targeting a clinic`() =
        runTest { assertPersonalWorkspaceTargetReceiptAccepted("needs_info") }

    @Test
    fun `pending receipt may keep the actor personal workspace while targeting a clinic`() =
        runTest { assertPersonalWorkspaceTargetReceiptAccepted("pending") }

    @Test
    fun `approved receipt may transition the actor from personal workspace to the requested clinic`() =
        runTest {
            val authorityA = AuthSessionAuthority("bearer-a", 7L)
            val environment = environment(authorityA)
            val backend = FakeDoctorApprovalBackend().apply {
                requestBlock = { request, _, _ ->
                    approvedClinicDoctorReceipt(request.organizationId)
                }
            }
            val repository = repository(environment, backend)

            val result = repository.submitNeedsInfo(
                expectedIdentity = approvalIdentity(
                    currentWorkspaceId = "personal-a",
                ),
                request = needsInfoRequest(),
                idempotencyKey = "intent-key-approved",
            )

            assertEquals("approved", result.roleRequestStatus)
            assertEquals("doctor", result.role)
            assertEquals("clinic-a", result.currentWorkspaceId)
            assertEquals("clinic-a", result.currentMembership?.workspaceId)
            assertEquals("doctor", result.currentMembership?.role)
        }

    @Test
    fun `workspace transition receipt rejects an arbitrary clinic or a replacement account`() =
        runTest {
            val arbitraryWorkspaceReceipt = approvedClinicDoctorReceipt("clinic-b")
            val replacementAccountReceipt = approvedClinicDoctorReceipt("clinic-a").copy(
                id = "backend-b",
                firebaseUid = "firebase-b",
                email = "doctor-b@shcare.vn",
            )

            listOf(arbitraryWorkspaceReceipt, replacementAccountReceipt).forEachIndexed {
                    index,
                    invalidReceipt,
                ->
                val authorityA = AuthSessionAuthority("bearer-a-invalid-$index", 7L)
                val environment = environment(authorityA)
                val backend = FakeDoctorApprovalBackend().apply {
                    requestBlock = { _, _, _ -> invalidReceipt }
                }
                val repository = repository(environment, backend)

                assertThrows(IllegalStateException::class.java) {
                    kotlinx.coroutines.runBlocking {
                        repository.submitNeedsInfo(
                            expectedIdentity = approvalIdentity(
                                currentWorkspaceId = "personal-a",
                            ),
                            request = needsInfoRequest(),
                            idempotencyKey = "intent-key-invalid-$index",
                        )
                    }
                }
            }
        }

    @Test
    fun `push failure is nonfatal but cancellation is never consumed`() = runTest {
        val authorityA = AuthSessionAuthority("bearer-a", 7L)
        val refreshedAuthorityA = AuthSessionAuthority("firebase-token-a", 8L)
        val environment = environment(authorityA)
        val backend = FakeDoctorApprovalBackend().apply {
            authenticateBlock = { _, _ ->
                environment.backendEpoch = refreshedAuthorityA.epoch
                environment.backendAuthority = refreshedAuthorityA
                AuthResult(
                    token = refreshedAuthorityA.bearerToken,
                    user = doctorUser(status = "pending"),
                    authority = refreshedAuthorityA,
                )
            }
        }
        val push = FakeDoctorApprovalPushRegistrar().apply {
            failure = IOException("provider unavailable")
        }
        val repository = repository(environment, backend, push)

        assertEquals(
            "backend-a",
            repository.refreshStatus(
                approvalIdentity(),
            ).id,
        )

        push.failure = CancellationException("caller left")
        assertThrows(CancellationException::class.java) {
            kotlinx.coroutines.runBlocking {
                repository.refreshStatus(
                    approvalIdentity(),
                )
            }
        }
    }

    private fun repository(
        environment: FakeDoctorApprovalRepositoryEnvironment,
        backend: FakeDoctorApprovalBackend = FakeDoctorApprovalBackend(),
        push: FakeDoctorApprovalPushRegistrar = FakeDoctorApprovalPushRegistrar(),
        expectedFirebaseOwner: FirebaseOwnerBinding = routeOwner(),
        firebaseSession: DoctorApprovalFirebaseSession =
            FakeDoctorApprovalFirebaseSession(environment),
    ) = ProductionDoctorApprovalRepository(
        expectedFirebaseOwner = expectedFirebaseOwner,
        ownerGuard = DoctorApprovalOwnerGuard(environment),
        firebaseSession = firebaseSession,
        backend = backend,
        pushRegistrar = push,
    )

    private suspend fun assertPersonalWorkspaceTargetReceiptAccepted(status: String) {
        val authorityA = AuthSessionAuthority("bearer-a-$status", 7L)
        val environment = environment(authorityA)
        val refreshedAuthority = AuthSessionAuthority("firebase-token-a-$status", 8L)
        val backend = FakeDoctorApprovalBackend().apply {
            if (status == "needs_info") {
                authenticateBlock = { _, expectedEpoch ->
                    assertEquals(authorityA.epoch, expectedEpoch)
                    environment.backendEpoch = refreshedAuthority.epoch
                    environment.backendAuthority = refreshedAuthority
                    AuthResult(
                        token = refreshedAuthority.bearerToken,
                        user = personalWorkspaceDoctorReceipt(
                            status = status,
                            targetOrganizationId = "clinic-a",
                        ),
                        authority = refreshedAuthority,
                    )
                }
            } else {
                requestBlock = { request, _, _ ->
                    personalWorkspaceDoctorReceipt(
                        status = status,
                        targetOrganizationId = request.organizationId,
                    )
                }
            }
        }
        val repository = repository(environment, backend)
        val expectedIdentity = approvalIdentity(
            currentWorkspaceId = "personal-a",
            targetWorkspaceId = "clinic-a",
        )

        val result = if (status == "needs_info") {
            repository.refreshStatus(expectedIdentity)
        } else {
            repository.submitNeedsInfo(
                expectedIdentity = expectedIdentity,
                request = needsInfoRequest(),
                idempotencyKey = "intent-key-$status",
            )
        }

        if (status == "needs_info") {
            assertTrue(backend.requestKeys.isEmpty())
        } else {
            assertEquals(listOf("intent-key-$status"), backend.requestKeys)
        }

        assertEquals(status, result.roleRequestStatus)
        assertEquals("personal-a", result.currentWorkspaceId)
        assertEquals("personal-a", result.currentMembership?.workspaceId)
        assertEquals("clinic-a", result.organizationId)
    }
}

private class FakeDoctorApprovalRepositoryEnvironment(
    var firebaseOwner: FirebaseOwnerBinding?,
    var backendEpoch: Long,
    var backendAuthority: AuthSessionAuthority?,
) : DoctorApprovalOwnerEnvironment {
    override fun currentFirebaseOwner(): FirebaseOwnerBinding? = firebaseOwner

    override fun currentBackendEpoch(): Long = backendEpoch

    override fun currentBackendAuthority(): AuthSessionAuthority? = backendAuthority

    override fun clearBackendAuthorityIfCurrent(expectedAuthority: AuthSessionAuthority): Boolean {
        if (backendAuthority != expectedAuthority) return false
        backendAuthority = null
        backendEpoch += 1L
        return true
    }
}

private class FakeDoctorApprovalFirebaseSession(
    private val environment: FakeDoctorApprovalRepositoryEnvironment,
) : DoctorApprovalFirebaseSession {
    val tokenRequests = mutableListOf<FirebaseOwnerBinding>()

    override suspend fun getFreshIdToken(expectedOwner: FirebaseOwnerBinding): String {
        tokenRequests += expectedOwner
        assertEquals(expectedOwner, environment.firebaseOwner)
        return "firebase-token-a"
    }
}

private class FakeDoctorApprovalBackend : DoctorApprovalBackend {
    var clinicsBlock: suspend () -> List<ClinicOption> = {
        listOf(ClinicOption("clinic-a", "Phòng khám A"))
    }
    var specialtiesBlock: suspend () -> List<SpecialtyOption> = {
        listOf(SpecialtyOption("cardiology", "Tim mạch"))
    }
    var authenticateBlock: suspend (String, Long) -> AuthResult = { _, _ ->
        error("authenticate block not configured")
    }
    var requestBlock: suspend (DoctorApprovalNeedsInfoRequest, String, Long) -> AuthUser =
        { _, _, _ -> error("request block not configured") }
    val requestKeys = mutableListOf<String>()
    val requestIdentities = mutableListOf<DoctorApprovalIdentity>()

    override suspend fun listClinics(): List<ClinicOption> = clinicsBlock()

    override suspend fun listSpecialties(): List<SpecialtyOption> = specialtiesBlock()

    override suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult = authenticateBlock(idToken, expectedAuthSessionEpoch)

    override suspend fun requestRole(
        expectedIdentity: DoctorApprovalIdentity,
        request: DoctorApprovalNeedsInfoRequest,
        idempotencyKey: String,
        expectedAuthSessionEpoch: Long,
    ): AuthUser {
        requestIdentities += expectedIdentity
        requestKeys += idempotencyKey
        return requestBlock(request, idempotencyKey, expectedAuthSessionEpoch)
    }
}

private class FakeDoctorApprovalPushRegistrar : DoctorApprovalPushRegistrar {
    val registrations = mutableListOf<Pair<String, String>>()
    var failure: Throwable? = null

    override suspend fun register(backendUserId: String, workspaceId: String): Boolean {
        failure?.let { throw it }
        registrations += backendUserId to workspaceId
        return true
    }
}

private fun environment(authority: AuthSessionAuthority) =
    FakeDoctorApprovalRepositoryEnvironment(
        firebaseOwner = owner("firebase-a", "doctor-a@shcare.vn", 1L),
        backendEpoch = authority.epoch,
        backendAuthority = authority,
    )

private fun owner(id: String, email: String, epoch: Long) = FirebaseOwnerBinding(
    firebaseUserId = id,
    email = email,
    sessionEpoch = epoch,
)

private fun routeOwner(sessionEpoch: Long = 1L) =
    owner("firebase-a", "doctor-a@shcare.vn", sessionEpoch)

private fun approvalIdentity(
    firebaseOwner: FirebaseOwnerBinding = routeOwner(),
    backendUserId: String = "backend-a",
    currentWorkspaceId: String = "clinic-a",
    targetWorkspaceId: String = currentWorkspaceId,
) = DoctorApprovalIdentity(
    firebaseOwner = firebaseOwner,
    backendUserId = backendUserId,
    currentWorkspaceId = currentWorkspaceId,
    targetWorkspaceId = targetWorkspaceId,
)

internal fun doctorUser(
    status: String,
    workspaceId: String = "clinic-a",
) = AuthUser(
    id = "backend-a",
    firebaseUid = "firebase-a",
    email = "doctor-a@shcare.vn",
    verifiedEmail = true,
    role = if (status == "approved") "doctor" else "patient",
    requestedRole = "doctor",
    roleRequestStatus = status,
    name = "Bác sĩ An",
    phone = "0912345678",
    license = "CCHN-001",
    hospital = "Phòng khám A",
    department = "Tim mạch",
    organizationId = workspaceId,
    currentWorkspaceId = workspaceId,
    currentWorkspace = WorkspaceSummary(id = workspaceId, name = "Phòng khám A"),
    currentMembership = WorkspaceMembership(
        id = "membership-$workspaceId",
        workspaceId = workspaceId,
        organizationId = workspaceId,
        workspaceType = "clinic",
        role = if (status == "approved") "doctor" else "patient",
        status = "active",
        operational = true,
    ),
    workspaceType = "clinic",
    accountType = "doctor",
)

private fun personalWorkspaceDoctorReceipt(
    status: String,
    targetOrganizationId: String,
) = doctorUser(status = status, workspaceId = "personal-a").copy(
    organizationId = targetOrganizationId,
    currentWorkspace = WorkspaceSummary(
        id = "personal-a",
        name = "Không gian cá nhân",
        type = "personal",
        workspaceType = "personal",
        role = "patient",
    ),
    currentMembership = WorkspaceMembership(
        id = "membership-personal-a",
        workspaceId = "personal-a",
        organizationId = "personal-a",
        workspaceName = "Không gian cá nhân",
        workspaceType = "personal",
        role = "patient",
        status = "active",
        operational = true,
    ),
    workspaceType = "personal",
)

private fun approvedClinicDoctorReceipt(workspaceId: String) =
    doctorUser(status = "approved", workspaceId = workspaceId).copy(
        organizationId = workspaceId,
        currentWorkspace = WorkspaceSummary(
            id = workspaceId,
            name = "Phòng khám đích",
            type = "clinic",
            workspaceType = "clinic",
            role = "doctor",
        ),
        currentMembership = WorkspaceMembership(
            id = "membership-$workspaceId",
            workspaceId = workspaceId,
            organizationId = workspaceId,
            workspaceName = "Phòng khám đích",
            workspaceType = "clinic",
            role = "doctor",
            status = "active",
            operational = true,
        ),
        workspaceType = "clinic",
    )

private fun needsInfoRequest() = DoctorApprovalNeedsInfoRequest(
    name = "Bác sĩ An",
    phone = "0912345678",
    license = "CCHN-001",
    clinicName = "Phòng khám A",
    specialtyName = "Tim mạch",
    organizationId = "clinic-a",
    reason = "Bổ sung hồ sơ",
    accountType = "doctor",
    workspaceType = "clinic",
)
