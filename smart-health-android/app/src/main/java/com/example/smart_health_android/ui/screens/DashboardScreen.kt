package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SsidChart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.drawBehind
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanLabel
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.ui.theme.Background
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import com.example.smart_health_android.ui.theme.SmarthealthandroidTheme
import com.example.smart_health_android.ui.theme.SuccessGreen
import com.example.smart_health_android.ui.theme.Surface
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import com.example.smart_health_android.ui.theme.WarningYellow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun DashboardScreen(
    onNavigateToSettings: () -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToBluetooth: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var backendStatus by remember { mutableStateOf(BackendStatus()) }
    var scans by remember { mutableStateOf<List<Scan>>(emptyList()) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var stoppingScanId by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    suspend fun refreshDashboard() {
        runCatching {
            backendStatus = SmartHealthRepository.api.getStatus()
            scans = SmartHealthRepository.api.listScans(limit = 5)
            loadError = null
        }.onFailure {
            loadError = it.message ?: "Không kết nối được máy chủ"
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            refreshDashboard()
            delay(4000)
        }
    }

    fun stopScan(scan: Scan) {
        if (stoppingScanId != null) return
        coroutineScope.launch {
            stoppingScanId = scan.id
            runCatching {
                SmartHealthRepository.api.stopScan(scan.id)
                refreshDashboard()
            }.onFailure {
                loadError = it.message ?: "Không dừng được lượt ghi"
            }
            stoppingScanId = null
        }
    }

    val filteredScans = remember(scans, searchQuery) {
        val query = searchQuery.trim().lowercase()
        if (query.isBlank()) {
            scans.take(3)
        } else {
            scans.filter { scan ->
                listOf(scan.id, scan.patientName, scan.patientCode, scan.mode)
                    .any { it.lowercase().contains(query) }
            }.take(5)
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Background),
        contentPadding = PaddingValues(bottom = 28.dp)
    ) {
        item {
            DoctorDashboardHeader(
                searchQuery = searchQuery,
                onSearchQueryChange = { searchQuery = it },
                onNavigateToSettings = onNavigateToSettings,
                onNavigateToNotifications = onNavigateToNotifications
            )
        }

        item {
            Column(
                modifier = Modifier
                    .padding(horizontal = 24.dp)
                    .offset(y = (-28).dp)
            ) {
                DeviceStatusCard(
                    status = backendStatus,
                    error = loadError,
                    onClick = onNavigateToBluetooth
                )

                Spacer(modifier = Modifier.height(22.dp))

                Text(
                    text = "Tác vụ nhanh",
                    color = TextPrimary,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.SsidChart,
                        label = "Đo ngay",
                        background = PrimaryBlue,
                        contentColor = Color.White,
                        onClick = onNavigateToMonitoring
                    )
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Description,
                        label = "Hồ sơ",
                        background = Color.White,
                        contentColor = PrimaryBlue,
                        borderColor = PrimaryBlue,
                        onClick = onNavigateToRecords
                    )
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.ChatBubbleOutline,
                        label = "Chat AI",
                        background = PrimaryTeal,
                        contentColor = Color.White,
                        onClick = onNavigateToAssistant
                    )
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Add,
                        label = "Đo mới",
                        background = Color.White,
                        contentColor = PrimaryBlue,
                        dashed = true,
                        onClick = onNavigateToNewScan
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Kết quả gần đây",
                        color = TextPrimary,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "Xem tất cả",
                        color = PrimaryBlue,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.clickable(onClick = onNavigateToRecords)
                    )
                }

                if (filteredScans.isEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    EmptyRecentScans(loadError = loadError)
                }
            }
        }

        items(filteredScans, key = { it.id }) { scan ->
            RecentScanCard(
                scan = scan,
                onClick = { onNavigateToRecordDetail(scan.id) },
                onStopRecording = { stopScan(scan) },
                isStopping = stoppingScanId == scan.id
            )
        }
    }
}

@Composable
private fun DoctorDashboardHeader(
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
            .statusBarsPadding()
            .padding(start = 24.dp, end = 24.dp, top = 18.dp, bottom = 64.dp)
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Chào mừng trở lại,",
                        color = Color.White.copy(alpha = 0.82f),
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Bs. Tuấn",
                        color = Color.White,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HeaderIconButton(icon = Icons.Default.Settings, onClick = onNavigateToSettings)
                    HeaderIconButton(icon = Icons.Default.Notifications, onClick = onNavigateToNotifications)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            TextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                placeholder = {
                    Text(
                        text = "Tìm kiếm bệnh nhân...",
                        color = Color.White.copy(alpha = 0.65f),
                        fontSize = 14.sp
                    )
                },
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.7f)
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .border(1.dp, Color.White.copy(alpha = 0.28f), RoundedCornerShape(14.dp)),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.18f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.18f),
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedTextColor = Color.White,
                    unfocusedTextColor = Color.White,
                    cursorColor = Color.White
                ),
                singleLine = true,
                shape = RoundedCornerShape(14.dp)
            )
        }
    }
}

