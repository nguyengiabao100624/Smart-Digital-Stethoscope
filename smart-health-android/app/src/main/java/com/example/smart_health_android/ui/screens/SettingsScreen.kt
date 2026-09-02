package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.settings.SettingsAccountRole
import com.example.smart_health_android.settings.SettingsAuthoritySnapshot
import com.example.smart_health_android.settings.SettingsLogoutCoordinator
import com.example.smart_health_android.settings.SettingsOverviewAccount
import com.example.smart_health_android.settings.SettingsOverviewError
import com.example.smart_health_android.settings.SettingsOverviewLoadState
import com.example.smart_health_android.settings.SettingsOverviewUiAction
import com.example.smart_health_android.settings.SettingsOverviewUiEffect
import com.example.smart_health_android.settings.SettingsOverviewUiState
import com.example.smart_health_android.settings.SettingsOverviewViewModel
import com.example.smart_health_android.settings.SettingsOverviewViewModelFactory
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToWorkspace: () -> Unit,
    onNavigateToFamilyProfiles: () -> Unit,
    onNavigateToPrivacy: () -> Unit,
    onNavigateToStethoscopeSettings: () -> Unit,
    onNavigateToAICalibration: () -> Unit,
    onNavigateToDataStorage: () -> Unit,
    onNavigateToNotificationSettings: () -> Unit,
    expectedAuthority: SettingsAuthoritySnapshot?,
    currentAuthority: () -> SettingsAuthoritySnapshot?,
    invalidateExpectedAuthority: () -> Unit,
    logoutCoordinator: SettingsLogoutCoordinator,
    canManageFamilyProfiles: Boolean,
    canAccessStethoscope: Boolean,
    canViewAiCalibration: Boolean,
    canViewDataStorage: Boolean,
    showBackNavigation: Boolean = true,
    viewModel: SettingsOverviewViewModel =
        viewModel(
            key = expectedAuthority?.let { authority ->
                "settings-${authority.userId}-${authority.workspaceId}-${authority.authorityEpoch}"
            } ?: "settings-authority-denied",
            factory = SettingsOverviewViewModelFactory(
                expectedAuthority = expectedAuthority,
                currentAuthority = currentAuthority,
                invalidateExpectedAuthority = invalidateExpectedAuthority,
                logoutCoordinator = logoutCoordinator,
            ),
        ),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val refreshConfirmedMessage =
        stringResource(R.string.settings_overview_refresh_confirmed)

    LaunchedEffect(viewModel, refreshConfirmedMessage) {
        viewModel.effects.collect { effect ->
            when (effect) {
                SettingsOverviewUiEffect.RefreshConfirmed ->
                    snackbarHostState.showSnackbar(refreshConfirmedMessage)
            }
        }
    }

    SettingsOverviewContent(
        state = state,
        canManageFamilyProfiles = canManageFamilyProfiles,
        canAccessStethoscope = canAccessStethoscope,
        canViewAiCalibration = canViewAiCalibration,
        canViewDataStorage = canViewDataStorage,
        showBackNavigation = showBackNavigation,
        snackbarHostState = snackbarHostState,
        onAction = viewModel::onAction,
        onNavigateBack = onNavigateBack,
        onNavigateToProfile = onNavigateToProfile,
        onNavigateToWorkspace = onNavigateToWorkspace,
        onNavigateToFamilyProfiles = onNavigateToFamilyProfiles,
        onNavigateToPrivacy = onNavigateToPrivacy,
        onNavigateToStethoscopeSettings = onNavigateToStethoscopeSettings,
        onNavigateToAICalibration = onNavigateToAICalibration,
        onNavigateToDataStorage = onNavigateToDataStorage,
        onNavigateToNotificationSettings = onNavigateToNotificationSettings,
    )
}

