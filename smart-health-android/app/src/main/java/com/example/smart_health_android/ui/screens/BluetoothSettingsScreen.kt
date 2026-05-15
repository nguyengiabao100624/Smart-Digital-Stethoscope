package com.example.smart_health_android.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun BluetoothSettingsScreen(onNavigateBack: () -> Unit) {
    var bluetoothEnabled by remember { mutableStateOf(true) }
    var isSearching by remember { mutableStateOf(false) }

    LaunchedEffect(isSearching) {
        if (isSearching) {
            delay(3000)
            isSearching = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Cài Đặt Bluetooth", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .background(
                            if (bluetoothEnabled) Color(0xFFEFF6FF) else Color(0xFFF3F4F6),
                            CircleShape
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.Bluetooth,
                        contentDescription = null,
                        tint = if (bluetoothEnabled) PrimaryBlue else Color(0xFF9CA3AF),
                        modifier = Modifier.size(24.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Bluetooth", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(
                        if (bluetoothEnabled) "Đang bật" else "Đang tắt",
                        color = TextSecondary,
                        fontSize = 12.sp
                    )
                }
                Switch(
                    checked = bluetoothEnabled,
                    onCheckedChange = { bluetoothEnabled = it },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = PrimaryBlue,
                        uncheckedThumbColor = Color.White,
                        uncheckedTrackColor = Color(0xFFD1D5DB)
                    )
                )
            }

            AnimatedVisibility(visible = bluetoothEnabled) {
                Column {
                    Spacer(modifier = Modifier.height(24.dp))
                    SectionLabel("THIẾT BỊ CỦA TÔI")
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.White, RoundedCornerShape(16.dp))
                            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(PrimaryTeal.copy(alpha = 0.1f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.MedicalServices, contentDescription = null, tint = PrimaryTeal)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("StethoEdge Pro", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(modifier = Modifier.size(7.dp).background(PrimaryTeal, CircleShape))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Đã kết nối", color = PrimaryTeal, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                        IconButton(onClick = { }) {
                            Icon(Icons.Default.Settings, contentDescription = null, tint = TextSecondary)
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        SectionLabel("THIẾT BỊ HIỆN CÓ")
                        TextButton(onClick = { isSearching = true }) {
                            Icon(
                                Icons.Default.Refresh,
                                contentDescription = null,
                                tint = PrimaryBlue,
                                modifier = Modifier.size(16.dp).rotate(if (isSearching) 180f else 0f)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(if (isSearching) "Đang tìm..." else "Quét lại", color = PrimaryBlue, fontSize = 12.sp)
                        }
                    }

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.White, RoundedCornerShape(16.dp))
                            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
                    ) {
                        AvailableBluetoothDevice("LiteSteth-A92", showDivider = true)
                        AvailableBluetoothDevice("MACS-Audio 2.0", showDivider = false)
                    }

                    Spacer(modifier = Modifier.height(24.dp))
                    Row(modifier = Modifier.padding(horizontal = 8.dp), verticalAlignment = Alignment.Top) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "Đảm bảo ống nghe của bạn đang ở chế độ chờ ghép nối. Khoảng cách tối ưu để kết nối là dưới 2 mét.",
                            color = TextSecondary,
                            fontSize = 12.sp,
                            lineHeight = 18.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AvailableBluetoothDevice(name: String, showDivider: Boolean) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(40.dp).background(Color(0xFFF3F4F6), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Bluetooth, contentDescription = null, tint = TextSecondary)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(name, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Text("Sẵn sàng ghép nối", color = TextSecondary, fontSize = 12.sp)
            }
        }
        if (showDivider) HorizontalDivider(color = Color(0xFFF3F4F6))
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        color = TextSecondary,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 1.sp
    )
}
