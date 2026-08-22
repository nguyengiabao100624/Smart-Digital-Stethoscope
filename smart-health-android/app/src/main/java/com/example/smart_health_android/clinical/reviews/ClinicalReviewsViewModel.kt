package com.example.smart_health_android.clinical.reviews

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.ClinicalReview
import com.example.smart_health_android.data.ClinicalReviewDecision
import com.example.smart_health_android.data.ClinicalReviewList
import com.example.smart_health_android.data.ClinicalReviewStatus
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ClinicalReviewFilter(val status: ClinicalReviewStatus) {
    Pending(ClinicalReviewStatus.Pending),
    Reviewed(ClinicalReviewStatus.Reviewed),
}

enum class ClinicalReviewsLoadState {
    Loading,
    Content,
    Empty,
    PermissionDenied,
    Offline,
    Error,
}

enum class ClinicalReviewsError {
    PermissionDenied,
    Conflict,
    Offline,
    WorkspaceMismatch,
    Confirmation,
    Unknown,
}

enum class ClinicalReviewValidationError {
    ActionNoteRequired,
}

data class PendingClinicalReviewDecision(
    val scanId: String,
    val decision: ClinicalReviewDecision,
    val expectedVersion: Int,
    val idempotencyKey: String,
    val note: String = "",
    val validationError: ClinicalReviewValidationError? = null,
)

data class ClinicalReviewsUiState(
    val loadState: ClinicalReviewsLoadState = ClinicalReviewsLoadState.Loading,
    val filter: ClinicalReviewFilter = ClinicalReviewFilter.Pending,
    val reviews: List<ClinicalReview> = emptyList(),
    val selectedReviewId: String? = null,
    val canManage: Boolean = false,
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val isMutating: Boolean = false,
    val pendingDecision: PendingClinicalReviewDecision? = null,
    val error: ClinicalReviewsError? = null,
    val requestId: String = "",
)

sealed interface ClinicalReviewsUiAction {
    data object Refresh : ClinicalReviewsUiAction
    data class ChangeFilter(val filter: ClinicalReviewFilter) : ClinicalReviewsUiAction
    data class SelectReview(val reviewId: String) : ClinicalReviewsUiAction
    data class RequestDecision(
        val scanId: String,
        val decision: ClinicalReviewDecision,
    ) : ClinicalReviewsUiAction
    data class UpdateDecisionNote(val note: String) : ClinicalReviewsUiAction
    data object DismissDecision : ClinicalReviewsUiAction
    data object ConfirmDecision : ClinicalReviewsUiAction
}

sealed interface ClinicalReviewsUiEffect {
    data class BackendDecisionConfirmed(val decision: ClinicalReviewDecision) :
        ClinicalReviewsUiEffect

    data object BackendStateRefreshedAfterConflict : ClinicalReviewsUiEffect
}

interface ClinicalReviewsRepository {
    suspend fun load(
        filter: ClinicalReviewFilter,
        expectedWorkspaceId: String,
    ): ClinicalReviewList

