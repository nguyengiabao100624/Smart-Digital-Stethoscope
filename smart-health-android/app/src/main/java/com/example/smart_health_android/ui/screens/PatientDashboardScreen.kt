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
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.ChatBubbleOutline
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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

private data class PatientRecentScan(
    val id: String,
    val date: String,
    val time: String,
    val type: String,
    val diagnosis: String,
    val isNormal: Boolean
)

@Composable
fun PatientDashboardScreen(
    onNavigateToSettings: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToBluetooth: () -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToRecordDetail: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val recentScans = remember {
        listOf(
            PatientRecentScan(
                id = "SCN-1029",
                date = "12/05/2026",
                time = "14:35",
                type = "Tim",
                diagnosis = "Nhịp xoang bình thường",
                isNormal = true
            ),
            PatientRecentScan(
                id = "SCN-1028",
                date = "10/05/2026",
                time = "09:20",
                type = "Phổi",
                diagnosis = "Phát hiện tiếng ran nổ - Đáy phổi trái",
                isNormal = false
            ),
            PatientRecentScan(
                id = "SCN-1027",
                date = "05/05/2026",
                time = "11:45",
                type = "Tim",
                diagnosis = "Âm sắc tim bình thường",
                isNormal = true
            )
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .verticalScroll(rememberScrollState())
    ) {
        PatientHomeHeader(
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
            PatientDeviceStatusCard(onClick = onNavigateToBluetooth)

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
                    label = "Chat AI",
                    background = Brush.linearGradient(listOf(PrimaryTeal, Color(0xFF00C9B7))),
                    contentColor = Color.White,
                    onClick = onNavigateToAssistant,
                    modifier = Modifier.weight(1f)
                )
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
                recentScans.forEach { scan ->
                    PatientHistoryCard(
                        date = scan.date,
                        time = scan.time,
                        type = scan.type,
                        diagnosis = scan.diagnosis,
                        isNormal = scan.isNormal,
                        onClick = onNavigateToRecordDetail
                    )
                }
            }
        }
    }
}

@Composable
private fun PatientHomeHeader(
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
                Column {
                    Text("Chào buổi sáng,", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Nguyễn Văn A", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
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
private fun PatientDeviceStatusCard(onClick: () -> Unit) {
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
                            .background(SuccessGreen.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.MonitorHeart, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(24.dp))
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Trạng thái thiết bị", color = TextSecondary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Spacer(modifier = Modifier.height(2.dp))
                        Text("Đã kết nối", color = SuccessGreen, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.BatteryFull, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(3.dp))
                        Text("85%", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                    Icon(Icons.Default.Bluetooth, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                    Icon(Icons.Default.Wifi, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

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
                Text("Kết luận AI:", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
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
