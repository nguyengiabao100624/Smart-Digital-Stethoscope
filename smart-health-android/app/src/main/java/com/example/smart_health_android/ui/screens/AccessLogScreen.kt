package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.security.AccessLogLoadState
import com.example.smart_health_android.security.AccessLogRecord
import com.example.smart_health_android.security.AccessLogSeverity
import com.example.smart_health_android.security.AccessLogUiAction
import com.example.smart_health_android.security.AccessLogUiEffect
import com.example.smart_health_android.security.AccessLogUiState
import com.example.smart_health_android.security.AccessLogViewModel
import com.example.smart_health_android.security.AccessLogViewModelFactory
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.components.ShcareSettingsHeader
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun AccessLogScreen(
    onNavigateBack: () -> Unit,
    viewModel: AccessLogViewModel = viewModel(factory = AccessLogViewModelFactory()),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val refreshConfirmedMessage = stringResource(R.string.access_log_refresh_confirmed)

    LaunchedEffect(viewModel, refreshConfirmedMessage) {
        viewModel.effects.collect { effect ->
            when (effect) {
                AccessLogUiEffect.RefreshConfirmed ->
                    snackbarHostState.showSnackbar(refreshConfirmedMessage)
            }
        }
    }

    Scaffold(
        topBar = {
            ShcareSettingsHeader(
                title = stringResource(R.string.access_log_title),
                onNavigateBack = onNavigateBack,
                actions = {
                    val refreshEnabled =
                        !state.isRefreshing &&
                            state.loadState != AccessLogLoadState.Loading &&
                            state.loadState != AccessLogLoadState.PermissionDenied
                    val refreshState = when {
                        state.loadState == AccessLogLoadState.Loading ->
                            stringResource(R.string.access_log_loading)
                        state.isRefreshing ->
                            stringResource(R.string.access_log_refreshing)
                        else -> stringResource(R.string.access_log_refresh)
                    }
                    IconButton(
                        onClick = {
                            viewModel.onAction(
                                if (state.hasLoaded) {
                                    AccessLogUiAction.Refresh
                                } else {
                                    AccessLogUiAction.Retry
                                },
                            )
                        },
                        enabled = refreshEnabled,
                        modifier = Modifier.semantics {
                            stateDescription = refreshState
                        },
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.access_log_refresh),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding(),
    ) { innerPadding ->
        when (state.loadState) {
            AccessLogLoadState.Loading -> ShcareLoadingState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                message = stringResource(R.string.access_log_loading),
            )

            AccessLogLoadState.Empty -> ShcareEmptyState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                title = stringResource(R.string.access_log_empty_title),
                message = stringResource(R.string.access_log_empty_message),
                actionLabel = stringResource(R.string.access_log_refresh),
                onAction = { viewModel.onAction(AccessLogUiAction.Refresh) },
            )

            AccessLogLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onNavigateBack,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                title = stringResource(R.string.access_log_permission_title),
                message = accessLogMessageWithRequestId(
                    message = stringResource(R.string.access_log_permission_message),
                    requestId = state.requestId,
                ),
                actionLabel = stringResource(R.string.shcare_action_back),
            )

            AccessLogLoadState.Offline -> ShcareOfflineState(
                onRetry = { viewModel.onAction(AccessLogUiAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                title = stringResource(R.string.access_log_offline_title),
                message = stringResource(R.string.access_log_offline_message),
            )

            AccessLogLoadState.Error -> ShcareErrorState(
                onRetry = { viewModel.onAction(AccessLogUiAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                title = stringResource(R.string.access_log_error_title),
                message = accessLogMessageWithRequestId(
                    message = stringResource(R.string.access_log_error_message),
                    requestId = state.requestId,
                ),
            )

            AccessLogLoadState.Content -> AccessLogContent(
                state = state,
                innerPadding = innerPadding,
                onRefresh = { viewModel.onAction(AccessLogUiAction.Refresh) },
            )
        }
    }
}

@Composable
private fun AccessLogContent(
    state: AccessLogUiState,
    innerPadding: PaddingValues,
    onRefresh: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val refreshingDescription = stringResource(R.string.access_log_refreshing)

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding),
        contentPadding = PaddingValues(
            start = spacing.large,
            top = spacing.large,
            end = spacing.large,
            bottom = spacing.tripleExtraLarge,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                Text(
                    text = stringResource(R.string.access_log_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (state.isRefreshing) {
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics {
                                stateDescription = refreshingDescription
                            },
                    )
                }
                if (state.isStale) {
                    AccessLogStaleBanner(onRefresh = onRefresh)
                }
            }
        }

        itemsIndexed(
            items = state.records,
            key = { index, record ->
                record.id.ifBlank { "access-log-$index-${record.createdAt.orEmpty()}" }
            },
        ) { index, record ->
            AccessLogTimelineItem(
                record = record,
                isLast = index == state.records.lastIndex,
            )
        }
    }
}

@Composable
private fun AccessLogStaleBanner(onRefresh: () -> Unit) {
    val message = stringResource(R.string.access_log_stale_message)
    Surface(
        color = ShcareTheme.colors.warningContainer,
        contentColor = ShcareTheme.colors.onWarningContainer,
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
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
            FilledTonalButton(
                onClick = onRefresh,
                modifier = Modifier
                    .align(Alignment.End)
                    .heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.access_log_retry_refresh))
            }
        }
    }
}

