package com.example.smart_health_android.consent

import com.example.smart_health_android.R
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientShare
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareRecipient
import com.example.smart_health_android.data.ShareTargetDoctor
import com.example.smart_health_android.data.ShareTargetWorkspace
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.SmartHealthApiException
import java.net.UnknownHostException
import java.time.Instant
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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConsentViewModelTest {
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
    fun loadPublishesOnlyBackendAuthorityRecipientAndLifecycle() = runTest(dispatcher) {
        val backendShare = share(
            authorityType = "administrative_assignment",
            status = "expired",
        )
        val repository = FakeConsentRepository(shares = listOf(backendShare))
        val viewModel = ConsentViewModel(repository)

        viewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(ConsentLoadState.Content, state.loadState)
        assertEquals(listOf(backendShare), state.shares)
        assertEquals("administrative_assignment", state.shares.single().authorityType)
        assertEquals("Bác sĩ Minh", state.shares.single().recipient.name)
        assertFalse(state.shares.single().isActive)
        assertEquals(1, repository.listShareCallCount)
    }

    @Test
    fun loadMapsBackendPermissionAndNetworkFailuresToDistinctStates() = runTest(dispatcher) {
        val permissionRepository = FakeConsentRepository(
            shareFailure = SmartHealthApiException(
                statusCode = 403,
                code = "FORBIDDEN",
                requestId = "req-consent-403",
                message = "Không có quyền quản lý hồ sơ",
            )
        )
        val permissionViewModel = ConsentViewModel(permissionRepository)
        permissionViewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()

        assertEquals(ConsentLoadState.Permission, permissionViewModel.uiState.value.loadState)
        assertEquals("req-consent-403", permissionViewModel.uiState.value.requestId)

        val offlineViewModel = ConsentViewModel(
            FakeConsentRepository(patientFailure = UnknownHostException("api.shcare.invalid"))
        )
        offlineViewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()

        assertEquals(ConsentLoadState.Offline, offlineViewModel.uiState.value.loadState)
    }

    @Test
    fun createKeepsOneIntentKeyAndUsesOnlyTheBackendConfirmedGrant() = runTest(dispatcher) {
        val confirmed = share(
            id = "server-share-9",
            authorityType = "patient_consent",
            status = "active",
        )
        val repository = FakeConsentRepository(createResult = confirmed)
        val viewModel = ConsentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "stable-create-intent" },
            nowProvider = { Instant.parse("2026-07-18T00:00:00Z") },
        )
        viewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()
        viewModel.onAction(ConsentUiAction.StartCreateGrant)
        viewModel.onAction(ConsentUiAction.ScopeChanged(ConsentScope.SelectedScans))
        viewModel.onAction(ConsentUiAction.ScanSelectionChanged("scan-1"))
        viewModel.onAction(ConsentUiAction.ExpiryChanged("2026-08-01T23:59:59.999Z"))
        viewModel.onAction(ConsentUiAction.SubmitGrant)
        advanceUntilIdle()

        assertEquals("stable-create-intent", repository.lastCreateIdempotencyKey)
        assertEquals(ConsentScope.SelectedScans, repository.lastCreateCommand?.scope)
        assertEquals(listOf("scan-1"), repository.lastCreateCommand?.scanIds)
        assertEquals(listOf(confirmed), viewModel.uiState.value.shares)
        assertEquals("patient_consent", viewModel.uiState.value.shares.single().authorityType)
        assertEquals(null, viewModel.uiState.value.editor)
    }

    @Test
    fun failedCreateKeepsTheSameKeyForARealRetryAndNeverCreatesLocalSuccess() = runTest(dispatcher) {
        val repository = FakeConsentRepository(
            createFailure = UnknownHostException("offline"),
        )
        val viewModel = ConsentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "stable-retry-intent" },
        )
        viewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()
        viewModel.onAction(ConsentUiAction.StartCreateGrant)
        viewModel.onAction(ConsentUiAction.SubmitGrant)
        advanceUntilIdle()

        assertEquals(emptyList<PatientShare>(), viewModel.uiState.value.shares)
        assertEquals("stable-retry-intent", viewModel.uiState.value.editor?.idempotencyKey)
        assertEquals(1, repository.createCallCount)

        repository.createFailure = null
        repository.createResult = share(id = "server-after-retry")
        viewModel.onAction(ConsentUiAction.SubmitGrant)
        advanceUntilIdle()

        assertEquals(2, repository.createCallCount)
        assertEquals(listOf("stable-retry-intent", "stable-retry-intent"), repository.createKeys)
        assertEquals("server-after-retry", viewModel.uiState.value.shares.single().id)
    }

    @Test
    fun incompleteMutationResponseNeverClosesEditorOrPublishesLocalSuccess() = runTest(dispatcher) {
        val incomplete = PatientShare(
            id = "legacy-share",
            patientId = "patient-1",
            doctorUserId = "doctor-1",
            active = true,
        )
        val repository = FakeConsentRepository(createResult = incomplete)
        val viewModel = ConsentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "incomplete-response-intent" },
        )
        viewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()
        viewModel.onAction(ConsentUiAction.StartCreateGrant)
        viewModel.onAction(ConsentUiAction.SubmitGrant)
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.shares.isEmpty())
        assertNotNull(viewModel.uiState.value.editor)
        assertEquals(
            "incomplete-response-intent",
            viewModel.uiState.value.editor?.idempotencyKey,
        )
        assertTrue(viewModel.uiState.value.mutationErrorMessage.isNotBlank())
    }

    @Test
    fun selectedScanScopeRequiresARealBackendScanSelection() = runTest(dispatcher) {
        val repository = FakeConsentRepository()
        val viewModel = ConsentViewModel(repository)
        viewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()
        viewModel.onAction(ConsentUiAction.StartCreateGrant)
        viewModel.onAction(ConsentUiAction.ScopeChanged(ConsentScope.SelectedScans))
        viewModel.onAction(ConsentUiAction.SubmitGrant)
        advanceUntilIdle()

        assertEquals(
            R.string.consent_error_scan_required,
            viewModel.uiState.value.editor?.fieldErrors?.get("scanIds"),
        )
        assertEquals(0, repository.createCallCount)
    }

    @Test
    fun revokeKeepsOneIntentKeyAndReplacesStateOnlyWithBackendResponse() = runTest(dispatcher) {
        val activeShare = share(status = "active")
        val revokedShare = activeShare.copy(
            status = "revoked",
            active = false,
            revokedAt = "2026-07-18T08:00:00Z",
        )
        val repository = FakeConsentRepository(
            shares = listOf(activeShare),
            revokeResult = revokedShare,
        )
        val viewModel = ConsentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "stable-revoke-intent" },
        )
        viewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()
        viewModel.onAction(ConsentUiAction.RequestRevoke(activeShare.id))

        assertNotNull(viewModel.uiState.value.pendingRevocation)
        viewModel.onAction(ConsentUiAction.ConfirmRevoke)
        advanceUntilIdle()

        assertEquals("stable-revoke-intent", repository.lastRevokeIdempotencyKey)
        assertEquals("revoked", viewModel.uiState.value.shares.single().status)
        assertFalse(viewModel.uiState.value.shares.single().isActive)
        assertEquals(null, viewModel.uiState.value.pendingRevocation)
    }

    @Test
    fun refreshFailureKeepsPreviouslyConfirmedDataAndMarksItStale() = runTest(dispatcher) {
        val activeShare = share(status = "active")
        val repository = FakeConsentRepository(shares = listOf(activeShare))
        val viewModel = ConsentViewModel(repository)
        viewModel.onAction(ConsentUiAction.Load)
        advanceUntilIdle()

        repository.shareFailure = UnknownHostException("offline")
        viewModel.onAction(ConsentUiAction.Refresh)
        advanceUntilIdle()

        assertEquals(ConsentLoadState.Content, viewModel.uiState.value.loadState)
        assertEquals(listOf(activeShare), viewModel.uiState.value.shares)
        assertTrue(viewModel.uiState.value.isStale)
    }
}

