package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.SystemUpdateAlt
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.devices.DeviceFreshness
import com.example.smart_health_android.devices.DeviceFreshnessStatus
import com.example.smart_health_android.devices.DeviceHealthSnapshot
import com.example.smart_health_android.devices.DeviceManagementFailure
import com.example.smart_health_android.devices.DeviceManagementFailureKind
import com.example.smart_health_android.devices.DeviceManagementOperation
import com.example.smart_health_android.devices.DeviceManagementUiAction
import com.example.smart_health_android.devices.DeviceManagementUiState
import com.example.smart_health_android.devices.DeviceManagementViewModel
import com.example.smart_health_android.devices.DevicePresenceStatus
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.text.NumberFormat
import java.time.Instant

@Composable
fun BluetoothSettingsScreen(
    onNavigateBack: () -> Unit,
    onAddDevice: () -> Unit,
    onConfigureWifi: (String) -> Unit = {},
    initialDeviceId: String = "",
    viewModel: DeviceManagementViewModel = viewModel(),
) {
    DeviceManagementScreen(
        onNavigateBack = onNavigateBack,
        onAddDevice = onAddDevice,
        onConfigureWifi = onConfigureWifi,
        initialDeviceId = initialDeviceId,
        viewModel = viewModel,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceManagementScreen(
    onNavigateBack: () -> Unit,
    onAddDevice: () -> Unit,
    onConfigureWifi: (String) -> Unit = {},
    initialDeviceId: String = "",
    viewModel: DeviceManagementViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var pendingReleaseId by rememberSaveable { androidx.compose.runtime.mutableStateOf<String?>(null) }

    LaunchedEffect(viewModel, initialDeviceId) {
        viewModel.onAction(
            DeviceManagementUiAction.ScreenOpened(preferredDeviceId = initialDeviceId),
        )
    }

    val pendingRelease = state.devices.firstOrNull { it.id == pendingReleaseId }

    pendingRelease?.let { device ->
        val name = DeviceHealthSnapshot.from(device).displayName()
        AlertDialog(
            onDismissRequest = { pendingReleaseId = null },
            title = { Text(stringResource(R.string.device_management_release_title)) },
            text = { Text(stringResource(R.string.device_management_release_message, name)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingReleaseId = null
                        viewModel.onAction(DeviceManagementUiAction.Release(device.id))
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(
                        text = stringResource(R.string.device_management_release),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { pendingReleaseId = null },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(stringResource(R.string.device_management_cancel))
                }
            },
        )
    }

    Scaffold(
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.device_management_title),
                onNavigateBack = onNavigateBack,
                backContentDescription = stringResource(R.string.device_management_back),
                actions = {
                    IconButton(
                        onClick = { viewModel.onAction(DeviceManagementUiAction.Refresh) },
                        enabled = !state.isLoading && !state.isRefreshing && !state.isMutating,
                        modifier = Modifier.size(48.dp),
                    ) {
                        if (state.isRefreshing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = ShcareTheme.colors.onBrandHeader,
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = stringResource(R.string.device_management_refresh),
                            )
                        }
                    }
                    IconButton(
                        onClick = onAddDevice,
                        enabled = !state.isMutating,
                        modifier = Modifier.size(48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Add,
                            contentDescription = stringResource(R.string.device_management_add),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding),
        ) {
            DeviceManagementBody(
                state = state,
                onNavigateBack = onNavigateBack,
                onAddDevice = onAddDevice,
                onConfigureWifi = onConfigureWifi,
                onRefresh = { viewModel.onAction(DeviceManagementUiAction.Refresh) },
                onSelectDevice = { viewModel.onAction(DeviceManagementUiAction.SelectDevice(it)) },
                onRelease = { pendingReleaseId = it },
            )
        }
    }
}

@Composable
private fun DeviceManagementBody(
    state: DeviceManagementUiState,
    onNavigateBack: () -> Unit,
    onAddDevice: () -> Unit,
    onConfigureWifi: (String) -> Unit,
    onRefresh: () -> Unit,
    onSelectDevice: (String) -> Unit,
    onRelease: (String) -> Unit,
) {
    when {
        state.isLoading && state.devices.isEmpty() -> ShcareLoadingState(
            message = stringResource(R.string.device_management_loading),
            modifier = Modifier.fillMaxSize(),
        )

        state.failure != null && state.devices.isEmpty() -> DeviceManagementBlockingFailure(
            failure = state.failure,
            onNavigateBack = onNavigateBack,
            onRetry = onRefresh,
        )

        state.hasLoaded && state.devices.isEmpty() -> ShcareEmptyState(
            title = stringResource(R.string.device_management_empty_title),
            message = stringResource(R.string.device_management_empty_message),
            actionLabel = stringResource(R.string.device_management_add),
            onAction = onAddDevice,
            modifier = Modifier.fillMaxSize(),
        )

        else -> BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val isExpanded = maxWidth >= 720.dp
            if (isExpanded) {
                ExpandedDeviceManagementContent(
                    state = state,
                    onRefresh = onRefresh,
                    onSelectDevice = onSelectDevice,
                    onRelease = onRelease,
                    onConfigureWifi = onConfigureWifi,
                )
            } else {
                CompactDeviceManagementContent(
                    state = state,
                    onRefresh = onRefresh,
                    onSelectDevice = onSelectDevice,
                    onRelease = onRelease,
                    onConfigureWifi = onConfigureWifi,
                )
            }
        }
    }
}

@Composable
private fun DeviceManagementBlockingFailure(
    failure: DeviceManagementFailure,
    onNavigateBack: () -> Unit,
    onRetry: () -> Unit,
) {
    val message = failure.messageWithRequestId(
        fallback = when (failure.kind) {
            DeviceManagementFailureKind.Offline -> stringResource(R.string.device_management_offline_message)
            DeviceManagementFailureKind.Permission -> stringResource(R.string.device_management_permission_message)
            DeviceManagementFailureKind.Error -> stringResource(R.string.device_management_error_message)
        },
    )
    when (failure.kind) {
        DeviceManagementFailureKind.Offline -> ShcareOfflineState(
            title = stringResource(R.string.device_management_offline_title),
            message = message,
            retryLabel = stringResource(R.string.device_management_retry),
            onRetry = onRetry,
            modifier = Modifier.fillMaxSize(),
        )
        DeviceManagementFailureKind.Permission -> ShcarePermissionState(
            title = stringResource(R.string.device_management_permission_title),
            message = message,
            actionLabel = stringResource(R.string.device_management_back),
            onRequestPermission = onNavigateBack,
            modifier = Modifier.fillMaxSize(),
        )
        DeviceManagementFailureKind.Error -> ShcareErrorState(
            title = stringResource(R.string.device_management_error_title),
            message = message,
            retryLabel = stringResource(R.string.device_management_retry),
            onRetry = onRetry,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun CompactDeviceManagementContent(
    state: DeviceManagementUiState,
    onRefresh: () -> Unit,
    onSelectDevice: (String) -> Unit,
    onRelease: (String) -> Unit,
    onConfigureWifi: (String) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val selectedDevice = state.selectedDevice ?: return
    val now = remember(state.devices, state.isRefreshing) { Instant.now() }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("device_management.compact"),
        contentPadding = PaddingValues(
            start = spacing.large,
            top = spacing.large,
            end = spacing.large,
            bottom = spacing.doubleExtraLarge,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        state.failure?.let { failure ->
            item { DeviceManagementInlineFailure(failure, onRefresh) }
        }
        item {
            SectionHeading(stringResource(R.string.device_management_device_list))
            Spacer(Modifier.height(spacing.medium))
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                contentPadding = PaddingValues(end = spacing.large),
            ) {
                items(state.devices, key = { it.id }) { device ->
                    val snapshot = DeviceHealthSnapshot.from(device, now)
                    DeviceSelectorCard(
                        snapshot = snapshot,
                        isSelected = device.id == state.selectedDeviceId,
                        onClick = { onSelectDevice(device.id) },
                        modifier = Modifier.widthIn(min = 220.dp, max = 280.dp),
                    )
                }
            }
        }
        item {
            DeviceHealthPanel(
                snapshot = DeviceHealthSnapshot.from(selectedDevice, now),
                isReleasing = state.releasingDeviceId == selectedDevice.id,
                mutationEnabled = !state.isMutating,
                onRelease = { onRelease(selectedDevice.id) },
                onConfigureWifi = { onConfigureWifi(selectedDevice.id) },
            )
        }
        item { DeviceManagementInfo() }
    }
}

@Composable
private fun ExpandedDeviceManagementContent(
    state: DeviceManagementUiState,
    onRefresh: () -> Unit,
    onSelectDevice: (String) -> Unit,
    onRelease: (String) -> Unit,
    onConfigureWifi: (String) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val selectedDevice = state.selectedDevice ?: return
    val now = remember(state.devices, state.isRefreshing) { Instant.now() }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(spacing.large)
            .testTag("device_management.expanded"),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        state.failure?.let { failure ->
            DeviceManagementInlineFailure(failure, onRefresh)
        }
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            LazyColumn(
                modifier = Modifier
                    .weight(0.38f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(spacing.medium),
                contentPadding = PaddingValues(bottom = spacing.doubleExtraLarge),
            ) {
                item { SectionHeading(stringResource(R.string.device_management_device_list)) }
                items(state.devices, key = { it.id }) { device ->
                    DeviceSelectorCard(
                        snapshot = DeviceHealthSnapshot.from(device, now),
                        isSelected = device.id == state.selectedDeviceId,
                        onClick = { onSelectDevice(device.id) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                item { DeviceManagementInfo() }
            }
            LazyColumn(
                modifier = Modifier
                    .weight(0.62f)
                    .fillMaxHeight(),
                contentPadding = PaddingValues(bottom = spacing.doubleExtraLarge),
            ) {
                item {
                    DeviceHealthPanel(
                        snapshot = DeviceHealthSnapshot.from(selectedDevice, now),
                        isReleasing = state.releasingDeviceId == selectedDevice.id,
                        mutationEnabled = !state.isMutating,
                        onRelease = { onRelease(selectedDevice.id) },
                        onConfigureWifi = { onConfigureWifi(selectedDevice.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun DeviceSelectorCard(
    snapshot: DeviceHealthSnapshot,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val presenceLabel = snapshot.presence.label()
    val freshnessLabel = snapshot.freshness.label()
    Card(
        modifier = modifier
            .defaultMinSize(minHeight = 88.dp)
            .clickable(onClick = onClick)
            .semantics(mergeDescendants = true) {
                selected = isSelected
                role = Role.Button
                stateDescription = "$presenceLabel. $freshnessLabel"
            }
            .testTag("device_management.device.${snapshot.deviceId}"),
        colors = CardDefaults.cardColors(
            containerColor = if (isSelected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
            },
        ),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            ) {
                Icon(
                    imageVector = Icons.Default.MedicalServices,
                    contentDescription = null,
                    tint = if (isSelected) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                    modifier = Modifier.size(24.dp),
                )
                Text(
                    text = snapshot.displayName(),
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isSelected) {
                        MaterialTheme.colorScheme.onPrimaryContainer
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            DevicePresenceChip(snapshot.presence)
            Text(
                text = freshnessLabel,
                style = MaterialTheme.typography.bodySmall,
                color = if (isSelected) {
                    MaterialTheme.colorScheme.onPrimaryContainer
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Composable
internal fun DeviceHealthPanel(
    snapshot: DeviceHealthSnapshot,
    isReleasing: Boolean,
    mutationEnabled: Boolean,
    onRelease: () -> Unit,
    modifier: Modifier = Modifier,
    onConfigureWifi: () -> Unit = {},
) {
    val spacing = ShcareTheme.spacing
    val presenceLabel = snapshot.presence.label()
    val freshnessLabel = snapshot.freshness.label()
    Card(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = "$presenceLabel. $freshnessLabel"
            }
            .testTag("device_health.panel"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                Text(
                    text = snapshot.displayName(),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = snapshot.deviceId.ifBlank {
                        stringResource(R.string.device_health_value_missing)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            PresenceSummary(snapshot)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            HealthSection(
                title = stringResource(R.string.device_health_identity_heading),
                metrics = listOf(
                    HealthMetric(
                        key = "device_id",
                        icon = Icons.Default.MedicalServices,
                        label = stringResource(R.string.device_health_device_id),
                        value = snapshot.deviceId.ifBlank {
                            stringResource(R.string.device_health_value_missing)
                        },
                    ),
                    HealthMetric(
                        key = "connection_method",
                        icon = Icons.Default.Wifi,
                        label = stringResource(R.string.device_health_connection_method),
                        value = snapshot.connectionMethod
                            ?: stringResource(R.string.device_health_value_missing),
                    ),
                    HealthMetric(
                        key = "firmware",
                        icon = Icons.Default.Memory,
                        label = stringResource(R.string.device_health_firmware),
                        value = snapshot.firmwareVersion
                            ?: stringResource(R.string.device_health_value_missing),
                    ),
                ),
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Column(verticalArrangement = Arrangement.spacedBy(spacing.extraSmall)) {
                SectionHeading(stringResource(R.string.device_health_telemetry_heading))
                Text(
                    text = stringResource(R.string.device_health_telemetry_support),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            HealthSection(
                metrics = snapshot.telemetryMetrics(),
            )

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Button(
                onClick = onConfigureWifi,
                enabled = mutationEnabled,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("device_management.configure_wifi"),
            ) {
                Icon(
                    imageVector = Icons.Default.Wifi,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(spacing.small))
                Text(stringResource(R.string.device_management_configure_wifi))
            }
            OutlinedButton(
                onClick = onRelease,
                enabled = mutationEnabled,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("device_management.release"),
            ) {
                Icon(
                    imageVector = Icons.Default.LinkOff,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(spacing.small))
                Text(
                    text = if (isReleasing) {
                        stringResource(R.string.device_management_releasing)
                    } else {
                        stringResource(R.string.device_management_release)
                    },
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun PresenceSummary(snapshot: DeviceHealthSnapshot) {
    val spacing = ShcareTheme.spacing
    val presenceLabel = snapshot.presence.label()
    val freshnessLabel = snapshot.freshness.label()
    val support = when (snapshot.presence) {
        DevicePresenceStatus.Online -> stringResource(R.string.device_health_online_support)
        DevicePresenceStatus.Degraded -> stringResource(R.string.device_health_degraded_support)
        DevicePresenceStatus.Stale -> stringResource(R.string.device_health_stale_support)
        DevicePresenceStatus.Offline -> stringResource(R.string.device_health_offline_support)
    }
    Surface(
        color = snapshot.presence.containerColor(),
        contentColor = snapshot.presence.contentColor(),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = "$presenceLabel. $freshnessLabel"
            }
            .testTag("device_health.presence"),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.small),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(spacing.small),
            ) {
                Icon(
                    imageVector = if (snapshot.presence == DevicePresenceStatus.Offline) {
                        Icons.Default.CloudOff
                    } else {
                        Icons.Default.Wifi
                    },
                    contentDescription = null,
                    modifier = Modifier.size(22.dp),
                )
                Text(
                    text = stringResource(R.string.device_health_presence_heading),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            DevicePresenceChip(snapshot.presence)
            Text(text = freshnessLabel, style = MaterialTheme.typography.bodyMedium)
            snapshot.lastSeenAt?.let { rawValue ->
                Text(
                    text = stringResource(R.string.device_health_last_seen_raw, rawValue),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Text(text = support, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun DevicePresenceChip(status: DevicePresenceStatus) {
    Surface(
        color = status.containerColor(),
        contentColor = status.contentColor(),
        shape = MaterialTheme.shapes.extraLarge,
        modifier = Modifier
            .defaultMinSize(minHeight = 32.dp)
            .testTag("device_health.presence_chip"),
    ) {
        Text(
            text = status.label(),
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = ShcareTheme.spacing.medium, vertical = ShcareTheme.spacing.small),
        )
    }
}

@Composable
private fun HealthSection(
    metrics: List<HealthMetric>,
    title: String? = null,
) {
    val spacing = ShcareTheme.spacing
    Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
        if (title != null) SectionHeading(title)
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val twoColumns = maxWidth >= 600.dp
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                metrics.chunked(if (twoColumns) 2 else 1).forEach { rowMetrics ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(spacing.small),
                    ) {
                        rowMetrics.forEach { metric ->
                            HealthMetricItem(
                                metric = metric,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        if (twoColumns && rowMetrics.size == 1) {
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HealthMetricItem(
    metric: HealthMetric,
    modifier: Modifier = Modifier,
) {
    val containerColor = when (metric.tone) {
        HealthMetricTone.Normal -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
        HealthMetricTone.Warning -> ShcareTheme.colors.warningContainer
        HealthMetricTone.Error -> MaterialTheme.colorScheme.errorContainer
    }
    val contentColor = when (metric.tone) {
        HealthMetricTone.Normal -> MaterialTheme.colorScheme.onSurface
        HealthMetricTone.Warning -> ShcareTheme.colors.onWarningContainer
        HealthMetricTone.Error -> MaterialTheme.colorScheme.onErrorContainer
    }
    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.medium,
        modifier = modifier
            .defaultMinSize(minHeight = 76.dp)
            .semantics(mergeDescendants = true) {
                stateDescription = listOfNotNull(metric.label, metric.value, metric.supporting)
                    .joinToString(". ")
            }
            .testTag("device_health.metric.${metric.key}"),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        ) {
            Icon(
                imageVector = metric.icon,
                contentDescription = null,
                modifier = Modifier.size(22.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
            ) {
                Text(text = metric.label, style = MaterialTheme.typography.labelLarge)
                Text(text = metric.value, style = MaterialTheme.typography.bodyMedium)
                metric.supporting?.let {
                    Text(text = it, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun DeviceHealthSnapshot.telemetryMetrics(): List<HealthMetric> {
    val missing = stringResource(R.string.device_health_value_missing)
    val lastCommandParts = listOf(
        if (lastCommandState != null) {
            stringResource(R.string.device_health_command_state, lastCommandState)
        } else null,
        if (lastCommandCode != null) {
            stringResource(R.string.device_health_command_code, lastCommandCode)
        } else null,
        if (lastCommandId != null) {
            stringResource(R.string.device_health_command_id, lastCommandId)
        } else null,
    ).filterNotNull()
    val lastCommandSupporting = if (lastCommandUptimeMs != null) {
        stringResource(
            R.string.device_health_last_command_device_time,
            formatUptime(lastCommandUptimeMs),
        )
    } else null

    return listOf(
        HealthMetric(
            key = "i2s",
            icon = Icons.Default.GraphicEq,
            label = stringResource(R.string.device_health_i2s),
            value = i2sStatus ?: missing,
            tone = if (i2sStatus.isFailureStatus()) HealthMetricTone.Error else HealthMetricTone.Normal,
        ),
        HealthMetric(
            key = "audio_status",
            icon = Icons.Default.GraphicEq,
            label = stringResource(R.string.device_health_audio_status),
            value = audioStatus ?: missing,
            tone = if (audioStatus.isFailureStatus()) HealthMetricTone.Error else HealthMetricTone.Normal,
        ),
        HealthMetric(
            key = "uptime",
            icon = Icons.Default.Schedule,
            label = stringResource(R.string.device_health_uptime),
            value = formatUptime(uptimeMs),
        ),
        HealthMetric(
            key = "free_heap",
            icon = Icons.Default.Memory,
            label = stringResource(R.string.device_health_free_heap),
            value = formatBytes(freeHeapBytes),
        ),
        HealthMetric(
            key = "packets_sent",
            icon = Icons.Default.GraphicEq,
            label = stringResource(R.string.device_health_packets_sent),
            value = audioPacketsSent.formatCounterOrMissing(),
        ),
        HealthMetric(
            key = "packets_dropped",
            icon = Icons.Default.GraphicEq,
            label = stringResource(R.string.device_health_packets_dropped),
            value = audioPacketsDropped.formatCounterOrMissing(),
            tone = if ((audioPacketsDropped ?: 0L) > 0L) {
                HealthMetricTone.Warning
            } else {
                HealthMetricTone.Normal
            },
        ),
        HealthMetric(
            key = "send_failures",
            icon = Icons.Default.GraphicEq,
            label = stringResource(R.string.device_health_send_failures),
            value = audioSendFailures.formatCounterOrMissing(),
            tone = if ((audioSendFailures ?: 0L) > 0L) {
                HealthMetricTone.Error
            } else {
                HealthMetricTone.Normal
            },
        ),
        HealthMetric(
            key = "last_command",
            icon = Icons.Default.Terminal,
            label = stringResource(R.string.device_health_last_command),
            value = lastCommandParts.takeIf { it.isNotEmpty() }?.joinToString(" • ") ?: missing,
            supporting = lastCommandSupporting,
            tone = if (lastCommandState.isFailureStatus()) HealthMetricTone.Error else HealthMetricTone.Normal,
        ),
        HealthMetric(
            key = "ota",
            icon = Icons.Default.SystemUpdateAlt,
            label = stringResource(R.string.device_health_ota),
            value = otaStatus ?: missing,
            tone = if (otaStatus.isFailureStatus()) HealthMetricTone.Error else HealthMetricTone.Normal,
        ),
    )
}

@Composable
private fun DeviceManagementInlineFailure(
    failure: DeviceManagementFailure,
    onRefresh: () -> Unit,
) {
    val isMutationFailure = failure.operation == DeviceManagementOperation.Release
    val title = stringResource(
        if (isMutationFailure) {
            R.string.device_management_mutation_unconfirmed_title
        } else {
            R.string.device_management_stale_title
        },
    )
    val message = failure.messageWithRequestId(
        fallback = stringResource(
            if (isMutationFailure) {
                R.string.device_management_mutation_unconfirmed_message
            } else {
                R.string.device_management_stale_message
            },
        ),
    )
    Card(
        colors = CardDefaults.cardColors(
            containerColor = when (failure.kind) {
                DeviceManagementFailureKind.Offline -> ShcareTheme.colors.offlineContainer
                DeviceManagementFailureKind.Permission -> ShcareTheme.colors.infoContainer
                DeviceManagementFailureKind.Error -> MaterialTheme.colorScheme.errorContainer
            },
        ),
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = "$title. $message"
            },
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
            )
            FilledTonalButton(
                onClick = onRefresh,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(ShcareTheme.spacing.small))
                Text(stringResource(R.string.device_management_retry))
            }
        }
    }
}

@Composable
private fun DeviceManagementInfo() {
    val info = stringResource(R.string.device_management_info)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = info
            },
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
    ) {
        Icon(
            imageVector = Icons.Default.Info,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = info,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SectionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun DeviceHealthSnapshot.displayName(): String {
    return deviceName ?: deviceId.takeIf(String::isNotBlank)
        ?: stringResource(R.string.device_management_unknown_device)
}

@Composable
private fun DevicePresenceStatus.label(): String = stringResource(
    when (this) {
        DevicePresenceStatus.Online -> R.string.device_presence_online
        DevicePresenceStatus.Degraded -> R.string.device_presence_degraded
        DevicePresenceStatus.Stale -> R.string.device_presence_stale
        DevicePresenceStatus.Offline -> R.string.device_presence_offline
    },
)

@Composable
private fun DevicePresenceStatus.containerColor() = when (this) {
    DevicePresenceStatus.Online -> ShcareTheme.colors.successContainer
    DevicePresenceStatus.Degraded, DevicePresenceStatus.Stale -> ShcareTheme.colors.warningContainer
    DevicePresenceStatus.Offline -> ShcareTheme.colors.offlineContainer
}

@Composable
private fun DevicePresenceStatus.contentColor() = when (this) {
    DevicePresenceStatus.Online -> ShcareTheme.colors.onSuccessContainer
    DevicePresenceStatus.Degraded, DevicePresenceStatus.Stale -> ShcareTheme.colors.onWarningContainer
    DevicePresenceStatus.Offline -> ShcareTheme.colors.onOfflineContainer
}

@Composable
private fun DeviceFreshness.label(): String {
    val age = ageSeconds
    return when (status) {
        DeviceFreshnessStatus.Missing -> stringResource(R.string.device_health_last_seen_missing)
        DeviceFreshnessStatus.Invalid -> stringResource(R.string.device_health_last_seen_invalid)
        DeviceFreshnessStatus.Future -> stringResource(R.string.device_health_last_seen_future)
        DeviceFreshnessStatus.Fresh, DeviceFreshnessStatus.Stale -> when {
            age == null || age < 60L -> stringResource(R.string.device_health_last_seen_now)
            age < 3_600L -> {
                val minutes = (age / 60L).toSafeResourceCount()
                pluralStringResource(R.plurals.device_health_last_seen_minutes, minutes, minutes)
            }
            age < 86_400L -> {
                val hours = (age / 3_600L).toSafeResourceCount()
                pluralStringResource(R.plurals.device_health_last_seen_hours, hours, hours)
            }
            else -> {
                val days = (age / 86_400L).toSafeResourceCount()
                pluralStringResource(R.plurals.device_health_last_seen_days, days, days)
            }
        }
    }
}

@Composable
private fun formatUptime(value: Long?): String {
    if (value == null) return stringResource(R.string.device_health_value_missing)
    val totalMinutes = value.coerceAtLeast(0L) / 60_000L
    if (totalMinutes == 0L) return stringResource(R.string.device_health_less_than_minute)
    val days = totalMinutes / (24L * 60L)
    val hours = (totalMinutes % (24L * 60L)) / 60L
    val minutes = totalMinutes % 60L
    return when {
        days > 0L -> pluralStringResource(
            R.plurals.device_health_duration_days,
            days.toInt(),
            days,
            hours,
        )
        hours > 0L -> pluralStringResource(
            R.plurals.device_health_duration_hours,
            hours.toInt(),
            hours,
            minutes,
        )
        else -> stringResource(R.string.device_health_duration_minutes, minutes)
    }
}

@Composable
private fun formatBytes(value: Long?): String {
    if (value == null) return stringResource(R.string.device_health_value_missing)
    val safeValue = value.coerceAtLeast(0L)
    return when {
        safeValue >= 1_048_576L -> stringResource(
            R.string.device_health_mebibytes,
            safeValue.toDouble() / 1_048_576.0,
        )
        safeValue >= 1_024L -> stringResource(
            R.string.device_health_kibibytes,
            safeValue.toDouble() / 1_024.0,
        )
        else -> stringResource(R.string.device_health_bytes, safeValue)
    }
}

@Composable
private fun Long?.formatCounterOrMissing(): String {
    return this?.let { NumberFormat.getIntegerInstance().format(it.coerceAtLeast(0L)) }
        ?: stringResource(R.string.device_health_value_missing)
}

@Composable
private fun DeviceManagementFailure.messageWithRequestId(fallback: String): String {
    val resolved = fallback
    if (requestId.isBlank()) return resolved
    return "$resolved\n${stringResource(R.string.device_management_request_id, requestId)}"
}

private fun String?.isFailureStatus(): Boolean {
    val normalized = this?.trim()?.lowercase().orEmpty()
    if (normalized.isBlank()) return false
    return listOf("degraded", "error", "failed", "fault", "rolled_back", "unavailable")
        .any { token -> normalized == token || normalized.contains(token) }
}

private fun Long.toSafeResourceCount(): Int = coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()

private data class HealthMetric(
    val key: String,
    val icon: ImageVector,
    val label: String,
    val value: String,
    val supporting: String? = null,
    val tone: HealthMetricTone = HealthMetricTone.Normal,
)

private enum class HealthMetricTone {
    Normal,
    Warning,
    Error,
}
