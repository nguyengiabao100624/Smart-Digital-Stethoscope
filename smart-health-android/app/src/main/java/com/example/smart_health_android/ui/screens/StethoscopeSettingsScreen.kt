package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BatteryFull
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MedicalServices
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.devices.DeviceFreshnessStatus
import com.example.smart_health_android.devices.DeviceHealthSnapshot
import com.example.smart_health_android.devices.DevicePresenceStatus
import com.example.smart_health_android.devices.StethoscopeSettingsLoadState
import com.example.smart_health_android.devices.StethoscopeSettingsUiAction
import com.example.smart_health_android.devices.StethoscopeSettingsUiState
import com.example.smart_health_android.devices.StethoscopeSettingsViewModel
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareSettingsHeader
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun StethoscopeSettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToDevicePairing: () -> Unit,
    onNavigateToDeviceManagement: () -> Unit,
    settingsViewModel: StethoscopeSettingsViewModel = viewModel(),
) {
    val state by settingsViewModel.uiState.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        ShcareSettingsHeader(
            title = stringResource(R.string.stethoscope_title),
            onNavigateBack = onNavigateBack,
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding(),
            contentAlignment = Alignment.TopCenter,
        ) {
            when (state.loadState) {
                StethoscopeSettingsLoadState.Loading -> ShcareLoadingState(
                    message = stringResource(R.string.stethoscope_loading),
                    modifier = Modifier
                        .widthIn(max = 720.dp)
                        .fillMaxWidth(),
                )

                StethoscopeSettingsLoadState.Empty -> ShcareEmptyState(
                    title = stringResource(R.string.stethoscope_empty_title),
                    message =
                        "Nhập Device ID của thiết bị đã được công ty gán cho tài khoản. " +
                            "Kết nối Wi-Fi nằm trong phần cài đặt của từng thiết bị.",
                    actionLabel = stringResource(R.string.stethoscope_pair_device),
                    onAction = onNavigateToDevicePairing,
                    modifier = Modifier
                        .widthIn(max = 720.dp)
                        .fillMaxWidth(),
                )

                StethoscopeSettingsLoadState.Error -> ShcareErrorState(
                    title = stringResource(R.string.stethoscope_error_title),
                    message = state.errorMessage,
                    onRetry = {
                        settingsViewModel.onAction(StethoscopeSettingsUiAction.Refresh)
                    },
                    modifier = Modifier
                        .widthIn(max = 720.dp)
                        .fillMaxWidth(),
                )

                StethoscopeSettingsLoadState.Ready -> StethoscopeSettingsContent(
                    state = state,
                    onRefresh = {
                        settingsViewModel.onAction(StethoscopeSettingsUiAction.Refresh)
                    },
                    onNavigateToDevicePairing = onNavigateToDevicePairing,
                    onNavigateToDeviceManagement = onNavigateToDeviceManagement,
                    modifier = Modifier
                        .widthIn(max = 720.dp)
                        .fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun StethoscopeSettingsContent(
    state: StethoscopeSettingsUiState,
    onRefresh: () -> Unit,
    onNavigateToDevicePairing: () -> Unit,
    onNavigateToDeviceManagement: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val device = requireNotNull(state.currentDevice)
    val snapshot = DeviceHealthSnapshot.from(device)
    val spacing = ShcareTheme.spacing

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .testTag("stethoscope.content"),
        contentPadding = PaddingValues(spacing.large),
        verticalArrangement = Arrangement.spacedBy(spacing.extraLarge),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                Text(
                    text = stringResource(R.string.stethoscope_device_status_heading),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text =
                        "Dữ liệu bên dưới do backend tổng hợp từ phiên thiết bị đã xác thực.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            DeviceSummaryCard(
                device = device,
                snapshot = snapshot,
            )
        }

        if (state.isStale) {
            item {
                StatusNotice(
                    message =
                        state.errorMessage
                            ?: "Không thể làm mới. Đang hiển thị trạng thái đã xác nhận gần nhất.",
                    containerColor = ShcareTheme.colors.offlineContainer,
                    contentColor = ShcareTheme.colors.onOfflineContainer,
                    liveRegionMode = LiveRegionMode.Assertive,
                )
            }
        } else {
            state.errorMessage?.let { message ->
                item {
                    StatusNotice(
                        message = message,
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        liveRegionMode = LiveRegionMode.Assertive,
                    )
                }
            }
        }

        state.statusMessage?.let { message ->
            item {
                StatusNotice(
                    message = message,
                    containerColor = ShcareTheme.colors.successContainer,
                    contentColor = ShcareTheme.colors.onSuccessContainer,
                    liveRegionMode = LiveRegionMode.Polite,
                )
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                FilledTonalButton(
                    onClick = onRefresh,
                    enabled = !state.isRefreshing,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp),
                ) {
                    if (state.isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Spacer(modifier = Modifier.width(spacing.small))
                    Text(if (state.isRefreshing) "Đang làm mới…" else "Làm mới trạng thái")
                }
                Button(
                    onClick = onNavigateToDevicePairing,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Add,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(spacing.small))
                    Text("Thêm thiết bị")
                }
                OutlinedButton(
                    onClick = onNavigateToDeviceManagement,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(spacing.small))
                    Text("Quản lý thiết bị")
                }
            }
        }

        item {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = ShcareTheme.colors.infoContainer,
                contentColor = ShcareTheme.colors.onInfoContainer,
                border = BorderStroke(
                    width = 1.dp,
                    color = ShcareTheme.colors.info.copy(alpha = 0.32f),
                ),
            ) {
                Row(
                    modifier = Modifier.padding(spacing.large),
                    horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = null,
                        tint = ShcareTheme.colors.info,
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(spacing.extraSmall)) {
                        Text(
                            text = stringResource(R.string.stethoscope_advanced_unavailable),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text =
                                "Âm lượng, lọc tiếng ồn và hiệu chuẩn chỉ được mở khi " +
                                    "Android, backend và firmware có cùng contract cùng ACK thiết bị. " +
                                    "Shcare không hiển thị control chỉ lưu local hoặc luôn bị backend từ chối.",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceSummaryCard(
    device: SmartDevice,
    snapshot: DeviceHealthSnapshot,
) {
    val spacing = ShcareTheme.spacing
    val presence = devicePresenceVisual(snapshot.presence)
    val connectionMethod = snapshot.connectionMethod
        ?.takeUnless { it.equals("bluetooth", ignoreCase = true) || it.equals("ble", ignoreCase = true) }
        ?: "Chưa báo"
    val batteryLabel = if (device.battery in 1..100) {
        "${device.battery}%"
    } else {
        "Chưa báo"
    }
    val rssiLabel = device.wifiRssi?.let { "$it dBm" } ?: "Chưa báo"
    val firmwareLabel = snapshot.firmwareVersion ?: "Chưa báo"
    val lastSeenLabel = formatDeviceTimestamp(snapshot.lastSeenAt)
    val freshnessLabel = when (snapshot.freshness.status) {
        DeviceFreshnessStatus.Fresh -> "Mới cập nhật"
        DeviceFreshnessStatus.Stale -> "Dữ liệu cũ"
        DeviceFreshnessStatus.Missing -> "Chưa có thời điểm báo cáo"
        DeviceFreshnessStatus.Invalid -> "Thời điểm báo cáo không hợp lệ"
        DeviceFreshnessStatus.Future -> "Đồng hồ thiết bị lệch"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription =
                    "${device.name.ifBlank { device.id }}. ${presence.label}. $freshnessLabel."
            },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        border = BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(
                            MaterialTheme.colorScheme.primaryContainer,
                            MaterialTheme.shapes.medium,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.MedicalServices,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(spacing.extraSmall),
                ) {
                    Text(
                        text = device.name.ifBlank { "Thiết bị ${device.id}" },
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        text = device.id,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Surface(
                    color = presence.containerColor,
                    contentColor = presence.contentColor,
                    shape = MaterialTheme.shapes.extraLarge,
                ) {
                    Text(
                        text = presence.label,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(
                            horizontal = spacing.medium,
                            vertical = spacing.small,
                        ),
                    )
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            DeviceMetric(
                icon = Icons.Default.Wifi,
                label = stringResource(R.string.stethoscope_reported_connection),
                value = connectionMethod,
            )
            DeviceMetric(
                icon = Icons.Default.BatteryFull,
                label = stringResource(R.string.stethoscope_battery),
                value = batteryLabel,
            )
            DeviceMetric(
                icon = Icons.Default.Wifi,
                label = stringResource(R.string.stethoscope_wifi_rssi),
                value = rssiLabel,
            )
            DeviceMetric(
                icon = Icons.Default.Memory,
                label = stringResource(R.string.stethoscope_firmware),
                value = firmwareLabel,
            )
            DeviceMetric(
                icon = Icons.Default.Refresh,
                label = stringResource(R.string.stethoscope_last_report),
                value = lastSeenLabel,
            )
            Text(
                text = freshnessLabel,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DeviceMetric(
    icon: ImageVector,
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
        )
    }
}

@Composable
private fun StatusNotice(
    message: String,
    containerColor: Color,
    contentColor: Color,
    liveRegionMode: LiveRegionMode,
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = liveRegionMode
                stateDescription = message
            },
        color = containerColor,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.medium,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(ShcareTheme.spacing.large),
        )
    }
}

private data class DevicePresenceVisual(
    val label: String,
    val containerColor: Color,
    val contentColor: Color,
)

@Composable
private fun devicePresenceVisual(status: DevicePresenceStatus): DevicePresenceVisual {
    return when (status) {
        DevicePresenceStatus.Online -> DevicePresenceVisual(
            label = stringResource(R.string.stethoscope_online),
            containerColor = ShcareTheme.colors.successContainer,
            contentColor = ShcareTheme.colors.onSuccessContainer,
        )

        DevicePresenceStatus.Degraded -> DevicePresenceVisual(
            label = stringResource(R.string.stethoscope_degraded),
            containerColor = ShcareTheme.colors.warningContainer,
            contentColor = ShcareTheme.colors.onWarningContainer,
        )

        DevicePresenceStatus.Stale -> DevicePresenceVisual(
            label = stringResource(R.string.stethoscope_stale),
            containerColor = ShcareTheme.colors.offlineContainer,
            contentColor = ShcareTheme.colors.onOfflineContainer,
        )

        DevicePresenceStatus.Offline -> DevicePresenceVisual(
            label = stringResource(R.string.stethoscope_offline),
            containerColor = ShcareTheme.colors.offlineContainer,
            contentColor = ShcareTheme.colors.onOfflineContainer,
        )
    }
}

private val DeviceTimeFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
        .withZone(ZoneId.systemDefault())

private fun formatDeviceTimestamp(value: String?): String {
    if (value.isNullOrBlank()) return "Chưa báo"
    return runCatching { DeviceTimeFormatter.format(Instant.parse(value)) }
        .getOrDefault("Không hợp lệ")
}
