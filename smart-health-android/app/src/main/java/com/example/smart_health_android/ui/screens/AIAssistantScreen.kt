package com.example.smart_health_android.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.ai.AiChatLoadState
import com.example.smart_health_android.ai.AiChatUiAction
import com.example.smart_health_android.ai.AiChatUiState
import com.example.smart_health_android.ai.AiChatViewModel
import com.example.smart_health_android.ai.AndroidSpeechTranscriber
import com.example.smart_health_android.ai.LocalAiAttachment
import com.example.smart_health_android.ai.SpeechTranscriberListener
import com.example.smart_health_android.data.AiChatMessage
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val AI_ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024

private fun InputStream.readAiAttachmentBytes(): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8 * 1024)
    var total = 0
    while (true) {
        val read = read(buffer)
        if (read < 0) break
        total += read
        require(total <= AI_ATTACHMENT_LIMIT_BYTES) { "Tệp vượt quá giới hạn 10 MB" }
        output.write(buffer, 0, read)
    }
    return output.toByteArray()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIAssistantScreen(
    onNavigateBack: () -> Unit,
    viewModel: AiChatViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isRecording by remember { mutableStateOf(false) }
    var voiceStatus by remember { mutableStateOf("") }
    val amplitudes = remember { mutableStateListOf<Int>().apply { repeat(28) { add(4) } } }
    val currentInput by rememberUpdatedState(state.input)
    val currentAction by rememberUpdatedState(viewModel::onAction)

    val speechTranscriber = remember(context) {
        AndroidSpeechTranscriber(context, object : SpeechTranscriberListener {
            override fun onReady() {
                isRecording = true
                voiceStatus = "Đang nghe…"
            }
            override fun onAmplitude(level: Int) {
                amplitudes.removeAt(0)
                amplitudes.add(level)
            }
            override fun onPartialTranscript(text: String) { voiceStatus = text }
            override fun onFinalTranscript(text: String) {
                val combined = listOf(currentInput.trim(), text.trim()).filter(String::isNotBlank).joinToString(" ")
                currentAction(AiChatUiAction.InputChanged(combined))
                voiceStatus = "Đã chuyển thành văn bản. Hãy kiểm tra trước khi gửi."
            }
            override fun onStopped() { isRecording = false }
            override fun onError(message: String) {
                isRecording = false
                voiceStatus = message
            }
        })
    }
    DisposableEffect(speechTranscriber) { onDispose { speechTranscriber.destroy() } }

    val microphonePermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) speechTranscriber.start() else voiceStatus = "Cần quyền micro để chuyển giọng nói thành văn bản."
    }
    fun startVoiceInput() {
        voiceStatus = "Đang chuẩn bị micro…"
        amplitudes.indices.forEach { index -> amplitudes[index] = 4 }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            speechTranscriber.start()
        } else microphonePermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    val attachmentPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val resolver = context.contentResolver
                    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) cursor.getString(0) else null
                    }.orEmpty().ifBlank { "tai-lieu" }
                    val contentType = resolver.getType(uri).orEmpty().ifBlank { "application/octet-stream" }
                    val bytes = resolver.openInputStream(uri)?.use(InputStream::readAiAttachmentBytes)
                        ?: error("Không đọc được tệp đã chọn")
                    require(bytes.size <= AI_ATTACHMENT_LIMIT_BYTES) { "Tệp vượt quá giới hạn 10 MB" }
                    LocalAiAttachment(name = name, contentType = contentType, bytes = bytes)
                }
            }.onSuccess { currentAction(AiChatUiAction.AttachmentSelected(it)) }
                .onFailure { voiceStatus = it.message.orEmpty() }
        }
    }

    if (state.isHistoryVisible) {
        ModalBottomSheet(onDismissRequest = { viewModel.onAction(AiChatUiAction.ToggleHistory) }) {
            ConversationHistory(state = state, onAction = viewModel::onAction)
        }
    }

    val inputEnabled = state.availability.available && state.loadState !in setOf(AiChatLoadState.Loading, AiChatLoadState.Error)
    Scaffold(
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.ai_assistant_title),
                subtitle = state.currentConversation?.title,
                onNavigateBack = onNavigateBack,
                backContentDescription = stringResource(R.string.ai_assistant_back),
                actions = {
                    IconButton(
                        onClick = { viewModel.onAction(AiChatUiAction.NewConversation) },
                        modifier = Modifier.testTag("ai_assistant.new_conversation"),
                    ) { Icon(Icons.Default.Add, contentDescription = "Cuộc trò chuyện mới") }
                    IconButton(
                        onClick = { viewModel.onAction(AiChatUiAction.ToggleHistory) },
                        modifier = Modifier.testTag("ai_assistant.history"),
                    ) { Icon(Icons.Default.History, contentDescription = "Lịch sử trò chuyện") }
                },
            )
        },
        bottomBar = {
            if (inputEnabled) {
                AiChatComposer(
                    state = state,
                    isRecording = isRecording,
                    voiceStatus = voiceStatus,
                    amplitudes = amplitudes,
                    onAttach = { attachmentPicker.launch(arrayOf("image/*", "application/pdf", "text/plain", "audio/*")) },
                    onVoice = {
                        if (isRecording) {
                            voiceStatus = "Đang hoàn tất nhận dạng…"
                            speechTranscriber.stop()
                        } else startVoiceInput()
                    },
                    onAction = viewModel::onAction,
                )
            }
        },
    ) { innerPadding ->
        Box(Modifier.fillMaxSize().padding(innerPadding)) {
            when (state.loadState) {
                AiChatLoadState.Loading -> ShcareLoadingState(Modifier.fillMaxSize())
                AiChatLoadState.Error -> AiChatLoadError(state.requestId) { viewModel.onAction(AiChatUiAction.Retry) }
                AiChatLoadState.Empty -> AiChatEmptyContent()
                AiChatLoadState.Unavailable -> if (state.messages.isEmpty()) {
                    ShcareEmptyState(
                        title = stringResource(R.string.ai_assistant_unavailable_title),
                        message = stringResource(R.string.ai_assistant_unavailable_message),
                        actionLabel = stringResource(R.string.shcare_action_retry),
                        onAction = { viewModel.onAction(AiChatUiAction.Retry) },
                        modifier = Modifier.fillMaxSize().testTag("ai_assistant.unavailable"),
                    )
                } else AiChatTimeline(state.messages, providerUnavailable = true)
                AiChatLoadState.Ready -> AiChatTimeline(state.messages, providerUnavailable = false)
            }
        }
    }
}