@Composable
private fun HeaderIconButton(icon: ImageVector, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(46.dp)
            .background(Color.White.copy(alpha = 0.18f), CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.28f), CircleShape)
    ) {
        Icon(icon, contentDescription = null, tint = Color.White)
    }
}

@Composable
private fun DeviceStatusCard(
    status: BackendStatus,
    error: String?,
    onClick: () -> Unit
) {
    val connected = status.espCount > 0
    val statusColor = if (connected) SuccessGreen else WarningYellow
    val statusText = when {
        error != null -> "Không kết nối máy chủ"
        connected -> "Đã nhận tín hiệu ESP32"
        else -> "Chờ tín hiệu thiết bị"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Border)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .background(statusColor.copy(alpha = 0.12f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.MonitorHeart,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(23.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Trạng thái thiết bị",
                        color = TextSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = statusText,
                        color = statusColor,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatusPill(icon = Icons.Default.MonitorHeart, text = "${status.espCount}")
                    Icon(Icons.Default.Wifi, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .background(Border, CircleShape)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(if (connected) 1f else 0.18f)
                        .height(6.dp)
                        .background(Brush.horizontalGradient(listOf(statusColor, PrimaryTeal)), CircleShape)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "Máy chủ: ${status.sampleRate} Hz • UDP ${status.udpPort}",
                color = TextSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun StatusPill(icon: ImageVector, text: String) {
    Row(
        modifier = Modifier
            .background(Surface, CircleShape)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(14.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(text = text, color = TextPrimary, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun QuickActionTile(
    modifier: Modifier,
    icon: ImageVector,
    label: String,
    background: Color,
    contentColor: Color,
    onClick: () -> Unit,
    borderColor: Color? = null,
    dashed: Boolean = false
) {
    val shape = RoundedCornerShape(14.dp)
    val borderModifier = when {
        dashed -> Modifier.drawBehind {
            drawRoundRect(
                color = PrimaryBlue,
                style = Stroke(
                    width = 1.5.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 10f), 0f)
                ),
                cornerRadius = CornerRadius(14.dp.toPx(), 14.dp.toPx())
            )
        }
        borderColor != null -> Modifier.border(1.5.dp, borderColor, shape)
        else -> Modifier
    }

    Column(
        modifier = modifier
            .aspectRatio(0.92f)
            .background(background, shape)
            .then(borderModifier)
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(30.dp))
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = label,
            color = contentColor,
            fontSize = 12.sp,
            lineHeight = 14.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun EmptyRecentScans(loadError: String?) {
    val message = loadError ?: "Chưa có lượt đo nào. Bấm Đo mới để tạo hồ sơ đầu tiên."
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(14.dp))
            .border(1.dp, Border, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Warning, contentDescription = null, tint = WarningYellow, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Text(text = message, color = TextSecondary, fontSize = 14.sp, lineHeight = 19.sp)
    }
}

@Composable
private fun RecentScanCard(
    scan: Scan,
    onClick: () -> Unit,
    onStopRecording: () -> Unit,
    isStopping: Boolean
) {
    val normal = scanIsNormal(scan)
    val isRecording = scan.isRecording
    val badgeColor = when {
        isRecording -> PrimaryBlue
        normal -> SuccessGreen
        else -> WarningYellow
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            .offset(y = (-16).dp)
            .padding(bottom = 12.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Border)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = scan.id,
                        color = TextSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = scan.patientName,
                        color = TextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = scanLabel(scan),
                    color = badgeColor,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .background(badgeColor.copy(alpha = 0.1f), CircleShape)
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Đo ${if (scan.isHeart) "tim" else "phổi"}",
                    color = TextSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "${scan.formattedDate()} • ${scan.formattedTime()}",
                    color = TextSecondary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Surface, RoundedCornerShape(12.dp))
                    .border(1.dp, Border, RoundedCornerShape(12.dp))
                    .padding(12.dp)
            ) {
                Column {
                    Text(
                        text = "Kết luận AI:",
                        color = TextSecondary,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = scanSummary(scan),
                        color = TextPrimary,
                        fontSize = 14.sp,
                        lineHeight = 19.sp,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (isRecording) {
                Spacer(modifier = Modifier.height(12.dp))
                TextButton(
                    onClick = onStopRecording,
                    enabled = !isStopping,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = PrimaryBlue
                    ),
                    modifier = Modifier.align(Alignment.End)
                ) {
                    if (isStopping) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = PrimaryBlue
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text("Dừng ghi và lưu", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun DashboardScreenPreview() {
    SmarthealthandroidTheme {
        DashboardScreen(
            onNavigateToSettings = {},
            onNavigateToMonitoring = {},
            onNavigateToRecords = {},
            onNavigateToAssistant = {},
            onNavigateToNewScan = {},
            onNavigateToNotifications = {},
            onNavigateToBluetooth = {},
            onNavigateToRecordDetail = {}
        )
    }
}
