package com.example.smart_health_android.security

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AccessLogSeverity {
    Info,
    Warning,
}

data class AccessLogRecord(
    val id: String,
    val action: String,
    val device: String,
    val location: String,
    val ip: String,
    val severity: AccessLogSeverity,
    val createdAt: String?,
)

interface AccessLogRepository {
    suspend fun load(): List<AccessLogRecord>
}

class ApiAccessLogRepository(
    private val api: SmartHealthApi,
) : AccessLogRepository {
    override suspend fun load(): List<AccessLogRecord> =
        api.listAccessLogs().map { log ->
            AccessLogRecord(
                id = log.id,
                action = log.action,
                device = log.device,
                location = log.location,
                ip = log.ip,
                severity = when (log.severity.lowercase()) {
                    "warning", "error" -> AccessLogSeverity.Warning
                    else -> AccessLogSeverity.Info
                },
                createdAt = log.createdAt,
            )
        }
}

enum class AccessLogLoadState {
    Loading,
    Content,
    Empty,
    PermissionDenied,
    Offline,
    Error,
}

enum class AccessLogError {
    PermissionDenied,
    Offline,
    Unknown,
}

data class AccessLogUiState(
    val loadState: AccessLogLoadState = AccessLogLoadState.Loading,
    val records: List<AccessLogRecord> = emptyList(),
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val error: AccessLogError? = null,
    val requestId: String = "",
)

sealed interface AccessLogUiAction {
    data object Retry : AccessLogUiAction
    data object Refresh : AccessLogUiAction
}

sealed interface AccessLogUiEffect {
    data object RefreshConfirmed : AccessLogUiEffect
}

class AccessLogViewModel(
    private val repository: AccessLogRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AccessLogUiState())
    val uiState: StateFlow<AccessLogUiState> = _uiState.asStateFlow()

    private val _effects = Channel<AccessLogUiEffect>(Channel.BUFFERED)
    val effects: Flow<AccessLogUiEffect> = _effects.receiveAsFlow()

    private var loadInFlight = false

    init {
        load(initial = true)
    }

    fun onAction(action: AccessLogUiAction) {
        when (action) {
            AccessLogUiAction.Retry -> load(initial = !_uiState.value.hasLoaded)
            AccessLogUiAction.Refresh -> load(initial = false)
        }
    }

    private fun load(initial: Boolean) {
        if (loadInFlight) return
        loadInFlight = true
        _uiState.update { current ->
            current.copy(
                loadState = if (initial && !current.hasLoaded) {
                    AccessLogLoadState.Loading
                } else {
                    current.loadState
                },
                isRefreshing = !initial,
                error = null,
                requestId = "",
            )
        }

        viewModelScope.launch {
            runCatching { repository.load() }
                .onSuccess { records ->
                    loadInFlight = false
                    _uiState.update {
                        it.copy(
                            loadState = if (records.isEmpty()) {
                                AccessLogLoadState.Empty
                            } else {
                                AccessLogLoadState.Content
                            },
                            records = records,
                            hasLoaded = true,
                            isRefreshing = false,
                            isStale = false,
                            error = null,
                            requestId = "",
                        )
                    }
                    if (!initial) {
                        _effects.send(AccessLogUiEffect.RefreshConfirmed)
                    }
                }
                .onFailure { error ->
                    loadInFlight = false
                    _uiState.update { current ->
                        if (current.hasLoaded) {
                            current.copy(
                                isRefreshing = false,
                                isStale = true,
                                error = accessLogError(error),
                                requestId = accessLogRequestId(error),
                            )
                        } else {
                            current.copy(
                                loadState = accessLogFailureState(error),
                                isRefreshing = false,
                                isStale = false,
                                error = accessLogError(error),
                                requestId = accessLogRequestId(error),
                            )
                        }
                    }
                }
        }
    }
}

class AccessLogViewModelFactory(
    private val repository: AccessLogRepository =
        ApiAccessLogRepository(SmartHealthRepository.api),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(AccessLogViewModel::class.java))
        return AccessLogViewModel(repository) as T
    }
}

private fun accessLogFailureState(error: Throwable): AccessLogLoadState = when {
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        AccessLogLoadState.PermissionDenied
    error is SmartHealthApiException -> AccessLogLoadState.Error
    error is IOException -> AccessLogLoadState.Offline
    else -> AccessLogLoadState.Error
}

private fun accessLogError(error: Throwable): AccessLogError = when {
    error is SmartHealthApiException && error.statusCode in setOf(401, 403) ->
        AccessLogError.PermissionDenied
    error is SmartHealthApiException -> AccessLogError.Unknown
    error is IOException -> AccessLogError.Offline
    else -> AccessLogError.Unknown
}

private fun accessLogRequestId(error: Throwable): String =
    (error as? SmartHealthApiException)?.requestId.orEmpty()
