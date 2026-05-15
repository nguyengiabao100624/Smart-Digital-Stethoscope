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
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import com.example.smart_health_android.ui.theme.*

data class ScanRecord(
    val id: String,
    val name: String,
    val date: String,
    val time: String,
    val type: String,
    val isNormal: Boolean,
    val diagnosis: String
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToSettings: () -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToBluetooth: () -> Unit,
    onNavigateToRecordDetail: () -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    val recentScans = listOf(
        ScanRecord("BN-2845", "Nguyễn Văn An", "12-05-2026", "14:35", "Tim", true, "Nhịp xoang bình thường"),
        ScanRecord("BN-2844", "Trần Thị Mai", "12-05-2026", "13:20", "Phổi", false, "Phát hiện tiếng ran nổ - Đáy phổi trái"),
        ScanRecord("BN-2843", "Lê Văn Minh", "12-05-2026", "11:45", "Tim", true, "Âm sắc tim bình thường")
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(Surface)
    ) {
        // Header
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp))
                    .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                    .padding(start = 24.dp, end = 24.dp, top = 48.dp, bottom = 64.dp)
            ) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Chào mừng trở lại,", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                            Text("Bs. Tuấn", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            IconButton(
                                onClick = onNavigateToSettings,
                                modifier = Modifier
                                    .background(Color.White.copy(alpha = 0.2f), CircleShape)
                                    .border(1.dp, Color.White.copy(alpha = 0.3f), CircleShape)
                            ) {
                                Icon(Icons.Default.Settings, contentDescription = null, tint = Color.White)
                            }
                            IconButton(
                                onClick = onNavigateToNotifications,
                                modifier = Modifier
                                    .background(Color.White.copy(alpha = 0.2f), CircleShape)
                                    .border(1.dp, Color.White.copy(alpha = 0.3f), CircleShape)
                            ) {
                                Icon(Icons.Default.Notifications, contentDescription = null, tint = Color.White)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    TextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text("Tìm kiếm bệnh nhân...", color = Color.White.copy(alpha = 0.6f)) },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color.White.copy(alpha = 0.6f)) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(16.dp)),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.White.copy(alpha = 0.2f),
                            unfocusedContainerColor = Color.White.copy(alpha = 0.2f),
                            focusedIndicatorColor = Color.Transparent,
                            unfocusedIndicatorColor = Color.Transparent,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        ),
                        shape = RoundedCornerShape(16.dp)
                    )
                }
            }
        }

        // Body Content
        item {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp)
                    .offset(y = (-32).dp)
            ) {
                // Device Status Card
                Card(
                    modifier = Modifier.fillMaxWidth().clickable(onClick = onNavigateToBluetooth),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    shape = RoundedCornerShape(16.dp)
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
                                        .size(40.dp)
                                        .background(SuccessGreen.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(Icons.Default.MonitorHeart, contentDescription = null, tint = SuccessGreen)
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text("Trạng thái thiết bị", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                    Text("Đã kết nối", color = SuccessGreen, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.BatteryFull, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(20.dp))
                                    Text("85%", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                                }
                                Icon(Icons.Default.Bluetooth, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                                Icon(Icons.Default.Wifi, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        // Battery Bar
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .background(Border, CircleShape)
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

                Spacer(modifier = Modifier.height(24.dp))

                // Quick Actions
                Text("Tác Vụ Nhanh", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                Spacer(modifier = Modifier.height(16.dp))

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(
                        modifier = Modifier.weight(1f).aspectRatio(0.85f).background(PrimaryBlue, RoundedCornerShape(16.dp)).clickable(onClick = onNavigateToMonitoring).padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.SsidChart, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Đo Ngay", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    Column(
                        modifier = Modifier.weight(1f).aspectRatio(0.85f).background(Color.White, RoundedCornerShape(16.dp)).border(1.5.dp, PrimaryBlue, RoundedCornerShape(16.dp)).clickable(onClick = onNavigateToRecords).padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.Description, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Hồ Sơ", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    Column(
                        modifier = Modifier.weight(1f).aspectRatio(0.85f).background(PrimaryTeal, RoundedCornerShape(16.dp)).clickable(onClick = onNavigateToAssistant).padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Chat AI", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(0.85f)
                            .background(Color.White, RoundedCornerShape(16.dp))
                            .drawBehind {
                                drawRoundRect(
                                    color = PrimaryBlue,
                                    style = Stroke(
                                        width = 1.5.dp.toPx(),
                                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(15f, 15f), 0f)
                                    ),
                                    cornerRadius = CornerRadius(16.dp.toPx(), 16.dp.toPx())
                                )
                            }
                            .clickable(onClick = onNavigateToNewScan)
                            .padding(8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Đo Mới", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Recent Scans
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Kết Quả Gần Đây", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                    Text("Xem Tất Cả", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = PrimaryBlue, modifier = Modifier.clickable(onClick = onNavigateToRecords))
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }

        items(recentScans) { scan ->
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .offset(y = (-32).dp)
                    .padding(bottom = 12.dp)
                    .clickable(onClick = onNavigateToRecordDetail),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(16.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Border)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column {
                            Text(scan.id, color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(scan.name, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Box(
                            modifier = Modifier
                                .background(if (scan.isNormal) SuccessGreen.copy(alpha = 0.1f) else WarningYellow.copy(alpha = 0.1f), CircleShape)
                                .padding(horizontal = 12.dp, vertical = 4.dp)
                        ) {
                            Text(
                                if (scan.isNormal) "Bình thường" else "Bất thường",
                                color = if (scan.isNormal) SuccessGreen else WarningYellow,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Đo ${scan.type}", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(scan.time, color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Surface, RoundedCornerShape(12.dp))
                            .border(1.dp, Border, RoundedCornerShape(12.dp))
                            .padding(12.dp)
                    ) {
                        Column {
                            Text("Kết luận AI:", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Text(scan.diagnosis, color = TextPrimary, fontSize = 14.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun QuickActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    gradient: List<Color>?,
    borderColor: Color? = null,
    iconColor: Color = Color.White,
    textColor: Color,
    isDashed: Boolean = false, // Compose doesn't have dashed border out of the box, we use solid for now
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(
                    if (gradient != null) Brush.linearGradient(gradient) else androidx.compose.ui.graphics.SolidColor(Color.White),
                    RoundedCornerShape(16.dp)
                )
                .then(
                    if (borderColor != null) Modifier.border(2.dp, borderColor, RoundedCornerShape(16.dp))
                    else Modifier
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(28.dp))
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(label, color = textColor, fontSize = 12.sp, fontWeight = FontWeight.Medium)
    }
}

@Preview(showBackground = true)
@Composable
fun DashboardScreenPreview() {
    SmarthealthandroidTheme {
        DashboardScreen(
            onNavigateToSettings = {},
            onNavigateToMonitoring = {},
            onNavigateToRecords = {},
            onNavigateToAssistant = {},
            onNavigateToNewScan = {},
            onNavigateToNotifications = {},
            onNavigateToBluetooth = {},
            onNavigateToRecordDetail = {}
        )
    }
}
