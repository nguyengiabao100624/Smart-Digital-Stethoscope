package com.example.smart_health_android.ai

import com.example.smart_health_android.R
import com.example.smart_health_android.data.AiChatAvailability
import com.example.smart_health_android.data.AiChatMessage
import com.example.smart_health_android.data.AiChatSession
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

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun emptyBackendHistoryStaysEmptyWithoutSeededConversation() = runTest(dispatcher) {
        val viewModel = AiChatViewModel(
            repository = FakeAiChatRepository(
                loadedSession = session(available = true, messages = emptyList()),
            ),
        )

        advanceUntilIdle()

        assertEquals(AiChatLoadState.Empty, viewModel.uiState.value.loadState)
        assertTrue(viewModel.uiState.value.messages.isEmpty())
    }

    @Test
    fun missingProviderShowsUnavailableAndDoesNotSend() = runTest(dispatcher) {
        val repository = FakeAiChatRepository(
            loadedSession = session(available = false, messages = emptyList()),
        )
        val viewModel = AiChatViewModel(repository = repository)
        advanceUntilIdle()

        viewModel.onAction(AiChatUiAction.InputChanged("Hãy chẩn đoán"))
        viewModel.onAction(AiChatUiAction.Send)
        advanceUntilIdle()

        assertEquals(AiChatLoadState.Unavailable, viewModel.uiState.value.loadState)
        assertEquals(0, repository.sendCalls)
    }

    @Test
    fun failedSendDoesNotAppendAnOptimisticLocalMessage() = runTest(dispatcher) {
        val remoteMessage = message("remote-1", "assistant", "Kết quả đã lưu")
        val repository = FakeAiChatRepository(
            loadedSession = session(available = true, messages = listOf(remoteMessage)),
            sendFailure = IllegalStateException("provider timeout"),
        )
        val viewModel = AiChatViewModel(repository = repository)
        advanceUntilIdle()

        viewModel.onAction(AiChatUiAction.InputChanged("Câu hỏi chưa được xác nhận"))
        viewModel.onAction(AiChatUiAction.Send)
        advanceUntilIdle()

        assertEquals(listOf(remoteMessage), viewModel.uiState.value.messages)
        assertEquals("Câu hỏi chưa được xác nhận", viewModel.uiState.value.input)
        assertEquals("provider timeout", viewModel.uiState.value.errorMessage)
    }

    @Test
    fun successfulSendReplacesTimelineWithBackendConfirmedMessages() = runTest(dispatcher) {
        val user = message("server-user", "user", "Tín hiệu bị nhiễu")
        val assistant = message("server-assistant", "assistant", "Hãy đo lại")
        val repository = FakeAiChatRepository(
            loadedSession = session(available = true, messages = emptyList()),
            sentSession = session(available = true, messages = listOf(user, assistant)),
        )
        val viewModel = AiChatViewModel(
            repository = repository,
            idempotencyKeyFactory = { "ai-key-1" },
        )
        advanceUntilIdle()

        viewModel.onAction(AiChatUiAction.InputChanged("Tín hiệu bị nhiễu"))
        viewModel.onAction(AiChatUiAction.Send)
        viewModel.onAction(AiChatUiAction.Send)
        advanceUntilIdle()

        assertEquals(1, repository.sendCalls)
        assertEquals("ai-key-1", repository.lastIdempotencyKey)
        assertEquals(listOf(user, assistant), viewModel.uiState.value.messages)
        assertEquals(AiChatLoadState.Ready, viewModel.uiState.value.loadState)
        assertTrue(viewModel.uiState.value.input.isEmpty())
        assertFalse(viewModel.uiState.value.isSending)
    }

    @Test
    fun loadFailureHasExplicitRetryState() = runTest(dispatcher) {
        val repository = FakeAiChatRepository(loadFailure = IllegalStateException("offline"))
        val viewModel = AiChatViewModel(repository = repository)
        advanceUntilIdle()

        assertEquals(AiChatLoadState.Error, viewModel.uiState.value.loadState)
        assertEquals("offline", viewModel.uiState.value.errorMessage)

        repository.loadFailure = null
        repository.loadedSession = session(available = true, messages = emptyList())
        viewModel.onAction(AiChatUiAction.Retry)
        advanceUntilIdle()

        assertEquals(AiChatLoadState.Empty, viewModel.uiState.value.loadState)
        assertEquals(R.string.ai_assistant_empty_message, viewModel.uiState.value.emptyMessageRes)
    }
}

private class FakeAiChatRepository(
    var loadedSession: AiChatSession = session(available = true, messages = emptyList()),
    private val sentSession: AiChatSession = loadedSession,
    var loadFailure: Throwable? = null,
    private val sendFailure: Throwable? = null,
) : AiChatRepository {
    var sendCalls = 0
    var lastIdempotencyKey = ""

    override suspend fun load(): AiChatSession = loadFailure?.let { throw it } ?: loadedSession

    override suspend fun send(message: String, idempotencyKey: String): AiChatSession {
        sendCalls += 1
        lastIdempotencyKey = idempotencyKey
        sendFailure?.let { throw it }
        return sentSession
    }
}

private fun session(available: Boolean, messages: List<AiChatMessage>) = AiChatSession(
    messages = messages,
    availability = AiChatAvailability(
        available = available,
        provider = if (available) "configured" else "none",
        reason = if (available) "" else "AI_PROVIDER_UNAVAILABLE",
    ),
)

private fun message(id: String, role: String, content: String) = AiChatMessage(
    id = id,
    role = role,
    content = content,
    createdAt = "2026-07-14T00:00:00.000Z",
)
