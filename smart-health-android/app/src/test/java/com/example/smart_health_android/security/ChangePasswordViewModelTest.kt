package com.example.smart_health_android.security

import com.example.smart_health_android.data.PasswordChangeReceipt
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class ChangePasswordViewModelTest {
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
    fun `missing route authority fails closed before credentials are accepted`() = runTest(dispatcher) {
        val repository = FakeChangePasswordRepository()
        val viewModel = ChangePasswordViewModel(
            repository = repository,
            expectedAuthority = null,
            currentAuthority = { null },
            invalidateExpectedAuthority = {},
            closeSession = { true },
        )

        viewModel.onAction(ChangePasswordUiAction.CurrentPasswordChanged("CurrentPass1"))
        viewModel.onAction(ChangePasswordUiAction.NewPasswordChanged("NextPassword2"))
        viewModel.onAction(ChangePasswordUiAction.ConfirmPasswordChanged("NextPassword2"))
        viewModel.onAction(ChangePasswordUiAction.Submit)
        advanceUntilIdle()

        assertEquals(
            ChangePasswordLoadState.PermissionDenied,
            viewModel.uiState.value.loadState,
        )
        assertEquals(0, repository.prepareCalls)
        assertEquals(0, repository.commitCalls)
    }

    @Test
    fun `password validation uses exact secrets and blocks weak or mismatched input`() = runTest(dispatcher) {
        val repository = FakeChangePasswordRepository()
        val viewModel = viewModel(repository)

        viewModel.onAction(ChangePasswordUiAction.CurrentPasswordChanged(" CurrentPass1 "))
        viewModel.onAction(ChangePasswordUiAction.NewPasswordChanged("alllowercase1"))
        viewModel.onAction(ChangePasswordUiAction.ConfirmPasswordChanged("different"))
        viewModel.onAction(ChangePasswordUiAction.Submit)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(" CurrentPass1 ", state.currentPassword)
        assertTrue(state.fieldErrors.newPassword != null)
        assertTrue(state.fieldErrors.confirmPassword != null)
        assertEquals(0, repository.prepareCalls)
        assertEquals(0, repository.commitCalls)
    }

    @Test
    fun `confirmed backend receipt is the only path that closes the authenticated session`() =
        runTest(dispatcher) {
            val repository = FakeChangePasswordRepository()
            var closeCalls = 0
            val viewModel = viewModel(
                repository = repository,
                closeSession = {
                    closeCalls += 1
                    true
                },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(1, repository.prepareCalls)
            assertEquals(1, repository.commitCalls)
            assertEquals("CurrentPass1", repository.currentPasswords.single())
            assertEquals("NextPassword2", repository.newPasswords.single())
            assertEquals("firebase-user-a", repository.preparedFirebaseUserIds.single())
            assertEquals("firebase-user-a", repository.firebaseUserIds.single())
            assertEquals(listOf("password-operation-key"), repository.operationKeys)
            assertEquals(1, closeCalls)
            assertTrue(viewModel.uiState.value.completed)
            assertTrue(viewModel.uiState.value.currentPassword.isEmpty())
            assertTrue(viewModel.uiState.value.newPassword.isEmpty())
            assertTrue(viewModel.uiState.value.confirmPassword.isEmpty())
        }

    @Test
    fun `owner-aware session close denial prevents success for a replacement Firebase account`() =
        runTest(dispatcher) {
            val repository = FakeChangePasswordRepository()
            var closeCalls = 0
            var invalidations = 0
            val viewModel = ChangePasswordViewModel(
                repository = repository,
                expectedAuthority = authority,
                currentAuthority = { authority },
                invalidateExpectedAuthority = { invalidations += 1 },
                closeSession = {
                    closeCalls += 1
                    false
                },
                createIdempotencyKey = { "password-operation-key" },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(1, closeCalls)
            assertEquals(1, invalidations)
            assertFalse(viewModel.uiState.value.completed)
            assertEquals(
                ChangePasswordLoadState.PermissionDenied,
                viewModel.uiState.value.loadState,
            )
        }

    @Test
    fun `retryable failure reuses one idempotency key and never creates local success`() =
        runTest(dispatcher) {
            val repository = FakeChangePasswordRepository(
                commitFailure = IOException("offline"),
            )
            var closeCalls = 0
            val viewModel = viewModel(
                repository = repository,
                closeSession = {
                    closeCalls += 1
                    true
                },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()
            assertFalse(viewModel.uiState.value.completed)
            assertTrue(viewModel.uiState.value.canRetry)
            assertEquals(0, closeCalls)

            repository.commitFailure = null
            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(
                listOf("password-operation-key", "password-operation-key"),
                repository.operationKeys,
            )
            assertEquals(1, closeCalls)
        }

    @Test
    fun `new-password reauthentication failure never closes the session or creates success`() =
        runTest(dispatcher) {
            val repository = FakeChangePasswordRepository(
                commitFailure = IllegalStateException("new credential rejected"),
            )
            var closeCalls = 0
            val viewModel = viewModel(
                repository = repository,
                closeSession = {
                    closeCalls += 1
                    true
                },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertFalse(viewModel.uiState.value.completed)
            assertEquals(ChangePasswordFailure.Generic, viewModel.uiState.value.failure)
            assertEquals(ChangePasswordLoadState.Ready, viewModel.uiState.value.loadState)
            assertEquals("new credential rejected", viewModel.uiState.value.errorMessage)
            assertEquals(0, closeCalls)
        }

    @Test
    fun `suppressed revoked recovery failure invalidates protected authority instead of exposing retry`() =
        runTest(dispatcher) {
            val repository = FakeChangePasswordRepository(
                commitFailure = ChangePasswordSessionInvalidatedException(
                    IllegalStateException("new credential rejected"),
                ),
            )
            var closeCalls = 0
            var invalidations = 0
            val viewModel = ChangePasswordViewModel(
                repository = repository,
                expectedAuthority = authority,
                currentAuthority = { authority },
                invalidateExpectedAuthority = { invalidations += 1 },
                closeSession = {
                    closeCalls += 1
                    true
                },
                createIdempotencyKey = { "password-operation-key" },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertFalse(viewModel.uiState.value.completed)
            assertEquals(
                ChangePasswordLoadState.PermissionDenied,
                viewModel.uiState.value.loadState,
            )
            assertFalse(viewModel.uiState.value.canRetry)
            assertTrue(viewModel.uiState.value.currentPassword.isEmpty())
            assertEquals(1, invalidations)
            assertEquals(0, closeCalls)
        }

    @Test
    fun `generic unauthorized response follows permission denial without retry success`() =
        runTest(dispatcher) {
            val repository = FakeChangePasswordRepository(
                commitFailure = SmartHealthApiException(
                    statusCode = 401,
                    code = "UNAUTHENTICATED",
                    requestId = "request-1",
                    message = "Authorization failed",
                ),
            )
            var closeCalls = 0
            var invalidations = 0
            val viewModel = ChangePasswordViewModel(
                repository = repository,
                expectedAuthority = authority,
                currentAuthority = { authority },
                invalidateExpectedAuthority = { invalidations += 1 },
                closeSession = {
                    closeCalls += 1
                    true
                },
                createIdempotencyKey = { "password-operation-key" },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertFalse(viewModel.uiState.value.completed)
            assertEquals(
                ChangePasswordLoadState.PermissionDenied,
                viewModel.uiState.value.loadState,
            )
            assertTrue(viewModel.uiState.value.currentPassword.isEmpty())
            assertEquals(1, invalidations)
            assertEquals(0, closeCalls)
        }

    @Test
    fun `unconfirmed response remains retryable and does not close the session`() =
        runTest(dispatcher) {
            val repository = FakeChangePasswordRepository(
                receipt = confirmedReceipt.copy(confirmed = false),
            )
            var closeCalls = 0
            val viewModel = viewModel(
                repository = repository,
                closeSession = {
                    closeCalls += 1
                    true
                },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertFalse(viewModel.uiState.value.completed)
            assertTrue(viewModel.uiState.value.canRetry)
            assertEquals(
                ChangePasswordFailure.Unconfirmed,
                viewModel.uiState.value.failure,
            )
            assertEquals(0, closeCalls)
        }

    @Test
    fun `authority change after reauthentication blocks the backend mutation and clears secrets`() =
        runTest(dispatcher) {
            var currentAuthority: ChangePasswordAuthoritySnapshot? = authority
            var invalidations = 0
            val repository = FakeChangePasswordRepository(
                afterPrepare = { currentAuthority = otherAuthority },
            )
            val viewModel = ChangePasswordViewModel(
                repository = repository,
                expectedAuthority = authority,
                currentAuthority = { currentAuthority },
                invalidateExpectedAuthority = { invalidations += 1 },
                closeSession = { true },
                createIdempotencyKey = { "password-operation-key" },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(1, repository.prepareCalls)
            assertEquals(0, repository.commitCalls)
            assertEquals(ChangePasswordLoadState.PermissionDenied, viewModel.uiState.value.loadState)
            assertTrue(viewModel.uiState.value.currentPassword.isEmpty())
            assertEquals(1, invalidations)
            assertEquals(1, repository.localBindingInvalidations)
        }

    @Test
    fun `authority change while backend responds never logs out the replacement account`() =
        runTest(dispatcher) {
            var currentAuthority: ChangePasswordAuthoritySnapshot? = authority
            var closeCalls = 0
            val repository = FakeChangePasswordRepository(
                afterCommit = { currentAuthority = otherAuthority },
            )
            val viewModel = ChangePasswordViewModel(
                repository = repository,
                expectedAuthority = authority,
                currentAuthority = { currentAuthority },
                invalidateExpectedAuthority = {},
                closeSession = {
                    closeCalls += 1
                    true
                },
                createIdempotencyKey = { "password-operation-key" },
            )
            enterValidPasswords(viewModel)

            viewModel.onAction(ChangePasswordUiAction.Submit)
            advanceUntilIdle()

            assertEquals(1, repository.commitCalls)
            assertEquals(0, closeCalls)
            assertFalse(viewModel.uiState.value.completed)
            assertEquals(ChangePasswordLoadState.PermissionDenied, viewModel.uiState.value.loadState)
        }

    @Test
    fun `double submit launches only one credential mutation`() = runTest(dispatcher) {
        val repository = FakeChangePasswordRepository()
        val viewModel = viewModel(repository)
        enterValidPasswords(viewModel)

        viewModel.onAction(ChangePasswordUiAction.Submit)
        viewModel.onAction(ChangePasswordUiAction.Submit)
        advanceUntilIdle()

        assertEquals(1, repository.prepareCalls)
        assertEquals(1, repository.commitCalls)
    }

    @Test
    fun `back with an edited secret requires explicit discard confirmation`() = runTest(dispatcher) {
        val viewModel = viewModel(FakeChangePasswordRepository())
        viewModel.onAction(ChangePasswordUiAction.CurrentPasswordChanged("CurrentPass1"))

        viewModel.onAction(ChangePasswordUiAction.BackRequested)
        assertTrue(viewModel.uiState.value.showDiscardConfirmation)

        viewModel.onAction(ChangePasswordUiAction.DiscardConfirmed)
        assertEquals(ChangePasswordUiEffect.NavigateBack, viewModel.effects.first())
    }

    private fun viewModel(
        repository: FakeChangePasswordRepository,
        closeSession: suspend () -> Boolean = { true },
    ) = ChangePasswordViewModel(
        repository = repository,
        expectedAuthority = authority,
        currentAuthority = { authority },
        invalidateExpectedAuthority = {},
        closeSession = closeSession,
        createIdempotencyKey = { "password-operation-key" },
    )

    private fun enterValidPasswords(viewModel: ChangePasswordViewModel) {
        viewModel.onAction(ChangePasswordUiAction.CurrentPasswordChanged("CurrentPass1"))
        viewModel.onAction(ChangePasswordUiAction.NewPasswordChanged("NextPassword2"))
        viewModel.onAction(ChangePasswordUiAction.ConfirmPasswordChanged("NextPassword2"))
    }
}

private class FakeChangePasswordRepository(
    var receipt: PasswordChangeReceipt = confirmedReceipt,
    var commitFailure: Throwable? = null,
    private val afterPrepare: () -> Unit = {},
    private val afterCommit: () -> Unit = {},
) : ChangePasswordRepository {
    var prepareCalls = 0
    var commitCalls = 0
    var localBindingInvalidations = 0
    val currentPasswords = mutableListOf<String>()
    val newPasswords = mutableListOf<String>()
    val preparedFirebaseUserIds = mutableListOf<String>()
    val firebaseUserIds = mutableListOf<String>()
    val operationKeys = mutableListOf<String>()

    override suspend fun prepare(
        currentPassword: String,
        expectedFirebaseUserId: String,
        idempotencyKey: String,
    ) {
        prepareCalls += 1
        currentPasswords += currentPassword
        preparedFirebaseUserIds += expectedFirebaseUserId
        afterPrepare()
    }

    override fun invalidateLocalSessionBinding() {
        localBindingInvalidations += 1
    }

    override suspend fun commit(
        expectedUserId: String,
        expectedFirebaseUserId: String,
        currentPassword: String,
        newPassword: String,
        idempotencyKey: String,
    ): PasswordChangeReceipt {
        commitCalls += 1
        newPasswords += newPassword
        firebaseUserIds += expectedFirebaseUserId
        operationKeys += idempotencyKey
        commitFailure?.let { throw it }
        afterCommit()
        return receipt
    }
}

private val authority = ChangePasswordAuthoritySnapshot.create(
    userId = "user-a",
    firebaseUserId = "firebase-user-a",
    workspaceId = "workspace-a",
    role = "patient",
    capabilities = setOf("account.security.manage"),
    authorityEpoch = 4L,
)

private val otherAuthority = ChangePasswordAuthoritySnapshot.create(
    userId = "user-b",
    firebaseUserId = "firebase-user-b",
    workspaceId = "workspace-b",
    role = "doctor",
    capabilities = setOf("account.security.manage"),
    authorityEpoch = 5L,
)

private val confirmedReceipt = PasswordChangeReceipt(
    confirmed = true,
    userId = "user-a",
    provider = "firebase",
    operationId = "identity-operation-1",
    replayed = false,
)
