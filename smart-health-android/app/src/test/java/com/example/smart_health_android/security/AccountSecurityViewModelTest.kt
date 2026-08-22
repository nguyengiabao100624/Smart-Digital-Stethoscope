package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthSession
import com.example.smart_health_android.data.AuthSessionRevocationReceipt
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.TwoFactorAvailability
import com.example.smart_health_android.data.TwoFactorEnrollment
import com.example.smart_health_android.data.TwoFactorEnrollmentIntent
import com.example.smart_health_android.data.TwoFactorEnrollmentResult
import com.example.smart_health_android.data.TwoFactorEnrollmentStartIntent
import com.example.smart_health_android.data.TwoFactorRecoveryAcknowledgementIntent
import com.example.smart_health_android.data.TwoFactorRecoveryAcknowledgementReceipt
import com.example.smart_health_android.data.TwoFactorRecoveryDelivery
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
import org.junit.Assert.assertNull
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
        val viewModel = securityViewModel(repository)
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
        val viewModel = securityViewModel(repository)
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
        val viewModel = securityViewModel(repository)
        advanceUntilIdle()

        assertEquals(AccountSecurityLoadState.PermissionDenied, viewModel.uiState.value.loadState)
    }

    @Test
    fun `starting enrollment keeps 2FA disabled until verification`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository()
        val viewModel = securityViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()

        assertEquals(TwoFactorSetupStep.Verify, viewModel.uiState.value.step)
        assertFalse(viewModel.uiState.value.twoFactor.enabled)
        assertTrue(viewModel.uiState.value.twoFactor.enrollmentPending)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
        assertEquals("user_fixture", repository.startIntents.single().userId)
        assertEquals(7L, repository.startIntents.single().expectedAuthSessionEpoch)
    }

    @Test
    fun `ambiguous enrollment start retries with one owner and epoch bound key`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(startFailuresRemaining = 1)
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { "stable-start-key" },
        )
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        assertEquals(TwoFactorSetupStep.Status, viewModel.uiState.value.step)

        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()

        assertEquals(listOf("stable-start-key", "stable-start-key"), repository.startKeys)
        assertTrue(repository.startIntents.all { it.userId == "user_fixture" })
        assertTrue(repository.startIntents.all { it.expectedAuthSessionEpoch == 7L })
        assertEquals(TwoFactorSetupStep.Verify, viewModel.uiState.value.step)
    }

    @Test
    fun `verified OTP remains disabled until recovery delivery is acknowledged`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository()
        val viewModel = securityViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.OtpChanged("12ab3456"))
        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()

        assertEquals("123456", repository.lastOtp)
        assertEquals(1, repository.verifyCalls)
        assertFalse(viewModel.uiState.value.twoFactor.enabled)
        assertTrue(viewModel.uiState.value.twoFactor.enrollmentPending)
        assertEquals(TwoFactorSetupStep.Recovery, viewModel.uiState.value.step)
        assertEquals(8, viewModel.uiState.value.recoveryCodes.size)
    }

    @Test
    fun `failed verification preserves disabled state and shows retryable error`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(verifyFailure = IllegalStateException("Mã OTP chưa đúng"))
        val viewModel = securityViewModel(repository)
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
    fun `recovery codes disappear only after exact backend acknowledgement`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository()
        val viewModel = securityViewModel(repository)
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
        advanceUntilIdle()

        assertEquals(1, repository.acknowledgeCalls)
        assertEquals(listOf("stable-enrollment-key"), repository.acknowledgementKeys)
        assertEquals(listOf("recovery-ack-token"), repository.acknowledgementTokens)
        assertEquals(TwoFactorSetupStep.Status, viewModel.uiState.value.step)
        assertTrue(viewModel.uiState.value.twoFactor.enabled)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
    }

    @Test
    fun `canonical recovery acknowledgement retires the completed start intent before a later restart`() =
        runTest(dispatcher) {
            val repository = FakeSecurityRepository()
            val keys = ArrayDeque(listOf("start-key-one", "verify-key-one", "start-key-two"))
            val viewModel = securityViewModel(
                repository,
                createIdempotencyKey = { keys.removeFirst() },
            )
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.StartEnrollment)
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
            viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
            advanceUntilIdle()

            assertEquals("start-key-one", viewModel.uiState.value.enrollmentStartIntent?.idempotencyKey)
            viewModel.onAction(AccountSecurityAction.RecoveryAcknowledged(true))
            viewModel.onAction(AccountSecurityAction.CompleteRecovery)
            advanceUntilIdle()

            assertNull(viewModel.uiState.value.enrollmentStartIntent)
            viewModel.onAction(AccountSecurityAction.RequestDisable)
            viewModel.onAction(AccountSecurityAction.OtpChanged("654321"))
            viewModel.onAction(AccountSecurityAction.ConfirmDisable)
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.StartEnrollment)
            advanceUntilIdle()

            assertEquals(listOf("start-key-one", "start-key-two"), repository.startKeys)
        }

    @Test
    fun `process recreation sees pending disabled state without recoverable plaintext codes`() =
        runTest(dispatcher) {
            val repository = FakeSecurityRepository(
                loadedStatus = TwoFactorStatusResult(
                    availability = TwoFactorAvailability(
                        available = true,
                        status = "available",
                        methods = listOf("app"),
                    ),
                    twoFactor = TwoFactorState(
                        enabled = false,
                        method = "",
                        enrollmentPending = true,
                    ),
                ),
            )

            val recreated = securityViewModel(repository)
            advanceUntilIdle()

            assertFalse(recreated.uiState.value.twoFactor.enabled)
            assertTrue(recreated.uiState.value.twoFactor.enrollmentPending)
            assertTrue(recreated.uiState.value.recoveryCodes.isEmpty())
            assertEquals(TwoFactorSetupStep.Status, recreated.uiState.value.step)
        }

    @Test
    fun `process recreation may create a new safe restart key under the same pinned authority`() =
        runTest(dispatcher) {
            val repository = FakeSecurityRepository(
                loadedStatus = status(available = true, enabled = false).copy(
                    twoFactor = TwoFactorState(
                        enabled = false,
                        method = "",
                        enrollmentPending = true,
                    ),
                ),
            )
            val keys = ArrayDeque(listOf("process-start-key-one", "process-start-key-two"))

            val first = securityViewModel(repository, createIdempotencyKey = { keys.removeFirst() })
            advanceUntilIdle()
            first.onAction(AccountSecurityAction.StartEnrollment)
            advanceUntilIdle()

            val recreated = securityViewModel(repository, createIdempotencyKey = { keys.removeFirst() })
            advanceUntilIdle()
            recreated.onAction(AccountSecurityAction.StartEnrollment)
            advanceUntilIdle()

            assertEquals(
                listOf("process-start-key-one", "process-start-key-two"),
                repository.startKeys,
            )
            assertTrue(repository.startIntents.all { it.userId == "user_fixture" })
            assertTrue(repository.startIntents.all { it.expectedAuthSessionEpoch == 7L })
        }

    @Test
    fun `ambiguous verification retry keeps one owner bound idempotency key`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(verifyFailuresRemaining = 1)
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { "stable-verify-key" },
        )
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))

        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()
        assertEquals(TwoFactorSetupStep.Verify, viewModel.uiState.value.step)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())

        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()

        assertEquals(listOf("stable-verify-key", "stable-verify-key"), repository.verifyKeys)
        assertEquals(TwoFactorSetupStep.Recovery, viewModel.uiState.value.step)
    }

    @Test
    fun `expired enrollment retires the start key before a safe restart`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            verifyFailure = SmartHealthApiException(
                statusCode = 410,
                code = "TWO_FACTOR_ENROLLMENT_EXPIRED",
                message = "Lần thiết lập đã hết hạn.",
            ),
        )
        val keys = ArrayDeque(listOf("start-key-one", "verify-key", "start-key-two"))
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { keys.removeFirst() },
        )
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.CancelStep)
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()

        assertEquals(listOf("start-key-one", "start-key-two"), repository.startKeys)
        assertTrue(repository.startIntents.all { it.userId == "user_fixture" })
        assertTrue(repository.startIntents.all { it.expectedAuthSessionEpoch == 7L })
    }

    @Test
    fun `already used enrollment returns to a safe restart with a fresh start key`() =
        runTest(dispatcher) {
            val repository = FakeSecurityRepository(
                verifyFailure = SmartHealthApiException(
                    statusCode = 410,
                    code = "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
                    message = "Lần thiết lập không còn hiệu lực.",
                ),
            )
            val keys = ArrayDeque(listOf("start-key-one", "verify-key", "start-key-two"))
            val viewModel = securityViewModel(
                repository,
                createIdempotencyKey = { keys.removeFirst() },
            )
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.StartEnrollment)
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
            viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
            advanceUntilIdle()

            assertEquals(TwoFactorSetupStep.Status, viewModel.uiState.value.step)
            assertNull(viewModel.uiState.value.enrollmentStartIntent)
            assertNull(viewModel.uiState.value.enrollment)
            viewModel.onAction(AccountSecurityAction.StartEnrollment)
            advanceUntilIdle()

            assertEquals(listOf("start-key-one", "start-key-two"), repository.startKeys)
        }

    @Test
    fun `expired recovery delivery clears unusable codes but an ambiguous acknowledgement keeps them`() =
        runTest(dispatcher) {
            val repository = FakeSecurityRepository(
                acknowledgementFailure = SmartHealthApiException(
                    statusCode = 410,
                    code = "TWO_FACTOR_DELIVERY_EXPIRED",
                    message = "Thời hạn xác nhận mã khôi phục đã hết.",
                ),
            )
            val viewModel = securityViewModel(repository)
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.StartEnrollment)
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
            viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
            advanceUntilIdle()
            viewModel.onAction(AccountSecurityAction.RecoveryAcknowledged(true))
            viewModel.onAction(AccountSecurityAction.CompleteRecovery)
            advanceUntilIdle()

            assertEquals(TwoFactorSetupStep.Status, viewModel.uiState.value.step)
            assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
            assertNull(viewModel.uiState.value.enrollmentStartIntent)
            assertFalse(viewModel.uiState.value.twoFactor.enabled)
        }

    @Test
    fun `ambiguous acknowledgement keeps codes and reuses verification key`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(acknowledgementFailuresRemaining = 1)
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { "stable-ack-key" },
        )
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.RecoveryAcknowledged(true))

        viewModel.onAction(AccountSecurityAction.CompleteRecovery)
        advanceUntilIdle()
        assertEquals(8, viewModel.uiState.value.recoveryCodes.size)
        assertEquals(TwoFactorSetupStep.Recovery, viewModel.uiState.value.step)

        viewModel.onAction(AccountSecurityAction.CompleteRecovery)
        advanceUntilIdle()

        assertEquals(listOf("stable-ack-key", "stable-ack-key"), repository.acknowledgementKeys)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
        assertEquals(TwoFactorSetupStep.Status, viewModel.uiState.value.step)
    }

    @Test
    fun `mismatched acknowledgement never clears recovery codes`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            acknowledgementUserId = "user_foreign",
            acknowledgementDeliveryId = "delivery_foreign",
        )
        val viewModel = securityViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.RecoveryAcknowledged(true))
        viewModel.onAction(AccountSecurityAction.CompleteRecovery)
        advanceUntilIdle()

        assertEquals(TwoFactorSetupStep.Recovery, viewModel.uiState.value.step)
        assertEquals(8, viewModel.uiState.value.recoveryCodes.size)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }

    @Test
    fun `cancel cannot discard unacknowledged recovery codes`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository()
        val viewModel = securityViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))
        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.CancelStep)
        viewModel.onAction(AccountSecurityAction.RecoveryExitAttempted)

        assertEquals(TwoFactorSetupStep.Recovery, viewModel.uiState.value.step)
        assertEquals(8, viewModel.uiState.value.recoveryCodes.size)
        assertTrue(viewModel.uiState.value.recoveryExitBlocked)
    }

    @Test
    fun `late verification is rejected after account session epoch changes`() = runTest(dispatcher) {
        var currentAuthority = true
        val repository = FakeSecurityRepository()
        val viewModel = securityViewModel(repository, authorityIsCurrent = { currentAuthority })
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.StartEnrollment)
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.OtpChanged("123456"))

        viewModel.onAction(AccountSecurityAction.VerifyEnrollment)
        currentAuthority = false
        advanceUntilIdle()

        assertEquals(AccountSecurityLoadState.PermissionDenied, viewModel.uiState.value.loadState)
        assertTrue(viewModel.uiState.value.recoveryCodes.isEmpty())
    }

    @Test
    fun `session revoke retries with stable idempotency key and waits for server confirmation`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedSessions = listOf(remoteSession),
            revokeFailuresRemaining = 1,
        )
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { "stable_revoke_key" },
        )
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
    fun `definitive idempotency collision retires the key before a new user retry`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedSessions = listOf(remoteSession),
            revokeFailure = SmartHealthApiException(
                statusCode = 409,
                code = "IDEMPOTENCY_KEY_REUSED",
                message = "collision",
            ),
        )
        val keys = ArrayDeque(listOf("collision_key", "fresh_key"))
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { keys.removeFirst() },
        )
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()
        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()

        assertEquals(listOf("collision_key", "fresh_key"), repository.revokeKeys)
        assertTrue(viewModel.uiState.value.sessions.single().revokedAt != null)
    }

    @Test
    fun `unconfirmed session response never creates local success`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedSessions = listOf(remoteSession),
            confirmRevocation = false,
        )
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { "unconfirmed_key" },
        )
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.sessions.single().revokedAt == null)
        assertTrue(viewModel.uiState.value.sessionRevokeUnconfirmed)
    }

    @Test
    fun `unconfirmed receipt retry keeps the idempotency key until canonical confirmation`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedSessions = listOf(remoteSession),
            confirmRevocation = false,
        )
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { "stable_unconfirmed_key" },
        )
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()
        repository.confirmRevocation = true
        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()

        assertEquals(
            listOf("stable_unconfirmed_key", "stable_unconfirmed_key"),
            repository.revokeKeys,
        )
        assertTrue(viewModel.uiState.value.sessions.single().revokedAt != null)
        assertFalse(viewModel.uiState.value.sessionRevokeUnconfirmed)
    }

    @Test
    fun `receipt for another session fails closed without replacing the target`() = runTest(dispatcher) {
        val repository = FakeSecurityRepository(
            loadedSessions = listOf(remoteSession),
            receiptSessionId = "session_foreign",
        )
        val viewModel = securityViewModel(
            repository,
            createIdempotencyKey = { "target_mismatch_key" },
        )
        advanceUntilIdle()

        viewModel.onAction(AccountSecurityAction.RevokeSession(remoteSession.id))
        advanceUntilIdle()

        assertEquals(remoteSession.id, viewModel.uiState.value.sessions.single().id)
        assertTrue(viewModel.uiState.value.sessions.single().revokedAt == null)
        assertTrue(viewModel.uiState.value.sessionRevokeUnconfirmed)
    }
}

