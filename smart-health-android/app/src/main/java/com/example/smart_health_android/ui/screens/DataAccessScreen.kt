package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun DataAccessScreen(onNavigateBack: () -> Unit) {
    var shareDoctors by remember { mutableStateOf(true) }
    var cloudSync by remember { mutableStateOf(false) }
    var aiResearch by remember { mutableStateOf(false) }
    var thirdParty by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Quyền Truy Cập Dữ Liệu", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Quản lý cách dữ liệu y tế, bản ghi âm thanh và báo cáo phân tích của bạn được sử dụng và chia sẻ.",
                color = TextSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )

            DataAccessCard(
                icon = Icons.Default.Groups,
                iconTint = PrimaryBlue,
                title = "Chia sẻ với Bác sĩ",
                description = "Cho phép các bác sĩ trong hệ thống của phòng khám xem hồ sơ và bản thu âm của bạn.",
                checked = shareDoctors,
                onCheckedChange = { shareDoctors = it }
            )
            DataAccessCard(
                icon = Icons.Default.Cloud,
                iconTint = PrimaryBlue,
                title = "Đồng bộ Đám mây (Cloud)",
                description = "Tự động sao lưu dữ liệu đo nhịp tim, nhịp thở lên máy chủ bảo mật chuẩn HIPAA.",
                checked = cloudSync,
                onCheckedChange = { cloudSync = it }
            )
            DataAccessCard(
                icon = Icons.Default.Psychology,
                iconTint = PrimaryBlue,
                title = "Nghiên cứu Edge AI",
                description = "Đóng góp dữ liệu ẩn danh để cải thiện mô hình AI phát hiện bệnh lý.",
                checked = aiResearch,
                onCheckedChange = { aiResearch = it }
            )
            DataAccessCard(
                icon = Icons.Default.Hub,
                iconTint = TextSecondary,
                title = "Ứng dụng bên thứ ba",
                description = "Cấp quyền cho các ứng dụng theo dõi sức khỏe khác như Google Fit đọc dữ liệu.",
                checked = thirdParty,
                onCheckedChange = { thirdParty = it }
            )
        }
    }
}

@Composable
private fun DataAccessCard(
    icon: ImageVector,
    iconTint: Color,
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .clickable { onCheckedChange(!checked) }
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(24.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(description, color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
        }
        Spacer(modifier = Modifier.width(12.dp))
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = PrimaryTeal,
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = Color(0xFFD1D5DB)
            )
        )
    }
}
