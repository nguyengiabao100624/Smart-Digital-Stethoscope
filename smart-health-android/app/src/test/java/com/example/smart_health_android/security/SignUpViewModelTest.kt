package com.example.smart_health_android.security

import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SpecialtyOption
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
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
class SignUpViewModelTest {
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
    fun `initial load exposes backend catalog and retry clears an offline failure`() =
        runTest(dispatcher) {
            val repository = FakeSignUpRepository(
                catalogFailure = IOException("offline"),
            )
            val viewModel = SignUpViewModel(repository, dispatcher)
            advanceUntilIdle()

            assertEquals(SignUpCatalogLoadState.Offline, viewModel.uiState.value.catalogLoadState)
            assertTrue(viewModel.uiState.value.clinics.isEmpty())

            repository.catalogFailure = null
            repository.catalog = testCatalog()
            viewModel.onAction(SignUpUiAction.RetryCatalog)
            advanceUntilIdle()

            assertEquals(SignUpCatalogLoadState.Ready, viewModel.uiState.value.catalogLoadState)
            assertEquals("clinic-alpha", viewModel.uiState.value.clinics.single().id)
            assertEquals("cardiology", viewModel.uiState.value.specialties.single().id)
            assertEquals(2, repository.catalogCalls)
        }

    @Test
    fun `late catalog response cannot overwrite a newer retry result`() = runTest(dispatcher) {
        val first = CompletableDeferred<SignUpCatalog>()
        val second = CompletableDeferred<SignUpCatalog>()
        val repository = QueuedCatalogSignUpRepository(first, second)
        val viewModel = SignUpViewModel(repository, dispatcher)
        advanceUntilIdle()

        viewModel.onAction(SignUpUiAction.RetryCatalog)
        advanceUntilIdle()
        second.complete(
            SignUpCatalog(
                clinics = listOf(ClinicOption("new", "Danh mục mới")),
            ),
        )
        advanceUntilIdle()
        first.complete(
            SignUpCatalog(
                clinics = listOf(ClinicOption("old", "Danh mục cũ")),
            ),
        )
        advanceUntilIdle()

        assertEquals("new", viewModel.uiState.value.clinics.single().id)
        assertEquals(SignUpCatalogLoadState.Ready, viewModel.uiState.value.catalogLoadState)
    }

    @Test
    fun `invalid form never reaches the repository and reports field errors`() =
        runTest(dispatcher) {
            val repository = FakeSignUpRepository(catalog = testCatalog())
            val viewModel = SignUpViewModel(repository, dispatcher)
            advanceUntilIdle()

            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            assertEquals(0, repository.submitCalls)
            assertTrue("name" in viewModel.uiState.value.fieldErrors)
            assertTrue("email" in viewModel.uiState.value.fieldErrors)
            assertTrue("password" in viewModel.uiState.value.fieldErrors)
            assertTrue("terms" in viewModel.uiState.value.fieldErrors)
        }

    @Test
    fun `valid doctor submission is normalized once and success navigates once`() =
        runTest(dispatcher) {
            val repository = FakeSignUpRepository(catalog = testCatalog())
            val viewModel = SignUpViewModel(repository, dispatcher)
            advanceUntilIdle()
            fillValidDoctorForm(viewModel)

            val effect = async { viewModel.effects.first() }
            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            assertEquals(1, repository.submitCalls)
            assertEquals(
                SignUpSubmission(
                    accountType = SignUpAccountType.ClinicDoctor,
                    name = "Bác sĩ An",
                    phone = "0901234567",
                    email = "doctor@shcare.vn",
                    password = " secret-123 ",
                    license = "CCHN-001",
                    clinicId = "clinic-alpha",
                    clinicName = "Phòng khám Alpha",
                    specialtyId = "cardiology",
                    specialtyName = "Tim mạch",
                    reason = "Theo dõi bệnh nhân từ xa",
                ),
                repository.lastSubmission,
            )
            assertEquals(
                SignUpUiEffect.NavigateVerifyEmail(
                    accountType = "doctor",
                    firebaseOwner = SIGN_UP_FIREBASE_OWNER,
                ),
                effect.await(),
            )
            assertFalse(viewModel.uiState.value.isSubmitting)
            assertTrue(viewModel.uiState.value.isSubmissionComplete)

            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()
            assertEquals(1, repository.submitCalls)
        }