@Composable
internal fun SettingsOverviewContent(
    state: SettingsOverviewUiState,
    canManageFamilyProfiles: Boolean,
    canAccessStethoscope: Boolean,
    canViewAiCalibration: Boolean,
    canViewDataStorage: Boolean,
    showBackNavigation: Boolean,
    snackbarHostState: SnackbarHostState,
    onAction: (SettingsOverviewUiAction) -> Unit,
    onNavigateBack: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToWorkspace: () -> Unit,
    onNavigateToFamilyProfiles: () -> Unit,
    onNavigateToPrivacy: () -> Unit,
    onNavigateToStethoscopeSettings: () -> Unit,
    onNavigateToAICalibration: () -> Unit,
    onNavigateToDataStorage: () -> Unit,
    onNavigateToNotificationSettings: () -> Unit,
) {
    Scaffold(
        topBar = {
            SettingsOverviewTopBar(
                state = state,
                showBackNavigation = showBackNavigation,
                onNavigateBack = onNavigateBack,
                onRefresh = { onAction(SettingsOverviewUiAction.Refresh) },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding(),
    ) { innerPadding ->
        when (state.loadState) {
            SettingsOverviewLoadState.Loading -> ShcareLoadingState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("settings.state.loading"),
                message = stringResource(R.string.settings_overview_loading),
            )

            SettingsOverviewLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onNavigateBack,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("settings.state.permission"),
                title = stringResource(R.string.settings_overview_permission_title),
                message = settingsOverviewMessageWithRequestId(
                    message = stringResource(R.string.settings_overview_permission_message),
                    requestId = state.requestId,
                ),
                actionLabel = stringResource(R.string.shcare_action_back),
            )

            SettingsOverviewLoadState.Offline -> ShcareOfflineState(
                onRetry = { onAction(SettingsOverviewUiAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("settings.state.offline"),
                title = stringResource(R.string.settings_overview_offline_title),
                message = stringResource(R.string.settings_overview_offline_message),
            )

            SettingsOverviewLoadState.Error -> ShcareErrorState(
                onRetry = { onAction(SettingsOverviewUiAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .testTag("settings.state.error"),
                title = stringResource(R.string.settings_overview_error_title),
                message = settingsOverviewMessageWithRequestId(
                    message = stringResource(R.string.settings_overview_error_message),
                    requestId = state.requestId,
                ),
            )

            SettingsOverviewLoadState.Ready -> SettingsOverviewReadyContent(
                state = state,
                innerPadding = innerPadding,
                canManageFamilyProfiles = canManageFamilyProfiles,
                canAccessStethoscope = canAccessStethoscope,
                canViewAiCalibration = canViewAiCalibration,
                canViewDataStorage = canViewDataStorage,
                onRefresh = { onAction(SettingsOverviewUiAction.Refresh) },
                onNavigateToProfile = onNavigateToProfile,
                onNavigateToWorkspace = onNavigateToWorkspace,
                onNavigateToFamilyProfiles = onNavigateToFamilyProfiles,
                onNavigateToPrivacy = onNavigateToPrivacy,
                onNavigateToStethoscopeSettings = onNavigateToStethoscopeSettings,
                onNavigateToAICalibration = onNavigateToAICalibration,
                onNavigateToDataStorage = onNavigateToDataStorage,
                onNavigateToNotificationSettings = onNavigateToNotificationSettings,
                onLogout = { onAction(SettingsOverviewUiAction.Logout) },
            )
        }
    }
}

@Composable
private fun SettingsOverviewTopBar(
    state: SettingsOverviewUiState,
    showBackNavigation: Boolean,
    onNavigateBack: () -> Unit,
    onRefresh: () -> Unit,
) {
    val semanticColors = ShcareTheme.colors
    val refreshEnabled =
        state.loadState == SettingsOverviewLoadState.Ready &&
            !state.isRefreshing &&
            !state.isLoggingOut
    val refreshStateDescription = when {
        state.loadState == SettingsOverviewLoadState.Loading ->
            stringResource(R.string.settings_overview_loading)
        state.isRefreshing -> stringResource(R.string.settings_overview_refreshing)
        else -> null
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(semanticColors.brandHeaderStart),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .heightIn(min = 56.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (showBackNavigation) {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = stringResource(R.string.shcare_action_back),
                        tint = semanticColors.onBrandHeader,
                    )
                }
            } else {
                Spacer(modifier = Modifier.width(16.dp))
            }
            Text(
                text = stringResource(R.string.settings_overview_title),
                style = MaterialTheme.typography.titleLarge,
                color = semanticColors.onBrandHeader,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .weight(1f)
                    .semantics { heading() },
            )
            IconButton(
                onClick = onRefresh,
                enabled = refreshEnabled,
                modifier = Modifier
                    .testTag("settings.action.refresh")
                    .semantics {
                        refreshStateDescription?.let { stateDescription = it }
                    },
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.settings_overview_refresh),
                    tint = if (refreshEnabled) {
                        semanticColors.onBrandHeader
                    } else {
                        semanticColors.onBrandHeader.copy(alpha = 0.5f)
                    },
                )
            }
        }
        HorizontalDivider(color = semanticColors.brandHeaderEnd)
    }
}

