package com.example.smart_health_android.ui.screens

import android.media.MediaPlayer
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.BackendConfig
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanLabel
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun RecordDetailScreen(recordId: String, onNavigateBack: () -> Unit) {
    var isPlaying by remember { mutableStateOf(false) }
    var currentTime by remember { mutableStateOf(0) }
    var duration by remember { mutableStateOf(1) }
    var scan by remember { mutableStateOf<Scan?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    var mediaPlayer by remember { mutableStateOf<MediaPlayer?>(null) }
    var isStopping by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current

    LaunchedEffect(recordId) {
        runCatching {
            val loaded = SmartHealthRepository.api.getScan(recordId)
            scan = loaded
            duration = loaded.durationSeconds.toInt().coerceAtLeast(1)
            loadError = null
        }.onFailure {
            loadError = it.message ?: "Không tải được hồ sơ"
        }
    }

    val audioUrl = BackendConfig.audioUrl(scan?.audioUrl)
    val isRecording = scan?.isRecording == true
    val hasAudio = !audioUrl.isNullOrBlank()

    fun stopCurrentScan() {
        val currentScan = scan ?: return
        if (isStopping) return
        coroutineScope.launch {
            isStopping = true
            runCatching {
                SmartHealthRepository.api.stopScan(currentScan.id)
            }.onSuccess { stopped ->
                scan = stopped
                duration = stopped.durationSeconds.toInt().coerceAtLeast(1)
                currentTime = 0
                loadError = null
            }.onFailure {
                loadError = it.message ?: "Không dừng được lượt ghi"
            }
            isStopping = false
        }
    }

    DisposableEffect(audioUrl) {
        if (audioUrl.isNullOrBlank()) {
            onDispose { }
        } else {
            val player = MediaPlayer()
            runCatching {
                player.setDataSource(audioUrl)
                player.setOnPreparedListener {
                    duration = (it.duration / 1000).coerceAtLeast(1)
                }
                player.setOnCompletionListener {
                    isPlaying = false
                    currentTime = duration
                }
                player.prepareAsync()
                mediaPlayer = player
            }.onFailure {
                loadError = it.message ?: "Không phát được file WAV"
                player.release()
            }

            onDispose {
                if (mediaPlayer == player) mediaPlayer = null
                player.release()
            }
        }
    }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (isPlaying) {
                delay(250)
                currentTime = mediaPlayer?.currentPosition?.div(1000) ?: (currentTime + 1)
                if (currentTime >= duration) {
                    isPlaying = false
                }
            }
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
                Text("Chi tiết hồ sơ", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                IconButton(
                    onClick = {
                        if (hasAudio) {
                            uriHandler.openUri(audioUrl!!)
                        } else {
                            actionMessage = "Hồ sơ này chưa có file âm thanh để mở"
                        }
                    },
                    modifier = Modifier.offset(x = 12.dp)
                ) {
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
            loadError?.let { message ->
                Text(
                    text = message,
                    color = ErrorRed,
                    fontSize = 13.sp
                )
            }
            actionMessage?.let { message ->
                Text(
                    text = message,
                    color = SuccessGreen,
                    fontSize = 13.sp
                )
            }

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
                        Text(scan?.patientName ?: "Đang tải...", color = TextPrimary, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(2.dp))
                        Text("Mã BN: ${scan?.patientCode ?: "--"}", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                    Box(
                        modifier = Modifier
                            .background(Color(0xFFF59E0B).copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text(scan?.let { scanLabel(it) } ?: "Đang tải", color = if (scan?.let { scanIsNormal(it) } != false) SuccessGreen else Color(0xFFF59E0B), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        InfoChip(icon = Icons.Default.CalendarToday, text = scan?.formattedDate() ?: "--")
                        InfoChip(icon = Icons.Default.Timer, text = "${scan?.formattedDuration() ?: "--"} phút")
                    }
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        InfoChip(icon = Icons.Default.AccessTime, text = scan?.formattedTime() ?: "--")
                        InfoChip(icon = if (scan?.isHeart != false) Icons.Default.Favorite else Icons.Default.Air, text = "Đo ${if (scan?.isHeart != false) "Tim" else "Phổi"}", iconColor = if (scan?.isHeart != false) Color(0xFFEF4444) else Color(0xFF0EA5E9))
                    }
                }

                if (isRecording) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = ::stopCurrentScan,
                        enabled = !isStopping,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PrimaryBlue,
                            contentColor = Color.White
                        )
                    ) {
                        if (isStopping) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text("Dừng ghi và lưu", fontWeight = FontWeight.SemiBold)
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

                        val gridPaint = Color(0xFFE2E8F0)
                        for (i in 0 until height.toInt() step 30) {
                            drawLine(gridPaint, start = Offset(0f, i.toFloat()), end = Offset(width, i.toFloat()), strokeWidth = 1f)
                        }
                        for (i in 0 until width.toInt() step 30) {
                            drawLine(gridPaint, start = Offset(i.toFloat(), 0f), end = Offset(i.toFloat(), height), strokeWidth = 1f)
                        }

                        val baselineColor = if (hasAudio) PrimaryBlue else TextSecondary.copy(alpha = 0.5f)
                        drawLine(
                            baselineColor,
                            start = Offset(0f, centerY),
                            end = Offset(width, centerY),
                            strokeWidth = if (hasAudio) 3f else 2f
                        )

                        val markerX = (currentTime.toFloat() / duration) * width
                        drawLine(Color(0xFFEF4444), start = Offset(markerX, 0f), end = Offset(markerX, height), strokeWidth = 4f)
                    }
                    Column(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            if (hasAudio) "File âm thanh đã lưu từ backend" else "Chưa có file âm thanh",
                            color = TextPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            if (hasAudio) "Phát file WAV để nghe lại, waveform chi tiết sẽ được bổ sung khi backend trả sample." else "Hãy tạo lượt đo mới để có dữ liệu thật.",
                            color = TextSecondary,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Progress Bar
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(formatTime(currentTime), color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Text(formatTime(duration), color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
                Spacer(modifier = Modifier.height(8.dp))
                Box(modifier = Modifier.fillMaxWidth().height(8.dp).background(Color(0xFFE2E8F0), RoundedCornerShape(4.dp))) {
                    Box(modifier = Modifier.fillMaxWidth((currentTime.toFloat() / duration).coerceIn(0f, 1f)).fillMaxHeight().background(PrimaryBlue, RoundedCornerShape(4.dp)))
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Controls
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier.size(48.dp).background(Color(0xFFF1F5F9), CircleShape).clickable {
                            val newTimeMs = maxOf(0, (currentTime - 10) * 1000)
                            mediaPlayer?.seekTo(newTimeMs)
                            currentTime = newTimeMs / 1000
                        },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Replay10, contentDescription = "Rewind", tint = TextPrimary.copy(alpha = 0.8f))
                    }
                    Spacer(modifier = Modifier.width(24.dp))
                    Box(
                        modifier = Modifier.size(56.dp).background(PrimaryBlue, CircleShape).clickable {
                            val player = mediaPlayer
                            if (player == null) {
                                isPlaying = false
                            } else if (isPlaying) {
                                player.pause()
                                isPlaying = false
                            } else {
                                if (currentTime >= duration) {
                                    player.seekTo(0)
                                    currentTime = 0
                                }
                                player.start()
                                isPlaying = true
                            }
                        },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow, contentDescription = "Play/Pause", tint = Color.White, modifier = Modifier.size(32.dp))
                    }
                    Spacer(modifier = Modifier.width(24.dp))
                    Box(
                        modifier = Modifier.size(48.dp).background(Color(0xFFF1F5F9), CircleShape).clickable {
                            if (hasAudio) {
                                uriHandler.openUri(audioUrl!!)
                            } else {
                                actionMessage = "Hồ sơ này chưa có file âm thanh để tải"
                            }
                        },
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
                        text = "Kết luận: ${scan?.let { scanLabel(it) } ?: "Đang tải"}",
                        color = TextPrimary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        scan?.let { scanSummary(it) } ?: loadError ?: "Đang tải dữ liệu phân tích từ máy chủ...",
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
                        Text(
                            scan?.aiConfidence?.let { "${(it * 100).toInt().coerceIn(0, 100)}%" } ?: "--",
                            color = PrimaryBlue,
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold
                        )
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
                        Text(scan?.let { scanLabel(it) } ?: "--", color = Color(0xFFF59E0B), fontSize = 20.sp, fontWeight = FontWeight.Bold)
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
                    Text("Chỉ số tín hiệu backend:", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(8.dp))
                    val metricTags = buildList {
                        scan?.let {
                            add(if (it.isHeart) "Tim" else "Phổi")
                            if (it.bpm > 0) add("BPM ${it.bpm}")
                            if (it.rms > 0) add("RMS ${it.rms}")
                            if (it.levelPercent > 0) add("SQI ${it.levelPercent}%")
                            if (it.sampleCount > 0) add("${it.sampleCount} mẫu")
                        }
                    }
                    if (metricTags.isEmpty()) {
                        Text(
                            "Backend chưa trả chỉ số phụ cho lượt đo này.",
                            color = TextSecondary,
                            fontSize = 13.sp
                        )
                    } else {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            metricTags.forEach { TagChip(it) }
                        }
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
                        scan?.doctorNotes?.ifBlank { "Chưa có ghi chú bác sĩ cho lượt đo này." } ?: "Đang tải ghi chú...",
                        color = TextPrimary.copy(alpha = 0.8f),
                        fontSize = 14.sp,
                        fontStyle = FontStyle.Italic,
                        lineHeight = 20.sp
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    HorizontalDivider(color = Color(0xFFE2E8F0))
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(
                            "Thiết bị: ${scan?.deviceId?.ifBlank { "--" } ?: "--"}",
                            color = TextSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                        Text("${scan?.formattedDate() ?: "--"} - ${scan?.formattedTime() ?: "--"}", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
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
