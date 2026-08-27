package com.example.smart_health_android.security

import com.example.smart_health_android.data.FirebaseOwnerBinding
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class EmailVerificationViewModelTest {
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
    fun `check is single flight and emits verified account type only after repository confirmation`() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<EmailVerificationCheckResult>()
            val repository = FakeEmailVerificationRepository(
                check = { gate.await() },
            )
            val viewModel = EmailVerificationViewModel(repository)
            val effect = async { viewModel.effects.first() }

            viewModel.onAction(EmailVerificationUiAction.CheckStatus)
            viewModel.onAction(EmailVerificationUiAction.CheckStatus)
            runCurrent()

            assertEquals(1, repository.checkCalls)
            assertTrue(viewModel.uiState.value.isChecking)
            gate.complete(
                EmailVerificationCheckResult.Verified(
                    accountType = "doctor",
                    firebaseOwner = PINNED_FIREBASE_OWNER,
                ),
            )
            advanceUntilIdle()

            assertEquals(
                EmailVerificationUiEffect.Verified(
                    accountType = "doctor",
                    firebaseOwner = PINNED_FIREBASE_OWNER,
                ),
                effect.await(),
            )
            assertTrue(viewModel.uiState.value.isVerified)
            assertEquals("doctor", viewModel.uiState.value.verifiedAccountType)
            assertFalse(viewModel.uiState.value.isChecking)
        }

    @Test
    fun `resend starts ViewModel-owned cooldown and blocks duplicate provider calls`() =
        runTest(dispatcher) {
            val repository = FakeEmailVerificationRepository(
                resendBlock = { EmailVerificationResendOutcome.Sent },
            )
            val viewModel = EmailVerificationViewModel(
                repository = repository,
                resendCooldownSeconds = 60,
                cooldownClock = object : EmailVerificationCooldownClock {
                    override fun elapsedRealtimeMillis(): Long = testScheduler.currentTime

                    override suspend fun delayMillis(durationMillis: Long) {
                        delay(durationMillis)
                    }
                },
            )

            viewModel.onAction(EmailVerificationUiAction.Resend)
            runCurrent()
            assertEquals(1, repository.resendCalls)
            assertEquals(60, viewModel.uiState.value.resendCooldownSeconds)

            viewModel.onAction(EmailVerificationUiAction.Resend)
            advanceTimeBy(1_000)
            runCurrent()

            assertEquals(1, repository.resendCalls)
            assertEquals(59, viewModel.uiState.value.resendCooldownSeconds)
        }

    @Test
    fun `back is ignored while verification is in flight`() = runTest(dispatcher) {
        val gate = CompletableDeferred<EmailVerificationCheckResult>()
        val repository = FakeEmailVerificationRepository(check = { gate.await() })
        val viewModel = EmailVerificationViewModel(repository)

        viewModel.onAction(EmailVerificationUiAction.CheckStatus)
        viewModel.onAction(EmailVerificationUiAction.BackRequested)
        runCurrent()

        assertTrue(viewModel.uiState.value.isChecking)
        gate.complete(EmailVerificationCheckResult.Pending)
        advanceUntilIdle()

        val back = async { viewModel.effects.first() }
        viewModel.onAction(EmailVerificationUiAction.BackRequested)
        runCurrent()
        assertEquals(EmailVerificationUiEffect.NavigateBack, back.await())
    }

    @Test
    fun `repository failure is shown without local verification success`() = runTest(dispatcher) {
        val repository = FakeEmailVerificationRepository(
            check = { error("network unavailable") },
        )
        val viewModel = EmailVerificationViewModel(repository)

        viewModel.onAction(EmailVerificationUiAction.CheckStatus)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isVerified)
        assertFalse(viewModel.uiState.value.isChecking)
        assertEquals(
            "Không thể kiểm tra trạng thái xác thực email.",
            viewModel.uiState.value.errorMessage,
        )
    }

    @Test
    fun `already verified resend uses backend-confirmed account type without cooldown`() =
        runTest(dispatcher) {
            val repository = FakeEmailVerificationRepository(
                resendBlock = {
                    EmailVerificationResendOutcome.Verified(
                        accountType = "personal",
                        firebaseOwner = PINNED_FIREBASE_OWNER,
                    )
                },
            )
            val viewModel = EmailVerificationViewModel(repository)
            val effect = async { viewModel.effects.first() }

            viewModel.onAction(EmailVerificationUiAction.Resend)
            advanceUntilIdle()

            assertEquals(
                EmailVerificationUiEffect.Verified(
                    accountType = "personal",
                    firebaseOwner = PINNED_FIREBASE_OWNER,
                ),
                effect.await(),
            )
            assertTrue(viewModel.uiState.value.isVerified)
            assertEquals(0, viewModel.uiState.value.resendCooldownSeconds)
        }
}

private val PINNED_FIREBASE_OWNER = FirebaseOwnerBinding(
    firebaseUserId = "firebase-user-1",
    email = "doctor@example.com",
    sessionEpoch = 17L,
)

private class FakeEmailVerificationRepository(
    override val session: EmailVerificationSession = EmailVerificationSession(
        email = "doctor@example.com",
        fallbackAccountType = "doctor",
    ),
    private val check: suspend () -> EmailVerificationCheckResult = {
        EmailVerificationCheckResult.Pending
    },
    private val resendBlock: suspend () -> EmailVerificationResendOutcome = {
        EmailVerificationResendOutcome.Sent
    },
) : EmailVerificationRepository {
    var checkCalls = 0
    var resendCalls = 0

    override suspend fun checkStatus(): EmailVerificationCheckResult {
        checkCalls += 1
        return check()
    }

    override suspend fun resend(): EmailVerificationResendOutcome {
        resendCalls += 1
        return resendBlock()
    }
}
