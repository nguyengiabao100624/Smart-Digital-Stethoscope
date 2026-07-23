package com.example.smart_health_android.security

import com.example.smart_health_android.data.TwoFactorChallenge
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
class LoginViewModelTest {
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
    fun `blank credentials never call authentication`() = runTest(dispatcher) {
        val repository = FakeLoginRepository()
        val viewModel = LoginViewModel(repository)

        viewModel.onAction(LoginAction.SubmitCredentials)
        advanceUntilIdle()

        assertEquals(0, repository.signInCalls)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
        assertEquals(LoginStep.Credentials, viewModel.uiState.value.step)
    }

    @Test
    fun `primary authentication cannot navigate before second factor confirmation`() = runTest(dispatcher) {
        val repository = FakeLoginRepository(
            signInResult = LoginResult.TwoFactorRequired(testChallenge),
        )
        val viewModel = LoginViewModel(repository)
        viewModel.enterCredentials()

        viewModel.onAction(LoginAction.SubmitCredentials)
        advanceUntilIdle()

        assertEquals(LoginStep.TwoFactor, viewModel.uiState.value.step)
        assertFalse(viewModel.uiState.value.isLoading)
        assertEquals(0, repository.completeCalls)
        assertEquals(testChallenge.expiresAt, viewModel.uiState.value.challengeExpiresAt)
    }

    @Test
    fun `server confirmed OTP emits authenticated effect`() = runTest(dispatcher) {
        val repository = FakeLoginRepository(
            signInResult = LoginResult.TwoFactorRequired(testChallenge),
            completeResult = LoginResult.Authenticated(isDoctorAccount = true),
        )
        val viewModel = LoginViewModel(repository)
        viewModel.enterCredentials()
        viewModel.onAction(LoginAction.SubmitCredentials)
        advanceUntilIdle()
        viewModel.onAction(LoginAction.OtpChanged("12ab3456"))
        val effect = async { viewModel.effects.first() }

        viewModel.onAction(LoginAction.SubmitTwoFactor)
        advanceUntilIdle()

        assertEquals("123456", repository.lastOtp)
        assertEquals(1, repository.completeCalls)
        assertEquals(LoginEffect.Authenticated(isDoctorAccount = true), effect.await())
        assertTrue(viewModel.uiState.value.password.isEmpty())
        assertTrue(viewModel.uiState.value.otp.isEmpty())
    }

    @Test
    fun `rejected OTP remains retryable without success effect`() = runTest(dispatcher) {
        val repository = FakeLoginRepository(
            signInResult = LoginResult.TwoFactorRequired(testChallenge),
            completeFailure = IllegalStateException("Mã OTP chưa đúng"),
        )
        val viewModel = LoginViewModel(repository)
        viewModel.enterCredentials()
        viewModel.onAction(LoginAction.SubmitCredentials)
        advanceUntilIdle()
        viewModel.onAction(LoginAction.OtpChanged("123456"))

        viewModel.onAction(LoginAction.SubmitTwoFactor)
        advanceUntilIdle()

        assertEquals(LoginStep.TwoFactor, viewModel.uiState.value.step)
        assertEquals(1, repository.completeCalls)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
        assertTrue(viewModel.uiState.value.otp.isEmpty())
    }

    @Test
    fun `cancelling challenge clears pending authentication`() = runTest(dispatcher) {
        val repository = FakeLoginRepository(
            signInResult = LoginResult.TwoFactorRequired(testChallenge),
        )
        val viewModel = LoginViewModel(repository)
        viewModel.enterCredentials()
        viewModel.onAction(LoginAction.SubmitCredentials)
        advanceUntilIdle()

        viewModel.onAction(LoginAction.CancelTwoFactor)

        assertEquals(LoginStep.Credentials, viewModel.uiState.value.step)
        assertEquals(1, repository.cancelCalls)
        assertTrue(viewModel.uiState.value.password.isEmpty())
        assertTrue(viewModel.uiState.value.challengeExpiresAt.isEmpty())
    }
}

private class FakeLoginRepository(
    private val signInResult: LoginResult = LoginResult.Authenticated(isDoctorAccount = false),
    private val completeResult: LoginResult = LoginResult.Authenticated(isDoctorAccount = false),
    private val completeFailure: Throwable? = null,
) : LoginRepository {
    var signInCalls = 0
    var completeCalls = 0
    var cancelCalls = 0
    var lastOtp = ""

    override suspend fun signIn(
        mode: LoginAccountMode,
        email: String,
        password: String,
    ): LoginResult {
        signInCalls += 1
        return signInResult
    }

    override suspend fun completeTwoFactor(
        challengeId: String,
        code: String,
    ): LoginResult {
        completeCalls += 1
        lastOtp = code
        completeFailure?.let { throw it }
        return completeResult
    }

    override fun cancelAuthentication() {
        cancelCalls += 1
    }
}

private fun LoginViewModel.enterCredentials() {
    onAction(LoginAction.EmailChanged("doctor@example.com"))
    onAction(LoginAction.PasswordChanged("correct horse battery staple"))
}

private val testChallenge = TwoFactorChallenge(
    challengeId = "challenge_1",
    method = "app",
    expiresAt = "2099-01-01T00:05:00.000Z",
)
