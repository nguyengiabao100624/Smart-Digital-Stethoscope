package com.example.smart_health_android.security

import androidx.lifecycle.SavedStateHandle
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
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
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DoctorApprovalViewModelTest {
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
    fun `catalog load preserves partial success and retry fills only missing state`() =
        runTest(dispatcher) {
            val repository = FakeDoctorApprovalRepository().apply {
                clinicsBlock = { listOf(ClinicOption("clinic-a", "Phòng khám A")) }
                specialtiesBlock = { throw IOException("specialty unavailable") }
            }
            val viewModel = DoctorApprovalViewModel(
                repository = repository,
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                autoStart = false,
                savedStateHandle = SavedStateHandle(),
            )

            viewModel.onAction(DoctorApprovalUiAction.RetryCatalogs)
            advanceUntilIdle()

            assertEquals(listOf("clinic-a"), viewModel.uiState.value.clinics.map { it.id })
            assertTrue(viewModel.uiState.value.specialties.isEmpty())
            assertTrue(viewModel.uiState.value.specialtyCatalogError.isNotBlank())
            assertFalse(viewModel.uiState.value.isLoadingCatalogs)

            repository.specialtiesBlock = {
                listOf(SpecialtyOption("cardiology", "Tim mạch"))
            }
            viewModel.onAction(DoctorApprovalUiAction.RetryCatalogs)
            advanceUntilIdle()

            assertEquals(listOf("cardiology"), viewModel.uiState.value.specialties.map { it.id })
            assertTrue(viewModel.uiState.value.specialtyCatalogError.isBlank())
            assertEquals(2, repository.clinicCalls)
            assertEquals(2, repository.specialtyCalls)
        }

    @Test
    fun `catalog dual failure exposes retryable errors without manufacturing empty success`() =
        runTest(dispatcher) {
            val repository = FakeDoctorApprovalRepository().apply {
                clinicsBlock = { throw IOException("clinic unavailable") }
                specialtiesBlock = { throw IOException("specialty unavailable") }
            }
            val viewModel = DoctorApprovalViewModel(
                repository = repository,
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                autoStart = false,
                savedStateHandle = SavedStateHandle(),
            )

            viewModel.onAction(DoctorApprovalUiAction.RetryCatalogs)
            advanceUntilIdle()

            assertTrue(viewModel.uiState.value.clinicCatalogError.isNotBlank())
            assertTrue(viewModel.uiState.value.specialtyCatalogError.isNotBlank())
            assertTrue(viewModel.uiState.value.clinics.isEmpty())
            assertTrue(viewModel.uiState.value.specialties.isEmpty())
        }

    @Test
    fun `refresh and submit are mutually exclusive independent of recomposition`() =
        runTest(dispatcher) {
            val refreshGate = CompletableDeferred<AuthUser>()
            val submitGate = CompletableDeferred<AuthUser>()
            val repository = FakeDoctorApprovalRepository().apply {
                refreshBlock = { refreshGate.await() }
                submitBlock = { _, _, _ -> submitGate.await() }
            }
            val viewModel = viewModelForNeedsInfo(repository)

            viewModel.onAction(DoctorApprovalUiAction.RefreshStatus)
            runCurrent()
            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            runCurrent()
            assertEquals(1, repository.refreshCalls)
            assertEquals(0, repository.submitCalls)

            refreshGate.complete(needsInfoUser())
            advanceUntilIdle()
            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            runCurrent()
            viewModel.onAction(DoctorApprovalUiAction.RefreshStatus)
            viewModel.onAction(DoctorApprovalUiAction.PollStatus)
            runCurrent()

            assertEquals(1, repository.submitCalls)
            assertEquals(1, repository.refreshCalls)
            submitGate.complete(needsInfoUser().copy(roleRequestStatus = "pending"))
            advanceUntilIdle()
        }

    @Test
    fun `same recoverable intent keeps idempotency key while edit rotates it`() =
        runTest(dispatcher) {
            val generatedKeys = ArrayDeque(listOf("intent-key-1", "intent-key-2", "intent-key-3"))
            val repository = FakeDoctorApprovalRepository().apply {
                submitBlock = { _, _, _ -> throw IOException("retryable") }
            }
            val viewModel = DoctorApprovalViewModel(
                repository = repository,
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                idempotencyKeyFactory = { generatedKeys.removeFirst() },
                savedStateHandle = SavedStateHandle(),
            )

            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            advanceUntilIdle()
            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            advanceUntilIdle()

            assertEquals(2, repository.submitKeys.size)
            assertEquals(repository.submitKeys[0], repository.submitKeys[1])

            viewModel.onAction(DoctorApprovalUiAction.NameChanged("Bác sĩ An mới"))
            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            advanceUntilIdle()

            assertNotEquals(repository.submitKeys[1], repository.submitKeys[2])
        }

    @Test
    fun `background refresh does not overwrite a dirty needs info draft`() =
        runTest(dispatcher) {
            val repository = FakeDoctorApprovalRepository().apply {
                refreshBlock = {
                    needsInfoUser().copy(
                        name = "Server replacement",
                        phone = "0999999999",
                        license = "SERVER-LICENSE",
                        registrationReason = "Server replacement reason",
                    )
                }
            }
            val viewModel = viewModelForNeedsInfo(repository)

            viewModel.onAction(DoctorApprovalUiAction.NameChanged("Local doctor draft"))
            viewModel.onAction(DoctorApprovalUiAction.PhoneChanged("0987654321"))
            viewModel.onAction(DoctorApprovalUiAction.LicenseChanged("LOCAL-LICENSE"))
            viewModel.onAction(DoctorApprovalUiAction.ReasonChanged("Local draft reason"))
            val dirtyDraft = viewModel.uiState.value.currentDraft()

            viewModel.onAction(DoctorApprovalUiAction.PollStatus)
            advanceUntilIdle()

            assertEquals(1, repository.refreshCalls)
            assertEquals(dirtyDraft, viewModel.uiState.value.currentDraft())
            assertEquals("Server replacement", viewModel.uiState.value.user?.name)
            assertTrue(viewModel.uiState.value.hasUnsavedChanges)
        }

    @Test
    fun `saved state reconstruction preserves exact intent and editing rotates its key`() =
        runTest(dispatcher) {
            val savedStateHandle = SavedStateHandle()
            val generatedKeys = ArrayDeque(listOf("intent-key-1", "intent-key-2"))
            val firstRepository = FakeDoctorApprovalRepository().apply {
                submitBlock = { _, _, _ -> throw IOException("retryable") }
            }
            val firstViewModel = DoctorApprovalViewModel(
                repository = firstRepository,
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                idempotencyKeyFactory = { generatedKeys.removeFirst() },
                savedStateHandle = savedStateHandle,
            )

            firstViewModel.onAction(DoctorApprovalUiAction.NameChanged("Restored doctor"))
            firstViewModel.onAction(DoctorApprovalUiAction.PhoneChanged("0987654321"))
            firstViewModel.onAction(DoctorApprovalUiAction.LicenseChanged("RESTORED-LICENSE"))
            firstViewModel.onAction(DoctorApprovalUiAction.ReasonChanged("Restored exact reason"))
            firstViewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            advanceUntilIdle()

            val expectedDraft = firstViewModel.uiState.value.currentDraft()
            val expectedFingerprint = firstViewModel.uiState.value.roleRequestIntentFingerprint
            val expectedKey = firstViewModel.uiState.value.roleRequestIdempotencyKey
            assertEquals("intent-key-1", expectedKey)
            assertTrue(expectedFingerprint.isNotBlank())

            val reconstructedRepository = FakeDoctorApprovalRepository().apply {
                submitBlock = { _, _, _ -> throw IOException("retryable") }
            }
            val reconstructed = DoctorApprovalViewModel(
                repository = reconstructedRepository,
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                idempotencyKeyFactory = { generatedKeys.removeFirst() },
                savedStateHandle = savedStateHandle,
            )

            assertEquals(expectedDraft, reconstructed.uiState.value.currentDraft())
            assertEquals(expectedFingerprint, reconstructed.uiState.value.roleRequestIntentFingerprint)
            assertEquals(expectedKey, reconstructed.uiState.value.roleRequestIdempotencyKey)

            reconstructed.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            advanceUntilIdle()
            reconstructed.onAction(DoctorApprovalUiAction.NameChanged("Edited after restore"))
            reconstructed.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            advanceUntilIdle()

            assertEquals(listOf("intent-key-1", "intent-key-2"), reconstructedRepository.submitKeys)
            assertEquals("intent-key-2", reconstructed.uiState.value.roleRequestIdempotencyKey)
        }

    @Test
    fun `logout paths clear account bound saved draft before navigation`() =
        runTest(dispatcher) {
            val discardHandle = SavedStateHandle()
            val discardViewModel = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = discardHandle,
            )
            discardViewModel.onAction(DoctorApprovalUiAction.NameChanged("Stale account draft"))
            discardViewModel.onAction(DoctorApprovalUiAction.LogoutRequested)
            assertTrue(discardViewModel.uiState.value.showDiscardDialog)
            discardViewModel.onAction(DoctorApprovalUiAction.DiscardLogoutConfirmed)
            assertEquals(
                DoctorApprovalUiEffect.NavigateLogout(doctorApprovalRouteOwner()),
                discardViewModel.effects.first(),
            )

            val afterDiscardLogout = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = discardHandle,
            )
            assertEquals("Bác sĩ An", afterDiscardLogout.uiState.value.name)
            assertFalse(afterDiscardLogout.uiState.value.hasRestoredDraft)

            val cleanHandle = SavedStateHandle()
            val cleanViewModel = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = cleanHandle,
            )
            cleanViewModel.onAction(DoctorApprovalUiAction.NameChanged("Temporary draft"))
            cleanViewModel.onAction(DoctorApprovalUiAction.NameChanged("Bác sĩ An"))
            assertFalse(cleanViewModel.uiState.value.hasUnsavedChanges)
            cleanViewModel.onAction(DoctorApprovalUiAction.LogoutRequested)
            assertEquals(
                DoctorApprovalUiEffect.NavigateLogout(doctorApprovalRouteOwner()),
                cleanViewModel.effects.first(),
            )

            val afterCleanLogout = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = cleanHandle,
            )
            assertFalse(afterCleanLogout.uiState.value.hasRestoredDraft)
        }

    @Test
    fun `saved draft is never restored into a replacement account`() =
        runTest(dispatcher) {
            val savedStateHandle = SavedStateHandle()
            val accountA = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )
            accountA.onAction(DoctorApprovalUiAction.NameChanged("Account A private draft"))

            val replacementState = needsInfoState().copy(
                user = needsInfoUser().copy(
                    id = "backend-b",
                    firebaseUid = "firebase-b",
                    email = "doctor-b@shcare.vn",
                ),
                name = "Bác sĩ Bình",
            )
            val accountB = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = replacementState,
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )

            assertEquals("Bác sĩ Bình", accountB.uiState.value.name)
            assertFalse(accountB.uiState.value.hasRestoredDraft)
        }

    @Test
    fun `saved draft is never restored after the same account signs in at a newer epoch`() =
        runTest(dispatcher) {
            val savedStateHandle = SavedStateHandle()
            val firstSession = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(sessionEpoch = 1L),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )
            firstSession.onAction(DoctorApprovalUiAction.NameChanged("Private epoch one draft"))

            assertEquals(
                1L,
                savedStateHandle.get<Long>("doctor_approval.firebase_session_epoch"),
            )

            val newerSession = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(sessionEpoch = 3L),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )

            assertEquals("Bác sĩ An", newerSession.uiState.value.name)
            assertFalse(newerSession.uiState.value.hasRestoredDraft)
            assertTrue(savedStateHandle.keys().isEmpty())
        }

    @Test
    fun `saved draft is bound to both current authority and requested target workspace`() =
        runTest(dispatcher) {
            val savedStateHandle = SavedStateHandle()
            val clinicAState = needsInfoState().copy(
                user = personalAuthorityNeedsInfoUser(targetWorkspaceId = "clinic-a"),
            )
            val clinicA = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = clinicAState,
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )
            clinicA.onAction(DoctorApprovalUiAction.NameChanged("Clinic A private draft"))

            assertEquals(
                "personal-a",
                savedStateHandle.get<String>("doctor_approval.current_workspace_id"),
            )
            assertEquals(
                "clinic-a",
                savedStateHandle.get<String>("doctor_approval.target_workspace_id"),
            )

            val clinicBState = needsInfoState().copy(
                user = personalAuthorityNeedsInfoUser(targetWorkspaceId = "clinic-b"),
                name = "Server profile for clinic B",
            )
            val clinicB = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = clinicBState,
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )

            assertEquals("Server profile for clinic B", clinicB.uiState.value.name)
            assertFalse(clinicB.uiState.value.hasRestoredDraft)
            assertTrue(savedStateHandle.keys().isEmpty())
        }

    @Test
    fun `cold start route refuses a replacement account without exposing its receipt`() =
        runTest(dispatcher) {
            val savedStateHandle = SavedStateHandle()
            val accountA = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository(),
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )
            accountA.onAction(DoctorApprovalUiAction.NameChanged("Account A private draft"))

            val accountB = needsInfoUser().copy(
                id = "backend-b",
                firebaseUid = "firebase-b",
                email = "doctor-b@shcare.vn",
                name = "Bác sĩ Bình",
            )
            val coldStart = DoctorApprovalViewModel(
                repository = FakeDoctorApprovalRepository().apply {
                    refreshBlock = { accountB }
                },
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = DoctorApprovalUiState(),
                autoStart = false,
                savedStateHandle = savedStateHandle,
            )

            assertFalse(coldStart.uiState.value.hasRestoredDraft)
            coldStart.onAction(DoctorApprovalUiAction.RefreshStatus)
            advanceUntilIdle()

            assertNull(coldStart.uiState.value.user)
            assertTrue(coldStart.uiState.value.name.isBlank())
            assertTrue(coldStart.uiState.value.errorMessage.isNotBlank())
            assertFalse(coldStart.uiState.value.hasRestoredDraft)
            assertTrue(savedStateHandle.keys().isNotEmpty())
        }

    @Test
    fun `draft edits are frozen while a submit receipt is pending`() =
        runTest(dispatcher) {
            val submitGate = CompletableDeferred<AuthUser>()
            val repository = FakeDoctorApprovalRepository().apply {
                submitBlock = { _, _, _ -> submitGate.await() }
            }
            val viewModel = viewModelForNeedsInfo(repository)
            val submittedDraft = viewModel.uiState.value.currentDraft()

            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            runCurrent()
            viewModel.onAction(DoctorApprovalUiAction.NameChanged("Draft B must not race"))

            assertTrue(viewModel.uiState.value.isSubmitting)
            assertEquals(submittedDraft, viewModel.uiState.value.currentDraft())
            submitGate.complete(needsInfoUser().copy(roleRequestStatus = "pending"))
            runCurrent()
        }

    @Test
    fun `pending resubmission restarts approval polling`() =
        runTest(dispatcher) {
            val repository = FakeDoctorApprovalRepository().apply {
                submitBlock = { _, _, _ -> needsInfoUser().copy(roleRequestStatus = "pending") }
            }
            val viewModel = DoctorApprovalViewModel(
                repository = repository,
                expectedFirebaseOwner = doctorApprovalRouteOwner(),
                initialState = needsInfoState(),
                autoStart = false,
                idempotencyKeyFactory = { "intent-key-stable" },
                savedStateHandle = SavedStateHandle(),
                pollIntervalMillis = 1_000L,
            )

            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            runCurrent()
            assertEquals("pending", viewModel.uiState.value.user?.roleRequestStatus)

            advanceTimeBy(1_000L)
            runCurrent()
            assertEquals(1, repository.refreshCalls)
        }

    @Test
    fun `stale actions cannot edit or submit outside needs info lifecycle`() =
        runTest(dispatcher) {
            listOf("pending", "rejected", "approved").forEach { status ->
                val user = if (status == "approved") approvedDoctorUser() else doctorUser(status)
                val savedStateHandle = SavedStateHandle()
                val repository = FakeDoctorApprovalRepository().apply {
                    submitBlock = { _, _, _ -> user }
                }
                val viewModel = DoctorApprovalViewModel(
                    repository = repository,
                    expectedFirebaseOwner = doctorApprovalRouteOwner(),
                    initialState = needsInfoState().copy(
                        user = user,
                        name = "Bác sĩ nguyên bản",
                        selectedSpecialtyId = "",
                        fieldErrors = mapOf("server" to "Giữ nguyên lỗi server"),
                        roleRequestIntentFingerprint = "existing-fingerprint",
                        roleRequestIdempotencyKey = "existing-intent-key",
                    ),
                    autoStart = false,
                    savedStateHandle = savedStateHandle,
                )

                viewModel.onAction(DoctorApprovalUiAction.NameChanged("Không được ghi"))
                viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
                runCurrent()

                assertEquals("status=$status", 0, repository.submitCalls)
                assertEquals("status=$status", "Bác sĩ nguyên bản", viewModel.uiState.value.name)
                assertEquals(
                    "status=$status",
                    "existing-fingerprint",
                    viewModel.uiState.value.roleRequestIntentFingerprint,
                )
                assertEquals(
                    "status=$status",
                    "existing-intent-key",
                    viewModel.uiState.value.roleRequestIdempotencyKey,
                )
                assertEquals(
                    "status=$status",
                    mapOf("server" to "Giữ nguyên lỗi server"),
                    viewModel.uiState.value.fieldErrors,
                )
                assertTrue("status=$status", savedStateHandle.keys().isEmpty())
            }
        }

    @Test
    fun `double submit is single flight and approved effect waits for confirmed receipt`() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<AuthUser>()
            val repository = FakeDoctorApprovalRepository().apply {
                submitBlock = { _, _, _ -> gate.await() }
            }
            val viewModel = viewModelForNeedsInfo(repository)
            val approvedEffect = async { viewModel.effects.first() }

            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            viewModel.onAction(DoctorApprovalUiAction.SubmitNeedsInfo)
            runCurrent()

            assertEquals(1, repository.submitCalls)
            assertTrue(viewModel.uiState.value.isSubmitting)
            assertFalse(approvedEffect.isCompleted)

            gate.complete(approvedDoctorUser())
            advanceUntilIdle()

            assertEquals(
                DoctorApprovalUiEffect.NavigateApproved(doctorApprovalRouteOwner()),
                approvedEffect.await(),
            )
            assertFalse(viewModel.uiState.value.isSubmitting)
        }

    @Test
    fun `cancellation is not converted into an error or stale success`() = runTest(dispatcher) {
        val repository = FakeDoctorApprovalRepository().apply {
            refreshBlock = { throw kotlinx.coroutines.CancellationException("owner left") }
        }
        val viewModel = DoctorApprovalViewModel(
            repository = repository,
            expectedFirebaseOwner = doctorApprovalRouteOwner(),
            initialState = needsInfoState(),
            autoStart = false,
            savedStateHandle = SavedStateHandle(),
        )

        viewModel.onAction(DoctorApprovalUiAction.RefreshStatus)
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.errorMessage.isBlank())
        assertEquals("backend-a", viewModel.uiState.value.user?.id)
        assertFalse(viewModel.uiState.value.isChecking)
    }
}

