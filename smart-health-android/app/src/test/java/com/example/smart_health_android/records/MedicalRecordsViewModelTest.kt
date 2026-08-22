package com.example.smart_health_android.records

import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareTargetDoctor
import com.example.smart_health_android.data.ShareTargetWorkspace
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MedicalRecordsViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `initial load exposes confirmed scans and real share targets`() = runTest(dispatcher) {
        val repository = FakeMedicalRecordsRepository()

        val viewModel = MedicalRecordsViewModel(repository)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(MedicalRecordsLoadState.Content, state.loadState)
        assertEquals(listOf("scan-1"), state.scans.map(Scan::id))
        assertEquals(listOf("doctor-1"), state.shareTargets.doctors.map(ShareTargetDoctor::id))
        assertEquals(listOf("workspace-2"), state.shareTargets.workspaces.map(ShareTargetWorkspace::id))
    }

    @Test
    fun `initial load distinguishes permission denial from offline`() = runTest(dispatcher) {
        val forbidden = MedicalRecordsViewModel(
            FakeMedicalRecordsRepository(
                scanResults = ArrayDeque(
                    listOf(Result.failure(SmartHealthApiException(403, "FORBIDDEN", message = "denied"))),
                ),
            ),
        )
        runCurrent()
        assertEquals(MedicalRecordsLoadState.PermissionDenied, forbidden.uiState.value.loadState)

        val offline = MedicalRecordsViewModel(
            FakeMedicalRecordsRepository(
                scanResults = ArrayDeque(listOf(Result.failure(IOException("offline")))),
            ),
        )
        runCurrent()
        assertEquals(MedicalRecordsLoadState.Offline, offline.uiState.value.loadState)
    }

    @Test
    fun `refresh failure keeps confirmed records and marks them stale`() = runTest(dispatcher) {
        val repository = FakeMedicalRecordsRepository(
            scanResults = ArrayDeque(
                listOf(
                    Result.success(listOf(recordingRecord())),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = MedicalRecordsViewModel(repository)
        runCurrent()

        viewModel.onAction(MedicalRecordsUiAction.Refresh)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(MedicalRecordsLoadState.Content, state.loadState)
        assertEquals(listOf("scan-1"), state.scans.map(Scan::id))
        assertTrue(state.isStale)
        assertTrue(state.errorMessage.isNotBlank())
    }

    @Test
    fun `latest debounced target query wins over stale response`() = runTest(dispatcher) {
        val repository = FakeMedicalRecordsRepository()
        val viewModel = MedicalRecordsViewModel(repository)
        runCurrent()

        viewModel.onAction(MedicalRecordsUiAction.ShareQueryChanged("old"))
        advanceTimeBy(300)
        runCurrent()
        viewModel.onAction(MedicalRecordsUiAction.ShareQueryChanged("new"))
        advanceUntilIdle()

        assertEquals(
            listOf("doctor-new"),
            viewModel.uiState.value.shareTargets.doctors.map(ShareTargetDoctor::id),
        )
    }

    @Test
    fun `selecting a doctor or workspace remains mutually exclusive`() = runTest(dispatcher) {
        val viewModel = MedicalRecordsViewModel(FakeMedicalRecordsRepository())
        runCurrent()
        val doctor = ShareTargetDoctor(id = "doctor-1", name = "Doctor")
        val workspace = ShareTargetWorkspace(id = "workspace-2", name = "Clinic")

        viewModel.onAction(MedicalRecordsUiAction.DoctorSelected(doctor))
        assertEquals(doctor, viewModel.uiState.value.selectedShareDoctor)
        assertNull(viewModel.uiState.value.selectedShareWorkspace)

        viewModel.onAction(MedicalRecordsUiAction.WorkspaceSelected(workspace))
        assertNull(viewModel.uiState.value.selectedShareDoctor)
        assertEquals(workspace, viewModel.uiState.value.selectedShareWorkspace)
    }

    @Test
    fun `share validates patient and exactly one target before mutation`() = runTest(dispatcher) {
        val missingPatientRepository = FakeMedicalRecordsRepository(
            scanResults = ArrayDeque(listOf(Result.success(listOf(recordingRecord().copy(patientId = ""))))),
        )
        val missingPatient = MedicalRecordsViewModel(missingPatientRepository)
        runCurrent()
        missingPatient.onAction(MedicalRecordsUiAction.ShareRecord("scan-1"))
        runCurrent()
        assertEquals(0, missingPatientRepository.shareCalls)
        assertTrue(missingPatient.uiState.value.errorMessage.isNotBlank())

        val missingTargetRepository = FakeMedicalRecordsRepository()
        val missingTarget = MedicalRecordsViewModel(missingTargetRepository)
        runCurrent()
        missingTarget.onAction(MedicalRecordsUiAction.ShareRecord("scan-1"))
        runCurrent()
        assertEquals(0, missingTargetRepository.shareCalls)
        assertTrue(missingTarget.uiState.value.errorMessage.isNotBlank())
    }

    @Test
    fun `share retry reuses exact idempotency key and reports success only after receipt`() =
        runTest(dispatcher) {
            val repository = FakeMedicalRecordsRepository(
                shareResults = ArrayDeque(
                    listOf(Result.failure(IOException("timeout")), Result.success(Unit)),
                ),
            )
            val viewModel = MedicalRecordsViewModel(repository) { "stable-share-key" }
            runCurrent()
            viewModel.onAction(
                MedicalRecordsUiAction.DoctorSelected(ShareTargetDoctor(id = "doctor-1", name = "Doctor")),
            )

            viewModel.onAction(MedicalRecordsUiAction.ShareRecord("scan-1"))
            runCurrent()
            assertTrue(viewModel.uiState.value.statusMessage.isBlank())
            assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())

            viewModel.onAction(MedicalRecordsUiAction.ShareRecord("scan-1"))
            runCurrent()

            assertEquals(listOf("stable-share-key", "stable-share-key"), repository.shareKeys)
            assertTrue(repository.shareKeys.all(String::isNotBlank))
            assertTrue(viewModel.uiState.value.statusMessage.isNotBlank())
        }

    @Test
    fun `stop retry reuses key and rejects nonterminal receipt`() = runTest(dispatcher) {
        val repository = FakeMedicalRecordsRepository(
            stopResults = ArrayDeque(
                listOf(
                    Result.failure(IOException("timeout")),
                    Result.success(recordingRecord()),
                ),
            ),
        )
        val viewModel = MedicalRecordsViewModel(repository) { "stable-stop-key" }
        runCurrent()

        viewModel.onAction(MedicalRecordsUiAction.StopRecord("scan-1"))
        runCurrent()
        viewModel.onAction(MedicalRecordsUiAction.StopRecord("scan-1"))
        runCurrent()

        assertEquals(listOf("stable-stop-key", "stable-stop-key"), repository.stopKeys)
        assertEquals("recording", viewModel.uiState.value.scans.single().status)
        assertTrue(viewModel.uiState.value.statusMessage.isBlank())
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }
}

private class FakeMedicalRecordsRepository(
    private val scanResults: ArrayDeque<Result<List<Scan>>> = ArrayDeque(
        listOf(Result.success(listOf(recordingRecord()))),
    ),
    private val stopResults: ArrayDeque<Result<Scan>> = ArrayDeque(
        listOf(Result.success(recordingRecord().copy(status = "completed"))),
    ),
    private val shareResults: ArrayDeque<Result<Unit>> = ArrayDeque(listOf(Result.success(Unit))),
) : MedicalRecordsRepository {
    val stopKeys = mutableListOf<String>()
    val shareKeys = mutableListOf<String>()
    var shareCalls = 0

    override suspend fun listScans(): List<Scan> =
        if (scanResults.size > 1) scanResults.removeFirst().getOrThrow() else scanResults.first().getOrThrow()

    override suspend fun listShareTargets(query: String): ShareTargets {
        if (query == "old") {
            withContext(NonCancellable) { delay(500) }
            return ShareTargets(doctors = listOf(ShareTargetDoctor(id = "doctor-old")))
        }
        if (query == "new") {
            delay(10)
            return ShareTargets(doctors = listOf(ShareTargetDoctor(id = "doctor-new")))
        }
        return ShareTargets(
            doctors = listOf(ShareTargetDoctor(id = "doctor-1", name = "Doctor")),
            workspaces = listOf(ShareTargetWorkspace(id = "workspace-2", name = "Clinic")),
        )
    }

    override suspend fun stopScan(scanId: String, idempotencyKey: String): Scan {
        stopKeys += idempotencyKey
        return stopResults.removeFirst().getOrThrow()
    }

    override suspend fun shareRecord(
        patientId: String,
        scanId: String,
        targetDoctorUserId: String,
        targetWorkspaceId: String,
        idempotencyKey: String,
    ) {
        shareCalls += 1
        shareKeys += idempotencyKey
        shareResults.removeFirst().getOrThrow()
    }
}

private fun recordingRecord() = Scan(
    id = "scan-1",
    patientId = "patient-1",
    organizationId = "workspace-1",
    status = "recording",
    mode = "heart",
)
