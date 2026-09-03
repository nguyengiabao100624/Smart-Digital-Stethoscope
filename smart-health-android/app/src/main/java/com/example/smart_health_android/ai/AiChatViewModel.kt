package com.example.smart_health_android.ai

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.R
import com.example.smart_health_android.data.AiChatAttachment
import com.example.smart_health_android.data.AiChatAvailability
import com.example.smart_health_android.data.AiChatMessage
import com.example.smart_health_android.data.AiChatSession
import com.example.smart_health_android.data.AiConversation
import com.example.smart_health_android.data.AiConversationList
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AiChatLoadState { Loading, Empty, Ready, Unavailable, Error }

data class LocalAiAttachment(
    val name: String,
    val contentType: String,
    val bytes: ByteArray,
)

data class AiChatUiState(
    val loadState: AiChatLoadState = AiChatLoadState.Loading,
    val conversations: List<AiConversation> = emptyList(),
    val currentConversation: AiConversation? = null,
    val messages: List<AiChatMessage> = emptyList(),
    val attachments: List<AiChatAttachment> = emptyList(),
    val selectedAttachmentIds: Set<String> = emptySet(),
    val input: String = "",
    val isSending: Boolean = false,
    val isUploading: Boolean = false,
    val isHistoryVisible: Boolean = false,
    val errorMessage: String = "",
    val errorMessageRes: Int? = null,
    val emptyMessageRes: Int = R.string.ai_assistant_empty_message,
    val requestId: String = "",
    val availability: AiChatAvailability = AiChatAvailability(available = false, reason = "loading"),
)

sealed interface AiChatUiAction {
    data class InputChanged(val value: String) : AiChatUiAction
    data class SelectConversation(val conversationId: String) : AiChatUiAction
    data class AttachmentSelected(val attachment: LocalAiAttachment) : AiChatUiAction
    data class RemoveAttachment(val attachmentId: String) : AiChatUiAction
    data object NewConversation : AiChatUiAction
    data object ToggleHistory : AiChatUiAction
    data object Send : AiChatUiAction
    data object Retry : AiChatUiAction
    data object DismissError : AiChatUiAction
}

interface AiChatRepository {
    suspend fun listConversations(): AiConversationList
    suspend fun createConversation(): AiConversation
    suspend fun load(conversationId: String): AiChatSession
    suspend fun send(
        conversationId: String,
        message: String,
        attachmentIds: List<String>,
        idempotencyKey: String,
    ): AiChatSession
    suspend fun upload(conversationId: String, attachment: LocalAiAttachment): AiChatAttachment
}

class ApiAiChatRepository : AiChatRepository {
    override suspend fun listConversations(): AiConversationList = SmartHealthRepository.api.listAiConversations()
    override suspend fun createConversation(): AiConversation = SmartHealthRepository.api.createAiConversation()
    override suspend fun load(conversationId: String): AiChatSession =
        SmartHealthRepository.api.getAiConversationSession(conversationId)

    override suspend fun send(
        conversationId: String,
        message: String,
        attachmentIds: List<String>,
        idempotencyKey: String,
    ): AiChatSession = SmartHealthRepository.api.sendAiConversationMessage(
        conversationId = conversationId,
        message = message,
        attachmentIds = attachmentIds,
        idempotencyKey = idempotencyKey,
    )

    override suspend fun upload(
        conversationId: String,
        attachment: LocalAiAttachment,
    ): AiChatAttachment = SmartHealthRepository.api.uploadAiAttachment(
        conversationId = conversationId,
        fileName = attachment.name,
        contentType = attachment.contentType,
        bytes = attachment.bytes,
    )
}

