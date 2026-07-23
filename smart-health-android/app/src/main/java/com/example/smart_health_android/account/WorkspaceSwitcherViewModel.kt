package com.example.smart_health_android.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.WorkspaceSummary
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class WorkspaceLoadState {
    Loading,
    Ready,
    Empty,
    Offline,
    PermissionDenied,
    Error,
}

data class WorkspaceSwitcherUiState(
    val loadState: WorkspaceLoadState = WorkspaceLoadState.Loading,
    val workspaces: List<WorkspaceSummary> = emptyList(),
    val currentWorkspaceId: String = "",
    val switchingWorkspaceId: String = "",
    val errorMessage: String = "",
    val confirmationMessage: String = "",
    internal val switchTargetId: String = "",
    internal val switchIdempotencyKey: String = "",
)

sealed interface WorkspaceSwitcherAction {
    data object Retry : WorkspaceSwitcherAction
    data class Switch(val workspaceId: String) : WorkspaceSwitcherAction
}

interface WorkspaceSwitcherRepository {
    suspend fun getCurrentUser(): AuthUser
    suspend fun switchWorkspace(workspaceId: String, idempotencyKey: String): AuthUser
}

class ApiWorkspaceSwitcherRepository : WorkspaceSwitcherRepository {
    override suspend fun getCurrentUser(): AuthUser = SmartHealthRepository.api.getMe()
    override suspend fun switchWorkspace(workspaceId: String, idempotencyKey: String): AuthUser =
        SmartHealthRepository.api.switchWorkspace(workspaceId, idempotencyKey)
}

class WorkspaceSwitcherViewModel(
    private val repository: WorkspaceSwitcherRepository = ApiWorkspaceSwitcherRepository(),
    private val createIdempotencyKey: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(WorkspaceSwitcherUiState())
    val uiState = _uiState.asStateFlow()

    init {
        load()
    }

    fun onAction(action: WorkspaceSwitcherAction) {
        when (action) {
            WorkspaceSwitcherAction.Retry -> load()
            is WorkspaceSwitcherAction.Switch -> switchWorkspace(action.workspaceId)
        }
    }

    private fun load() {
        if (_uiState.value.switchingWorkspaceId.isNotBlank()) return
        _uiState.update {
            it.copy(
                loadState = WorkspaceLoadState.Loading,
                errorMessage = "",
                confirmationMessage = "",
            )
        }
        viewModelScope.launch {
            runCatching { repository.getCurrentUser() }
                .onSuccess(::applyUser)
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            loadState = when {
                                error is SmartHealthApiException && error.statusCode in setOf(401, 403) -> {
                                    WorkspaceLoadState.PermissionDenied
                                }
                                error is IOException && error !is SmartHealthApiException -> {
                                    WorkspaceLoadState.Offline
                                }
                                else -> WorkspaceLoadState.Error
                            },
                            errorMessage = error.message.orEmpty(),
                        )
                    }
                }
        }
    }

    private fun switchWorkspace(workspaceId: String) {
        val state = _uiState.value
        val workspace = state.workspaces.firstOrNull { it.id == workspaceId } ?: return
        if (
            state.loadState != WorkspaceLoadState.Ready ||
            state.switchingWorkspaceId.isNotBlank() ||
            workspaceId == state.currentWorkspaceId
        ) return

        val key = state.switchIdempotencyKey
            .takeIf { state.switchTargetId == workspaceId && it.isNotBlank() }
            ?: createIdempotencyKey()
        _uiState.update {
            it.copy(
                switchingWorkspaceId = workspaceId,
                errorMessage = "",
                confirmationMessage = "",
                switchTargetId = workspaceId,
                switchIdempotencyKey = key,
            )
        }
        viewModelScope.launch {
            runCatching { repository.switchWorkspace(workspaceId, key) }
                .onSuccess { user ->
                    val confirmedId = user.confirmedWorkspaceId()
                    if (confirmedId != workspaceId) {
                        _uiState.update {
                            it.copy(
                                switchingWorkspaceId = "",
                                errorMessage = "Máy chủ chưa xác nhận workspace đã chọn.",
                            )
                        }
                        return@onSuccess
                    }
                    val refreshed = user.workspaceOptions()
                    _uiState.update {
                        it.copy(
                            loadState = WorkspaceLoadState.Ready,
                            workspaces = refreshed.ifEmpty { state.workspaces },
                            currentWorkspaceId = confirmedId,
                            switchingWorkspaceId = "",
                            errorMessage = "",
                            confirmationMessage = workspace.name.ifBlank { workspace.id },
                            switchTargetId = "",
                            switchIdempotencyKey = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            switchingWorkspaceId = "",
                            errorMessage = error.message.orEmpty(),
                        )
                    }
                }
        }
    }

    private fun applyUser(user: AuthUser) {
        val workspaces = user.workspaceOptions()
        _uiState.update {
            it.copy(
                loadState = if (workspaces.isEmpty()) WorkspaceLoadState.Empty else WorkspaceLoadState.Ready,
                workspaces = workspaces,
                currentWorkspaceId = user.confirmedWorkspaceId(),
                switchingWorkspaceId = "",
                errorMessage = "",
                switchTargetId = "",
                switchIdempotencyKey = "",
            )
        }
    }
}

private fun AuthUser.confirmedWorkspaceId(): String =
    currentWorkspaceId.ifBlank { currentWorkspace?.id.orEmpty() }.ifBlank { organizationId }
