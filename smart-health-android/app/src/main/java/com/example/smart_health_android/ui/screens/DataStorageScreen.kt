package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.FolderShared
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.storage.DataStorageLoadState
import com.example.smart_health_android.storage.DataStorageSnapshot
import com.example.smart_health_android.storage.DataStorageUiAction
import com.example.smart_health_android.storage.DataStorageViewModel
import com.example.smart_health_android.storage.DataStorageViewModelFactory
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.components.ShcareSettingsHeader
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.util.Locale

@Composable
fun DataStorageScreen(
    onNavigateBack: () -> Unit,
    onNavigateToExportData: () -> Unit,
    canExportData: Boolean,
    modifier: Modifier = Modifier,
    viewModel: DataStorageViewModel = viewModel(factory = DataStorageViewModelFactory()),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val retry = { viewModel.onAction(DataStorageUiAction.Refresh) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .testTag("data-storage-screen"),
    ) {
        ShcareSettingsHeader(
            title = stringResource(R.string.data_storage_title),
            onNavigateBack = onNavigateBack,
            actions = {
                IconButton(
                    onClick = retry,
                    enabled = !state.isRefreshing && !state.isClearingCache,
                    modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
                ) {
                    if (state.isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.data_storage_refresh),
                        )
                    }
                }
            },
        )

        when (state.loadState) {
            DataStorageLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.data_storage_loading),
                modifier = Modifier.fillMaxSize(),
            )
            DataStorageLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = retry,
                title = stringResource(R.string.data_storage_permission_title),
                message = state.errorMessage,
                actionLabel = stringResource(R.string.data_storage_retry),
                modifier = Modifier.fillMaxSize(),
            )
            DataStorageLoadState.Offline -> ShcareOfflineState(
                onRetry = retry,
                message = state.errorMessage,
                modifier = Modifier.fillMaxSize(),
            )
            DataStorageLoadState.Error -> ShcareErrorState(
                onRetry = retry,
                message = state.errorMessage,
                modifier = Modifier.fillMaxSize(),
            )
            DataStorageLoadState.Empty -> StorageContent(
                snapshot = state.snapshot,
                canExportData = canExportData,
                isClearingCache = state.isClearingCache,
                isStale = state.isStale,
                errorMessage = state.errorMessage,
                statusMessage = state.statusMessage,
                onClearCache = {
                    viewModel.onAction(DataStorageUiAction.ClearLocalCache)
                },
                onExport = onNavigateToExportData,
                empty = true,
            )
            DataStorageLoadState.Ready -> StorageContent(
                snapshot = state.snapshot,
                canExportData = canExportData,
                isClearingCache = state.isClearingCache,
                isStale = state.isStale,
                errorMessage = state.errorMessage,
                statusMessage = state.statusMessage,
                onClearCache = {
                    viewModel.onAction(DataStorageUiAction.ClearLocalCache)
                },
                onExport = onNavigateToExportData,
                empty = false,
            )
        }
    }
}

