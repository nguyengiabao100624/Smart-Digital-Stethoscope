package com.example.smart_health_android.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AppNotification
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class NotificationInboxLoadState {
    Loading,
    Ready,
    Empty,
    Offline,
    PermissionDenied,
    Error,
}

enum class NotificationInboxMessage {
    MissingAuthority,
    PermissionDenied,
    Offline,
    ServerError,
    ConfirmationMissing,
    UnknownError,
}

sealed interface NotificationInboxUiEffect {
    data object ReadConfirmed : NotificationInboxUiEffect
    data object ReadAllConfirmed : NotificationInboxUiEffect
    data object DeleteConfirmed : NotificationInboxUiEffect
}

data class NotificationInboxUiState(
    val loadState: NotificationInboxLoadState = NotificationInboxLoadState.Loading,
    val notifications: List<AppNotification> = emptyList(),
    val isRefreshing: Boolean = false,
    val activeMutation: String? = null,
    val pendingDeleteId: String? = null,
    val isStale: Boolean = false,
    val errorMessage: NotificationInboxMessage? = null,
) {
    val unreadCount: Int
        get() = notifications.count { !it.read }

    val isBusy: Boolean
        get() = isRefreshing || activeMutation != null
}

sealed interface NotificationInboxUiAction {
    data object Refresh : NotificationInboxUiAction
    data class MarkRead(val notificationId: String) : NotificationInboxUiAction
    data object MarkAllRead : NotificationInboxUiAction
    data class RequestDelete(val notificationId: String) : NotificationInboxUiAction
    data object DismissDelete : NotificationInboxUiAction
    data object ConfirmDelete : NotificationInboxUiAction
}

class NotificationInboxViewModel(
    private val repository: NotificationInboxRepository,
    private val expectedUserId: String,
    private val expectedWorkspaceId: String,
    private val idempotencyKey: () -> String = {
        "android-notification-inbox-${UUID.randomUUID()}"
    },
) : ViewModel() {
    private val mutableUiState = MutableStateFlow(NotificationInboxUiState())
    val uiState: StateFlow<NotificationInboxUiState> =
        mutableUiState.asStateFlow()

    private val effectChannel = Channel<NotificationInboxUiEffect>(
        capacity = Channel.BUFFERED,
    )
    val effects = effectChannel.receiveAsFlow()

    private val retryKeys = mutableMapOf<String, String>()
    private var loadInFlight = false

    init {
        refresh(initial = true)
    }

    fun onAction(action: NotificationInboxUiAction) {
        when (action) {
            NotificationInboxUiAction.Refresh -> refresh(initial = false)
            is NotificationInboxUiAction.MarkRead ->
                mutate(
                    action = NotificationInboxAction.Read,
                    notificationId = action.notificationId,
                )
            NotificationInboxUiAction.MarkAllRead ->
                mutate(action = NotificationInboxAction.ReadAll)
            is NotificationInboxUiAction.RequestDelete -> requestDelete(
                action.notificationId,
            )
            NotificationInboxUiAction.DismissDelete -> {
                if (mutableUiState.value.activeMutation == null) {
                    mutableUiState.update {
                        it.copy(pendingDeleteId = null)
                    }
                }
            }
            NotificationInboxUiAction.ConfirmDelete -> {
                val notificationId =
                    mutableUiState.value.pendingDeleteId ?: return
                mutate(
                    action = NotificationInboxAction.Delete,
                    notificationId = notificationId,
                )
            }
        }
    }

    private fun refresh(initial: Boolean) {
        val current = mutableUiState.value
        if (loadInFlight || current.activeMutation != null) {
            return
        }
        if (
            expectedUserId.isBlank() ||
            expectedWorkspaceId.isBlank()
        ) {
            mutableUiState.update {
                it.copy(
                    loadState = NotificationInboxLoadState.PermissionDenied,
                    isRefreshing = false,
                    isStale = false,
                    errorMessage = NotificationInboxMessage.MissingAuthority,
                )
            }
            return
        }
        loadInFlight = true
        mutableUiState.update {
            it.copy(
                loadState = if (initial && it.notifications.isEmpty()) {
                    NotificationInboxLoadState.Loading
                } else {
                    it.loadState
                },
                isRefreshing = !initial || it.notifications.isNotEmpty(),
                errorMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.load(
                    expectedUserId = expectedUserId,
                    expectedWorkspaceId = expectedWorkspaceId,
                )
            }.onSuccess { snapshot ->
                mutableUiState.update {
                    it.copy(
                        loadState = if (snapshot.notifications.isEmpty()) {
                            NotificationInboxLoadState.Empty
                        } else {
                            NotificationInboxLoadState.Ready
                        },
                        notifications = snapshot.notifications,
                        isRefreshing = false,
                        isStale = false,
                        errorMessage = null,
                    )
                }
            }.onFailure { error ->
                mutableUiState.update { state ->
                    if (state.notifications.isNotEmpty()) {
                        state.copy(
                            loadState = NotificationInboxLoadState.Ready,
                            isRefreshing = false,
                            isStale = true,
                            errorMessage = notificationInboxMessage(error),
                        )
                    } else {
                        state.copy(
                            loadState = notificationInboxFailureState(error),
                            isRefreshing = false,
                            isStale = false,
                            errorMessage = notificationInboxMessage(error),
                        )
                    }
                }
            }
            loadInFlight = false
        }
    }

    private fun requestDelete(notificationId: String) {
        val current = mutableUiState.value
        if (
            current.isBusy ||
            current.notifications.none { it.id == notificationId }
        ) {
            return
        }
        mutableUiState.update {
            it.copy(
                pendingDeleteId = notificationId,
                errorMessage = null,
            )
        }
    }

    private fun mutate(
        action: NotificationInboxAction,
        notificationId: String? = null,
    ) {
        val current = mutableUiState.value
        if (current.isBusy) {
            return
        }
        if (
            expectedUserId.isBlank() ||
            expectedWorkspaceId.isBlank()
        ) {
            mutableUiState.update {
                it.copy(
                    loadState = NotificationInboxLoadState.PermissionDenied,
                    errorMessage = NotificationInboxMessage.MissingAuthority,
                )
            }
            return
        }
        when (action) {
            NotificationInboxAction.Read -> {
                val item = current.notifications.find {
                    it.id == notificationId
                }
                if (item == null || item.read) return
            }
            NotificationInboxAction.ReadAll -> {
                if (current.unreadCount == 0) return
            }
            NotificationInboxAction.Delete -> {
                if (
                    notificationId == null ||
                    notificationId != current.pendingDeleteId ||
                    current.notifications.none { it.id == notificationId }
                ) {
                    return
                }
            }
        }

        val operationId = "${action.wireValue}:${notificationId.orEmpty()}"
        val operationKey = retryKeys.getOrPut(operationId, idempotencyKey)
        mutableUiState.update {
            it.copy(
                activeMutation = operationId,
                errorMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                when (action) {
                    NotificationInboxAction.Read -> repository.markRead(
                        notificationId = requireNotNull(notificationId),
                        idempotencyKey = operationKey,
                        expectedUserId = expectedUserId,
                        expectedWorkspaceId = expectedWorkspaceId,
                    )
                    NotificationInboxAction.ReadAll -> repository.markAllRead(
                        idempotencyKey = operationKey,
                        expectedUserId = expectedUserId,
                        expectedWorkspaceId = expectedWorkspaceId,
                    )
                    NotificationInboxAction.Delete -> repository.delete(
                        notificationId = requireNotNull(notificationId),
                        idempotencyKey = operationKey,
                        expectedUserId = expectedUserId,
                        expectedWorkspaceId = expectedWorkspaceId,
                    )
                }
            }.onSuccess { receipt ->
                retryKeys.remove(operationId)
                mutableUiState.update {
                    it.copy(
                        loadState = if (receipt.notifications.isEmpty()) {
                            NotificationInboxLoadState.Empty
                        } else {
                            NotificationInboxLoadState.Ready
                        },
                        notifications = receipt.notifications,
                        activeMutation = null,
                        pendingDeleteId = if (
                            action == NotificationInboxAction.Delete
                        ) {
                            null
                        } else {
                            it.pendingDeleteId
                        },
                        isStale = false,
                        errorMessage = null,
                    )
                }
                effectChannel.trySend(
                    when (action) {
                        NotificationInboxAction.Read ->
                            NotificationInboxUiEffect.ReadConfirmed
                        NotificationInboxAction.ReadAll ->
                            NotificationInboxUiEffect.ReadAllConfirmed
                        NotificationInboxAction.Delete ->
                            NotificationInboxUiEffect.DeleteConfirmed
                    },
                )
            }.onFailure { error ->
                if (!isAmbiguousNotificationTransportFailure(error)) {
                    retryKeys.remove(operationId)
                }
                mutableUiState.update {
                    it.copy(
                        activeMutation = null,
                        isStale = true,
                        errorMessage = notificationInboxMessage(error),
                    )
                }
            }
        }
    }
}