    @Test
    fun `double submit and field edits are ignored while registration is in flight`() =
        runTest(dispatcher) {
            val completion = CompletableDeferred<Unit>()
            val repository = FakeSignUpRepository(
                catalog = testCatalog(),
                submitCompletion = completion,
            )
            val viewModel = SignUpViewModel(repository, dispatcher)
            advanceUntilIdle()
            fillValidPatientForm(viewModel)

            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.isSubmitting)
            val nameBeforeBlockedEdit = viewModel.uiState.value.name

            viewModel.onAction(SignUpUiAction.Submit)
            viewModel.onAction(SignUpUiAction.NameChanged("Tài khoản khác"))
            advanceUntilIdle()

            assertEquals(1, repository.submitCalls)
            assertEquals(nameBeforeBlockedEdit, viewModel.uiState.value.name)

            completion.complete(Unit)
            advanceUntilIdle()
            assertFalse(viewModel.uiState.value.isSubmitting)
        }

    @Test
    fun `repository failure remains retryable without manufacturing navigation success`() =
        runTest(dispatcher) {
            val repository = FakeSignUpRepository(
                catalog = testCatalog(),
                submitFailure = IOException("network unavailable"),
            )
            val viewModel = SignUpViewModel(repository, dispatcher)
            advanceUntilIdle()
            fillValidPatientForm(viewModel)

            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            assertFalse(viewModel.uiState.value.isSubmitting)
            assertTrue(viewModel.uiState.value.errorMessage.orEmpty().isNotBlank())
            assertEquals(1, repository.submitCalls)

            repository.submitFailure = null
            val effect = async { viewModel.effects.first() }
            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            assertEquals(
                SignUpUiEffect.NavigateVerifyEmail(
                    accountType = "personal",
                    firebaseOwner = SIGN_UP_FIREBASE_OWNER,
                ),
                effect.await(),
            )
            assertEquals(2, repository.submitCalls)
        }

    @Test
    fun `owner invalidated after submit cannot emit verify navigation`() = runTest(dispatcher) {
        val repository = FakeSignUpRepository(
            catalog = testCatalog(),
            submitOwnerIsCurrent = false,
        )
        val viewModel = SignUpViewModel(repository, dispatcher)
        advanceUntilIdle()
        fillValidPatientForm(viewModel)

        viewModel.onAction(SignUpUiAction.Submit)
        advanceUntilIdle()

        assertEquals(1, repository.submitCalls)
        assertFalse(viewModel.uiState.value.isSubmitting)
        assertFalse(viewModel.uiState.value.isSubmissionComplete)
        assertTrue(viewModel.uiState.value.errorMessage.orEmpty().isNotBlank())
    }

    @Test
    fun `submission cancellation is not converted to an error and releases the busy state`() =
        runTest(dispatcher) {
            val repository = FakeSignUpRepository(
                catalog = testCatalog(),
                submitFailure = CancellationException("request cancelled"),
            )
            val viewModel = SignUpViewModel(repository, dispatcher)
            advanceUntilIdle()
            fillValidPatientForm(viewModel)

            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            assertFalse(viewModel.uiState.value.isSubmitting)
            assertEquals(null, viewModel.uiState.value.errorMessage)
        }

    @Test
    fun `switching back to personal cannot leak hidden doctor fields into the payload`() =
        runTest(dispatcher) {
            val repository = FakeSignUpRepository(catalog = testCatalog())
            val viewModel = SignUpViewModel(repository, dispatcher)
            advanceUntilIdle()
            fillValidDoctorForm(viewModel)
            viewModel.onAction(SignUpUiAction.AccountTypeChanged(SignUpAccountType.Personal))
            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            val submitted = requireNotNull(repository.lastSubmission)
            assertEquals(SignUpAccountType.Personal, submitted.accountType)
            assertEquals("", submitted.license)
            assertEquals("", submitted.clinicId)
            assertEquals("", submitted.clinicName)
            assertEquals("", submitted.specialtyId)
            assertEquals("", submitted.specialtyName)
            assertEquals("", submitted.reason)
        }

    @Test
    fun `back navigation is guarded only when the form has unsaved changes`() =
        runTest(dispatcher) {
            val abandonment = FakeSignUpAbandonmentCoordinator()
            val viewModel = SignUpViewModel(
                repository = FakeSignUpRepository(catalog = testCatalog()),
                workDispatcher = dispatcher,
                abandonmentCoordinator = abandonment,
            )
            advanceUntilIdle()

            val immediate = async { viewModel.effects.first() }
            viewModel.onAction(SignUpUiAction.BackRequested)
            advanceUntilIdle()
            assertEquals(SignUpUiEffect.NavigateLogin, immediate.await())

            val dirtyViewModel = SignUpViewModel(
                repository = FakeSignUpRepository(catalog = testCatalog()),
                workDispatcher = dispatcher,
                abandonmentCoordinator = abandonment,
            )
            advanceUntilIdle()
            dirtyViewModel.onAction(SignUpUiAction.NameChanged("Nguyễn An"))
            dirtyViewModel.onAction(SignUpUiAction.BackRequested)
            assertTrue(dirtyViewModel.uiState.value.showDiscardDialog)

            val confirmed = async { dirtyViewModel.effects.first() }
            dirtyViewModel.onAction(SignUpUiAction.ConfirmDiscard)
            advanceUntilIdle()
            assertEquals(SignUpUiEffect.NavigateLogin, confirmed.await())
            assertTrue(abandonment.terminatedOwners.isEmpty())
            assertTrue(abandonment.clearedAttempts.isEmpty())
        }

    @Test
    fun `partial Firebase owner is terminated and exact checkpoint is cleared before login`() =
        runTest(dispatcher) {
            val attempt = SignUpRegistrationAttempt(
                operationId = "signup-operation-partial-owner",
                firebaseOwner = SIGN_UP_FIREBASE_OWNER,
            )
            val terminationGate = CompletableDeferred<Unit>()
            val repository = FakeSignUpRepository(
                catalog = testCatalog(),
                submitFailure = IOException("checkpoint bind interrupted"),
                attemptBeforeFailure = attempt,
            )
            val abandonment = FakeSignUpAbandonmentCoordinator(
                terminationGate = terminationGate,
            )
            val viewModel = SignUpViewModel(
                repository = repository,
                workDispatcher = dispatcher,
                abandonmentCoordinator = abandonment,
            )
            advanceUntilIdle()
            fillValidPatientForm(viewModel)

            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()
            assertTrue(viewModel.uiState.value.hasCapturedFirebaseOwner)

            viewModel.onAction(SignUpUiAction.BackRequested)
            assertTrue(viewModel.uiState.value.showDiscardDialog)
            val navigation = async { viewModel.effects.first() }
            viewModel.onAction(SignUpUiAction.ConfirmDiscard)
            viewModel.onAction(SignUpUiAction.ConfirmDiscard)
            advanceUntilIdle()

            assertEquals(listOf(SIGN_UP_FIREBASE_OWNER), abandonment.terminatedOwners)
            assertTrue(abandonment.clearedAttempts.isEmpty())
            assertFalse(navigation.isCompleted)

            terminationGate.complete(Unit)
            advanceUntilIdle()

            assertEquals(listOf(attempt), abandonment.clearedAttempts)
            assertEquals(SignUpUiEffect.NavigateLogin, navigation.await())
            assertFalse(viewModel.uiState.value.hasCapturedFirebaseOwner)
            assertEquals(null, viewModel.uiState.value.abandonmentErrorMessage)
        }

    @Test
    fun `replacement owner rejection remains fail closed and retries the exact captured owner`() =
        runTest(dispatcher) {
            val attempt = SignUpRegistrationAttempt(
                operationId = "signup-operation-owner-replaced",
                firebaseOwner = SIGN_UP_FIREBASE_OWNER,
            )
            val repository = FakeSignUpRepository(
                catalog = testCatalog(),
                submitFailure = IOException("post-owner failure"),
                attemptBeforeFailure = attempt,
            )
            val abandonment = FakeSignUpAbandonmentCoordinator(
                terminationResults = ArrayDeque(listOf(false, false)),
            )
            val viewModel = SignUpViewModel(
                repository = repository,
                workDispatcher = dispatcher,
                abandonmentCoordinator = abandonment,
            )
            advanceUntilIdle()
            fillValidPatientForm(viewModel)
            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            val navigation = async { viewModel.effects.first() }
            viewModel.onAction(SignUpUiAction.BackRequested)
            viewModel.onAction(SignUpUiAction.ConfirmDiscard)
            advanceUntilIdle()

            assertFalse(navigation.isCompleted)
            assertTrue(viewModel.uiState.value.abandonmentErrorMessage.orEmpty().isNotBlank())
            assertEquals(listOf(SIGN_UP_FIREBASE_OWNER), abandonment.terminatedOwners)
            assertTrue(abandonment.clearedAttempts.isEmpty())

            viewModel.onAction(SignUpUiAction.ConfirmDiscard)
            advanceUntilIdle()

            assertFalse(navigation.isCompleted)
            assertEquals(
                listOf(SIGN_UP_FIREBASE_OWNER, SIGN_UP_FIREBASE_OWNER),
                abandonment.terminatedOwners,
            )
            assertTrue(abandonment.clearedAttempts.isEmpty())
            navigation.cancel()
        }

    @Test
    fun `checkpoint cleanup failure retries without signing out the completed session twice`() =
        runTest(dispatcher) {
            val attempt = SignUpRegistrationAttempt(
                operationId = "signup-operation-checkpoint-retry",
                firebaseOwner = SIGN_UP_FIREBASE_OWNER,
            )
            val repository = FakeSignUpRepository(
                catalog = testCatalog(),
                submitFailure = IOException("post-owner failure"),
                attemptBeforeFailure = attempt,
            )
            val abandonment = FakeSignUpAbandonmentCoordinator(
                clearResults = ArrayDeque(listOf(false, true)),
            )
            val viewModel = SignUpViewModel(
                repository = repository,
                workDispatcher = dispatcher,
                abandonmentCoordinator = abandonment,
            )
            advanceUntilIdle()
            fillValidPatientForm(viewModel)
            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            val navigation = async { viewModel.effects.first() }
            viewModel.onAction(SignUpUiAction.BackRequested)
            viewModel.onAction(SignUpUiAction.ConfirmDiscard)
            advanceUntilIdle()

            assertFalse(navigation.isCompleted)
            assertEquals(1, abandonment.terminatedOwners.size)
            assertEquals(listOf(attempt), abandonment.clearedAttempts)
            assertTrue(viewModel.uiState.value.abandonmentErrorMessage.orEmpty().isNotBlank())

            viewModel.onAction(SignUpUiAction.ConfirmDiscard)
            advanceUntilIdle()

            assertEquals(1, abandonment.terminatedOwners.size)
            assertEquals(listOf(attempt, attempt), abandonment.clearedAttempts)
            assertEquals(SignUpUiEffect.NavigateLogin, navigation.await())
        }

    @Test
    fun `screen disposal invokes only the exact captured attempt local fallback`() =
        runTest(dispatcher) {
            val attempt = SignUpRegistrationAttempt(
                operationId = "signup-operation-screen-disposal",
                firebaseOwner = SIGN_UP_FIREBASE_OWNER,
            )
            val abandonment = FakeSignUpAbandonmentCoordinator()
            val viewModel = SignUpViewModel(
                repository = FakeSignUpRepository(
                    catalog = testCatalog(),
                    submitFailure = CancellationException("screen disposed"),
                    attemptBeforeFailure = attempt,
                ),
                workDispatcher = dispatcher,
                abandonmentCoordinator = abandonment,
            )
            advanceUntilIdle()
            fillValidPatientForm(viewModel)
            viewModel.onAction(SignUpUiAction.Submit)
            advanceUntilIdle()

            viewModel.abandonActiveAttemptLocally()
            viewModel.abandonActiveAttemptLocally()

            assertEquals(listOf(attempt), abandonment.locallyAbandonedAttempts)
            assertTrue(abandonment.terminatedOwners.isEmpty())
        }

    private fun fillValidPatientForm(viewModel: SignUpViewModel) {
        viewModel.onAction(SignUpUiAction.NameChanged(" Nguyễn An "))
        viewModel.onAction(SignUpUiAction.PhoneChanged(" 0901234567 "))
        viewModel.onAction(SignUpUiAction.EmailChanged(" patient@shcare.vn "))
        viewModel.onAction(SignUpUiAction.PasswordChanged(" secret-123 "))
        viewModel.onAction(SignUpUiAction.ConfirmPasswordChanged(" secret-123 "))
        viewModel.onAction(SignUpUiAction.TermsChanged(true))
    }

    private fun fillValidDoctorForm(viewModel: SignUpViewModel) {
        viewModel.onAction(SignUpUiAction.AccountTypeChanged(SignUpAccountType.ClinicDoctor))
        viewModel.onAction(SignUpUiAction.NameChanged(" Bác sĩ An "))
        viewModel.onAction(SignUpUiAction.PhoneChanged(" 0901234567 "))
        viewModel.onAction(SignUpUiAction.EmailChanged(" doctor@shcare.vn "))
        viewModel.onAction(SignUpUiAction.PasswordChanged(" secret-123 "))
        viewModel.onAction(SignUpUiAction.ConfirmPasswordChanged(" secret-123 "))
        viewModel.onAction(SignUpUiAction.LicenseChanged(" CCHN-001 "))
        viewModel.onAction(SignUpUiAction.ClinicSelected("clinic-alpha"))
        viewModel.onAction(SignUpUiAction.SpecialtySelected("cardiology"))
        viewModel.onAction(SignUpUiAction.ReasonChanged(" Theo dõi bệnh nhân từ xa "))
        viewModel.onAction(SignUpUiAction.TermsChanged(true))
    }

    private fun testCatalog() = SignUpCatalog(
        clinics = listOf(
            ClinicOption(
                id = "clinic-alpha",
                name = "Phòng khám Alpha",
                type = "clinic",
            ),
        ),
        specialties = listOf(
            SpecialtyOption(
                id = "cardiology",
                name = "Tim mạch",
            ),
        ),
    )
}

