package com.example.smart_health_android.clinical.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.ClinicalAlert
import com.example.smart_health_android.data.ClinicalAlertList
import com.example.smart_health_android.data.ClinicalAlertStatus
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ClinicalAlertFilter(
    val status: ClinicalAlertStatus?,
) {
    All(null),
    Open(ClinicalAlertStatus.Open),
    Acknowledged(ClinicalAlertStatus.Acknowledged),
    Resolved(ClinicalAlertStatus.Resolved),
}

enum class ClinicalAlertAction {
    Acknowledge,
    Resolve,
}

enum class ClinicalAlertValidationError {
    ResolutionNoteRequired,
}

data class PendingClinicalAlertTransition(
    val alertId: String,
    val action: ClinicalAlertAction,
    val expectedVersion: Int,
    val idempotencyKey: String,
    val note: String = "",
    val validationError: ClinicalAlertValidationError? = null,
)

interface ClinicalAlertsRepository {
    suspend fun load(
        filter: ClinicalAlertFilter,
        expectedWorkspaceId: String,
    ): ClinicalAlertList

    suspend fun transition(
        alert: ClinicalAlert,
        action: ClinicalAlertAction,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalAlert
}

class ApiClinicalAlertsRepository(
    private val api: SmartHealthApi,
) : ClinicalAlertsRepository {
    override suspend fun load(
        filter: ClinicalAlertFilter,
        expectedWorkspaceId: String,
    ): ClinicalAlertList {
        val response = api.listClinicalAlerts(
            status = filter.status,
            limit = 50,
        )
        if (
            expectedWorkspaceId.isBlank() ||
            response.workspaceId != expectedWorkspaceId ||
            response.alerts.any { it.organizationId != expectedWorkspaceId }
        ) {
            throw ClinicalAlertWorkspaceMismatchException()
        }
        return response
    }

    override suspend fun transition(
        alert: ClinicalAlert,
        action: ClinicalAlertAction,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalAlert {
        if (
            expectedWorkspaceId.isBlank() ||
            alert.organizationId != expectedWorkspaceId
        ) {
            throw ClinicalAlertWorkspaceMismatchException()
        }
        val response = when (action) {
            ClinicalAlertAction.Acknowledge -> api.acknowledgeClinicalAlert(
                alertId = alert.id,
                note = note,
                expectedVersion = alert.version,
                idempotencyKey = idempotencyKey,
            )
            ClinicalAlertAction.Resolve -> api.resolveClinicalAlert(
                alertId = alert.id,
                note = note,
                expectedVersion = alert.version,
                idempotencyKey = idempotencyKey,
            )
        }
        val expectedStatus = when (action) {
            ClinicalAlertAction.Acknowledge -> ClinicalAlertStatus.Acknowledged
            ClinicalAlertAction.Resolve -> ClinicalAlertStatus.Resolved
        }
        val confirmed = response.alert
        if (
            response.workspaceId != expectedWorkspaceId ||
            confirmed.organizationId != expectedWorkspaceId ||
            confirmed.id != alert.id ||
            confirmed.status != expectedStatus ||
            confirmed.version != alert.version + 1
        ) {
            throw ClinicalAlertConfirmationException()
        }
        return confirmed
    }
}

class ClinicalAlertWorkspaceMismatchException :
    IllegalStateException("Clinical alert response is not bound to the expected workspace.")

class ClinicalAlertConfirmationException :
    IllegalStateException("Backend did not confirm the expected clinical alert transition.")

enum class ClinicalAlertsLoadState {
    Loading,
    Content,
    Empty,
    PermissionDenied,
    Offline,
    Error,
}

enum class ClinicalAlertsError {
    PermissionDenied,
    Conflict,
    Offline,
    WorkspaceMismatch,
    Confirmation,
    Unknown,
}

data class ClinicalAlertsUiState(
    val loadState: ClinicalAlertsLoadState = ClinicalAlertsLoadState.Loading,
    val filter: ClinicalAlertFilter = ClinicalAlertFilter.Open,
    val alerts: List<ClinicalAlert> = emptyList(),
    val selectedAlertId: String? = null,
    val compactDetailVisible: Boolean = false,
    val canManage: Boolean = false,
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val isMutating: Boolean = false,
    val isStale: Boolean = false,
    val pendingTransition: PendingClinicalAlertTransition? = null,
    val error: ClinicalAlertsError? = null,
    val requestId: String = "",
)

sealed interface ClinicalAlertsUiAction {
    data object Refresh : ClinicalAlertsUiAction
    data class ChangeFilter(val filter: ClinicalAlertFilter) : ClinicalAlertsUiAction
    data class SelectAlert(val alertId: String) : ClinicalAlertsUiAction
    data object CloseDetail : ClinicalAlertsUiAction
    data class RequestTransition(
        val alertId: String,
        val action: ClinicalAlertAction,
    ) : ClinicalAlertsUiAction
    data class UpdateTransitionNote(val note: String) : ClinicalAlertsUiAction
    data object DismissTransition : ClinicalAlertsUiAction
    data object ConfirmTransition : ClinicalAlertsUiAction
}

sealed interface ClinicalAlertsUiEffect {
    data class BackendTransitionConfirmed(
        val action: ClinicalAlertAction,
    ) : ClinicalAlertsUiEffect

    data object BackendStateRefreshedAfterConflict : ClinicalAlertsUiEffect
}

class ClinicalAlertsViewModel(
    private val repository: ClinicalAlertsRepository,
    private val expectedWorkspaceId: String,
    canManage: Boolean,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        ClinicalAlertsUiState(canManage = canManage),
    )
    val uiState: StateFlow<ClinicalAlertsUiState> = _uiState.asStateFlow()

    private val _effects = Channel<ClinicalAlertsUiEffect>(Channel.BUFFERED)
    val effects: Flow<ClinicalAlertsUiEffect> = _effects.receiveAsFlow()
    private var loadInFlight = false

    init {
        require(expectedWorkspaceId.isNotBlank()) {
            "A canonical workspace is required for the clinical alert ledger."
        }
        load(initial = true)
    }

    fun onAction(action: ClinicalAlertsUiAction) {
        when (action) {
            ClinicalAlertsUiAction.Refresh -> load(initial = false)
            is ClinicalAlertsUiAction.ChangeFilter -> {
                if (
                    !loadInFlight &&
                    !_uiState.value.isRefreshing &&
                    !_uiState.value.isMutating &&
                    action.filter != _uiState.value.filter
                ) {
                    _uiState.update { it.copy(filter = action.filter) }
                    load(initial = false)
                }
            }
            is ClinicalAlertsUiAction.SelectAlert -> {
                if (_uiState.value.alerts.any { it.id == action.alertId }) {
                    _uiState.update {
                        it.copy(
                            selectedAlertId = action.alertId,
                            compactDetailVisible = true,
                        )
                    }
                }
            }
            ClinicalAlertsUiAction.CloseDetail ->
                _uiState.update { it.copy(compactDetailVisible = false) }
            is ClinicalAlertsUiAction.RequestTransition ->
                requestTransition(action.alertId, action.action)
            is ClinicalAlertsUiAction.UpdateTransitionNote -> _uiState.update { state ->
                state.pendingTransition?.let { pending ->
                    state.copy(
                        pendingTransition = pending.copy(
                            note = action.note.take(MAX_NOTE_LENGTH),
                            validationError = null,
                        ),
                        error = null,
                        requestId = "",
                    )
                } ?: state
            }
            ClinicalAlertsUiAction.DismissTransition -> {
                if (!_uiState.value.isMutating) {
                    _uiState.update {
                        it.copy(
                            pendingTransition = null,
                            error = null,
                            requestId = "",
                        )
                    }
                }
            }
            ClinicalAlertsUiAction.ConfirmTransition -> confirmTransition()
        }
    }

    private fun load(
        initial: Boolean,
        preserveCurrentError: Boolean = false,
        effectAfterSuccess: ClinicalAlertsUiEffect? = null,
    ) {
        if (loadInFlight || _uiState.value.isMutating) return
        loadInFlight = true
        val requestedFilter = _uiState.value.filter
        _uiState.update {
            it.copy(
                loadState = if (initial && !it.hasLoaded) {
                    ClinicalAlertsLoadState.Loading
                } else {
                    it.loadState
                },
                isRefreshing = !initial,
                error = it.error.takeIf { preserveCurrentError },
                requestId = it.requestId.takeIf { preserveCurrentError }.orEmpty(),
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.load(
                    filter = requestedFilter,
                    expectedWorkspaceId = expectedWorkspaceId,
                )
            }.onSuccess { response ->
                loadInFlight = false
                if (
                    response.workspaceId != expectedWorkspaceId ||
                    response.alerts.any { it.organizationId != expectedWorkspaceId }
                ) {
                    onLoadFailure(ClinicalAlertWorkspaceMismatchException())
                    return@onSuccess
                }
                val selectedId = _uiState.value.selectedAlertId
                    ?.takeIf { selected -> response.alerts.any { it.id == selected } }
                    ?: response.alerts.firstOrNull()?.id
                _uiState.update {
                    it.copy(
                        loadState = if (response.alerts.isEmpty()) {
                            ClinicalAlertsLoadState.Empty
                        } else {
                            ClinicalAlertsLoadState.Content
                        },
                        alerts = response.alerts,
                        selectedAlertId = selectedId,
                        compactDetailVisible = it.compactDetailVisible && selectedId != null,
                        hasLoaded = true,
                        isRefreshing = false,
                        isStale = false,
                        error = null,
                        requestId = "",
                    )
                }
                if (effectAfterSuccess != null) {
                    _effects.send(effectAfterSuccess)
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
                    error = clinicalAlertsError(error),
                    requestId = clinicalRequestId(error),
                )
            } else {
                current.copy(
                    loadState = clinicalAlertsFailureState(error),
                    isRefreshing = false,
                    isStale = false,
                    error = clinicalAlertsError(error),
                    requestId = clinicalRequestId(error),
                )
            }
        }
    }

    private fun requestTransition(
        alertId: String,
        action: ClinicalAlertAction,
    ) {
        val state = _uiState.value
        if (
            !state.canManage ||
            state.isMutating ||
            state.isRefreshing ||
            loadInFlight
        ) {
            return
        }
        val alert = state.alerts.firstOrNull { it.id == alertId } ?: return
        val allowed = when (action) {
            ClinicalAlertAction.Acknowledge -> alert.status == ClinicalAlertStatus.Open
            ClinicalAlertAction.Resolve ->
                alert.status == ClinicalAlertStatus.Open ||
                    alert.status == ClinicalAlertStatus.Acknowledged
        }
        if (!allowed) return
        val existing = state.pendingTransition
            ?.takeIf {
                it.alertId == alert.id &&
                    it.action == action &&
                    it.expectedVersion == alert.version
            }
        _uiState.update {
            it.copy(
                pendingTransition = existing ?: PendingClinicalAlertTransition(
                    alertId = alert.id,
                    action = action,
                    expectedVersion = alert.version,
                    idempotencyKey = idempotencyKeyFactory(),
                ),
                error = null,
                requestId = "",
            )
        }
    }

    private fun confirmTransition() {
        val state = _uiState.value
        val pending = state.pendingTransition ?: return
        if (!state.canManage || state.isMutating) return
        val alert = state.alerts.firstOrNull {
            it.id == pending.alertId && it.version == pending.expectedVersion
        } ?: return
        val note = pending.note.trim()
        if (pending.action == ClinicalAlertAction.Resolve && note.isBlank()) {
            _uiState.update {
                it.copy(
                    pendingTransition = pending.copy(
                        validationError = ClinicalAlertValidationError.ResolutionNoteRequired,
                    ),
                )
            }
            return
        }

        _uiState.update {
            it.copy(
                isMutating = true,
                pendingTransition = pending.copy(
                    note = note,
                    validationError = null,
                ),
                error = null,
                requestId = "",
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.transition(
                    alert = alert,
                    action = pending.action,
                    note = note,
                    idempotencyKey = pending.idempotencyKey,
                    expectedWorkspaceId = expectedWorkspaceId,
                )
            }.onSuccess { confirmed ->
                val currentFilter = _uiState.value.filter
                val updatedAlerts = _uiState.value.alerts
                    .filterNot { it.id == confirmed.id }
                    .plus(confirmed)
                    .filter {
                        currentFilter.status == null || it.status == currentFilter.status
                    }
                    .sortedByDescending { it.updatedAt.ifBlank { it.createdAt } }
                _uiState.update {
                    it.copy(
                        loadState = if (updatedAlerts.isEmpty()) {
                            ClinicalAlertsLoadState.Empty
                        } else {
                            ClinicalAlertsLoadState.Content
                        },
                        alerts = updatedAlerts,
                        selectedAlertId = confirmed.id.takeIf { id ->
                            updatedAlerts.any { it.id == id }
                        } ?: updatedAlerts.firstOrNull()?.id,
                        compactDetailVisible =
                            it.compactDetailVisible && updatedAlerts.any { item ->
                                item.id == confirmed.id
                            },
                        isMutating = false,
                        isStale = false,
                        pendingTransition = null,
                        error = null,
                        requestId = "",
                    )
                }
                _effects.send(
                    ClinicalAlertsUiEffect.BackendTransitionConfirmed(pending.action),
                )
            }.onFailure { error ->
                if (error is SmartHealthApiException && error.statusCode == 409) {
                    _uiState.update {
                        it.copy(
                            isMutating = false,
                            isStale = true,
                            pendingTransition = null,
                            error = ClinicalAlertsError.Conflict,
                            requestId = clinicalRequestId(error),
                        )
                    }
                    load(
                        initial = false,
                        preserveCurrentError = true,
                        effectAfterSuccess =
                            ClinicalAlertsUiEffect.BackendStateRefreshedAfterConflict,
                    )
                } else {
                    _uiState.update {
                        it.copy(
                            isMutating = false,
                            error = clinicalAlertsError(error),
                            requestId = clinicalRequestId(error),
                        )
                    }
                }
            }
        }
    }

    companion object {
        private const val MAX_NOTE_LENGTH = 2_000
    }
}

class ClinicalAlertsViewModelFactory(
    private val expectedWorkspaceId: String,
    private val canManage: Boolean,
    private val repository: ClinicalAlertsRepository =
        ApiClinicalAlertsRepository(SmartHealthRepository.api),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(ClinicalAlertsViewModel::class.java))
        return ClinicalAlertsViewModel(
            repository = repository,
            expectedWorkspaceId = expectedWorkspaceId,
            canManage = canManage,
        ) as T
    }
}

private fun clinicalAlertsFailureState(error: Throwable): ClinicalAlertsLoadState = when {
    error is SmartHealthApiException && error.statusCode == 403 ->
        ClinicalAlertsLoadState.PermissionDenied
    error is SmartHealthApiException -> ClinicalAlertsLoadState.Error
    error is IOException -> ClinicalAlertsLoadState.Offline
    else -> ClinicalAlertsLoadState.Error
}

private fun clinicalAlertsError(error: Throwable): ClinicalAlertsError = when {
    error is SmartHealthApiException && error.statusCode == 403 ->
        ClinicalAlertsError.PermissionDenied
    error is SmartHealthApiException && error.statusCode == 409 ->
        ClinicalAlertsError.Conflict
    error is SmartHealthApiException ->
        ClinicalAlertsError.Unknown
    error is IOException ->
        ClinicalAlertsError.Offline
    error is ClinicalAlertWorkspaceMismatchException ->
        ClinicalAlertsError.WorkspaceMismatch
    error is ClinicalAlertConfirmationException ->
        ClinicalAlertsError.Confirmation
    else -> ClinicalAlertsError.Unknown
}

private fun clinicalRequestId(error: Throwable): String =
    (error as? SmartHealthApiException)?.requestId.orEmpty()
