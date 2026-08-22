package com.example.smart_health_android.security

import com.example.smart_health_android.data.FirebaseOwnerBinding
import java.io.IOException
import java.util.ArrayDeque
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ForgotPasswordViewModelTest {
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
    fun `blank or malformed email is rejected before repository dispatch`() = runTest(dispatcher) {
        val repository = FakeForgotPasswordRepository()
        val viewModel = ForgotPasswordViewModel(repository)

        viewModel.onAction(ForgotPasswordUiAction.Submit)
        assertEquals(ForgotPasswordError.InvalidEmail, viewModel.uiState.value.emailError)

        viewModel.onAction(ForgotPasswordUiAction.EmailChanged("not-an-email"))
        viewModel.onAction(ForgotPasswordUiAction.Submit)

        assertEquals(ForgotPasswordError.InvalidEmail, viewModel.uiState.value.emailError)
        assertEquals(0, repository.requestCalls)
    }

    @Test
    fun `submit guard closes synchronously before the request coroutine starts`() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<Unit>()
            val repository = FakeForgotPasswordRepository(gate = gate)
            val viewModel = ForgotPasswordViewModel(repository)
            viewModel.onAction(ForgotPasswordUiAction.EmailChanged(" Patient@Example.com "))

            viewModel.onAction(ForgotPasswordUiAction.Submit)
            viewModel.onAction(ForgotPasswordUiAction.Submit)

            assertTrue(viewModel.uiState.value.isSubmitting)
            runCurrent()
            assertEquals(1, repository.requestCalls)
            assertEquals(listOf("patient@example.com"), repository.requestedEmails)

            gate.complete(Unit)
            advanceUntilIdle()
            assertEquals("patient@example.com", viewModel.uiState.value.sentEmail)
        }

    @Test
    fun `offline failure is retryable and success requires a matching receipt`() =
        runTest(dispatcher) {
            val repository = FakeForgotPasswordRepository(
                failures = ArrayDeque(
                    listOf(
                        ForgotPasswordRequestException(ForgotPasswordError.Offline),
                    ),
                ),
            )
            val viewModel = ForgotPasswordViewModel(repository)
            viewModel.onAction(ForgotPasswordUiAction.EmailChanged("patient@example.com"))

            viewModel.onAction(ForgotPasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(ForgotPasswordError.Offline, viewModel.uiState.value.requestError)
            assertFalse(viewModel.uiState.value.isSubmitting)
            assertTrue(viewModel.uiState.value.sentEmail.isBlank())

            viewModel.onAction(ForgotPasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(2, repository.requestCalls)
            assertEquals("patient@example.com", viewModel.uiState.value.sentEmail)
            assertNull(viewModel.uiState.value.requestError)
        }

    @Test
    fun `provider invalid email response remains associated with the email field`() =
        runTest(dispatcher) {
            val repository = FakeForgotPasswordRepository(
                failures = ArrayDeque(
                    listOf(
                        ForgotPasswordRequestException(ForgotPasswordError.InvalidEmail),
                    ),
                ),
            )
            val viewModel = ForgotPasswordViewModel(repository)
            viewModel.onAction(ForgotPasswordUiAction.EmailChanged("patient@example.com"))

            viewModel.onAction(ForgotPasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(ForgotPasswordError.InvalidEmail, viewModel.uiState.value.emailError)
            assertNull(viewModel.uiState.value.requestError)
            assertTrue(viewModel.uiState.value.sentEmail.isBlank())
        }

    @Test
    fun `replacement owner or backend session suppresses a late provider acknowledgement`() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<Unit>()
            val repository = FakeForgotPasswordRepository(gate = gate)
            val viewModel = ForgotPasswordViewModel(repository)
            viewModel.onAction(ForgotPasswordUiAction.EmailChanged("patient@example.com"))
            viewModel.onAction(ForgotPasswordUiAction.Submit)
            runCurrent()

            repository.currentAuthority = replacementAuthority
            gate.complete(Unit)
            advanceUntilIdle()

            assertEquals(
                ForgotPasswordError.SessionChanged,
                viewModel.uiState.value.requestError,
            )
            assertTrue(viewModel.uiState.value.sentEmail.isBlank())
            assertFalse(viewModel.uiState.value.isSubmitting)
        }

    @Test
    fun `mismatched reset receipt cannot create local success`() = runTest(dispatcher) {
        val repository = FakeForgotPasswordRepository(
            receiptOverride = ForgotPasswordResetReceipt(
                email = "other@example.com",
                authority = initialAuthority,
            ),
        )
        val viewModel = ForgotPasswordViewModel(repository)
        viewModel.onAction(ForgotPasswordUiAction.EmailChanged("patient@example.com"))

        viewModel.onAction(ForgotPasswordUiAction.Submit)
        advanceUntilIdle()

        assertEquals(ForgotPasswordError.Unconfirmed, viewModel.uiState.value.requestError)
        assertTrue(viewModel.uiState.value.sentEmail.isBlank())
    }

    @Test
    fun `back navigation cancels pending work and emits only one navigation effect`() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<Unit>()
            val repository = FakeForgotPasswordRepository(gate = gate)
            val viewModel = ForgotPasswordViewModel(repository)
            viewModel.onAction(ForgotPasswordUiAction.EmailChanged("patient@example.com"))
            viewModel.onAction(ForgotPasswordUiAction.Submit)
            runCurrent()
            val navigation = async { viewModel.effects.first() }

            viewModel.onAction(ForgotPasswordUiAction.NavigateToLogin)
            viewModel.onAction(ForgotPasswordUiAction.NavigateToLogin)
            advanceUntilIdle()

            assertEquals(ForgotPasswordUiEffect.NavigateToLogin, navigation.await())
            assertEquals(1, repository.cancelledRequests)
            assertFalse(viewModel.uiState.value.isSubmitting)
            assertNull(
                withTimeoutOrNull(1) {
                    viewModel.effects.first()
                },
            )
        }

    @Test
    fun `raw cancellation is never converted into an error or success state`() =
        runTest(dispatcher) {
            val repository = FakeForgotPasswordRepository(
                failures = ArrayDeque(listOf(CancellationException("screen destroyed"))),
            )
            val viewModel = ForgotPasswordViewModel(repository)
            viewModel.onAction(ForgotPasswordUiAction.EmailChanged("patient@example.com"))

            viewModel.onAction(ForgotPasswordUiAction.Submit)
            advanceUntilIdle()

            assertNull(viewModel.uiState.value.requestError)
            assertTrue(viewModel.uiState.value.sentEmail.isBlank())
        }

    @Test
    fun `production repository rejects authority replacement before provider dispatch`() =
        runTest(dispatcher) {
            var current = initialAuthority
            var providerCalls = 0
            val repository = FirebaseForgotPasswordRepository(
                sendResetEmail = { providerCalls += 1 },
                currentAuthority = { current },
            )
            val captured = repository.captureAuthority()
            current = replacementAuthority

            val failure = runCatching {
                repository.requestPasswordReset("patient@example.com", captured)
            }.exceptionOrNull() as ForgotPasswordRequestException

            assertEquals(ForgotPasswordError.SessionChanged, failure.error)
            assertEquals(0, providerCalls)
        }

    @Test
    fun `production repository rejects authority replacement after provider acknowledgement`() =
        runTest(dispatcher) {
            var current = initialAuthority
            val repository = FirebaseForgotPasswordRepository(
                sendResetEmail = { current = replacementAuthority },
                currentAuthority = { current },
            )
            val captured = repository.captureAuthority()

            val failure = runCatching {
                repository.requestPasswordReset("patient@example.com", captured)
            }.exceptionOrNull() as ForgotPasswordRequestException

            assertEquals(ForgotPasswordError.SessionChanged, failure.error)
        }
}

