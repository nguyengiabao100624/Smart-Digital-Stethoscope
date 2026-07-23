package com.example.smart_health_android.consent

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.R
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientShare
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.SmartHealthApiException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ConsentLoadState {
    Loading,
    Content,
    Empty,
    Error,
    Offline,
    Permission,
}

data class ConsentGrantEditorState(
    val idempotencyKey: String,
    val recipientKind: ConsentRecipientKind,
    val recipientId: String = "",
    val scope: ConsentScope = ConsentScope.PatientProfile,
    val selectedScanIds: Set<String> = emptySet(),
    val expiresAt: String = "",
    val fieldErrors: Map<String, Int> = emptyMap(),
    val isDirty: Boolean = false,
)

data class PendingConsentRevocation(
    val shareId: String,
    val idempotencyKey: String,
)

sealed interface ConsentUiEffect {
    data class BackendMutationConfirmed(val messageRes: Int) : ConsentUiEffect
}

data class ConsentUiState(
    val loadState: ConsentLoadState = ConsentLoadState.Loading,
    val patients: List<Patient> = emptyList(),
    val selectedPatientId: String = "",
    val shares: List<PatientShare> = emptyList(),
    val scans: List<Scan> = emptyList(),
    val targets: ShareTargets = ShareTargets(),
    val recipientCatalogAvailable: Boolean = true,
    val recipientCatalogError: String = "",
    val scanCatalogAvailable: Boolean = true,
    val scanCatalogError: String = "",
    val isLoadingPatientData: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val isMutating: Boolean = false,
    val showOnlyActive: Boolean = false,
    val editor: ConsentGrantEditorState? = null,
    val confirmEditorDismiss: Boolean = false,
    val pendingRevocation: PendingConsentRevocation? = null,
    val errorMessage: String = "",
    val requestId: String = "",
    val mutationErrorMessage: String = "",
    val mutationRequestId: String = "",
) {
    val selectedPatient: Patient?
        get() = patients.firstOrNull { it.id == selectedPatientId }

    val visibleShares: List<PatientShare>
        get() = shares
            .filter { !showOnlyActive || it.isActive }
            .sortedWith(
                compareByDescending<PatientShare> { it.isActive }
                    .thenByDescending { it.createdAt.orEmpty() }
            )

    val activeShareCount: Int
        get() = shares.count { it.isActive }

    val canCreateGrant: Boolean
        get() = selectedPatientId.isNotBlank() &&
            recipientCatalogAvailable &&
            (targets.doctors.isNotEmpty() || targets.workspaces.isNotEmpty()) &&
            !isMutating &&
            loadState == ConsentLoadState.Content
}

sealed interface ConsentUiAction {
    data object Load : ConsentUiAction
    data object Refresh : ConsentUiAction
    data object RetryRecipients : ConsentUiAction
    data class SelectPatient(val patientId: String) : ConsentUiAction
    data class ShowOnlyActiveChanged(val enabled: Boolean) : ConsentUiAction
    data object StartCreateGrant : ConsentUiAction
    data class RecipientKindChanged(val kind: ConsentRecipientKind) : ConsentUiAction
    data class RecipientChanged(val recipientId: String) : ConsentUiAction
    data class ScopeChanged(val scope: ConsentScope) : ConsentUiAction
    data class ScanSelectionChanged(val scanId: String) : ConsentUiAction
    data class ExpiryChanged(val expiresAt: String) : ConsentUiAction
    data object SubmitGrant : ConsentUiAction
    data object DismissEditor : ConsentUiAction
    data object KeepEditing : ConsentUiAction
    data object DiscardEditor : ConsentUiAction
    data class RequestRevoke(val shareId: String) : ConsentUiAction
    data object ConfirmRevoke : ConsentUiAction
    data object DismissRevoke : ConsentUiAction
}

