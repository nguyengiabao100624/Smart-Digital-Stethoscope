package com.example.smart_health_android.ai

import com.example.smart_health_android.data.AiChatAttachment
import com.example.smart_health_android.data.AiChatAvailability
import com.example.smart_health_android.data.AiChatMessage
import com.example.smart_health_android.data.AiChatSession
import com.example.smart_health_android.data.AiConversation
import com.example.smart_health_android.data.AiConversationList
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AiChatViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)
    @After fun tearDown() = Dispatchers.resetMain()

    @Test
    fun emptyBackendHistoryStaysEmptyWithoutSeededConversation() = runTest(dispatcher) {
        val viewModel = AiChatViewModel(repository = FakeAiChatRepository())
        advanceUntilIdle()
        assertEquals(AiChatLoadState.Empty, viewModel.uiState.value.loadState)
        assertTrue(viewModel.uiState.value.messages.isEmpty())
        assertEquals(0, (viewModel.uiState.value.conversations).size)
    }

    @Test
    fun missingProviderShowsUnavailableAndDoesNotCreateOrSend() = runTest(dispatcher) {
        val repository = FakeAiChatRepository(available = false)
        val viewModel = AiChatViewModel(repository = repository)
        advanceUntilIdle()
        viewModel.onAction(AiChatUiAction.InputChanged("Hãy chẩn đoán"))
        viewModel.onAction(AiChatUiAction.Send)
        advanceUntilIdle()
        assertEquals(AiChatLoadState.Unavailable, viewModel.uiState.value.loadState)
        assertEquals(0, repository.createCalls)
        assertEquals(0, repository.sendCalls)
    }

    @Test
    fun existingConversationLoadsBackendConfirmedTimeline() = runTest(dispatcher) {
        val conversation = conversation("conv-1", "Lượt đo tim")
        val messages = listOf(message("m1", "assistant", "Kết quả đã lưu"))
        val repository = FakeAiChatRepository(conversations = mutableListOf(conversation), sessions = mutableMapOf(conversation.id to session(conversation, messages)))
        val viewModel = AiChatViewModel(repository = repository)
        advanceUntilIdle()
        assertEquals(conversation, viewModel.uiState.value.currentConversation)
        assertEquals(messages, viewModel.uiState.value.messages)
        assertEquals(AiChatLoadState.Ready, viewModel.uiState.value.loadState)
    }

    @Test
    fun failedSendKeepsDraftAndDoesNotAppendOptimisticMessage() = runTest(dispatcher) {
        val conversation = conversation("conv-1", "Lượt đo tim")
        val remote = message("m1", "assistant", "Kết quả đã lưu")
        val repository = FakeAiChatRepository(
            conversations = mutableListOf(conversation),
            sessions = mutableMapOf(conversation.id to session(conversation, listOf(remote))),
            sendFailure = IllegalStateException("provider timeout"),
        )
        val viewModel = AiChatViewModel(repository = repository)
        advanceUntilIdle()
        viewModel.onAction(AiChatUiAction.InputChanged("Câu hỏi chưa được xác nhận"))
        viewModel.onAction(AiChatUiAction.Send)
        advanceUntilIdle()
        assertEquals(listOf(remote), viewModel.uiState.value.messages)
        assertEquals("Câu hỏi chưa được xác nhận", viewModel.uiState.value.input)
        assertEquals("provider timeout", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun firstSuccessfulSendCreatesConversationOnceAndUsesIdempotency() = runTest(dispatcher) {
        val created = conversation("conv-new", "Cuộc trò chuyện mới")
        val confirmed = session(
            created.copy(title = "Tín hiệu bị nhiễu"),
            listOf(message("u1", "user", "Tín hiệu bị nhiễu"), message("a1", "assistant", "Hãy đo lại")),
        )
        val repository = FakeAiChatRepository(createdConversation = created, sentSession = confirmed)
        val viewModel = AiChatViewModel(repository = repository, idempotencyKeyFactory = { "ai-key-1" })
        advanceUntilIdle()
        viewModel.onAction(AiChatUiAction.InputChanged("Tín hiệu bị nhiễu"))
        viewModel.onAction(AiChatUiAction.Send)
        viewModel.onAction(AiChatUiAction.Send)
        advanceUntilIdle()
        assertEquals(1, repository.createCalls)
        assertEquals(1, repository.sendCalls)
        assertEquals("ai-key-1", repository.lastIdempotencyKey)
        assertEquals(confirmed.messages, viewModel.uiState.value.messages)
        assertTrue(viewModel.uiState.value.input.isEmpty())
        assertFalse(viewModel.uiState.value.isSending)
    }

    @Test
    fun attachmentUploadCreatesConversationAndSelectsConfirmedAttachment() = runTest(dispatcher) {
        val repository = FakeAiChatRepository()
        val viewModel = AiChatViewModel(repository = repository)
        advanceUntilIdle()
        viewModel.onAction(AiChatUiAction.AttachmentSelected(LocalAiAttachment("ket-qua.pdf", "application/pdf", byteArrayOf(1, 2))))
        advanceUntilIdle()
        assertEquals(1, repository.createCalls)
        assertEquals(setOf("att-1"), viewModel.uiState.value.selectedAttachmentIds)
        assertEquals("ket-qua.pdf", viewModel.uiState.value.attachments.single().name)
    }
}

private class FakeAiChatRepository(
    private val available: Boolean = true,
    val conversations: MutableList<AiConversation> = mutableListOf(),
    val sessions: MutableMap<String, AiChatSession> = mutableMapOf(),
    private val createdConversation: AiConversation = conversation("conv-created", "Cuộc trò chuyện mới"),
    private val sentSession: AiChatSession? = null,
    private val sendFailure: Throwable? = null,
) : AiChatRepository {
    var createCalls = 0
    var sendCalls = 0
    var lastIdempotencyKey = ""

    override suspend fun listConversations() = AiConversationList(conversations, availability())
    override suspend fun createConversation(): AiConversation {
        createCalls += 1
        conversations.add(0, createdConversation)
        return createdConversation
    }
    override suspend fun load(conversationId: String): AiChatSession =
        sessions[conversationId] ?: session(conversations.first { it.id == conversationId }, emptyList())

    override suspend fun send(conversationId: String, message: String, attachmentIds: List<String>, idempotencyKey: String): AiChatSession {
        sendCalls += 1
        lastIdempotencyKey = idempotencyKey
        sendFailure?.let { throw it }
        return sentSession ?: session(conversations.first { it.id == conversationId }, emptyList())
    }

    override suspend fun upload(conversationId: String, attachment: LocalAiAttachment) = AiChatAttachment(
        id = "att-1",
        conversationId = conversationId,
        name = attachment.name,
        contentType = attachment.contentType,
        byteSize = attachment.bytes.size.toLong(),
    )

    private fun availability() = AiChatAvailability(available, if (available) "configured" else "none", if (available) "" else "not_configured")
}

private fun conversation(id: String, title: String) = AiConversation(id = id, title = title, updatedAt = "2026-09-03T00:00:00Z")
private fun session(conversation: AiConversation, messages: List<AiChatMessage>) = AiChatSession(messages, AiChatAvailability(true, "configured"), conversation)
private fun message(id: String, role: String, content: String) = AiChatMessage(id, role, content, createdAt = "2026-09-03T00:00:00Z")
