package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanLabel
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

data class MedicalRecord(
    val id: String,
    val sourcePatientId: String,
    val patientId: String,
    val patientName: String,
    val date: String,
    val time: String,
    val duration: String,
    val type: String, // "heart" or "lung"
    val status: String, // "normal" or "abnormal"
    val diagnosis: String,
    val aiConfidence: Int
)

private fun Scan.toMedicalRecord(): MedicalRecord {
    return MedicalRecord(
        id = id,
        sourcePatientId = patientId,
        patientId = patientCode,
        patientName = patientName,
        date = formattedDate(),
        time = formattedTime(),
        duration = formattedDuration(),
        type = mode,
        status = when {
            isRecording -> "recording"
            scanIsNormal(this) -> "normal"
            else -> "abnormal"
        },
        diagnosis = if (isRecording) "Đang ghi âm từ thiết bị. Bấm Dừng ghi để lưu kết quả." else scanSummary(this),
        aiConfidence = if (isRecording) 0 else ((aiConfidence ?: 0.65) * 100).roundToInt().coerceIn(0, 100)
    )
}

@Composable
fun MedicalRecordsScreen(onNavigateBack: () -> Unit, onNavigateToDetail: (String) -> Unit) {
    var activeTab by remember { mutableStateOf("recent") }
    var backendScans by remember { mutableStateOf<List<Scan>>(emptyList()) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var stoppingRecordId by remember { mutableStateOf<String?>(null) }
    var sharingRecordId by remember { mutableStateOf<String?>(null) }
    var shareTarget by remember { mutableStateOf("") }
    val coroutineScope = rememberCoroutineScope()

    suspend fun refreshRecords() {
        runCatching {
            backendScans = SmartHealthRepository.api.listScans(limit = 100)
            loadError = null
        }.onFailure {
            loadError = it.message ?: "Không kết nối được máy chủ"
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            refreshRecords()
            delay(5000)
        }
    }

    fun stopRecord(recordId: String) {
        if (stoppingRecordId != null) return
        coroutineScope.launch {
            stoppingRecordId = recordId
            runCatching {
                SmartHealthRepository.api.stopScan(recordId)
                refreshRecords()
            }.onFailure {
                loadError = it.message ?: "Không dừng được lượt ghi"
            }
            stoppingRecordId = null
        }
    }

    fun shareRecord(record: MedicalRecord) {
        val target = shareTarget.trim()
        if (target.isBlank() || sharingRecordId != null) {
            loadError = "Nhập doctorUserId hoặc workspaceId trước khi chia sẻ"
            return
        }
        coroutineScope.launch {
            sharingRecordId = record.id
            runCatching {
                SmartHealthRepository.api.sharePatientRecord(
                    patientId = record.sourcePatientId,
                    targetDoctorUserId = if (target.startsWith("usr_") || target.startsWith("doctor")) target else "",
                    targetWorkspaceId = if (target.startsWith("usr_") || target.startsWith("doctor")) "" else target,
                    scanId = record.id
                )
            }.onSuccess {
                loadError = "Đã chia sẻ lượt đo ${record.id}"
            }.onFailure {
                loadError = it.message ?: "Không chia sẻ được lượt đo"
            }
            sharingRecordId = null
        }
    }

    val records = listOf(
        MedicalRecord("HS-2845", "pat_demo_1", "BN-2845", "Nguyễn Văn An", "12-05-2026", "14:35", "2:34", "heart", "normal", "Nhịp xoang bình thường", 98),
        MedicalRecord("HS-2844", "pat_demo_2", "BN-2844", "Trần Thị Mai", "12-05-2026", "13:20", "3:12", "lung", "abnormal", "Phát hiện tiếng ran nổ - Đáy phổi trái", 94),
        MedicalRecord("HS-2843", "pat_demo_3", "BN-2843", "Lê Văn Minh", "12-05-2026", "11:45", "2:18", "heart", "normal", "Âm sắc tim bình thường", 99),
        MedicalRecord("HS-2842", "pat_demo_4", "BN-2842", "Phạm Thuỳ Linh", "11-05-2026", "16:20", "4:05", "lung", "abnormal", "Tiếng rít - Cả hai bên phổi", 91),
        MedicalRecord("HS-2841", "pat_demo_5", "BN-2841", "Hoàng Minh Tuấn", "11-05-2026", "15:10", "2:45", "heart", "abnormal", "Âm thổi tim - Mức 2/6", 96),
        MedicalRecord("HS-2840", "pat_demo_6", "BN-2840", "Đặng Mai Phương", "11-05-2026", "14:00", "2:55", "lung", "normal", "Âm thanh nhịp thở rõ ràng", 97)
    )

    val displayRecords = backendScans.map { it.toMedicalRecord() }

    val filteredRecords = displayRecords.filter {
        when (activeTab) {
            "recent" -> true
            "heart" -> it.type == "heart"
            "lung" -> it.type == "lung"
            "abnormal" -> it.status == "abnormal"
            else -> true
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
                Text("Hồ Sơ Bệnh Án", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                IconButton(onClick = { }, modifier = Modifier.offset(x = 12.dp)) {
                    Icon(Icons.Default.FilterList, contentDescription = "Filter", tint = Color.White)
                }
            }
        }

        // Tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterTab(
                text = "Gần đây",
                icon = null,
                isSelected = activeTab == "recent",
                onClick = { activeTab = "recent" }
            )
            FilterTab(
                text = "Đo Tim",
                icon = Icons.Default.Favorite,
                isSelected = activeTab == "heart",
                onClick = { activeTab = "heart" }
            )
            FilterTab(
                text = "Đo Phổi",
                icon = Icons.Default.Air,
                isSelected = activeTab == "lung",
                onClick = { activeTab = "lung" }
            )
            FilterTab(
                text = "Chỉ cảnh báo",
                icon = Icons.Default.Warning,
                isSelected = activeTab == "abnormal",
                onClick = { activeTab = "abnormal" }
            )
        }

        OutlinedTextField(
            value = shareTarget,
            onValueChange = { shareTarget = it },
            placeholder = { Text("doctorUserId hoặc workspaceId nhận chia sẻ") },
            leadingIcon = { Icon(Icons.Default.Share, contentDescription = null, tint = TextSecondary) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryBlue,
                unfocusedBorderColor = Border
            )
        )
        Spacer(modifier = Modifier.height(12.dp))

        loadError?.let { message ->
            Text(
                text = message,
                color = if (message.startsWith("Đã")) Color(0xFF10B981) else ErrorRed,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
            )
        }

        // List
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            filteredRecords.forEach { record ->
                RecordCard(
                    record = record,
                    onClick = { onNavigateToDetail(record.id) },
                    onShare = { shareRecord(record) },
                    onStop = { stopRecord(record.id) },
                    isStopping = stoppingRecordId == record.id,
                    isSharing = sharingRecordId == record.id
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
fun FilterTab(text: String, icon: ImageVector?, isSelected: Boolean, onClick: () -> Unit) {
    val bgColor = if (isSelected) PrimaryBlue else Color.White
    val textColor = if (isSelected) Color.White else TextPrimary
    val borderColor = if (isSelected) Color.Transparent else Border
    val shadow = if (isSelected) 4.dp else 0.dp

    Row(
        modifier = Modifier
            .shadow(shadow, RoundedCornerShape(12.dp))
            .background(bgColor, RoundedCornerShape(12.dp))
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = textColor, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
        }
        Text(text, color = textColor, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun RecordCard(
    record: MedicalRecord,
    onClick: () -> Unit,
    onShare: () -> Unit,
    onStop: () -> Unit,
    isStopping: Boolean,
    isSharing: Boolean
) {
    val isRecording = record.status == "recording"
    val statusColor = when (record.status) {
        "normal" -> Color(0xFF10B981)
        "recording" -> PrimaryBlue
        else -> Color(0xFFF59E0B)
    }
    val statusText = when (record.status) {
        "normal" -> "Bình thường"
        "recording" -> "Đang ghi"
        else -> "Bất thường"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .clickable { onClick() }
            .padding(16.dp)
    ) {
        // Header row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(record.id, color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                if (record.type == "heart") Color(0xFFEF4444).copy(alpha = 0.1f) else Color(0xFF0EA5E9).copy(alpha = 0.1f),
                                RoundedCornerShape(4.dp)
                            )
                            .padding(4.dp)
                    ) {
                        Icon(
                            if (record.type == "heart") Icons.Default.Favorite else Icons.Default.Air,
                            contentDescription = null,
                            tint = if (record.type == "heart") Color(0xFFEF4444) else Color(0xFF0EA5E9),
                            modifier = Modifier.size(12.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(record.patientName, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(record.patientId, color = TextSecondary, fontSize = 14.sp)
            }
            
            Box(
                modifier = Modifier
                    .background(
                        statusColor.copy(alpha = 0.1f),
                        RoundedCornerShape(16.dp)
                    )
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (record.status == "normal") Icons.Default.CheckCircle else Icons.Default.Warning,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        statusText,
                        color = statusColor,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Diagnosis Box
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
                .border(1.dp, Color(0xFFF1F5F9), RoundedCornerShape(12.dp))
                .padding(12.dp)
        ) {
            Text(record.diagnosis, color = TextPrimary.copy(alpha = 0.8f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Footer Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${record.date} • ${record.time}", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Spacer(modifier = Modifier.width(16.dp))
                Text("Thời lượng: ${record.duration}", color = TextSecondary, fontSize = 14.sp)
            }
            Box(
                modifier = Modifier
                    .background(PrimaryBlue.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("AI:", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("${record.aiConfidence}%", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onShare,
            enabled = !isSharing && record.sourcePatientId.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(if (isSharing) "Đang chia sẻ..." else "Chia sẻ lượt đo")
        }

        if (isRecording) {
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = onStop,
                enabled = !isStopping,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = PrimaryBlue,
                    contentColor = Color.White
                )
            ) {
                if (isStopping) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text("Dừng ghi và lưu", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
