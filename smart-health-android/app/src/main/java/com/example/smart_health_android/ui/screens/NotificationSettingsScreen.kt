package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun NotificationSettingsScreen(onNavigateBack: () -> Unit) {
    var enabled by remember { mutableStateOf(true) }
    var sound by remember { mutableStateOf(true) }
    var vibration by remember { mutableStateOf(true) }
    
    var abnormalResults by remember { mutableStateOf(true) }
    var deviceConnection by remember { mutableStateOf(true) }
    var appointments by remember { mutableStateOf(true) }
    var aiUpdates by remember { mutableStateOf(false) }
    var messages by remember { mutableStateOf(true) }

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
                .padding(start = 16.dp, end = 16.dp, top = 48.dp, bottom = 24.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text("Tùy chọn thông báo", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text("Quản lý cảnh báo và nhắc nhở", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
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
            // Section 1: Tổng Quan
            Column {
                Text("TỔNG QUAN", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    NotificationToggleRow(
                        icon = Icons.Default.NotificationsActive,
                        iconColor = PrimaryBlue,
                        title = "Bật thông báo",
                        subtitle = "Nhận tất cả thông báo",
                        checked = enabled,
                        onCheckedChange = { enabled = it },
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.VolumeUp,
                        iconColor = Color(0xFF8B5CF6),
                        title = "Âm thanh",
                        subtitle = "Phát âm thanh cảnh báo",
                        checked = sound && enabled,
                        onCheckedChange = { sound = it },
                        enabled = enabled,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.Vibration,
                        iconColor = Color(0xFFF97316),
                        title = "Rung",
                        subtitle = "Rung khi có thông báo",
                        checked = vibration && enabled,
                        onCheckedChange = { vibration = it },
                        enabled = enabled,
                        showDivider = false
                    )
                }
            }

            // Section 2: Loại Thông Báo
            Column {
                Text("LOẠI THÔNG BÁO", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                        .alpha(if (enabled) 1f else 0.5f)
                ) {
                    NotificationToggleRow(
                        icon = Icons.Default.Warning,
                        iconColor = Color(0xFFEF4444),
                        title = "Kết quả bất thường",
                        subtitle = "Cảnh báo khi phát hiện dấu hiệu bất thường",
                        checked = abnormalResults && enabled,
                        onCheckedChange = { abnormalResults = it },
                        enabled = enabled,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.CheckCircle,
                        iconColor = Color(0xFF3B82F6),
                        title = "Kết nối thiết bị",
                        subtitle = "Thông báo trạng thái ống nghe",
                        checked = deviceConnection && enabled,
                        onCheckedChange = { deviceConnection = it },
                        enabled = enabled,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.Event,
                        iconColor = Color(0xFF10B981),
                        title = "Lịch hẹn",
                        subtitle = "Nhắc nhở lịch khám bệnh",
                        checked = appointments && enabled,
                        onCheckedChange = { appointments = it },
                        enabled = enabled,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.Message,
                        iconColor = Color(0xFF00A896),
                        title = "Tin nhắn",
                        subtitle = "Chat AI và hỗ trợ",
                        checked = messages && enabled,
                        onCheckedChange = { messages = it },
                        enabled = enabled,
                        showDivider = true
                    )
                    NotificationToggleRow(
                        icon = Icons.Default.Info,
                        iconColor = Color(0xFF8B5CF6),
                        title = "Cập nhật AI",
                        subtitle = "Mô hình và tính năng mới",
                        checked = aiUpdates && enabled,
                        onCheckedChange = { aiUpdates = it },
                        enabled = enabled,
                        showDivider = false
                    )
                }
            }

            // Alert Box
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFEFF6FF), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFBFDBFE), RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFF2563EB), modifier = Modifier.padding(top = 2.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text("Lưu ý", color = Color(0xFF1E3A8A), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Khuyến nghị bật thông báo \"Kết quả bất thường\" để nhận cảnh báo kịp thời về tình trạng sức khỏe bệnh nhân.",
                        color = Color(0xFF1E40AF),
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun NotificationToggleRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
    showDivider: Boolean
) {
    Column(modifier = Modifier.alpha(if (enabled) 1f else 0.5f)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled) { onCheckedChange(!checked) }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = TextSecondary, fontSize = 14.sp)
            }
            Spacer(modifier = Modifier.width(16.dp))
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Color(0xFF10B981),
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Color(0xFFE2E8F0)
                )
            )
        }
        if (showDivider) {
            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }
}
