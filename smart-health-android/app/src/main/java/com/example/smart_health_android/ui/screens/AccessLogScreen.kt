package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

private data class AccessLogEntry(
    val action: String,
    val device: String,
    val location: String,
    val time: String,
    val icon: ImageVector,
    val color: Color
)

@Composable
fun AccessLogScreen(onNavigateBack: () -> Unit) {
    val logs = listOf(
        AccessLogEntry(
            "Đăng nhập thành công",
            "Samsung Galaxy S23 Ultra",
            "Hồ Chí Minh, Việt Nam (IP: 14.161.x.x)",
            "14:30 - Hôm nay",
            Icons.Default.Smartphone,
            PrimaryTeal
        ),
        AccessLogEntry(
            "Bác sĩ Nguyễn Trần B xem hồ sơ",
            "Hệ thống Bệnh viện Đa khoa",
            "Cổng thông tin nội bộ",
            "09:15 - Hôm nay",
            Icons.Default.Schedule,
            PrimaryBlue
        ),
        AccessLogEntry(
            "Xuất tệp báo cáo âm phổi (PDF)",
            "Samsung Galaxy S23 Ultra",
            "Ứng dụng di động",
            "18:45 - Hôm qua",
            Icons.Default.Schedule,
            PrimaryBlue
        ),
        AccessLogEntry(
            "Cảnh báo: Sai mật khẩu 3 lần",
            "Trình duyệt Chrome (Windows)",
            "Hà Nội, Việt Nam (IP: 113.190.x.x)",
            "20:10 - 12/05/2026",
            Icons.Default.Security,
            ErrorRed
        ),
        AccessLogEntry(
            "Đổi mật khẩu tài khoản",
            "Samsung Galaxy S23 Ultra",
            "Hồ Chí Minh, Việt Nam",
            "19:00 - 10/05/2026",
            Icons.Default.Key,
            PrimaryBlue
        )
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Nhật Ký Truy Cập", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Text(
                "Theo dõi các hoạt động đăng nhập và lịch sử truy cập dữ liệu y tế của bạn.",
                color = TextSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
            Spacer(modifier = Modifier.height(24.dp))

            Column(modifier = Modifier.padding(start = 4.dp)) {
                logs.forEachIndexed { index, log ->
                    AccessLogTimelineItem(log = log, isLast = index == logs.lastIndex)
                }
            }
        }
    }
}

@Composable
private fun AccessLogTimelineItem(log: AccessLogEntry, isLast: Boolean) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .background(Color.White, CircleShape)
                    .border(2.dp, Color(0xFFE5E7EB), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Box(modifier = Modifier.size(10.dp).background(log.color, CircleShape))
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(64.dp)
                        .background(Color(0xFFE5E7EB))
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(bottom = if (isLast) 0.dp else 16.dp)
                .background(Color.White, RoundedCornerShape(12.dp))
                .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(12.dp))
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Text(
                    log.action,
                    color = if (log.color == ErrorRed) ErrorRed else TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    log.time,
                    color = Color(0xFF9CA3AF),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .background(Color(0xFFF3F4F6), RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            AccessLogMeta(text = log.device)
            Spacer(modifier = Modifier.height(4.dp))
            AccessLogMeta(text = log.location)
        }
    }
}

@Composable
private fun AccessLogMeta(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(6.dp).background(Color(0xFFD1D5DB), CircleShape))
        Spacer(modifier = Modifier.width(8.dp))
        Text(text, color = TextSecondary, fontSize = 12.sp, lineHeight = 16.sp)
    }
}
