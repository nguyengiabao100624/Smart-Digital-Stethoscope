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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun DataStorageScreen(
    onNavigateBack: () -> Unit,
    onNavigateToExportData: () -> Unit,
    onNavigateToDeleteData: () -> Unit
) {
    var autoSync by remember { mutableStateOf(true) }
    var cloudBackup by remember { mutableStateOf(true) }

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
                    Text("Lưu trữ dữ liệu", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text("Quản lý dung lượng và sao lưu", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
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
            // Storage Overview
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StorageCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Save,
                    iconColor = PrimaryBlue,
                    title = "Bộ nhớ thiết bị",
                    used = "2.4 GB",
                    total = "/ 8.0 GB",
                    percentage = 0.3f,
                    progressColors = listOf(PrimaryBlue, PrimaryTeal)
                )
                StorageCard(
                    modifier = Modifier.weight(1f),
                    icon = Icons.Default.Cloud,
                    iconColor = Color(0xFF3B82F6),
                    title = "Bộ nhớ đám mây",
                    used = "12.8 GB",
                    total = "/ 50.0 GB",
                    percentage = 0.25f,
                    progressColors = listOf(Color(0xFF3B82F6), Color(0xFF60A5FA))
                )
            }

            // Section 1: Phân Loại Dữ Liệu
            Column {
                Text("PHÂN LOẠI DỮ LIỆU", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    DataCategoryRow(
                        icon = Icons.Default.Storage,
                        iconColor = PrimaryBlue,
                        name = "Hồ sơ bệnh án",
                        count = "247 hồ sơ",
                        size = "1.8 GB",
                        showDivider = true
                    )
                    DataCategoryRow(
                        icon = Icons.Default.Save,
                        iconColor = Color(0xFF8B5CF6),
                        name = "File âm thanh",
                        count = "892 file",
                        size = "3.2 GB",
                        showDivider = true
                    )
                    DataCategoryRow(
                        icon = Icons.Default.Upload,
                        iconColor = Color(0xFF10B981),
                        name = "Hình ảnh y tế",
                        count = "1,245 ảnh",
                        size = "1.5 GB",
                        showDivider = true
                    )
                    DataCategoryRow(
                        icon = Icons.Default.CheckCircle,
                        iconColor = Color(0xFFF97316),
                        name = "Báo cáo AI",
                        count = "564 báo cáo",
                        size = "890 MB",
                        showDivider = false
                    )
                }
            }

            // Section 2: Đồng Bộ & Sao Lưu
            Column {
                Text("ĐỒNG BỘ & SAO LƯU", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    SettingToggleRow(
                        icon = Icons.Default.Sync,
                        iconColor = Color(0xFF10B981),
                        title = "Tự động đồng bộ",
                        subtitle = "Đồng bộ khi có Wi-Fi",
                        checked = autoSync,
                        onCheckedChange = { autoSync = it },
                        showDivider = true
                    )
                    SettingToggleRow(
                        icon = Icons.Default.Cloud,
                        iconColor = Color(0xFF3B82F6),
                        title = "Sao lưu đám mây",
                        subtitle = "Lần cuối: 2 giờ trước",
                        checked = cloudBackup,
                        onCheckedChange = { cloudBackup = it },
                        showDivider = true
                    )
                    SettingActionRow(
                        icon = Icons.Default.Download,
                        iconColor = Color(0xFF8B5CF6),
                        title = "Xuất dữ liệu",
                        subtitle = "Tải xuống bản sao toàn bộ dữ liệu",
                        showDivider = false,
                        trailingIcon = Icons.Default.ChevronRight,
                        onClick = onNavigateToExportData
                    )
                }
            }

            // Section 3: Quản Lý Dung Lượng
            Column {
                Text("QUẢN LÝ DUNG LƯỢNG", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    SettingActionRow(
                        icon = Icons.Default.Delete,
                        iconColor = Color(0xFFF97316),
                        title = "Xóa bộ nhớ tạm",
                        subtitle = "Giải phóng 450 MB",
                        showDivider = true,
                        trailingText = "Xóa",
                        trailingTextColor = Color(0xFFF97316)
                    )
                    SettingActionRow(
                        icon = Icons.Default.Warning,
                        iconColor = Color(0xFFEF4444),
                        title = "Xóa toàn bộ dữ liệu",
                        subtitle = "Không thể khôi phục",
                        showDivider = false,
                        trailingIcon = Icons.Default.ChevronRight,
                        onClick = onNavigateToDeleteData
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
                Icon(Icons.Default.Shield, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.padding(top = 2.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text("Bảo Mật Dữ Liệu", color = Color(0xFF78350F), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Tất cả dữ liệu được mã hóa AES-256 cả trên thiết bị và đám mây. Tuân thủ chuẩn HIPAA về bảo mật thông tin y tế.",
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
fun StorageCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    iconColor: Color,
    title: String,
    used: String,
    total: String,
    percentage: Float,
    progressColors: List<Color>
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
            Text(title, color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(used, color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(4.dp))
        Text(total, color = TextSecondary, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(Border)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(percentage)
                    .fillMaxHeight()
                    .background(Brush.horizontalGradient(progressColors))
            )
        }
    }
}

@Composable
fun DataCategoryRow(
    icon: ImageVector,
    iconColor: Color,
    name: String,
    count: String,
    size: String,
    showDivider: Boolean
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
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
                Text(name, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(count, color = TextSecondary, fontSize = 14.sp)
            }
            Spacer(modifier = Modifier.width(16.dp))
            Text(size, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        }
        if (showDivider) {
            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }
}
