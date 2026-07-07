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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareTargetDoctor
import com.example.smart_health_android.data.ShareTargetWorkspace
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanLabel
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.data.toVietnameseMessage
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
        aiConfidence = if (isRecording) 0 else ((aiConfidence ?: 0.0) * 100).roundToInt().coerceIn(0, 100)
    )
}

private fun ShareTargetDoctor.displayName(): String = name.ifBlank { id }

private fun ShareTargetWorkspace.displayName(): String = name.ifBlank { id }

@Composable
fun MedicalRecordsScreen(onNavigateBack: () -> Unit, onNavigateToDetail: (String) -> Unit) {
    var activeTab by remember { mutableStateOf("recent") }
    var backendScans by remember { mutableStateOf<List<Scan>>(emptyList()) }
    var isLoadingRecords by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var stoppingRecordId by remember { mutableStateOf<String?>(null) }
    var sharingRecordId by remember { mutableStateOf<String?>(null) }
    var shareTargetQuery by remember { mutableStateOf("") }
    var shareTargets by remember { mutableStateOf(ShareTargets()) }
    var selectedShareDoctor by remember { mutableStateOf<ShareTargetDoctor?>(null) }
    var selectedShareWorkspace by remember { mutableStateOf<ShareTargetWorkspace?>(null) }
    var isLoadingShareTargets by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    suspend fun refreshRecords() {
        if (isLoadingRecords.not()) {
            loadError = null
        }
        runCatching {
            backendScans = SmartHealthRepository.api.listScans(limit = 100)
            loadError = null
        }.onFailure {
            loadError = it.message ?: "Không kết nối được máy chủ"
        }.also {
            isLoadingRecords = false
        }
    }

    suspend fun refreshShareTargets(query: String = shareTargetQuery) {
        isLoadingShareTargets = true
        runCatching {
            shareTargets = SmartHealthRepository.api.listShareTargets(query.trim())
        }.onFailure {
            loadError = it.toVietnameseMessage("Không tải được danh sách nơi nhận chia sẻ")
        }.also {
            isLoadingShareTargets = false
        }
    }

    LaunchedEffect(Unit) {
        while (true) {
            refreshRecords()
            delay(5000)
        }
    }

    LaunchedEffect(shareTargetQuery) {
        delay(300)
        refreshShareTargets(shareTargetQuery)
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
        val targetDoctor = selectedShareDoctor
        val targetWorkspace = selectedShareWorkspace
        if (sharingRecordId != null) return
        if (record.sourcePatientId.isBlank()) {
            loadError = "Lượt đo này chưa gắn với hồ sơ bệnh nhân để chia sẻ"
            return
        }
        if (targetDoctor == null && targetWorkspace == null) {
            loadError = "Chọn bác sĩ hoặc cơ sở nhận chia sẻ trước khi bấm chia sẻ"
            return
        }
        coroutineScope.launch {
            sharingRecordId = record.id
            runCatching {
                SmartHealthRepository.api.sharePatientRecord(
                    patientId = record.sourcePatientId,
                    targetDoctorUserId = targetDoctor?.id.orEmpty(),
                    targetWorkspaceId = targetWorkspace?.id.orEmpty(),
                    scanId = record.id
                )
            }.onSuccess {
                val targetName = targetDoctor?.displayName() ?: targetWorkspace?.displayName() ?: "nơi nhận đã chọn"
                loadError = "Đã chia sẻ lượt đo với $targetName"
            }.onFailure {
                loadError = it.toVietnameseMessage("Không chia sẻ được lượt đo")
            }
            sharingRecordId = null
        }
    }

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
                IconButton(
                    onClick = {
                        coroutineScope.launch {
                            refreshRecords()
                        }
                    },
                    modifier = Modifier.offset(x = 12.dp)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Làm mới", tint = Color.White)
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

        ShareTargetPicker(
            query = shareTargetQuery,
            onQueryChange = { shareTargetQuery = it },
            targets = shareTargets,
            selectedDoctor = selectedShareDoctor,
            selectedWorkspace = selectedShareWorkspace,
            loading = isLoadingShareTargets,
            onSelectDoctor = {
                selectedShareDoctor = it
                selectedShareWorkspace = null
            },
            onSelectWorkspace = {
                selectedShareWorkspace = it
                selectedShareDoctor = null
            },
            onRetry = {
                coroutineScope.launch { refreshShareTargets(shareTargetQuery) }
            },
            modifier = Modifier.padding(horizontal = 16.dp)
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

        if (isLoadingRecords) {
            LinearProgressIndicator(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                color = PrimaryBlue
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        // List
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (!isLoadingRecords && filteredRecords.isEmpty()) {
                EmptyRecordsState(activeTab = activeTab, hasError = loadError != null, onRetry = {
                    coroutineScope.launch { refreshRecords() }
                })
            } else {
                filteredRecords.forEach { record ->
                    RecordCard(
                        record = record,
                        onClick = { onNavigateToDetail(record.id) },
                        onShare = { shareRecord(record) },
                        onStop = { stopRecord(record.id) },
                        isStopping = stoppingRecordId == record.id,
                        isSharing = sharingRecordId == record.id,
                        hasShareTarget = selectedShareDoctor != null || selectedShareWorkspace != null
                    )
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun ShareTargetPicker(
    query: String,
    onQueryChange: (String) -> Unit,
    targets: ShareTargets,
    selectedDoctor: ShareTargetDoctor?,
    selectedWorkspace: ShareTargetWorkspace?,
    loading: Boolean,
    onSelectDoctor: (ShareTargetDoctor) -> Unit,
    onSelectWorkspace: (ShareTargetWorkspace) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Nơi nhận chia sẻ", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text("Tìm bác sĩ hoặc cơ sở y tế đã được cấp quyền", color = TextSecondary, fontSize = 12.sp)
            }
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryBlue)
            } else {
                IconButton(onClick = onRetry) {
                    Icon(Icons.Default.Refresh, contentDescription = "Tải lại nơi nhận", tint = PrimaryBlue)
                }
            }
        }

        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = { Text("Tìm bác sĩ hoặc cơ sở nhận chia sẻ") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = TextSecondary) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryBlue,
                unfocusedBorderColor = Border
            )
        )

        val workspaceOptions = targets.workspaces.take(4)
        val doctorOptions = targets.doctors.take(4)

        if (workspaceOptions.isNotEmpty()) {
            Text("Cơ sở y tế", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            workspaceOptions.forEach { workspace ->
                ShareTargetOptionRow(
                    title = workspace.displayName(),
                    subtitle = listOf(workspace.type, workspace.address).filter { it.isNotBlank() }.joinToString(" • "),
                    icon = Icons.Default.Home,
                    selected = selectedWorkspace?.id == workspace.id,
                    onClick = { onSelectWorkspace(workspace) }
                )
            }
        }

        if (doctorOptions.isNotEmpty()) {
            Text("Bác sĩ", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            doctorOptions.forEach { doctor ->
                ShareTargetOptionRow(
                    title = doctor.displayName(),
                    subtitle = listOf(doctor.specialty, doctor.clinicName).filter { it.isNotBlank() }.joinToString(" • "),
                    icon = Icons.Default.Person,
                    selected = selectedDoctor?.id == doctor.id,
                    onClick = { onSelectDoctor(doctor) }
                )
            }
        }

        if (!loading && workspaceOptions.isEmpty() && doctorOptions.isEmpty()) {
            Text(
                "Chưa có nơi nhận phù hợp. Hãy thử từ khóa khác hoặc tải lại.",
                color = TextSecondary,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

@Composable
private fun ShareTargetOptionRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (selected) PrimaryBlue.copy(alpha = 0.08f) else Color(0xFFF8FAFC),
                RoundedCornerShape(12.dp)
            )
            .border(
                1.dp,
                if (selected) PrimaryBlue else Color(0xFFE2E8F0),
                RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(if (selected) PrimaryBlue.copy(alpha = 0.12f) else Color.White, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = if (selected) PrimaryBlue else TextSecondary, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = TextSecondary, fontSize = 12.sp)
            }
        }
        if (selected) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(18.dp))
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
    isSharing: Boolean,
    hasShareTarget: Boolean
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
            enabled = !isSharing && record.sourcePatientId.isNotBlank() && hasShareTarget,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp)
        ) {
            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                when {
                    isSharing -> "Đang chia sẻ..."
                    !hasShareTarget -> "Chọn nơi nhận để chia sẻ"
                    else -> "Chia sẻ lượt đo"
                }
            )
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

@Composable
fun EmptyRecordsState(
    activeTab: String,
    hasError: Boolean,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            if (hasError) Icons.Default.Warning else Icons.Default.Description,
            contentDescription = null,
            tint = if (hasError) Color(0xFFEF4444) else PrimaryBlue,
            modifier = Modifier.size(32.dp)
        )
        Text(
            text = if (hasError) "Không tải được hồ sơ" else "Chưa có hồ sơ trong bộ lọc này",
            color = TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = if (hasError) {
                "Backend chưa trả dữ liệu hoặc mạng đang lỗi. Hãy thử tải lại."
            } else {
                when (activeTab) {
                    "heart" -> "Hiện chưa có lượt đo tim."
                    "lung" -> "Hiện chưa có lượt đo phổi."
                    "abnormal" -> "Chưa có lượt đo bất thường."
                    else -> "Chưa có lượt đo nào được đồng bộ về backend."
                }
            },
            color = TextSecondary,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp
        )
        OutlinedButton(onClick = onRetry) {
            Text("Tải lại")
        }
    }
}
