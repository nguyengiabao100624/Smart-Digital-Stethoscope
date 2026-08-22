package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import com.example.smart_health_android.data.normalizePendingRegistrationEmail
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class EmailVerificationRepositoryTest {
    @Test
    fun `verified Firebase owner receives only its own validated doctor role receipt`() =
        kotlinx.coroutines.runBlocking {
            val registration = doctorRegistration()
            val firebase = FakeEmailVerificationFirebaseSession()
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient().copy(
                    requestedRole = "doctor",
                    roleRequestStatus = "pending",
                    accountType = "doctor",
                    workspaceType = "clinic",
                ),
            )
            val store = FakeEmailVerificationRegistrationStore(registration)
            val push = FakeEmailVerificationPushRegistrar()
            val repository = repository(firebase, backend, store, push)

            val result = repository.checkStatus()

            assertEquals(
                EmailVerificationCheckResult.Verified(
                    accountType = "doctor",
                    firebaseOwner = EXPECTED_FIREBASE_OWNER,
                ),
                result,
            )
            assertEquals(
                listOf(registration.roleRequestIdempotencyKey),
                backend.roleRequestKeys,
            )
            assertEquals(listOf("backend-user-1" to "clinic-1"), push.registrations)
            assertTrue(store.cleared)
        }

    @Test
    fun `verified doctor request keeps personal authority while targeting a clinic`() =
        kotlinx.coroutines.runBlocking {
            val registration = doctorRegistration()
            val authenticated = authenticatedPatientWithPersonalAuthority("clinic-1")
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticated,
                roleReceipt = authenticated.copy(
                    requestedRole = "doctor",
                    roleRequestStatus = "pending",
                    accountType = "doctor",
                    workspaceType = "clinic",
                ),
            )
            val store = FakeEmailVerificationRegistrationStore(registration)
            val push = FakeEmailVerificationPushRegistrar()

            val result = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = store,
                push = push,
            ).checkStatus()

            assertEquals(
                EmailVerificationCheckResult.Verified(
                    accountType = "doctor",
                    firebaseOwner = EXPECTED_FIREBASE_OWNER,
                ),
                result,
            )
            assertEquals(listOf("backend-user-1" to "personal-1"), push.registrations)
            assertTrue(store.cleared)
            assertFalse(backend.authorizationCleared)
        }

    @Test
    fun `existing needs info doctor session enters approval with personal authority intact`() =
        kotlinx.coroutines.runBlocking {
            val needsInfoUser = authenticatedPatientWithPersonalAuthority("clinic-1").copy(
                requestedRole = "doctor",
                roleRequestStatus = "needs_info",
                accountType = "doctor",
                workspaceType = "clinic",
            )
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = needsInfoUser,
                roleReceipt = needsInfoUser,
            )
            val push = FakeEmailVerificationPushRegistrar()

            val result = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = FakeEmailVerificationRegistrationStore(null),
                push = push,
            ).checkStatus()

            assertEquals(
                EmailVerificationCheckResult.Verified(
                    accountType = "doctor",
                    firebaseOwner = EXPECTED_FIREBASE_OWNER,
                ),
                result,
            )
            assertTrue(backend.roleRequestKeys.isEmpty())
            assertEquals(listOf("backend-user-1" to "personal-1"), push.registrations)
            assertFalse(backend.authorizationCleared)
        }

    @Test
    fun `owner replacement after Firebase reload stops before token or backend authentication`() =
        kotlinx.coroutines.runBlocking {
            val firebase = FakeEmailVerificationFirebaseSession().apply {
                afterReload = { userId = "firebase-user-2" }
            }
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient(),
            )
            val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
            val repository = repository(
                firebase = firebase,
                backend = backend,
                store = store,
                push = FakeEmailVerificationPushRegistrar(),
            )

            try {
                repository.checkStatus()
                fail("Expected owner replacement to invalidate verification")
            } catch (_: EmailVerificationOwnerChangedException) {
                assertEquals(0, firebase.tokenCalls)
                assertEquals(0, backend.authenticateCalls)
                assertTrue(backend.authorizationCleared)
                assertFalse(store.cleared)
            }
        }

    @Test
    fun `A to B to A owner replacement after reload invalidates the captured verification session`() =
        kotlinx.coroutines.runBlocking {
            val firebase = FakeEmailVerificationFirebaseSession().apply {
                afterReload = {
                    userId = "firebase-user-2"
                    ownerSessionEpoch = 2L
                    userId = "firebase-user-1"
                    ownerSessionEpoch = 3L
                }
            }
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient(),
            )
            val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
            val repository = repository(
                firebase = firebase,
                backend = backend,
                store = store,
                push = FakeEmailVerificationPushRegistrar(),
            )

            try {
                repository.checkStatus()
                fail("Expected the ABA owner replacement to invalidate verification")
            } catch (_: EmailVerificationOwnerChangedException) {
                assertEquals(0, firebase.tokenCalls)
                assertEquals(0, backend.authenticateCalls)
                assertTrue(backend.authorizationCleared)
                assertFalse(store.cleared)
            }
        }

    @Test
    fun `route owner A is retained when current Firebase owner is B before repository construction`() =
        kotlinx.coroutines.runBlocking {
            val firebase = FakeEmailVerificationFirebaseSession().apply {
                userId = "firebase-user-2"
                email = "other@example.com"
                ownerSessionEpoch = 2L
            }
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient(),
            )
            val repository = repository(
                firebase = firebase,
                backend = backend,
                store = FakeEmailVerificationRegistrationStore(doctorRegistration()),
                push = FakeEmailVerificationPushRegistrar(),
                expectedOwner = EXPECTED_FIREBASE_OWNER,
            )

            try {
                repository.checkStatus()
                fail("Expected route owner A to reject current Firebase owner B")
            } catch (_: EmailVerificationOwnerChangedException) {
                assertEquals(0, firebase.reloadCalls)
                assertEquals(0, firebase.tokenCalls)
                assertEquals(0, backend.authenticateCalls)
                assertTrue(backend.authorizationCleared)
            }
        }

    @Test
    fun `authentication receipt for another Firebase uid cannot request a role`() =
        kotlinx.coroutines.runBlocking {
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient().copy(
                    firebaseUid = "firebase-user-2",
                ),
                roleReceipt = authenticatedPatient(),
            )
            val repository = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = FakeEmailVerificationRegistrationStore(doctorRegistration()),
                push = FakeEmailVerificationPushRegistrar(),
            )

            try {
                repository.checkStatus()
                fail("Expected the foreign authentication receipt to be rejected")
            } catch (_: EmailVerificationContractException) {
                assertEquals(0, backend.roleRequestKeys.size)
                assertTrue(backend.authorizationCleared)
            }
        }

    @Test
    fun `role receipt for another backend user cannot register push or clear checkpoint`() =
        kotlinx.coroutines.runBlocking {
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient().copy(
                    id = "backend-user-2",
                    requestedRole = "doctor",
                    roleRequestStatus = "pending",
                    accountType = "doctor",
                ),
            )
            val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
            val push = FakeEmailVerificationPushRegistrar()
            val repository = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = store,
                push = push,
            )

            try {
                repository.checkStatus()
                fail("Expected the foreign role receipt to be rejected")
            } catch (_: EmailVerificationContractException) {
                assertTrue(push.registrations.isEmpty())
                assertFalse(store.cleared)
                assertTrue(backend.authorizationCleared)
            }
        }

    @Test
    fun `checkpoint workspace cannot be accepted through a matching top level organization alias`() =
        kotlinx.coroutines.runBlocking {
            val authenticated = authenticatedPatient()
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticated,
                roleReceipt = authenticated.copy(
                    requestedRole = "doctor",
                    roleRequestStatus = "pending",
                    accountType = "doctor",
                    workspaceType = "clinic",
                    organizationId = "clinic-1",
                    currentWorkspaceId = "foreign-clinic",
                    currentWorkspace = WorkspaceSummary(
                        id = "foreign-clinic",
                        workspaceType = "clinic",
                    ),
                    currentMembership = activeMembership("foreign-clinic"),
                ),
            )
            val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
            val push = FakeEmailVerificationPushRegistrar()
            val repository = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = store,
                push = push,
            )

            try {
                repository.checkStatus()
                fail("Expected the incoherent canonical workspace receipt to be rejected")
            } catch (_: EmailVerificationContractException) {
                assertTrue(push.registrations.isEmpty())
                assertFalse(store.cleared)
                assertTrue(backend.authorizationCleared)
            }
        }

    @Test
    fun `already approved doctor checkpoint never replays the self-service role mutation`() =
        kotlinx.coroutines.runBlocking {
            val approvedDoctor = authenticatedPatient().copy(
                role = "doctor",
                requestedRole = "doctor",
                roleRequestStatus = "approved",
                accountType = "doctor",
                workspaceType = "clinic",
                currentMembership = activeMembership("clinic-1").copy(role = "doctor"),
            )
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = approvedDoctor,
                roleReceipt = approvedDoctor,
            )
            val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
            val push = FakeEmailVerificationPushRegistrar()
            val repository = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = store,
                push = push,
            )

            assertEquals(
                EmailVerificationCheckResult.Verified(
                    accountType = "doctor",
                    firebaseOwner = EXPECTED_FIREBASE_OWNER,
                ),
                repository.checkStatus(),
            )
            assertTrue(backend.roleRequestKeys.isEmpty())
            assertTrue(store.cleared)
            assertEquals(listOf("backend-user-1" to "clinic-1"), push.registrations)
        }

    @Test
    fun `already verified resend returns the repository pinned Firebase owner`() =
        kotlinx.coroutines.runBlocking {
            val registration = doctorRegistration()
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient().copy(
                    requestedRole = "doctor",
                    roleRequestStatus = "pending",
                    accountType = "doctor",
                    workspaceType = "clinic",
                ),
            )
            val repository = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = FakeEmailVerificationRegistrationStore(registration),
                push = FakeEmailVerificationPushRegistrar(),
            )

            assertEquals(
                EmailVerificationResendOutcome.Verified(
                    accountType = "doctor",
                    firebaseOwner = EXPECTED_FIREBASE_OWNER,
                ),
                repository.resend(),
            )
        }

    @Test
    fun `doctor role receipt with a different account surface is rejected`() =
        kotlinx.coroutines.runBlocking {
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient().copy(
                    requestedRole = "doctor",
                    roleRequestStatus = "pending",
                    accountType = "personal",
                    workspaceType = "personal",
                ),
            )
            val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
            val repository = repository(
                firebase = FakeEmailVerificationFirebaseSession(),
                backend = backend,
                store = store,
                push = FakeEmailVerificationPushRegistrar(),
            )

            try {
                repository.checkStatus()
                fail("Expected the mismatched doctor account surface to be rejected")
            } catch (_: EmailVerificationContractException) {
                assertFalse(store.cleared)
                assertTrue(backend.authorizationCleared)
            }
        }

    @Test
    fun `resend rechecks owner after provider await`() = kotlinx.coroutines.runBlocking {
        val firebase = FakeEmailVerificationFirebaseSession().apply {
            verified = false
            afterSend = { userId = "firebase-user-2" }
        }
        val backend = FakeEmailVerificationBackend(
            authenticatedUser = authenticatedPatient(),
            roleReceipt = authenticatedPatient(),
        )
        val repository = repository(
            firebase = firebase,
            backend = backend,
            store = FakeEmailVerificationRegistrationStore(doctorRegistration()),
            push = FakeEmailVerificationPushRegistrar(),
        )

        try {
            repository.resend()
            fail("Expected owner replacement to invalidate resend")
        } catch (_: EmailVerificationOwnerChangedException) {
            assertTrue(backend.authorizationCleared)
            assertEquals(0, backend.authenticateCalls)
        }
    }

    @Test
    fun `resend never sends after reload switches to another Firebase owner`() =
        kotlinx.coroutines.runBlocking {
            val firebase = FakeEmailVerificationFirebaseSession().apply {
                verified = false
                afterReload = { userId = "firebase-user-2" }
            }
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient(),
            )
            val repository = repository(
                firebase = firebase,
                backend = backend,
                store = FakeEmailVerificationRegistrationStore(doctorRegistration()),
                push = FakeEmailVerificationPushRegistrar(),
            )

            try {
                repository.resend()
                fail("Expected owner replacement to block the resend side effect")
            } catch (_: EmailVerificationOwnerChangedException) {
                assertEquals(0, firebase.sendCalls)
                assertTrue(backend.authorizationCleared)
            }
        }

    @Test
    fun `cancellation after backend authentication clears stale authorization on owner change`() =
        kotlinx.coroutines.runBlocking {
            val firebase = FakeEmailVerificationFirebaseSession()
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient(),
            ).apply {
                afterAuthenticate = { firebase.userId = "firebase-user-2" }
                authenticateFailure = CancellationException("scope cancelled")
            }
            val repository = repository(
                firebase = firebase,
                backend = backend,
                store = FakeEmailVerificationRegistrationStore(doctorRegistration()),
                push = FakeEmailVerificationPushRegistrar(),
            )

            try {
                repository.checkStatus()
                fail("Expected cancellation")
            } catch (_: CancellationException) {
                assertTrue(backend.authorizationCleared)
            }
        }

    @Test
    fun `push cancellation is never swallowed and cannot clear checkpoint after owner change`() =
        kotlinx.coroutines.runBlocking {
            val firebase = FakeEmailVerificationFirebaseSession()
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient().copy(
                    requestedRole = "doctor",
                    roleRequestStatus = "pending",
                    accountType = "doctor",
                    workspaceType = "clinic",
                ),
            )
            val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
            val push = FakeEmailVerificationPushRegistrar().apply {
                afterRegister = { firebase.userId = "firebase-user-2" }
                failure = CancellationException("scope cancelled")
            }
            val repository = repository(firebase, backend, store, push)

            try {
                repository.checkStatus()
                fail("Expected cancellation")
            } catch (_: CancellationException) {
                assertTrue(backend.authorizationCleared)
                assertFalse(store.cleared)
            }
        }

    @Test
    fun `every awaited verification boundary rechecks the Firebase owner before continuing`() =
        kotlinx.coroutines.runBlocking {
            val stages = listOf(
                "checkpoint-load",
                "firebase-reload",
                "firebase-token",
                "backend-authenticate",
                "role-request",
                "push-registration",
                "checkpoint-clear",
            )
            stages.forEach { stage ->
                val firebase = FakeEmailVerificationFirebaseSession()
                val backend = FakeEmailVerificationBackend(
                    authenticatedUser = authenticatedPatient(),
                    roleReceipt = authenticatedPatient().copy(
                        requestedRole = "doctor",
                        roleRequestStatus = "pending",
                        accountType = "doctor",
                        workspaceType = "clinic",
                    ),
                )
                val store = FakeEmailVerificationRegistrationStore(doctorRegistration())
                val push = FakeEmailVerificationPushRegistrar()
                val replaceOwner = { firebase.userId = "firebase-user-2" }
                when (stage) {
                    "checkpoint-load" -> store.afterLoad = replaceOwner
                    "firebase-reload" -> firebase.afterReload = replaceOwner
                    "firebase-token" -> firebase.afterToken = replaceOwner
                    "backend-authenticate" -> backend.afterAuthenticate = replaceOwner
                    "role-request" -> backend.afterRoleRequest = replaceOwner
                    "push-registration" -> push.afterRegister = replaceOwner
                    "checkpoint-clear" -> store.afterClear = replaceOwner
                }
                val repository = repository(firebase, backend, store, push)

                try {
                    repository.checkStatus()
                    fail("Expected owner replacement after $stage to block confirmation")
                } catch (_: EmailVerificationOwnerChangedException) {
                    assertTrue(
                        "Backend authorization should be cleared after $stage",
                        backend.authorizationCleared,
                    )
                }
            }
        }

    @Test
    fun `failed await still checks replacement owner before surfacing provider error`() =
        kotlinx.coroutines.runBlocking {
            val firebase = FakeEmailVerificationFirebaseSession().apply {
                afterReload = { userId = "firebase-user-2" }
                reloadFailure = IllegalStateException("provider failed")
            }
            val backend = FakeEmailVerificationBackend(
                authenticatedUser = authenticatedPatient(),
                roleReceipt = authenticatedPatient(),
            )
            val repository = repository(
                firebase = firebase,
                backend = backend,
                store = FakeEmailVerificationRegistrationStore(doctorRegistration()),
                push = FakeEmailVerificationPushRegistrar(),
            )

            try {
                repository.checkStatus()
                fail("Expected replacement owner to supersede the provider failure")
            } catch (error: EmailVerificationOwnerChangedException) {
                assertEquals("provider failed", error.cause?.message)
                assertTrue(backend.authorizationCleared)
            }
        }

    private fun repository(
        firebase: FakeEmailVerificationFirebaseSession,
        backend: FakeEmailVerificationBackend,
        store: FakeEmailVerificationRegistrationStore,
        push: FakeEmailVerificationPushRegistrar,
        expectedOwner: FirebaseOwnerBinding = EXPECTED_FIREBASE_OWNER,
    ) = ProductionEmailVerificationRepository(
        fallbackAccountType = "doctor",
        expectedOwner = expectedOwner,
        firebaseSession = firebase,
        backend = backend,
        registrationStore = store,
        pushRegistrar = push,
    )

    private fun doctorRegistration() = PendingRegistration(
        accountType = "doctor",
        name = "Bác sĩ An",
        email = "doctor@example.com",
        phone = "0912345678",
        license = "CCHN-2026",
        hospital = "Phòng khám An Khang",
        department = "Tim mạch",
        organizationId = "clinic-1",
        reason = "Theo dõi từ xa",
        firebaseUserId = "firebase-user-1",
        roleRequestIdempotencyKey = "role-request-key-stable",
    )

    private fun authenticatedPatient() = AuthUser(
        id = "backend-user-1",
        firebaseUid = "firebase-user-1",
        email = "doctor@example.com",
        verifiedEmail = true,
        accountStatus = "active",
        role = "patient",
        organizationId = "clinic-1",
        currentWorkspaceId = "clinic-1",
        currentWorkspace = WorkspaceSummary(
            id = "clinic-1",
            workspaceType = "personal",
        ),
        currentMembership = activeMembership("clinic-1"),
        accountType = "personal",
        workspaceType = "personal",
    )

    private fun authenticatedPatientWithPersonalAuthority(targetWorkspaceId: String) =
        authenticatedPatient().copy(
            organizationId = targetWorkspaceId,
            currentWorkspaceId = "personal-1",
            currentWorkspace = WorkspaceSummary(
                id = "personal-1",
                workspaceType = "personal",
            ),
            currentMembership = activeMembership("personal-1").copy(
                workspaceType = "personal",
            ),
        )

    private fun activeMembership(workspaceId: String) = WorkspaceMembership(
        id = "membership-$workspaceId",
        workspaceId = workspaceId,
        organizationId = workspaceId,
        workspaceType = "clinic",
        role = "patient",
        status = "active",
        operational = true,
    )
}

