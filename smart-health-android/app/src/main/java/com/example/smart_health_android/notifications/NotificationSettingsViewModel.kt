package com.example.smart_health_android.notifications

import android.content.Context
import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.data.SmartHealthApi
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

interface NotificationSettingsRepository {
    suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot?

    suspend fun patch(
        field: NotificationPreferenceField,
        enabled: Boolean,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot

    fun runtimeReadiness(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationRuntimeReadiness
}

class NotificationPreferenceOwnershipException(message: String) : SecurityException(message)

class NotificationPreferenceConfirmationException(message: String) : IOException(message)

class ApiNotificationSettingsRepository(
    private val api: SmartHealthApi,
    private val runtimeState: NotificationRuntimeState,
) : NotificationSettingsRepository {
    override suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot {
        return api.getNotificationPreferences().requireOwner(
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )
    }

    override suspend fun patch(
        field: NotificationPreferenceField,
        enabled: Boolean,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot {
        require(idempotencyKey.isNotBlank()) { "IDEMPOTENCY_KEY_REQUIRED" }
        val response = api.patchNotificationPreference(
            field = field,
            enabled = enabled,
            idempotencyKey = idempotencyKey,
        ).requireOwner(
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )
        if (response.preferences[field] != enabled) {
            throw NotificationPreferenceConfirmationException(
                "NOTIFICATION_PREFERENCE_NOT_CONFIRMED:${field.backendKey}",
            )
        }
        return response
    }

    override fun runtimeReadiness(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationRuntimeReadiness {
        return runtimeState.readiness(
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )
    }
}

interface NotificationRuntimeState {
    fun readiness(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationRuntimeReadiness
}

class AndroidNotificationRuntimeState(
    private val context: Context,
    private val firebaseConfigured: Boolean = BuildConfig.SHCARE_FIREBASE_CONFIGURED,
) : NotificationRuntimeState {
    override fun readiness(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationRuntimeReadiness {
        SmartHealthNotificationCenter.ensureChannels(context)
        val binding = SmartHealthNotificationSession.activeBindingOrNull()
        val normalizedUserId = expectedUserId.trim()
        val normalizedWorkspaceId = expectedWorkspaceId.trim()
        return NotificationRuntimeReadiness(
            firebaseConfigured = firebaseConfigured,
            runtimePermissionGranted = SmartHealthNotificationCenter
                .hasRuntimeNotificationPermission(context),
            appNotificationsEnabled = SmartHealthNotificationCenter
                .areAppNotificationsEnabled(context),
            channelEnabled = SmartHealthNotificationCenter.isChannelEnabled(
                context = context,
                channel = SmartHealthNotificationChannel.GeneralUpdates,
            ),
            encryptedSessionMatches = normalizedUserId.isNotEmpty() &&
                normalizedWorkspaceId.isNotEmpty() &&
                binding?.backendUserId == normalizedUserId &&
                binding.workspaceId == normalizedWorkspaceId,
        )
    }
}

enum class NotificationSettingsLoadState {
    Loading,
    Ready,
    Empty,
    PermissionDenied,
    Offline,
    Error,
}

data class NotificationSettingsUiState(
    val loadState: NotificationSettingsLoadState = NotificationSettingsLoadState.Loading,
    val snapshot: NotificationPreferencesSnapshot? = null,
    val runtimeReadiness: NotificationRuntimeReadiness = NotificationRuntimeReadiness(),
    val role: String = "",
    val savingFields: Set<NotificationPreferenceField> = emptySet(),
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val errorMessage: NotificationSettingsMessage? = null,
    val statusMessage: NotificationSettingsMessage? = null,
) {
    val pushReady: Boolean
        get() = snapshot?.preferences?.enabled == true &&
            snapshot.channels.push.ready &&
            runtimeReadiness.ready
}

enum class NotificationSettingsMessage {
    Refreshed,
    CloudPreferenceSaved,
    SystemPermissionGranted,
    SystemPermissionDenied,
    MissingAuthority,
    PermissionDenied,
    ServerError,
    ConfirmationMissing,
    Offline,
    UnknownError,
}

sealed interface NotificationSettingsUiAction {
    data object Refresh : NotificationSettingsUiAction

    data class SetCloudPreference(
        val field: NotificationPreferenceField,
        val enabled: Boolean,
    ) : NotificationSettingsUiAction

    data class SystemPermissionResult(val granted: Boolean) : NotificationSettingsUiAction

    data object RequestSystemPermission : NotificationSettingsUiAction

    data object OpenSystemNotificationSettings : NotificationSettingsUiAction

    data object RefreshOnResume : NotificationSettingsUiAction

    data object DismissMessage : NotificationSettingsUiAction
}

sealed interface NotificationSettingsUiEffect {
    data object RequestSystemPermission : NotificationSettingsUiEffect

    data object OpenSystemNotificationSettings : NotificationSettingsUiEffect
}

class NotificationSettingsViewModel(
    private val repository: NotificationSettingsRepository,
    private val expectedUserId: String,
    private val expectedWorkspaceId: String,
    role: String,
    private val idempotencyKey: () -> String = { UUID.randomUUID().toString() },
    private val elapsedRealtimeMillis: () -> Long = SystemClock::elapsedRealtime,
) : ViewModel() {
    private val retryKeys = mutableMapOf<Pair<NotificationPreferenceField, Boolean>, String>()
    private var lastSuccessfulRefreshElapsedRealtimeMillis = Long.MIN_VALUE
    private val _uiState = MutableStateFlow(
        NotificationSettingsUiState(
            runtimeReadiness = repository.runtimeReadiness(
                expectedUserId = expectedUserId,
                expectedWorkspaceId = expectedWorkspaceId,
            ),
            role = role,
        ),
    )
    val uiState: StateFlow<NotificationSettingsUiState> = _uiState.asStateFlow()

    private val effectChannel = Channel<NotificationSettingsUiEffect>(Channel.BUFFERED)
    val effects = effectChannel.receiveAsFlow()

    init {
        refresh(initial = true)
    }

    fun onAction(action: NotificationSettingsUiAction) {
        when (action) {
            NotificationSettingsUiAction.Refresh -> refresh(initial = false)
            is NotificationSettingsUiAction.SetCloudPreference ->
                patchCloudPreference(action.field, action.enabled)
            is NotificationSettingsUiAction.SystemPermissionResult ->
                handleSystemPermissionResult(action.granted)
            NotificationSettingsUiAction.RequestSystemPermission ->
                requestSystemPermission()
            NotificationSettingsUiAction.OpenSystemNotificationSettings ->
                effectChannel.trySend(NotificationSettingsUiEffect.OpenSystemNotificationSettings)
            NotificationSettingsUiAction.RefreshOnResume ->
                refreshOnResume()
            NotificationSettingsUiAction.DismissMessage -> _uiState.update {
                it.copy(errorMessage = null, statusMessage = null)
            }
        }
    }

    private fun refresh(initial: Boolean) {
        val current = _uiState.value
        if (
            current.isRefreshing ||
            current.savingFields.isNotEmpty()
        ) {
            return
        }
        _uiState.update {
            it.copy(
                loadState = if (initial && it.snapshot == null) {
                    NotificationSettingsLoadState.Loading
                } else {
                    it.loadState
                },
                isRefreshing = true,
                errorMessage = null,
                statusMessage = null,
                runtimeReadiness = repository.runtimeReadiness(
                    expectedUserId = expectedUserId,
                    expectedWorkspaceId = expectedWorkspaceId,
                ),
            )
        }
        viewModelScope.launch {
            runCatching {
                requireExpectedAuthority()
                repository.load(expectedUserId, expectedWorkspaceId)
            }.onSuccess { snapshot ->
                lastSuccessfulRefreshElapsedRealtimeMillis = elapsedRealtimeMillis()
                _uiState.update {
                    it.copy(
                        loadState = if (snapshot == null) {
                            NotificationSettingsLoadState.Empty
                        } else {
                            NotificationSettingsLoadState.Ready
                        },
                        snapshot = snapshot,
                        isRefreshing = false,
                        isStale = false,
                        errorMessage = null,
                        statusMessage = if (initial) {
                            null
                        } else {
                            NotificationSettingsMessage.Refreshed
                        },
                        runtimeReadiness = repository.runtimeReadiness(
                            expectedUserId = expectedUserId,
                            expectedWorkspaceId = expectedWorkspaceId,
                        ),
                    )
                }
            }.onFailure { error ->
                val previous = _uiState.value.snapshot
                _uiState.update {
                    if (previous != null) {
                        it.copy(
                            loadState = NotificationSettingsLoadState.Ready,
                            isRefreshing = false,
                            isStale = true,
                            errorMessage = notificationSettingsErrorMessage(error),
                            statusMessage = null,
                        )
                    } else {
                        it.copy(
                            loadState = notificationSettingsFailureState(error),
                            isRefreshing = false,
                            isStale = false,
                            errorMessage = notificationSettingsErrorMessage(error),
                            statusMessage = null,
                        )
                    }
                }
            }
        }
    }

    private fun patchCloudPreference(
        field: NotificationPreferenceField,
        enabled: Boolean,
    ) {
        val current = _uiState.value
        val snapshot = current.snapshot ?: return
        if (
            current.isRefreshing ||
            current.savingFields.isNotEmpty() ||
            snapshot.preferences[field] == enabled
        ) {
            return
        }
        val mutationIdentity = field to enabled
        val operationKey = retryKeys.getOrPut(mutationIdentity, idempotencyKey)
        _uiState.update {
            it.copy(
                savingFields = it.savingFields + field,
                errorMessage = null,
                statusMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                requireExpectedAuthority()
                repository.patch(
                    field = field,
                    enabled = enabled,
                    idempotencyKey = operationKey,
                    expectedUserId = expectedUserId,
                    expectedWorkspaceId = expectedWorkspaceId,
                )
            }.onSuccess { response ->
                retryKeys.remove(mutationIdentity)
                _uiState.update { state ->
                    val confirmed = state.snapshot
                    state.copy(
                        loadState = NotificationSettingsLoadState.Ready,
                        snapshot = if (confirmed == null) {
                            response
                        } else {
                            confirmed.copy(
                                preferences = confirmed.preferences.with(field, enabled),
                                channels = response.channels,
                                updatedAt = response.updatedAt,
                                replayed = response.replayed,
                            )
                        },
                        savingFields = state.savingFields - field,
                        isStale = false,
                        errorMessage = null,
                        statusMessage = NotificationSettingsMessage.CloudPreferenceSaved,
                        runtimeReadiness = repository.runtimeReadiness(
                            expectedUserId = expectedUserId,
                            expectedWorkspaceId = expectedWorkspaceId,
                        ),
                    )
                }
                if (
                    field == NotificationPreferenceField.Enabled &&
                    enabled &&
                    response.channels.push.ready
                ) {
                    val runtime = _uiState.value.runtimeReadiness
                    if (
                        runtime.firebaseConfigured &&
                        runtime.encryptedSessionMatches &&
                        !runtime.runtimePermissionGranted
                    ) {
                        effectChannel.trySend(NotificationSettingsUiEffect.RequestSystemPermission)
                    }
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        savingFields = it.savingFields - field,
                        isStale = true,
                        errorMessage = notificationSettingsErrorMessage(error),
                        statusMessage = null,
                    )
                }
            }
        }
    }

    private fun handleSystemPermissionResult(granted: Boolean) {
        val refreshed = repository.runtimeReadiness(
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )
        _uiState.update {
            it.copy(
                runtimeReadiness = refreshed,
                statusMessage = if (granted && refreshed.runtimePermissionGranted) {
                    NotificationSettingsMessage.SystemPermissionGranted
                } else {
                    NotificationSettingsMessage.SystemPermissionDenied
                },
                errorMessage = null,
            )
        }
    }

    private fun refreshOnResume() {
        val now = elapsedRealtimeMillis()
        val elapsed = if (lastSuccessfulRefreshElapsedRealtimeMillis == Long.MIN_VALUE) {
            Long.MAX_VALUE
        } else {
            (now - lastSuccessfulRefreshElapsedRealtimeMillis).coerceAtLeast(0L)
        }
        if (elapsed >= RESUME_REFRESH_MIN_AGE_MILLIS) {
            refresh(initial = false)
        } else {
            _uiState.update {
                it.copy(
                    runtimeReadiness = repository.runtimeReadiness(
                        expectedUserId = expectedUserId,
                        expectedWorkspaceId = expectedWorkspaceId,
                    ),
                )
            }
        }
    }

    private fun requestSystemPermission() {
        val state = _uiState.value
        if (
            state.snapshot?.preferences?.enabled == true &&
            state.snapshot.channels.push.ready &&
            state.runtimeReadiness.firebaseConfigured &&
            state.runtimeReadiness.encryptedSessionMatches &&
            !state.runtimeReadiness.runtimePermissionGranted
        ) {
            effectChannel.trySend(NotificationSettingsUiEffect.RequestSystemPermission)
        }
    }

    private fun requireExpectedAuthority() {
        if (expectedUserId.isBlank() || expectedWorkspaceId.isBlank()) {
            throw NotificationPreferenceOwnershipException(
                "NOTIFICATION_AUTHORITY_MISSING",
            )
        }
    }

    private companion object {
        const val RESUME_REFRESH_MIN_AGE_MILLIS = 5_000L
    }
}

class NotificationSettingsViewModelFactory(
    context: Context,
    private val expectedUserId: String,
    private val expectedWorkspaceId: String,
    private val role: String,
) : ViewModelProvider.Factory {
    private val applicationContext = context.applicationContext

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(NotificationSettingsViewModel::class.java))
        return NotificationSettingsViewModel(
            repository = ApiNotificationSettingsRepository(
                api = SmartHealthRepository.api,
                runtimeState = AndroidNotificationRuntimeState(applicationContext),
            ),
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
            role = role,
        ) as T
    }
}

private fun NotificationPreferencesSnapshot.requireOwner(
    expectedUserId: String,
    expectedWorkspaceId: String,
): NotificationPreferencesSnapshot {
    val normalizedUserId = expectedUserId.trim()
    val normalizedWorkspaceId = expectedWorkspaceId.trim()
    if (
        normalizedUserId.isEmpty() ||
        normalizedWorkspaceId.isEmpty() ||
        userId != normalizedUserId ||
        workspaceId != normalizedWorkspaceId ||
        ownership.kind != "self" ||
        ownership.userId != normalizedUserId ||
        ownership.userId != userId
    ) {
        throw NotificationPreferenceOwnershipException(
            "NOTIFICATION_PREFERENCE_OWNER_MISMATCH",
        )
    }
    return this
}

private fun notificationSettingsFailureState(error: Throwable): NotificationSettingsLoadState =
    when {
        error is NotificationPreferenceOwnershipException ->
            NotificationSettingsLoadState.PermissionDenied
        error is SmartHealthApiException && error.statusCode == 403 ->
            NotificationSettingsLoadState.PermissionDenied
        error is SmartHealthApiException ->
            NotificationSettingsLoadState.Error
        error is NotificationPreferenceConfirmationException ->
            NotificationSettingsLoadState.Error
        error is IOException ->
            NotificationSettingsLoadState.Offline
        else -> NotificationSettingsLoadState.Error
    }

private fun notificationSettingsErrorMessage(error: Throwable): NotificationSettingsMessage = when {
    error is NotificationPreferenceOwnershipException ->
        NotificationSettingsMessage.MissingAuthority
    error is SmartHealthApiException && error.statusCode == 403 ->
        NotificationSettingsMessage.PermissionDenied
    error is SmartHealthApiException ->
        NotificationSettingsMessage.ServerError
    error is NotificationPreferenceConfirmationException ->
        NotificationSettingsMessage.ConfirmationMissing
    error is IOException ->
        NotificationSettingsMessage.Offline
    else -> NotificationSettingsMessage.UnknownError
}