private val SIGN_UP_FIREBASE_OWNER = FirebaseOwnerBinding(
    firebaseUserId = "firebase-signup-owner",
    email = "owner@shcare.vn",
    sessionEpoch = 29L,
)

private class FakeSignUpRepository(
    var catalog: SignUpCatalog = SignUpCatalog(),
    var catalogFailure: Throwable? = null,
    var submitFailure: Throwable? = null,
    var submitCompletion: CompletableDeferred<Unit>? = null,
    var submitOwner: FirebaseOwnerBinding = SIGN_UP_FIREBASE_OWNER,
    var submitOwnerIsCurrent: Boolean = true,
    var attemptBeforeFailure: SignUpRegistrationAttempt? = null,
) : SignUpRepository {
    var catalogCalls = 0
    var submitCalls = 0
    var lastSubmission: SignUpSubmission? = null

    override suspend fun loadCatalog(): SignUpCatalog {
        catalogCalls += 1
        catalogFailure?.let { throw it }
        return catalog
    }

    override suspend fun submit(
        submission: SignUpSubmission,
        resumeAttempt: SignUpRegistrationAttempt?,
        onAttemptBound: (SignUpRegistrationAttempt) -> Unit,
    ): FirebaseOwnerBinding {
        submitCalls += 1
        lastSubmission = submission
        attemptBeforeFailure?.let(onAttemptBound)
        submitFailure?.let { throw it }
        submitCompletion?.await()
        if (attemptBeforeFailure == null) {
            onAttemptBound(
                SignUpRegistrationAttempt(
                    operationId = "signup-operation-success",
                    firebaseOwner = submitOwner,
                ),
            )
        }
        return submitOwner
    }

    override fun isCurrentOwner(owner: FirebaseOwnerBinding): Boolean =
        submitOwnerIsCurrent && owner == submitOwner
}