class AiChatViewModel(
    private val repository: AiChatRepository = ApiAiChatRepository(),
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(AiChatUiState())
    val uiState = _uiState.asStateFlow()
    private var pendingIdempotencyKey = ""

    init { refresh() }

    fun onAction(action: AiChatUiAction) {
        when (action) {
            is AiChatUiAction.InputChanged -> updateInput(action.value)
            is AiChatUiAction.SelectConversation -> selectConversation(action.conversationId)
            is AiChatUiAction.AttachmentSelected -> uploadAttachment(action.attachment)
            is AiChatUiAction.RemoveAttachment -> _uiState.update {
                it.copy(selectedAttachmentIds = it.selectedAttachmentIds - action.attachmentId)
            }
            AiChatUiAction.NewConversation -> _uiState.update {
                it.copy(
                    currentConversation = null,
                    messages = emptyList(),
                    attachments = emptyList(),
                    selectedAttachmentIds = emptySet(),
                    input = "",
                    loadState = if (it.availability.available) AiChatLoadState.Empty else AiChatLoadState.Unavailable,
                    isHistoryVisible = false,
                )
            }
            AiChatUiAction.ToggleHistory -> _uiState.update { it.copy(isHistoryVisible = !it.isHistoryVisible) }
            AiChatUiAction.Send -> send()
            AiChatUiAction.Retry -> refresh()
            AiChatUiAction.DismissError -> clearError()
        }
    }

    private fun updateInput(value: String) {
        if (_uiState.value.isSending) return
        if (value != _uiState.value.input) pendingIdempotencyKey = ""
        _uiState.update {
            it.copy(input = value.take(4000), errorMessage = "", errorMessageRes = null, requestId = "")
        }
    }

    private fun refresh() {
        if (_uiState.value.isSending || _uiState.value.isUploading) return
        _uiState.update { it.copy(loadState = AiChatLoadState.Loading, errorMessage = "", requestId = "") }
        viewModelScope.launch {
            runCatching { repository.listConversations() }
                .onSuccess { overview ->
                    val first = overview.conversations.firstOrNull()
                    _uiState.update {
                        it.copy(
                            conversations = overview.conversations,
                            availability = overview.availability,
                            loadState = when {
                                !overview.availability.available -> AiChatLoadState.Unavailable
                                first == null -> AiChatLoadState.Empty
                                else -> AiChatLoadState.Loading
                            },
                        )
                    }
                    if (first != null) loadConversation(first.id)
                }
                .onFailure(::applyFailure)
        }
    }

    private fun selectConversation(conversationId: String) {
        if (_uiState.value.isSending || _uiState.value.isUploading) return
        _uiState.update { it.copy(isHistoryVisible = false, loadState = AiChatLoadState.Loading) }
        viewModelScope.launch { loadConversation(conversationId) }
    }

    private suspend fun loadConversation(conversationId: String) {
        runCatching { repository.load(conversationId) }
            .onSuccess(::applySession)
            .onFailure(::applyFailure)
    }

    private suspend fun ensureConversation(): AiConversation {
        _uiState.value.currentConversation?.let { return it }
        val created = repository.createConversation()
        _uiState.update {
            it.copy(
                currentConversation = created,
                conversations = listOf(created) + it.conversations.filterNot { item -> item.id == created.id },
            )
        }
        return created
    }

    private fun uploadAttachment(attachment: LocalAiAttachment) {
        val state = _uiState.value
        if (state.isUploading || state.isSending || attachment.bytes.isEmpty() || attachment.bytes.size > 10 * 1024 * 1024) return
        _uiState.update { it.copy(isUploading = true, errorMessage = "", requestId = "") }
        viewModelScope.launch {
            runCatching {
                val conversation = ensureConversation()
                repository.upload(conversation.id, attachment)
            }.onSuccess { uploaded ->
                _uiState.update {
                    it.copy(
                        attachments = it.attachments + uploaded,
                        selectedAttachmentIds = it.selectedAttachmentIds + uploaded.id,
                        isUploading = false,
                    )
                }
            }.onFailure(::applyFailureKeepingContent)
        }
    }

    private fun send() {
        val state = _uiState.value
        val content = state.input.trim()
        if (content.isBlank() || state.isSending || state.isUploading || !state.availability.available) return
        val idempotencyKey = pendingIdempotencyKey.ifBlank(idempotencyKeyFactory)
        pendingIdempotencyKey = idempotencyKey
        _uiState.update { it.copy(isSending = true, errorMessage = "", requestId = "") }
        viewModelScope.launch {
            runCatching {
                val conversation = ensureConversation()
                repository.send(
                    conversationId = conversation.id,
                    message = content,
                    attachmentIds = state.selectedAttachmentIds.toList(),
                    idempotencyKey = idempotencyKey,
                )
            }.onSuccess { session ->
                pendingIdempotencyKey = ""
                applySession(session, clearInput = true)
            }.onFailure(::applyFailureKeepingContent)
        }
    }

    private fun applySession(session: AiChatSession, clearInput: Boolean = false) {
        val messages = session.messages.filter { it.id.isNotBlank() && it.content.isNotBlank() && it.role in setOf("user", "assistant") }
        val conversation = session.conversation ?: _uiState.value.currentConversation
        _uiState.update {
            it.copy(
                loadState = when {
                    !session.availability.available -> AiChatLoadState.Unavailable
                    messages.isEmpty() -> AiChatLoadState.Empty
                    else -> AiChatLoadState.Ready
                },
                currentConversation = conversation,
                conversations = conversation?.let { current ->
                    listOf(current) + it.conversations.filterNot { item -> item.id == current.id }
                } ?: it.conversations,
                messages = messages,
                attachments = session.attachments.ifEmpty { it.attachments },
                availability = session.availability,
                selectedAttachmentIds = if (clearInput) emptySet() else it.selectedAttachmentIds,
                input = if (clearInput) "" else it.input,
                isSending = false,
                isUploading = false,
                errorMessage = "",
                errorMessageRes = null,
                requestId = "",
            )
        }
    }

    private fun applyFailure(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        _uiState.update {
            it.copy(
                loadState = AiChatLoadState.Error,
                isSending = false,
                isUploading = false,
                errorMessage = error.message.orEmpty(),
                errorMessageRes = if (error.message == null) R.string.ai_assistant_load_error_title else null,
                requestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private fun applyFailureKeepingContent(error: Throwable) {
        val apiError = error as? SmartHealthApiException
        _uiState.update {
            it.copy(
                isSending = false,
                isUploading = false,
                errorMessage = error.message.orEmpty(),
                errorMessageRes = if (error.message == null) R.string.ai_assistant_send_error else null,
                requestId = apiError?.requestId.orEmpty(),
            )
        }
    }

    private fun clearError() {
        _uiState.update { it.copy(errorMessage = "", errorMessageRes = null, requestId = "") }
    }
}
