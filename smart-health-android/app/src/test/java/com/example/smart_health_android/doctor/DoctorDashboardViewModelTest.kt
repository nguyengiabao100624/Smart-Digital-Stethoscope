package com.example.smart_health_android.doctor

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.PatientSnapshot
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.WorkspaceSummary
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
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
class DoctorDashboardViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `initial load uses authenticated workspace and confirmed backend data`() = runTest(dispatcher) {
        val repository = FakeDoctorDashboardRepository()

        val viewModel = DoctorDashboardViewModel(repository)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(DoctorDashboardLoadState.Content, state.loadState)
        assertEquals("workspace-1", state.workspaceId)
        assertEquals("Shcare Clinic", state.workspaceName)
        assertEquals(listOf("scan-1"), state.scans.map(Scan::id))
        assertEquals(listOf("workspace-1"), repository.statusWorkspaceIds)
        assertFalse(state.isStale)
    }

    @Test
    fun `initial load distinguishes permission denial from offline`() = runTest(dispatcher) {
        val forbidden = DoctorDashboardViewModel(
            FakeDoctorDashboardRepository(
                userResults = ArrayDeque(
                    listOf(Result.failure(SmartHealthApiException(403, "FORBIDDEN", message = "denied"))),
                ),
            ),
        )
        runCurrent()
        assertEquals(DoctorDashboardLoadState.PermissionDenied, forbidden.uiState.value.loadState)

        val offline = DoctorDashboardViewModel(
            FakeDoctorDashboardRepository(
                userResults = ArrayDeque(listOf(Result.failure(IOException("offline")))),
            ),
        )
        runCurrent()
        assertEquals(DoctorDashboardLoadState.Offline, offline.uiState.value.loadState)
    }

    @Test
    fun `refresh failure retains confirmed content and marks it stale`() = runTest(dispatcher) {
        val repository = FakeDoctorDashboardRepository(
            userResults = ArrayDeque(
                listOf(
                    Result.success(doctorUser()),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = DoctorDashboardViewModel(repository)
        runCurrent()

        viewModel.onAction(DoctorDashboardUiAction.Refresh)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(DoctorDashboardLoadState.Content, state.loadState)
        assertEquals(listOf("scan-1"), state.scans.map(Scan::id))
        assertTrue(state.isStale)
        assertTrue(state.errorMessage.isNotBlank())
    }

    @Test
    fun `stop retry reuses exact idempotency key and only terminal receipt updates scan`() =
        runTest(dispatcher) {
            val repository = FakeDoctorDashboardRepository(
                stopResults = ArrayDeque(
                    listOf(
                        Result.failure(IOException("timeout")),
                        Result.success(recordingScan().copy(status = "completed")),
                    ),
                ),
            )
            val viewModel = DoctorDashboardViewModel(repository) { "stable-stop-key" }
            runCurrent()

            viewModel.onAction(DoctorDashboardUiAction.StopScan("scan-1"))
            runCurrent()
            assertEquals("recording", viewModel.uiState.value.scans.single().status)
            assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())

            viewModel.onAction(DoctorDashboardUiAction.StopScan("scan-1"))
            runCurrent()

            assertEquals(listOf("stable-stop-key", "stable-stop-key"), repository.stopKeys)
            assertTrue(repository.stopKeys.all(String::isNotBlank))
            assertEquals("completed", viewModel.uiState.value.scans.single().status)
            assertTrue(viewModel.uiState.value.errorMessage.isBlank())
        }

    @Test
    fun `nonterminal or foreign stop receipt cannot fabricate success`() = runTest(dispatcher) {
        val repository = FakeDoctorDashboardRepository(
            stopResults = ArrayDeque(
                listOf(Result.success(recordingScan().copy(id = "scan-other", status = "completed"))),
            ),
        )
        val viewModel = DoctorDashboardViewModel(repository) { "stop-key" }
        runCurrent()

        viewModel.onAction(DoctorDashboardUiAction.StopScan("scan-1"))
        runCurrent()

        assertEquals("recording", viewModel.uiState.value.scans.single().status)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }
}

private class FakeDoctorDashboardRepository(
    private val userResults: ArrayDeque<Result<AuthUser>> = ArrayDeque(listOf(Result.success(doctorUser()))),
    private val status: BackendStatus = BackendStatus(espCount = 1, listeners = 2),
    private val scans: List<Scan> = listOf(recordingScan()),
    private val stopResults: ArrayDeque<Result<Scan>> = ArrayDeque(
        listOf(Result.success(recordingScan().copy(status = "completed"))),
    ),
) : DoctorDashboardRepository {
    val statusWorkspaceIds = mutableListOf<String>()
    val stopKeys = mutableListOf<String>()

    override suspend fun getCurrentUser(): AuthUser =
        if (userResults.size > 1) userResults.removeFirst().getOrThrow() else userResults.first().getOrThrow()

    override suspend fun getStatus(workspaceId: String): BackendStatus {
        statusWorkspaceIds += workspaceId
        return status
    }

    override suspend fun listRecentScans(): List<Scan> = scans

    override suspend fun stopScan(scanId: String, idempotencyKey: String): Scan {
        stopKeys += idempotencyKey
        return stopResults.removeFirst().getOrThrow()
    }
}

private fun doctorUser() = AuthUser(
    id = "doctor-1",
    name = "Doctor Shcare",
    currentWorkspaceId = "workspace-1",
    organizationId = "workspace-1",
    currentWorkspace = WorkspaceSummary(id = "workspace-1", name = "Shcare Clinic", type = "clinic"),
)

private fun recordingScan() = Scan(
    id = "scan-1",
    patientId = "patient-1",
    organizationId = "workspace-1",
    patient = PatientSnapshot(id = "patient-1", patientCode = "P001", name = "Patient One"),
    status = "recording",
    mode = "heart",
)
