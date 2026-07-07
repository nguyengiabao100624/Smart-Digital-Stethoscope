package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.LiveAudioClient
import com.example.smart_health_android.data.LiveMetrics
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.StartScanRequest
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LiveMonitoringScreen(initialScanId: String? = null, onNavigateBack: () -> Unit) {
    var isRecording by remember { mutableStateOf(!initialScanId.isNullOrBlank()) }
    var activeScanId by remember(initialScanId) { mutableStateOf(initialScanId) }
    var mode by remember { mutableStateOf("heart") }
    var heartRate by remember { mutableStateOf(0) }
    var sqi by remember { mutableStateOf(0) }
    var devices by remember { mutableStateOf<List<SmartDevice>>(emptyList()) }
    var selectedDeviceId by remember { mutableStateOf("") }
    var connectionText by remember { mutableStateOf("Đang kết nối máy chủ...") }
    var isConnected by remember { mutableStateOf(false) }
    var liveMetrics by remember { mutableStateOf(LiveMetrics()) }
    var waveformSamples by remember { mutableStateOf(FloatArray(1024)) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var isBusy by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    val liveClient = remember {
        LiveAudioClient(
            onConnectionChanged = { connected, message ->
                isConnected = connected
                connectionText = message
            },
            onStatus = { status ->
                if (status.recording) {
                    activeScanId = status.activeScanId ?: activeScanId
                    isRecording = true
                } else {
                    activeScanId = null
                    isRecording = false
                }
            },
            onMetrics = { metrics ->
                liveMetrics = metrics
                if (metrics.recording) {
                    activeScanId = metrics.activeScanId ?: activeScanId
                }
                heartRate = metrics.bpm.coerceAtLeast(0)
                sqi = metrics.levelPercent.coerceIn(0, 100)
            },
            onSamples = { samples -> waveformSamples = samples }
        )
    }

    DisposableEffect(Unit) {
        liveClient.connect()
        onDispose { liveClient.close() }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "monitoring-wave")
    val phase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "wave-phase"
    )

    LaunchedEffect(Unit) {
        runCatching {
            SmartHealthRepository.api.listDevices()
                .filter { it.type == "stethoscope" || it.type.isBlank() }
                .sortedWith(
                    compareByDescending<SmartDevice> { it.online || it.connected }
                        .thenByDescending { it.lastSeenAt.orEmpty() }
                )
        }.onSuccess { loaded ->
            devices = loaded
            if (selectedDeviceId.isBlank() && loaded.isNotEmpty()) {
                selectedDeviceId = loaded.first().id
            }
        }.onFailure {
            actionError = it.message ?: "Không tải được danh sách thiết bị"
        }
    }

    fun stopRecording(navigateBackAfterStop: Boolean = false) {
        if (isBusy) return
        coroutineScope.launch {
            actionError = null
            isBusy = true
            var shouldNavigateBack = false
            runCatching {
                val scanId = activeScanId ?: liveMetrics.activeScanId
                if (scanId.isNullOrBlank()) {
                    SmartHealthRepository.api.stopActiveScan()
                } else {
                    SmartHealthRepository.api.stopScan(scanId)
                }
            }.onSuccess {
                activeScanId = null
                isRecording = false
                shouldNavigateBack = navigateBackAfterStop
            }.onFailure {
                actionError = it.message ?: "Không dừng được lượt ghi"
            }
            isBusy = false
            if (shouldNavigateBack) {
                onNavigateBack()
            }
        }
    }

    fun startRecording() {
        if (isBusy) return
        coroutineScope.launch {
            actionError = null
            isBusy = true
            runCatching {
                val selectedDevice = devices.firstOrNull { it.id == selectedDeviceId }
                    ?: error("Hãy liên kết và chọn ống nghe trước khi bắt đầu ghi")
                SmartHealthRepository.api.startScan(
                    StartScanRequest(
                        mode = mode,
                        patientName = "Bệnh nhân vãng lai",
                        deviceId = selectedDevice.id
                    )
                )
            }.onSuccess { scan ->
                activeScanId = scan.id
                isRecording = true
            }.onFailure { error ->
                runCatching { SmartHealthRepository.api.getStatus() }
                    .onSuccess { status ->
                        if (status.recording) {
                            activeScanId = status.activeScanId
                            isRecording = true
                            actionError = "Máy chủ đang có lượt ghi khác. Bấm Dừng ghi và lưu để kết thúc."
                        } else {
                            actionError = error.message ?: "Không bắt đầu được lượt ghi"
                        }
                    }
                    .onFailure {
                        actionError = error.message ?: "Không bắt đầu được lượt ghi"
                    }
            }
            isBusy = false
        }
    }

    val selectedDevice = devices.firstOrNull { it.id == selectedDeviceId }
    val hasLiveSamples = waveformSamples.any { kotlin.math.abs(it) > 0.0001f }
    val signalQualityAlert = isRecording && isConnected && sqi in 1..25
    val primaryValue = when {
        mode == "heart" && heartRate > 0 -> heartRate.toString()
        mode == "lung" && liveMetrics.rms > 0 -> liveMetrics.rms.toString()
        else -> "--"
    }
    val primaryUnit = if (mode == "heart") "BPM" else "RMS"
    val sqiValue = if (sqi > 0) sqi.toString() else "--"

    fun toggleRecording() {
        if (isRecording) {
            stopRecording()
        } else {
            startRecording()
        }
    }

    BackHandler {
        if (isRecording) {
            stopRecording(navigateBackAfterStop = true)
        } else {
            onNavigateBack()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        MonitoringHeader(
            onNavigateBack = {
                if (isRecording) {
                    stopRecording(navigateBackAfterStop = true)
                } else {
                    onNavigateBack()
                }
            }
        )
        PatientInfoStrip(device = selectedDevice, activeScanId = activeScanId)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            WaveformCard(
                mode = mode,
                isRecording = isRecording,
                hasAlert = signalQualityAlert,
                phase = phase,
                samples = waveformSamples
            )

            Spacer(modifier = Modifier.height(16.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
                VitalCard(
                    modifier = Modifier.weight(1f),
                    label = if (mode == "heart") "Nhịp Tim" else "Cường Độ Âm Phổi",
                    value = primaryValue,
                    unit = primaryUnit,
                    icon = if (mode == "heart") Icons.Default.Favorite else Icons.Default.Air,
                    accent = if (mode == "heart") ErrorRed else PrimaryTeal,
                    valueColor = TextPrimary,
                    isActive = isRecording
                )
                VitalCard(
                    modifier = Modifier.weight(1f),
                    label = "Chất Lượng Tín Hiệu",
                    value = sqiValue,
                    unit = "% SQI",
                    icon = Icons.Default.VerifiedUser,
                    accent = PrimaryTeal,
                    valueColor = PrimaryTeal,
                    isActive = true
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = if (isConnected) connectionText else "Máy chủ: $connectionText",
                color = if (isConnected) PrimaryTeal else ErrorRed,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
            actionError?.let {
                Spacer(modifier = Modifier.height(8.dp))
                Text(it, color = ErrorRed, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (!hasLiveSamples) {
                Text(
                    text = if (isConnected) {
                        "Đã kết nối backend, đang chờ gói âm thanh từ ống nghe."
                    } else {
                        "Chưa có luồng audio realtime. Kiểm tra thiết bị online và backend."
                    },
                    color = TextSecondary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            AnimatedVisibility(visible = isRecording) {
                EdgeAiAlert(hasAlert = signalQualityAlert)
            }

            if (isRecording) Spacer(modifier = Modifier.height(16.dp))

            AnalysisModeCard(
                mode = mode,
                onModeChange = {
                    mode = it
                }
            )

            Spacer(modifier = Modifier.height(32.dp))

            RecordButton(
                isRecording = isRecording,
                enabled = !isBusy,
                onClick = ::toggleRecording
            )
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = ::toggleRecording,
                enabled = !isBusy,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isRecording) ErrorRed else PrimaryBlue,
                    contentColor = Color.White
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isBusy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(if (isRecording) "Dừng ghi và lưu" else "Bắt đầu ghi")
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
private fun MonitoringHeader(onNavigateBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .border(1.dp, Color(0xFFE5E7EB))
            .statusBarsPadding()
            .padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onNavigateBack) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color(0xFF4B5563))
        }
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                "Theo Dõi Tín Hiệu",
                color = TextPrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Wifi, contentDescription = null, tint = PrimaryTeal, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    "Backend cloud audio",
                    color = PrimaryTeal,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
        Icon(
            Icons.Default.BatteryFull,
            contentDescription = null,
            tint = Color(0xFF9CA3AF),
            modifier = Modifier.padding(end = 12.dp).size(22.dp)
        )
    }
}

@Composable
private fun PatientInfoStrip(device: SmartDevice?, activeScanId: String?) {
    val isOnline = device?.let { it.online || it.connected } == true
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .border(1.dp, Color(0xFFE5E7EB))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(Color(0xFFEFF6FF), CircleShape)
                .border(1.dp, Color(0xFFDBEAFE), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text("BN", color = PrimaryBlue, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                device?.name?.ifBlank { device.id } ?: "Chưa chọn ống nghe",
                color = TextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                listOf(
                    activeScanId?.let { "Scan: $it" }.orEmpty(),
                    device?.wifiSsid?.takeIf { it.isNotBlank() }?.let { "WiFi: $it" }.orEmpty(),
                    device?.firmwareVersion?.takeIf { it.isNotBlank() }?.let { "FW: $it" }.orEmpty()
                ).filter { it.isNotBlank() }.joinToString(" • ").ifBlank { "Thiết bị phải online để nghe realtime" },
                color = TextSecondary,
                fontSize = 12.sp
            )
        }
        Text(
            if (isOnline) "Online" else "Offline",
            color = if (isOnline) PrimaryTeal else TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .background((if (isOnline) PrimaryTeal else TextSecondary).copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                .border(1.dp, (if (isOnline) PrimaryTeal else TextSecondary).copy(alpha = 0.2f), RoundedCornerShape(6.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}

@Composable
private fun WaveformCard(
    mode: String,
    isRecording: Boolean,
    hasAlert: Boolean,
    phase: Float,
    samples: FloatArray
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 300.dp)
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Icon(Icons.Default.GraphicEq, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    if (mode == "heart") "Tín Hiệu Âm Tim (PCG)" else "Tín Hiệu Âm Phổi",
                    color = TextPrimary,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.5.sp
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isRecording) {
                    Row(
                        modifier = Modifier
                            .background(Color(0xFFFEE2E2), RoundedCornerShape(6.dp))
                            .border(1.dp, Color(0xFFFECACA), RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(modifier = Modifier.size(8.dp).background(ErrorRed, CircleShape))
                        Spacer(modifier = Modifier.width(5.dp))
                        Text("ĐANG GHI", color = ErrorRed, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    "25 mm/s",
                    color = TextSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .background(Color(0xFFF3F4F6), RoundedCornerShape(6.dp))
                        .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(230.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(Color.White)
                .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
        ) {
            MedicalWaveformCanvas(
                mode = mode,
                hasAlert = hasAlert,
                isRecording = isRecording,
                phase = phase,
                samples = samples,
                modifier = Modifier.fillMaxSize()
            )
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(28.dp)
                    .align(Alignment.CenterStart)
                    .background(Brush.horizontalGradient(listOf(Color.White, Color.White.copy(alpha = 0f))))
            )
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(28.dp)
                    .align(Alignment.CenterEnd)
                    .background(Brush.horizontalGradient(listOf(Color.White.copy(alpha = 0f), Color.White)))
            )
        }
    }
}

@Composable
private fun MedicalWaveformCanvas(
    mode: String,
    hasAlert: Boolean,
    isRecording: Boolean,
    phase: Float,
    samples: FloatArray,
    modifier: Modifier = Modifier
) {
    Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height
        val centerY = height / 2f
        val minor = 10.dp.toPx()
        val major = 50.dp.toPx()

        var xGrid = 0f
        while (xGrid <= width) {
            drawLine(
                color = Color(0xFFFF748B).copy(alpha = 0.15f),
                start = Offset(xGrid, 0f),
                end = Offset(xGrid, height),
                strokeWidth = 1f
            )
            xGrid += minor
        }

        var yGrid = 0f
        while (yGrid <= height) {
            drawLine(
                color = Color(0xFFFF748B).copy(alpha = 0.15f),
                start = Offset(0f, yGrid),
                end = Offset(width, yGrid),
                strokeWidth = 1f
            )
            yGrid += minor
        }

        xGrid = 0f
        while (xGrid <= width) {
            drawLine(
                color = Color(0xFFFF748B).copy(alpha = 0.35f),
                start = Offset(xGrid, 0f),
                end = Offset(xGrid, height),
                strokeWidth = 1.2f
            )
            xGrid += major
        }

        yGrid = 0f
        while (yGrid <= height) {
            drawLine(
                color = Color(0xFFFF748B).copy(alpha = 0.35f),
                start = Offset(0f, yGrid),
                end = Offset(width, yGrid),
                strokeWidth = 1.2f
            )
            yGrid += major
        }

        val path = Path()
        val hasLiveSamples = samples.any { kotlin.math.abs(it) > 0.0001f }

        if (hasLiveSamples) {
            samples.forEachIndexed { index, sample ->
                val x = (index.toFloat() / (samples.size - 1).coerceAtLeast(1)) * width
                val y = centerY - sample.coerceIn(-1f, 1f) * height * 0.42f
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
        } else {
            path.moveTo(0f, centerY)
            path.lineTo(width, centerY)
        }

        drawPath(
            path = path,
            color = if (mode == "heart") PrimaryBlue else PrimaryTeal,
            style = Stroke(width = 2.5.dp.toPx())
        )
    }
}

@Composable
private fun VitalCard(
    modifier: Modifier = Modifier,
    label: String,
    value: String,
    unit: String,
    icon: ImageVector,
    accent: Color,
    valueColor: Color,
    isActive: Boolean
) {
    Column(
        modifier = modifier
            .height(150.dp)
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                label,
                color = TextSecondary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp,
                modifier = Modifier.weight(1f)
            )
            Icon(
                icon,
                contentDescription = null,
                tint = if (isActive) accent else Color(0xFF9CA3AF),
                modifier = Modifier.size(18.dp)
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Row(verticalAlignment = Alignment.Bottom) {
            Text(value, color = valueColor, fontSize = 42.sp, fontWeight = FontWeight.Bold, lineHeight = 44.sp)
            Spacer(modifier = Modifier.width(6.dp))
            Text(unit, color = valueColor.copy(alpha = 0.7f), fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(bottom = 5.dp))
        }
    }
}

@Composable
private fun EdgeAiAlert(hasAlert: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (hasAlert) Color(0xFFFEF2F2) else Color(0xFFEFF6FF), RoundedCornerShape(16.dp))
            .border(1.dp, if (hasAlert) Color(0xFFFECACA) else Color(0xFFBFDBFE), RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            if (hasAlert) Icons.Default.Warning else Icons.Default.GraphicEq,
            contentDescription = null,
            tint = if (hasAlert) ErrorRed else PrimaryBlue,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                if (hasAlert) "Cảnh báo chất lượng tín hiệu" else "Theo dõi tín hiệu realtime",
                color = if (hasAlert) Color(0xFFB91C1C) else PrimaryBlue,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                if (hasAlert) {
                    "Tín hiệu hiện quá yếu hoặc không ổn định. Hãy kiểm tra tiếp xúc cảm biến, WiFi và vị trí đặt đầu nghe trước khi lưu kết quả."
                } else {
                    "Đang nhận dữ liệu âm thanh từ hệ thống Smart Health. Kết quả chẩn đoán chỉ hiển thị khi hệ thống phân tích xong dữ liệu thật."
                },
                color = if (hasAlert) Color(0xFF7F1D1D) else Color(0xFF1E3A8A),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = 20.sp
            )
        }
    }
}

@Composable
private fun AnalysisModeCard(mode: String, onModeChange: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Chế độ phân tích", color = Color(0xFF374151), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "Chuẩn Bell & Diaphragm",
                color = PrimaryTeal,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.background(PrimaryTeal.copy(alpha = 0.1f), RoundedCornerShape(999.dp)).padding(horizontal = 8.dp, vertical = 3.dp)
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFF3F4F6), RoundedCornerShape(12.dp))
                .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            ModeButton(
                modifier = Modifier.weight(1f),
                label = "Tim mạch",
                icon = Icons.Default.Favorite,
                selected = mode == "heart",
                selectedColor = PrimaryBlue,
                onClick = { onModeChange("heart") }
            )
            ModeButton(
                modifier = Modifier.weight(1f),
                label = "Hô hấp",
                icon = Icons.Default.Air,
                selected = mode == "lung",
                selectedColor = PrimaryTeal,
                onClick = { onModeChange("lung") }
            )
        }
    }
}

@Composable
private fun ModeButton(
    modifier: Modifier = Modifier,
    label: String,
    icon: ImageVector,
    selected: Boolean,
    selectedColor: Color,
    onClick: () -> Unit
) {
    Row(
        modifier = modifier
            .height(44.dp)
            .background(if (selected) Color.White else Color.Transparent, RoundedCornerShape(10.dp))
            .border(1.dp, if (selected) Color(0xFFE5E7EB) else Color.Transparent, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = if (selected) selectedColor else TextSecondary, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            label,
            color = if (selected) selectedColor else TextSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun RecordButton(isRecording: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val buttonSize by animateDpAsState(
        targetValue = if (isRecording) 80.dp else 72.dp,
        animationSpec = tween(250),
        label = "record-button-size"
    )

    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(buttonSize + 16.dp)
                .background(
                    if (isRecording) ErrorRed.copy(alpha = 0.12f) else PrimaryBlue.copy(alpha = 0.1f),
                    CircleShape
                ),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .size(buttonSize)
                    .background(if (isRecording) ErrorRed else PrimaryBlue, CircleShape)
                    .border(3.dp, Color.White, CircleShape)
                    .clickable(enabled = enabled, onClick = onClick),
                contentAlignment = Alignment.Center
            ) {
                if (isRecording) {
                    Box(modifier = Modifier.size(28.dp).background(Color.White, RoundedCornerShape(4.dp)))
                } else {
                    Box(modifier = Modifier.size(32.dp).background(Color.White, CircleShape))
                }
            }
        }
    }
}
