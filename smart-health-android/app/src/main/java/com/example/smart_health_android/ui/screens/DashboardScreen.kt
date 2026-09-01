package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.SsidChart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.PatientSnapshot
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanLabel
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.doctor.DoctorDashboardLoadState
import com.example.smart_health_android.doctor.DoctorDashboardUiAction
import com.example.smart_health_android.doctor.DoctorDashboardUiState
import com.example.smart_health_android.doctor.DoctorDashboardViewModel
import com.example.smart_health_android.doctor.DoctorDashboardViewModelFactory
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun DashboardScreen(
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToDeviceManagement: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    viewModel: DoctorDashboardViewModel = viewModel(
        factory = DoctorDashboardViewModelFactory(),
    ),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    DoctorDashboardContent(
        state = state,
        snackbarHostState = remember { SnackbarHostState() },
        onAction = viewModel::onAction,
        onNavigateToMonitoring = onNavigateToMonitoring,
        onNavigateToRecords = onNavigateToRecords,
        onNavigateToAssistant = onNavigateToAssistant,
        onNavigateToNewScan = onNavigateToNewScan,
        onNavigateToNotifications = onNavigateToNotifications,
        onNavigateToDeviceManagement = onNavigateToDeviceManagement,
        onNavigateToAppointments = onNavigateToAppointments,
        onNavigateToRecordDetail = onNavigateToRecordDetail,
        onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
    )
}

