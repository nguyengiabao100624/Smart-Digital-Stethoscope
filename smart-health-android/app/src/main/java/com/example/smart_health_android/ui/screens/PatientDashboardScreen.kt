package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sensors
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.patientdashboard.PatientDashboardAnalysisState
import com.example.smart_health_android.patientdashboard.PatientDashboardAuthoritySnapshot
import com.example.smart_health_android.patientdashboard.PatientDashboardDevice
import com.example.smart_health_android.patientdashboard.PatientDashboardDevicePresence
import com.example.smart_health_android.patientdashboard.PatientDashboardFeatureAccess
import com.example.smart_health_android.patientdashboard.PatientDashboardLoadState
import com.example.smart_health_android.patientdashboard.PatientDashboardProfile
import com.example.smart_health_android.patientdashboard.PatientDashboardRecentScan
import com.example.smart_health_android.patientdashboard.PatientDashboardSectionState
import com.example.smart_health_android.patientdashboard.PatientDashboardUiAction
import com.example.smart_health_android.patientdashboard.PatientDashboardUiEffect
import com.example.smart_health_android.patientdashboard.PatientDashboardUiState
import com.example.smart_health_android.patientdashboard.PatientDashboardViewModel
import com.example.smart_health_android.patientdashboard.PatientDashboardViewModelFactory
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun PatientDashboardScreen(
    expectedAuthority: PatientDashboardAuthoritySnapshot?,
    currentAuthority: () -> PatientDashboardAuthoritySnapshot?,
    invalidateExpectedAuthority: () -> Unit,
    canStartScan: Boolean,
    canViewRecords: Boolean,
    canManageDevice: Boolean,
    canViewAppointments: Boolean,
    canUseAssistant: Boolean,
    onNavigateToNotifications: () -> Unit,
    onNavigateToDevicePairing: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    viewModel: PatientDashboardViewModel = viewModel(
        key = expectedAuthority?.let { authority ->
            "patient-dashboard-${authority.userId}-${authority.workspaceId}-${authority.authorityEpoch}"
        } ?: "patient-dashboard-authority-denied",
        factory = PatientDashboardViewModelFactory(
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
            features = PatientDashboardFeatureAccess(
                canStartScan = canStartScan,
                canViewRecords = canViewRecords,
                canManageDevice = canManageDevice,
                canViewAppointments = canViewAppointments,
                canUseAssistant = canUseAssistant,
            ),
            invalidateExpectedAuthority = invalidateExpectedAuthority,
        ),
    ),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val refreshConfirmed = stringResource(R.string.patient_dashboard_refresh_confirmed)

    LaunchedEffect(viewModel, refreshConfirmed) {
        viewModel.effects.collect { effect ->
            when (effect) {
                PatientDashboardUiEffect.RefreshConfirmed ->
                    snackbarHostState.showSnackbar(refreshConfirmed)
            }
        }
    }

    PatientDashboardContent(
        state = state,
        snackbarHostState = snackbarHostState,
        onAction = viewModel::onAction,
        onNavigateToNotifications = onNavigateToNotifications,
        onNavigateToDevicePairing = onNavigateToDevicePairing,
        onNavigateToNewScan = onNavigateToNewScan,
        onNavigateToRecords = onNavigateToRecords,
        onNavigateToAppointments = onNavigateToAppointments,
        onNavigateToRecordDetail = onNavigateToRecordDetail,
        onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
    )
}

