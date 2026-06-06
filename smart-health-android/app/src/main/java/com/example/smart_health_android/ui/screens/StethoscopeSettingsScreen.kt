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
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun StethoscopeSettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToBluetoothPairing: () -> Unit,
    onNavigateToBluetoothSettings: () -> Unit
) {
    var volume by remember { mutableStateOf(75f) }
    var sensitivity by remember { mutableStateOf(60f) }
    var noiseCancel by remember { mutableStateOf(true) }
    var autoConnect by remember { mutableStateOf(true) }
    var currentDevice by remember { mutableStateOf<SmartDevice?>(null) }
    var actionMessage by remember { mutableStateOf<String?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    fun updateStethoscopeSetting(field: String, value: Any) {
        coroutineScope.launch {
            try {
                SmartHealthRepository.api.updateSettings(
                    JSONObject().put("stethoscope", JSONObject().put(field, value))
                )
                actionMessage = "Đã cập nhật cài đặt ống nghe"
                actionError = null
            } catch (error: Exception) {
                actionError = error.message ?: "Không thể cập nhật cài đặt ống nghe"
            }
        }
    }

    LaunchedEffect(Unit) {
        try {
            val settings = SmartHealthRepository.api.getSettings().stethoscope
            volume = settings.optDouble("volume", volume.toDouble()).toFloat()
            sensitivity = settings.optDouble("sensitivity", sensitivity.toDouble()).toFloat()
            noiseCancel = settings.optBoolean("noiseCancel", noiseCancel)
            autoConnect = settings.optBoolean("autoConnect", autoConnect)
            val devices = SmartHealthRepository.api.listDevices()
            currentDevice = devices.firstOrNull { it.online || it.connected }
                ?: devices.firstOrNull()
            actionError = null
        } catch (error: Exception) {
            actionError = error.message ?: "Không thể tải thiết bị"
        }
    }

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
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text("Cài đặt ống nghe", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                        Text("Thiết bị AI Stethoscope Pro", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                    }
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                
                // Device Info Card
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                        .padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(48.dp)
                                    .background(Color.White.copy(alpha = 0.2f), CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.Mic, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(if (currentDevice?.online == true) "Online qua cloud" else "Chưa online", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                                Text(currentDevice?.name ?: "Chưa có thiết bị", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                            }
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.BatteryFull, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("${currentDevice?.battery ?: 0}%", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Wifi, contentDescription = null, tint = Color(0xFF10B981), modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(currentDevice?.stethoscopeSignalLabel() ?: "Chưa có RSSI", color = Color.White, fontSize = 12.sp)
                            }
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.White.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .clickable(enabled = currentDevice != null) {
                                val id = currentDevice?.id ?: return@clickable
                                coroutineScope.launch {
                                    try {
                                        val devices = SmartHealthRepository.api.listDevices()
                                        currentDevice = devices.firstOrNull { it.id == id }
                                            ?: devices.firstOrNull { it.online || it.connected }
                                            ?: devices.firstOrNull()
                                        actionMessage = "Đã làm mới trạng thái thiết bị"
                                        actionError = null
                                    } catch (error: Exception) {
                                        actionError = error.message ?: "Không thể làm mới trạng thái thiết bị"
                                    }
                                }
                            }
                            .padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Làm mới trạng thái cloud", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }
                    }
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
            actionError?.let { message ->
                Text(message, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }
            actionMessage?.let { message ->
                Text(message, color = SuccessGreen, fontSize = 13.sp)
            }

            // Section 1: Âm Thanh
            Column {
                Text("ÂM THANH", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                        .padding(20.dp)
                ) {
                    // Volume Slider
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.VolumeUp, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Âm lượng", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Text("${volume.toInt()}%", color = PrimaryBlue, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Slider(
                        value = volume,
                        onValueChange = { volume = it },
                        onValueChangeFinished = { updateStethoscopeSetting("volume", volume.toInt()) },
                        valueRange = 0f..100f,
                        colors = SliderDefaults.colors(
                            thumbColor = PrimaryBlue,
                            activeTrackColor = PrimaryBlue,
                            inactiveTrackColor = Color(0xFFE2E8F0)
                        )
                    )
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    
                    // Sensitivity Slider
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.FlashOn, contentDescription = null, tint = Color(0xFFF97316), modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Độ nhạy", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Text("${sensitivity.toInt()}%", color = Color(0xFFF97316), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Slider(
                        value = sensitivity,
                        onValueChange = { sensitivity = it },
                        onValueChangeFinished = { updateStethoscopeSetting("sensitivity", sensitivity.toInt()) },
                        valueRange = 0f..100f,
                        colors = SliderDefaults.colors(
                            thumbColor = Color(0xFFF97316),
                            activeTrackColor = Color(0xFFF97316),
                            inactiveTrackColor = Color(0xFFE2E8F0)
                        )
                    )
                    Text("Độ nhạy cao phát hiện âm thanh yếu hơn", color = TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                    
                    Spacer(modifier = Modifier.height(24.dp))
                    HorizontalDivider(color = Border)
                    Spacer(modifier = Modifier.height(16.dp))
                    
                    // Noise Cancel Toggle
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(Color(0xFF8B5CF6).copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.VolumeOff, contentDescription = null, tint = Color(0xFF8B5CF6), modifier = Modifier.size(20.dp))
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Khử nhiễu AI", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Text("Lọc tiếng ồn môi trường", color = TextSecondary, fontSize = 14.sp)
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Switch(
                            checked = noiseCancel,
                        onCheckedChange = {
                            noiseCancel = it
                            updateStethoscopeSetting("noiseCancel", it)
                        },
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = Color(0xFF10B981),
                                uncheckedThumbColor = Color.White,
                                uncheckedTrackColor = Color(0xFFE2E8F0)
                            )
                        )
                    }
                }
            }

            // Section 2: Quản Lý Kết Nối
            Column {
                Text("QUẢN LÝ KẾT NỐI", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    SettingToggleRow(
                        icon = Icons.Default.Link,
                        iconColor = SuccessGreen,
                        title = "Tự động kết nối",
                        subtitle = "Kết nối ngay khi mở ứng dụng",
                        checked = autoConnect,
                        onCheckedChange = {
                            autoConnect = it
                            updateStethoscopeSetting("autoConnect", it)
                        },
                        showDivider = true
                    )
                    SettingActionRow(
                        icon = Icons.Default.QrCodeScanner,
                        iconColor = PrimaryBlue,
                        title = "Ghép nối thiết bị mới",
                        subtitle = "Quét QR, Bluetooth hoặc mã thủ công",
                        showDivider = true,
                        onClick = onNavigateToBluetoothPairing
                    )
                    SettingActionRow(
                        icon = Icons.Default.Settings,
                        iconColor = Color(0xFF64748B),
                        title = "Quản lý thiết bị đã lưu",
                        subtitle = "Xem và xóa các thiết bị trước đây",
                        showDivider = false,
                        trailingIcon = Icons.Default.ChevronRight,
                        onClick = onNavigateToBluetoothSettings
                    )
                }
            }

            // Section 3: Hiệu Chuẩn
            Column {
                Text("HIỆU CHUẨN", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    SettingActionRow(
                        icon = Icons.Default.Refresh,
                        iconColor = Color(0xFF10B981),
                        title = "Hiệu chuẩn cảm biến",
                        subtitle = "Lần cuối: 3 ngày trước",
                        showDivider = false,
                        trailingText = "Chạy ngay",
                        trailingTextColor = PrimaryBlue,
                        onClick = {
                            val id = currentDevice?.id
                            if (id == null) {
                                actionError = "Chưa có thiết bị để hiệu chuẩn"
                            } else {
                                coroutineScope.launch {
                                    try {
                                        SmartHealthRepository.api.calibrateDevice(id)
                                        actionMessage = "Đã hiệu chuẩn thiết bị"
                                        actionError = null
                                    } catch (error: Exception) {
                                        actionError = error.message ?: "Không thể hiệu chuẩn thiết bị"
                                    }
                                }
                            }
                        }
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
                    Text("Lời khuyên", color = Color(0xFF1E3A8A), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Hiệu chuẩn cảm biến mỗi tuần để đảm bảo độ chính xác tốt nhất. Pin dưới 20% có thể ảnh hưởng chất lượng âm thanh.",
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
fun SettingToggleRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    showDivider: Boolean
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onCheckedChange(!checked) }
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

@Composable
fun SettingActionRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    subtitle: String,
    showDivider: Boolean,
    onClick: () -> Unit = {},
    trailingIcon: ImageVector? = null,
    trailingText: String? = null,
    trailingTextColor: Color = TextPrimary
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
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
            if (trailingIcon != null) {
                Icon(trailingIcon, contentDescription = null, tint = TextSecondary.copy(alpha = 0.5f))
            }
            if (trailingText != null) {
                Text(trailingText, color = trailingTextColor, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
        if (showDivider) {
            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }
}

private fun SmartDevice.stethoscopeSignalLabel(): String {
    wifiRssi?.let { return "WiFi RSSI $it dBm" }
    return "RSSI $signal dBm"
}