@Composable
private fun StorageContent(
    snapshot: DataStorageSnapshot?,
    canExportData: Boolean,
    isClearingCache: Boolean,
    isStale: Boolean,
    errorMessage: String?,
    statusMessage: String?,
    onClearCache: () -> Unit,
    onExport: () -> Unit,
    empty: Boolean,
) {
    val resolved = snapshot ?: return
    val semanticColors = ShcareTheme.colors
    val categories = listOf(
        StorageCategory(
            icon = Icons.Default.FolderShared,
            title = stringResource(R.string.data_storage_profiles),
            value = "${resolved.remote.patientCount} hồ sơ",
        ),
        StorageCategory(
            icon = Icons.Default.Description,
            title = stringResource(R.string.data_storage_scans),
            value = "${resolved.remote.scanCount} lượt",
        ),
        StorageCategory(
            icon = Icons.Default.GraphicEq,
            title = stringResource(R.string.data_storage_audio_files),
            value = "${resolved.remote.audioFileCount} tệp · ${formatBytes(resolved.remote.audioUsedBytes)}",
        ),
    )

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .testTag("data-storage-list"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (isStale && !errorMessage.isNullOrBlank()) {
            item {
                StatusBanner(
                    message = stringResource(R.string.data_storage_stale_message, errorMessage),
                    containerColor = semanticColors.warningContainer,
                    contentColor = semanticColors.onWarningContainer,
                    assertive = true,
                )
            }
        } else if (!errorMessage.isNullOrBlank()) {
            item {
                StatusBanner(
                    message = errorMessage,
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    assertive = true,
                )
            }
        }
        if (!statusMessage.isNullOrBlank()) {
            item {
                StatusBanner(
                    message = statusMessage,
                    containerColor = semanticColors.successContainer,
                    contentColor = semanticColors.onSuccessContainer,
                    assertive = false,
                )
            }
        }
        if (empty) {
            item {
                ShcareEmptyState(
                    title = stringResource(R.string.data_storage_empty_title),
                    message = stringResource(R.string.data_storage_empty_message),
                )
            }
        }
        item {
            Text(
                text = stringResource(R.string.data_storage_overview_heading),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics { heading() },
            )
        }
        item {
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val useSingleColumn = maxWidth < 600.dp || LocalDensity.current.fontScale >= 1.5f
                if (useSingleColumn) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        StorageMetricCard(
                            icon = Icons.Default.PhoneAndroid,
                            label = stringResource(R.string.data_storage_local_temporary_files),
                            value = formatBytes(resolved.localCache.byteCount),
                            supporting = "${resolved.localCache.fileCount} tệp, tự hết hạn",
                            modifier = Modifier.fillMaxWidth(),
                        )
                        StorageMetricCard(
                            icon = Icons.Default.Cloud,
                            label = stringResource(R.string.data_storage_accessible_data),
                            value = formatBytes(resolved.remote.cloudUsedBytes),
                            supporting = "${resolved.remote.storageFileCount} tệp backend",
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        StorageMetricCard(
                            icon = Icons.Default.PhoneAndroid,
                            label = stringResource(R.string.data_storage_local_temporary_files),
                            value = formatBytes(resolved.localCache.byteCount),
                            supporting = "${resolved.localCache.fileCount} tệp, tự hết hạn",
                            modifier = Modifier.weight(1f),
                        )
                        StorageMetricCard(
                            icon = Icons.Default.Cloud,
                            label = stringResource(R.string.data_storage_accessible_data),
                            value = formatBytes(resolved.remote.cloudUsedBytes),
                            supporting = "${resolved.remote.storageFileCount} tệp backend",
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
        item {
            Text(
                text = stringResource(R.string.data_storage_confirmed_heading),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.semantics { heading() },
            )
        }
        items(categories) { category ->
            StorageCategoryRow(category)
        }
        item {
            Surface(
                color = semanticColors.infoContainer,
                contentColor = semanticColors.onInfoContainer,
                shape = RoundedCornerShape(16.dp),
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                    )
                    Spacer(modifier = Modifier.size(12.dp))
                    Text(
                        text = stringResource(R.string.data_storage_scope_note),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FilledTonalButton(
                    onClick = onClearCache,
                    enabled = !isClearingCache && resolved.localCache.fileCount > 0,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp),
                ) {
                    if (isClearingCache) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.DeleteSweep,
                            contentDescription = null,
                        )
                    }
                    Spacer(modifier = Modifier.size(8.dp))
                    Text("Xóa tệp tạm trên thiết bị")
                }
                if (canExportData) {
                    Button(
                        onClick = onExport,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text("Tạo bản xuất dữ liệu")
                        Spacer(modifier = Modifier.weight(1f))
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = null,
                        )
                    }
                }
            }
        }
        item {
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

private data class StorageCategory(
    val icon: ImageVector,
    val title: String,
    val value: String,
)

@Composable
private fun StorageMetricCard(
    icon: ImageVector,
    label: String,
    value: String,
    supporting: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = supporting,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun StorageCategoryRow(category: StorageCategory) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 64.dp)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(40.dp),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = category.icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
            Spacer(modifier = Modifier.size(12.dp))
            Text(
                text = category.title,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = category.value,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
    }
}

@Composable
private fun StatusBanner(
    message: String,
    containerColor: androidx.compose.ui.graphics.Color,
    contentColor: androidx.compose.ui.graphics.Color,
    assertive: Boolean,
) {
    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.semantics {
            liveRegion = if (assertive) LiveRegionMode.Assertive else LiveRegionMode.Polite
        },
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp),
        )
    }
}

private fun formatBytes(value: Long): String {
    if (value <= 0L) return "0 B"
    val units = listOf("B", "KB", "MB", "GB")
    var amount = value.toDouble()
    var unit = 0
    while (amount >= 1024.0 && unit < units.lastIndex) {
        amount /= 1024.0
        unit += 1
    }
    return if (unit == 0) {
        "${amount.toLong()} ${units[unit]}"
    } else {
        String.format(Locale.getDefault(), "%.1f %s", amount, units[unit])
    }
}