private class FakeDoctorApprovalRepository : DoctorApprovalRepository {
    var clinicsBlock: suspend () -> List<ClinicOption> = { emptyList() }
    var specialtiesBlock: suspend () -> List<SpecialtyOption> = { emptyList() }
    var refreshBlock: suspend (DoctorApprovalIdentity?) -> AuthUser = { needsInfoUser() }
    var submitBlock: suspend (
        DoctorApprovalIdentity,
        DoctorApprovalNeedsInfoRequest,
        String,
    ) -> AuthUser = { _, _, _ -> needsInfoUser().copy(roleRequestStatus = "pending") }
    var clinicCalls = 0
    var specialtyCalls = 0
    var refreshCalls = 0
    var submitCalls = 0
    val submitKeys = mutableListOf<String>()

    override suspend fun loadClinics(): List<ClinicOption> {
        clinicCalls += 1
        return clinicsBlock()
    }

    override suspend fun loadSpecialties(): List<SpecialtyOption> {
        specialtyCalls += 1
        return specialtiesBlock()
    }

    override suspend fun refreshStatus(expectedIdentity: DoctorApprovalIdentity?): AuthUser {
        refreshCalls += 1
        return refreshBlock(expectedIdentity)
    }

    override suspend fun submitNeedsInfo(
        expectedIdentity: DoctorApprovalIdentity,
        request: DoctorApprovalNeedsInfoRequest,
        idempotencyKey: String,
    ): AuthUser {
        submitCalls += 1
        submitKeys += idempotencyKey
        return submitBlock(expectedIdentity, request, idempotencyKey)
    }
}

