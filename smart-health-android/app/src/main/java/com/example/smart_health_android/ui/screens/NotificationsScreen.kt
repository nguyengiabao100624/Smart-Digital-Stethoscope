package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.example.smart_health_android.ui.theme.*

data class NotificationItem(
    val id: String,
    val type: String,
    val title: String,
    val message: String,
    val time: String,
    var read: Boolean
)

@Composable
fun NotificationsScreen(onNavigateBack: () -> Unit) {
    var notifications by remember { mutableStateOf(listOf(
        NotificationItem("1", "warning", "Kết quả bất thường", "Bệnh nhân Trần Thị Mai - Phát hiện tiếng ran nổ đáy phổi trái. Cần tái khám.", "10 phút trước", false),
        NotificationItem("2", "success", "Kết nối thành công", "Ống nghe thông minh đã được kết nối. Pin: 85%", "1 giờ trước", false),
        NotificationItem("3", "info", "Lịch hẹn sắp tới", "Bệnh nhân Nguyễn Văn An - Tái khám vào 15:30 hôm nay", "2 giờ trước", true),
        NotificationItem("4", "success", "Cập nhật mô hình AI", "Mô hình nhận diện tim phổi v3.2.1 đã được cài đặt thành công", "1 ngày trước", true),
        NotificationItem("5", "info", "Sao lưu dữ liệu", "Dữ liệu đã được đồng bộ lên cloud. 247 hồ sơ mới", "2 ngày trước", true)
    )) }

    val unreadCount = notifications.count { !it.read }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                    Column {
                        Text("Thông báo", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        if (unreadCount > 0) {
                            Text("$unreadCount thông báo chưa đọc", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
                        }
                    }
                }
                
                if (unreadCount > 0) {
                    Box(
                        modifier = Modifier
                            .background(Color.White.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .clickable {
                                notifications = notifications.map { it.copy(read = true) }
                            }
                            .padding(horizontal = 10.dp, vertical = 8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Đánh dấu đã đọc", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }

        // List
        if (notifications.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(modifier = Modifier.size(80.dp).background(Surface, CircleShape), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Notifications, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(40.dp))
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Không có thông báo", color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Bạn sẽ nhận được thông báo khi có cập nhật mới", color = TextSecondary, fontSize = 14.sp)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                contentPadding = PaddingValues(vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(notifications, key = { it.id }) { notification ->
                    val bgColor = when (notification.type) {
                        "success" -> SuccessGreen.copy(alpha = 0.1f)
                        "warning" -> WarningYellow.copy(alpha = 0.1f)
                        "info" -> PrimaryBlue.copy(alpha = 0.1f)
                        else -> Surface
                    }
                    val iconColor = when (notification.type) {
                        "success" -> SuccessGreen
                        "warning" -> WarningYellow
                        "info" -> PrimaryBlue
                        else -> TextSecondary
                    }
                    val iconVector = when (notification.type) {
                        "success" -> Icons.Default.CheckCircle
                        "warning" -> Icons.Default.Warning
                        "info" -> Icons.Default.Info
                        else -> Icons.Default.Notifications
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.White, RoundedCornerShape(16.dp))
                            .border(1.dp, if (notification.read) Border else PrimaryBlue.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                            .padding(16.dp)
                    ) {
                        Box(
                            modifier = Modifier.size(40.dp).background(bgColor, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(iconVector, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                                Text(notification.title, color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                                if (!notification.read) {
                                    Box(modifier = Modifier.size(8.dp).background(PrimaryBlue, CircleShape).padding(top = 4.dp))
                                }
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(notification.message, color = TextSecondary, fontSize = 14.sp, lineHeight = 20.sp)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.DateRange, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(12.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(notification.time, color = TextSecondary, fontSize = 12.sp)
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    if (!notification.read) {
                                        Text(
                                            "Đánh dấu đã đọc",
                                            color = PrimaryBlue,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Medium,
                                            modifier = Modifier.clickable {
                                                notifications = notifications.map { if (it.id == notification.id) it.copy(read = true) else it }
                                            }
                                        )
                                        Spacer(modifier = Modifier.width(16.dp))
                                    }
                                    Icon(
                                        Icons.Default.Delete,
                                        contentDescription = "Xóa",
                                        tint = TextSecondary,
                                        modifier = Modifier.size(16.dp).clickable {
                                            notifications = notifications.filter { it.id != notification.id }
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