@Composable
private fun SettingsOverviewReadyContent(
    state: SettingsOverviewUiState,
    innerPadding: PaddingValues,
    canManageFamilyProfiles: Boolean,
    canAccessStethoscope: Boolean,
    canViewAiCalibration: Boolean,
    canViewDataStorage: Boolean,
    onRefresh: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToWorkspace: () -> Unit,
    onNavigateToFamilyProfiles: () -> Unit,
    onNavigateToPrivacy: () -> Unit,
    onNavigateToStethoscopeSettings: () -> Unit,
    onNavigateToAICalibration: () -> Unit,
    onNavigateToDataStorage: () -> Unit,
    onNavigateToNotificationSettings: () -> Unit,
    onLogout: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val account = state.account

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .testTag("settings.content"),
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
                val description = stringResource(R.string.settings_overview_refreshing)
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { stateDescription = description },
                )
            }
        }

        if (state.isStale) {
            item {
                SettingsOverviewStaleBanner(
                    error = state.error,
                    onRefresh = onRefresh,
                )
            }
        }

        item {
            SettingsAccountCard(account)
        }

        item {
            SettingsGroup(stringResource(R.string.settings_overview_section_account)) {
                SettingsItem(
                    icon = Icons.Default.Person,
                    title = stringResource(R.string.settings_overview_profile),
                    tint = ShcareTheme.colors.info,
                    testTag = "settings.item.profile",
                    onClick = onNavigateToProfile,
                )
                SettingsDivider()
                SettingsItem(
                    icon = Icons.Default.Business,
                    title = stringResource(R.string.settings_overview_workspace),
                    tint = MaterialTheme.colorScheme.primary,
                    testTag = "settings.item.workspace",
                    onClick = onNavigateToWorkspace,
                )
                if (canManageFamilyProfiles) {
                    SettingsDivider()
                    SettingsItem(
                        icon = Icons.Default.Groups,
                        title = stringResource(R.string.settings_overview_family_profiles),
                        tint = MaterialTheme.colorScheme.secondary,
                        testTag = "settings.item.family",
                        onClick = onNavigateToFamilyProfiles,
                    )
                }
                SettingsDivider()
                SettingsItem(
                    icon = Icons.Default.Lock,
                    title = stringResource(R.string.settings_overview_privacy),
                    tint = ShcareTheme.colors.success,
                    testTag = "settings.item.privacy",
                    onClick = onNavigateToPrivacy,
                )
            }
        }

        if (canAccessStethoscope || canViewAiCalibration || canViewDataStorage) {
            item {
                SettingsGroup(
                    title = stringResource(
                        R.string.settings_overview_section_device_analysis,
                    ),
                    modifier = Modifier.testTag("settings.group.device_analysis"),
                ) {
                    var hasPreviousItem = false
                    if (canAccessStethoscope) {
                        SettingsItem(
                            icon = Icons.Default.Build,
                            title = stringResource(R.string.settings_overview_stethoscope),
                            tint = MaterialTheme.colorScheme.tertiary,
                            testTag = "settings.item.stethoscope",
                            onClick = onNavigateToStethoscopeSettings,
                        )
                        hasPreviousItem = true
                    }
                    if (canViewAiCalibration) {
                        if (hasPreviousItem) SettingsDivider()
                        SettingsItem(
                            icon = Icons.Default.Settings,
                            title = stringResource(
                                R.string.settings_overview_signal_analysis,
                            ),
                            tint = ShcareTheme.colors.warning,
                            testTag = "settings.item.analysis",
                            onClick = onNavigateToAICalibration,
                        )
                        hasPreviousItem = true
                    }
                    if (canViewDataStorage) {
                        if (hasPreviousItem) SettingsDivider()
                        SettingsItem(
                            icon = Icons.Default.Share,
                            title = stringResource(R.string.settings_overview_data_storage),
                            tint = MaterialTheme.colorScheme.primary,
                            testTag = "settings.item.data_storage",
                            onClick = onNavigateToDataStorage,
                        )
                    }
                }
            }
        }

        item {
            SettingsGroup(stringResource(R.string.settings_overview_section_options)) {
                SettingsItem(
                    icon = Icons.Default.Notifications,
                    title = stringResource(R.string.settings_overview_notifications),
                    tint = MaterialTheme.colorScheme.secondary,
                    testTag = "settings.item.notifications",
                    onClick = onNavigateToNotificationSettings,
                )
            }
        }

        item {
            val logoutDescription = if (state.isLoggingOut) {
                stringResource(R.string.settings_overview_logging_out)
            } else {
                stringResource(R.string.settings_overview_logout)
            }
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    disabledContainerColor =
                        MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.7f),
                    disabledContentColor =
                        MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.7f),
                ),
                shape = MaterialTheme.shapes.large,
                border = BorderStroke(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.42f),
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .clickable(
                        enabled = !state.isLoggingOut,
                        role = Role.Button,
                        onClick = onLogout,
                    )
                    .testTag("settings.item.logout"),
            ) {
                Row(
                    modifier = Modifier.padding(
                        horizontal = spacing.large,
                        vertical = spacing.medium,
                    ),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (state.isLoggingOut) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                            contentDescription = null,
                        )
                    }
                    Spacer(modifier = Modifier.width(spacing.small))
                    Text(
                        text = logoutDescription,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsAccountCard(account: SettingsOverviewAccount?) {
    val spacing = ShcareTheme.spacing
    val displayName = account
        ?.displayName
        .orEmpty()
        .ifBlank { stringResource(R.string.settings_overview_account_fallback) }
    val memberId = account
        ?.memberId
        .orEmpty()
        .ifBlank { stringResource(R.string.settings_overview_member_id_unavailable) }
    val role = settingsRoleLabel(account?.role ?: SettingsAccountRole.Unknown)
    val workspaceName = account?.workspaceName.orEmpty()
    val initials = account
        ?.initials
        .orEmpty()
        .ifBlank { stringResource(R.string.settings_overview_initials_fallback) }
    val spokenSummary = if (workspaceName.isBlank()) {
        stringResource(R.string.settings_overview_account_state, displayName, role, memberId)
    } else {
        stringResource(
            R.string.settings_overview_account_workspace_state,
            displayName,
            role,
            memberId,
            workspaceName,
        )
    }

    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
        shape = MaterialTheme.shapes.extraLarge,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("settings.profile")
            .clearAndSetSemantics {
                contentDescription = spokenSummary
                heading()
            },
    ) {
        Row(
            modifier = Modifier.padding(spacing.large),
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
                Text(
                    text = initials,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimary,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(modifier = Modifier.width(spacing.large))
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.extraSmall),
            ) {
                Text(
                    text = displayName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(
                        R.string.settings_overview_role_and_id,
                        role,
                        memberId,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.82f),
                )
                if (workspaceName.isNotBlank()) {
                    Text(
                        text = workspaceName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.74f),
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsOverviewStaleBanner(
    error: SettingsOverviewError?,
    onRefresh: () -> Unit,
) {
    val message = when (error) {
        SettingsOverviewError.Offline ->
            stringResource(R.string.settings_overview_stale_offline)
        else -> stringResource(R.string.settings_overview_stale)
    }
    Card(
        colors = CardDefaults.cardColors(
            containerColor = ShcareTheme.colors.warningContainer,
            contentColor = ShcareTheme.colors.onWarningContainer,
        ),
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.semantics {
                    liveRegion = LiveRegionMode.Polite
                },
            )
            FilledTonalButton(
                onClick = onRefresh,
                modifier = Modifier
                    .align(Alignment.End)
                    .heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.settings_overview_retry_refresh))
            }
        }
    }
}