@Composable
internal fun PatientDashboardContent(
    state: PatientDashboardUiState,
    snackbarHostState: SnackbarHostState,
    onAction: (PatientDashboardUiAction) -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToDevicePairing: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAppointments: () -> Unit,
    onNavigateToRecordDetail: (String) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
) {
    Scaffold(
        topBar = {
            PatientDashboardTopBar(
                isRefreshing = state.isRefreshing,
                onRefresh = { onAction(PatientDashboardUiAction.Refresh) },
                onNavigateToNotifications = onNavigateToNotifications,
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding(),
    ) { innerPadding ->
        when (state.loadState) {
            PatientDashboardLoadState.Loading -> ShcareLoadingState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("patient-dashboard.state.loading"),
                message = stringResource(R.string.patient_dashboard_loading),
            )

            PatientDashboardLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onOpenWorkspaceSwitcher,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("patient-dashboard.state.permission"),
                title = stringResource(R.string.patient_dashboard_permission_title),
                message = patientDashboardMessageWithRequestId(
                    message = stringResource(R.string.patient_dashboard_permission_message),
                    requestId = state.requestId,
                ),
                actionLabel = stringResource(R.string.patient_dashboard_open_workspace),
            )

            PatientDashboardLoadState.Offline -> ShcareOfflineState(
                onRetry = { onAction(PatientDashboardUiAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("patient-dashboard.state.offline"),
                title = stringResource(R.string.patient_dashboard_offline_title),
                message = stringResource(R.string.patient_dashboard_offline_message),
                retryLabel = stringResource(R.string.patient_dashboard_retry),
            )

            PatientDashboardLoadState.Error -> ShcareErrorState(
                onRetry = { onAction(PatientDashboardUiAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("patient-dashboard.state.error"),
                title = stringResource(R.string.patient_dashboard_error_title),
                message = patientDashboardMessageWithRequestId(
                    message = stringResource(R.string.patient_dashboard_error_message),
                    requestId = state.requestId,
                ),
                retryLabel = stringResource(R.string.patient_dashboard_retry),
            )

            PatientDashboardLoadState.Content -> PatientDashboardReadyContent(
                state = state,
                innerPadding = innerPadding,
                onAction = onAction,
                onNavigateToDevicePairing = onNavigateToDevicePairing,
                onNavigateToNewScan = onNavigateToNewScan,
                onNavigateToRecords = onNavigateToRecords,
                onNavigateToAppointments = onNavigateToAppointments,
                onNavigateToRecordDetail = onNavigateToRecordDetail,
            )
        }
    }
}

@Composable
private fun PatientDashboardTopBar(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onNavigateToNotifications: () -> Unit,
) {
    val semanticColors = ShcareTheme.colors
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.horizontalGradient(
                    listOf(
                        semanticColors.brandHeaderStart,
                        semanticColors.brandHeaderEnd,
                    ),
                ),
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(
                    start = ShcareTheme.spacing.large,
                    end = ShcareTheme.spacing.small,
                    top = ShcareTheme.spacing.small,
                    bottom = ShcareTheme.spacing.small,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.patient_dashboard_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = semanticColors.onBrandHeader,
                modifier = Modifier
                    .weight(1f)
                    .semantics { heading() },
            )
            IconButton(
                onClick = onRefresh,
                enabled = !isRefreshing,
                modifier = Modifier
                    .size(48.dp)
                    .testTag("patient-dashboard.action.refresh"),
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.patient_dashboard_refresh),
                    tint = semanticColors.onBrandHeader,
                )
            }
            IconButton(
                onClick = onNavigateToNotifications,
                modifier = Modifier
                    .size(48.dp)
                    .testTag("patient-dashboard.action.notifications"),
            ) {
                Icon(
                    imageVector = Icons.Default.Notifications,
                    contentDescription = stringResource(
                        R.string.patient_dashboard_notifications,
                    ),
                    tint = semanticColors.onBrandHeader,
                )
            }
        }
    }
}

