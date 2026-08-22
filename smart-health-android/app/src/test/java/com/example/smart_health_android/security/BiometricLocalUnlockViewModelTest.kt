package com.example.smart_health_android.security

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
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
class BiometricLocalUnlockViewModelTest {
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
    fun `unsupported runtime hides settings control and never prepares a prompt`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(
                availability = BiometricLocalUnlockAvailability.NoHardware,
            )
            val viewModel = BiometricLocalUnlockViewModel(repository)

            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            viewModel.onAction(BiometricLocalUnlockUiAction.EnableRequested)

            assertFalse(viewModel.uiState.value.showSettingsControl)
            assertEquals(0, repository.prepareCalls)
            assertFalse(viewModel.uiState.value.configured)
        }

    @Test
    fun `foreground refresh reveals control only after strong biometric becomes available`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(
                availability = BiometricLocalUnlockAvailability.NoneEnrolled,
            )
            val viewModel = BiometricLocalUnlockViewModel(repository)
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            assertFalse(viewModel.uiState.value.showSettingsControl)

            repository.availability = BiometricLocalUnlockAvailability.Available
            viewModel.onAction(BiometricLocalUnlockUiAction.AppForegrounded)

            assertTrue(viewModel.uiState.value.showSettingsControl)
        }

    @Test
    fun `enable requests one prompt and only matching authenticated receipt enables lock`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository()
            val viewModel = BiometricLocalUnlockViewModel(repository)
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            val effect = async { viewModel.effects.first() }

            viewModel.onAction(BiometricLocalUnlockUiAction.EnableRequested)
            viewModel.onAction(BiometricLocalUnlockUiAction.EnableRequested)

            val launch = effect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt
            assertEquals(BiometricLocalUnlockOperation.Enable, launch.request.operation)
            assertEquals(authorityA, repository.preparedAuthorities.single())
            assertEquals(1, repository.prepareCalls)

            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptAuthenticated("stale-request"),
            )
            assertFalse(viewModel.uiState.value.configured)

            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptAuthenticated(launch.request.requestId),
            )
            assertTrue(viewModel.uiState.value.configured)
            assertFalse(viewModel.uiState.value.locked)
            assertEquals(1, repository.completeCalls)
        }

    @Test
    fun `persisted configuration starts closed and unlocks only exact authority`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(configured = true)
            val viewModel = BiometricLocalUnlockViewModel(repository)
            val effect = async { viewModel.effects.first() }

            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))

            val launch = effect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt
            assertTrue(viewModel.uiState.value.locked)
            assertFalse(viewModel.uiState.value.protectedContentAllowed)
            assertEquals(BiometricLocalUnlockOperation.Unlock, launch.request.operation)

            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptAuthenticated(launch.request.requestId),
            )

            assertFalse(viewModel.uiState.value.locked)
            assertTrue(viewModel.uiState.value.protectedContentAllowed)
        }

    @Test
    fun `workspace or session replacement clears binding and requires full authentication`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(configured = true)
            val viewModel = BiometricLocalUnlockViewModel(repository)
            val firstLaunch = async { viewModel.effects.first() }
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            val request = (firstLaunch.await() as BiometricLocalUnlockUiEffect.LaunchPrompt).request
            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptAuthenticated(request.requestId),
            )
            val termination = async { viewModel.effects.first() }

            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityB))

            assertEquals(
                authorityB,
                (termination.await() as BiometricLocalUnlockUiEffect.TerminateSession).authority,
            )
            assertEquals(1, repository.clearCalls)
            assertTrue(viewModel.uiState.value.locked)
            assertEquals(
                BiometricLocalUnlockError.AuthorityChanged,
                viewModel.uiState.value.error,
            )
        }

    @Test
    fun `late success from replaced authority is suppressed`() = runTest(dispatcher) {
        val repository = FakeBiometricLocalUnlockRepository(configured = true)
        val viewModel = BiometricLocalUnlockViewModel(repository)
        val launchEffect = async { viewModel.effects.first() }
        viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
        val launch = launchEffect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt
        val cancelEffect = async { viewModel.effects.first() }

        viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityB))

        assertTrue(cancelEffect.await() is BiometricLocalUnlockUiEffect.CancelPrompt)
        val terminateEffect = async { viewModel.effects.first() }
        assertEquals(
            authorityB,
            (terminateEffect.await() as BiometricLocalUnlockUiEffect.TerminateSession).authority,
        )
        viewModel.onAction(
            BiometricLocalUnlockUiAction.PromptAuthenticated(launch.request.requestId),
        )
        assertTrue(viewModel.uiState.value.locked)
        assertEquals(0, repository.completeCalls)
    }

    @Test
    fun `background cancels prompt and cancellation or provider error remains locked`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(configured = true)
            val viewModel = BiometricLocalUnlockViewModel(repository)
            val launchEffect = async { viewModel.effects.first() }
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            val launch = launchEffect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt
            val cancelEffect = async { viewModel.effects.first() }

            viewModel.onAction(BiometricLocalUnlockUiAction.AppBackgrounded)

            assertEquals(
                launch.request.requestId,
                (cancelEffect.await() as BiometricLocalUnlockUiEffect.CancelPrompt).requestId,
            )
            assertTrue(viewModel.uiState.value.locked)
            assertEquals(1, repository.cancelCalls)

            val retryEffect = async { viewModel.effects.first() }
            viewModel.onAction(BiometricLocalUnlockUiAction.AppForegrounded)
            val retry = retryEffect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt
            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptFailed(
                    requestId = retry.request.requestId,
                    error = BiometricLocalUnlockError.AuthenticationFailed,
                ),
            )
            assertTrue(viewModel.uiState.value.locked)
            assertEquals(
                BiometricLocalUnlockError.AuthenticationFailed,
                viewModel.uiState.value.error,
            )
        }

    @Test
    fun `background cancels an unfinished enable operation without creating local success`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository()
            val viewModel = BiometricLocalUnlockViewModel(repository)
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            val launchEffect = async { viewModel.effects.first() }
            viewModel.onAction(BiometricLocalUnlockUiAction.EnableRequested)
            val launch = launchEffect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt

            viewModel.onAction(BiometricLocalUnlockUiAction.AppBackgrounded)
            assertTrue(viewModel.effects.first() is BiometricLocalUnlockUiEffect.CancelPrompt)
            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptAuthenticated(launch.request.requestId),
            )

            assertFalse(viewModel.uiState.value.configured)
            assertEquals(0, repository.completeCalls)
            assertEquals(1, repository.cancelCalls)
        }

    @Test
    fun `key invalidation clears persisted configuration but never opens protected content`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(
                configured = true,
                nextCompletion = BiometricLocalUnlockCompletion.KeyInvalidated,
            )
            val viewModel = BiometricLocalUnlockViewModel(repository)
            val effect = async { viewModel.effects.first() }
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            val launch = effect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt

            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptAuthenticated(launch.request.requestId),
            )

            assertFalse(viewModel.uiState.value.configured)
            assertTrue(viewModel.uiState.value.locked)
            assertFalse(viewModel.uiState.value.protectedContentAllowed)
            assertEquals(
                BiometricLocalUnlockError.KeyInvalidated,
                viewModel.uiState.value.error,
            )
        }

    @Test
    fun `logout clears configuration and a stale callback cannot reopen prior authority`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(configured = true)
            val viewModel = BiometricLocalUnlockViewModel(repository)
            val launchEffect = async { viewModel.effects.first() }
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            val launch = launchEffect.await() as BiometricLocalUnlockUiEffect.LaunchPrompt
            val cancelEffect = async { viewModel.effects.first() }

            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(null))

            assertTrue(cancelEffect.await() is BiometricLocalUnlockUiEffect.CancelPrompt)
            assertEquals(1, repository.clearCalls)
            assertFalse(viewModel.uiState.value.configured)
            assertTrue(viewModel.uiState.value.protectedContentAllowed)
            viewModel.onAction(
                BiometricLocalUnlockUiAction.PromptAuthenticated(launch.request.requestId),
            )
            assertFalse(viewModel.uiState.value.configured)
            assertEquals(0, repository.completeCalls)
        }

    @Test
    fun `explicit sign out closes local state before session termination effect`() =
        runTest(dispatcher) {
            val repository = FakeBiometricLocalUnlockRepository(configured = true)
            val viewModel = BiometricLocalUnlockViewModel(repository)
            val initialLaunch = async { viewModel.effects.first() }
            viewModel.onAction(BiometricLocalUnlockUiAction.AuthorityObserved(authorityA))
            initialLaunch.await()

            viewModel.onAction(BiometricLocalUnlockUiAction.SignOutRequested)

            assertTrue(viewModel.effects.first() is BiometricLocalUnlockUiEffect.CancelPrompt)
            assertEquals(
                authorityA,
                (viewModel.effects.first() as BiometricLocalUnlockUiEffect.TerminateSession)
                    .authority,
            )
            assertEquals(1, repository.clearCalls)
            assertTrue(viewModel.uiState.value.locked)
        }
}

