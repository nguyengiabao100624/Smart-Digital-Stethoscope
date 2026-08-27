package com.example.smart_health_android.clinical.alerts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.ClinicalAlert
import com.example.smart_health_android.data.ClinicalAlertStatus
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun ClinicalAlertsScreen(
    expectedWorkspaceId: String,
    canManage: Boolean,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToReviews: () -> Unit = {},
    providedViewModel: ClinicalAlertsViewModel? = null,
) {
    if (expectedWorkspaceId.isBlank() && providedViewModel == null) {
        ShcarePermissionState(
            onRequestPermission = onOpenWorkspaceSwitcher,
            title = stringResource(R.string.clinical_alerts_workspace_required_title),
            message = stringResource(R.string.clinical_alerts_workspace_required_message),
            actionLabel = stringResource(R.string.clinical_alerts_workspace_action),
            modifier = modifier.fillMaxSize(),
        )
        return
    }

    val factory = remember(expectedWorkspaceId, canManage) {
        ClinicalAlertsViewModelFactory(
            expectedWorkspaceId = expectedWorkspaceId,
            canManage = canManage,
        )
    }
    val resolvedViewModel = providedViewModel ?: viewModel(factory = factory)
    val state = resolvedViewModel.uiState.collectAsStateWithLifecycle().value
    val snackbarHostState = remember { SnackbarHostState() }
    val acknowledgedMessage = stringResource(R.string.clinical_alerts_acknowledged)
    val resolvedMessage = stringResource(R.string.clinical_alerts_resolved)
    val refreshedAfterConflictMessage =
        stringResource(R.string.clinical_alerts_refreshed_after_conflict)

    LaunchedEffect(resolvedViewModel, snackbarHostState) {
        resolvedViewModel.effects.collect { effect ->
            val message = when (effect) {
                is ClinicalAlertsUiEffect.BackendTransitionConfirmed -> when (effect.action) {
                    ClinicalAlertAction.Acknowledge -> acknowledgedMessage
                    ClinicalAlertAction.Resolve -> resolvedMessage
                }
                ClinicalAlertsUiEffect.BackendStateRefreshedAfterConflict ->
                    refreshedAfterConflictMessage
            }
            snackbarHostState.showSnackbar(message)
        }
    }

    ClinicalAlertsContent(
        state = state,
        onAction = resolvedViewModel::onAction,
        onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
        onNavigateToReviews = onNavigateToReviews,
        snackbarHostState = snackbarHostState,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicalAlertsContent(
    state: ClinicalAlertsUiState,
    onAction: (ClinicalAlertsUiAction) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToReviews: () -> Unit = {},
    snackbarHostState: SnackbarHostState = remember { SnackbarHostState() },
) {
    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .testTag("clinical-alerts-screen"),
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = stringResource(R.string.clinical_alerts_title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                },
                actions = {
                    IconButton(
                        onClick = onNavigateToReviews,
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = stringResource(
                                R.string.clinical_alerts_open_reviews,
                            ),
                        )
                    }
                    IconButton(
                        onClick = { onAction(ClinicalAlertsUiAction.Refresh) },
                        enabled = state.loadState != ClinicalAlertsLoadState.Loading &&
                            !state.isRefreshing &&
                            !state.isMutating,
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(
                                R.string.clinical_alerts_refresh,
                            ),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            val useTwoPane = maxWidth >= 840.dp && LocalDensity.current.fontScale < 1.5f
            val selectedAlert = state.alerts.firstOrNull {
                it.id == state.selectedAlertId
            }

            when {
                useTwoPane -> ClinicalAlertsTwoPane(
                    state = state,
                    selectedAlert = selectedAlert,
                    onAction = onAction,
                    onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
                )

                state.compactDetailVisible && selectedAlert != null ->
                    ClinicalAlertDetailPane(
                        alert = selectedAlert,
                        state = state,
                        compact = true,
                        onAction = onAction,
                        modifier = Modifier.fillMaxSize(),
                    )

                else -> ClinicalAlertsListPane(
                    state = state,
                    onAction = onAction,
                    onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }

    state.pendingTransition?.let { pending ->
        val alert = state.alerts.firstOrNull { item ->
            item.id == pending.alertId && item.version == pending.expectedVersion
        }
        if (alert != null) {
            ClinicalAlertTransitionDialog(
                pending = pending,
                isMutating = state.isMutating,
                error = state.error,
                requestId = state.requestId,
                onAction = onAction,
            )
        }
    }
}

@Composable
private fun ClinicalAlertsTwoPane(
    state: ClinicalAlertsUiState,
    selectedAlert: ClinicalAlert?,
    onAction: (ClinicalAlertsUiAction) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
) {
    Row(Modifier.fillMaxSize()) {
        ClinicalAlertsListPane(
            state = state,
            onAction = onAction,
            onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
            modifier = Modifier
                .weight(0.44f)
                .fillMaxHeight(),
        )
        VerticalDivider()
        if (selectedAlert == null) {
            Box(
                modifier = Modifier
                    .weight(0.56f)
                    .fillMaxHeight()
                    .testTag("clinical-alerts-detail"),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.clinical_alerts_detail_placeholder),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(ShcareTheme.spacing.extraLarge),
                )
            }
        } else {
            ClinicalAlertDetailPane(
                alert = selectedAlert,
                state = state,
                compact = false,
                onAction = onAction,
                modifier = Modifier
                    .weight(0.56f)
                    .fillMaxHeight(),
            )
        }
    }
}

@Composable
private fun ClinicalAlertsListPane(
    state: ClinicalAlertsUiState,
    onAction: (ClinicalAlertsUiAction) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    Column(
        modifier = modifier
            .testTag("clinical-alerts-list")
            .padding(horizontal = spacing.large),
    ) {
        Text(
            text = stringResource(R.string.clinical_alerts_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = spacing.medium),
        )
        ClinicalAlertFilters(
            selected = state.filter,
            enabled = !state.isRefreshing && !state.isMutating,
            onSelected = {
                onAction(ClinicalAlertsUiAction.ChangeFilter(it))
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = spacing.medium),
        )

        if (!state.canManage && state.loadState == ClinicalAlertsLoadState.Content) {
            ClinicalAlertsReadOnlyNotice(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = spacing.medium),
            )
        }

        if (state.isStale && state.error != null) {
            ClinicalAlertsStaleNotice(
                error = state.error,
                requestId = state.requestId,
                onRetry = { onAction(ClinicalAlertsUiAction.Refresh) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = spacing.medium),
            )
        }

        when (state.loadState) {
            ClinicalAlertsLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.clinical_alerts_loading),
                modifier = Modifier.weight(1f),
            )

            ClinicalAlertsLoadState.Empty -> ShcareEmptyState(
                title = stringResource(R.string.clinical_alerts_empty_title),
                message = stringResource(R.string.clinical_alerts_empty_message),
                actionLabel = stringResource(R.string.clinical_alerts_refresh),
                onAction = { onAction(ClinicalAlertsUiAction.Refresh) },
                modifier = Modifier.weight(1f),
            )

            ClinicalAlertsLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onOpenWorkspaceSwitcher,
                title = stringResource(R.string.clinical_alerts_permission_title),
                message = clinicalAlertsErrorText(state.error, state.requestId),
                actionLabel = stringResource(R.string.clinical_alerts_workspace_action),
                modifier = Modifier.weight(1f),
            )

            ClinicalAlertsLoadState.Offline -> ShcareOfflineState(
                onRetry = { onAction(ClinicalAlertsUiAction.Refresh) },
                message = clinicalAlertsErrorText(state.error, state.requestId),
                modifier = Modifier.weight(1f),
            )

            ClinicalAlertsLoadState.Error -> ShcareErrorState(
                onRetry = { onAction(ClinicalAlertsUiAction.Refresh) },
                message = clinicalAlertsErrorText(state.error, state.requestId),
                modifier = Modifier.weight(1f),
            )

            ClinicalAlertsLoadState.Content -> LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(bottom = spacing.extraLarge),
                verticalArrangement = Arrangement.spacedBy(spacing.small),
            ) {
                items(
                    items = state.alerts,
                    key = { "${it.id}:${it.version}" },
                ) { alert ->
                    ClinicalAlertCard(
                        alert = alert,
                        selected = alert.id == state.selectedAlertId,
                        onClick = {
                            onAction(ClinicalAlertsUiAction.SelectAlert(alert.id))
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ClinicalAlertFilters(
    selected: ClinicalAlertFilter,
    enabled: Boolean,
    onSelected: (ClinicalAlertFilter) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        contentPadding = PaddingValues(horizontal = ShcareTheme.spacing.extraSmall),
    ) {
        items(ClinicalAlertFilter.entries) { filter ->
            FilterChip(
                selected = filter == selected,
                onClick = { onSelected(filter) },
                enabled = enabled,
                label = { Text(clinicalAlertFilterLabel(filter)) },
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("clinical-alert-filter-${filter.name.lowercase()}"),
            )
        }
    }
}

@Composable
private fun ClinicalAlertCard(
    alert: ClinicalAlert,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 112.dp)
            .testTag("clinical-alert-${alert.id}"),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        border = CardDefaults.outlinedCardBorder(),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
                verticalAlignment = Alignment.Top,
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = null,
                    tint = clinicalAlertSeverityColors(alert.severity).second,
                    modifier = Modifier.size(24.dp),
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(
                        ShcareTheme.spacing.extraSmall,
                    ),
                ) {
                    Text(
                        text = alert.title.ifBlank {
                            stringResource(R.string.clinical_alerts_title_unknown)
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = alert.message.ifBlank {
                            stringResource(R.string.clinical_alerts_message_unknown)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ClinicalAlertStatusBadge(alert.status)
                ClinicalAlertSeverityBadge(alert.severity)
            }
            Text(
                text = formatClinicalAlertDateTime(
                    alert.occurredAt.ifBlank { alert.createdAt },
                ),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ClinicalAlertDetailPane(
    alert: ClinicalAlert,
    state: ClinicalAlertsUiState,
    compact: Boolean,
    onAction: (ClinicalAlertsUiAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = modifier.testTag("clinical-alerts-detail"),
        contentPadding = PaddingValues(spacing.large),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        if (compact) {
            item {
                TextButton(
                    onClick = { onAction(ClinicalAlertsUiAction.CloseDetail) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                    )
                    Spacer(Modifier.width(spacing.small))
                    Text(stringResource(R.string.clinical_alerts_back_to_list))
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                Row(horizontalArrangement = Arrangement.spacedBy(spacing.small)) {
                    ClinicalAlertStatusBadge(alert.status)
                    ClinicalAlertSeverityBadge(alert.severity)
                }
                Text(
                    text = alert.title.ifBlank {
                        stringResource(R.string.clinical_alerts_title_unknown)
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = alert.message.ifBlank {
                        stringResource(R.string.clinical_alerts_message_unknown)
                    },
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
        }

        item { HorizontalDivider() }

        item {
            ClinicalAlertDetailRow(
                label = stringResource(R.string.clinical_alerts_occurred_at),
                value = formatClinicalAlertDateTime(
                    alert.occurredAt.ifBlank { alert.createdAt },
                ),
            )
        }
        item {
            ClinicalAlertDetailRow(
                label = stringResource(R.string.clinical_alerts_source),
                value = listOf(alert.sourceType, alert.sourceId)
                    .filter(String::isNotBlank)
                    .joinToString(" · ")
                    .ifBlank {
                        stringResource(R.string.clinical_alerts_not_updated)
                    },
            )
        }
        if (alert.patientId.isNotBlank()) {
            item {
                ClinicalAlertDetailRow(
                    label = stringResource(R.string.clinical_alerts_patient_id),
                    value = alert.patientId,
                )
            }
        }
        if (alert.deviceId.isNotBlank()) {
            item {
                ClinicalAlertDetailRow(
                    label = stringResource(R.string.clinical_alerts_device_id),
                    value = alert.deviceId,
                )
            }
        }
        if (alert.scanId.isNotBlank()) {
            item {
                ClinicalAlertDetailRow(
                    label = stringResource(R.string.clinical_alerts_scan_id),
                    value = alert.scanId,
                )
            }
        }
        item {
            ClinicalAlertDetailRow(
                label = stringResource(R.string.clinical_alerts_occurrence),
                value = alert.occurrenceNumber.toString(),
            )
        }
        if (alert.acknowledgedAt.isNotBlank()) {
            item {
                ClinicalAlertDetailRow(
                    label = stringResource(R.string.clinical_alerts_acknowledged_at),
                    value = formatClinicalAlertDateTime(alert.acknowledgedAt),
                )
            }
        }
        if (alert.acknowledgementNote.isNotBlank()) {
            item {
                ClinicalAlertDetailRow(
                    label = stringResource(R.string.clinical_alerts_acknowledgement_note),
                    value = alert.acknowledgementNote,
                )
            }
        }
        if (alert.resolvedAt.isNotBlank()) {
            item {
                ClinicalAlertDetailRow(
                    label = stringResource(R.string.clinical_alerts_resolved_at),
                    value = formatClinicalAlertDateTime(alert.resolvedAt),
                )
            }
        }
        if (alert.resolutionNote.isNotBlank()) {
            item {
                ClinicalAlertDetailRow(
                    label = stringResource(R.string.clinical_alerts_resolution_note),
                    value = alert.resolutionNote,
                )
            }
        }

        if (!state.canManage) {
            item { ClinicalAlertsReadOnlyNotice() }
        } else {
            if (alert.status == ClinicalAlertStatus.Open) {
                item {
                    FilledTonalButton(
                        onClick = {
                            onAction(
                                ClinicalAlertsUiAction.RequestTransition(
                                    alertId = alert.id,
                                    action = ClinicalAlertAction.Acknowledge,
                                ),
                            )
                        },
                        enabled = !state.isMutating && !state.isRefreshing,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp),
                    ) {
                        Text(stringResource(R.string.clinical_alerts_acknowledge_action))
                    }
                }
            }
            if (
                alert.status == ClinicalAlertStatus.Open ||
                alert.status == ClinicalAlertStatus.Acknowledged
            ) {
                item {
                    Button(
                        onClick = {
                            onAction(
                                ClinicalAlertsUiAction.RequestTransition(
                                    alertId = alert.id,
                                    action = ClinicalAlertAction.Resolve,
                                ),
                            )
                        },
                        enabled = !state.isMutating && !state.isRefreshing,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp),
                    ) {
                        Text(stringResource(R.string.clinical_alerts_resolve_action))
                    }
                }
            }
        }

        if (state.error != null && !state.isStale && state.pendingTransition == null) {
            item {
                ClinicalAlertsInlineError(
                    error = state.error,
                    requestId = state.requestId,
                    onRetry = { onAction(ClinicalAlertsUiAction.Refresh) },
                )
            }
        }
    }
}

@Composable
private fun ClinicalAlertTransitionDialog(
    pending: PendingClinicalAlertTransition,
    isMutating: Boolean,
    error: ClinicalAlertsError?,
    requestId: String,
    onAction: (ClinicalAlertsUiAction) -> Unit,
) {
    val isResolve = pending.action == ClinicalAlertAction.Resolve
    AlertDialog(
        onDismissRequest = {
            if (!isMutating) {
                onAction(ClinicalAlertsUiAction.DismissTransition)
            }
        },
        icon = {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
            )
        },
        title = {
            Text(
                stringResource(
                    if (isResolve) {
                        R.string.clinical_alerts_resolve_dialog_title
                    } else {
                        R.string.clinical_alerts_acknowledge_dialog_title
                    },
                ),
            )
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            ) {
                Text(
                    stringResource(
                        if (isResolve) {
                            R.string.clinical_alerts_resolve_dialog_message
                        } else {
                            R.string.clinical_alerts_acknowledge_dialog_message
                        },
                    ),
                )
                OutlinedTextField(
                    value = pending.note,
                    onValueChange = {
                        onAction(ClinicalAlertsUiAction.UpdateTransitionNote(it))
                    },
                    enabled = !isMutating,
                    label = {
                        Text(
                            stringResource(
                                if (isResolve) {
                                    R.string.clinical_alerts_resolution_note_required
                                } else {
                                    R.string.clinical_alerts_acknowledgement_note_optional
                                },
                            ),
                        )
                    },
                    minLines = 3,
                    maxLines = 6,
                    isError = pending.validationError != null,
                    supportingText = pending.validationError?.let {
                        {
                            Text(
                                stringResource(
                                    R.string.clinical_alerts_resolution_note_error,
                                ),
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (error != null) {
                    Text(
                        text = clinicalAlertsErrorText(error, requestId),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAction(ClinicalAlertsUiAction.ConfirmTransition) },
                enabled = !isMutating,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(
                    stringResource(
                        if (isResolve) {
                            R.string.clinical_alerts_confirm_resolve
                        } else {
                            R.string.clinical_alerts_confirm_acknowledge
                        },
                    ),
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = { onAction(ClinicalAlertsUiAction.DismissTransition) },
                enabled = !isMutating,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.shcare_action_close))
            }
        },
    )
}

@Composable
private fun ClinicalAlertDetailRow(
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = Icons.Default.Info,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(text = value, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun ClinicalAlertsReadOnlyNotice(
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = ShcareTheme.colors.infoContainer,
        contentColor = ShcareTheme.colors.onInfoContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Text(
            text = stringResource(R.string.clinical_alerts_read_only),
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(ShcareTheme.spacing.large),
        )
    }
}

@Composable
private fun ClinicalAlertsStaleNotice(
    error: ClinicalAlertsError,
    requestId: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val message = clinicalAlertsErrorText(error, requestId)
    Surface(
        modifier = modifier
            .testTag("clinical-alerts-stale")
            .semantics { stateDescription = message },
        color = ShcareTheme.colors.warningContainer,
        contentColor = ShcareTheme.colors.onWarningContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier.padding(
                start = ShcareTheme.spacing.large,
                top = ShcareTheme.spacing.small,
                end = ShcareTheme.spacing.small,
                bottom = ShcareTheme.spacing.small,
            ),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = onRetry,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.shcare_action_retry))
            }
        }
    }
}

@Composable
private fun ClinicalAlertsInlineError(
    error: ClinicalAlertsError,
    requestId: String,
    onRetry: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            Text(
                text = clinicalAlertsErrorText(error, requestId),
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedButton(
                onClick = onRetry,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.shcare_action_retry))
            }
        }
    }
}

@Composable
private fun ClinicalAlertStatusBadge(status: ClinicalAlertStatus) {
    val colors = when (status) {
        ClinicalAlertStatus.Open ->
            ShcareTheme.colors.warningContainer to ShcareTheme.colors.onWarningContainer
        ClinicalAlertStatus.Acknowledged ->
            ShcareTheme.colors.infoContainer to ShcareTheme.colors.onInfoContainer
        ClinicalAlertStatus.Resolved ->
            ShcareTheme.colors.successContainer to ShcareTheme.colors.onSuccessContainer
    }
    val label = clinicalAlertStatusLabel(status)
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.semantics { stateDescription = label },
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun ClinicalAlertSeverityBadge(severity: String) {
    val colors = clinicalAlertSeverityColors(severity)
    val label = clinicalAlertSeverityLabel(severity)
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.semantics { stateDescription = label },
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun clinicalAlertSeverityColors(
    severity: String,
): Pair<androidx.compose.ui.graphics.Color, androidx.compose.ui.graphics.Color> =
    when (severity.trim().lowercase()) {
        "critical", "high", "urgent", "error" ->
            MaterialTheme.colorScheme.errorContainer to
                MaterialTheme.colorScheme.onErrorContainer
        "warning", "medium" ->
            ShcareTheme.colors.warningContainer to ShcareTheme.colors.onWarningContainer
        "info", "low" ->
            ShcareTheme.colors.infoContainer to ShcareTheme.colors.onInfoContainer
        else ->
            MaterialTheme.colorScheme.surfaceVariant to
                MaterialTheme.colorScheme.onSurfaceVariant
    }

@Composable
private fun clinicalAlertStatusLabel(status: ClinicalAlertStatus): String = when (status) {
    ClinicalAlertStatus.Open -> stringResource(R.string.clinical_alerts_status_open)
    ClinicalAlertStatus.Acknowledged ->
        stringResource(R.string.clinical_alerts_status_acknowledged)
    ClinicalAlertStatus.Resolved -> stringResource(R.string.clinical_alerts_status_resolved)
}

@Composable
private fun clinicalAlertSeverityLabel(severity: String): String =
    when (severity.trim().lowercase()) {
        "critical", "urgent" -> stringResource(R.string.clinical_alerts_severity_critical)
        "high", "error" -> stringResource(R.string.clinical_alerts_severity_high)
        "warning", "medium" -> stringResource(R.string.clinical_alerts_severity_warning)
        "info", "low" -> stringResource(R.string.clinical_alerts_severity_info)
        else -> stringResource(R.string.clinical_alerts_severity_unknown)
    }

@Composable
private fun clinicalAlertFilterLabel(filter: ClinicalAlertFilter): String = when (filter) {
    ClinicalAlertFilter.All -> stringResource(R.string.clinical_alerts_filter_all)
    ClinicalAlertFilter.Open -> stringResource(R.string.clinical_alerts_filter_open)
    ClinicalAlertFilter.Acknowledged ->
        stringResource(R.string.clinical_alerts_filter_acknowledged)
    ClinicalAlertFilter.Resolved -> stringResource(R.string.clinical_alerts_filter_resolved)
}

@Composable
private fun clinicalAlertsErrorText(
    error: ClinicalAlertsError?,
    requestId: String,
): String {
    val message = when (error) {
        ClinicalAlertsError.PermissionDenied ->
            stringResource(R.string.clinical_alerts_error_permission)
        ClinicalAlertsError.Conflict ->
            stringResource(R.string.clinical_alerts_error_conflict)
        ClinicalAlertsError.Offline ->
            stringResource(R.string.clinical_alerts_error_offline)
        ClinicalAlertsError.WorkspaceMismatch ->
            stringResource(R.string.clinical_alerts_error_workspace)
        ClinicalAlertsError.Confirmation ->
            stringResource(R.string.clinical_alerts_error_confirmation)
        ClinicalAlertsError.Unknown, null ->
            stringResource(R.string.clinical_alerts_error_unknown)
    }
    return if (requestId.isBlank()) {
        message
    } else {
        stringResource(R.string.clinical_request_id_message, message, requestId)
    }
}

private val clinicalAlertDateTimeFormatter = DateTimeFormatter.ofPattern(
    "dd/MM/yyyy · HH:mm",
    Locale.forLanguageTag("vi-VN"),
)

private fun formatClinicalAlertDateTime(value: String): String {
    if (value.isBlank()) return "—"
    return runCatching {
        Instant.parse(value)
            .atZone(ZoneId.systemDefault())
            .format(clinicalAlertDateTimeFormatter)
    }.getOrDefault(value)
}
