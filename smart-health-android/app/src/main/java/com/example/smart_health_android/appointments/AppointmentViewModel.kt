package com.example.smart_health_android.appointments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.R
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.Patient
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

enum class AppointmentLoadState {
    Loading,
    Content,
    Empty,
    Error,
    Offline,
    Permission,
}

enum class AppointmentEditorMode {
    Create,
    Reschedule,
}

data class AppointmentEditorState(
    val mode: AppointmentEditorMode,
    val idempotencyKey: String,
    val appointmentId: String = "",
    val patientId: String = "",
    val type: AppointmentType = AppointmentType.RemoteConsultation,
    val startsAt: String = "",
    val endsAt: String = "",
    val location: String = "",
    val reason: String = "",
    val notes: String = "",
    val fieldErrors: Map<String, Int> = emptyMap(),
    val isDirty: Boolean = false,
)

sealed interface AppointmentUiEffect {
    data class BackendMutationConfirmed(val messageRes: Int) : AppointmentUiEffect
}

data class PendingAppointmentStatusMutation(
    val appointmentId: String,
    val action: AppointmentAction,
    val idempotencyKey: String,
)

private data class AppointmentLoadResult(
    val session: AppointmentSession,
    val appointments: List<Appointment>,
    val patientResult: Result<List<Patient>>,
)

data class AppointmentUiState(
    val loadState: AppointmentLoadState = AppointmentLoadState.Loading,
    val actor: AppointmentActor = AppointmentActor.Staff,
    val capabilities: Set<String> = emptySet(),
    val appointments: List<Appointment> = emptyList(),
    val patients: List<Patient> = emptyList(),
    val patientCatalogAvailable: Boolean = true,
    val patientCatalogError: String = "",
    val selectedAppointmentId: String? = null,
    val detailAppointmentId: String? = null,
    val detailLoadState: AppointmentLoadState? = null,
    val detailErrorMessage: String = "",
    val detailRequestId: String = "",
    val editor: AppointmentEditorState? = null,
    val confirmEditorDismiss: Boolean = false,
    val pendingCancellationId: String? = null,
    val pendingCancellationIdempotencyKey: String = "",
    val cancellationReason: String = "",
    val cancellationReasonError: Int? = null,
    val pendingStatusConfirmation: PendingAppointmentStatusMutation? = null,
    val pendingStatusMutation: PendingAppointmentStatusMutation? = null,
    val isMutating: Boolean = false,
    val errorMessage: String = "",
    val requestId: String = "",
    val searchQuery: String = "",
    val statusFilter: AppointmentStatus? = null,
) {
    val canManage: Boolean
        get() = AppointmentRoute.List.canManage(capabilities)

    val visibleAppointments: List<Appointment>
        get() {
            val normalizedQuery = searchQuery.trim().lowercase()
            return appointments.filter { appointment ->
                (statusFilter == null || appointment.status == statusFilter) &&
                    (
                        normalizedQuery.isBlank() || listOf(
                            appointment.patient?.name.orEmpty(),
                            appointment.patient?.patientCode.orEmpty(),
                            appointment.doctor?.name.orEmpty(),
                            appointment.reason,
                            appointment.location,
                        ).any { it.lowercase().contains(normalizedQuery) }
                    )
            }
        }

    val selectedAppointment: Appointment?
        get() = selectedAppointmentId?.let { id -> appointments.firstOrNull { it.id == id } }
}

sealed interface AppointmentUiAction {
    data object Load : AppointmentUiAction
    data object StartCreate : AppointmentUiAction
    data class StartReschedule(val appointmentId: String) : AppointmentUiAction
    data class PatientChanged(val patientId: String) : AppointmentUiAction
    data class TypeChanged(val type: AppointmentType) : AppointmentUiAction
    data class ScheduleChanged(val startsAt: String, val endsAt: String) : AppointmentUiAction
    data class ReasonChanged(val reason: String) : AppointmentUiAction
    data class LocationChanged(val location: String) : AppointmentUiAction
    data class NotesChanged(val notes: String) : AppointmentUiAction
    data object SubmitEditor : AppointmentUiAction
    data object DismissEditor : AppointmentUiAction
    data object KeepEditing : AppointmentUiAction
    data object DiscardEditor : AppointmentUiAction
    data class RequestCancellation(val appointmentId: String) : AppointmentUiAction
    data class CancellationReasonChanged(val reason: String) : AppointmentUiAction
    data object ConfirmCancellation : AppointmentUiAction
    data object DismissCancellation : AppointmentUiAction
    data object ConfirmStatusChange : AppointmentUiAction
    data object DismissStatusChange : AppointmentUiAction
    data class OpenAppointment(val appointmentId: String) : AppointmentUiAction
    data object CloseAppointment : AppointmentUiAction
    data class SearchChanged(val query: String) : AppointmentUiAction
    data class StatusFilterChanged(val status: AppointmentStatus?) : AppointmentUiAction
    data class ApplyWorkflowAction(
        val appointmentId: String,
        val action: AppointmentAction,
    ) : AppointmentUiAction
}