@Composable
fun SettingsGroup(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
    ) {
        Text(
            text = title,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .padding(horizontal = ShcareTheme.spacing.small)
                .semantics { heading() },
        )
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(
                width = 1.dp,
                color = MaterialTheme.colorScheme.outlineVariant,
            ),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                content()
            }
        }
    }
}

@Composable
private fun SettingsDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(start = 64.dp),
        color = MaterialTheme.colorScheme.outlineVariant,
    )
}

@Composable
private fun SettingsItem(
    icon: ImageVector,
    title: String,
    tint: Color,
    testTag: String,
    onClick: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(
                role = Role.Button,
                onClick = onClick,
            )
            .semantics(mergeDescendants = true) {
                role = Role.Button
            }
            .testTag(testTag)
            .padding(spacing.large),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .background(
                        color = tint.copy(alpha = 0.12f),
                        shape = MaterialTheme.shapes.medium,
                    )
                    .padding(spacing.medium),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(modifier = Modifier.width(spacing.large))
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
            )
        }
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun settingsRoleLabel(role: SettingsAccountRole): String = when (role) {
    SettingsAccountRole.Admin -> stringResource(R.string.settings_overview_role_admin)
    SettingsAccountRole.Doctor -> stringResource(R.string.settings_overview_role_doctor)
    SettingsAccountRole.Nurse -> stringResource(R.string.settings_overview_role_nurse)
    SettingsAccountRole.Technician ->
        stringResource(R.string.settings_overview_role_technician)
    SettingsAccountRole.Billing -> stringResource(R.string.settings_overview_role_billing)
    SettingsAccountRole.Patient -> stringResource(R.string.settings_overview_role_patient)
    SettingsAccountRole.Viewer -> stringResource(R.string.settings_overview_role_viewer)
    SettingsAccountRole.Unknown -> stringResource(R.string.settings_overview_role_unknown)
}

@Composable
private fun settingsOverviewMessageWithRequestId(
    message: String,
    requestId: String,
): String = if (requestId.isBlank()) {
    message
} else {
    stringResource(R.string.settings_overview_request_id_message, message, requestId)
}