@Composable
private fun PatientDashboardReadyContent(
    state: PatientDashboardUiState,
    innerPadding: PaddingValues,
    onAction: (PatientDashboardUiAction) -> Unit,
    onNavigateToDevicePairing: () -> Unit,
    onNavigateToNewScan: () -> Unit,
    onNavigateToRecords: () -> Unit,
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
        val stackQuickActions = maxWidth < 412.dp || fontScale >= 1.5f
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
                .testTag("patient-dashboard.content"),
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
                    val refreshing = stringResource(R.string.patient_dashboard_refreshing)
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
                    PatientDashboardStateBanner(
                        message = stringResource(R.string.patient_dashboard_stale),
                        onRetry = { onAction(PatientDashboardUiAction.Refresh) },
                    )
                }
            }

            if (state.isPartial) {
                item {
                    PatientDashboardStateBanner(
                        message = stringResource(R.string.patient_dashboard_partial),
                    )
                }
            }

            item {
                PatientProfileCard(profile = state.profile)
            }

            item {
                if (useTwoColumns && state.features.hasAnyQuickAction) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(spacing.large),
                        verticalAlignment = Alignment.Top,
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(spacing.medium),
                        ) {
                            PatientSectionHeading(
                                stringResource(R.string.patient_dashboard_device_title),
                            )
                            PatientDashboardDeviceSection(
                                state = state,
                                onNavigateToDevicePairing = onNavigateToDevicePairing,
                            )
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(spacing.medium),
                        ) {
                            PatientSectionHeading(
                                stringResource(R.string.patient_dashboard_quick_actions),
                            )
                            PatientDashboardQuickActions(
                                features = state.features,
                                stackActions = false,
                                onNavigateToNewScan = onNavigateToNewScan,
                                onNavigateToRecords = onNavigateToRecords,
                                onNavigateToAppointments = onNavigateToAppointments,
                            )
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(spacing.extraLarge),
                    ) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(spacing.medium),
                        ) {
                            PatientSectionHeading(
                                stringResource(R.string.patient_dashboard_device_title),
                            )
                            PatientDashboardDeviceSection(
                                state = state,
                                onNavigateToDevicePairing = onNavigateToDevicePairing,
                            )
                        }
                        if (state.features.hasAnyQuickAction) {
                            Column(
                                verticalArrangement = Arrangement.spacedBy(spacing.medium),
                            ) {
                                PatientSectionHeading(
                                    stringResource(R.string.patient_dashboard_quick_actions),
                                )
                                PatientDashboardQuickActions(
                                    features = state.features,
                                    stackActions = stackQuickActions,
                                    onNavigateToNewScan = onNavigateToNewScan,
                                    onNavigateToRecords = onNavigateToRecords,
                                    onNavigateToAppointments = onNavigateToAppointments,
                                )
                            }
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
                    PatientSectionHeading(
                        stringResource(R.string.patient_dashboard_recent_scans),
                    )
                    if (state.features.canViewRecords) {
                        TextButton(
                            onClick = onNavigateToRecords,
                            modifier = Modifier.heightIn(min = 48.dp),
                        ) {
                            Text(stringResource(R.string.patient_dashboard_view_all))
                        }
                    }
                }
            }

            if (state.scansState != PatientDashboardSectionState.Unavailable) {
                item {
                    OutlinedTextField(
                        value = state.query,
                        onValueChange = {
                            onAction(PatientDashboardUiAction.SearchChanged(it))
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("patient-dashboard.search"),
                        singleLine = true,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Search,
                                contentDescription = null,
                            )
                        },
                        label = {
                            Text(stringResource(R.string.patient_dashboard_search_hint))
                        },
                    )
                }
            }

            when {
                state.scansState == PatientDashboardSectionState.Unavailable -> item {
                    PatientDashboardNoticeCard(
                        message = stringResource(
                            R.string.patient_dashboard_scans_unavailable,
                        ),
                    )
                }

                state.recentScans.isEmpty() -> item {
                    val hasQuery = state.query.isNotBlank()
                    ShcareEmptyState(
                        title = stringResource(
                            if (hasQuery) {
                                R.string.patient_dashboard_search_empty_title
                            } else {
                                R.string.patient_dashboard_empty_title
                            },
                        ),
                        message = stringResource(
                            if (hasQuery) {
                                R.string.patient_dashboard_search_empty_message
                            } else {
                                R.string.patient_dashboard_empty_message
                            },
                        ),
                        actionLabel = if (
                            !hasQuery && state.features.canStartScan
                        ) {
                            stringResource(R.string.patient_dashboard_start_scan)
                        } else {
                            null
                        },
                        onAction = if (
                            !hasQuery && state.features.canStartScan
                        ) {
                            onNavigateToNewScan
                        } else {
                            null
                        },
                    )
                }
            }

            items(
                items = state.recentScans,
                key = PatientDashboardRecentScan::id,
            ) { scan ->
                PatientDashboardScanCard(
                    scan = scan,
                    enabled = state.features.canViewRecords,
                    onClick = { onNavigateToRecordDetail(scan.id) },
                )
            }
        }
    }
}

@Composable
private fun PatientProfileCard(profile: PatientDashboardProfile?) {
    val displayName = profile?.displayName.orEmpty().ifBlank {
        stringResource(R.string.patient_dashboard_profile_fallback)
    }
    val patientCode = profile?.patientCode.orEmpty().ifBlank {
        stringResource(R.string.patient_dashboard_patient_code_unavailable)
    }
    val relationship = when (profile?.relationship?.trim()?.lowercase()) {
        "self" -> stringResource(R.string.patient_dashboard_relationship_self)
        "child" -> stringResource(R.string.patient_dashboard_relationship_child)
        "parent" -> stringResource(R.string.patient_dashboard_relationship_parent)
        "spouse" -> stringResource(R.string.patient_dashboard_relationship_spouse)
        else -> stringResource(R.string.patient_dashboard_relationship_other)
    }
    val spokenSummary = stringResource(
        R.string.patient_dashboard_profile_state,
        displayName,
        patientCode,
        relationship,
    )

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
        shape = MaterialTheme.shapes.extraLarge,
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = spokenSummary
            }
            .testTag("patient-dashboard.profile"),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .background(
                        color = MaterialTheme.colorScheme.primary,
                        shape = CircleShape,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.MonitorHeart,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                )
            }
            Spacer(modifier = Modifier.width(ShcareTheme.spacing.large))
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
            ) {
                Text(
                    text = displayName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(
                        R.string.patient_dashboard_profile_meta,
                        patientCode,
                        relationship,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                )
            }
        }
    }
}

