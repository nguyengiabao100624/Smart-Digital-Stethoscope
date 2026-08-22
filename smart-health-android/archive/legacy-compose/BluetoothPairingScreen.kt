package com.example.smart_health_android.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.BluetoothSearching
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Keyboard
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.ui.theme.Background
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

private const val RADAR_SCAN_MS = 3000L

private enum class PairingMethod(
    val title: String,
    val subtitle: String,
    val backendValue: String
) {
    Qr("Quét mã QR", "Kết nối nhanh và chính xác nhất bằng cách quét mã QR in trên hộp hoặc thân thiết bị.", "QR"),
    Manual("Nhập mã thủ công", "Nhập mã seri hoặc claim code trên thân thiết bị", "Nhập tay"),
    Bluetooth("Tìm thiết bị", "Tìm và ghép nối ống nghe đã được hệ thống phát hiện ở gần bạn.", "Bluetooth")
}

private data class PairingPayload(
    val deviceId: String,
    val claimCode: String = "",
    val name: String = ""
)

data class BluetoothDevice(
    val id: String,
    val name: String,
    val signal: Int
)

@Deprecated(
    message = "Archived demo flow. Production navigation uses DevicePairingScreen with QR claim and WSS confirmation.",
)
@Composable
fun BluetoothPairingScreen(
    onNavigateBack: () -> Unit,
    onConnectionSuccess: (String) -> Unit
) {
    var selectedMethod by remember { mutableStateOf<PairingMethod?>(null) }

    when (val method = selectedMethod) {
        null -> ConnectionMethodSelectionScreen(
            onNavigateBack = onNavigateBack,
            onSelectMethod = { selectedMethod = it }
        )

        PairingMethod.Qr -> QrScannerScreen(
            onNavigateBack = { selectedMethod = null },
            onManualEntry = { selectedMethod = PairingMethod.Manual },
            onConnectionSuccess = onConnectionSuccess
        )

        PairingMethod.Manual -> ManualCodeScreen(
            onNavigateBack = { selectedMethod = null },
            onConnectionSuccess = onConnectionSuccess
        )

        PairingMethod.Bluetooth -> BluetoothRadarScreen(
            onNavigateBack = { selectedMethod = null },
            onConnectionSuccess = onConnectionSuccess
        )
    }
}

@Composable
private fun ConnectionMethodSelectionScreen(
    onNavigateBack: () -> Unit,
    onSelectMethod: (PairingMethod) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        AddDeviceHeader(title = "Chọn phương thức kết nối", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                "Vui lòng chọn một trong các phương thức dưới đây để ghép nối ống nghe kỹ thuật số với ứng dụng.",
                color = TextSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
            Text(
                "CHỌN PHƯƠNG THỨC KẾT NỐI",
                color = TextSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
            PairingMethodCard(
                icon = Icons.Default.QrCodeScanner,
                method = PairingMethod.Qr,
                tint = PrimaryBlue,
                badge = "Khuyên dùng",
                onClick = { onSelectMethod(PairingMethod.Qr) }
            )
            PairingMethodCard(
                icon = Icons.Default.Bluetooth,
                method = PairingMethod.Bluetooth,
                tint = Color(0xFF475569),
                onClick = { onSelectMethod(PairingMethod.Bluetooth) }
            )
            ConnectionReadinessCallout()
        }
    }
}

@Composable
private fun PairingMethodCard(
    icon: ImageVector,
    method: PairingMethod,
    tint: Color,
    badge: String? = null,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(18.dp),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(54.dp)
                .background(tint.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(28.dp))
        }
        Spacer(modifier = Modifier.size(16.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(method.title, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                badge?.let {
                    Spacer(modifier = Modifier.size(8.dp))
                    Text(
                        it,
                        color = PrimaryTeal,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .background(PrimaryTeal.copy(alpha = 0.1f), CircleShape)
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
            Text(method.subtitle, color = TextSecondary, fontSize = 13.sp, lineHeight = 18.sp)
        }
        Icon(
            Icons.Default.KeyboardArrowRight,
            contentDescription = null,
            tint = TextSecondary.copy(alpha = 0.45f),
            modifier = Modifier.size(22.dp)
        )
    }
}

@Composable
private fun ConnectionReadinessCallout() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 18.dp)
            .background(Color(0xFFEFF6FF), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0xFFBFDBFE), RoundedCornerShape(12.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            Icons.Default.Info,
            contentDescription = null,
            tint = Color(0xFF2563EB),
            modifier = Modifier
                .padding(top = 1.dp)
                .size(18.dp)
        )
        Spacer(modifier = Modifier.size(12.dp))
        Text(
            "Hãy đảm bảo thiết bị đã được bật nguồn và đèn tín hiệu đang nhấp nháy màu xanh dương trước khi kết nối.",
            color = Color(0xFF1E40AF),
            fontSize = 13.sp,
            lineHeight = 19.sp
        )
    }
}