class ConsentViewModel(
    private val repository: ConsentRepository,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val nowProvider: () -> Instant = Instant::now,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ConsentUiState())
    val uiState: StateFlow<ConsentUiState> = _uiState.asStateFlow()

    private val _effects = Channel<ConsentUiEffect>(capacity = Channel.BUFFERED)
    val effects: Flow<ConsentUiEffect> = _effects.receiveAsFlow()

    private var screenLoadJob: Job? = null
    private var patientLoadJob: Job? = null

    fun onAction(action: ConsentUiAction) {
        when (action) {
            ConsentUiAction.Load -> load()
            ConsentUiAction.Refresh -> refresh()
            ConsentUiAction.RetryRecipients -> retryRecipients()
            is ConsentUiAction.SelectPatient -> selectPatient(action.patientId)
            is ConsentUiAction.ShowOnlyActiveChanged -> _uiState.update {
                it.copy(showOnlyActive = action.enabled)
            }
            ConsentUiAction.StartCreateGrant -> startCreateGrant()
            is ConsentUiAction.RecipientKindChanged -> updateRecipientKind(action.kind)
            is ConsentUiAction.RecipientChanged -> updateEditor {
                it.copy(recipientId = action.recipientId)
            }
            is ConsentUiAction.ScopeChanged -> updateEditor {
                it.copy(
                    scope = action.scope,
                    selectedScanIds = if (action.scope == ConsentScope.PatientProfile) {
                        emptySet()
                    } else {
                        it.selectedScanIds
                    },
                )
            }
            is ConsentUiAction.ScanSelectionChanged -> toggleScan(action.scanId)
            is ConsentUiAction.ExpiryChanged -> updateEditor {
                it.copy(expiresAt = action.expiresAt)
            }
            ConsentUiAction.SubmitGrant -> submitGrant()
            ConsentUiAction.DismissEditor -> dismissEditor()
            ConsentUiAction.KeepEditing -> _uiState.update { it.copy(confirmEditorDismiss = false) }
            ConsentUiAction.DiscardEditor -> _uiState.update {
                if (it.isMutating) it else it.copy(
                    editor = null,
                    confirmEditorDismiss = false,
                    mutationErrorMessage = "",
                    mutationRequestId = "",
                )
            }
            is ConsentUiAction.RequestRevoke -> requestRevoke(action.shareId)
            ConsentUiAction.ConfirmRevoke -> confirmRevoke()
            ConsentUiAction.DismissRevoke -> _uiState.update {
                if (it.isMutating) it else it.copy(
                    pendingRevocation = null,
                    mutationErrorMessage = "",
                    mutationRequestId = "",
                )
            }
        }
    }

    private fun load() {
        screenLoadJob?.cancel()
        patientLoadJob?.cancel()
        screenLoadJob = viewModelScope.launch {
            _uiState.update {
                ConsentUiState(
                    loadState = ConsentLoadState.Loading,
                    showOnlyActive = it.showOnlyActive,
                )
            }
            runCatching {
                val patients = repository.listPatients()
                val targetsResult = runCatching { repository.listTargets() }
                patients to targetsResult
            }.onSuccess { (patients, targetsResult) ->
                if (patients.isEmpty()) {
                    _uiState.update {
                        it.copy(
                            loadState = ConsentLoadState.Empty,
                            patients = emptyList(),
                            targets = targetsResult.getOrDefault(ShareTargets()),
                            recipientCatalogAvailable = targetsResult.isSuccess,
                            recipientCatalogError = targetsResult.exceptionOrNull()?.message.orEmpty(),
                            errorMessage = "",
                            requestId = "",
                        )
                    }
                    return@onSuccess
                }
                val selectedPatientId = _uiState.value.selectedPatientId
                    .takeIf { current -> patients.any { it.id == current } }
                    ?: patients.first().id
                _uiState.update {
                    it.copy(
                        loadState = ConsentLoadState.Content,
                        patients = patients,
                        selectedPatientId = selectedPatientId,
                        targets = targetsResult.getOrDefault(ShareTargets()),
                        recipientCatalogAvailable = targetsResult.isSuccess,
                        recipientCatalogError = targetsResult.exceptionOrNull()?.message.orEmpty(),
                        errorMessage = "",
                        requestId = "",
                    )
                }
                loadPatientDataNow(selectedPatientId, keepExisting = false)
            }.onFailure(::publishScreenFailure)
        }
    }

    private fun refresh() {
        val patientId = _uiState.value.selectedPatientId
        if (patientId.isBlank()) {
            load()
            return
        }
        patientLoadJob?.cancel()
        patientLoadJob = viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            loadPatientDataNow(patientId, keepExisting = true)
            _uiState.update { state ->
                if (state.selectedPatientId == patientId) state.copy(isRefreshing = false) else state
            }
        }
    }

    private fun selectPatient(patientId: String) {
        val state = _uiState.value
        if (patientId.isBlank() || patientId == state.selectedPatientId || state.isMutating) return
        if (state.patients.none { it.id == patientId }) return
        patientLoadJob?.cancel()
        _uiState.update {
            it.copy(
                selectedPatientId = patientId,
                shares = emptyList(),
                scans = emptyList(),
                isStale = false,
                errorMessage = "",
                requestId = "",
                editor = null,
                pendingRevocation = null,
            )
        }
        patientLoadJob = viewModelScope.launch {
            loadPatientDataNow(patientId, keepExisting = false)
        }
    }

    private suspend fun loadPatientDataNow(patientId: String, keepExisting: Boolean) {
        _uiState.update { state ->
            if (state.selectedPatientId != patientId) state else state.copy(
                isLoadingPatientData = true,
                errorMessage = "",
                requestId = "",
            )
        }
        runCatching {
            val shares = repository.listShares(patientId)
            val scansResult = runCatching { repository.listScans(patientId) }
            shares to scansResult
        }.onSuccess { (shares, scansResult) ->
            _uiState.update { state ->
                if (state.selectedPatientId != patientId) state else state.copy(
                    loadState = ConsentLoadState.Content,
                    shares = shares,
                    scans = scansResult.getOrDefault(emptyList()),
                    scanCatalogAvailable = scansResult.isSuccess,
                    scanCatalogError = scansResult.exceptionOrNull()?.message.orEmpty(),
                    isLoadingPatientData = false,
                    isStale = false,
                    errorMessage = "",
                    requestId = "",
                )
            }
        }.onFailure { error ->
            val apiError = error as? SmartHealthApiException
            _uiState.update { state ->
                if (state.selectedPatientId != patientId) {
                    state
                } else {
                    val canKeepContent = keepExisting && state.shares.isNotEmpty()
                    state.copy(
                        loadState = if (canKeepContent) {
                            ConsentLoadState.Content
                        } else {
                            error.toLoadState()
                        },
                        isLoadingPatientData = false,
                        isStale = canKeepContent,
                        errorMessage = error.message.orEmpty(),
                        requestId = apiError?.requestId.orEmpty(),
                    )
                }
            }
        }
    }

    private fun retryRecipients() {
        if (_uiState.value.isMutating) return
        viewModelScope.launch {
            runCatching { repository.listTargets() }
                .onSuccess { targets ->
                    _uiState.update {
                        it.copy(
                            targets = targets,
                            recipientCatalogAvailable = true,
                            recipientCatalogError = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            recipientCatalogAvailable = false,
                            recipientCatalogError = error.message.orEmpty(),
                        )
                    }
                }
        }
    }

    private fun startCreateGrant() {
        val state = _uiState.value
        if (!state.canCreateGrant) return
        val kind = if (state.targets.doctors.isNotEmpty()) {
            ConsentRecipientKind.Doctor
        } else {
            ConsentRecipientKind.Workspace
        }
        _uiState.update {
            it.copy(
                editor = ConsentGrantEditorState(
                    idempotencyKey = idempotencyKeyFactory(),
                    recipientKind = kind,
                    recipientId = state.firstRecipientId(kind),
                ),
                confirmEditorDismiss = false,
                mutationErrorMessage = "",
                mutationRequestId = "",
            )
        }
    }

    private fun updateRecipientKind(kind: ConsentRecipientKind) {
        val state = _uiState.value
        updateEditor {
            it.copy(
                recipientKind = kind,
                recipientId = state.firstRecipientId(kind),
            )
        }
    }

    private fun toggleScan(scanId: String) {
        if (_uiState.value.scans.none { it.id == scanId }) return
        updateEditor { editor ->
            val selected = editor.selectedScanIds.toMutableSet()
            if (!selected.add(scanId)) selected.remove(scanId)
            editor.copy(selectedScanIds = selected)
        }
    }

    private fun updateEditor(transform: (ConsentGrantEditorState) -> ConsentGrantEditorState) {
        _uiState.update { state ->
            state.editor?.let { editor ->
                state.copy(
                    editor = transform(editor).copy(
                        fieldErrors = emptyMap(),
                        isDirty = true,
                    ),
                    mutationErrorMessage = "",
                    mutationRequestId = "",
                )
            } ?: state
        }
    }

    private fun dismissEditor() {
        _uiState.update { state ->
            when {
                state.isMutating -> state
                state.editor?.isDirty == true -> state.copy(confirmEditorDismiss = true)
                else -> state.copy(editor = null, confirmEditorDismiss = false)
            }
        }
    }

    private fun submitGrant() {
        val state = _uiState.value
        val editor = state.editor ?: return
        if (state.isMutating) return
        val errors = validateEditor(editor)
        if (errors.isNotEmpty()) {
            _uiState.update { it.copy(editor = editor.copy(fieldErrors = errors)) }
            return
        }
        val command = CreateConsentGrantCommand(
            patientId = state.selectedPatientId,
            recipientKind = editor.recipientKind,
            recipientId = editor.recipientId,
            scope = editor.scope,
            scanIds = editor.selectedScanIds.toList().sorted(),
            expiresAt = editor.expiresAt,
        )
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isMutating = true,
                    mutationErrorMessage = "",
                    mutationRequestId = "",
                )
            }
            runCatching {
                repository.createGrant(command, editor.idempotencyKey)
                    .requireCanonicalMutationContract()
            }.onSuccess { backendGrant ->
                _uiState.update {
                    it.copy(
                        shares = it.shares.replaceFromBackend(backendGrant),
                        isMutating = false,
                        editor = null,
                        confirmEditorDismiss = false,
                        mutationErrorMessage = "",
                        mutationRequestId = "",
                    )
                }
                _effects.send(ConsentUiEffect.BackendMutationConfirmed(R.string.consent_grant_success))
            }.onFailure(::publishMutationFailure)
        }
    }

    private fun validateEditor(editor: ConsentGrantEditorState): Map<String, Int> {
        return buildMap {
            if (editor.recipientId.isBlank()) {
                put("recipient", R.string.consent_error_recipient_required)
            }
            if (
                editor.scope == ConsentScope.SelectedScans &&
                editor.selectedScanIds.isEmpty()
            ) {
                put("scanIds", R.string.consent_error_scan_required)
            }
            if (editor.expiresAt.isNotBlank()) {
                val expiresAt = runCatching { Instant.parse(editor.expiresAt) }.getOrNull()
                if (expiresAt == null || !expiresAt.isAfter(nowProvider())) {
                    put("expiresAt", R.string.consent_error_expiry_future)
                }
            }
        }
    }

    private fun requestRevoke(shareId: String) {
        val share = _uiState.value.shares.firstOrNull { it.id == shareId } ?: return
        if (!share.isActive || _uiState.value.isMutating) return
        _uiState.update {
            it.copy(
                pendingRevocation = PendingConsentRevocation(
                    shareId = shareId,
                    idempotencyKey = idempotencyKeyFactory(),
                ),
                mutationErrorMessage = "",
                mutationRequestId = "",
            )
        }
    }

    private fun confirmRevoke() {
        val state = _uiState.value
        val pending = state.pendingRevocation ?: return
        if (state.isMutating) return
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isMutating = true,
                    mutationErrorMessage = "",
                    mutationRequestId = "",
                )
            }
            runCatching {
                repository.revokeGrant(
                    patientId = state.selectedPatientId,
                    shareId = pending.shareId,
                    idempotencyKey = pending.idempotencyKey,
                ).requireCanonicalMutationContract()
            }.onSuccess { backendGrant ->
                _uiState.update {
                    it.copy(
                        shares = it.shares.replaceFromBackend(backendGrant),
                        isMutating = false,
                        pendingRevocation = null,
                        mutationErrorMessage = "",
                        mutationRequestId = "",
                    )
                }
                _effects.send(ConsentUiEffect.BackendMutationConfirmed(R.string.consent_revoke_success))
            }.onFailure(::publishMutationFailure)
        }
    }

    private fun publishScreenFailure(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        _uiState.update {
            it.copy(
                loadState = error.toLoadState(),
                isLoadingPatientData = false,
                isRefreshing = false,
                errorMessage = error.message.orEmpty(),
                requestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private fun publishMutationFailure(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        _uiState.update {
            it.copy(
                isMutating = false,
                mutationErrorMessage = error.message.orEmpty(),
                mutationRequestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private fun ConsentUiState.firstRecipientId(kind: ConsentRecipientKind): String {
        return when (kind) {
            ConsentRecipientKind.Doctor -> targets.doctors.firstOrNull()?.id.orEmpty()
            ConsentRecipientKind.Workspace -> targets.workspaces.firstOrNull()?.id.orEmpty()
        }
    }
}

private fun Throwable.toLoadState(): ConsentLoadState {
    val apiError = this as? SmartHealthApiException
    return when {
        apiError?.statusCode == 403 -> ConsentLoadState.Permission
        this is UnknownHostException ||
            this is ConnectException ||
            this is SocketTimeoutException -> ConsentLoadState.Offline
        else -> ConsentLoadState.Error
    }
}

private fun List<PatientShare>.replaceFromBackend(confirmed: PatientShare): List<PatientShare> {
    return (filterNot { it.id == confirmed.id } + confirmed)
        .sortedByDescending { it.createdAt.orEmpty() }
}

private fun PatientShare.requireCanonicalMutationContract(): PatientShare {
    check(hasCanonicalAccessContract) {
        "Máy chủ trả dữ liệu quyền truy cập chưa đầy đủ"
    }
    return this
}
