package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.account.WorkspaceLoadState
import com.example.smart_health_android.account.WorkspaceSwitcherAction
import com.example.smart_health_android.account.WorkspaceSwitcherEffect
import com.example.smart_health_android.account.WorkspaceSwitcherUiState
import com.example.smart_health_android.account.WorkspaceSwitcherViewModel
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.WorkspaceSummary
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspaceSwitcherScreen(
    onNavigateBack: () -> Unit,
    onWorkspaceConfirmed: (user: AuthUser, workspaceId: String) -> Unit,
    onReauthorizationRequired: () -> Unit,
    workspaceViewModel: WorkspaceSwitcherViewModel = viewModel(),
) {
    val state by workspaceViewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(workspaceViewModel) {
        workspaceViewModel.effects.collect { effect ->
            when (effect) {
                is WorkspaceSwitcherEffect.WorkspaceConfirmed -> {
                    onWorkspaceConfirmed(effect.user, effect.workspaceId)
                }
                is WorkspaceSwitcherEffect.ReauthorizationRequired -> {
                    onReauthorizationRequired()
                }
            }
        }
    }
    BackHandler(enabled = state.switchingWorkspaceId.isNotBlank()) {
        // Keep the previous workspace off-screen until the backend result is reconciled.
    }
    Scaffold(
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.workspace_switcher_title),
                onNavigateBack = onNavigateBack,
                backContentDescription = stringResource(R.string.workspace_switcher_back),
                backEnabled = state.switchingWorkspaceId.isBlank(),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        when (state.loadState) {
            WorkspaceLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.workspace_switcher_loading),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            WorkspaceLoadState.Error -> ShcareErrorState(
                onRetry = { workspaceViewModel.onAction(WorkspaceSwitcherAction.Retry) },
                title = stringResource(R.string.workspace_switcher_error_title),
                message = state.errorMessage.ifBlank {
                    stringResource(R.string.workspace_switcher_error_message)
                },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            WorkspaceLoadState.Offline -> ShcareOfflineState(
                onRetry = { workspaceViewModel.onAction(WorkspaceSwitcherAction.Retry) },
                title = stringResource(R.string.workspace_switcher_offline_title),
                message = stringResource(R.string.workspace_switcher_offline_message),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            WorkspaceLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onNavigateBack,
                title = stringResource(R.string.workspace_switcher_permission_title),
                message = stringResource(R.string.workspace_switcher_permission_message),
                actionLabel = stringResource(R.string.workspace_switcher_back),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            WorkspaceLoadState.Empty -> ShcareEmptyState(
                title = stringResource(R.string.workspace_switcher_empty_title),
                message = stringResource(R.string.workspace_switcher_empty_message),
                actionLabel = stringResource(R.string.shcare_action_retry),
                onAction = { workspaceViewModel.onAction(WorkspaceSwitcherAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            WorkspaceLoadState.Ready -> WorkspaceList(
                state = state,
                onSwitch = { workspaceViewModel.onAction(WorkspaceSwitcherAction.Switch(it)) },
                modifier = Modifier.padding(padding),
            )
        }
    }
}

@Composable
private fun WorkspaceList(
    state: WorkspaceSwitcherUiState,
    onSwitch: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(spacing.large),
        verticalArrangement = Arrangement.spacedBy(spacing.medium),
    ) {
        item {
            Text(
                text = stringResource(R.string.workspace_switcher_description),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (state.confirmationMessage.isNotBlank()) {
            item {
                Surface(
                    color = ShcareTheme.colors.successContainer,
                    contentColor = ShcareTheme.colors.onSuccessContainer,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Polite },
                ) {
                    Text(
                        text = stringResource(
                            R.string.workspace_switcher_confirmed,
                            state.confirmationMessage,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(spacing.large),
                    )
                }
            }
        }
        if (state.errorMessage.isNotBlank()) {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Assertive },
                ) {
                    Text(
                        text = state.errorMessage,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(spacing.large),
                    )
                }
            }
        }
        items(state.workspaces, key = WorkspaceSummary::id) { workspace ->
            WorkspaceCard(
                workspace = workspace,
                active = workspace.id == state.currentWorkspaceId,
                switching = workspace.id == state.switchingWorkspaceId,
                enabled = state.switchingWorkspaceId.isBlank(),
                onClick = { onSwitch(workspace.id) },
            )
        }
    }
}

@Composable
private fun WorkspaceCard(
    workspace: WorkspaceSummary,
    active: Boolean,
    switching: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val stateLabel = when {
        active -> stringResource(R.string.workspace_switcher_active)
        switching -> stringResource(R.string.workspace_switcher_switching)
        else -> stringResource(R.string.workspace_switcher_available)
    }
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (active) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        border = BorderStroke(
            width = 1.dp,
            color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (active) 2.dp else 0.dp),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 112.dp)
            .semantics { stateDescription = stateLabel }
            .clickable(enabled = enabled && !active, onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.size(48.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Business, contentDescription = null)
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = workspace.name.ifBlank { workspace.id },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = stringResource(
                            R.string.workspace_switcher_type_role,
                            workspaceTypeLabel(workspace),
                            workspaceRoleLabel(workspace.role),
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
                when {
                    switching -> CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(24.dp),
                    )
                    active -> Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = stringResource(R.string.workspace_switcher_active),
                        tint = ShcareTheme.colors.success,
                    )
                }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.small),
                modifier = Modifier.fillMaxWidth(),
            ) {
                WorkspaceMetric(
                    icon = Icons.Default.Group,
                    value = workspace.patientCount.toString(),
                    label = stringResource(R.string.workspace_switcher_patients),
                    modifier = Modifier.weight(1f),
                )
                WorkspaceMetric(
                    icon = Icons.Default.Devices,
                    value = "${workspace.deviceOnline}/${workspace.deviceCount}",
                    label = stringResource(R.string.workspace_switcher_online),
                    modifier = Modifier.weight(1f),
                )
                WorkspaceMetric(
                    icon = Icons.Default.MonitorHeart,
                    value = workspace.scanCount.toString(),
                    label = stringResource(R.string.workspace_switcher_scans),
                    modifier = Modifier.weight(1f),
                )
            }

            if (workspace.alertCount > 0) {
                Surface(
                    color = ShcareTheme.colors.warningContainer,
                    contentColor = ShcareTheme.colors.onWarningContainer,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(spacing.small),
                        modifier = Modifier.padding(spacing.medium),
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, modifier = Modifier.size(20.dp))
                        Text(
                            text = stringResource(
                                R.string.workspace_switcher_alerts,
                                workspace.alertCount,
                            ),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkspaceMetric(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    value: String,
    label: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.height(4.dp))
        Text(value, style = MaterialTheme.typography.labelLarge)
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun workspaceTypeLabel(workspace: WorkspaceSummary): String = when (
    workspace.workspaceType.ifBlank { workspace.type }
) {
    "solo_practice", "doctor_private" -> stringResource(R.string.workspace_type_solo)
    "clinic" -> stringResource(R.string.workspace_type_clinic)
    "hospital" -> stringResource(R.string.workspace_type_hospital)
    "personal" -> stringResource(R.string.workspace_type_personal)
    "platform" -> stringResource(R.string.workspace_type_platform)
    else -> stringResource(R.string.workspace_type_healthcare)
}

@Composable
private fun workspaceRoleLabel(role: String): String = when (role) {
    "doctor" -> stringResource(R.string.workspace_role_doctor)
    "workspace_owner" -> stringResource(R.string.workspace_role_owner)
    "workspace_admin", "clinic_manager" -> stringResource(R.string.workspace_role_admin)
    "nurse" -> stringResource(R.string.workspace_role_nurse)
    "technician" -> stringResource(R.string.workspace_role_technician)
    "billing" -> stringResource(R.string.workspace_role_billing)
    "viewer" -> stringResource(R.string.workspace_role_viewer)
    "patient" -> stringResource(R.string.workspace_role_patient)
    else -> role.ifBlank { stringResource(R.string.workspace_role_member) }
}
