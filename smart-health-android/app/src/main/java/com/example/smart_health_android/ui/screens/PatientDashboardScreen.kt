package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SsidChart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.example.smart_health_android.R
import com.example.smart_health_android.appointments.AppointmentRoute
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.ui.theme.Background
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.ErrorRed
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import com.example.smart_health_android.ui.theme.SuccessGreen
import com.example.smart_health_android.ui.theme.Surface
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import com.example.smart_health_android.ui.theme.WarningYellow
import kotlinx.coroutines.delay

private data class PatientRecentScan(
    val id: String,
    val date: String,
    val time: String,
    val type: String,
    val diagnosis: String,
    val isNormal: Boolean
)

private fun Scan.toPatientRecentScan(): PatientRecentScan {
    return PatientRecentScan(
        id = id,
        date = formattedDate(),
        time = formattedTime(),
        type = if (isHeart) "Tim" else "Phổi",
        diagnosis = if (isRecording) "Đang ghi âm từ thiết bị." else scanSummary(this),
        isNormal = scanIsNormal(this)
    )
}

@Composable
fun PatientDashboardScreen(
    onNavigateToSettings: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToBluetooth: () -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var patientName by remember { mutableStateOf("Bệnh nhân") }
    var workspaceName by remember { mutableStateOf("") }
    var recentScans by remember { mutableStateOf<List<PatientRecentScan>>(emptyList()) }
    var currentDevice by remember { mutableStateOf<SmartDevice?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var canViewAppointments by remember { mutableStateOf(false) }
    suspend fun refreshPatientDashboard() {
        runCatching {
            val user = SmartHealthRepository.api.getMe()
            patientName = user.name.ifBlank { patientName }
            workspaceName = user.currentWorkspace?.name
                .orEmpty()
                .ifBlank { user.clinicName }
                .ifBlank { user.organizationId }
            canViewAppointments = AppointmentRoute.List.canOpen(user.capabilities.toSet())
            recentScans = SmartHealthRepository.api.listPatientScans(limit = 5).map { it.toPatientRecentScan() }
            val devices = SmartHealthRepository.api.listDevices()
            currentDevice = devices.firstOrNull { it.online || it.connected } ?: devices.firstOrNull()
            loadError = null
        }.onFailure {
            loadError = it.message ?: "Không kết nối được máy chủ"
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            refreshPatientDashboard()
            delay(5000)
        }
    }

    val visibleScans = remember(recentScans, searchQuery) {
        val query = searchQuery.trim().lowercase()
        if (query.isBlank()) {
            recentScans
        } else {
            recentScans.filter { scan ->
                listOf(scan.id, scan.type, scan.diagnosis).any { it.lowercase().contains(query) }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .verticalScroll(rememberScrollState())
    ) {
        PatientHomeHeader(
            patientName = patientName,
            workspaceName = workspaceName,
            searchQuery = searchQuery,
            onSearchQueryChange = { searchQuery = it },
            onNavigateToSettings = onNavigateToSettings,
            onNavigateToNotifications = onNavigateToNotifications
        )

        Column(
            modifier = Modifier
                .offset(y = (-64).dp)
                .padding(horizontal = 24.dp)
                .padding(bottom = 8.dp)
        ) {
            PatientDeviceStatusCard(device = currentDevice, onClick = onNavigateToBluetooth)

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                "Tác Vụ Nhanh",
                color = TextPrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                PatientQuickActionTile(
                    icon = Icons.Default.SsidChart,
                    label = "Đo Ngay",
                    background = Brush.linearGradient(listOf(PrimaryBlue, Color(0xFF0E7AB8))),
                    contentColor = Color.White,
                    onClick = onNavigateToMonitoring,
                    modifier = Modifier.weight(1f)
                )
                PatientQuickActionTile(
                    icon = Icons.Default.Description,
                    label = "Hồ Sơ Của Tôi",
                    background = Brush.linearGradient(listOf(Color.White, Color.White)),
                    contentColor = PrimaryBlue,
                    borderColor = PrimaryBlue,
                    onClick = onNavigateToRecords,
                    modifier = Modifier.weight(1f)
                )
                PatientQuickActionTile(
                    icon = Icons.Default.ChatBubbleOutline,
                    label = stringResource(R.string.ai_assistant_short_label),
                    background = Brush.linearGradient(listOf(PrimaryTeal, Color(0xFF00C9B7))),
                    contentColor = Color.White,
                    onClick = onNavigateToAssistant,
                    modifier = Modifier.weight(1f)
                )
            }

            if (canViewAppointments) {
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedButton(
                    onClick = onNavigateToAppointments,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp),
                ) {
                    Icon(Icons.Default.CalendarMonth, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.appointment_title_patient))
                }
            }

            Spacer(modifier = Modifier.height(26.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    "Lịch Sử Đo Gần Đây",
                    color = TextPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    "Xem Tất Cả",
                    color = PrimaryBlue,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable(onClick = onNavigateToRecords)
                )
            }
            Spacer(modifier = Modifier.height(14.dp))

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (loadError != null) {
                    PatientNoticeCard(text = loadError ?: "")
                } else if (visibleScans.isEmpty()) {
                    PatientNoticeCard(text = "Chưa có hồ sơ đo từ máy chủ.")
                } else {
                    visibleScans.forEach { scan ->
                        PatientHistoryCard(
                            date = scan.date,
                            time = scan.time,
                            type = scan.type,
                            diagnosis = scan.diagnosis,
                            isNormal = scan.isNormal,
                            onClick = { onNavigateToRecordDetail(scan.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PatientHomeHeader(
    patientName: String,
    workspaceName: String,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToNotifications: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp))
            .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
            .padding(start = 24.dp, end = 24.dp, top = 48.dp, bottom = 96.dp)
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Chào buổi sáng,", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        patientName,
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (workspaceName.isNotBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = workspaceName,
                            color = Color.White.copy(alpha = 0.76f),
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PatientHeaderIconButton(icon = Icons.Default.Settings, onClick = onNavigateToSettings)
                    Box(contentAlignment = Alignment.TopEnd) {
                        PatientHeaderIconButton(icon = Icons.Default.Notifications, onClick = onNavigateToNotifications)
                        Box(
                            modifier = Modifier
                                .offset(x = (-4).dp, y = 4.dp)
                                .size(12.dp)
                                .background(ErrorRed, CircleShape)
                                .border(2.dp, PrimaryBlue, CircleShape)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                placeholder = {
                    Text(
                        "Tìm kiếm hồ sơ, thông tin...",
                        color = Color.White.copy(alpha = 0.6f)
                    )
                },
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.6f)
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                shape = RoundedCornerShape(16.dp),
                textStyle = LocalTextStyle.current.copy(color = Color.White, fontSize = 15.sp),
                colors = OutlinedTextFieldDefaults.colors(
                    unfocusedContainerColor = Color.White.copy(alpha = 0.2f),
                    focusedContainerColor = Color.White.copy(alpha = 0.2f),
                    unfocusedBorderColor = Color.White.copy(alpha = 0.3f),
                    focusedBorderColor = Color.White.copy(alpha = 0.5f),
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White
                ),
                singleLine = true
            )
        }
    }
}

@Composable
private fun PatientHeaderIconButton(icon: ImageVector, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .background(Color.White.copy(alpha = 0.2f), CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.3f), CircleShape)
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
    }
}

@Composable
private fun PatientDeviceStatusCard(device: SmartDevice?, onClick: () -> Unit) {
    val isOnline = device?.online == true || device?.connected == true
    val statusColor = if (isOnline) SuccessGreen else WarningYellow
    val statusText = when {
        device == null -> "Chưa ghép thiết bị"
        isOnline -> "Online qua cloud"
        else -> "Chưa online"
    }
    val batteryText = device?.battery?.takeIf { it > 0 }?.coerceIn(0, 100)?.let { "$it%" } ?: "--"
    val signalText = device?.wifiRssi?.let { "WiFi $it dBm" }
        ?: device?.signal?.let { "RSSI $it dBm" }
        ?: "Chưa có RSSI"
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Border)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .background(statusColor.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.MonitorHeart, contentDescription = null, tint = statusColor, modifier = Modifier.size(24.dp))
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Trạng thái thiết bị", color = TextSecondary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(statusText, color = statusColor, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.BatteryFull, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(3.dp))
                        Text(batteryText, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                    Icon(Icons.Default.Wifi, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(
                "${device?.name?.ifBlank { "Smart Health Stethoscope" } ?: "Chưa có thiết bị"} • $signalText",
                color = TextSecondary,
                fontSize = 12.sp,
                maxLines = 1
            )
            if (!device?.firmwareVersion.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text("Firmware ${device?.firmwareVersion}", color = TextSecondary, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .background(Surface, CircleShape)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(0.85f)
                        .height(6.dp)
                        .background(Brush.horizontalGradient(listOf(SuccessGreen, PrimaryTeal)), CircleShape)
                )
            }
        }
    }
}

@Composable
private fun PatientQuickActionTile(
    icon: ImageVector,
    label: String,
    background: Brush,
    contentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    borderColor: Color? = null
) {
    Card(
        modifier = modifier
            .height(112.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        elevation = CardDefaults.cardElevation(defaultElevation = if (borderColor == null) 7.dp else 2.dp),
        shape = RoundedCornerShape(18.dp),
        border = borderColor?.let { androidx.compose.foundation.BorderStroke(2.dp, it) }
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(background)
                .padding(horizontal = 8.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(32.dp))
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                label,
                color = contentColor,
                fontSize = 12.sp,
                lineHeight = 15.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun PatientNoticeCard(text: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Border)
    ) {
        Text(
            text,
            color = TextSecondary,
            fontSize = 14.sp,
            lineHeight = 20.sp,
            modifier = Modifier.padding(16.dp)
        )
    }
}

@Composable
fun PatientHistoryCard(
    date: String,
    time: String,
    type: String,
    diagnosis: String,
    isNormal: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        shape = RoundedCornerShape(18.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, Border)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("$date • $time", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Đo $type", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                }
                Spacer(modifier = Modifier.width(10.dp))
                PatientStatusBadge(isNormal = isNormal)
            }

            Spacer(modifier = Modifier.height(12.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
                    .border(1.dp, Color(0xFFEFF3F8), RoundedCornerShape(12.dp))
                    .padding(12.dp)
            ) {
                Text(stringResource(R.string.ai_assistant_result_label), color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Spacer(modifier = Modifier.height(4.dp))
                Text(diagnosis, color = TextPrimary, fontSize = 14.sp, lineHeight = 19.sp)
            }
        }
    }
}

@Composable
private fun PatientStatusBadge(isNormal: Boolean) {
    val color = if (isNormal) SuccessGreen else WarningYellow
    val icon = if (isNormal) Icons.Default.CheckCircle else Icons.Default.Warning
    val label = if (isNormal) "Bình thường" else "Bất thường"

    Row(
        modifier = Modifier
            .background(color.copy(alpha = 0.1f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(label, color = color, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}