private val EXPECTED_FIREBASE_OWNER = FirebaseOwnerBinding(
    firebaseUserId = "firebase-user-1",
    email = "doctor@example.com",
    sessionEpoch = 1L,
)

private class FakeEmailVerificationFirebaseSession : EmailVerificationFirebaseSession {
    var userId = "firebase-user-1"
    var email = "doctor@example.com"
    var ownerSessionEpoch = 1L
    var verified = true
    var reloadCalls = 0
    var tokenCalls = 0
    var sendCalls = 0
    var reloadFailure: Throwable? = null
    var afterReload: () -> Unit = {}
    var afterToken: () -> Unit = {}
    var afterSend: () -> Unit = {}

    override fun currentOwnerBindingOrNull(): FirebaseOwnerBinding? {
        val normalizedUserId = userId.trim()
        val normalizedEmail = normalizePendingRegistrationEmail(email)
        if (normalizedUserId.isBlank() || normalizedEmail.isBlank()) return null
        return FirebaseOwnerBinding(
            firebaseUserId = normalizedUserId,
            email = normalizedEmail,
            sessionEpoch = ownerSessionEpoch,
        )
    }

    override suspend fun reloadCurrentUser(expectedOwner: FirebaseOwnerBinding): Boolean {
        reloadCalls += 1
        afterReload()
        reloadFailure?.let { throw it }
        return verified
    }