private class FakeForgotPasswordRepository(
    private val gate: CompletableDeferred<Unit>? = null,
    private val failures: ArrayDeque<Throwable> = ArrayDeque(),
    private val receiptOverride: ForgotPasswordResetReceipt? = null,
) : ForgotPasswordRepository {
    var currentAuthority: ForgotPasswordAuthoritySnapshot = initialAuthority
    var requestCalls = 0
    var cancelledRequests = 0
    val requestedEmails = mutableListOf<String>()

    override fun captureAuthority(): ForgotPasswordAuthoritySnapshot = currentAuthority

    override fun isCurrentAuthority(expected: ForgotPasswordAuthoritySnapshot): Boolean =
        currentAuthority == expected

    override suspend fun requestPasswordReset(
        email: String,
        expectedAuthority: ForgotPasswordAuthoritySnapshot,
    ): ForgotPasswordResetReceipt {
        requestCalls += 1
        requestedEmails += email
        try {
            gate?.await()
        } catch (cancelled: CancellationException) {
            cancelledRequests += 1
            throw cancelled
        }
        failures.pollFirst()?.let { throw it }
        return receiptOverride ?: ForgotPasswordResetReceipt(
            email = email,
            authority = expectedAuthority,
        )
    }
}

private val initialAuthority = ForgotPasswordAuthoritySnapshot(
    firebaseOwner = FirebaseOwnerBinding(
        firebaseUserId = "firebase-user-a",
        email = "patient@example.com",
        sessionEpoch = 3L,
    ),
    backendSessionEpoch = 11L,
)

private val replacementAuthority = ForgotPasswordAuthoritySnapshot(
    firebaseOwner = FirebaseOwnerBinding(
        firebaseUserId = "firebase-user-b",
        email = "replacement@example.com",
        sessionEpoch = 4L,
    ),
    backendSessionEpoch = 12L,
)
