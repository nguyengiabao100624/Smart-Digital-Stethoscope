package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.AiChatMessage
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

data class ChatMessage(
    val id: String,
    val role: String, // "user" or "assistant"
    val content: String,
    val timestamp: String
)

private fun AiChatMessage.toChatMessage(): ChatMessage {
    return ChatMessage(
        id = id,
        role = role,
        content = content,
        timestamp = formatIso(createdAt, "HH:mm")
    )
}

@Composable
fun AIAssistantScreen(onNavigateBack: () -> Unit) {
    var inputValue by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    
    val initialMessages = listOf(
        ChatMessage(
            "local_1", "assistant",
            "Xin chào! Tôi là Trợ lý Y tế AI của bạn. Tôi có thể giúp bạn phân tích kết quả đo, đề xuất các chẩn đoán phân biệt và cung cấp hướng dẫn lâm sàng dựa trên bản thu âm ống nghe của bạn. Tôi có thể giúp gì cho bạn hôm nay?",
            "13:45"
        ),
        ChatMessage(
            "local_2", "user",
            "Tôi vừa đo cho một bệnh nhân có tiếng ran nổ ở thùy dưới phổi trái. AI đã cảnh báo bất thường. Bạn có thể giải thích điều này có thể chỉ ra bệnh gì không?",
            "13:46"
        ),
        ChatMessage(
            "local_3", "assistant",
            "Dựa trên tiếng ran nổ được phát hiện ở thùy dưới phổi trái, dưới đây là những yếu tố chính cần xem xét:\n\n" +
            "• Viêm phổi - Nguyên nhân phổ biến nhất của ran nổ khu trú\n" +
            "• Phù phổi - Đặc biệt nếu xuất hiện ở hai bên hoặc bệnh nhân có tiền sử bệnh tim\n" +
            "• Xẹp phổi - Phổi giãn nở không hoàn toàn\n" +
            "• Xơ phổi - Nếu là ran nổ nhỏ, âm thanh giống như xé dán velcro\n\n" +
            "Các bước tiếp theo được đề xuất:\n" +
            "1. Kiểm tra dấu hiệu sinh tồn (sốt, độ bão hòa oxy)\n" +
            "2. Yêu cầu chụp X-quang ngực để xác nhận\n" +
            "3. Xem xét xét nghiệm công thức máu toàn phần (CBC) và các chỉ số viêm\n\n" +
            "Bạn có muốn tôi phân tích dữ liệu dạng sóng cụ thể từ bản thu âm của bạn không?",
            "13:47"
        )
    )
    
    val messages = remember { mutableStateListOf<ChatMessage>().apply { addAll(initialMessages) } }

    LaunchedEffect(Unit) {
        try {
            val remoteMessages = SmartHealthRepository.api.listAiMessages().map { it.toChatMessage() }
            if (remoteMessages.isNotEmpty()) {
                messages.clear()
                messages.addAll(remoteMessages)
            }
            loadError = null
        } catch (error: Exception) {
            loadError = error.message ?: "Không thể tải lịch sử chat AI"
        }
    }

    val getCurrentTime = {
        SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
    }

    fun handleSend() {
        if (inputValue.isBlank() || isSending) return
        val content = inputValue.trim()
        
        messages.add(
            ChatMessage(
                id = "local_${System.currentTimeMillis()}",
                role = "user",
                content = content,
                timestamp = getCurrentTime()
            )
        )
        inputValue = ""
        isSending = true

        coroutineScope.launch {
            try {
                messages.add(SmartHealthRepository.api.sendAiMessage(content).toChatMessage())
                loadError = null
            } catch (error: Exception) {
                loadError = error.message ?: "Không thể gửi câu hỏi AI"
            } finally {
                isSending = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Gradient Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .padding(horizontal = 16.dp, vertical = 16.dp)
                .statusBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Psychology, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Trợ Lý Y Tế AI", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                }
                Box(modifier = Modifier.size(24.dp)) // Spacer
            }
        }

        // Chat List
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(top = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            items(messages) { message ->
                MessageBubble(message = message)
            }
        }

        // Input Area
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White)
                .border(1.dp, Border)
                .navigationBarsPadding()
                .padding(16.dp)
        ) {
            loadError?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF8FAFC), RoundedCornerShape(24.dp))
                    .border(1.dp, Border, RoundedCornerShape(24.dp))
                    .padding(8.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                IconButton(onClick = { /* Attach */ }, modifier = Modifier.size(40.dp)) {
                    Icon(Icons.Default.AttachFile, contentDescription = "Attach", tint = TextSecondary)
                }
                
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 8.dp, vertical = 10.dp)
                ) {
                    if (inputValue.isEmpty()) {
                        Text("Hỏi về triệu chứng, chẩn đoán...", color = TextSecondary.copy(alpha = 0.5f), fontSize = 14.sp)
                    }
                    BasicTextField(
                        value = inputValue,
                        onValueChange = { inputValue = it },
                        modifier = Modifier.fillMaxWidth(),
                        textStyle = LocalTextStyle.current.copy(color = TextPrimary, fontSize = 14.sp)
                    )
                }

                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            if (inputValue.isNotBlank() && !isSending) PrimaryBlue else Color(0xFFE2E8F0),
                            CircleShape
                        )
                        .clickable(enabled = inputValue.isNotBlank() && !isSending) { handleSend() },
                    contentAlignment = Alignment.Center
                ) {
                    if (isSending) {
                        CircularProgressIndicator(color = PrimaryBlue, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    } else {
                        Icon(Icons.Default.Send, contentDescription = "Send", tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                "Trợ lý AI chỉ cung cấp đề xuất. Luôn xác minh bằng đánh giá chuyên môn lâm sàng.",
                color = TextSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
        }
    }
}

@Composable
fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Top
    ) {
        if (!isUser) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Psychology, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
        }

        Column(
            modifier = Modifier.weight(1f, fill = false),
            horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
        ) {
            Box(
                modifier = Modifier
                    .background(
                        if (isUser) PrimaryBlue else Color.White,
                        RoundedCornerShape(16.dp)
                    )
                    .border(1.dp, if (isUser) PrimaryBlue else Border, RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                Text(
                    text = message.content,
                    color = if (isUser) Color.White else TextPrimary,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = message.timestamp,
                color = TextSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(horizontal = 8.dp)
            )
        }

        if (isUser) {
            Spacer(modifier = Modifier.width(12.dp))
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(Color(0xFFE2E8F0), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Person, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
            }
        }
    }
}