class AppointmentViewModel(
    private val repository: AppointmentRepository,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val nowProvider: () -> Instant = Instant::now,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AppointmentUiState())
    val uiState: StateFlow<AppointmentUiState> = _uiState.asStateFlow()
    private val _effects = Channel<AppointmentUiEffect>(capacity = Channel.BUFFERED)
    val effects: Flow<AppointmentUiEffect> = _effects.receiveAsFlow()

    fun onAction(action: AppointmentUiAction) {
        when (action) {
            AppointmentUiAction.Load -> load()
            AppointmentUiAction.StartCreate -> startCreate()
            is AppointmentUiAction.StartReschedule -> startReschedule(action.appointmentId)
            is AppointmentUiAction.PatientChanged -> updateEditor { it.copy(patientId = action.patientId) }
            is AppointmentUiAction.TypeChanged -> updateEditor { it.copy(type = action.type) }
            is AppointmentUiAction.ScheduleChanged -> updateEditor {
                it.copy(startsAt = action.startsAt, endsAt = action.endsAt)
            }
            is AppointmentUiAction.ReasonChanged -> updateEditor { it.copy(reason = action.reason) }
            is AppointmentUiAction.LocationChanged -> updateEditor { it.copy(location = action.location) }
            is AppointmentUiAction.NotesChanged -> updateEditor { it.copy(notes = action.notes) }
            AppointmentUiAction.SubmitEditor -> submitEditor()
            AppointmentUiAction.DismissEditor -> _uiState.update {
                if (it.isMutating) {
                    it
                } else if (it.editor?.isDirty == true) {
                    it.copy(confirmEditorDismiss = true)
                } else {
                    it.copy(editor = null, confirmEditorDismiss = false)
                }
            }
            AppointmentUiAction.KeepEditing -> _uiState.update { it.copy(confirmEditorDismiss = false) }
            AppointmentUiAction.DiscardEditor -> _uiState.update {
                if (it.isMutating) {
                    it
                } else {
                    it.copy(
                        editor = null,
                        confirmEditorDismiss = false,
                        errorMessage = "",
                        requestId = "",
                    )
                }
            }
            is AppointmentUiAction.RequestCancellation -> requestCancellation(action.appointmentId)
            is AppointmentUiAction.CancellationReasonChanged -> _uiState.update {
                it.copy(cancellationReason = action.reason, cancellationReasonError = null)
            }
            AppointmentUiAction.ConfirmCancellation -> confirmCancellation()
            AppointmentUiAction.DismissCancellation -> _uiState.update {
                if (it.isMutating) it else it.copy(
                    pendingCancellationId = null,
                    pendingCancellationIdempotencyKey = "",
                    cancellationReason = "",
                    cancellationReasonError = null,
                    errorMessage = "",
                    requestId = "",
                )
            }
            AppointmentUiAction.ConfirmStatusChange -> confirmStatusChange()
            AppointmentUiAction.DismissStatusChange -> _uiState.update {
                if (it.isMutating) it else it.copy(pendingStatusConfirmation = null)
            }
            is AppointmentUiAction.ApplyWorkflowAction -> applyWorkflowAction(
                appointmentId = action.appointmentId,
                action = action.action,
            )
            is AppointmentUiAction.OpenAppointment -> openAppointment(action.appointmentId)
            AppointmentUiAction.CloseAppointment -> _uiState.update {
                it.copy(
                    selectedAppointmentId = null,
                    detailAppointmentId = null,
                    detailLoadState = null,
                    detailErrorMessage = "",
                    detailRequestId = "",
                )
            }
            is AppointmentUiAction.SearchChanged -> _uiState.update {
                it.copy(searchQuery = action.query)
            }
            is AppointmentUiAction.StatusFilterChanged -> _uiState.update {
                it.copy(statusFilter = action.status)
            }
        }
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(loadState = AppointmentLoadState.Loading, errorMessage = "") }
            runCatching {
                val session = repository.getSession()
                _uiState.update {
                    it.copy(actor = session.actor, capabilities = session.capabilities)
                }
                if (!AppointmentRoute.List.canOpen(session.capabilities)) {
                    throw MissingAppointmentCapabilityException()
                }
                val appointments = repository.listAppointments()
                val patientResult = if (AppointmentRoute.List.canManage(session.capabilities)) {
                    runCatching { repository.listPatients() }
                } else {
                    Result.success(emptyList())
                }
                AppointmentLoadResult(session, appointments, patientResult)
            }.onSuccess { result ->
                val patientError = result.patientResult.exceptionOrNull()
                _uiState.update {
                    it.copy(
                        loadState = if (result.appointments.isEmpty()) {
                            AppointmentLoadState.Empty
                        } else {
                            AppointmentLoadState.Content
                        },
                        actor = result.session.actor,
                        capabilities = result.session.capabilities,
                        appointments = result.appointments,
                        patients = result.patientResult.getOrDefault(emptyList()),
                        patientCatalogAvailable = patientError == null,
                        patientCatalogError = patientError?.message.orEmpty(),
                        errorMessage = "",
                        requestId = "",
                    )
                }
            }.onFailure { error ->
                val apiError = error as? SmartHealthApiException
                _uiState.update {
                    it.copy(
                        loadState = when {
                            error is MissingAppointmentCapabilityException -> AppointmentLoadState.Permission
                            apiError?.statusCode == 403 -> AppointmentLoadState.Permission
                            error.isNetworkFailure() -> AppointmentLoadState.Offline
                            else -> AppointmentLoadState.Error
                        },
                        errorMessage = error.message.orEmpty(),
                        requestId = apiError?.requestId.orEmpty(),
                    )
                }
            }
        }
    }

    private fun startCreate() {
        val state = _uiState.value
        if (state.isMutating || !state.canManage || state.patients.isEmpty()) return
        _uiState.update {
            it.copy(
                editor = AppointmentEditorState(
                    mode = AppointmentEditorMode.Create,
                    idempotencyKey = idempotencyKeyFactory(),
                    patientId = state.patients.first().id,
                ),
                errorMessage = "",
                requestId = "",
            )
        }
    }

    private fun openAppointment(appointmentId: String) {
        if (appointmentId.isBlank()) return
        val existing = _uiState.value.appointments.firstOrNull { it.id == appointmentId }
        if (existing != null) {
            _uiState.update {
                it.copy(
                    selectedAppointmentId = appointmentId,
                    detailAppointmentId = null,
                    detailLoadState = null,
                    detailErrorMessage = "",
                    detailRequestId = "",
                )
            }
            return
        }
        _uiState.update {
            it.copy(
                detailAppointmentId = appointmentId,
                detailLoadState = AppointmentLoadState.Loading,
                detailErrorMessage = "",
                detailRequestId = "",
            )
        }
        viewModelScope.launch {
            runCatching { repository.getAppointment(appointmentId) }
                .onSuccess { confirmedAppointment ->
                    _uiState.update { state ->
                        if (state.detailAppointmentId != appointmentId) {
                            state
                        } else state.copy(
                            appointments = state.appointments.replaceFromBackend(confirmedAppointment),
                            selectedAppointmentId = confirmedAppointment.id,
                            loadState = AppointmentLoadState.Content,
                            detailAppointmentId = null,
                            detailLoadState = null,
                            detailErrorMessage = "",
                            detailRequestId = "",
                        )
                    }
                }
                .onFailure { error ->
                    val apiError = error as? SmartHealthApiException
                    _uiState.update { state ->
                        if (state.detailAppointmentId != appointmentId) {
                            state
                        } else state.copy(
                            detailLoadState = when {
                                apiError?.statusCode == 403 -> AppointmentLoadState.Permission
                                error.isNetworkFailure() -> AppointmentLoadState.Offline
                                else -> AppointmentLoadState.Error
                            },
                            detailErrorMessage = error.message.orEmpty(),
                            detailRequestId = apiError?.requestId.orEmpty(),
                        )
                    }
                }
        }
    }

    private fun startReschedule(appointmentId: String) {
        val state = _uiState.value
        if (state.isMutating) return
        val appointment = state.appointments.firstOrNull { it.id == appointmentId } ?: return
        val canReschedule = AppointmentAction.Reschedule in AppointmentWorkflow.availableActions(
            status = appointment.status,
            actor = state.actor,
            canManage = state.canManage,
        )
        if (!canReschedule) return
        _uiState.update {
            it.copy(
                editor = AppointmentEditorState(
                    mode = AppointmentEditorMode.Reschedule,
                    idempotencyKey = idempotencyKeyFactory(),
                    appointmentId = appointment.id,
                    patientId = appointment.patientId,
                    type = appointment.type,
                    startsAt = appointment.startsAt,
                    endsAt = appointment.endsAt,
                    location = appointment.location,
                    reason = appointment.reason,
                    notes = appointment.notes,
                ),
                errorMessage = "",
                requestId = "",
            )
        }
    }

    private fun updateEditor(transform: (AppointmentEditorState) -> AppointmentEditorState) {
        _uiState.update { state ->
            state.editor?.let { editor ->
                state.copy(
                    editor = transform(editor).copy(
                        fieldErrors = emptyMap(),
                        isDirty = true,
                    )
                )
            } ?: state
        }
    }

    private fun submitEditor() {
        val editor = _uiState.value.editor ?: return
        if (_uiState.value.isMutating || !_uiState.value.canManage) return
        val fieldErrors = validateEditor(editor)
        if (fieldErrors.isNotEmpty()) {
            _uiState.update { it.copy(editor = editor.copy(fieldErrors = fieldErrors)) }
            return
        }

        // Claim the mutation synchronously so rapid taps cannot enqueue duplicate requests
        // before the coroutine gets its first turn on the dispatcher.
        _uiState.update { it.copy(isMutating = true, errorMessage = "", requestId = "") }
        viewModelScope.launch {
            runCatching {
                when (editor.mode) {
                    AppointmentEditorMode.Create -> repository.createAppointment(
                        mutation = AppointmentMutation(
                            patientId = editor.patientId,
                            type = editor.type,
                            startsAt = editor.startsAt,
                            endsAt = editor.endsAt,
                            location = editor.location,
                            reason = editor.reason,
                            notes = editor.notes,
                        ),
                        idempotencyKey = editor.idempotencyKey,
                    )
                    AppointmentEditorMode.Reschedule -> repository.updateAppointment(
                        appointmentId = editor.appointmentId,
                        patch = AppointmentPatch(
                            startsAt = editor.startsAt,
                            endsAt = editor.endsAt,
                        ),
                        idempotencyKey = editor.idempotencyKey,
                    )
                }
            }.onSuccess { confirmedAppointment ->
                _uiState.update { state ->
                    state.copy(
                        loadState = AppointmentLoadState.Content,
                        appointments = state.appointments
                            .filterNot { it.id == confirmedAppointment.id }
                            .plus(confirmedAppointment)
                            .sortedBy(Appointment::startsAt),
                        selectedAppointmentId = confirmedAppointment.id,
                        editor = null,
                        confirmEditorDismiss = false,
                        isMutating = false,
                        errorMessage = "",
                        requestId = "",
                    )
                }
                _effects.send(
                    AppointmentUiEffect.BackendMutationConfirmed(
                        if (editor.mode == AppointmentEditorMode.Create) {
                            R.string.appointment_effect_created
                        } else {
                            R.string.appointment_effect_rescheduled
                        }
                    )
                )
            }.onFailure { error ->
                val apiError = error as? SmartHealthApiException
                _uiState.update { state ->
                    state.copy(
                        isMutating = false,
                        errorMessage = error.message.orEmpty(),
                        requestId = apiError?.requestId.orEmpty(),
                        editor = state.editor?.copy(
                            fieldErrors = apiError?.fieldErrors.orEmpty().toAppointmentFieldErrors()
                        ),
                    )
                }
            }
        }
    }

    private fun requestCancellation(appointmentId: String) {
        val state = _uiState.value
        if (state.isMutating) return
        val appointment = state.appointments.firstOrNull { it.id == appointmentId } ?: return
        val canCancel = AppointmentAction.Cancel in AppointmentWorkflow.availableActions(
            status = appointment.status,
            actor = state.actor,
            canManage = state.canManage,
        )
        if (!canCancel) return
        _uiState.update {
            it.copy(
                pendingCancellationId = appointment.id,
                pendingCancellationIdempotencyKey = idempotencyKeyFactory(),
                cancellationReason = "",
                cancellationReasonError = null,
                errorMessage = "",
                requestId = "",
            )
        }
    }

    private fun confirmCancellation() {
        val state = _uiState.value
        val appointmentId = state.pendingCancellationId ?: return
        val reason = state.cancellationReason.trim()
        if (reason.isBlank()) {
            _uiState.update {
                it.copy(cancellationReasonError = R.string.appointment_error_cancellation_reason_required)
            }
            return
        }
        if (state.isMutating) return

        _uiState.update { it.copy(isMutating = true, errorMessage = "", requestId = "") }
        viewModelScope.launch {
            runCatching {
                repository.updateAppointment(
                    appointmentId = appointmentId,
                    patch = AppointmentPatch(
                        status = AppointmentStatus.Cancelled,
                        cancellationReason = reason,
                    ),
                    idempotencyKey = state.pendingCancellationIdempotencyKey,
                )
            }.onSuccess { confirmedAppointment ->
                _uiState.update { current ->
                    current.copy(
                        loadState = AppointmentLoadState.Content,
                        appointments = current.appointments.replaceFromBackend(confirmedAppointment),
                        selectedAppointmentId = confirmedAppointment.id,
                        isMutating = false,
                        pendingCancellationId = null,
                        pendingCancellationIdempotencyKey = "",
                        cancellationReason = "",
                        cancellationReasonError = null,
                        errorMessage = "",
                        requestId = "",
                    )
                }
                _effects.send(
                    AppointmentUiEffect.BackendMutationConfirmed(
                        R.string.appointment_effect_cancelled,
                    )
                )
            }.onFailure { error ->
                val apiError = error as? SmartHealthApiException
                _uiState.update {
                    it.copy(
                        isMutating = false,
                        errorMessage = error.message.orEmpty(),
                        requestId = apiError?.requestId.orEmpty(),
                        cancellationReasonError = apiError?.fieldErrors
                            ?.takeIf { it.containsKey("cancellationReason") }
                            ?.let { R.string.appointment_error_cancellation_reason_required },
                    )
                }
            }
        }
    }

    private fun applyWorkflowAction(appointmentId: String, action: AppointmentAction) {
        val state = _uiState.value
        val appointment = state.appointments.firstOrNull { it.id == appointmentId } ?: return
        if (action !in AppointmentWorkflow.availableActions(appointment.status, state.actor, state.canManage)) {
            return
        }
        when (action) {
            AppointmentAction.Cancel -> requestCancellation(appointmentId)
            AppointmentAction.Reschedule -> startReschedule(appointmentId)
            AppointmentAction.Complete,
            AppointmentAction.MarkNoShow,
            -> requestStatusConfirmation(appointmentId, action)
            AppointmentAction.Confirm -> updateStatusFromBackend(appointmentId, action)
        }
    }

    private fun requestStatusConfirmation(appointmentId: String, action: AppointmentAction) {
        val state = _uiState.value
        if (state.isMutating) return
        val appointment = state.appointments.firstOrNull { it.id == appointmentId } ?: return
        if (action !in AppointmentWorkflow.availableActions(appointment.status, state.actor, state.canManage)) {
            return
        }
        val pendingMutation = state.pendingStatusMutation
            ?.takeIf { it.appointmentId == appointmentId && it.action == action }
            ?: PendingAppointmentStatusMutation(
                appointmentId = appointmentId,
                action = action,
                idempotencyKey = idempotencyKeyFactory(),
            )
        _uiState.update {
            it.copy(
                pendingStatusConfirmation = pendingMutation,
                errorMessage = "",
                requestId = "",
            )
        }
    }

    private fun confirmStatusChange() {
        val state = _uiState.value
        if (state.isMutating) return
        val pendingMutation = state.pendingStatusConfirmation ?: return
        _uiState.update {
            it.copy(
                pendingStatusConfirmation = null,
                pendingStatusMutation = pendingMutation,
            )
        }
        updateStatusFromBackend(pendingMutation.appointmentId, pendingMutation.action)
    }

    private fun updateStatusFromBackend(appointmentId: String, action: AppointmentAction) {
        val state = _uiState.value
        if (state.isMutating) return
        val pendingMutation = state.pendingStatusMutation
            ?.takeIf { it.appointmentId == appointmentId && it.action == action }
            ?: PendingAppointmentStatusMutation(
                appointmentId = appointmentId,
                action = action,
                idempotencyKey = idempotencyKeyFactory(),
            )
        val status = when (action) {
            AppointmentAction.Confirm -> AppointmentStatus.Confirmed
            AppointmentAction.Complete -> AppointmentStatus.Completed
            AppointmentAction.MarkNoShow -> AppointmentStatus.NoShow
            AppointmentAction.Cancel,
            AppointmentAction.Reschedule,
            -> return
        }
        _uiState.update {
            it.copy(
                pendingStatusMutation = pendingMutation,
                isMutating = true,
                errorMessage = "",
                requestId = "",
            )
        }

        viewModelScope.launch {
            runCatching {
                repository.updateAppointment(
                    appointmentId = appointmentId,
                    patch = AppointmentPatch(status = status),
                    idempotencyKey = pendingMutation.idempotencyKey,
                )
            }.onSuccess { confirmedAppointment ->
                _uiState.update { current ->
                    current.copy(
                        appointments = current.appointments.replaceFromBackend(confirmedAppointment),
                        selectedAppointmentId = confirmedAppointment.id,
                        isMutating = false,
                        pendingStatusMutation = null,
                        pendingStatusConfirmation = null,
                        errorMessage = "",
                        requestId = "",
                    )
                }
                _effects.send(
                    AppointmentUiEffect.BackendMutationConfirmed(
                        R.string.appointment_effect_status_updated,
                    )
                )
            }.onFailure { error ->
                val apiError = error as? SmartHealthApiException
                _uiState.update {
                    it.copy(
                        isMutating = false,
                        errorMessage = error.message.orEmpty(),
                        requestId = apiError?.requestId.orEmpty(),
                    )
                }
            }
        }
    }

    private fun validateEditor(editor: AppointmentEditorState): Map<String, Int> = buildMap {
        if (editor.patientId.isBlank()) {
            put("patientId", R.string.appointment_error_patient_required)
        }
        val start = runCatching { Instant.parse(editor.startsAt) }.getOrNull()
        val end = runCatching { Instant.parse(editor.endsAt) }.getOrNull()
        if (start == null) put("startsAt", R.string.appointment_error_start_required)
        if (end == null) put("endsAt", R.string.appointment_error_end_required)
        if (start != null && !start.isAfter(nowProvider())) {
            put("startsAt", R.string.appointment_error_start_future)
        }
        if (start != null && end != null && !end.isAfter(start)) {
            put("endsAt", R.string.appointment_error_end_after_start)
        }
        if (editor.reason.isBlank() && editor.mode == AppointmentEditorMode.Create) {
            put("reason", R.string.appointment_error_reason_required)
        }
    }
}

private class MissingAppointmentCapabilityException : IllegalStateException()

private fun List<Appointment>.replaceFromBackend(appointment: Appointment): List<Appointment> =
    filterNot { it.id == appointment.id }
        .plus(appointment)
        .sortedBy(Appointment::startsAt)

private fun Map<String, String>.toAppointmentFieldErrors(): Map<String, Int> = buildMap {
    keys.forEach { field ->
        val messageRes = when (field) {
            "patientId" -> R.string.appointment_error_patient_required
            "startsAt" -> R.string.appointment_error_start_required
            "endsAt" -> R.string.appointment_error_end_after_start
            "reason" -> R.string.appointment_error_reason_required
            "cancellationReason" -> R.string.appointment_error_cancellation_reason_required
            else -> null
        }
        if (messageRes != null) put(field, messageRes)
    }
}

private fun Throwable.isNetworkFailure(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current is UnknownHostException || current is ConnectException || current is SocketTimeoutException) {
            return true
        }
        current = current.cause
    }
    return false
}
