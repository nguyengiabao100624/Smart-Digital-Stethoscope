package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.SsidChart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import androidx.compose.ui.draw.drawBehind
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanLabel
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.doctor.DoctorDashboardLoadState
import com.example.smart_health_android.doctor.DoctorDashboardUiAction
import com.example.smart_health_android.doctor.DoctorDashboardViewModel
import com.example.smart_health_android.doctor.DoctorDashboardViewModelFactory
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import com.example.smart_health_android.ui.theme.SmarthealthandroidTheme
import kotlinx.coroutines.delay

@Composable
fun DashboardScreen(
    onNavigateToSettings: () -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToBluetooth: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit
) {
    val dashboardViewModel: DoctorDashboardViewModel = viewModel(
        factory = DoctorDashboardViewModelFactory(),
    )
    val state by dashboardViewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(dashboardViewModel) {
        while (true) {
            delay(4000)
            dashboardViewModel.onAction(DoctorDashboardUiAction.Refresh)
        }
    }

    if (state.loadState != DoctorDashboardLoadState.Content) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center,
        ) {
            val retry = { dashboardViewModel.onAction(DoctorDashboardUiAction.Refresh) }
            when (state.loadState) {
                DoctorDashboardLoadState.Loading -> ShcareLoadingState(
                    message = "Đang tải bảng điều khiển…",
                )
                DoctorDashboardLoadState.PermissionDenied -> ShcarePermissionState(
                    title = "Không có quyền xem bảng điều khiển",
                    message = state.errorMessage,
                    actionLabel = "Kiểm tra lại quyền",
                    onRequestPermission = retry,
                )
                DoctorDashboardLoadState.Offline -> ShcareOfflineState(
                    message = state.errorMessage,
                    onRetry = retry,
                )
                else -> ShcareErrorState(
                    message = state.errorMessage,
                    onRetry = retry,
                )
            }
        }
        return
    }
    val semanticColors = ShcareTheme.colors

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(bottom = 28.dp)
    ) {
        item {
            DoctorDashboardHeader(
                displayName = state.displayName,
                workspaceName = state.workspaceName,
                workspaceMeta = state.workspaceMeta,
                searchQuery = state.searchQuery,
                onSearchQueryChange = {
                    dashboardViewModel.onAction(DoctorDashboardUiAction.SearchChanged(it))
                },
                onNavigateToSettings = onNavigateToSettings,
                onNavigateToNotifications = onNavigateToNotifications
            )
        }

        item {
            Column(
                modifier = Modifier
                    .padding(horizontal = 24.dp)
                    .offset(y = (-28).dp)
            ) {
                DeviceStatusCard(
                    status = state.backendStatus,
                    error = state.errorMessage.ifBlank { null },
                    onClick = onNavigateToBluetooth
                )

                Spacer(modifier = Modifier.height(22.dp))

                Text(
                    text = stringResource(R.string.doctor_dashboard_quick_actions),
                    color = MaterialTheme.colorScheme.onBackground,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.SsidChart,
                        label = stringResource(R.string.doctor_dashboard_measure_now),
                        background = semanticColors.brandHeaderStart,
                        contentColor = semanticColors.onBrandHeader,
                        onClick = onNavigateToMonitoring
                    )
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Description,
                        label = stringResource(R.string.doctor_dashboard_records),
                        background = MaterialTheme.colorScheme.surface,
                        contentColor = MaterialTheme.colorScheme.primary,
                        borderColor = MaterialTheme.colorScheme.primary,
                        onClick = onNavigateToRecords
                    )
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.ChatBubbleOutline,
                        label = stringResource(R.string.ai_assistant_short_label),
                        background = MaterialTheme.colorScheme.secondary,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                        onClick = onNavigateToAssistant
                    )
                    QuickActionTile(
                        modifier = Modifier.weight(1f),
                        icon = Icons.Default.Add,
                        label = stringResource(R.string.doctor_dashboard_new_scan),
                        background = MaterialTheme.colorScheme.surface,
                        contentColor = MaterialTheme.colorScheme.primary,
                        dashed = true,
                        onClick = onNavigateToNewScan
                    )
                }

                if (state.canViewAppointments) {
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedButton(
                        onClick = onNavigateToAppointments,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                    ) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(stringResource(R.string.appointment_title_doctor))
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.doctor_dashboard_recent_results),
                        color = MaterialTheme.colorScheme.onBackground,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = stringResource(R.string.doctor_dashboard_view_all),
                        color = MaterialTheme.colorScheme.primary,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.clickable(onClick = onNavigateToRecords)
                    )
                }

                if (state.filteredScans.isEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    EmptyRecentScans(loadError = state.errorMessage.ifBlank { null })
                }
            }
        }

        items(state.filteredScans, key = { it.id }) { scan ->
            RecentScanCard(
                scan = scan,
                onClick = { onNavigateToRecordDetail(scan.id) },
                onStopRecording = {
                    dashboardViewModel.onAction(DoctorDashboardUiAction.StopScan(scan.id))
                },
                isStopping = state.stoppingScanId == scan.id
            )
        }
    }
}

