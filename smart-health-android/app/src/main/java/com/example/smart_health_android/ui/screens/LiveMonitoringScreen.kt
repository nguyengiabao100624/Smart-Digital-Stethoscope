package com.example.smart_health_android.ui.screens

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
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

@Composable
fun LiveMonitoringScreen(onNavigateBack: () -> Unit) {
    var isRecording by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf("heart") }
    var heartRate by remember { mutableStateOf(72) }
    var respRate by remember { mutableStateOf(16) }
    var sqi by remember { mutableStateOf(98) }
    var hasAlert by remember { mutableStateOf(false) }

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
        while (true) {
            delay(2000)
            heartRate = (heartRate + ((Math.random() * 3).toInt() - 1)).coerceIn(60, 100)
            respRate = (respRate + ((Math.random() * 3).toInt() - 1)).coerceIn(12, 25)
            sqi = (sqi + ((Math.random() * 3).toInt() - 1)).coerceIn(85, 100)
        }
    }

    LaunchedEffect(isRecording, mode) {
        hasAlert = false
        if (isRecording && mode == "lung") {
            delay(5000)
            hasAlert = true
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        MonitoringHeader(onNavigateBack = onNavigateBack)
        PatientInfoStrip()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            WaveformCard(
                mode = mode,
                isRecording = isRecording,
                hasAlert = hasAlert,
                phase = phase
            )

            Spacer(modifier = Modifier.height(16.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
                VitalCard(
                    modifier = Modifier.weight(1f),
                    label = if (mode == "heart") "Nhịp Tim" else "Nhịp Thở",
                    value = if (mode == "heart") heartRate.toString() else respRate.toString(),
                    unit = if (mode == "heart") "BPM" else "RPM",
                    icon = if (mode == "heart") Icons.Default.Favorite else Icons.Default.Air,
                    accent = if (mode == "heart") ErrorRed else PrimaryTeal,
                    valueColor = TextPrimary,
                    isActive = isRecording
                )
                VitalCard(
                    modifier = Modifier.weight(1f),
                    label = "Chất Lượng Tín Hiệu",
                    value = sqi.toString(),
                    unit = "% SQI",
                    icon = Icons.Default.VerifiedUser,
                    accent = PrimaryTeal,
                    valueColor = PrimaryTeal,
                    isActive = true
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            AnimatedVisibility(visible = isRecording) {
                EdgeAiAlert(hasAlert = hasAlert)
            }

            if (isRecording) Spacer(modifier = Modifier.height(16.dp))

            AnalysisModeCard(
                mode = mode,
                onModeChange = {
                    mode = it
                    hasAlert = false
                }
            )

            Spacer(modifier = Modifier.height(32.dp))

            RecordButton(
                isRecording = isRecording,
                onClick = { isRecording = !isRecording }
            )

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
                Icon(Icons.Default.Bluetooth, contentDescription = null, tint = PrimaryTeal, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    "StethoEdge Pro - Đã kết nối",
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
private fun PatientInfoStrip() {
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
            Text("Phiên khám ẩn danh", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Text("ID: #4928 • Lưu trữ cục bộ", color = TextSecondary, fontSize = 12.sp)
        }
        Text(
            "FDA Clear",
            color = PrimaryTeal,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .background(PrimaryTeal.copy(alpha = 0.1f), RoundedCornerShape(6.dp))
                .border(1.dp, PrimaryTeal.copy(alpha = 0.2f), RoundedCornerShape(6.dp))
                .padding(horizontal = 10.dp, vertical = 5.dp)
        )
    }
}

@Composable
private fun WaveformCard(
    mode: String,
    isRecording: Boolean,
    hasAlert: Boolean,
    phase: Float
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
        val sweep = if (isRecording) phase * width * 2.5f else 0f
        val step = 3

        for (x in 0..width.toInt() step step) {
            val t = (x + sweep) * 0.08f
            val y = if (mode == "heart") {
                val cycle = (t % 150f)
                val s1 = if (cycle in 10f..25f) {
                    sin(t * 4f) * 45f * exp(-((cycle - 17.5f) * (cycle - 17.5f)) / 20f)
                } else {
                    0f
                }
                val s2 = if (cycle in 60f..75f) {
                    sin(t * 5f) * 35f * exp(-((cycle - 67.5f) * (cycle - 67.5f)) / 15f)
                } else {
                    0f
                }
                centerY + s1 + s2 + sin(t * 1.7f) * 2f
            } else {
                val cycle = (t % 250f)
                val inspiration = if (cycle in 20f..100f) {
                    sin(PI.toFloat() * (cycle - 20f) / 80f) * sin(t * 9f) * 30f
                } else {
                    0f
                }
                val expiration = if (cycle in 120f..180f) {
                    sin(PI.toFloat() * (cycle - 120f) / 60f) * sin(t * 7f) * 22f
                } else {
                    0f
                }
                val crackles = if (hasAlert && isRecording && cycle in 140f..160f) {
                    sin(t * 32f) * 24f
                } else {
                    0f
                }
                centerY + inspiration + expiration + crackles + sin(t * 2f) * 2f
            }

            if (x == 0) {
                path.moveTo(x.toFloat(), y)
            } else {
                path.lineTo(x.toFloat(), y)
            }
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
                if (hasAlert) "Cảnh Báo Lâm Sàng (Edge AI)" else "Phân Tích Edge AI Trực Tiếp",
                color = if (hasAlert) Color(0xFFB91C1C) else PrimaryBlue,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.5.sp
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                if (hasAlert) {
                    "Phát hiện tiếng ran nổ (Crackles) ở thuỳ dưới phổi trái. Đề nghị kiểm tra thêm lâm sàng."
                } else {
                    "Đang theo dõi và phân tích tín hiệu âm thanh theo thời gian thực..."
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
private fun RecordButton(isRecording: Boolean, onClick: () -> Unit) {
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
                    .clickable(onClick = onClick),
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