@Composable
internal fun DoctorDashboardContent(
    state: DoctorDashboardUiState,
    snackbarHostState: SnackbarHostState,
    onAction: (DoctorDashboardUiAction) -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToDeviceManagement: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit = {},
) {
    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .testTag("doctor-dashboard.screen"),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            DoctorDashboardHeader(
                displayName = state.displayName,
                workspaceName = state.workspaceName,
                workspaceMeta = state.workspaceMeta,
                searchQuery = state.searchQuery,
                searchEnabled = state.loadState == DoctorDashboardLoadState.Content,
                isRefreshing = state.isRefreshing,
                onSearchQueryChange = {
                    onAction(DoctorDashboardUiAction.SearchChanged(it))
                },
                onRefresh = { onAction(DoctorDashboardUiAction.Refresh) },
                onNavigateToNotifications = onNavigateToNotifications,
            )
        },
    ) { innerPadding ->
        when (state.loadState) {
            DoctorDashboardLoadState.Loading -> ShcareLoadingState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("doctor-dashboard.state.loading"),
                message = stringResource(R.string.doctor_dashboard_loading),
            )

            DoctorDashboardLoadState.PermissionDenied -> ShcarePermissionState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("doctor-dashboard.state.permission"),
                title = stringResource(R.string.doctor_dashboard_permission_title),
                message = state.errorMessage.ifBlank {
                    stringResource(R.string.doctor_dashboard_permission_message)
                },
                actionLabel = stringResource(R.string.doctor_dashboard_open_workspace),
                onRequestPermission = onOpenWorkspaceSwitcher,
            )

            DoctorDashboardLoadState.Offline -> ShcareOfflineState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("doctor-dashboard.state.offline"),
                title = stringResource(R.string.doctor_dashboard_offline_title),
                message = state.errorMessage.ifBlank {
                    stringResource(R.string.doctor_dashboard_offline_message)
                },
                retryLabel = stringResource(R.string.doctor_dashboard_retry),
                onRetry = { onAction(DoctorDashboardUiAction.Refresh) },
            )

            DoctorDashboardLoadState.Error -> ShcareErrorState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("doctor-dashboard.state.error"),
                title = stringResource(R.string.doctor_dashboard_error_title),
                message = state.errorMessage.ifBlank {
                    stringResource(R.string.doctor_dashboard_error_message)
                },
                retryLabel = stringResource(R.string.doctor_dashboard_retry),
                onRetry = { onAction(DoctorDashboardUiAction.Refresh) },
            )

            DoctorDashboardLoadState.Content -> DoctorDashboardReadyContent(
                state = state,
                innerPadding = innerPadding,
                onAction = onAction,
                onNavigateToMonitoring = onNavigateToMonitoring,
                onNavigateToRecords = onNavigateToRecords,
                onNavigateToAssistant = onNavigateToAssistant,
                onNavigateToNewScan = onNavigateToNewScan,
                onNavigateToDeviceManagement = onNavigateToDeviceManagement,
                onNavigateToAppointments = onNavigateToAppointments,
                onNavigateToRecordDetail = onNavigateToRecordDetail,
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
    searchEnabled: Boolean,
    isRefreshing: Boolean,
    onSearchQueryChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onNavigateToNotifications: () -> Unit,
) {
    val semanticColors = ShcareTheme.colors
    val resolvedName = displayName.ifBlank {
        stringResource(R.string.doctor_dashboard_name_fallback)
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp))
            .background(
                Brush.linearGradient(
                    listOf(
                        semanticColors.brandHeaderStart,
                        semanticColors.brandHeaderEnd,
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(
                    start = ShcareTheme.spacing.large,
                    end = ShcareTheme.spacing.large,
                    top = ShcareTheme.spacing.medium,
                    bottom = ShcareTheme.spacing.extraLarge,
                ),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
                ) {
                    Text(
                        text = stringResource(R.string.doctor_dashboard_welcome),
                        style = MaterialTheme.typography.bodyMedium,
                        color = semanticColors.onBrandHeader.copy(alpha = 0.82f),
                    )
                    Text(
                        text = resolvedName,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = semanticColors.onBrandHeader,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.semantics { heading() },
                    )
                    val workspaceContext = listOf(workspaceName, workspaceMeta)
                        .filter(String::isNotBlank)
                        .joinToString(" • ")
                    if (workspaceContext.isNotBlank()) {
                        Text(
                            text = workspaceContext,
                            style = MaterialTheme.typography.labelMedium,
                            color = semanticColors.onBrandHeader.copy(alpha = 0.82f),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                HeaderIconButton(
                    icon = Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.doctor_dashboard_refresh),
                    enabled = !isRefreshing,
                    testTag = "doctor-dashboard.action.refresh",
                    onClick = onRefresh,
                )
                Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                HeaderIconButton(
                    icon = Icons.Default.Notifications,
                    contentDescription = stringResource(R.string.shcare_action_notifications),
                    testTag = "doctor-dashboard.action.notifications",
                    onClick = onNavigateToNotifications,
                )
            }

            TextField(
                value = searchQuery,
                onValueChange = onSearchQueryChange,
                enabled = searchEnabled,
                placeholder = {
                    Text(stringResource(R.string.doctor_dashboard_patient_search_hint))
                },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp)
                    .border(
                        1.dp,
                        semanticColors.onBrandHeader.copy(alpha = 0.30f),
                        MaterialTheme.shapes.medium,
                    )
                    .testTag("doctor-dashboard.search"),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = semanticColors.onBrandHeader.copy(alpha = 0.18f),
                    unfocusedContainerColor = semanticColors.onBrandHeader.copy(alpha = 0.14f),
                    disabledContainerColor = semanticColors.onBrandHeader.copy(alpha = 0.10f),
                    focusedTextColor = semanticColors.onBrandHeader,
                    unfocusedTextColor = semanticColors.onBrandHeader,
                    focusedPlaceholderColor = semanticColors.onBrandHeader.copy(alpha = 0.72f),
                    unfocusedPlaceholderColor = semanticColors.onBrandHeader.copy(alpha = 0.72f),
                    focusedLeadingIconColor = semanticColors.onBrandHeader.copy(alpha = 0.82f),
                    unfocusedLeadingIconColor = semanticColors.onBrandHeader.copy(alpha = 0.82f),
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,
                    cursorColor = semanticColors.onBrandHeader,
                ),
                singleLine = true,
                shape = MaterialTheme.shapes.medium,
            )
        }
    }
}

