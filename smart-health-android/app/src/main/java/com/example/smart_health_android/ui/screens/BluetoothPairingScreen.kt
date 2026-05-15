package com.example.smart_health_android.ui.screens

import androidx.compose.animation.core.*
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
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

data class BluetoothDevice(
    val id: String,
    val name: String,
    val signal: Int
)

@Composable
fun BluetoothPairingScreen(onNavigateBack: () -> Unit) {
    var isScanning by remember { mutableStateOf(true) }
    var devices by remember { mutableStateOf<List<BluetoothDevice>>(emptyList()) }
    var connectingTo by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    // Mock scanning
    val startScan = {
        isScanning = true
        devices = emptyList()
        coroutineScope.launch {
            delay(3000)
            devices = listOf(
                BluetoothDevice("1", "Stetho-AI-204A", -45),
                BluetoothDevice("2", "Stetho-Pro-91B", -78)
            )
            isScanning = false
        }
    }

    LaunchedEffect(Unit) {
        startScan()
    }

    val connectToDevice = { id: String ->
        connectingTo = id
        coroutineScope.launch {
            delay(2000)
            onNavigateBack() // Mock successful connection
        }
    }

    // Pulse animation
    val infiniteTransition = rememberInfiniteTransition()
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        )
    )

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
                .padding(horizontal = 16.dp, vertical = 16.dp)
                .statusBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Text("Ghép Nối Thiết Bị", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Box(modifier = Modifier.size(24.dp)) // Spacer
            }
        }

        // Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(32.dp))

            // Bluetooth Icon with Pulse
            Box(
                modifier = Modifier.size(200.dp),
                contentAlignment = Alignment.Center
            ) {
                if (isScanning) {
                    Box(
                        modifier = Modifier
                            .size(120.dp)
                            .scale(pulseScale)
                            .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape)
                    )
                }
                Box(
                    modifier = Modifier
                        .size(120.dp)
                        .shadow(16.dp, CircleShape, spotColor = PrimaryBlue)
                        .background(Brush.linearGradient(listOf(PrimaryBlue, Color(0xFF0E7AB8))), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (isScanning) Icons.Default.BluetoothSearching else Icons.Default.Bluetooth,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(48.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = if (isScanning) "Đang tìm kiếm thiết bị..." else "Thiết Bị Khả Dụng",
                color = PrimaryBlue,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Hãy đảm bảo Ống nghe Thông minh của bạn đã được bật và ở chế độ ghép nối.",
                color = TextSecondary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp)
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Device List
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                devices.forEach { device ->
                    val isConnecting = connectingTo == device.id
                    val isAnyConnecting = connectingTo != null

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.White, RoundedCornerShape(16.dp))
                            .border(
                                1.dp,
                                if (isConnecting) PrimaryBlue else Border,
                                RoundedCornerShape(16.dp)
                            )
                            .shadow(if (isConnecting) 4.dp else 0.dp, RoundedCornerShape(16.dp))
                            .clickable(enabled = !isAnyConnecting) { connectToDevice(device.id) }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .background(
                                        if (isConnecting) PrimaryBlue.copy(alpha = 0.1f) else Color(0xFFF1F5F9),
                                        RoundedCornerShape(12.dp)
                                    ),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Default.Smartphone,
                                    contentDescription = null,
                                    tint = if (isConnecting) PrimaryBlue else TextSecondary
                                )
                            }
                            Spacer(modifier = Modifier.width(16.dp))
                            Column {
                                Text(device.name, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                                Text("Tín hiệu: ${device.signal} dBm", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                        }

                        if (isConnecting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = PrimaryBlue,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Box(
                                modifier = Modifier
                                    .background(Color(0xFF00A896).copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                                    .padding(horizontal = 12.dp, vertical = 4.dp)
                            ) {
                                Text("Kết Nối", color = Color(0xFF00A896), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }

                if (!isScanning && devices.isEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFFF8FAFC), RoundedCornerShape(16.dp))
                            .border(1.dp, Border, RoundedCornerShape(16.dp))
                            .padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = TextSecondary.copy(alpha = 0.5f), modifier = Modifier.size(32.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Không tìm thấy thiết bị nào", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }

            if (!isScanning) {
                Spacer(modifier = Modifier.height(32.dp))
                Text(
                    text = "Quét Lại",
                    color = PrimaryBlue,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { startScan() }
                )
            }
        }
    }
}
