package com.example.smart_health_android.ai

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.SignalAnalysisStatus
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class SignalAnalysisLoadState {
    Loading,
    Ready,
    Offline,
    PermissionDenied,
    Error,
}

data class SignalAnalysisUiState(
    val loadState: SignalAnalysisLoadState = SignalAnalysisLoadState.Loading,
    val status: SignalAnalysisStatus? = null,
    val errorMessage: String = "",
    val requestId: String = "",
)

sealed interface SignalAnalysisUiAction {
    data object Retry : SignalAnalysisUiAction
}

interface SignalAnalysisRepository {
    suspend fun loadStatus(): SignalAnalysisStatus
}

class ApiSignalAnalysisRepository : SignalAnalysisRepository {
    override suspend fun loadStatus(): SignalAnalysisStatus =
        SmartHealthRepository.api.getSignalAnalysisStatus()
}

class SignalAnalysisViewModel(
    private val repository: SignalAnalysisRepository = ApiSignalAnalysisRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(SignalAnalysisUiState())
    val uiState = _uiState.asStateFlow()
    private var requestInFlight = false

    init {
        refresh()
    }

    fun onAction(action: SignalAnalysisUiAction) {
        when (action) {
            SignalAnalysisUiAction.Retry -> refresh()
        }
    }

    private fun refresh() {
        if (requestInFlight) return
        requestInFlight = true
        _uiState.update {
            it.copy(
                loadState = SignalAnalysisLoadState.Loading,
                status = null,
                errorMessage = "",
                requestId = "",
            )
        }
        viewModelScope.launch {
            try {
                val status = repository.loadStatus()
                _uiState.update {
                    SignalAnalysisUiState(
                        loadState = SignalAnalysisLoadState.Ready,
                        status = status,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                val apiError = error as? SmartHealthApiException
                _uiState.update {
                    SignalAnalysisUiState(
                        loadState = error.toSignalAnalysisLoadState(),
                        errorMessage = error.message.orEmpty(),
                        requestId = apiError?.requestId.orEmpty(),
                    )
                }
            } finally {
                requestInFlight = false
            }
        }
    }
}

private fun Throwable.toSignalAnalysisLoadState(): SignalAnalysisLoadState {
    val apiError = this as? SmartHealthApiException
    return when {
        apiError?.statusCode == 401 || apiError?.statusCode == 403 -> {
            SignalAnalysisLoadState.PermissionDenied
        }

        apiError?.statusCode == 0 || apiError?.code in SignalAnalysisNetworkFailureCodes -> {
            SignalAnalysisLoadState.Offline
        }

        apiError == null && this is IOException -> SignalAnalysisLoadState.Offline
        else -> SignalAnalysisLoadState.Error
    }
}

private val SignalAnalysisNetworkFailureCodes = setOf(
    "NETWORK_ERROR",
    "NETWORK_UNAVAILABLE",
    "OFFLINE",
    "REQUEST_TIMEOUT",
)
