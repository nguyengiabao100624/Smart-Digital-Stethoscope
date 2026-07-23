package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthSession
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.TwoFactorAvailability
import com.example.smart_health_android.data.TwoFactorEnrollment
import com.example.smart_health_android.data.TwoFactorEnrollmentResult
import com.example.smart_health_android.data.TwoFactorState
import com.example.smart_health_android.data.TwoFactorStatusResult
import com.example.smart_health_android.data.TwoFactorVerifiedResult
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class AccountSecurityViewModelTest {
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
    fun `unavailable runtime fails closed and never starts enrollment`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedStatus = status(available = false, enabled = false),
        )
        val viewModel = AccountSecurityViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()

        assertEquals(AccountSecurityLoadState.Unavailable, viewModel.uiState.value.loadState)
        assertEquals(0, repository.startCalls)
        assertFalse(viewModel.uiState.value.twoFactor.enabled)
    }

    @Test
    fun `offline load can retry without becoming a generic error`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(loadFailure = IOException("offline"))
        val viewModel = AccountSecurityViewModel(repository)
        advanceUntilIdle()

        assertEquals(AccountSecurityLoadState.Offline, viewModel.uiState.value.loadState)

        repository.loadFailure = null
        viewModel.onAction(AccountSecurityAction.Retry)
        advanceUntilIdle()

        assertEquals(AccountSecurityLoadState.Ready, viewModel.uiState.value.loadState)
    }

    @Test
    fun `permission failure is distinct from connectivity error`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadFailure = SmartHealthApiException(
                statusCode = 403,
                code = "FORBIDDEN",
                message = "forbidden",
            ),
        )
        val viewModel = AccountSecurityViewModel(repository)
        advanceUntilIdle()

        assertEquals(AccountSecurityLoadState.PermissionDenied, viewModel.uiState.value.loadState)
    }

    @Test
    fun `starting enrollment keeps 2FA disabled until verification`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository()
        val viewModel = AccountSecurityViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()

        assertEquals(TwoFactorSetupStep.Verify, viewModel.uiState.value.step)
        assertFalse(viewModel.uiState.value.twoFactor.enabled)
        assertTrue(viewModel.uiState.value.twoFactor.enrollmentPending)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
    }

    @Test
    fun `server verified OTP is the only transition to enabled`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository()
        val viewModel = AccountSecurityViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.OtpChanged("12ab3456"))
        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()

        assertEquals("123456", repository.lastOtp)
        assertEquals(1, repository.verifyCalls)
        assertTrue(viewModel.uiState.value.twoFactor.enabled)
        assertEquals(TwoFactorSetupStep.Recovery, viewModel.uiState.value.step)
        assertEquals(8, viewModel.uiState.value.recoveryCodes.size)
    }

    @Test
    fun `failed verification preserves disabled state and shows retryable error`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(verifyFailure = IllegalStateException("Mã OTP chưa đúng"))
        val viewModel = AccountSecurityViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))

        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.twoFactor.enabled)
        assertEquals(TwoFactorSetupStep.Verify, viewModel.uiState.value.step)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
        assertEquals("Mã OTP chưa đúng", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `recovery codes cannot disappear before explicit acknowledgement`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository()
        val viewModel = AccountSecurityViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.CompleteRecovery)
        assertEquals(TwoFactorSetupStep.Recovery, viewModel.uiState.value.step)

        viewModel.onAction(AccountSecurityAction.RecoveryAcknowledged(true))
        viewModel.onAction(AccountSecurityAction.CompleteRecovery)
        assertEquals(TwoFactorSetupStep.Status, viewModel.uiState.value.step)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
    }

    @Test
    fun `session revoke retries with stable idempotency key and waits for server confirmation`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedSessions = listOf(remoteSession),
            revokeFailuresRemaining = 1,
        )
        val viewModel = AccountSecurityViewModel(repository) { "stable_revoke_key" }
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.sessions.single().revokedAt == null)

        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()

        assertEquals(listOf("stable_revoke_key", "stable_revoke_key"), repository.revokeKeys)
        assertTrue(viewModel.uiState.value.sessions.single().revokedAt != null)
    }

    @Test
    fun `unconfirmed session response never creates local success`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedSessions = listOf(remoteSession),
            confirmRevocation = false,
        )
        val viewModel = AccountSecurityViewModel(repository) { "unconfirmed_key" }
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.sessions.single().revokedAt == null)
        assertTrue(viewModel.uiState.value.sessionRevokeUnconfirmed)
    }
}

private class FakeSecurityRepository(
    var loadedStatus: TwoFactorStatusResult = status(available = true, enabled = false),
    var loadFailure: Throwable? = null,
    private val loadedSessions: List<AuthSession> = emptyList(),
    private val verifyFailure: Throwable? = null,
    private var revokeFailuresRemaining: Int = 0,
    private val confirmRevocation: Boolean = true,
) : AccountSecurityRepository {
    var startCalls = 0
    var verifyCalls = 0
    var lastOtp = ""
    val revokeKeys = mutableListOf<String>()

    override suspend fun status(): TwoFactorStatusResult = loadFailure?.let { throw it } ?: loadedStatus
    override suspend fun sessions(): List<AuthSession> = loadedSessions
    override suspend fun startEnrollment(): TwoFactorEnrollmentResult {
        startCalls += 1
        return TwoFactorEnrollmentResult(
            twoFactor = TwoFactorState(enabled = false, enrollmentPending = true),
            enrollment = TwoFactorEnrollment(
                id = "enroll_1",
                method = "app",
                manualKey = "JBSWY3DPEHPK3PXP",
                otpauthUri = "otpauth://totp/Shcare:user",
                expiresAt = "2099-01-01T00:00:00.000Z",
            ),
        )
    }

    override suspend fun verifyEnrollment(
        enrollmentId: String,
        code: String,
    ): TwoFactorVerifiedResult {
        verifyCalls += 1
        lastOtp = code
        verifyFailure?.let { throw it }
        return TwoFactorVerifiedResult(
            twoFactor = TwoFactorState(enabled = true, method = "app"),
            recoveryCodes = List(8) { index -> "CODE-${index + 1}" },
            twoFactorToken = "verified-token",
            tokenExpiresAt = "2099-01-01T01:00:00.000Z",
        )
    }

    override suspend fun disable(code: String): TwoFactorState = TwoFactorState(enabled = false)
    override suspend fun revokeSession(sessionId: String, idempotencyKey: String): AuthSession {
        revokeKeys += idempotencyKey
        if (revokeFailuresRemaining > 0) {
            revokeFailuresRemaining -= 1
            error("temporary failure")
        }
        return loadedSessions.first { it.id == sessionId }.copy(
            revokedAt = if (confirmRevocation) "2026-07-14T00:00:00.000Z" else null,
        )
    }
}

private val remoteSession = AuthSession(
    id = "session_remote",
    device = "Chrome",
    current = false,
)

private fun status(available: Boolean, enabled: Boolean) = TwoFactorStatusResult(
    availability = TwoFactorAvailability(
        available = available,
        status = if (available) "available" else "unavailable",
        methods = if (available) listOf("app") else emptyList(),
        reason = if (available) "" else "secure_storage_not_configured",
    ),
    twoFactor = TwoFactorState(
        enabled = enabled,
        method = if (enabled) "app" else "",
        enrollmentPending = false,
    ),
)
