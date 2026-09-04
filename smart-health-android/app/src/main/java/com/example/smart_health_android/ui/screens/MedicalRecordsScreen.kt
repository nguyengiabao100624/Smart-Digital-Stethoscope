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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareTargetDoctor
import com.example.smart_health_android.data.ShareTargetWorkspace
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.records.MedicalRecordsLoadState
import com.example.smart_health_android.records.MedicalRecordsUiAction
import com.example.smart_health_android.records.MedicalRecordsViewModel
import com.example.smart_health_android.records.MedicalRecordsViewModelFactory
import com.example.smart_health_android.ui.theme.*
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MedicalRecordsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToDetail: (String) -> Unit,
    showBackNavigation: Boolean = true,
) {
    val recordsViewModel: MedicalRecordsViewModel = viewModel(
        factory = MedicalRecordsViewModelFactory(),
    )
    val state by recordsViewModel.uiState.collectAsStateWithLifecycle()

    val displayRecords = state.scans.map { it.toMedicalRecord() }

    val filteredRecords = displayRecords.filter {
        when (state.activeTab) {
            "recent" -> true
            "heart" -> it.type == "heart"
            "lung" -> it.type == "lung"
            "abnormal" -> it.status == "abnormal"
            else -> true
        }
    }
    val semanticColors = ShcareTheme.colors
    val contentScrollState = rememberScrollState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.linearGradient(
                        listOf(
                            semanticColors.brandHeaderStart,
                            semanticColors.brandHeaderEnd,
                        ),
                    ),
                )
                .padding(horizontal = 16.dp, vertical = 16.dp)
                .statusBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (showBackNavigation) {
                    IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.shcare_action_back),
                            tint = semanticColors.onBrandHeader,
                        )
                    }
                } else {
                    Spacer(modifier = Modifier.width(48.dp))
                }
                Text("Hồ Sơ Bệnh Án", color = semanticColors.onBrandHeader, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                IconButton(
                    onClick = { recordsViewModel.onAction(MedicalRecordsUiAction.Refresh) },
                    modifier = Modifier.offset(x = 12.dp)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Làm mới", tint = semanticColors.onBrandHeader)
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { recordsViewModel.onAction(MedicalRecordsUiAction.Refresh) },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(contentScrollState),
            ) {
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
                        isSelected = state.activeTab == "recent",
                        onClick = { recordsViewModel.onAction(MedicalRecordsUiAction.TabSelected("recent")) }
                    )
                    FilterTab(
                        text = "Đo Tim",
                        icon = Icons.Default.Favorite,
                        isSelected = state.activeTab == "heart",
                        onClick = { recordsViewModel.onAction(MedicalRecordsUiAction.TabSelected("heart")) }
                    )
                    FilterTab(
                        text = "Đo Phổi",
                        icon = Icons.Default.Air,
                        isSelected = state.activeTab == "lung",
                        onClick = { recordsViewModel.onAction(MedicalRecordsUiAction.TabSelected("lung")) }
                    )
                    FilterTab(
                        text = "Chỉ cảnh báo",
                        icon = Icons.Default.Warning,
                        isSelected = state.activeTab == "abnormal",
                        onClick = { recordsViewModel.onAction(MedicalRecordsUiAction.TabSelected("abnormal")) }
                    )
                }

                ShareTargetPicker(
                    query = state.shareTargetQuery,
                    onQueryChange = {
                        recordsViewModel.onAction(MedicalRecordsUiAction.ShareQueryChanged(it))
                    },
                    targets = state.shareTargets,
                    selectedDoctor = state.selectedShareDoctor,
                    selectedWorkspace = state.selectedShareWorkspace,
                    loading = state.isLoadingShareTargets,
                    onSelectDoctor = {
                        recordsViewModel.onAction(MedicalRecordsUiAction.DoctorSelected(it))
                    },
                    onSelectWorkspace = {
                        recordsViewModel.onAction(MedicalRecordsUiAction.WorkspaceSelected(it))
                    },
                    onRetry = { recordsViewModel.onAction(MedicalRecordsUiAction.RefreshShareTargets) },
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))

                state.statusMessage.takeIf { it.isNotBlank() }?.let { message ->
                    Text(
                        text = message,
                        color = semanticColors.success,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    )
                }
                state.errorMessage.takeIf { it.isNotBlank() }?.let { message ->
                    Text(
                        text = message,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 13.sp,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    )
                }

                if (state.loadState == MedicalRecordsLoadState.Loading) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }

                Column(
                    modifier = Modifier.padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (state.loadState != MedicalRecordsLoadState.Loading && filteredRecords.isEmpty()) {
                        EmptyRecordsState(
                            activeTab = state.activeTab,
                            hasError = state.loadState != MedicalRecordsLoadState.Content,
                            onRetry = { recordsViewModel.onAction(MedicalRecordsUiAction.Refresh) },
                        )
                    } else {
                        filteredRecords.forEach { record ->
                            RecordCard(
                                record = record,
                                onClick = { onNavigateToDetail(record.id) },
                                onShare = {
                                    recordsViewModel.onAction(MedicalRecordsUiAction.ShareRecord(record.id))
                                },
                                onStop = {
                                    recordsViewModel.onAction(MedicalRecordsUiAction.StopRecord(record.id))
                                },
                                isStopping = state.stoppingRecordId == record.id,
                                isSharing = state.sharingRecordId == record.id,
                                hasShareTarget = state.hasShareTarget,
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
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
    var expanded by rememberSaveable { mutableStateOf(false) }
    val selectionSummary = when {
        selectedDoctor != null -> selectedDoctor.displayName()
        selectedWorkspace != null -> selectedWorkspace.displayName()
        else -> "Chưa chọn nơi nhận"
    }
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clickable { expanded = !expanded },
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Nơi nhận chia sẻ", color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text(selectionSummary, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
            }
            Spacer(modifier = Modifier.width(8.dp))
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) "Thu gọn nơi nhận chia sẻ" else "Mở nơi nhận chia sẻ",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        if (expanded) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Tìm bác sĩ hoặc cơ sở y tế đã được cấp quyền",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onRetry, enabled = !loading) {
                    Icon(Icons.Default.Refresh, contentDescription = "Tải lại nơi nhận", tint = MaterialTheme.colorScheme.primary)
                }
            }

            OutlinedTextField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = { Text("Tìm bác sĩ hoặc cơ sở nhận chia sẻ") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline
                )
            )

            val workspaceOptions = targets.workspaces.take(4)
            val doctorOptions = targets.doctors.take(4)

            if (workspaceOptions.isNotEmpty()) {
                Text("Cơ sở y tế", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                workspaceOptions.forEach { workspace ->
                    ShareTargetOptionRow(
                        title = workspace.displayName(),
                        subtitle = listOf(workspace.type, workspace.address).filter { it.isNotBlank() }.joinToString(" • "),
                        icon = Icons.Default.Home,
                        selected = selectedWorkspace?.id == workspace.id,
                        onClick = {
                            onSelectWorkspace(workspace)
                            expanded = false
                        }
                    )
                }
            }

            if (doctorOptions.isNotEmpty()) {
                Text("Bác sĩ", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                doctorOptions.forEach { doctor ->
                    ShareTargetOptionRow(
                        title = doctor.displayName(),
                        subtitle = listOf(doctor.specialty, doctor.clinicName).filter { it.isNotBlank() }.joinToString(" • "),
                        icon = Icons.Default.Person,
                        selected = selectedDoctor?.id == doctor.id,
                        onClick = {
                            onSelectDoctor(doctor)
                            expanded = false
                        }
                    )
                }
            }

            if (!loading && workspaceOptions.isEmpty() && doctorOptions.isEmpty()) {
                Text(
                    "Chưa có nơi nhận phù hợp. Hãy thử từ khóa khác hoặc tải lại.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
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
                if (selected) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                RoundedCornerShape(12.dp)
            )
            .border(
                1.dp,
                if (selected) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.outlineVariant,
                RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
            .heightIn(min = 48.dp)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(
                    if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                    else MaterialTheme.colorScheme.surface,
                    RoundedCornerShape(10.dp),
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (selected) MaterialTheme.colorScheme.onPrimaryContainer
                else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            if (subtitle.isNotBlank()) {
                Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
        }
        if (selected) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        }
    }
}

@Composable
fun FilterTab(text: String, icon: ImageVector?, isSelected: Boolean, onClick: () -> Unit) {
    val bgColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface
    val textColor = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
    val borderColor = if (isSelected) Color.Transparent else MaterialTheme.colorScheme.outlineVariant
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
    val semanticColors = ShcareTheme.colors
    val isRecording = record.status == "recording"
    val statusContainerColor = when (record.status) {
        "normal" -> semanticColors.successContainer
        "recording" -> MaterialTheme.colorScheme.primaryContainer
        else -> semanticColors.warningContainer
    }
    val statusContentColor = when (record.status) {
        "normal" -> semanticColors.onSuccessContainer
        "recording" -> MaterialTheme.colorScheme.onPrimaryContainer
        else -> semanticColors.onWarningContainer
    }
    val statusText = when (record.status) {
        "normal" -> "Bình thường"
        "recording" -> "Đang ghi"
        else -> "Bất thường"
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
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
                    Text(record.id, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                if (record.type == "heart") MaterialTheme.colorScheme.primaryContainer
                                else semanticColors.infoContainer,
                                RoundedCornerShape(4.dp)
                            )
                            .padding(4.dp)
                    ) {
                        Icon(
                            if (record.type == "heart") Icons.Default.Favorite else Icons.Default.Air,
                            contentDescription = null,
                            tint = if (record.type == "heart") MaterialTheme.colorScheme.onPrimaryContainer
                            else semanticColors.onInfoContainer,
                            modifier = Modifier.size(12.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(record.patientName, color = MaterialTheme.colorScheme.onSurface, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(record.patientId, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            }
            
            Box(
                modifier = Modifier
                    .background(
                        statusContainerColor,
                        RoundedCornerShape(16.dp)
                    )
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (record.status == "normal") Icons.Default.CheckCircle else Icons.Default.Warning,
                        contentDescription = null,
                        tint = statusContentColor,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        statusText,
                        color = statusContentColor,
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
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f), RoundedCornerShape(12.dp))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
                .padding(12.dp)
        ) {
            Text(record.diagnosis, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Footer Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${record.date} • ${record.time}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Spacer(modifier = Modifier.width(16.dp))
                Text("Thời lượng: ${record.duration}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            }
            Box(
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Độ tin cậy:", color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("${record.aiConfidence}%", color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 12.sp, fontWeight = FontWeight.Bold)
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
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary
                )
            ) {
                if (isStopping) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
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
    val containerColor = if (hasError) {
        MaterialTheme.colorScheme.errorContainer
    } else {
        MaterialTheme.colorScheme.surface
    }
    val contentColor = if (hasError) {
        MaterialTheme.colorScheme.onErrorContainer
    } else {
        MaterialTheme.colorScheme.onSurface
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(containerColor, RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Icon(
            if (hasError) Icons.Default.Warning else Icons.Default.Description,
            contentDescription = null,
            tint = if (hasError) contentColor else MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(32.dp)
        )
        Text(
            text = if (hasError) "Không tải được hồ sơ" else "Chưa có hồ sơ trong bộ lọc này",
            color = contentColor,
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
            color = if (hasError) contentColor else MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp
        )
        OutlinedButton(onClick = onRetry) {
            Text("Tải lại")
        }
    }
}