@Composable
private fun ConversationHistory(state: AiChatUiState, onAction: (AiChatUiAction) -> Unit) {
    Column(
        Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Lịch sử trò chuyện", style = MaterialTheme.typography.headlineSmall)
        Text("Chỉ hiển thị hội thoại của tài khoản và workspace hiện tại.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.conversations.isEmpty()) Text("Chưa có cuộc trò chuyện nào.")
        state.conversations.forEach { conversation ->
            Card(
                modifier = Modifier.fillMaxWidth().clickable { onAction(AiChatUiAction.SelectConversation(conversation.id)) },
                colors = CardDefaults.cardColors(
                    containerColor = if (conversation.id == state.currentConversation?.id) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                ),
            ) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(conversation.title, style = MaterialTheme.typography.titleMedium)
                    Text(formatIso(conversation.updatedAt, "dd/MM/yyyy · HH:mm"), style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun AiChatLoadError(requestId: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        ShcareErrorState(
            title = stringResource(R.string.ai_assistant_load_error_title),
            message = stringResource(R.string.shcare_state_error_message),
            onRetry = onRetry,
            modifier = Modifier.weight(1f).fillMaxWidth().testTag("ai_assistant.retry"),
        )
        if (requestId.isNotBlank()) Text(
            stringResource(R.string.ai_assistant_request_id, requestId),
            modifier = Modifier.align(Alignment.CenterHorizontally).padding(16.dp),
        )
    }
}

@Composable
private fun AiChatEmptyContent() {
    Column(Modifier.fillMaxSize()) {
        ShcareEmptyState(
            title = stringResource(R.string.ai_assistant_empty_title),
            message = stringResource(R.string.ai_assistant_empty_message),
            modifier = Modifier.weight(1f).fillMaxWidth().testTag("ai_assistant.empty"),
        )
        AiDisclaimerCard(Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
    }
}

@Composable
private fun AiChatTimeline(messages: List<AiChatMessage>, providerUnavailable: Boolean) {
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size, providerUnavailable) {
        if (messages.isNotEmpty()) {
            val trailingMessageIndex = messages.size + if (providerUnavailable) 1 else 0
            listState.animateScrollToItem(trailingMessageIndex)
        }
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize().testTag("ai_assistant.timeline"),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item(key = "disclaimer") { AiDisclaimerCard() }
        if (providerUnavailable) item(key = "provider-unavailable") {
            Card(colors = CardDefaults.cardColors(containerColor = ShcareTheme.colors.warningContainer)) {
                Text(stringResource(R.string.ai_assistant_unavailable_message), Modifier.padding(16.dp))
            }
        }
        items(messages, key = { it.id }) { AiMessageBubble(it) }
    }
}

@Composable
private fun AiDisclaimerCard(modifier: Modifier = Modifier) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(21.dp))
            Text(stringResource(R.string.ai_assistant_disclaimer), style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun AiMessageBubble(message: AiChatMessage) {
    val isUser = message.role == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Column(
            modifier = Modifier.fillMaxWidth(0.9f),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text(
                if (isUser) stringResource(R.string.ai_assistant_message_user) else stringResource(R.string.ai_assistant_message_assistant),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Surface(
                shape = MaterialTheme.shapes.large,
                color = if (isUser) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
            ) { Text(message.content, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(16.dp)) }
            if (!isUser && message.references.isNotEmpty()) {
                Text("Dữ liệu đã dùng: ${message.references.joinToString { it.label.ifBlank { it.id } }}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(formatIso(message.createdAt, "HH:mm"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AiChatComposer(
    state: AiChatUiState,
    isRecording: Boolean,
    voiceStatus: String,
    amplitudes: List<Int>,
    onAttach: () -> Unit,
    onVoice: () -> Unit,
    onAction: (AiChatUiAction) -> Unit,
) {
    Surface(
        tonalElevation = 3.dp,
        modifier = Modifier.fillMaxWidth().imePadding().navigationBarsPadding().testTag("ai_assistant.composer"),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state.selectedAttachmentIds.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.attachments.filter { it.id in state.selectedAttachmentIds }, key = { it.id }) { attachment ->
                        AssistChip(
                            onClick = { onAction(AiChatUiAction.RemoveAttachment(attachment.id)) },
                            label = { Text(attachment.name, maxLines = 1) },
                            leadingIcon = { Icon(Icons.Default.AttachFile, contentDescription = null, Modifier.size(18.dp)) },
                            trailingIcon = { Icon(Icons.Default.Close, contentDescription = "Bỏ tệp", Modifier.size(18.dp)) },
                        )
                    }
                }
            }
            if (isRecording || voiceStatus.isNotBlank()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        VoiceWaveform(amplitudes, isRecording)
                        Text(voiceStatus, style = MaterialTheme.typography.labelMedium, maxLines = 2)
                    }
                }
            }
            OutlinedTextField(
                value = state.input,
                onValueChange = { onAction(AiChatUiAction.InputChanged(it)) },
                placeholder = { Text(stringResource(R.string.ai_assistant_input_hint)) },
                enabled = !state.isSending,
                minLines = 1,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth().testTag("ai_assistant.input"),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onAttach, enabled = !state.isSending && !state.isUploading) {
                    if (state.isUploading) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    else Icon(Icons.Default.AttachFile, contentDescription = "Thêm hình hoặc tệp")
                }
                IconButton(onClick = onVoice, enabled = !state.isSending) {
                    Icon(if (isRecording) Icons.Default.Stop else Icons.Default.Mic, contentDescription = if (isRecording) "Dừng ghi âm" else "Nhập bằng giọng nói")
                }
                Spacer(Modifier.weight(1f))
                Surface(
                    shape = CircleShape,
                    color = if (state.input.isNotBlank() && !state.isSending) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.defaultMinSize(48.dp, 48.dp),
                ) {
                    IconButton(
                        onClick = { onAction(AiChatUiAction.Send) },
                        enabled = state.input.isNotBlank() && !state.isSending && !state.isUploading,
                        modifier = Modifier.testTag("ai_assistant.send"),
                    ) {
                        if (state.isSending) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                        else Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(R.string.ai_assistant_send))
                    }
                }
            }
            if (state.errorMessage.isNotBlank() || state.errorMessageRes != null) {
                Text(
                    text = state.errorMessage.ifBlank { stringResource(R.string.ai_assistant_send_error) },
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun VoiceWaveform(levels: List<Int>, active: Boolean) {
    val color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(
        modifier = Modifier.fillMaxWidth().height(38.dp).semantics {
            contentDescription = if (active) "Sóng âm đang ghi" else "Sóng âm đã dừng"
        },
    ) {
        if (levels.isEmpty()) return@Canvas
        val step = size.width / levels.size
        levels.forEachIndexed { index, level ->
            val height = size.height * (level.coerceIn(4, 100) / 100f)
            val x = step * index + step / 2f
            drawLine(
                color = color,
                start = Offset(x, (size.height - height) / 2f),
                end = Offset(x, (size.height + height) / 2f),
                strokeWidth = (step * 0.42f).coerceAtLeast(2f),
                cap = StrokeCap.Round,
            )
        }
    }
}
