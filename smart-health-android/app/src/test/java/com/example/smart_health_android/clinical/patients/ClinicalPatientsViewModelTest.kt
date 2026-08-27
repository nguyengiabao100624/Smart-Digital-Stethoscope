package com.example.smart_health_android.clinical.patients

import com.example.smart_health_android.data.ClinicalPatientList
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClinicalPatientsViewModelTest {
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
    fun `initial load exposes only the canonical workspace list`() = runTest(dispatcher) {
        val repository = FakeClinicalPatientsRepository(
            results = ArrayDeque(
                listOf(Result.success(patientList())),
            ),
        )

        val viewModel = ClinicalPatientsViewModel(
            repository = repository,
            expectedWorkspaceId = "workspace-1",
        )
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(ClinicalPatientsLoadState.Content, state.loadState)
        assertEquals(listOf("patient-1", "patient-2"), state.patients.map(Patient::id))
        assertEquals("patient-1", state.selectedPatientId)
        assertFalse(state.isStale)
        assertNull(state.error)
        assertEquals(listOf(""), repository.queries)
    }

    @Test
    fun `search submits the trimmed backend query and updates selection`() = runTest(dispatcher) {
        val repository = FakeClinicalPatientsRepository(
            results = ArrayDeque(
                listOf(
                    Result.success(patientList()),
                    Result.success(patientList(patients = listOf(patient("patient-2", "Bình")))),
                ),
            ),
        )
        val viewModel = ClinicalPatientsViewModel(repository, "workspace-1")
        runCurrent()

        viewModel.onAction(ClinicalPatientsUiAction.UpdateQuery("  Bình  "))
        viewModel.onAction(ClinicalPatientsUiAction.SubmitSearch)
        runCurrent()

        assertEquals(listOf("", "Bình"), repository.queries)
        assertEquals(listOf("patient-2"), viewModel.uiState.value.patients.map(Patient::id))
        assertEquals("patient-2", viewModel.uiState.value.selectedPatientId)
        assertEquals("Bình", viewModel.uiState.value.submittedQuery)
    }

    @Test
    fun `refresh failure keeps confirmed patients and marks the list stale`() = runTest(dispatcher) {
        val repository = FakeClinicalPatientsRepository(
            results = ArrayDeque(
                listOf(
                    Result.success(patientList()),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = ClinicalPatientsViewModel(repository, "workspace-1")
        runCurrent()

        viewModel.onAction(ClinicalPatientsUiAction.Refresh)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(ClinicalPatientsLoadState.Content, state.loadState)
        assertEquals(2, state.patients.size)
        assertTrue(state.isStale)
        assertEquals(ClinicalPatientsError.Offline, state.error)
    }

    @Test
    fun `initial forbidden response becomes a permission state`() = runTest(dispatcher) {
        val repository = FakeClinicalPatientsRepository(
            results = ArrayDeque(
                listOf(
                    Result.failure(
                        SmartHealthApiException(
                            statusCode = 403,
                            code = "FORBIDDEN",
                            message = "forbidden",
                        ),
                    ),
                ),
            ),
        )
        val viewModel = ClinicalPatientsViewModel(repository, "workspace-1")
        runCurrent()

        assertEquals(
            ClinicalPatientsLoadState.PermissionDenied,
            viewModel.uiState.value.loadState,
        )
        assertEquals(
            ClinicalPatientsError.PermissionDenied,
            viewModel.uiState.value.error,
        )
    }

    @Test
    fun `http server failure is not misreported as offline`() = runTest(dispatcher) {
        val repository = FakeClinicalPatientsRepository(
            results = ArrayDeque(
                listOf(
                    Result.failure(
                        SmartHealthApiException(
                            statusCode = 500,
                            code = "INTERNAL_ERROR",
                            message = "server failure",
                        ),
                    ),
                ),
            ),
        )

        val viewModel = ClinicalPatientsViewModel(repository, "workspace-1")
        runCurrent()

        assertEquals(ClinicalPatientsLoadState.Error, viewModel.uiState.value.loadState)
        assertEquals(ClinicalPatientsError.Unknown, viewModel.uiState.value.error)
    }

    @Test
    fun `initial load cannot be replaced by an unconfirmed search request`() =
        runTest(dispatcher) {
            val repository = BlockingClinicalPatientsRepository()
            val viewModel = ClinicalPatientsViewModel(repository, "workspace-1")
            runCurrent()

            viewModel.onAction(ClinicalPatientsUiAction.UpdateQuery("Nguyễn An"))
            viewModel.onAction(ClinicalPatientsUiAction.SubmitSearch)
            runCurrent()

            assertEquals(listOf(""), repository.queries)
            assertEquals("", viewModel.uiState.value.submittedQuery)

            repository.response.complete(patientList())
            runCurrent()
            assertEquals(ClinicalPatientsLoadState.Content, viewModel.uiState.value.loadState)
        }
}

private class BlockingClinicalPatientsRepository : ClinicalPatientsRepository {
    val queries = mutableListOf<String>()
    val response = CompletableDeferred<ClinicalPatientList>()

    override suspend fun load(
        query: String,
        expectedWorkspaceId: String,
    ): ClinicalPatientList {
        queries += query
        return response.await()
    }
}

private class FakeClinicalPatientsRepository(
    private val results: ArrayDeque<Result<ClinicalPatientList>>,
) : ClinicalPatientsRepository {
    val queries = mutableListOf<String>()

    override suspend fun load(
        query: String,
        expectedWorkspaceId: String,
    ): ClinicalPatientList {
        queries += query
        return results.removeFirst().getOrThrow()
    }
}

private fun patientList(
    patients: List<Patient> = listOf(
        patient("patient-1", "An"),
        patient("patient-2", "Bình"),
    ),
) = ClinicalPatientList(
    workspaceId = "workspace-1",
    patients = patients,
)

private fun patient(id: String, name: String) = Patient(
    id = id,
    patientCode = id.uppercase(),
    name = name,
)