private class FakeBiometricLocalUnlockRepository(
    var availability: BiometricLocalUnlockAvailability =
        BiometricLocalUnlockAvailability.Available,
    configured: Boolean = false,
    var nextCompletion: BiometricLocalUnlockCompletion = BiometricLocalUnlockCompletion.Success,
) : BiometricLocalUnlockRepository {
    private var configuredValue = configured
    private var requestSequence = 0
    var prepareCalls = 0
    var completeCalls = 0
    var cancelCalls = 0
    var clearCalls = 0
    val preparedAuthorities = mutableListOf<BiometricLocalUnlockAuthority>()

    override fun availability(): BiometricLocalUnlockAvailability = availability

    override fun hasConfiguration(): Boolean = configuredValue

    override fun prepare(
        operation: BiometricLocalUnlockOperation,
        authority: BiometricLocalUnlockAuthority,
    ): BiometricLocalUnlockPreparation {
        prepareCalls += 1
        preparedAuthorities += authority
        requestSequence += 1
        return BiometricLocalUnlockPreparation.Ready(
            BiometricLocalUnlockPromptRequest(
                requestId = "request-$requestSequence",
                operation = operation,
            ),
        )
    }

    override fun complete(requestId: String): BiometricLocalUnlockCompletion {
        completeCalls += 1
        if (nextCompletion == BiometricLocalUnlockCompletion.Success) {
            configuredValue = true
        }
        return nextCompletion
    }

    override fun cancel(requestId: String) {
        cancelCalls += 1
    }

    override fun clear(): Boolean {
        clearCalls += 1
        configuredValue = false
        return true
    }
}

private val authorityA = BiometricLocalUnlockAuthority.create(
    backendUserId = "backend-user-a",
    firebaseUserId = "firebase-user-a",
    workspaceId = "workspace-a",
    authorityEpoch = 7L,
    backendSessionEpoch = 11L,
    firebaseOwnerSessionEpoch = 13L,
)

private val authorityB = BiometricLocalUnlockAuthority.create(
    backendUserId = "backend-user-a",
    firebaseUserId = "firebase-user-a",
    workspaceId = "workspace-b",
    authorityEpoch = 8L,
    backendSessionEpoch = 12L,
    firebaseOwnerSessionEpoch = 13L,
)
