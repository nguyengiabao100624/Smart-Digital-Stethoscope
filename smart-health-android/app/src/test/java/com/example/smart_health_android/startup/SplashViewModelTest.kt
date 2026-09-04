package com.example.smart_health_android.startup

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.File
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SplashViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `unhealthy backend fails closed before checking identity`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(healthResults = mutableListOf(false))
        val viewModel = SplashViewModel(gateway)

        advanceUntilIdle()

        assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
        assertEquals(1, gateway.healthCalls)
        assertEquals(0, gateway.sessionCalls)
        assertEquals(0, gateway.authenticateCalls)
    }

    @Test
    fun `health exception stays on startup with a recoverable error`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(
            healthFailure = IOException("HTTP 503"),
        )
        val viewModel = SplashViewModel(gateway)

        advanceUntilIdle()

        assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
        assertEquals("Máy chủ chưa phản hồi đúng. Vui lòng thử lại sau.", viewModel.uiState.value.errorMessage)
        assertEquals(0, gateway.sessionCalls)
    }

    @Test
    fun `healthy backend with no Firebase session navigates to login`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(
            initialOwner = null,
            existingSessionToken = null,
        )
        val viewModel = SplashViewModel(gateway)
        val effect = async { viewModel.effects.first() }

        advanceUntilIdle()

        assertEquals(SplashUiEffect.NavigateToLogin, effect.await())
        assertEquals(0, gateway.healthCalls)
        assertEquals(0, gateway.sessionCalls)
        assertEquals(0, gateway.reloadCalls)
        assertEquals(0, gateway.authenticateCalls)
    }

    @Test
    fun `logged out startup never blocks login on backend availability`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(
            healthFailure = IOException("transient backend outage"),
            initialOwner = null,
            existingSessionToken = null,
        )
        val viewModel = SplashViewModel(gateway)
        val effect = async { viewModel.effects.first() }

        advanceUntilIdle()

        assertEquals(SplashUiEffect.NavigateToLogin, effect.await())
        assertEquals(SplashLoadState.Checking, viewModel.uiState.value.loadState)
        assertEquals(0, gateway.healthCalls)
        assertEquals(0, gateway.sessionCalls)
    }

    @Test
    fun `Firebase token failure for an existing session stays recoverable instead of logging out`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                existingSessionFailure = IOException("Firebase token refresh unavailable"),
            )
            val viewModel = SplashViewModel(gateway)

            advanceUntilIdle()

            assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
            assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
            assertEquals(1, gateway.sessionCalls)
            assertEquals(0, gateway.reloadCalls)
            assertEquals(0, gateway.clearSessionCalls)
        }

    @Test
    fun `unverified account preserves pending doctor account type`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(
            verifiedEmail = false,
            pendingAccountType = "doctor",
        )
        val viewModel = SplashViewModel(gateway)
        val effect = async { viewModel.effects.first() }

        advanceUntilIdle()

        assertEquals(
            SplashUiEffect.NavigateToVerifyEmail("doctor", OWNER_A),
            effect.await(),
        )
        assertEquals(0, gateway.authenticateCalls)
    }

    @Test
    fun `unverified account preserves pending solo doctor account type`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(
            verifiedEmail = false,
            pendingAccountType = "solo_doctor",
        )
        val viewModel = SplashViewModel(gateway)
        val effect = async { viewModel.effects.first() }

        advanceUntilIdle()

        assertEquals(
            SplashUiEffect.NavigateToVerifyEmail("solo_doctor", OWNER_A),
            effect.await(),
        )
        assertEquals(0, gateway.authenticateCalls)
    }

    @Test
    fun `unverified account falls back to patient when recovery metadata is absent`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(
            verifiedEmail = false,
            pendingAccountType = "",
        )
        val viewModel = SplashViewModel(gateway)
        val effect = async { viewModel.effects.first() }

        advanceUntilIdle()

        assertEquals(
            SplashUiEffect.NavigateToVerifyEmail("patient", OWNER_A),
            effect.await(),
        )
    }

    @Test
    fun `pending and needs info doctor requests remain on approval screen`() = runTest(dispatcher) {
        for (status in listOf("pending", "needs_info")) {
            val gateway = FakeSplashBootstrapGateway(
                authenticatedUser = AuthUser(
                    id = "doctor-$status",
                    role = "patient",
                    requestedRole = "doctor",
                    roleRequestStatus = status,
                ),
            )
            val viewModel = SplashViewModel(gateway)
            val effect = async { viewModel.effects.first() }

            advanceUntilIdle()

            assertEquals(
                SplashUiEffect.NavigateToDoctorApprovalPending(OWNER_A),
                effect.await(),
            )
        }
    }

    @Test
    fun `all clinical workspace roles navigate to the doctor experience`() = runTest(dispatcher) {
        val clinicalRoles = listOf(
            "doctor",
            "admin",
            "workspace_admin",
            "workspace_owner",
            "nurse",
            "technician",
        )

        for (role in clinicalRoles) {
            val authenticatedUser = AuthUser(id = role, role = role)
            val gateway = FakeSplashBootstrapGateway(
                authenticatedUser = authenticatedUser,
            )
            val viewModel = SplashViewModel(gateway)
            val effect = async { viewModel.effects.first() }

            advanceUntilIdle()

            assertEquals(
                "role=$role",
                SplashUiEffect.Authenticated(authenticatedUser, OWNER_A),
                effect.await(),
            )
        }
    }

    @Test
    fun `only patient role navigates to the patient experience`() = runTest(dispatcher) {
        val authenticatedUser = AuthUser(id = "patient", role = "patient")
        val gateway = FakeSplashBootstrapGateway(authenticatedUser = authenticatedUser)
        val viewModel = SplashViewModel(gateway)
        val effect = async { viewModel.effects.first() }

        advanceUntilIdle()

        assertEquals(
            SplashUiEffect.Authenticated(authenticatedUser, OWNER_A),
            effect.await(),
        )
        assertEquals(0, gateway.clearSessionCalls)
    }

    @Test
    fun `unsupported and unknown roles fail closed to a clean login`() = runTest(dispatcher) {
        for (role in listOf("viewer", "billing", "")) {
            val gateway = FakeSplashBootstrapGateway(
                authenticatedUser = AuthUser(id = role.ifBlank { "unknown" }, role = role),
            )
            val viewModel = SplashViewModel(gateway)
            val effect = async { viewModel.effects.first() }

            advanceUntilIdle()

            assertEquals("role=$role", SplashUiEffect.NavigateToLogin, effect.await())
            assertEquals("role=$role", 1, gateway.clearSessionCalls)
            assertEquals("role=$role", 0, gateway.pushCalls)
        }
    }

    @Test
    fun `restored session requiring two factor returns to clean login instead of retry loop`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                authenticateFailure = SmartHealthApiException(
                    statusCode = 403,
                    code = "TWO_FACTOR_CHALLENGE_REQUIRED",
                    details = mapOf(
                        "challengeId" to "challenge-restored",
                        "method" to "app",
                        "expiresAt" to "2026-07-23T23:00:00.000Z",
                    ),
                    message = "Cần hoàn tất xác thực hai yếu tố.",
                ),
            )
            val viewModel = SplashViewModel(gateway)
            val effect = async { viewModel.effects.first() }

            advanceUntilIdle()

            assertEquals(SplashUiEffect.NavigateToLogin, effect.await())
            assertEquals(1, gateway.authenticateCalls)
            assertEquals(1, gateway.clearSessionCalls)
            assertEquals(0, gateway.pushCalls)
        }

    @Test
    fun `restored session rejected by backend returns to clean login instead of offline error`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                authenticateFailure = SmartHealthApiException(
                    statusCode = 401,
                    code = "AUTH_TOKEN_INVALID",
                    message = "invalid token",
                ),
            )
            val viewModel = SplashViewModel(gateway)
            val effect = async { viewModel.effects.first() }

            advanceUntilIdle()

            assertEquals(SplashUiEffect.NavigateToLogin, effect.await())
            assertEquals(1, gateway.authenticateCalls)
            assertEquals(1, gateway.clearSessionCalls)
            assertEquals(SplashLoadState.Checking, viewModel.uiState.value.loadState)
        }

    @Test
    fun `push registration failure cannot block authenticated navigation`() = runTest(dispatcher) {
        val authenticatedUser = AuthUser(
            id = "doctor",
            role = "doctor",
            currentWorkspaceId = "workspace-doctor",
        )
        val gateway = FakeSplashBootstrapGateway(
            authenticatedUser = authenticatedUser,
            pushFailure = IOException("provider unavailable"),
        )
        val viewModel = SplashViewModel(gateway)
        val effect = async { viewModel.effects.first() }

        advanceUntilIdle()

        assertEquals(
            SplashUiEffect.Authenticated(authenticatedUser, OWNER_A),
            effect.await(),
        )
        assertEquals(1, gateway.pushCalls)
        assertEquals(authenticatedUser, gateway.lastPushUser)
    }

    @Test
    fun `retry starts one new bootstrap attempt after failure`() = runTest(dispatcher) {
        val gateway = FakeSplashBootstrapGateway(
            healthResults = mutableListOf(false, true),
        )
        val viewModel = SplashViewModel(gateway)
        advanceUntilIdle()
        assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)

        val effect = async { viewModel.effects.first() }
        viewModel.onAction(SplashUiAction.Retry)
        viewModel.onAction(SplashUiAction.Retry)
        advanceUntilIdle()

        val authenticated = effect.await()
        assertTrue(authenticated is SplashUiEffect.Authenticated)
        authenticated as SplashUiEffect.Authenticated
        assertEquals("patient", authenticated.user.id)
        assertEquals("patient", authenticated.user.role)
        assertEquals(OWNER_A, authenticated.firebaseOwner)
        assertEquals(2, gateway.healthCalls)
        assertEquals(1, gateway.sessionCalls)
    }

    @Test
    fun `owner replacement after token lookup cannot continue the old bootstrap`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                ownerAfterSessionToken = OWNER_B,
            )
            val viewModel = SplashViewModel(gateway)

            advanceUntilIdle()

            assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
            assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
            assertEquals(0, gateway.reloadCalls)
            assertEquals(0, gateway.authenticateCalls)
            assertEquals(0, gateway.clearSessionCalls)
        }

    @Test
    fun `owner replacement after every other bootstrap suspension fails closed`() =
        runTest(dispatcher) {
            val gateways = listOf(
                FakeSplashBootstrapGateway(ownerAfterHealth = OWNER_B),
                FakeSplashBootstrapGateway(ownerAfterReload = OWNER_B),
                FakeSplashBootstrapGateway(
                    verifiedEmail = false,
                    ownerAfterPendingAccountType = OWNER_B,
                ),
            )

            gateways.forEach { gateway ->
                val viewModel = SplashViewModel(gateway)
                advanceUntilIdle()

                assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
                assertEquals(0, gateway.clearSessionCalls)
            }
        }

    @Test
    fun `Firebase sign-out during bootstrap returns to login instead of showing a network error`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(signOutAfterReload = true)
            val viewModel = SplashViewModel(gateway)
            val effect = async { viewModel.effects.first() }

            advanceUntilIdle()

            assertEquals(SplashUiEffect.NavigateToLogin, effect.await())
            assertEquals(SplashLoadState.Checking, viewModel.uiState.value.loadState)
            assertEquals(1, gateway.reloadCalls)
            assertEquals(0, gateway.authenticateCalls)
            assertEquals(0, gateway.clearSessionCalls)
        }

    @Test
    fun `ABA owner replacement after authentication is rejected by the pinned epoch`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                ownerAfterAuthenticate = OWNER_A.copy(sessionEpoch = 3L),
            )
            val viewModel = SplashViewModel(gateway)

            advanceUntilIdle()

            assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
            assertEquals(1, gateway.authenticateCalls)
            assertEquals(0, gateway.pushCalls)
            assertEquals(0, gateway.clearSessionCalls)
        }

    @Test
    fun `replacement account is never torn down by a stale two factor bootstrap`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                authenticateFailure = SmartHealthApiException(
                    statusCode = 403,
                    code = "TWO_FACTOR_CHALLENGE_REQUIRED",
                    details = mapOf(
                        "challengeId" to "challenge-stale",
                        "method" to "app",
                        "expiresAt" to "2026-07-23T23:00:00.000Z",
                    ),
                    message = "Cần hoàn tất xác thực hai yếu tố.",
                ),
                ownerAfterAuthenticate = OWNER_B,
            )
            val viewModel = SplashViewModel(gateway)

            advanceUntilIdle()

            assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
            assertEquals(OWNER_B, gateway.currentOwner)
            assertEquals(0, gateway.clearSessionCalls)
        }

    @Test
    fun `failed owner bound cleanup cannot manufacture login navigation`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                authenticatedUser = AuthUser(id = "unsupported", role = "viewer"),
                clearSessionResult = false,
            )
            val viewModel = SplashViewModel(gateway)

            advanceUntilIdle()

            assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
            assertEquals(1, gateway.clearSessionCalls)
            assertEquals(OWNER_A, gateway.currentOwner)
        }

    @Test
    fun `owner replacement during best effort push cannot emit stale authenticated authority`() =
        runTest(dispatcher) {
            val gateway = FakeSplashBootstrapGateway(
                ownerAfterPush = OWNER_B,
            )
            val viewModel = SplashViewModel(gateway)

            advanceUntilIdle()

            assertEquals(SplashLoadState.Error, viewModel.uiState.value.loadState)
            assertEquals(1, gateway.pushCalls)
            assertEquals(0, gateway.clearSessionCalls)
        }

    @Test
    fun `default gateway uses only expected owner Firebase and teardown operations`() {
        val source = projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/startup/SplashViewModel.kt")
            .readText()

        assertTrue(source.contains("FirebaseAuthService.getFreshIdToken(\n            expectedOwner = owner"))
        assertTrue(source.contains("FirebaseAuthService.reloadCurrentUser(owner)"))
        assertTrue(source.contains("FirebaseAuthService.isCurrentOwner(owner)"))
        assertTrue(source.contains("terminateIfCurrentFirebaseOwner(owner)"))
        assertTrue(
            source.contains(
                "authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)",
            ),
        )
        assertFalse(source.contains("FirebaseAuthService.getFreshIdToken(forceRefresh"))
        assertFalse(source.contains("SmartHealthSessionTerminator.terminate()"))
        val ownerBoundClear = source
            .substringAfter("override suspend fun clearSession(): Boolean")
            .substringBefore("\n    }", missingDelimiterValue = "")
        assertFalse(ownerBoundClear.contains("authorityStore.clear()"))
    }

    private fun projectDirectory(): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory,
            workingDirectory.resolve("app"),
        ).firstOrNull { candidate ->
            candidate.resolve("src/main/java").isDirectory
        } ?: error("Cannot locate Android app module from ${workingDirectory.absolutePath}")
    }
}

