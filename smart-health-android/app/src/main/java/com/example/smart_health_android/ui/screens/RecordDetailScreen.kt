package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay
import kotlin.math.sin

@Composable
fun RecordDetailScreen(recordId: String, onNavigateBack: () -> Unit) {
    var isPlaying by remember { mutableStateOf(false) }
    var currentTime by remember { mutableStateOf(0) }
    val duration = 154

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (currentTime < duration) {
                delay(1000)
                currentTime += 1
            }
            isPlaying = false
        }
    }

    val formatTime = { seconds: Int ->
        val mins = seconds / 60
        val secs = seconds % 60
        String.format("%d:%02d", mins, secs)
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
                Text("Chi Tiết Hồ Sơ", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                IconButton(onClick = { }, modifier = Modifier.offset(x = 12.dp)) {
                    Icon(Icons.Default.Share, contentDescription = "Share", tint = Color.White)
                }
            }
        }

        // Scrollable Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Section 1: Patient Info
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Border, RoundedCornerShape(16.dp))
                    .padding(20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Column {
                        Text(recordId, color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Trần Thị Mai", color = TextPrimary, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(2.dp))
                        Text("Mã BN: BN-2844", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                    Box(
                        modifier = Modifier
                            .background(Color(0xFFF59E0B).copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text("Bất thường", color = Color(0xFFF59E0B), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        InfoChip(icon = Icons.Default.CalendarToday, text = "12-05-2026")
                        InfoChip(icon = Icons.Default.Timer, text = "2:34 phút")
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        InfoChip(icon = Icons.Default.AccessTime, text = "13:20")
                        InfoChip(icon = Icons.Default.Air, text = "Đo Phổi", iconColor = Color(0xFF0EA5E9))
                    }
                }
            }

            // Section 2: Waveform Player
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Border, RoundedCornerShape(16.dp))
                    .padding(20.dp)
            ) {
                Text("Dạng sóng âm thanh đã lưu", color = TextPrimary.copy(alpha = 0.8f), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(12.dp))
                
                // Static Canvas Waveform
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(120.dp)
                        .background(Color(0xFFF5F7FA), RoundedCornerShape(12.dp))
                        .border(1.dp, Border, RoundedCornerShape(12.dp))
                ) {
                    Canvas(modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp))) {
                        val width = size.width
                        val height = size.height
                        val centerY = height / 2

                        // Draw Grid
                        val gridPaint = Color(0xFFE2E8F0)
                        for (i in 0 until height.toInt() step 30) {
                            drawLine(gridPaint, start = Offset(0f, i.toFloat()), end = Offset(width, i.toFloat()), strokeWidth = 1f)
                        }
                        for (i in 0 until width.toInt() step 30) {
                            drawLine(gridPaint, start = Offset(i.toFloat(), 0f), end = Offset(i.toFloat(), height), strokeWidth = 1f)
                        }

                        // Draw Waveform
                        val path = Path()
                        for (x in 0 until width.toInt()) {
                            val breathWave = sin(x * 0.015f) * 40f
                            val noise = (Math.random() - 0.5f) * 5f
                            val y = centerY + breathWave + noise.toFloat()

                            if (x == 0) {
                                path.moveTo(x.toFloat(), y)
                            } else {
                                path.lineTo(x.toFloat(), y)
                            }
                        }
                        drawPath(path = path, color = PrimaryBlue, style = Stroke(width = 2f))

                        // Draw Progress Marker
                        val markerX = (currentTime.toFloat() / duration) * width
                        drawLine(Color(0xFFEF4444), start = Offset(markerX, 0f), end = Offset(markerX, height), strokeWidth = 4f)
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Progress Bar
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatTime(currentTime), color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Text(formatTime(duration), color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
                Spacer(modifier = Modifier.height(8.dp))
                Box(modifier = Modifier.fillMaxWidth().height(8.dp).background(Color(0xFFE2E8F0), RoundedCornerShape(4.dp)).clickable { /* Seek */ }) {
                    Box(modifier = Modifier.fillMaxWidth(currentTime.toFloat() / duration).fillMaxHeight().background(PrimaryBlue, RoundedCornerShape(4.dp)))
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Controls
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier.size(48.dp).background(Color(0xFFF1F5F9), CircleShape).clickable { currentTime = maxOf(0, currentTime - 10) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Replay10, contentDescription = "Rewind", tint = TextPrimary.copy(alpha = 0.8f))
                    }
                    Spacer(modifier = Modifier.width(24.dp))
                    Box(
                        modifier = Modifier.size(56.dp).background(PrimaryBlue, CircleShape).clickable { isPlaying = !isPlaying },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, contentDescription = "Play/Pause", tint = Color.White, modifier = Modifier.size(32.dp))
                    }
                    Spacer(modifier = Modifier.width(24.dp))
                    Box(
                        modifier = Modifier.size(48.dp).background(Color(0xFFF1F5F9), CircleShape).clickable { /* Download */ },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Download, contentDescription = "Download", tint = TextPrimary.copy(alpha = 0.8f))
                    }
                }
            }

            // Section 3: AI Analysis
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Brush.linearGradient(listOf(Color(0xFFF59E0B).copy(alpha = 0.1f), Color(0xFFEF4444).copy(alpha = 0.1f))), RoundedCornerShape(16.dp))
                    .border(2.dp, Color(0xFFF59E0B), RoundedCornerShape(16.dp))
                    .padding(20.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Psychology, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Tóm tắt phân tích AI", color = Color(0xFFF59E0B), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(modifier = Modifier.height(12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White.copy(alpha = 0.9f), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                        .padding(16.dp)
                ) {
                    Text(
                        text = "Kết luận: Phát hiện tiếng ran nổ - Đáy phổi trái",
                        color = TextPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "Mô hình AI đã phát hiện các âm thanh hô hấp bất thường tương thích với tiếng ran nổ nhỏ ở thuỳ dưới phổi trái. Mẫu âm thanh này thường liên quan đến sự tích tụ dịch hoặc viêm nhiễm ở các phế nang.",
                        color = TextPrimary.copy(alpha = 0.7f),
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .background(Color.White.copy(alpha = 0.9f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    ) {
                        Text("Độ tin cậy", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("94%", color = PrimaryBlue, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .background(Color.White.copy(alpha = 0.9f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    ) {
                        Text("Mức độ", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Trung bình", color = Color(0xFFF59E0B), fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White.copy(alpha = 0.9f), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                        .padding(12.dp)
                ) {
                    Text("Mẫu âm thanh phát hiện:", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TagChip("Ran nổ nhỏ")
                        TagChip("Cuối thì hít vào")
                        TagChip("Bên trái")
                    }
                }
            }

            // Section 4: Doctor Notes
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Border, RoundedCornerShape(16.dp))
                    .padding(20.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Description, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Ghi chú của bác sĩ", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(modifier = Modifier.height(12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
                        .padding(16.dp)
                ) {
                    Text(
                        "Bệnh nhân nhập viện với triệu chứng khó thở nhẹ. Đã xác nhận tiếng ran nổ khi nghe ống nghe. Kết quả AI phù hợp với biểu hiện lâm sàng. Đề nghị chụp X-quang phổi và cân nhắc viêm phổi giai đoạn đầu hoặc phù phổi. Đã bắt đầu dùng kháng sinh theo kinh nghiệm trong khi chờ kết quả cấy vi khuẩn.",
                        color = TextPrimary.copy(alpha = 0.8f),
                        fontSize = 14.sp,
                        fontStyle = FontStyle.Italic,
                        lineHeight = 20.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    HorizontalDivider(color = Color(0xFFE2E8F0))
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Bs. Tuấn, CK1", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Text("12-05-2026 - 13:45", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
fun InfoChip(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, iconColor: Color = Color(0xFF64748B)) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFF8FAFC), RoundedCornerShape(8.dp))
            .border(1.dp, Color(0xFFF1F5F9), RoundedCornerShape(8.dp))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(16.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text(text, color = TextPrimary.copy(alpha = 0.8f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun TagChip(text: String) {
    Box(
        modifier = Modifier
            .background(Color(0xFFF59E0B).copy(alpha = 0.2f), RoundedCornerShape(16.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Text(text, color = Color(0xFFF59E0B), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}
