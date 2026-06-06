package com.example.smart_health_android.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.ErrorRed
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.SuccessGreen
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import kotlinx.coroutines.launch

@Composable
fun BluetoothSettingsScreen(
    onNavigateBack: () -> Unit,
    onAddDevice: () -> Unit
) {
    DeviceManagementScreen(
        onNavigateBack = onNavigateBack,
        onAddDevice = onAddDevice
    )
}

@Composable
fun DeviceManagementScreen(
    onNavigateBack: () -> Unit,
    onAddDevice: () -> Unit
) {
    var devices by remember { mutableStateOf<List<SmartDevice>>(emptyList()) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var disconnectingId by remember { mutableStateOf<String?>(null) }
    var deletingId by remember { mutableStateOf<String?>(null) }
    var pendingDisconnect by remember { mutableStateOf<SmartDevice?>(null) }
    val coroutineScope = rememberCoroutineScope()

    suspend fun refreshDevices() {
        runCatching {
            devices = SmartHealthRepository.api.listDevices()
            loadError = null
        }.onFailure {
            loadError = it.message ?: "Không tải được danh sách thiết bị"
        }
    }

    LaunchedEffect(Unit) {
        refreshDevices()
    }

    fun disconnect(device: SmartDevice) {
        if (disconnectingId != null) return
        pendingDisconnect = null
        disconnectingId = device.id
        coroutineScope.launch {
            runCatching {
                val disconnected = SmartHealthRepository.api.disconnectDevice(device.id)
                devices = devices.map { if (it.id == device.id) disconnected else it }
                loadError = null
            }.onFailure {
                loadError = it.message ?: "Không thể ngắt kết nối thiết bị"
            }
            disconnectingId = null
        }
    }

    fun deleteDevice(device: SmartDevice) {
        if (deletingId != null) return
        deletingId = device.id
        coroutineScope.launch {
            runCatching {
                SmartHealthRepository.api.deleteDevice(device.id)
                devices = devices.filterNot { it.id == device.id }
                loadError = null
            }.onFailure {
                loadError = it.message ?: "Không thể xóa thiết bị"
            }
            deletingId = null
        }
    }

    val connectedDevice = devices.firstOrNull { it.online || it.connected || it.status == "connected" }
    val historyDevices = devices
        .filter { it.id != connectedDevice?.id }

    pendingDisconnect?.let { device ->
        AlertDialog(
            onDismissRequest = { pendingDisconnect = null },
            title = { Text("Ngắt kết nối thiết bị?") },
            text = { Text("Thiết bị ${device.name.ifBlank { "Stetho-AI-Pro" }} sẽ được đưa về Lịch Sử Ghép Nối.") },
            confirmButton = {
                TextButton(onClick = { disconnect(device) }) {
                    Text("Ngắt kết nối", color = ErrorRed, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDisconnect = null }) {
                    Text("Hủy")
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Quản Lý Thiết Bị", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            connectedDevice?.let { device ->
                SectionLabel("THIẾT BỊ ĐANG KẾT NỐI")
                Spacer(modifier = Modifier.size(10.dp))
                ConnectedDeviceCard(
                    device = device,
                    isDisconnecting = disconnectingId == device.id,
                    onDisconnect = { pendingDisconnect = device }
                )
                Spacer(modifier = Modifier.size(24.dp))
            }

            loadError?.let {
                Text(it, color = ErrorRed, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 8.dp))
                Spacer(modifier = Modifier.size(12.dp))
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 2.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                SectionLabel("LỊCH SỬ GHÉP NỐI")
                Row(
                    modifier = Modifier
                        .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape)
                        .clickable(onClick = onAddDevice)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("+ Thêm thiết bị", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }

            Spacer(modifier = Modifier.size(10.dp))
            if (historyDevices.isEmpty()) {
                EmptyHistoryCard()
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
                ) {
                    historyDevices.forEachIndexed { index, device ->
                        SavedDeviceRow(
                            device = device,
                            method = "Đã lưu (ghép nối qua ${device.displayConnectionMethod(index)})",
                            isDeleting = deletingId == device.id,
                            onDelete = { deleteDevice(device) },
                            showDivider = index < historyDevices.lastIndex
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.size(24.dp))
            Row(modifier = Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.Info, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    "Quản lý các thiết bị ống nghe đã từng kết nối. Để thêm thiết bị mới bằng QR code hoặc Bluetooth, vui lòng nhấn \"Thêm thiết bị\".",
                    color = TextSecondary,
                    fontSize = 12.sp,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
private fun ConnectedDeviceCard(
    device: SmartDevice,
    isDisconnecting: Boolean,
    onDisconnect: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "device-status-pulse")
    val dotScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.55f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "connected-dot"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, SuccessGreen.copy(alpha = 0.24f), RoundedCornerShape(16.dp))
    ) {
        Box(
            modifier = Modifier
                .matchParentSize(),
            contentAlignment = Alignment.CenterStart
        ) {
            Box(
                modifier = Modifier
                    .width(6.dp)
                    .fillMaxHeight()
                    .background(SuccessGreen)
            )
        }

        Column(
            modifier = Modifier
            .padding(start = 18.dp, top = 16.dp, end = 16.dp, bottom = 14.dp)
        ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(SuccessGreen.copy(alpha = 0.1f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.MedicalServices, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(26.dp))
                }
                Spacer(modifier = Modifier.size(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        device.name.ifBlank { "Stetho-AI-Pro" },
                        color = TextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .scale(dotScale)
                                .background(SuccessGreen, CircleShape)
                        )
                        Spacer(modifier = Modifier.size(7.dp))
                        Text(device.cloudStatusLabel(), color = SuccessGreen, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
            Row(
                modifier = Modifier
                    .background(ErrorRed.copy(alpha = 0.1f), RoundedCornerShape(10.dp))
                    .clickable(enabled = !isDisconnecting, onClick = onDisconnect)
                    .padding(horizontal = 10.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.PowerSettingsNew, contentDescription = null, tint = ErrorRed, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text(if (isDisconnecting) "Đang ngắt" else "Ngắt kết nối", color = ErrorRed, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }

        Spacer(modifier = Modifier.size(14.dp))
        HorizontalDivider(color = Color(0xFFF1F5F9))
        Spacer(modifier = Modifier.size(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.BatteryFull, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.size(6.dp))
                Text("Pin: ${device.battery.coerceIn(0, 100)}%", color = TextSecondary, fontSize = 12.sp)
            }
            Text(device.signalLabel(), color = TextSecondary, fontSize = 12.sp)
        }
        Spacer(modifier = Modifier.size(8.dp))
        Text(
            "Firmware ${device.firmwareLabel()} • ${device.displayConnectionMethod()}",
            color = TextSecondary,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
    }
}

@Composable
private fun SavedDeviceRow(
    device: SmartDevice,
    method: String,
    isDeleting: Boolean,
    onDelete: () -> Unit,
    showDivider: Boolean
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(Color(0xFFF3F4F6), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.MedicalServices, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(22.dp))
                }
                Spacer(modifier = Modifier.size(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(device.name, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(method, color = TextSecondary, fontSize = 12.sp)
                }
            }
            Text(
                if (isDeleting) "Đang xóa" else "Xóa",
                color = ErrorRed,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .background(ErrorRed.copy(alpha = 0.06f), RoundedCornerShape(8.dp))
                    .clickable(enabled = !isDeleting, onClick = onDelete)
                    .padding(horizontal = 9.dp, vertical = 5.dp)
            )
        }
        if (showDivider) HorizontalDivider(color = Color(0xFFF3F4F6))
    }
}

@Composable
private fun EmptyHistoryCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.MedicalServices, contentDescription = null, tint = TextSecondary.copy(alpha = 0.6f), modifier = Modifier.size(28.dp))
        Spacer(modifier = Modifier.size(8.dp))
        Text("Chưa có thiết bị đã ghép nối", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.size(4.dp))
        Text("Nhấn + Thêm thiết bị để bắt đầu ghép nối.", color = TextSecondary, fontSize = 12.sp)
    }
}

private fun SmartDevice.displayConnectionMethod(fallbackIndex: Int = 0): String {
    val method = connectionMethod.trim()
    if (method.isNotBlank()) return method
    if (online || backendHost.isNotBlank()) return "Cloud backend"
    return if (fallbackIndex % 2 == 0) "Bluetooth" else "QR"
}

private fun SmartDevice.cloudStatusLabel(): String {
    return when {
        online -> "Online qua backend cloud"
        connected -> "Đang kết nối cục bộ"
        else -> "Chưa online"
    }
}

private fun SmartDevice.signalLabel(): String {
    wifiRssi?.let { return "WiFi RSSI $it dBm" }
    return "RSSI $signal dBm"
}

private fun SmartDevice.firmwareLabel(): String {
    return firmwareVersion.ifBlank { "chưa báo cáo" }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        color = TextSecondary,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp,
        modifier = Modifier.padding(horizontal = 2.dp)
    )
}