@Composable
private fun HeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    testTag: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val semanticColors = ShcareTheme.colors
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .size(48.dp)
            .background(semanticColors.onBrandHeader.copy(alpha = 0.16f), CircleShape)
            .border(1.dp, semanticColors.onBrandHeader.copy(alpha = 0.28f), CircleShape)
            .testTag(testTag),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = semanticColors.onBrandHeader,
        )
    }
}

@Composable
private fun DoctorDashboardReadyContent(
    state: DoctorDashboardUiState,
    innerPadding: PaddingValues,
    onAction: (DoctorDashboardUiAction) -> Unit,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToDeviceManagement: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
    ) {
        val fontScale = LocalDensity.current.fontScale
        val useTwoColumns = maxWidth >= 840.dp && fontScale < 1.5f
        val quickActionColumns = resolveDoctorDashboardQuickActionColumns(
            widthDp = maxWidth.value,
            fontScale = fontScale,
        )
        val contentWidth = when {
            maxWidth >= 840.dp -> 840.dp
            maxWidth >= 600.dp -> 600.dp
            else -> maxWidth
        }

        LazyColumn(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .widthIn(max = contentWidth)
                .fillMaxSize()
                .testTag("doctor-dashboard.content"),
            contentPadding = PaddingValues(
                start = spacing.large,
                top = spacing.large,
                end = spacing.large,
                bottom = spacing.tripleExtraLarge,
            ),
            verticalArrangement = Arrangement.spacedBy(spacing.extraLarge),
        ) {
            if (state.isRefreshing) {
                item {
                    val refreshing = stringResource(R.string.doctor_dashboard_refreshing)
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                stateDescription = refreshing
                                liveRegion = LiveRegionMode.Polite
                            },
                    )
                }
            }

            if (state.isStale) {
                item {
                    DoctorDashboardStateBanner(
                        message = state.errorMessage.ifBlank {
                            stringResource(R.string.doctor_dashboard_stale)
                        },
                        onRetry = { onAction(DoctorDashboardUiAction.Refresh) },
                    )
                }
            }

            item {
                if (useTwoColumns) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(spacing.large),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(spacing.medium),
                        ) {
                            DoctorSectionHeading(
                                stringResource(R.string.doctor_dashboard_device_status),
                            )
                            DeviceStatusCard(
                                status = state.backendStatus,
                                onClick = onNavigateToDeviceManagement,
                            )
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(spacing.medium),
                        ) {
                            DoctorSectionHeading(
                                stringResource(R.string.doctor_dashboard_quick_actions),
                            )
                            DoctorDashboardQuickActions(
                                columns = quickActionColumns,
                                canViewAppointments = state.canViewAppointments,
                                onNavigateToMonitoring = onNavigateToMonitoring,
                                onNavigateToRecords = onNavigateToRecords,
                                onNavigateToAssistant = onNavigateToAssistant,
                                onNavigateToNewScan = onNavigateToNewScan,
                                onNavigateToAppointments = onNavigateToAppointments,
                            )
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(spacing.extraLarge),
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                            DoctorSectionHeading(
                                stringResource(R.string.doctor_dashboard_device_status),
                            )
                            DeviceStatusCard(
                                status = state.backendStatus,
                                onClick = onNavigateToDeviceManagement,
                            )
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                            DoctorSectionHeading(
                                stringResource(R.string.doctor_dashboard_quick_actions),
                            )
                            DoctorDashboardQuickActions(
                                columns = quickActionColumns,
                                canViewAppointments = state.canViewAppointments,
                                onNavigateToMonitoring = onNavigateToMonitoring,
                                onNavigateToRecords = onNavigateToRecords,
                                onNavigateToAssistant = onNavigateToAssistant,
                                onNavigateToNewScan = onNavigateToNewScan,
                                onNavigateToAppointments = onNavigateToAppointments,
                            )
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    DoctorSectionHeading(
                        stringResource(R.string.doctor_dashboard_recent_results),
                    )
                    TextButton(
                        onClick = onNavigateToRecords,
                        modifier = Modifier.heightIn(min = 48.dp),
                    ) {
                        Text(stringResource(R.string.doctor_dashboard_view_all))
                    }
                }
            }

            if (state.filteredScans.isEmpty()) {
                item {
                    val hasQuery = state.searchQuery.isNotBlank()
                    ShcareEmptyState(
                        title = stringResource(
                            if (hasQuery) {
                                R.string.doctor_dashboard_search_empty_title
                            } else {
                                R.string.doctor_dashboard_empty_title
                            },
                        ),
                        message = stringResource(
                            if (hasQuery) {
                                R.string.doctor_dashboard_search_empty_message
                            } else {
                                R.string.doctor_dashboard_empty_message
                            },
                        ),
                        actionLabel = if (hasQuery) {
                            null
                        } else {
                            stringResource(R.string.doctor_dashboard_new_scan)
                        },
                        onAction = if (hasQuery) null else onNavigateToNewScan,
                    )
                }
            }

            items(state.filteredScans, key = Scan::id) { scan ->
                RecentScanCard(
                    scan = scan,
                    onClick = { onNavigateToRecordDetail(scan.id) },
                    onStopRecording = {
                        onAction(DoctorDashboardUiAction.StopScan(scan.id))
                    },
                    isStopping = state.stoppingScanId == scan.id,
                )
            }
        }
    }
}