@Composable
private fun DoctorDashboardHeader(
    displayName: String,
    workspaceName: String,
    workspaceMeta: String,
    searchQuery: String,
    onSearchQueryChange: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToNotifications: () -> Unit
) {
    val semanticColors = ShcareTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 32.dp, bottomEnd = 32.dp))
            .background(
                Brush.linearGradient(
                    listOf(
                        semanticColors.brandHeaderStart,
                        semanticColors.brandHeaderEnd,
                    ),
                ),
            )
            .statusBarsPadding()
            .padding(start = 24.dp, end = 24.dp, top = 18.dp, bottom = 64.dp)
    ) {
        Column {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.doctor_dashboard_welcome),
                        color = semanticColors.onBrandHeader.copy(alpha = 0.82f),
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = displayName,
                        modifier = Modifier.semantics { heading() },
                        color = semanticColors.onBrandHeader,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (workspaceName.isNotBlank()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = listOf(workspaceName, workspaceMeta).filter { it.isNotBlank() }.joinToString(" • "),
                            color = semanticColors.onBrandHeader.copy(alpha = 0.78f),
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HeaderIconButton(
                        icon = Icons.Default.Settings,
                        contentDescription = stringResource(R.string.shcare_action_settings),
                        onClick = onNavigateToSettings,
                    )
                    HeaderIconButton(
                        icon = Icons.Default.Notifications,
                        contentDescription = stringResource(R.string.shcare_action_notifications),
                        onClick = onNavigateToNotifications,
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            TextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                placeholder = {
                    Text(
                        text = stringResource(R.string.doctor_dashboard_patient_search_hint),
                        color = semanticColors.onBrandHeader.copy(alpha = 0.68f),
                        fontSize = 14.sp
                    )
                },
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = null,
                        tint = semanticColors.onBrandHeader.copy(alpha = 0.7f)
                    )
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .border(
                        1.dp,
                        semanticColors.onBrandHeader.copy(alpha = 0.28f),
                        RoundedCornerShape(14.dp),
                    ),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = semanticColors.onBrandHeader.copy(alpha = 0.18f),
                    unfocusedContainerColor = semanticColors.onBrandHeader.copy(alpha = 0.14f),
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedTextColor = semanticColors.onBrandHeader,
                    unfocusedTextColor = semanticColors.onBrandHeader,
                    cursorColor = semanticColors.onBrandHeader
                ),
                singleLine = true,
                shape = RoundedCornerShape(14.dp)
            )
        }
    }
}

private fun workspaceTypeLabel(type: String): String {
    return when (type) {
        "solo_practice", "doctor_private" -> "Bác sĩ tư"
        "clinic" -> "Phòng khám"
        "hospital" -> "Bệnh viện"
        "personal" -> "Cá nhân/gia đình"
        "platform" -> "Nền tảng"
        else -> ""
    }
}

private fun roleLabel(role: String): String {
    return when (role) {
        "doctor" -> "Bác sĩ"
        "workspace_owner" -> "Chủ workspace"
        "workspace_admin", "clinic_manager" -> "Quản lý workspace"
        "nurse" -> "Điều dưỡng"
        "technician" -> "Kỹ thuật viên"
        "billing" -> "Tài chính"
        "viewer" -> "Chỉ xem"
        else -> ""
    }
}

@Composable
private fun HeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val semanticColors = ShcareTheme.colors
    IconButton(
        onClick = onClick,
        modifier = Modifier
            .size(48.dp)
            .background(semanticColors.onBrandHeader.copy(alpha = 0.14f), CircleShape)
            .border(1.dp, semanticColors.onBrandHeader.copy(alpha = 0.28f), CircleShape)
    ) {
        Icon(icon, contentDescription = contentDescription, tint = semanticColors.onBrandHeader)
    }
}