    suspend fun decide(
        review: ClinicalReview,
        decision: ClinicalReviewDecision,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalReview
}

class ApiClinicalReviewsRepository(
    private val api: SmartHealthApi,
) : ClinicalReviewsRepository {
    override suspend fun load(
        filter: ClinicalReviewFilter,
        expectedWorkspaceId: String,
    ): ClinicalReviewList {
        val response = api.listClinicalReviews(status = filter.status, limit = 50)
        if (
            expectedWorkspaceId.isBlank() ||
            response.workspaceId != expectedWorkspaceId ||
            response.reviews.any { it.organizationId != expectedWorkspaceId }
        ) {
            throw ClinicalReviewWorkspaceMismatchException()
        }
        return response
    }

    override suspend fun decide(
        review: ClinicalReview,
        decision: ClinicalReviewDecision,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalReview {
        if (expectedWorkspaceId.isBlank() || review.organizationId != expectedWorkspaceId) {
            throw ClinicalReviewWorkspaceMismatchException()
        }
        val response = api.decideClinicalReview(
            scanId = review.scanId,
            decision = decision,
            note = note,
            expectedVersion = review.version,
            idempotencyKey = idempotencyKey,
        )
        val confirmed = response.review
        if (
            response.workspaceId != expectedWorkspaceId ||
            confirmed.organizationId != expectedWorkspaceId ||
            confirmed.scanId != review.scanId ||
            confirmed.status != ClinicalReviewStatus.Reviewed ||
            confirmed.decision != decision ||
            confirmed.note.trim() != note.trim() ||
            confirmed.version != review.version + 1
        ) {
            throw ClinicalReviewConfirmationException()
        }
        return confirmed
    }
}

class ClinicalReviewWorkspaceMismatchException :
    IllegalStateException("Clinical review response is not bound to the expected workspace.")

class ClinicalReviewConfirmationException :
    IllegalStateException("Backend did not confirm the exact clinical review decision.")

class ClinicalReviewsViewModel(
    private val repository: ClinicalReviewsRepository,
    private val expectedWorkspaceId: String,
    canManage: Boolean,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(ClinicalReviewsUiState(canManage = canManage))
    val uiState: StateFlow<ClinicalReviewsUiState> = _uiState.asStateFlow()

    private val _effects = Channel<ClinicalReviewsUiEffect>(Channel.BUFFERED)
    val effects: Flow<ClinicalReviewsUiEffect> = _effects.receiveAsFlow()
    private var loadJob: Job? = null
    private var mutationJob: Job? = null

    init {
        require(expectedWorkspaceId.isNotBlank()) {
            "A canonical workspace is required for the clinical review queue."
        }
        load(initial = true)
    }

    fun onAction(action: ClinicalReviewsUiAction) {
        when (action) {
            ClinicalReviewsUiAction.Refresh -> load(initial = false)
            is ClinicalReviewsUiAction.ChangeFilter -> if (
                action.filter != _uiState.value.filter && mutationJob?.isActive != true
            ) {
                _uiState.update { it.copy(filter = action.filter, pendingDecision = null) }
                load(initial = false)
            }
            is ClinicalReviewsUiAction.SelectReview -> if (
                _uiState.value.reviews.any { it.id == action.reviewId }
            ) {
                _uiState.update { it.copy(selectedReviewId = action.reviewId) }
            }
            is ClinicalReviewsUiAction.RequestDecision -> requestDecision(
                action.scanId,
                action.decision,
            )
            is ClinicalReviewsUiAction.UpdateDecisionNote -> _uiState.update { state ->
                state.pendingDecision?.let { pending ->
                    state.copy(
                        pendingDecision = pending.copy(
                            note = action.note.take(MAX_NOTE_LENGTH),
                            validationError = null,
                        ),
                        error = null,
                        requestId = "",
                    )
                } ?: state
            }
            ClinicalReviewsUiAction.DismissDecision -> if (mutationJob?.isActive != true) {
                _uiState.update { it.copy(pendingDecision = null, error = null, requestId = "") }
            }
            ClinicalReviewsUiAction.ConfirmDecision -> confirmDecision()
        }
    }

    private fun load(
        initial: Boolean,
        preserveError: Boolean = false,
        effectAfterSuccess: ClinicalReviewsUiEffect? = null,
        allowDuringMutationRecovery: Boolean = false,
    ) {
        if (
            loadJob?.isActive == true ||
            mutationJob?.isActive == true && !allowDuringMutationRecovery
        ) return
        val requestedFilter = _uiState.value.filter
        _uiState.update {
            it.copy(
                loadState = if (initial && !it.hasLoaded) ClinicalReviewsLoadState.Loading else it.loadState,
                isRefreshing = !initial,
                error = it.error.takeIf { preserveError },
                requestId = it.requestId.takeIf { preserveError }.orEmpty(),
            )
        }
        loadJob = viewModelScope.launch {
            try {
                val response = repository.load(requestedFilter, expectedWorkspaceId)
                if (
                    response.workspaceId != expectedWorkspaceId ||
                    response.reviews.any { it.organizationId != expectedWorkspaceId }
                ) {
                    throw ClinicalReviewWorkspaceMismatchException()
                }
                if (requestedFilter != _uiState.value.filter) return@launch
                val selectedId = _uiState.value.selectedReviewId
                    ?.takeIf { selected -> response.reviews.any { it.id == selected } }
                    ?: response.reviews.firstOrNull()?.id
                _uiState.update {
                    it.copy(
                        loadState = if (response.reviews.isEmpty()) {
                            ClinicalReviewsLoadState.Empty
                        } else {
                            ClinicalReviewsLoadState.Content
                        },
                        reviews = response.reviews,
                        selectedReviewId = selectedId,
                        hasLoaded = true,
                        isRefreshing = false,
                        isStale = false,
                        error = null,
                        requestId = "",
                    )
                }
                effectAfterSuccess?.let { _effects.send(it) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
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
                    error = classifyError(error),
                    requestId = requestId(error),
                )
            } else {
                current.copy(
                    loadState = classifyLoadState(error),
                    isRefreshing = false,
                    isStale = false,
                    error = classifyError(error),
                    requestId = requestId(error),
                )
            }
        }
    }

    private fun requestDecision(scanId: String, decision: ClinicalReviewDecision) {
        val state = _uiState.value
        if (!state.canManage || state.isMutating) return
        val review = state.reviews.firstOrNull {
            it.scanId == scanId && it.status == ClinicalReviewStatus.Pending
        } ?: return
        val current = state.pendingDecision
        val idempotencyKey = if (
            current?.scanId == scanId && current.decision == decision &&
            current.expectedVersion == review.version
        ) {
            current.idempotencyKey
        } else {
            idempotencyKeyFactory()
        }
        _uiState.update {
            it.copy(
                pendingDecision = PendingClinicalReviewDecision(
                    scanId = scanId,
                    decision = decision,
                    expectedVersion = review.version,
                    idempotencyKey = idempotencyKey,
                ),
                error = null,
                requestId = "",
            )
        }
    }

    private fun confirmDecision() {
        val state = _uiState.value
        val pending = state.pendingDecision ?: return
        if (!state.canManage || mutationJob?.isActive == true) return
        val review = state.reviews.firstOrNull {
            it.scanId == pending.scanId && it.version == pending.expectedVersion
        } ?: return
        val note = pending.note.trim()
        if (pending.decision != ClinicalReviewDecision.Accepted && note.isBlank()) {
            _uiState.update {
                it.copy(
                    pendingDecision = pending.copy(
                        validationError = ClinicalReviewValidationError.ActionNoteRequired,
                    ),
                )
            }
            return
        }
        _uiState.update { it.copy(isMutating = true, error = null, requestId = "") }
        mutationJob = viewModelScope.launch {
            try {
                val confirmed = repository.decide(
                    review = review,
                    decision = pending.decision,
                    note = note,
                    idempotencyKey = pending.idempotencyKey,
                    expectedWorkspaceId = expectedWorkspaceId,
                )
                val remaining = _uiState.value.reviews.filterNot { it.scanId == review.scanId }
                _uiState.update {
                    it.copy(
                        loadState = if (remaining.isEmpty()) {
                            ClinicalReviewsLoadState.Empty
                        } else {
                            ClinicalReviewsLoadState.Content
                        },
                        reviews = remaining,
                        selectedReviewId = remaining.firstOrNull()?.id,
                        isMutating = false,
                        pendingDecision = null,
                        error = null,
                        requestId = "",
                    )
                }
                _effects.send(ClinicalReviewsUiEffect.BackendDecisionConfirmed(confirmed.decision!!))
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (error is SmartHealthApiException && error.statusCode == 409) {
                    _uiState.update {
                        it.copy(
                            isMutating = false,
                            isStale = true,
                            pendingDecision = null,
                            error = ClinicalReviewsError.Conflict,
                            requestId = error.requestId.orEmpty(),
                        )
                    }
                    load(
                        initial = false,
                        preserveError = true,
                        effectAfterSuccess = ClinicalReviewsUiEffect.BackendStateRefreshedAfterConflict,
                        allowDuringMutationRecovery = true,
                    )
                } else {
                    _uiState.update {
                        it.copy(
                            isMutating = false,
                            error = classifyError(error),
                            requestId = requestId(error),
                        )
                    }
                }
            }
        }
    }

    override fun onCleared() {
        loadJob?.cancel()
        mutationJob?.cancel()
        super.onCleared()
    }

    private companion object {
        const val MAX_NOTE_LENGTH = 4000
    }
}

class ClinicalReviewsViewModelFactory(
    private val expectedWorkspaceId: String,
    private val canManage: Boolean,
    private val repository: ClinicalReviewsRepository =
        ApiClinicalReviewsRepository(SmartHealthRepository.api),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(ClinicalReviewsViewModel::class.java))
        return ClinicalReviewsViewModel(
            repository = repository,
            expectedWorkspaceId = expectedWorkspaceId,
            canManage = canManage,
        ) as T
    }
}

private fun classifyLoadState(error: Throwable): ClinicalReviewsLoadState = when {
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        ClinicalReviewsLoadState.PermissionDenied
    error is IOException -> ClinicalReviewsLoadState.Offline
    else -> ClinicalReviewsLoadState.Error
}

private fun classifyError(error: Throwable): ClinicalReviewsError = when {
    error is ClinicalReviewWorkspaceMismatchException -> ClinicalReviewsError.WorkspaceMismatch
    error is ClinicalReviewConfirmationException -> ClinicalReviewsError.Confirmation
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        ClinicalReviewsError.PermissionDenied
    error is SmartHealthApiException && error.statusCode == 409 -> ClinicalReviewsError.Conflict
    error is IOException -> ClinicalReviewsError.Offline
    else -> ClinicalReviewsError.Unknown
}

private fun requestId(error: Throwable): String =
    (error as? SmartHealthApiException)?.requestId.orEmpty()