internal fun resolveDoctorDashboardQuickActionColumns(
    widthDp: Float,
    fontScale: Float,
): Int = when {
    fontScale >= 1.5f -> 1
    else -> 3
}

@Composable
private fun DeviceStatusCard(
    status: BackendStatus,
    onClick: () -> Unit,
) {
    val semanticColors = ShcareTheme.colors
    val connected = status.espCount > 0
    val statusColor = if (connected) semanticColors.success else semanticColors.offline
    val statusContainerColor = if (connected) {
        semanticColors.successContainer
    } else {
        semanticColors.offlineContainer
    }
    val statusContentColor = if (connected) {
        semanticColors.onSuccessContainer
    } else {
        semanticColors.onOfflineContainer
    }
    val statusText = stringResource(
        if (connected) {
            R.string.doctor_dashboard_device_online
        } else {
            R.string.doctor_dashboard_device_offline
        },
    )
    val deviceCount = pluralStringResource(
        R.plurals.doctor_dashboard_device_count,
        status.espCount,
        status.espCount,
    )
    val spokenState = "$statusText. $deviceCount"

    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = spokenState
                role = Role.Button
            }
            .testTag("doctor-dashboard.device"),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(statusContainerColor, MaterialTheme.shapes.medium),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Sensors,
                        contentDescription = null,
                        tint = statusContentColor,
                    )
                }
                Spacer(modifier = Modifier.width(ShcareTheme.spacing.medium))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = statusText,
                        style = MaterialTheme.typography.titleSmall,
                        color = statusColor,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = pluralStringResource(
                            R.plurals.doctor_dashboard_device_count,
                            status.espCount,
                            status.espCount,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Icon(
                    imageVector = Icons.Default.Wifi,
                    contentDescription = null,
                    tint = statusColor,
                )
            }

            Text(
                text = if (status.sampleRate > 0 || status.udpPort > 0) {
                    stringResource(
                        R.string.doctor_dashboard_server_status,
                        status.sampleRate,
                        status.udpPort,
                    )
                } else {
                    stringResource(R.string.doctor_dashboard_server_unavailable)
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private data class DoctorDashboardQuickAction(
    val icon: ImageVector,
    val labelRes: Int,
    val testTag: String,
    val tone: DoctorDashboardQuickActionTone,
    val action: () -> Unit,
)

private enum class DoctorDashboardQuickActionTone {
    Primary,
    Outline,
    Secondary,
}

@Composable
internal fun DoctorDashboardQuickActions(
    columns: Int,
    canViewAppointments: Boolean,
    onNavigateToMonitoring: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAssistant: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToAppointments: () -> Unit,
) {
    val actions = buildList {
        add(
            DoctorDashboardQuickAction(
                icon = Icons.Default.SsidChart,
                labelRes = R.string.doctor_dashboard_measure_now,
                testTag = "doctor-dashboard.action.scan",
                tone = DoctorDashboardQuickActionTone.Primary,
                action = onNavigateToMonitoring,
            ),
        )
        add(
            DoctorDashboardQuickAction(
                icon = Icons.Default.Description,
                labelRes = R.string.doctor_dashboard_records,
                testTag = "doctor-dashboard.action.records",
                tone = DoctorDashboardQuickActionTone.Outline,
                action = onNavigateToRecords,
            ),
        )
        add(
            DoctorDashboardQuickAction(
                icon = Icons.Default.ChatBubbleOutline,
                labelRes = R.string.ai_assistant_short_label,
                testTag = "doctor-dashboard.action.assistant",
                tone = DoctorDashboardQuickActionTone.Secondary,
                action = onNavigateToAssistant,
            ),
        )
        add(
            DoctorDashboardQuickAction(
                icon = Icons.Default.Add,
                labelRes = R.string.doctor_dashboard_new_scan,
                testTag = "doctor-dashboard.action.new-scan",
                tone = DoctorDashboardQuickActionTone.Outline,
                action = onNavigateToNewScan,
            ),
        )
        if (canViewAppointments) {
            add(
                DoctorDashboardQuickAction(
                    icon = Icons.Default.CalendarMonth,
                    labelRes = R.string.appointment_title_doctor,
                    testTag = "doctor-dashboard.action.appointments",
                    tone = DoctorDashboardQuickActionTone.Outline,
                    action = onNavigateToAppointments,
                ),
            )
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
    ) {
        actions.chunked(columns.coerceAtLeast(1)).forEach { rowActions ->
            if (columns == 1 || rowActions.size == 1) {
                rowActions.forEach { action ->
                    DoctorDashboardQuickActionButton(
                        action = action,
                        compact = false,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
                ) {
                    rowActions.forEach { action ->
                        DoctorDashboardQuickActionButton(
                            action = action,
                            compact = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    repeat(columns - rowActions.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun DoctorDashboardQuickActionButton(
    action: DoctorDashboardQuickAction,
    compact: Boolean,
    modifier: Modifier = Modifier,
) {
    val containerColor = when (action.tone) {
        DoctorDashboardQuickActionTone.Primary -> MaterialTheme.colorScheme.primary
        DoctorDashboardQuickActionTone.Outline -> MaterialTheme.colorScheme.surface
        DoctorDashboardQuickActionTone.Secondary -> MaterialTheme.colorScheme.secondary
    }
    val contentColor = when (action.tone) {
        DoctorDashboardQuickActionTone.Primary -> MaterialTheme.colorScheme.onPrimary
        DoctorDashboardQuickActionTone.Outline -> MaterialTheme.colorScheme.primary
        DoctorDashboardQuickActionTone.Secondary -> MaterialTheme.colorScheme.onSecondary
    }

    Card(
        onClick = action.action,
        colors = CardDefaults.cardColors(
            containerColor = containerColor,
            contentColor = contentColor,
        ),
        border = BorderStroke(
            width = 1.dp,
            color = if (action.tone == DoctorDashboardQuickActionTone.Outline) {
                MaterialTheme.colorScheme.primary
            } else {
                containerColor
            },
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        shape = MaterialTheme.shapes.large,
        modifier = modifier
            .heightIn(min = if (compact) 104.dp else 60.dp)
            .semantics { role = Role.Button }
            .testTag(action.testTag),
    ) {
        if (compact) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(ShcareTheme.spacing.medium),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    imageVector = action.icon,
                    contentDescription = null,
                    modifier = Modifier.size(28.dp),
                )
                Spacer(modifier = Modifier.height(ShcareTheme.spacing.small))
                Text(
                    text = stringResource(action.labelRes),
                    style = MaterialTheme.typography.labelLarge,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                )
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        horizontal = ShcareTheme.spacing.large,
                        vertical = ShcareTheme.spacing.medium,
                    ),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = action.icon,
                    contentDescription = null,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                Text(
                    text = stringResource(action.labelRes),
                    style = MaterialTheme.typography.labelLarge,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                )
            }
        }
    }
}

@Composable
private fun RecentScanCard(
    scan: Scan,
    onClick: () -> Unit,
    onStopRecording: () -> Unit,
    isStopping: Boolean,
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
    val summary = scanSummary(scan)

    Card(
        onClick = onClick,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("doctor-dashboard.scan.${scan.id}"),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = scan.patientName,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(
                            R.string.doctor_dashboard_patient_code,
                            scan.patientCode,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = scanLabel(scan),
                    color = badgeContentColor,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .background(badgeContainerColor, CircleShape)
                        .padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = stringResource(
                        if (scan.isHeart) {
                            R.string.doctor_dashboard_scan_heart
                        } else {
                            R.string.doctor_dashboard_scan_lung
                        },
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = stringResource(
                        R.string.doctor_dashboard_scan_time,
                        scan.formattedDate(),
                        scan.formattedTime(),
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (summary.isNotBlank()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
                            MaterialTheme.shapes.medium,
                        )
                        .border(
                            1.dp,
                            MaterialTheme.colorScheme.outlineVariant,
                            MaterialTheme.shapes.medium,
                        )
                        .padding(ShcareTheme.spacing.medium),
                    verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
                ) {
                    Text(
                        text = stringResource(R.string.ai_assistant_result_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = summary,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            if (isRecording) {
                TextButton(
                    onClick = onStopRecording,
                    enabled = !isStopping,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.primary,
                    ),
                    modifier = Modifier
                        .align(Alignment.End)
                        .heightIn(min = 48.dp),
                ) {
                    if (isStopping) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                    }
                    Text(
                        stringResource(R.string.doctor_dashboard_stop_recording),
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}

@Composable
private fun DoctorDashboardStateBanner(
    message: String,
    onRetry: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = ShcareTheme.colors.warningContainer,
            contentColor = ShcareTheme.colors.onWarningContainer,
        ),
        border = BorderStroke(1.dp, ShcareTheme.colors.warning.copy(alpha = 0.45f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            Icon(Icons.Default.Warning, contentDescription = null)
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = onRetry,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.doctor_dashboard_retry))
            }
        }
    }
}

@Composable
private fun DoctorSectionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = Modifier.semantics { heading() },
    )
}

@Preview(showBackground = true, widthDp = 412)
@Composable
private fun DoctorDashboardPreview() {
    ShcareMobileTheme(mode = ShcareThemeMode.Light, useDynamicColor = false) {
        DoctorDashboardContent(
            state = DoctorDashboardUiState(
                loadState = DoctorDashboardLoadState.Content,
                displayName = "Bác sĩ Minh",
                workspaceName = "Phòng khám CarePlus",
                workspaceMeta = "Bác sĩ",
                canViewAppointments = true,
                backendStatus = BackendStatus(espCount = 1, sampleRate = 16_000, udpPort = 4_212),
                scans = listOf(
                    Scan(
                        id = "scan-preview",
                        patient = PatientSnapshot(
                            id = "patient-preview",
                            patientCode = "BN-001",
                            name = "Nguyễn An",
                        ),
                        status = "completed",
                        mode = "heart",
                        aiSummary = "Nhịp tim ổn định",
                    ),
                ),
            ),
            snackbarHostState = remember { SnackbarHostState() },
            onAction = {},
            onNavigateToMonitoring = {},
            onNavigateToRecords = {},
            onNavigateToAssistant = {},
            onNavigateToNewScan = {},
            onNavigateToNotifications = {},
            onNavigateToDeviceManagement = {},
            onNavigateToAppointments = {},
            onNavigateToRecordDetail = {},
        )
    }
}