class NotificationInboxViewModelFactory(
    private val expectedUserId: String,
    private val expectedWorkspaceId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(NotificationInboxViewModel::class.java))
        return NotificationInboxViewModel(
            repository = ApiNotificationInboxRepository(
                api = SmartHealthRepository.api,
            ),
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        ) as T
    }
}

private fun notificationInboxFailureState(
    error: Throwable,
): NotificationInboxLoadState = when {
    error is NotificationInboxOwnershipException ->
        NotificationInboxLoadState.PermissionDenied
    error is SmartHealthApiException && error.statusCode == 403 ->
        NotificationInboxLoadState.PermissionDenied
    error is SmartHealthApiException ->
        NotificationInboxLoadState.Error
    error is NotificationInboxConfirmationException ->
        NotificationInboxLoadState.Error
    error is IOException ->
        NotificationInboxLoadState.Offline
    else ->
        NotificationInboxLoadState.Error
}

private fun notificationInboxMessage(
    error: Throwable,
): NotificationInboxMessage = when {
    error is NotificationInboxOwnershipException ->
        NotificationInboxMessage.MissingAuthority
    error is SmartHealthApiException && error.statusCode == 403 ->
        NotificationInboxMessage.PermissionDenied
    error is SmartHealthApiException ->
        NotificationInboxMessage.ServerError
    error is NotificationInboxConfirmationException ->
        NotificationInboxMessage.ConfirmationMissing
    error is IOException ->
        NotificationInboxMessage.Offline
    else ->
        NotificationInboxMessage.UnknownError
}

private fun isAmbiguousNotificationTransportFailure(
    error: Throwable,
): Boolean = error is IOException && error !is SmartHealthApiException
