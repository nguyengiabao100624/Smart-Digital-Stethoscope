package com.example.smart_health_android.ai

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.R
import com.example.smart_health_android.data.AiChatMessage
import com.example.smart_health_android.data.AiChatSession
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AiChatLoadState {
    Loading,
    Empty,
    Ready,
    Unavailable,
    Error,
}

data class AiChatUiState(
    val loadState: AiChatLoadState = AiChatLoadState.Loading,
    val messages: List<AiChatMessage> = emptyList(),
    val input: String = "",
    val isSending: Boolean = false,
    val errorMessage: String = "",
    val errorMessageRes: Int? = null,
    val emptyMessageRes: Int = R.string.ai_assistant_empty_message,
    val requestId: String = "",
)

sealed interface AiChatUiAction {
    data class InputChanged(val value: String) : AiChatUiAction
    data object Send : AiChatUiAction
    data object Retry : AiChatUiAction
    data object DismissError : AiChatUiAction
}

interface AiChatRepository {
    suspend fun load(): AiChatSession
    suspend fun send(message: String, idempotencyKey: String): AiChatSession
}

class ApiAiChatRepository : AiChatRepository {
    override suspend fun load(): AiChatSession = SmartHealthRepository.api.getAiChatSession()

    override suspend fun send(message: String, idempotencyKey: String): AiChatSession =
        SmartHealthRepository.api.sendAiChatMessage(message, idempotencyKey)
}

class AiChatViewModel(
    private val repository: AiChatRepository = ApiAiChatRepository(),
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(AiChatUiState())
    val uiState = _uiState.asStateFlow()

    private var pendingIdempotencyKey = ""

    init {
        refresh()
    }

    fun onAction(action: AiChatUiAction) {
        when (action) {
            is AiChatUiAction.InputChanged -> {
                if (_uiState.value.isSending) return
                if (action.value != _uiState.value.input) pendingIdempotencyKey = ""
                _uiState.update {
                    it.copy(
                        input = action.value,
                        errorMessage = "",
                        errorMessageRes = null,
                        requestId = "",
                    )
                }
            }

            AiChatUiAction.Send -> send()
            AiChatUiAction.Retry -> refresh()
            AiChatUiAction.DismissError -> _uiState.update {
                it.copy(errorMessage = "", errorMessageRes = null, requestId = "")
            }
        }
    }

    private fun refresh() {
        if (_uiState.value.isSending) return
        _uiState.update {
            it.copy(
                loadState = AiChatLoadState.Loading,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        viewModelScope.launch {
            runCatching { repository.load() }
                .onSuccess(::applySession)
                .onFailure { error ->
                    val apiError = error as? SmartHealthApiException
                    _uiState.update {
                        it.copy(
                            loadState = AiChatLoadState.Error,
                            errorMessage = error.message.orEmpty(),
                            errorMessageRes = if (error.message == null) {
                                R.string.ai_assistant_load_error_title
                            } else {
                                null
                            },
                            requestId = apiError?.requestId.orEmpty(),
                        )
                    }
                }
        }
    }

    private fun send() {
        val state = _uiState.value
        val content = state.input.trim()
        if (
            content.isBlank() ||
            state.isSending ||
            state.loadState == AiChatLoadState.Loading ||
            state.loadState == AiChatLoadState.Error ||
            state.loadState == AiChatLoadState.Unavailable
        ) {
            return
        }

        val idempotencyKey = pendingIdempotencyKey.ifBlank(idempotencyKeyFactory)
        pendingIdempotencyKey = idempotencyKey
        _uiState.update {
            it.copy(
                isSending = true,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
        viewModelScope.launch {
            runCatching { repository.send(content, idempotencyKey) }
                .onSuccess { session ->
                    pendingIdempotencyKey = ""
                    applySession(session, clearInput = true)
                }
                .onFailure { error ->
                    val apiError = error as? SmartHealthApiException
                    _uiState.update {
                        it.copy(
                            isSending = false,
                            errorMessage = error.message.orEmpty(),
                            errorMessageRes = if (error.message == null) {
                                R.string.ai_assistant_send_error
                            } else {
                                null
                            },
                            requestId = apiError?.requestId.orEmpty(),
                        )
                    }
                }
        }
    }

    private fun applySession(session: AiChatSession, clearInput: Boolean = false) {
        val messages = session.messages.filter { message ->
            message.id.isNotBlank() &&
                message.content.isNotBlank() &&
                message.role in setOf("user", "assistant")
        }
        val loadState = when {
            !session.availability.available -> AiChatLoadState.Unavailable
            messages.isEmpty() -> AiChatLoadState.Empty
            else -> AiChatLoadState.Ready
        }
        _uiState.update {
            it.copy(
                loadState = loadState,
                messages = messages,
                input = if (clearInput) "" else it.input,
                isSending = false,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
    }
}