private class QueuedCatalogSignUpRepository(
    private vararg val loads: CompletableDeferred<SignUpCatalog>,
) : SignUpRepository {
    private var nextLoad = 0

    override suspend fun loadCatalog(): SignUpCatalog = loads[nextLoad++].await()

    override suspend fun submit(
        submission: SignUpSubmission,
        resumeAttempt: SignUpRegistrationAttempt?,
        onAttemptBound: (SignUpRegistrationAttempt) -> Unit,
    ): FirebaseOwnerBinding {
        onAttemptBound(
            SignUpRegistrationAttempt(
                operationId = "signup-operation-queued-catalog",
                firebaseOwner = SIGN_UP_FIREBASE_OWNER,
            ),
        )
        return SIGN_UP_FIREBASE_OWNER
    }

    override fun isCurrentOwner(owner: FirebaseOwnerBinding): Boolean =
        owner == SIGN_UP_FIREBASE_OWNER
}

private class FakeSignUpAbandonmentCoordinator(
    private val terminationGate: CompletableDeferred<Unit>? = null,
    private val terminationResults: ArrayDeque<Boolean> = ArrayDeque(listOf(true)),
    private val clearResults: ArrayDeque<Boolean> = ArrayDeque(listOf(true)),
) : SignUpAbandonmentCoordinator {
    val terminatedOwners = mutableListOf<FirebaseOwnerBinding>()
    val clearedAttempts = mutableListOf<SignUpRegistrationAttempt>()
    val locallyAbandonedAttempts = mutableListOf<SignUpRegistrationAttempt>()

    override suspend fun terminateIfCurrentOwner(owner: FirebaseOwnerBinding): Boolean {
        terminatedOwners += owner
        terminationGate?.await()
        return if (terminationResults.size > 1) {
            terminationResults.removeFirst()
        } else {
            terminationResults.first()
        }
    }

    override suspend fun clearRegistrationAttempt(
        attempt: SignUpRegistrationAttempt,
    ): Boolean {
        clearedAttempts += attempt
        return if (clearResults.size > 1) {
            clearResults.removeFirst()
        } else {
            clearResults.first()
        }
    }

    override fun abandonLocally(attempt: SignUpRegistrationAttempt) {
        locallyAbandonedAttempts += attempt
    }
}
