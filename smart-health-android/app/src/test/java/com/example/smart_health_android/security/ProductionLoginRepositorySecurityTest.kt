package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthResult
import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.FirebaseSignInReceipt
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.TwoFactorChallengeResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ProductionLoginRepositorySecurityTest {
    @Test
    fun `login exchanges the token captured from the Firebase sign-in receipt`() = runBlocking {
        val harness = LoginHarness()

        val result = harness.repository.signIn(
            mode = LoginAccountMode.Patient,
            email = ACCOUNT_A.email,
            password = "correct horse battery staple",
        )

        assertTrue(result is LoginResult.Authenticated)
        assertEquals(ACCOUNT_A, (result as LoginResult.Authenticated).firebaseOwner)
        assertEquals("firebase-token-a", harness.backend.lastAuthenticatedToken)
        assertEquals(1, harness.intentionalTeardown.calls)
        assertEquals(1, harness.push.calls)
    }

    @Test
    fun `A to B to A ABA replacement rejects the stale A login receipt`() = runBlocking {
        val harness = LoginHarness()
        val replacementA = ACCOUNT_A.copy(sessionEpoch = 3L)
        harness.backend.onAuthenticate = {
            harness.firebase.currentOwner = ACCOUNT_B
            harness.firebase.currentOwner = replacementA
        }

        try {
            harness.repository.signIn(
                mode = LoginAccountMode.Patient,
                email = ACCOUNT_A.email,
                password = "correct horse battery staple",
            )
            fail("Expected stale Firebase owner receipt to be rejected")
        } catch (error: IllegalStateException) {
            assertTrue(error.message.orEmpty().contains("Firebase"))
        }

        assertEquals(replacementA, harness.firebase.currentOwner)
        assertEquals(0, harness.firebase.signOutCalls)
        assertNull(harness.backend.currentAuthority)
        assertEquals(listOf(AUTHORITY_A), harness.backend.clearAttempts)
    }

    @Test
    fun `unverified result carries the owner pinned by the Firebase sign in receipt`() =
        runBlocking {
            val harness = LoginHarness()
            harness.firebase.verified = false

            val result = harness.repository.signIn(
                mode = LoginAccountMode.Patient,
                email = ACCOUNT_A.email,
                password = "correct horse battery staple",
            )

            assertEquals(LoginResult.VerifyEmail("patient", ACCOUNT_A), result)
            assertEquals(ACCOUNT_A, harness.checkpoint.lastSaveOwner)
        }

    @Test
    fun `doctor approval result carries the owner pinned before backend authentication`() =
        runBlocking {
            val harness = LoginHarness()
            harness.backend.authenticatedUser = pendingDoctorUser()

            val result = harness.repository.signIn(
                mode = LoginAccountMode.Doctor,
                email = ACCOUNT_A.email,
                password = "correct horse battery staple",
            )

            assertEquals(LoginResult.DoctorApprovalPending(ACCOUNT_A), result)
        }

    @Test
    fun `cancelling stale account A two factor flow preserves replacement account B`() =
        runBlocking {
            val harness = LoginHarness()
            harness.backend.authenticationFailure = twoFactorRequired()

            val result = harness.repository.signIn(
                mode = LoginAccountMode.Patient,
                email = ACCOUNT_A.email,
                password = "correct horse battery staple",
            )
            assertTrue(result is LoginResult.TwoFactorRequired)

            harness.firebase.currentOwner = ACCOUNT_B
            harness.backend.currentAuthority = AUTHORITY_B
            harness.repository.cancelAuthentication()

            assertEquals(ACCOUNT_B, harness.firebase.currentOwner)
            assertEquals(AUTHORITY_B, harness.backend.currentAuthority)
            assertEquals(0, harness.firebase.signOutCalls)
            assertEquals(listOf(AUTHORITY_A), harness.backend.clearAttempts)
            assertEquals(1, harness.intentionalTeardown.calls)
        }

    @Test
    fun `push cancellation propagates without signing out or clearing replacement account B`() =
        runBlocking {
            val harness = LoginHarness()
            val cancellation = CancellationException("push cancelled")
            harness.push.onRegister = {
                harness.firebase.currentOwner = ACCOUNT_B
                harness.backend.currentAuthority = AUTHORITY_B
                throw cancellation
            }

            try {
                harness.repository.signIn(
                    mode = LoginAccountMode.Patient,
                    email = ACCOUNT_A.email,
                    password = "correct horse battery staple",
                )
                fail("Expected push cancellation to propagate")
            } catch (error: CancellationException) {
                assertSame(cancellation, error)
            }

            assertEquals(ACCOUNT_B, harness.firebase.currentOwner)
            assertEquals(AUTHORITY_B, harness.backend.currentAuthority)
            assertEquals(0, harness.firebase.signOutCalls)
            assertEquals(listOf(AUTHORITY_A), harness.backend.clearAttempts)
        }
}

private class LoginHarness {
    val firebase = FakeLoginFirebaseSession()
    val backend = FakeLoginBackendSession()
    val checkpoint = FakeLoginRegistrationCheckpoint()
    val push = FakeLoginPushRegistration()
    val intentionalTeardown = FakeIntentionalLoginTeardown()
    val repository = ProductionLoginRepository(
        firebaseSession = firebase,
        backendSession = backend,
        registrationCheckpoint = checkpoint,
        pushRegistration = push,
        intentionalTeardown = intentionalTeardown,
    )
}