@Composable
private fun PatientDashboardDeviceSection(
    state: PatientDashboardUiState,
    onNavigateToDevicePairing: () -> Unit,
) {
    when (state.deviceState) {
        PatientDashboardSectionState.Unavailable -> PatientDashboardNoticeCard(
            message = stringResource(R.string.patient_dashboard_device_unavailable),
        )

        PatientDashboardSectionState.Empty -> PatientDashboardUnpairedDeviceCard(
            canManageDevice = state.features.canManageDevice,
            onNavigateToDevicePairing = onNavigateToDevicePairing,
        )

        PatientDashboardSectionState.Ready -> {
            val device = state.device
            if (device == null) {
                PatientDashboardUnpairedDeviceCard(
                    canManageDevice = state.features.canManageDevice,
                    onNavigateToDevicePairing = onNavigateToDevicePairing,
                )
            } else {
                PatientDashboardDeviceCard(
                    device = device,
                    canManageDevice = state.features.canManageDevice,
                    onNavigateToDevicePairing = onNavigateToDevicePairing,
                )
            }
        }
    }
}

@Composable
private fun PatientDashboardDeviceCard(
    device: PatientDashboardDevice,
    canManageDevice: Boolean,
    onNavigateToDevicePairing: () -> Unit,
) {
    val isOnline = device.presence == PatientDashboardDevicePresence.Online
    val status = stringResource(
        if (isOnline) {
            R.string.patient_dashboard_device_online
        } else {
            R.string.patient_dashboard_device_offline
        },
    )
    val deviceName = device.name.ifBlank {
        stringResource(R.string.patient_dashboard_device_name_fallback)
    }
    val basicSpokenState = stringResource(
        R.string.patient_dashboard_device_state,
        deviceName,
        status,
    )
    val spokenState = buildList {
        add(basicSpokenState)
        device.batteryPercent?.let { battery ->
            add(stringResource(R.string.patient_dashboard_battery_value, battery))
        }
        device.signalDbm?.let { signal ->
            add(stringResource(R.string.patient_dashboard_signal_value, signal))
        }
        if (device.firmwareVersion.isNotBlank()) {
            add(
                stringResource(
                    R.string.patient_dashboard_firmware_value,
                    device.firmwareVersion,
                ),
            )
        }
    }.joinToString(separator = ". ")

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = spokenState
            }
            .testTag("patient-dashboard.device"),
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
                        .background(
                            color = if (isOnline) {
                                ShcareTheme.colors.successContainer
                            } else {
                                ShcareTheme.colors.offlineContainer
                            },
                            shape = MaterialTheme.shapes.medium,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Sensors,
                        contentDescription = null,
                        tint = if (isOnline) {
                            ShcareTheme.colors.onSuccessContainer
                        } else {
                            ShcareTheme.colors.onOfflineContainer
                        },
                    )
                }
                Spacer(modifier = Modifier.width(ShcareTheme.spacing.medium))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = deviceName,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = status,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (isOnline) {
                            ShcareTheme.colors.success
                        } else {
                            ShcareTheme.colors.offline
                        },
                    )
                }
                if (canManageDevice) {
                    IconButton(
                        onClick = onNavigateToDevicePairing,
                        modifier = Modifier.testTag("patient-dashboard.device.manage"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = stringResource(
                                R.string.patient_dashboard_manage_device,
                            ),
                        )
                    }
                }
            }

            device.batteryPercent?.let { batteryPercent ->
                val batteryColor = when {
                    batteryPercent <= 15 -> MaterialTheme.colorScheme.error
                    batteryPercent <= 30 -> ShcareTheme.colors.warning
                    else -> ShcareTheme.colors.success
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(
                        ShcareTheme.spacing.small,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Default.BatteryFull,
                        contentDescription = null,
                        tint = batteryColor,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = stringResource(
                            R.string.patient_dashboard_battery_value,
                            batteryPercent,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                LinearProgressIndicator(
                    progress = { batteryPercent.coerceIn(0, 100) / 100f },
                    color = batteryColor,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            device.signalDbm?.let { signal ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(
                        ShcareTheme.spacing.small,
                    ),
                ) {
                    Icon(
                        imageVector = Icons.Default.Wifi,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = stringResource(
                            R.string.patient_dashboard_signal_value,
                            signal,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }

            if (device.firmwareVersion.isNotBlank()) {
                Text(
                    text = stringResource(
                        R.string.patient_dashboard_firmware_value,
                        device.firmwareVersion,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PatientDashboardUnpairedDeviceCard(
    canManageDevice: Boolean,
    onNavigateToDevicePairing: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        ) {
            Text(
                text = stringResource(R.string.patient_dashboard_device_unpaired),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = stringResource(R.string.patient_dashboard_device_unpaired_message),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (canManageDevice) {
                FilledTonalButton(
                    onClick = onNavigateToDevicePairing,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.patient_dashboard_pair_device))
                }
            }
        }
    }
}

@Composable
private fun PatientDashboardQuickActions(
    features: PatientDashboardFeatureAccess,
    stackActions: Boolean,
    onNavigateToNewScan: () -> Unit,
    onNavigateToRecords: () -> Unit,
    onNavigateToAppointments: () -> Unit,
) {
    val actions = buildList {
        if (features.canStartScan) {
            add(
                PatientDashboardQuickAction(
                    icon = Icons.Default.MonitorHeart,
                    labelRes = R.string.patient_dashboard_start_scan,
                    testTag = "patient-dashboard.action.scan",
                    action = onNavigateToNewScan,
                ),
            )
        }
        if (features.canViewRecords) {
            add(
                PatientDashboardQuickAction(
                    icon = Icons.Default.Description,
                    labelRes = R.string.patient_dashboard_records,
                    testTag = "patient-dashboard.action.records",
                    action = onNavigateToRecords,
                ),
            )
        }
        if (features.canViewAppointments) {
            add(
                PatientDashboardQuickAction(
                    icon = Icons.Default.CalendarMonth,
                    labelRes = R.string.patient_dashboard_appointments,
                    testTag = "patient-dashboard.action.appointments",
                    action = onNavigateToAppointments,
                ),
            )
        }
    }

    if (stackActions || actions.size == 1) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            actions.forEach { action ->
                PatientDashboardQuickActionButton(
                    action = action,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    } else {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            actions.chunked(2).forEach { rowActions ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(
                        ShcareTheme.spacing.small,
                    ),
                ) {
                    rowActions.forEach { action ->
                        PatientDashboardQuickActionButton(
                            action = action,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (rowActions.size == 1) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

private data class PatientDashboardQuickAction(
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val labelRes: Int,
    val testTag: String,
    val action: () -> Unit,
)

@Composable
private fun PatientDashboardQuickActionButton(
    action: PatientDashboardQuickAction,
    modifier: Modifier = Modifier,
) {
    OutlinedButton(
        onClick = action.action,
        modifier = modifier
            .heightIn(min = 56.dp)
            .semantics { role = Role.Button }
            .testTag(action.testTag),
        contentPadding = PaddingValues(
            horizontal = ShcareTheme.spacing.medium,
            vertical = ShcareTheme.spacing.small,
        ),
    ) {
        Icon(
            imageVector = action.icon,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
        )
        Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
        Text(
            text = stringResource(action.labelRes),
            style = MaterialTheme.typography.labelLarge,
            maxLines = 2,
        )
    }
}

@Composable
private fun PatientDashboardScanCard(
    scan: PatientDashboardRecentScan,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val analysisLabel = patientDashboardAnalysisLabel(scan.analysisState)
    val (containerColor, contentColor) = patientDashboardAnalysisColors(scan.analysisState)
    val type = patientDashboardScanTypeLabel(scan.type)
    val summary = scan.summary.ifBlank {
        patientDashboardAnalysisDescription(scan.analysisState)
    }
    val spokenSummary = stringResource(
        R.string.patient_dashboard_scan_state,
        type,
        scan.date,
        scan.time,
        analysisLabel,
    ) + " " + summary

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics(mergeDescendants = true) {
                contentDescription = spokenSummary
            }
            .testTag("patient-dashboard.scan.${scan.id}"),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(
                        ShcareTheme.spacing.extraSmall,
                    ),
                ) {
                    Text(
                        text = type,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = stringResource(
                            R.string.patient_dashboard_scan_time,
                            scan.date,
                            scan.time,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                Box(
                    modifier = Modifier.background(
                        color = containerColor,
                        shape = CircleShape,
                    ),
                ) {
                    Text(
                        text = analysisLabel,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = contentColor,
                        modifier = Modifier.padding(
                            horizontal = ShcareTheme.spacing.medium,
                            vertical = ShcareTheme.spacing.small,
                        ),
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(
                text = summary,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PatientDashboardStateBanner(
    message: String,
    onRetry: (() -> Unit)? = null,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = ShcareTheme.colors.warningContainer,
            contentColor = ShcareTheme.colors.onWarningContainer,
        ),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = LiveRegionMode.Polite
                stateDescription = message
            },
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
            )
            if (onRetry != null) {
                FilledTonalButton(
                    onClick = onRetry,
                    modifier = Modifier
                        .align(Alignment.End)
                        .heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.patient_dashboard_retry))
                }
            }
        }
    }
}

@Composable
private fun PatientDashboardNoticeCard(message: String) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = LiveRegionMode.Polite
            },
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(ShcareTheme.spacing.large),
        )
    }
}

@Composable
private fun PatientSectionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun patientDashboardAnalysisLabel(
    state: PatientDashboardAnalysisState,
): String = when (state) {
    PatientDashboardAnalysisState.Unavailable ->
        stringResource(R.string.patient_dashboard_analysis_unavailable)
    PatientDashboardAnalysisState.Captured ->
        stringResource(R.string.patient_dashboard_analysis_available)
    PatientDashboardAnalysisState.Processing ->
        stringResource(R.string.patient_dashboard_analysis_processing)
    PatientDashboardAnalysisState.NeedsAttention ->
        stringResource(R.string.patient_dashboard_analysis_attention)
    PatientDashboardAnalysisState.Recording ->
        stringResource(R.string.patient_dashboard_analysis_recording)
    PatientDashboardAnalysisState.TechnicalFailure ->
        stringResource(R.string.patient_dashboard_analysis_technical_failure)
}

@Composable
private fun patientDashboardAnalysisColors(
    state: PatientDashboardAnalysisState,
) = when (state) {
    PatientDashboardAnalysisState.NeedsAttention ->
        ShcareTheme.colors.warningContainer to ShcareTheme.colors.onWarningContainer
    PatientDashboardAnalysisState.Processing,
    PatientDashboardAnalysisState.Recording,
    PatientDashboardAnalysisState.Captured,
    -> ShcareTheme.colors.infoContainer to ShcareTheme.colors.onInfoContainer
    PatientDashboardAnalysisState.Unavailable ->
        ShcareTheme.colors.offlineContainer to ShcareTheme.colors.onOfflineContainer
    PatientDashboardAnalysisState.TechnicalFailure ->
        MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
}

@Composable
private fun patientDashboardAnalysisDescription(
    state: PatientDashboardAnalysisState,
): String = when (state) {
    PatientDashboardAnalysisState.Unavailable ->
        stringResource(R.string.patient_dashboard_analysis_unavailable_description)
    PatientDashboardAnalysisState.Captured ->
        stringResource(R.string.patient_dashboard_analysis_available_description)
    PatientDashboardAnalysisState.Processing ->
        stringResource(R.string.patient_dashboard_analysis_processing_description)
    PatientDashboardAnalysisState.NeedsAttention ->
        stringResource(R.string.patient_dashboard_analysis_attention_description)
    PatientDashboardAnalysisState.Recording ->
        stringResource(R.string.patient_dashboard_analysis_recording_description)
    PatientDashboardAnalysisState.TechnicalFailure ->
        stringResource(R.string.patient_dashboard_analysis_technical_failure_description)
}

@Composable
private fun patientDashboardScanTypeLabel(type: String): String = when (type) {
    "heart" -> stringResource(R.string.patient_dashboard_scan_type_heart)
    "lung" -> stringResource(R.string.patient_dashboard_scan_type_lung)
    else -> stringResource(R.string.patient_dashboard_scan_type_unknown)
}

@Composable
private fun patientDashboardMessageWithRequestId(
    message: String,
    requestId: String,
): String = if (requestId.isBlank()) {
    message
} else {
    stringResource(R.string.patient_dashboard_request_id_message, message, requestId)
}

private val PatientDashboardFeatureAccess.hasAnyQuickAction: Boolean
    get() = canStartScan || canViewRecords || canViewAppointments