    override suspend fun getFreshIdToken(
        expectedOwner: FirebaseOwnerBinding,
        forceRefresh: Boolean,
    ): String {
        tokenCalls += 1
        afterToken()
        return "fresh-token"
    }

    override suspend fun sendEmailVerification(expectedOwner: FirebaseOwnerBinding) {
        sendCalls += 1
        afterSend()
    }
}

private class FakeEmailVerificationBackend(
    var authenticatedUser: AuthUser,
    var roleReceipt: AuthUser,
) : EmailVerificationBackend {
    var authenticateCalls = 0
    var authorizationCleared = false
    var authenticateFailure: Throwable? = null
    val roleRequestKeys = mutableListOf<String>()
    var afterAuthenticate: () -> Unit = {}
    var afterRoleRequest: () -> Unit = {}

    override fun currentAuthSessionEpoch(): Long = 17L

    override suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthUser {
        check(expectedAuthSessionEpoch == 17L)
        authenticateCalls += 1
        afterAuthenticate()
        authenticateFailure?.let { throw it }
        return authenticatedUser
    }

    override suspend fun requestRole(
        registration: PendingRegistration,
        idempotencyKey: String,
    ): AuthUser {
        roleRequestKeys += idempotencyKey
        afterRoleRequest()
        return roleReceipt
    }

    override fun clearOwnedAuthorization() {
        authorizationCleared = true
    }
}

private class FakeEmailVerificationRegistrationStore(
    private val registration: PendingRegistration?,
) : EmailVerificationRegistrationStore {
    var cleared = false
    var afterLoad: () -> Unit = {}
    var afterClear: () -> Unit = {}

    override suspend fun loadForOwner(
        firebaseUserId: String,
        firebaseEmail: String,
    ): PendingRegistration? {
        afterLoad()
        return registration
    }

    override suspend fun clearForOwner(
        firebaseUserId: String,
        firebaseEmail: String,
    ): Boolean {
        cleared = true
        afterClear()
        return true
    }
}

private class FakeEmailVerificationPushRegistrar : EmailVerificationPushRegistrar {
    val registrations = mutableListOf<Pair<String, String>>()
    var afterRegister: () -> Unit = {}
    var failure: Throwable? = null

    override suspend fun register(
        backendUserId: String,
        workspaceId: String,
    ): Boolean {
        registrations += backendUserId to workspaceId
        afterRegister()
        failure?.let { throw it }
        return true
    }
}