private class FakeSecurityRepository(
    var loadedStatus: TwoFactorStatusResult = status(available = true, enabled = false),
    var loadFailure: Throwable? = null,
    private val loadedSessions: List<AuthSession> = emptyList(),
    private var startFailuresRemaining: Int = 0,
    private val verifyFailure: Throwable? = null,
    private var verifyFailuresRemaining: Int = 0,
    private var acknowledgementFailuresRemaining: Int = 0,
    private val acknowledgementFailure: Throwable? = null,
    private val acknowledgementUserId: String? = null,
    private val acknowledgementDeliveryId: String? = null,
    private var revokeFailuresRemaining: Int = 0,
    var revokeFailure: Throwable? = null,
    var confirmRevocation: Boolean = true,
    private val receiptSessionId: String? = null,
) : AccountSecurityRepository {
    var startCalls = 0
    val startIntents = mutableListOf<TwoFactorEnrollmentStartIntent>()
    val startKeys = mutableListOf<String>()
    var verifyCalls = 0
    var lastOtp = ""
    val verifyKeys = mutableListOf<String>()
    val acknowledgementKeys = mutableListOf<String>()
    val acknowledgementTokens = mutableListOf<String>()
    var acknowledgeCalls = 0
    val revokeKeys = mutableListOf<String>()

    override suspend fun status(): TwoFactorStatusResult = loadFailure?.let { throw it } ?: loadedStatus
    override suspend fun sessions(): List<AuthSession> = loadedSessions
    override suspend fun startEnrollment(
        intent: TwoFactorEnrollmentStartIntent,
    ): TwoFactorEnrollmentResult {
        startCalls += 1
        startIntents += intent
        startKeys += intent.idempotencyKey
        if (startFailuresRemaining > 0) {
            startFailuresRemaining -= 1
            throw IOException("ambiguous enrollment response loss")
        }
        return TwoFactorEnrollmentResult(
            userId = intent.userId,
            twoFactor = TwoFactorState(enabled = false, enrollmentPending = true),
            enrollment = TwoFactorEnrollment(
                id = "enroll_1",
                method = "app",
                manualKey = "JBSWY3DPEHPK3PXP",
                otpauthUri = "otpauth://totp/Shcare:user",
                expiresAt = "2099-01-01T00:00:00.000Z",
            ),
            replayed = startCalls > 1,
            superseded = false,
        )
    }

    override suspend fun verifyEnrollment(intent: TwoFactorEnrollmentIntent): TwoFactorVerifiedResult {
        verifyCalls += 1
        lastOtp = intent.code
        verifyKeys += intent.idempotencyKey
        verifyFailure?.let { throw it }
        if (verifyFailuresRemaining > 0) {
            verifyFailuresRemaining -= 1
            throw IOException("ambiguous response loss")
        }
        return TwoFactorVerifiedResult(
            userId = intent.userId,
            enrollmentId = intent.enrollmentId,
            twoFactor = TwoFactorState(enabled = false, enrollmentPending = true),
            recoveryCodes = List(8) { index -> "%06X-%06X".format(index + 1, index + 11) },
            recoveryDelivery = TwoFactorRecoveryDelivery(
                id = "delivery_1",
                expiresAt = "2099-01-01T01:00:00.000Z",
                acknowledged = false,
            ),
            recoveryAckToken = "recovery-ack-token",
            replayed = false,
        )
    }

    override suspend fun acknowledgeRecoveryCodes(
        intent: TwoFactorRecoveryAcknowledgementIntent,
    ): TwoFactorRecoveryAcknowledgementReceipt {
        acknowledgeCalls += 1
        acknowledgementKeys += intent.idempotencyKey
        acknowledgementTokens += intent.recoveryAckToken
        acknowledgementFailure?.let { throw it }
        if (acknowledgementFailuresRemaining > 0) {
            acknowledgementFailuresRemaining -= 1
            throw IOException("ambiguous acknowledgement response loss")
        }
        return TwoFactorRecoveryAcknowledgementReceipt(
            userId = acknowledgementUserId ?: intent.userId,
            enrollmentId = intent.enrollmentId,
            twoFactor = TwoFactorState(enabled = true, method = "app"),
            recoveryDelivery = TwoFactorRecoveryDelivery(
                id = acknowledgementDeliveryId ?: intent.deliveryId,
                expiresAt = "2099-01-01T01:00:00.000Z",
                acknowledged = true,
                acknowledgedAt = "2026-08-09T01:00:00.000Z",
            ),
            twoFactorToken = "enabled-two-factor-token",
            tokenExpiresAt = "2099-01-01T01:00:00.000Z",
            replayed = false,
        )
    }

    override suspend fun disable(code: String): TwoFactorState = TwoFactorState(enabled = false)
    override suspend fun revokeSession(
        sessionId: String,
        idempotencyKey: String,
    ): AuthSessionRevocationReceipt {
        revokeKeys += idempotencyKey
        revokeFailure?.let { failure ->
            revokeFailure = null
            throw failure
        }
        if (revokeFailuresRemaining > 0) {
            revokeFailuresRemaining -= 1
            error("temporary failure")
        }
        return AuthSessionRevocationReceipt(
            session = loadedSessions.first { it.id == sessionId }.copy(
                id = receiptSessionId ?: sessionId,
                revokedAt = if (confirmRevocation) "2026-07-14T00:00:00.000Z" else null,
            ),
            revoked = confirmRevocation,
            replayed = false,
        )
    }
}

private val remoteSession = AuthSession(
    id = "session_remote",
    provider = "firebase",
    device = "Chrome",
    current = false,
    createdAt = "2026-07-13T23:00:00.000Z",
    lastSeenAt = "2026-07-14T00:00:00.000Z",
)

private fun securityViewModel(
    repository: AccountSecurityRepository,
    createIdempotencyKey: () -> String = { "stable-enrollment-key" },
    authorityIsCurrent: () -> Boolean = { true },
): AccountSecurityViewModel = AccountSecurityViewModel(
    repository = repository,
    createIdempotencyKey = createIdempotencyKey,
    expectedUserId = "user_fixture",
    expectedAuthSessionEpoch = 7L,
    authorityIsCurrent = authorityIsCurrent,
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