private class FakeSplashBootstrapGateway(
    private val healthResults: MutableList<Boolean> = mutableListOf(true),
    private val healthFailure: Throwable? = null,
    private val existingSessionToken: String? = "firebase-token",
    private val existingSessionFailure: Throwable? = null,
    private val verifiedEmail: Boolean = true,
    private val pendingAccountType: String = "patient",
    private val authenticatedUser: AuthUser = AuthUser(id = "patient", role = "patient"),
    private val authenticateFailure: Throwable? = null,
    private val pushFailure: Throwable? = null,
    initialOwner: FirebaseOwnerBinding? = OWNER_A,
    private val ownerAfterHealth: FirebaseOwnerBinding? = null,
    private val ownerAfterSessionToken: FirebaseOwnerBinding? = null,
    private val ownerAfterReload: FirebaseOwnerBinding? = null,
    private val signOutAfterReload: Boolean = false,
    private val ownerAfterPendingAccountType: FirebaseOwnerBinding? = null,
    private val ownerAfterAuthenticate: FirebaseOwnerBinding? = null,
    private val ownerAfterPush: FirebaseOwnerBinding? = null,
    private val clearSessionResult: Boolean = true,
) : SplashBootstrapGateway {
    var currentOwner: FirebaseOwnerBinding? = initialOwner
        private set
    private var pinnedOwner: FirebaseOwnerBinding? = null
    private var hasPinnedOwner = false
    var healthCalls: Int = 0
        private set
    var sessionCalls: Int = 0
        private set
    var reloadCalls: Int = 0
        private set
    var authenticateCalls: Int = 0
        private set
    var pushCalls: Int = 0
        private set
    var lastPushUser: AuthUser? = null
        private set
    var clearSessionCalls: Int = 0
        private set

    override suspend fun checkHealth(): Boolean {
        healthCalls += 1
        healthFailure?.let { throw it }
        val result = if (healthResults.size > 1) healthResults.removeAt(0) else healthResults.first()
        ownerAfterHealth?.let { currentOwner = it }
        return result
    }

    override suspend fun existingSessionToken(): String? {
        sessionCalls += 1
        existingSessionFailure?.let { throw it }
        ownerAfterSessionToken?.let { currentOwner = it }
        return existingSessionToken
    }

    override fun pinnedFirebaseOwner(): FirebaseOwnerBinding? {
        pinnedOwner = currentOwner
        hasPinnedOwner = true
        return pinnedOwner
    }

    override fun sessionIsCurrent(): Boolean =
        hasPinnedOwner && currentOwner == pinnedOwner

    override fun hasNoCurrentFirebaseOwner(): Boolean = currentOwner == null

    override suspend fun reloadCurrentUser(): Boolean {
        reloadCalls += 1
        if (signOutAfterReload) currentOwner = null
        ownerAfterReload?.let { currentOwner = it }
        return verifiedEmail
    }

    override suspend fun pendingAccountType(): String {
        ownerAfterPendingAccountType?.let { currentOwner = it }
        return pendingAccountType
    }

    override suspend fun authenticateCurrentUser(): AuthUser {
        authenticateCalls += 1
        ownerAfterAuthenticate?.let { currentOwner = it }
        authenticateFailure?.let { throw it }
        return authenticatedUser
    }

    override suspend fun registerPushBestEffort(user: AuthUser) {
        pushCalls += 1
        lastPushUser = user
        ownerAfterPush?.let { currentOwner = it }
        pushFailure?.let { throw it }
    }

    override suspend fun clearSession(): Boolean {
        clearSessionCalls += 1
        if (!clearSessionResult || !sessionIsCurrent()) return false
        currentOwner = null
        return true
    }
}

private val OWNER_A = FirebaseOwnerBinding(
    firebaseUserId = "firebase-a",
    email = "a@shcare.vn",
    sessionEpoch = 1L,
)

private val OWNER_B = FirebaseOwnerBinding(
    firebaseUserId = "firebase-b",
    email = "b@shcare.vn",
    sessionEpoch = 2L,
)
