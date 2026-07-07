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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.StartScanRequest
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewScanScreen(onNavigateBack: () -> Unit, onScanStarted: (String) -> Unit) {
    var patientId by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("") }
    var profiles by remember { mutableStateOf<List<Patient>>(emptyList()) }
    var selectedProfileId by remember { mutableStateOf("") }
    var devices by remember { mutableStateOf<List<SmartDevice>>(emptyList()) }
    var selectedDeviceId by remember { mutableStateOf("") }
    var isLoadingDevices by remember { mutableStateOf(false) }
    var isCreatingProfile by remember { mutableStateOf(false) }
    var scanType by remember { mutableStateOf("heart") } // "heart" or "lung"
    var date by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    suspend fun refreshProfiles() {
        runCatching {
            val loaded = SmartHealthRepository.api.listPatients()
            profiles = loaded
            if (selectedProfileId.isBlank() && loaded.isNotEmpty()) {
                selectedProfileId = loaded.first().id
            }
        }.onFailure {
            errorMessage = it.message ?: "Không tải được hồ sơ sức khỏe"
        }
    }

    suspend fun refreshDevices() {
        isLoadingDevices = true
        runCatching {
            val loaded = SmartHealthRepository.api.listDevices()
                .filter { it.type == "stethoscope" || it.type.isBlank() }
                .sortedWith(
                    compareByDescending<SmartDevice> { it.online || it.connected }
                        .thenByDescending { it.lastSeenAt.orEmpty() }
                )
            devices = loaded
            if (selectedDeviceId.isBlank() && loaded.isNotEmpty()) {
                selectedDeviceId = loaded.first().id
            }
        }.onFailure {
            errorMessage = it.message ?: "Không tải được danh sách thiết bị"
        }
        isLoadingDevices = false
    }

    LaunchedEffect(Unit) {
        refreshProfiles()
        refreshDevices()
    }

    fun createProfile() {
        val name = patientId.trim()
        if (name.isBlank() || isCreatingProfile) return
        coroutineScope.launch {
            isCreatingProfile = true
            runCatching {
                SmartHealthRepository.api.createPatient(
                    patientCode = "",
                    name = name,
                    notes = "Hồ sơ gia đình tạo từ app Android",
                    profileType = "dependent",
                    relationship = relationship.trim()
                )
            }.onSuccess { created ->
                patientId = ""
                relationship = ""
                selectedProfileId = created.id
                refreshProfiles()
            }.onFailure {
                errorMessage = it.message ?: "Không tạo được hồ sơ gia đình"
            }
            isCreatingProfile = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Text("Tạo lượt đo mới", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.width(48.dp))
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            Text("THÔNG TIN BỆNH NHÂN", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(modifier = Modifier.height(16.dp))

            if (profiles.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    profiles.forEach { profile ->
                        val selected = profile.id == selectedProfileId
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) PrimaryBlue.copy(alpha = 0.08f) else Color.White)
                                .border(1.dp, if (selected) PrimaryBlue else Border, RoundedCornerShape(12.dp))
                                .clickable { selectedProfileId = profile.id }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.AccountCircle, contentDescription = null, tint = if (selected) PrimaryBlue else TextSecondary)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(profile.name, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                Text(
                                    listOf(profile.relationship, profile.patientCode).filter { it.isNotBlank() }.joinToString(" • ").ifBlank { "Hồ sơ sức khỏe" },
                                    color = TextSecondary,
                                    fontSize = 12.sp
                                )
                            }
                            if (selected) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PrimaryBlue)
                            }
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            OutlinedTextField(
                value = patientId,
                onValueChange = { patientId = it },
                placeholder = { Text("Mã bệnh nhân hoặc họ tên") },
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = TextSecondary) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Border
                )
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = relationship,
                onValueChange = { relationship = it },
                placeholder = { Text("Quan hệ: bản thân, ba, mẹ, con...") },
                leadingIcon = { Icon(Icons.Default.Group, contentDescription = null, tint = TextSecondary) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Border
                )
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = { createProfile() },
                enabled = patientId.isNotBlank() && !isCreatingProfile,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (isCreatingProfile) "Đang thêm hồ sơ..." else "Thêm hồ sơ gia đình")
            }
            Spacer(modifier = Modifier.height(12.dp))
            SelectableDateField(
                value = date,
                onDateSelected = { date = it },
                placeholder = "Ngày (dd/MM/yyyy)",
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))
            HorizontalDivider(color = Border)
            Spacer(modifier = Modifier.height(24.dp))

            Text("THIẾT BỊ ỐNG NGHE", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(modifier = Modifier.height(12.dp))
            if (isLoadingDevices) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(12.dp))
                        .border(1.dp, Border, RoundedCornerShape(12.dp))
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryBlue)
                    Spacer(modifier = Modifier.width(10.dp))
                    Text("Đang tải thiết bị đã liên kết...", color = TextSecondary, fontSize = 14.sp)
                }
            } else if (devices.isEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFFFBEB), RoundedCornerShape(12.dp))
                        .border(1.dp, Color(0xFFFDE68A), RoundedCornerShape(12.dp))
                        .padding(14.dp)
                ) {
                    Text("Chưa có ống nghe nào được liên kết", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Hãy liên kết thiết bị trong mục Ống nghe trước khi tạo lượt đo thật.",
                        color = TextSecondary,
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    devices.forEach { device ->
                        val selected = device.id == selectedDeviceId
                        val isOnline = device.online || device.connected
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(if (selected) PrimaryTeal.copy(alpha = 0.08f) else Color.White)
                                .border(1.dp, if (selected) PrimaryTeal else Border, RoundedCornerShape(12.dp))
                                .clickable { selectedDeviceId = device.id }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.GraphicEq, contentDescription = null, tint = if (isOnline) PrimaryTeal else TextSecondary)
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(device.name.ifBlank { device.id }, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                Text(
                                    listOf(
                                        if (isOnline) "Online" else "Offline",
                                        device.wifiRssi?.let { "RSSI ${it} dBm" }.orEmpty(),
                                        device.firmwareVersion.ifBlank { "" }
                                    ).filter { it.isNotBlank() }.joinToString(" • "),
                                    color = if (isOnline) PrimaryTeal else TextSecondary,
                                    fontSize = 12.sp
                                )
                            }
                            if (selected) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PrimaryTeal)
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            HorizontalDivider(color = Border)
            Spacer(modifier = Modifier.height(24.dp))

            Text("LOẠI KIỂM TRA", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(modifier = Modifier.height(16.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                // Heart button
                val isHeart = scanType == "heart"
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (isHeart) PrimaryBlue.copy(alpha = 0.05f) else Color.White)
                        .border(2.dp, if (isHeart) PrimaryBlue else Border, RoundedCornerShape(16.dp))
                        .clickable { scanType = "heart" }
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(if (isHeart) PrimaryBlue.copy(alpha = 0.1f) else Surface, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Favorite, contentDescription = null, tint = if (isHeart) PrimaryBlue else TextSecondary, modifier = Modifier.size(24.dp))
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Tim", color = if (isHeart) PrimaryBlue else TextSecondary, fontWeight = FontWeight.SemiBold)
                    }
                }

                // Lung button
                val isLung = scanType == "lung"
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (isLung) PrimaryTeal.copy(alpha = 0.05f) else Color.White)
                        .border(2.dp, if (isLung) PrimaryTeal else Border, RoundedCornerShape(16.dp))
                        .clickable { scanType = "lung" }
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(if (isLung) PrimaryTeal.copy(alpha = 0.1f) else Surface, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            // Using Default.Air or a generic icon for stethoscope/lung
                            Icon(Icons.Default.Air, contentDescription = null, tint = if (isLung) PrimaryTeal else TextSecondary, modifier = Modifier.size(24.dp))
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Phổi", color = if (isLung) PrimaryTeal else TextSecondary, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            HorizontalDivider(color = Border)
            Spacer(modifier = Modifier.height(24.dp))

            Text("GHI CHÚ LÂM SÀNG (TÙY CHỌN)", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                placeholder = { Text("Thêm triệu chứng sơ bộ hoặc ghi chú...") },
                leadingIcon = { Icon(Icons.Default.Description, contentDescription = null, tint = TextSecondary) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Border
                )
            )

            Spacer(modifier = Modifier.height(32.dp))

            errorMessage?.let {
                Text(
                    text = it,
                    color = ErrorRed,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
            }

            Button(
                onClick = {
                    if (isSubmitting) return@Button
                    isSubmitting = true
                    errorMessage = null
                    coroutineScope.launch {
                        runCatching {
                            val selectedProfile = profiles.firstOrNull { it.id == selectedProfileId }
                                ?: if (patientId.isNotBlank()) {
                                    SmartHealthRepository.api.createPatient(
                                        patientCode = "",
                                        name = patientId.trim(),
                                        notes = "Hồ sơ gia đình tạo nhanh trước lượt đo",
                                        profileType = "dependent",
                                        relationship = relationship.trim()
                                    )
                                } else {
                                    null
                                }
                            if (selectedProfile == null) {
                                error("Hãy chọn hoặc tạo hồ sơ sức khỏe trước khi đo")
                            }
                            val selectedDevice = devices.firstOrNull { it.id == selectedDeviceId }
                                ?: error("Hãy liên kết và chọn ống nghe trước khi tạo lượt đo")
                            val query = patientId.trim()
                            val matchedPatient = if (query.isBlank()) {
                                null
                            } else {
                                SmartHealthRepository.api.listPatients(query).firstOrNull { patient ->
                                    patient.id.equals(query, ignoreCase = true) ||
                                        patient.patientCode.equals(query, ignoreCase = true) ||
                                        patient.name.equals(query, ignoreCase = true)
                                }
                            }

                            SmartHealthRepository.api.startScan(
                                StartScanRequest(
                                    patientId = selectedProfile.id,
                                    patientName = if (matchedPatient == null) query.ifBlank { "Bệnh nhân vãng lai" } else null,
                                    patientCode = if (matchedPatient == null && query.startsWith("BN", ignoreCase = true)) query else null,
                                    mode = scanType,
                                    bodySite = date,
                                    deviceId = selectedDevice.id,
                                    doctorNotes = notes
                                )
                            )
                        }.onSuccess { scan ->
                            isSubmitting = false
                            onScanStarted(scan.id)
                        }.onFailure {
                            isSubmitting = false
                            errorMessage = it.message ?: "Không tạo được lượt đo"
                        }
                    }
                },
                enabled = !isSubmitting && devices.isNotEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .clip(RoundedCornerShape(16.dp)),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                contentPadding = PaddingValues()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.horizontalGradient(listOf(PrimaryBlue, PrimaryTeal))),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (isSubmitting) "Đang tạo lượt đo..." else "Tiếp tục để theo dõi", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = Color.White)
                    }
                }
            }
        }
    }
}