@Composable
private fun QrScannerScreen(
    onNavigateBack: () -> Unit,
    onManualEntry: () -> Unit,
    onConnectionSuccess: (String) -> Unit
) {
    var isScanning by remember { mutableStateOf(true) }
    var isPairing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    suspend fun pairDefaultQr() {
        isPairing = true
        error = null
        runCatching {
            SmartHealthRepository.api.pairDevice(
                deviceId = "stetho-ai-pro",
                name = "Stetho-AI-Pro",
                connectionMethod = PairingMethod.Qr.backendValue
            )
        }.onSuccess { response ->
            onConnectionSuccess(response.device.name.ifBlank { "Stetho-AI-Pro" })
        }.onFailure {
            error = it.message ?: "Không thể kết nối thiết bị"
            isPairing = false
        }
    }

    LaunchedEffect(Unit) {
        delay(3000)
        isScanning = false
        pairDefaultQr()
    }

    val infiniteTransition = rememberInfiniteTransition(label = "qr-scan-line")
    val scanOffset by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 280f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "qr-line-offset"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F172A))
    ) {
        DarkDeviceHeader(title = "Quét mã thiết bị", onNavigateBack = onNavigateBack)

        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(288.dp)
                        .border(2.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(28.dp))
                        .background(Color(0xFF1E293B).copy(alpha = 0.82f), RoundedCornerShape(28.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        if (isScanning) Icons.Default.QrCodeScanner else Icons.Default.Check,
                        contentDescription = null,
                        tint = if (isScanning) Color.White.copy(alpha = 0.14f) else Color.White,
                        modifier = Modifier
                            .size(if (isScanning) 120.dp else 42.dp)
                            .background(
                                if (isScanning) Color.Transparent else PrimaryTeal,
                                if (isScanning) RoundedCornerShape(0.dp) else CircleShape
                            )
                            .padding(if (isScanning) 0.dp else 8.dp)
                    )

                    ScannerCorner(Modifier.align(Alignment.TopStart), top = true, start = true)
                    ScannerCorner(Modifier.align(Alignment.TopEnd), top = true, start = false)
                    ScannerCorner(Modifier.align(Alignment.BottomStart), top = false, start = true)
                    ScannerCorner(Modifier.align(Alignment.BottomEnd), top = false, start = false)

                    if (isScanning) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopCenter)
                                .offset(y = scanOffset.dp)
                                .fillMaxWidth()
                                .height(2.dp)
                                .background(PrimaryTeal)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(38.dp))
                Text(
                    if (isScanning) "Đang tìm kiếm mã QR..." else "Quét mã thành công!",
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    if (isPairing) "Đang xác thực thiết bị..." else "Hướng camera vào mã QR trên thân ống nghe hoặc bên trong hộp.",
                    color = Color.White.copy(alpha = 0.64f),
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                    textAlign = TextAlign.Center
                )

                error?.let {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(it, color = Color(0xFFFCA5A5), fontSize = 13.sp, textAlign = TextAlign.Center)
                }
            }

            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .background(Color.White.copy(alpha = 0.1f), CircleShape)
                    .clickable(onClick = onManualEntry)
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Keyboard, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.size(8.dp))
                Text("Không thể quét mã? Nhập thủ công", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun ManualCodeScreen(
    onNavigateBack: () -> Unit,
    onConnectionSuccess: (String) -> Unit
) {
    var code by remember { mutableStateOf("") }
    var isPairing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    fun pair(payload: PairingPayload) {
        if (isPairing) return
        isPairing = true
        error = null
        coroutineScope.launch {
            runCatching {
                SmartHealthRepository.api.pairDevice(
                    deviceId = payload.deviceId,
                    name = payload.name.ifBlank { "Stetho-AI-Pro" },
                    claimCode = payload.claimCode,
                    connectionMethod = PairingMethod.Manual.backendValue
                )
            }.onSuccess { response ->
                onConnectionSuccess(response.device.name.ifBlank { payload.name.ifBlank { "Stetho-AI-Pro" } })
            }.onFailure {
                error = it.message ?: "Không thể kết nối thiết bị"
                isPairing = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        AddDeviceHeader(title = "Nhập mã thủ công", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            Text(
                "Nhập mã seri gồm 6-8 ký tự được in bên cạnh mã QR trên thân thiết bị của bạn.",
                color = TextSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )

            Spacer(modifier = Modifier.height(28.dp))
            Text("Mã thiết bị (Serial Number)", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = code,
                onValueChange = {
                    code = it.uppercase()
                    error = null
                },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                placeholder = { Text("VD: STAI-XXXXX") }
            )
            Spacer(modifier = Modifier.height(16.dp))

            error?.let {
                Text(it, color = Color(0xFFDC2626), fontSize = 13.sp)
                Spacer(modifier = Modifier.height(12.dp))
            }

            Button(
                onClick = {
                    val payload = parsePairingPayload(code)
                    if (payload == null) {
                        error = "Mã thiết bị không hợp lệ"
                    } else {
                        pair(payload)
                    }
                },
                enabled = !isPairing && code.length >= 6,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue, contentColor = Color.White)
            ) {
                if (isPairing) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.size(8.dp))
                    Text("Đang xác thực...", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                } else {
                    Text("Xác nhận kết nối", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun DarkDeviceHeader(title: String, onNavigateBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF0F172A).copy(alpha = 0.96f))
            .statusBarsPadding()
            .padding(horizontal = 4.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onNavigateBack) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Quay lại", tint = Color.White)
        }
        Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ScannerCorner(
    modifier: Modifier,
    top: Boolean,
    start: Boolean
) {
    Box(modifier = modifier.size(52.dp)) {
        Box(
            modifier = Modifier
                .align(if (top) Alignment.TopCenter else Alignment.BottomCenter)
                .fillMaxWidth()
                .height(4.dp)
                .background(PrimaryTeal)
        )
        Box(
            modifier = Modifier
                .align(if (start) Alignment.CenterStart else Alignment.CenterEnd)
                .width(4.dp)
                .height(52.dp)
                .background(PrimaryTeal)
        )
    }
}

@Composable
private fun BluetoothRadarScreen(
    onNavigateBack: () -> Unit,
    onConnectionSuccess: (String) -> Unit
) {
    var isScanning by remember { mutableStateOf(true) }
    var devices by remember { mutableStateOf<List<BluetoothDevice>>(emptyList()) }
    var connectingTo by remember { mutableStateOf<String?>(null) }
    var scanError by remember { mutableStateOf<String?>(null) }
    var scanRound by remember { mutableStateOf(0) }
    val coroutineScope = rememberCoroutineScope()

    fun startScan() {
        scanRound += 1
        val currentRound = scanRound
        isScanning = true
        devices = emptyList()
        scanError = null
        connectingTo = null

        coroutineScope.launch {
            val result = runCatching {
                delay(RADAR_SCAN_MS)
                SmartHealthRepository.api.scanDevices().map {
                    BluetoothDevice(it.id, it.name.ifBlank { "Stetho-AI-Pro" }, it.signal)
                }
            }

            if (currentRound != scanRound) return@launch

            result
                .onSuccess { devices = it }
                .onFailure { scanError = it.message ?: "Không thể quét thiết bị" }

            isScanning = false
        }
    }

    LaunchedEffect(Unit) {
        startScan()
    }

    fun connectToDevice(device: BluetoothDevice) {
        if (connectingTo != null) return
        connectingTo = device.id
        coroutineScope.launch {
            runCatching {
                SmartHealthRepository.api.pairDevice(
                    deviceId = device.id,
                    name = device.name,
                    connectionMethod = PairingMethod.Bluetooth.backendValue
                )
            }.onSuccess { response ->
                onConnectionSuccess(response.device.name.ifBlank { device.name })
            }.onFailure {
                scanError = it.message ?: "Không thể kết nối thiết bị"
                connectingTo = null
            }
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "bluetooth-radar")
    val sweepRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "radar-sweep"
    )
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.22f,
        animationSpec = infiniteRepeatable(
            animation = tween(1100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "center-pulse"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        AddDeviceHeader(title = "Tìm thiết bị", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
        ) {
            RadarScanPanel(
                isScanning = isScanning,
                sweepRotation = sweepRotation,
                pulseScale = pulseScale
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "THIẾT BỊ KHẢ DỤNG",
                        color = TextSecondary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                    if (!isScanning) {
                        Row(
                            modifier = Modifier
                                .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape)
                                .clickable { startScan() }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.size(6.dp))
                            Text("Quét lại", color = PrimaryBlue, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                scanError?.let {
                    Text(it, color = Color(0xFFDC2626), fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }

                if (!isScanning && devices.isEmpty()) {
                    EmptyDeviceState(onRescan = { startScan() })
                }

                devices.forEach { device ->
                    DeviceScanResultCard(
                        device = device,
                        isConnecting = connectingTo == device.id,
                        disabled = connectingTo != null,
                        onClick = { connectToDevice(device) }
                    )
                }
            }
        }
    }
}

@Composable
private fun AddDeviceHeader(title: String, onNavigateBack: () -> Unit) {
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
                Icon(Icons.Default.ArrowBack, contentDescription = "Quay lại", tint = Color.White)
            }
            Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Box(modifier = Modifier.size(24.dp))
        }
    }
}

@Composable
private fun RadarScanPanel(
    isScanning: Boolean,
    sweepRotation: Float,
    pulseScale: Float
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(260.dp)
            .background(Color(0xFF1E293B)),
        contentAlignment = Alignment.Center
    ) {
        listOf(220.dp, 150.dp, 82.dp).forEach { size ->
            Box(
                modifier = Modifier
                    .size(size)
                    .border(1.dp, Color.White.copy(alpha = 0.14f), CircleShape)
            )
        }

        if (isScanning) {
            Box(
                modifier = Modifier
                    .size(190.dp)
                    .rotate(sweepRotation)
                    .background(
                        Brush.sweepGradient(
                            listOf(
                                Color.Transparent,
                                PrimaryTeal.copy(alpha = 0.08f),
                                PrimaryTeal.copy(alpha = 0.32f),
                                Color.Transparent
                            )
                        ),
                        CircleShape
                    )
            )
        }

        Box(
            modifier = Modifier
                .size(86.dp)
                .scale(if (isScanning) pulseScale else 1f)
                .shadow(18.dp, CircleShape, spotColor = PrimaryBlue)
                .background(PrimaryBlue, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (isScanning) Icons.Default.BluetoothSearching else Icons.Default.Bluetooth,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(38.dp)
            )
        }

        Text(
            if (isScanning) "Đang tìm kiếm..." else "Đã quét xong",
            color = Color(0xFFE2E8F0),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 24.dp)
        )
    }
}

@Composable
private fun EmptyDeviceState(onRescan: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.Info, contentDescription = null, tint = TextSecondary.copy(alpha = 0.6f), modifier = Modifier.size(32.dp))
        Spacer(modifier = Modifier.height(8.dp))
        Text("Không tìm thấy thiết bị nào", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            "Hãy đảm bảo ống nghe đang bật nguồn và ở chế độ ghép nối.",
            color = TextSecondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        Row(
            modifier = Modifier
                .background(PrimaryBlue, RoundedCornerShape(12.dp))
                .clickable(onClick = onRescan)
                .padding(horizontal = 18.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Refresh, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.size(8.dp))
            Text("Quét lại", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun DeviceScanResultCard(
    device: BluetoothDevice,
    isConnecting: Boolean,
    disabled: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, if (isConnecting) PrimaryBlue else Border, RoundedCornerShape(16.dp))
            .shadow(if (isConnecting) 4.dp else 0.dp, RoundedCornerShape(16.dp))
            .clickable(enabled = !disabled, onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .background(Color(0xFFF1F5F9), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Smartphone, contentDescription = null, tint = TextSecondary)
            }
            Spacer(modifier = Modifier.size(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(device.name, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("Tín hiệu: ${device.signal} dBm", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }

        if (isConnecting) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), color = PrimaryBlue, strokeWidth = 2.dp)
                Spacer(modifier = Modifier.size(8.dp))
                Text("Đang kết nối", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        } else {
            Box(
                modifier = Modifier
                    .background(PrimaryTeal.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                    .padding(horizontal = 12.dp, vertical = 7.dp)
            ) {
                Text("Kết nối", color = PrimaryTeal, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

private fun parsePairingPayload(raw: String): PairingPayload? {
    val text = raw.trim()
    if (text.isBlank()) return null

    runCatching { JSONObject(text) }.getOrNull()?.let { json ->
        val deviceId = json.optString("deviceId").ifBlank { json.optString("id") }.trim()
        if (deviceId.isBlank()) return null
        return PairingPayload(
            deviceId = deviceId,
            claimCode = json.optString("claimCode").trim(),
            name = json.optString("name").trim()
        )
    }

    if (text.contains("deviceId=", ignoreCase = true)) {
        val params = text.split("&")
            .mapNotNull { part ->
                val chunks = part.split("=", limit = 2)
                if (chunks.size == 2) chunks[0].trim() to chunks[1].trim() else null
            }
            .toMap()
        val deviceId = params.entries.firstOrNull { it.key.equals("deviceId", ignoreCase = true) }?.value.orEmpty()
        if (deviceId.isNotBlank()) {
            val claimCode = params.entries.firstOrNull { it.key.equals("claimCode", ignoreCase = true) }?.value.orEmpty()
            return PairingPayload(deviceId = deviceId, claimCode = claimCode)
        }
    }

    val parts = text.split("|", ":", ";", limit = 2).map { it.trim() }
    return PairingPayload(
        deviceId = parts.first(),
        claimCode = parts.getOrNull(1).orEmpty()
    )
}
