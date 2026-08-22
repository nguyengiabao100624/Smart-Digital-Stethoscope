package com.example.smart_health_android.clinical.patients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.ClinicalPatientList
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

interface ClinicalPatientsRepository {
    suspend fun load(
        query: String,
        expectedWorkspaceId: String,
    ): ClinicalPatientList
}

class ApiClinicalPatientsRepository(
    private val api: SmartHealthApi,
) : ClinicalPatientsRepository {
    override suspend fun load(
        query: String,
        expectedWorkspaceId: String,
    ): ClinicalPatientList {
        val result = api.listClinicalPatients(query)
        if (
            expectedWorkspaceId.isBlank() ||
            result.workspaceId != expectedWorkspaceId
        ) {
            throw ClinicalPatientWorkspaceMismatchException()
        }
        return result
    }
}

class ClinicalPatientWorkspaceMismatchException :
    IllegalStateException("Clinical patient response is not bound to the expected workspace.")

enum class ClinicalPatientsLoadState {
    Loading,
    Content,
    Empty,
    PermissionDenied,
    Offline,
    Error,
}

enum class ClinicalPatientsError {
    PermissionDenied,
    Offline,
    WorkspaceMismatch,
    Unknown,
}

data class ClinicalPatientsUiState(
    val loadState: ClinicalPatientsLoadState = ClinicalPatientsLoadState.Loading,
    val query: String = "",
    val submittedQuery: String = "",
    val patients: List<Patient> = emptyList(),
    val selectedPatientId: String? = null,
    val compactDetailVisible: Boolean = false,
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val error: ClinicalPatientsError? = null,
    val requestId: String = "",
)

sealed interface ClinicalPatientsUiAction {
    data class UpdateQuery(val value: String) : ClinicalPatientsUiAction
    data object SubmitSearch : ClinicalPatientsUiAction
    data object Refresh : ClinicalPatientsUiAction
    data class SelectPatient(val patientId: String) : ClinicalPatientsUiAction
    data object CloseDetail : ClinicalPatientsUiAction
}

class ClinicalPatientsViewModel(
    private val repository: ClinicalPatientsRepository,
    private val expectedWorkspaceId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ClinicalPatientsUiState())
    val uiState: StateFlow<ClinicalPatientsUiState> = _uiState.asStateFlow()
    private var loadInFlight = false

    init {
        require(expectedWorkspaceId.isNotBlank()) {
            "A canonical workspace is required for the clinical patient list."
        }
        load(query = "", initial = true)
    }

    fun onAction(action: ClinicalPatientsUiAction) {
        when (action) {
            is ClinicalPatientsUiAction.UpdateQuery -> _uiState.update {
                it.copy(query = action.value.take(MAX_QUERY_LENGTH))
            }
            ClinicalPatientsUiAction.SubmitSearch -> {
                if (loadInFlight) return
                val query = _uiState.value.query.trim()
                _uiState.update { it.copy(query = query, submittedQuery = query) }
                load(query = query, initial = false)
            }
            ClinicalPatientsUiAction.Refresh ->
                load(query = _uiState.value.submittedQuery, initial = false)
            is ClinicalPatientsUiAction.SelectPatient -> {
                if (_uiState.value.patients.any { it.id == action.patientId }) {
                    _uiState.update {
                        it.copy(
                            selectedPatientId = action.patientId,
                            compactDetailVisible = true,
                        )
                    }
                }
            }
            ClinicalPatientsUiAction.CloseDetail ->
                _uiState.update { it.copy(compactDetailVisible = false) }
        }
    }

    private fun load(query: String, initial: Boolean) {
        if (loadInFlight) return
        loadInFlight = true
        _uiState.update {
            it.copy(
                loadState = if (initial && !it.hasLoaded) {
                    ClinicalPatientsLoadState.Loading
                } else {
                    it.loadState
                },
                isRefreshing = !initial,
                error = null,
                requestId = "",
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.load(
                    query = query,
                    expectedWorkspaceId = expectedWorkspaceId,
                )
            }.onSuccess { response ->
                loadInFlight = false
                if (response.workspaceId != expectedWorkspaceId) {
                    onLoadFailure(ClinicalPatientWorkspaceMismatchException())
                    return@onSuccess
                }
                val selectedId = _uiState.value.selectedPatientId
                    ?.takeIf { selected -> response.patients.any { it.id == selected } }
                    ?: response.patients.firstOrNull()?.id
                _uiState.update {
                    it.copy(
                        loadState = if (response.patients.isEmpty()) {
                            ClinicalPatientsLoadState.Empty
                        } else {
                            ClinicalPatientsLoadState.Content
                        },
                        patients = response.patients,
                        selectedPatientId = selectedId,
                        compactDetailVisible = it.compactDetailVisible && selectedId != null,
                        hasLoaded = true,
                        isRefreshing = false,
                        isStale = false,
                        error = null,
                        requestId = "",
                    )
                }
            }.onFailure { error ->
                loadInFlight = false
                onLoadFailure(error)
            }
        }
    }

    private fun onLoadFailure(error: Throwable) {
        _uiState.update { current ->
            if (current.hasLoaded) {
                current.copy(
                    isRefreshing = false,
                    isStale = true,
                    error = clinicalPatientsError(error),
                    requestId = clinicalRequestId(error),
                )
            } else {
                current.copy(
                    loadState = clinicalPatientsFailureState(error),
                    isRefreshing = false,
                    isStale = false,
                    error = clinicalPatientsError(error),
                    requestId = clinicalRequestId(error),
                )
            }
        }
    }

    companion object {
        private const val MAX_QUERY_LENGTH = 160
    }
}

class ClinicalPatientsViewModelFactory(
    private val expectedWorkspaceId: String,
    private val repository: ClinicalPatientsRepository =
        ApiClinicalPatientsRepository(SmartHealthRepository.api),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(ClinicalPatientsViewModel::class.java))
        return ClinicalPatientsViewModel(
            repository = repository,
            expectedWorkspaceId = expectedWorkspaceId,
        ) as T
    }
}

private fun clinicalPatientsFailureState(error: Throwable): ClinicalPatientsLoadState = when {
    error is SmartHealthApiException && error.statusCode == 403 ->
        ClinicalPatientsLoadState.PermissionDenied
    error is SmartHealthApiException -> ClinicalPatientsLoadState.Error
    error is IOException -> ClinicalPatientsLoadState.Offline
    else -> ClinicalPatientsLoadState.Error
}

private fun clinicalPatientsError(error: Throwable): ClinicalPatientsError = when {
    error is SmartHealthApiException && error.statusCode == 403 ->
        ClinicalPatientsError.PermissionDenied
    error is SmartHealthApiException ->
        ClinicalPatientsError.Unknown
    error is IOException ->
        ClinicalPatientsError.Offline
    error is ClinicalPatientWorkspaceMismatchException ->
        ClinicalPatientsError.WorkspaceMismatch
    else -> ClinicalPatientsError.Unknown
}

private fun clinicalRequestId(error: Throwable): String =
    (error as? SmartHealthApiException)?.requestId.orEmpty()
