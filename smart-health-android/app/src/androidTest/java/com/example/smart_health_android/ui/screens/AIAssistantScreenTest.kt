package com.example.smart_health_android.ui.screens

import android.os.Build
import android.view.WindowManager
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.ai.AiChatRepository
import com.example.smart_health_android.ai.AiChatViewModel
import com.example.smart_health_android.ai.LocalAiAttachment
import com.example.smart_health_android.data.AiChatAttachment
import com.example.smart_health_android.data.AiChatAvailability
import com.example.smart_health_android.data.AiChatSession
import com.example.smart_health_android.data.AiConversation
import com.example.smart_health_android.data.AiConversationList
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AIAssistantScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<DevicePairingComposeTestActivity>()

    @Before
    fun preparePhysicalDeviceUi() {
        composeRule.activity.runOnUiThread {
            composeRule.activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                composeRule.activity.setShowWhenLocked(true)
                composeRule.activity.setTurnScreenOn(true)
            } else {
                @Suppress("DEPRECATION")
                composeRule.activity.window.addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
                )
            }
        }
    }

    @Test
    fun patientAndDoctorComposerRemainsUsableAtTwoHundredPercentFontScale() {
        val viewModel = AiChatViewModel(EmptyAvailableRepository)

        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
                ShcareMobileTheme(mode = ShcareThemeMode.Dark, useDynamicColor = false) {
                    AIAssistantScreen(onNavigateBack = {}, viewModel = viewModel)
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.availability.available
        }
        composeRule.onNodeWithTag("ai_assistant.empty").assertIsDisplayed()
        composeRule.onNodeWithTag("ai_assistant.composer").assertIsDisplayed()
        composeRule.onNodeWithTag("ai_assistant.input").assertIsDisplayed()
        composeRule.onNodeWithTag("ai_assistant.send", useUnmergedTree = true)
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("ai_assistant.history", useUnmergedTree = true)
            .assertIsDisplayed()
    }

    @Test
    fun historyArchivesOnlyAfterExplicitConfirmation() {
        val repository = HistoryRepository()
        val viewModel = AiChatViewModel(repository)

        composeRule.setContent {
            ShcareMobileTheme(mode = ShcareThemeMode.System, useDynamicColor = false) {
                AIAssistantScreen(onNavigateBack = {}, viewModel = viewModel)
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.currentConversation?.id == HistoryRepository.CONVERSATION_ID
        }
        composeRule.onNodeWithTag("ai_assistant.history", useUnmergedTree = true).performClick()
        composeRule.onNodeWithTag(
            "ai_assistant.archive.${HistoryRepository.CONVERSATION_ID}",
            useUnmergedTree = true,
        ).performClick()
        composeRule.onNodeWithText("Lưu trữ cuộc trò chuyện?").assertIsDisplayed()
        composeRule.onNodeWithText("Lưu trữ").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            repository.archivedIds == listOf(HistoryRepository.CONVERSATION_ID) &&
                viewModel.uiState.value.conversations.isEmpty()
        }
    }

    private object EmptyAvailableRepository : AiChatRepository {
        private val availability = AiChatAvailability(
            available = true,
            provider = "test-provider",
        )

        override suspend fun listConversations(): AiConversationList =
            AiConversationList(emptyList(), availability)

        override suspend fun createConversation(): AiConversation =
            AiConversation(id = "conversation-1", title = "Cuộc trò chuyện mới")

        override suspend fun load(conversationId: String): AiChatSession =
            AiChatSession(emptyList(), availability)

        override suspend fun archive(conversationId: String): AiConversation =
            AiConversation(id = conversationId, title = "Đã lưu trữ", archivedAt = "2026-09-04T00:00:00Z")

        override suspend fun send(
            conversationId: String,
            message: String,
            attachmentIds: List<String>,
            idempotencyKey: String,
        ): AiChatSession = AiChatSession(emptyList(), availability)

        override suspend fun upload(
            conversationId: String,
            attachment: LocalAiAttachment,
        ): AiChatAttachment = AiChatAttachment(
            id = "attachment-1",
            conversationId = conversationId,
            name = attachment.name,
            contentType = attachment.contentType,
            byteSize = attachment.bytes.size.toLong(),
        )
    }

    private class HistoryRepository : AiChatRepository {
        val archivedIds = mutableListOf<String>()
        private val availability = AiChatAvailability(available = true, provider = "test-provider")
        private val conversation = AiConversation(
            id = CONVERSATION_ID,
            title = "Kết quả tim gần nhất",
            updatedAt = "2026-09-04T00:00:00Z",
        )

        override suspend fun listConversations(): AiConversationList =
            AiConversationList(listOf(conversation), availability)

        override suspend fun createConversation(): AiConversation = conversation

        override suspend fun load(conversationId: String): AiChatSession =
            AiChatSession(emptyList(), availability, conversation)

        override suspend fun archive(conversationId: String): AiConversation {
            archivedIds += conversationId
            return conversation.copy(archivedAt = "2026-09-04T00:00:00Z")
        }

        override suspend fun send(
            conversationId: String,
            message: String,
            attachmentIds: List<String>,
            idempotencyKey: String,
        ): AiChatSession = AiChatSession(emptyList(), availability, conversation)

        override suspend fun upload(
            conversationId: String,
            attachment: LocalAiAttachment,
        ): AiChatAttachment = AiChatAttachment(
            id = "attachment-history",
            conversationId = conversationId,
            name = attachment.name,
            contentType = attachment.contentType,
            byteSize = attachment.bytes.size.toLong(),
        )

        companion object {
            const val CONVERSATION_ID = "conversation-history"
        }
    }
}