private class FakeLoginFirebaseSession : LoginFirebaseSession {
    var currentOwner: FirebaseOwnerBinding? = ACCOUNT_A
    var verified = true
    var signOutCalls = 0

    override suspend fun signIn(email: String, password: String): FirebaseSignInReceipt =
        FirebaseSignInReceipt(
            firebaseUserId = ACCOUNT_A.firebaseUserId,
            email = ACCOUNT_A.email,
            idToken = "firebase-token-a",
            ownerSessionEpoch = ACCOUNT_A.sessionEpoch,
        )

    override suspend fun reloadCurrentUser(expectedOwner: FirebaseOwnerBinding): Boolean {
        check(currentOwner == expectedOwner)
        return verified
    }

    override fun isCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean =
        currentOwner == expectedOwner

    override fun signOutIfCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean {
        if (currentOwner != expectedOwner) return false
        currentOwner = null
        signOutCalls += 1
        return true
    }
}

private class FakeLoginBackendSession : LoginBackendSession {
    var currentAuthority: AuthSessionAuthority? = null
    var lastAuthenticatedToken = ""
    var authenticationFailure: SmartHealthApiException? = null
    var authenticatedUser: AuthUser = patientUser()
    var onAuthenticate: () -> Unit = {}
    val clearAttempts = mutableListOf<AuthSessionAuthority>()

    override fun currentAuthSessionEpoch(): Long = 7L

    override fun currentAuthSessionAuthorityFor(token: String): AuthSessionAuthority? =
        currentAuthority?.takeIf { it.bearerToken == token }

    override suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult {
        lastAuthenticatedToken = idToken
        currentAuthority = AUTHORITY_A
        onAuthenticate()
        authenticationFailure?.let { throw it }
        return AuthResult(
            token = idToken,
            user = authenticatedUser,
            authority = AUTHORITY_A,
        )
    }

    override suspend fun completeTwoFactorChallenge(
        challengeId: String,
        code: String,
        expectedAuthSessionEpoch: Long,
    ): TwoFactorChallengeResult = error("Not used")

    override suspend fun requestRole(
        registration: PendingRegistration,
        expectedAuthSessionEpoch: Long,
    ): AuthUser = error("Not used")

    override fun clearAuthTokenIfCurrent(expectedAuthority: AuthSessionAuthority): Boolean {
        clearAttempts += expectedAuthority
        if (currentAuthority != expectedAuthority) return false
        currentAuthority = null
        return true
    }
}

private class FakeLoginRegistrationCheckpoint : LoginRegistrationCheckpoint {
    var registration: PendingRegistration? = null
    var lastSaveOwner: FirebaseOwnerBinding? = null

    override suspend fun loadForOwner(owner: FirebaseOwnerBinding): PendingRegistration? =
        registration

    override suspend fun saveForOwner(
        registration: PendingRegistration,
        owner: FirebaseOwnerBinding,
    ) {
        this.registration = registration
        lastSaveOwner = owner
    }

    override suspend fun clearForOwner(owner: FirebaseOwnerBinding): Boolean {
        registration = null
        return true
    }
}

private class FakeLoginPushRegistration : LoginPushRegistration {
    var calls = 0
    var onRegister: suspend () -> Unit = {}

    override suspend fun register(userId: String, workspaceId: String): Boolean {
        calls += 1
        onRegister()
        return true
    }
}

private class FakeIntentionalLoginTeardown : IntentionalLoginTeardown {
    var calls = 0

    override fun prepareForNewLogin() {
        calls += 1
    }
}

private fun patientUser(): AuthUser = AuthUser(
    id = "user-a",
    firebaseUid = ACCOUNT_A.firebaseUserId,
    email = ACCOUNT_A.email,
    verifiedEmail = true,
    accountStatus = "active",
    role = "patient",
    organizationId = "org-personal-a",
    currentWorkspaceId = "org-personal-a",
    workspaceType = "personal",
    accountType = "personal",
)

private fun pendingDoctorUser(): AuthUser = patientUser().copy(
    requestedRole = "doctor",
    roleRequestStatus = "pending",
)

private fun twoFactorRequired(): SmartHealthApiException = SmartHealthApiException(
    statusCode = 401,
    code = "TWO_FACTOR_REQUIRED",
    details = mapOf(
        "challengeId" to "challenge-a",
        "method" to "app",
        "expiresAt" to "2099-01-01T00:05:00.000Z",
    ),
    message = "Two-factor challenge required",
)

private val ACCOUNT_A = FirebaseOwnerBinding(
    firebaseUserId = "firebase-a",
    email = "a@example.com",
    sessionEpoch = 1L,
)
private val ACCOUNT_B = FirebaseOwnerBinding(
    firebaseUserId = "firebase-b",
    email = "b@example.com",
    sessionEpoch = 2L,
)
private val AUTHORITY_A = AuthSessionAuthority("firebase-token-a", 8L)
private val AUTHORITY_B = AuthSessionAuthority("firebase-token-b", 9L)