private fun patient() = Patient(
    id = "patient-1",
    patientCode = "BN-001",
    name = "Nguyễn An",
    profileType = "self",
)

private fun share(
    id: String = "share-1",
    authorityType: String = "clinician_access_grant",
    status: String = "active",
) = PatientShare(
    id = id,
    patientId = "patient-1",
    authorityType = authorityType,
    status = status,
    recipient = ShareRecipient(
        type = "doctor",
        id = "doctor-1",
        name = "Bác sĩ Minh",
        workspaceId = "workspace-1",
    ),
    scope = "patient_profile",
    active = status == "active",
    createdAt = "2026-07-18T07:00:00Z",
)

private class FakeConsentRepository(
    private val patients: List<Patient> = listOf(patient()),
    private val targets: ShareTargets = ShareTargets(
        doctors = listOf(
            ShareTargetDoctor(
                id = "doctor-1",
                name = "Bác sĩ Minh",
                organizationId = "workspace-1",
            )
        ),
        workspaces = listOf(
            ShareTargetWorkspace(
                id = "workspace-1",
                name = "Phòng khám Shcare",
            )
        ),
    ),
    private val shares: List<PatientShare> = emptyList(),
    private val scans: List<Scan> = listOf(
        Scan(
            id = "scan-1",
            patientId = "patient-1",
            status = "completed",
            startedAt = "2026-07-17T08:00:00Z",
        )
    ),
    private val patientFailure: Throwable? = null,
    var shareFailure: Throwable? = null,
    var createFailure: Throwable? = null,
    var createResult: PatientShare? = null,
    private val revokeFailure: Throwable? = null,
    private val revokeResult: PatientShare? = null,
) : ConsentRepository {
    var listShareCallCount: Int = 0
        private set
    var createCallCount: Int = 0
        private set
    val createKeys = mutableListOf<String>()
    var lastCreateCommand: CreateConsentGrantCommand? = null
        private set
    var lastCreateIdempotencyKey: String? = null
        private set
    var lastRevokeIdempotencyKey: String? = null
        private set

    override suspend fun listPatients(): List<Patient> {
        patientFailure?.let { throw it }
        return patients
    }

    override suspend fun listTargets(): ShareTargets = targets

    override suspend fun listShares(patientId: String): List<PatientShare> {
        listShareCallCount += 1
        shareFailure?.let { throw it }
        return shares
    }

    override suspend fun listScans(patientId: String): List<Scan> = scans

    override suspend fun createGrant(
        command: CreateConsentGrantCommand,
        idempotencyKey: String,
    ): PatientShare {
        createCallCount += 1
        createKeys += idempotencyKey
        lastCreateCommand = command
        lastCreateIdempotencyKey = idempotencyKey
        createFailure?.let { throw it }
        return createResult ?: error("No create result configured")
    }

    override suspend fun revokeGrant(
        patientId: String,
        shareId: String,
        idempotencyKey: String,
    ): PatientShare {
        lastRevokeIdempotencyKey = idempotencyKey
        revokeFailure?.let { throw it }
        return revokeResult ?: error("No revoke result configured")
    }
}
