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
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun AICalibrationScreen(onNavigateBack: () -> Unit) {
    var selectedModel by remember { mutableStateOf("balanced") }

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
                    Text("Hiệu chuẩn mô hình AI", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text("Tối ưu hiệu suất phân tích", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
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
            // Current Model Card
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Brush.linearGradient(listOf(PrimaryBlue.copy(alpha = 0.1f), PrimaryTeal.copy(alpha = 0.1f))), RoundedCornerShape(16.dp))
                    .border(1.dp, PrimaryBlue.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                    .padding(20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(Color.White, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Psychology, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(24.dp))
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column {
                            Text("Mô hình hiện tại", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Text("AI Medical Analysis v3.2.1", color = TextSecondary, fontSize = 14.sp)
                        }
                    }
                    Box(
                        modifier = Modifier
                            .background(Color(0xFF10B981).copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                            .padding(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text("Đã cập nhật", color = Color(0xFF10B981), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(12.dp))
                        .border(1.dp, Border, RoundedCornerShape(12.dp))
                        .clickable { }
                        .padding(vertical = 12.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Download, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Cập nhật mô hình mới", color = PrimaryBlue, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }

            // Section 1: Chế Độ Phân Tích
            Column {
                Text("CHẾ ĐỘ PHÂN TÍCH", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ModelRadioCard(
                        id = "fast",
                        name = "Nhanh",
                        description = "Phân tích nhanh, độ chính xác cơ bản",
                        accuracy = "92%",
                        speed = "Rất nhanh (< 1s)",
                        selected = selectedModel == "fast",
                        onClick = { selectedModel = "fast" }
                    )
                    ModelRadioCard(
                        id = "balanced",
                        name = "Cân bằng",
                        description = "Cân bằng giữa tốc độ và độ chính xác",
                        accuracy = "96%",
                        speed = "Nhanh (1-2s)",
                        selected = selectedModel == "balanced",
                        onClick = { selectedModel = "balanced" }
                    )
                    ModelRadioCard(
                        id = "accurate",
                        name = "Chính xác cao",
                        description = "Độ chính xác tối đa, thời gian xử lý lâu hơn",
                        accuracy = "98.5%",
                        speed = "Trung bình (2-4s)",
                        selected = selectedModel == "accurate",
                        onClick = { selectedModel = "accurate" }
                    )
                }
            }

            // Section 2: Hiệu Suất Mô Hình
            Column {
                Text("HIỆU SUẤT MÔ HÌNH", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Timeline,
                        iconColor = Color(0xFF10B981),
                        label = "Phát hiện bệnh tim",
                        value = "96.8%",
                        change = "+2.3%"
                    )
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.TrendingUp,
                        iconColor = PrimaryBlue,
                        label = "Phát hiện bệnh phổi",
                        value = "94.2%",
                        change = "+1.8%"
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Speed,
                        iconColor = Color(0xFF8B5CF6),
                        label = "Độ nhạy tổng thể",
                        value = "95.5%",
                        change = "+0.9%"
                    )
                    MetricCard(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.BarChart,
                        iconColor = Color(0xFFF97316),
                        label = "Độ đặc hiệu",
                        value = "97.1%",
                        change = "+1.2%"
                    )
                }
            }

            // Section 3: Tùy Chỉnh Nâng Cao
            Column {
                Text("TÙY CHỈNH NÂNG CAO", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    SettingActionRow(
                        icon = Icons.Default.Psychology,
                        iconColor = Color(0xFF8B5CF6),
                        title = "Huấn luyện mô hình",
                        subtitle = "Tối ưu dựa trên dữ liệu của bạn",
                        showDivider = true,
                        trailingIcon = Icons.Default.ChevronRight
                    )
                    SettingActionRow(
                        icon = Icons.Default.Speed,
                        iconColor = Color(0xFFF97316),
                        title = "Ngưỡng phát hiện",
                        subtitle = "Điều chỉnh độ nhạy cảnh báo",
                        showDivider = true,
                        trailingIcon = Icons.Default.ChevronRight
                    )
                    SettingActionRow(
                        icon = Icons.Default.Refresh,
                        iconColor = PrimaryBlue,
                        title = "Reset về mặc định",
                        subtitle = "Khôi phục cài đặt gốc",
                        showDivider = false,
                        trailingIcon = Icons.Default.ChevronRight
                    )
                }
            }

            // Alert Box
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFEF3C7), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFFDE68A), RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.padding(top = 2.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text("Lưu ý quan trọng", color = Color(0xFF78350F), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Mô hình AI được đào tạo trên hàng triệu mẫu dữ liệu y khoa. Kết quả chỉ mang tính tham khảo, quyết định cuối cùng phải dựa trên đánh giá lâm sàng của bác sĩ.",
                        color = Color(0xFF92400E),
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
fun ModelRadioCard(
    id: String,
    name: String,
    description: String,
    accuracy: String,
    speed: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) PrimaryBlue else Border,
                shape = RoundedCornerShape(16.dp)
            )
            .clickable { onClick() }
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(name, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            if (selected) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(20.dp))
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(description, color = TextSecondary, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Row {
                Text("Độ chính xác: ", color = TextSecondary, fontSize = 14.sp)
                Text(accuracy, color = Color(0xFF10B981), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            Row {
                Text("Tốc độ: ", color = TextSecondary, fontSize = 14.sp)
                Text(speed, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
fun MetricCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    iconColor: Color,
    label: String,
    value: String,
    change: String
) {
    Column(
        modifier = modifier
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(16.dp))
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(label, color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(value, color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.TrendingUp, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(14.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text(change, color = Color(0xFF10B981), fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
    }
}