@Composable
private fun AccessLogTimelineItem(
    record: AccessLogRecord,
    isLast: Boolean,
) {
    val spacing = ShcareTheme.spacing
    val isWarning = record.severity == AccessLogSeverity.Warning
    val accentColor = if (isWarning) {
        MaterialTheme.colorScheme.error
    } else {
        ShcareTheme.colors.info
    }
    val device = record.device.ifBlank {
        stringResource(R.string.access_log_default_device)
    }
    val location = record.location.ifBlank {
        stringResource(R.string.access_log_unknown_location)
    }
    val locationWithIp = if (record.ip.isBlank()) {
        location
    } else {
        stringResource(R.string.access_log_location_with_ip, location, record.ip)
    }
    val timestamp = formatIso(record.createdAt, "HH:mm - dd/MM/yyyy")
    val severityDescription = if (isWarning) {
        stringResource(R.string.access_log_severity_warning)
    } else {
        stringResource(R.string.access_log_severity_info)
    }
    val itemDescription = stringResource(
        R.string.access_log_item_description,
        record.action,
        device,
        locationWithIp,
        timestamp,
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                contentDescription = itemDescription
                stateDescription = severityDescription
            },
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .background(MaterialTheme.colorScheme.surface, CircleShape)
                    .border(2.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .background(accentColor, CircleShape),
                )
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(64.dp)
                        .background(MaterialTheme.colorScheme.outlineVariant),
                )
            }
        }

        Spacer(modifier = Modifier.width(spacing.medium))

        Card(
            modifier = Modifier
                .weight(1f)
                .padding(bottom = if (isLast) 0.dp else spacing.small),
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
            ),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Column(
                modifier = Modifier.padding(spacing.large),
                verticalArrangement = Arrangement.spacedBy(spacing.small),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(spacing.small),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = if (isWarning) {
                            Icons.Default.Security
                        } else {
                            Icons.Default.Smartphone
                        },
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        text = record.action,
                        color = if (isWarning) accentColor else MaterialTheme.colorScheme.onSurface,
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier
                            .weight(1f)
                            .semantics { heading() },
                    )
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Text(
                            text = timestamp,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(
                                horizontal = spacing.small,
                                vertical = spacing.extraSmall,
                            ),
                        )
                    }
                }
                AccessLogMeta(text = device)
                AccessLogMeta(text = locationWithIp)
            }
        }
    }
}

@Composable
private fun AccessLogMeta(text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(MaterialTheme.colorScheme.outline, CircleShape),
        )
        Text(
            text = text,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun accessLogMessageWithRequestId(
    message: String,
    requestId: String,
): String = if (requestId.isBlank()) {
    message
} else {
    "$message\n${stringResource(R.string.access_log_request_id, requestId)}"
}