private fun viewModelForNeedsInfo(repository: DoctorApprovalRepository) =
    DoctorApprovalViewModel(
        repository = repository,
        expectedFirebaseOwner = doctorApprovalRouteOwner(),
        initialState = needsInfoState(),
        autoStart = false,
        idempotencyKeyFactory = { "intent-key-stable" },
        savedStateHandle = SavedStateHandle(),
    )

private fun needsInfoState() = DoctorApprovalUiState(
    user = needsInfoUser(),
    clinics = listOf(ClinicOption("clinic-a", "Phòng khám A")),
    specialties = listOf(SpecialtyOption("cardiology", "Tim mạch")),
    name = "Bác sĩ An",
    phone = "0912345678",
    license = "CCHN-001",
    selectedClinicId = "clinic-a",
    selectedSpecialtyId = "cardiology",
    selectedAccountType = "doctor",
    reason = "Bổ sung hồ sơ",
)

private fun needsInfoUser() = doctorUser(status = "needs_info").copy(
    roleInfoRequiredFields = listOf("reason"),
    roleInfoRequestMessage = "Vui lòng bổ sung lý do đăng ký.",
    registrationReason = "Bổ sung hồ sơ",
)

private fun personalAuthorityNeedsInfoUser(targetWorkspaceId: String) =
    needsInfoUser().copy(
        organizationId = targetWorkspaceId,
        currentWorkspaceId = "personal-a",
        currentWorkspace = WorkspaceSummary(
            id = "personal-a",
            name = "Personal workspace",
            type = "personal",
            workspaceType = "personal",
            role = "patient",
        ),
        currentMembership = WorkspaceMembership(
            id = "membership-personal-a",
            workspaceId = "personal-a",
            organizationId = "personal-a",
            workspaceName = "Personal workspace",
            workspaceType = "personal",
            role = "patient",
            status = "active",
            operational = true,
        ),
        workspaceType = "personal",
    )

private fun approvedDoctorUser() = doctorUser(status = "approved")

private fun doctorApprovalRouteOwner(sessionEpoch: Long = 1L) = FirebaseOwnerBinding(
    firebaseUserId = "firebase-a",
    email = "doctor-a@shcare.vn",
    sessionEpoch = sessionEpoch,
)