@Composable
private fun DeviceStatusCard(
    status: BackendStatus,
    error: String?,
    onClick: () -> Unit
) {
    val semanticColors = ShcareTheme.colors
    val connected = status.espCount > 0
    val statusColor = when {
        error != null -> MaterialTheme.colorScheme.error
        connected -> semanticColors.success
        else -> semanticColors.offline
    }
    val statusContainerColor = when {
        error != null -> MaterialTheme.colorScheme.errorContainer
        connected -> semanticColors.successContainer
        else -> semanticColors.offlineContainer
    }
    val statusContentColor = when {
        error != null -> MaterialTheme.colorScheme.onErrorContainer
        connected -> semanticColors.onSuccessContainer
        else -> semanticColors.onOfflineContainer
    }
    val statusText = when {
        error != null -> "Không kết nối máy chủ"
        connected -> "Đã nhận tín hiệu ESP32"
        else -> "Chờ tín hiệu thiết bị"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                        modifier = Modifier
                            .size(42.dp)
                            .background(statusContainerColor, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.MonitorHeart,
                        contentDescription = null,
                        tint = statusContentColor,
                        modifier = Modifier.size(23.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.doctor_dashboard_device_status),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = statusText,
                        color = statusColor,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    StatusPill(icon = Icons.Default.MonitorHeart, text = "${status.espCount}")
                    Icon(Icons.Default.Wifi, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(if (connected) 1f else 0.18f)
                        .height(6.dp)
                        .background(
                            Brush.horizontalGradient(
                                listOf(statusColor, MaterialTheme.colorScheme.secondary),
                            ),
                            CircleShape,
                        )
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = stringResource(
                    R.string.doctor_dashboard_server_status,
                    status.sampleRate,
                    status.udpPort,
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun StatusPill(icon: ImageVector, text: String) {
    Row(
        modifier = Modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
            .padding(horizontal = 8.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(text = text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun QuickActionTile(
    modifier: Modifier,
    icon: ImageVector,
    label: String,
    background: Color,
    contentColor: Color,
    onClick: () -> Unit,
    borderColor: Color? = null,
    dashed: Boolean = false
) {
    val shape = RoundedCornerShape(14.dp)
    val dashedBorderColor = MaterialTheme.colorScheme.primary
    val borderModifier = when {
        dashed -> Modifier.drawBehind {
            drawRoundRect(
                color = dashedBorderColor,
                style = Stroke(
                    width = 1.5.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 10f), 0f)
                ),
                cornerRadius = CornerRadius(14.dp.toPx(), 14.dp.toPx())
            )
        }
        borderColor != null -> Modifier.border(1.5.dp, borderColor, shape)
        else -> Modifier
    }

    Column(
        modifier = modifier
            .aspectRatio(0.92f)
            .background(background, shape)
            .then(borderModifier)
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(icon, contentDescription = null, tint = contentColor, modifier = Modifier.size(30.dp))
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = label,
            color = contentColor,
            fontSize = 12.sp,
            lineHeight = 14.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun EmptyRecentScans(loadError: String?) {
    val message = loadError ?: "Chưa có lượt đo nào. Bấm Đo mới để tạo hồ sơ đầu tiên."
    val hasError = loadError != null
    val containerColor = if (hasError) {
        MaterialTheme.colorScheme.errorContainer
    } else {
        MaterialTheme.colorScheme.surface
    }
    val contentColor = if (hasError) {
        MaterialTheme.colorScheme.onErrorContainer
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(containerColor, RoundedCornerShape(14.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Warning, contentDescription = null, tint = contentColor, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Text(text = message, color = contentColor, fontSize = 14.sp, lineHeight = 19.sp)
    }
}

@Composable
private fun RecentScanCard(
    scan: Scan,
    onClick: () -> Unit,
    onStopRecording: () -> Unit,
    isStopping: Boolean
) {
    val semanticColors = ShcareTheme.colors
    val normal = scanIsNormal(scan)
    val isRecording = scan.isRecording
    val badgeContainerColor = when {
        isRecording -> MaterialTheme.colorScheme.primaryContainer
        normal -> semanticColors.successContainer
        else -> semanticColors.warningContainer
    }
    val badgeContentColor = when {
        isRecording -> MaterialTheme.colorScheme.onPrimaryContainer
        normal -> semanticColors.onSuccessContainer
        else -> semanticColors.onWarningContainer
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            .offset(y = (-16).dp)
            .padding(bottom = 12.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = scan.id,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = scan.patientName,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = scanLabel(scan),
                    color = badgeContentColor,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .background(badgeContainerColor, CircleShape)
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stringResource(
                        if (scan.isHeart) {
                            R.string.doctor_dashboard_scan_heart
                        } else {
                            R.string.doctor_dashboard_scan_lung
                        },
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = stringResource(
                        R.string.doctor_dashboard_scan_time,
                        scan.formattedDate(),
                        scan.formattedTime(),
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f), RoundedCornerShape(12.dp))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
                    .padding(12.dp)
            ) {
                Column {
                    Text(
                        text = stringResource(R.string.ai_assistant_result_label),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = scanSummary(scan),
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 14.sp,
                        lineHeight = 19.sp,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (isRecording) {
                Spacer(modifier = Modifier.height(12.dp))
                TextButton(
                    onClick = onStopRecording,
                    enabled = !isStopping,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.primary
                    ),
                    modifier = Modifier.align(Alignment.End)
                ) {
                    if (isStopping) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text("Dừng ghi và lưu", fontWeight = FontWeight.SemiBold)
                }
            }
        }
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
            onNavigateToAppointments = {},
            onNavigateToRecordDetail = {}
        )
    }
}
