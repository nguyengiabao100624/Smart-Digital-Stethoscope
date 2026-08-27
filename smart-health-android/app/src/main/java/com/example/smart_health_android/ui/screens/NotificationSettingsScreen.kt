package com.example.smart_health_android.ui.screens

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings as AndroidSettings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.AutoGraph
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.smart_health_android.R
import com.example.smart_health_android.notifications.NotificationChannelAvailability
import com.example.smart_health_android.notifications.NotificationCloudPreferences
import com.example.smart_health_android.notifications.NotificationPreferenceField
import com.example.smart_health_android.notifications.NotificationPreferencesSnapshot
import com.example.smart_health_android.notifications.NotificationRuntimeReadiness
import com.example.smart_health_android.notifications.NotificationSettingsLoadState
import com.example.smart_health_android.notifications.NotificationSettingsMessage
import com.example.smart_health_android.notifications.NotificationSettingsUiAction
import com.example.smart_health_android.notifications.NotificationSettingsUiEffect
import com.example.smart_health_android.notifications.NotificationSettingsUiState
import com.example.smart_health_android.notifications.NotificationSettingsViewModel
import com.example.smart_health_android.notifications.NotificationSettingsViewModelFactory
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.components.ShcareSettingsHeader
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun NotificationSettingsScreen(
    onNavigateBack: () -> Unit,
    expectedUserId: String,
    expectedWorkspaceId: String,
    role: String,
    modifier: Modifier = Modifier,
    providedViewModel: NotificationSettingsViewModel? = null,
) {
    val context = LocalContext.current
    val resolvedViewModel = providedViewModel ?: viewModel(
        key = "notification-settings:$expectedUserId:$expectedWorkspaceId",
        factory = NotificationSettingsViewModelFactory(
            context = context,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
            role = role,
        ),
    )
    val state by resolvedViewModel.uiState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val errorMessage = state.errorMessage?.resolveNotificationSettingsMessage()
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        resolvedViewModel.onAction(
            NotificationSettingsUiAction.SystemPermissionResult(granted),
        )
    }

    LaunchedEffect(resolvedViewModel) {
        resolvedViewModel.effects.collect { effect ->
            when (effect) {
                NotificationSettingsUiEffect.RequestSystemPermission -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        resolvedViewModel.onAction(
                            NotificationSettingsUiAction.SystemPermissionResult(true),
                        )
                    }
                }
                NotificationSettingsUiEffect.OpenSystemNotificationSettings -> {
                    context.startActivity(
                        Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(AndroidSettings.EXTRA_APP_PACKAGE, context.packageName),
                    )
                }
            }
        }
    }
    DisposableEffect(lifecycleOwner, resolvedViewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                resolvedViewModel.onAction(
                    NotificationSettingsUiAction.RefreshOnResume,
                )
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .testTag("notification-settings-screen"),
    ) {
        ShcareSettingsHeader(
            title = stringResource(R.string.notification_settings_title),
            onNavigateBack = onNavigateBack,
            actions = {
                IconButton(
                    onClick = {
                        resolvedViewModel.onAction(NotificationSettingsUiAction.Refresh)
                    },
                    enabled = !state.isRefreshing &&
                        state.savingFields.isEmpty(),
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
                            contentDescription = stringResource(
                                R.string.notification_settings_refresh,
                            ),
                        )
                    }
                }
            },
        )

        when (state.loadState) {
            NotificationSettingsLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.notification_settings_loading),
                modifier = Modifier.fillMaxSize(),
            )
            NotificationSettingsLoadState.Empty -> ShcareEmptyState(
                title = stringResource(R.string.notification_settings_empty_title),
                message = stringResource(R.string.notification_settings_empty_message),
                actionLabel = stringResource(R.string.notification_settings_action_reload),
                onAction = {
                    resolvedViewModel.onAction(NotificationSettingsUiAction.Refresh)
                },
                modifier = Modifier.fillMaxSize(),
            )
            NotificationSettingsLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = {
                    resolvedViewModel.onAction(NotificationSettingsUiAction.Refresh)
                },
                title = stringResource(R.string.notification_settings_permission_title),
                message = errorMessage,
                actionLabel = stringResource(R.string.shcare_action_retry),
                modifier = Modifier.fillMaxSize(),
            )
            NotificationSettingsLoadState.Offline -> ShcareOfflineState(
                onRetry = {
                    resolvedViewModel.onAction(NotificationSettingsUiAction.Refresh)
                },
                message = errorMessage,
                modifier = Modifier.fillMaxSize(),
            )
            NotificationSettingsLoadState.Error -> ShcareErrorState(
                onRetry = {
                    resolvedViewModel.onAction(NotificationSettingsUiAction.Refresh)
                },
                message = errorMessage,
                modifier = Modifier.fillMaxSize(),
            )
            NotificationSettingsLoadState.Ready -> NotificationSettingsContent(
                state = state,
                onAction = resolvedViewModel::onAction,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
internal fun NotificationSettingsContent(
    state: NotificationSettingsUiState,
    onAction: (NotificationSettingsUiAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val snapshot = state.snapshot ?: return
    val semanticColors = ShcareTheme.colors
    val mutationInFlight = state.savingFields.isNotEmpty()
    val errorMessage = state.errorMessage?.resolveNotificationSettingsMessage()
    val statusMessage = state.statusMessage?.resolveNotificationSettingsMessage()
    Box(
        modifier = modifier,
        contentAlignment = Alignment.TopCenter,
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 840.dp)
                .navigationBarsPadding()
                .testTag("notification-settings-list"),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (state.isStale && !errorMessage.isNullOrBlank()) {
                item {
                    SettingsStatusBanner(
                        message = stringResource(
                            R.string.notification_settings_stale,
                            errorMessage,
                        ),
                        containerColor = semanticColors.warningContainer,
                        contentColor = semanticColors.onWarningContainer,
                        assertive = true,
                    )
                }
            } else if (!errorMessage.isNullOrBlank()) {
                item {
                    SettingsStatusBanner(
                        message = errorMessage,
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        assertive = true,
                    )
                }
            }
            if (!statusMessage.isNullOrBlank()) {
                item {
                    SettingsStatusBanner(
                        message = statusMessage,
                        containerColor = semanticColors.successContainer,
                        contentColor = semanticColors.onSuccessContainer,
                        assertive = false,
                    )
                }
            }
            item {
                SectionHeading(stringResource(R.string.notification_settings_section_account))
            }
            item {
                PreferenceGroup {
                    CloudPreferenceRow(
                        icon = Icons.Default.NotificationsActive,
                        title = stringResource(R.string.notification_settings_master_title),
                        supporting = stringResource(
                            R.string.notification_settings_master_supporting,
                        ),
                        checked = snapshot.preferences.enabled,
                        saving = NotificationPreferenceField.Enabled in state.savingFields,
                        enabled = !state.isRefreshing &&
                            !mutationInFlight &&
                            NotificationPreferenceField.Enabled !in state.savingFields,
                        onCheckedChange = {
                            onAction(
                                NotificationSettingsUiAction.SetCloudPreference(
                                    NotificationPreferenceField.Enabled,
                                    it,
                                ),
                            )
                        },
                    )
                }
            }
            item {
                SectionHeading(stringResource(R.string.notification_settings_section_channels))
            }
            item {
                BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                    val stackCards = maxWidth < 600.dp || LocalDensity.current.fontScale >= 1.5f
                    NotificationChannelLayout(
                        stackCards = stackCards,
                        snapshot = snapshot,
                        state = state,
                        onRequestPermission = {
                            onAction(NotificationSettingsUiAction.RequestSystemPermission)
                        },
                        onOpenSystemSettings = {
                            onAction(
                                NotificationSettingsUiAction.OpenSystemNotificationSettings,
                            )
                        },
                    )
                }
            }
            item {
                SectionHeading(stringResource(R.string.notification_settings_section_local))
            }
            item {
                SystemNotificationSettingsCard(
                    title = stringResource(
                        R.string.notification_settings_system_controls_title,
                    ),
                    supporting = stringResource(
                        R.string.notification_settings_system_controls_supporting,
                    ),
                    actionLabel = stringResource(
                        R.string.notification_settings_action_open_android,
                    ),
                    enabled = !state.isRefreshing && !mutationInFlight,
                    onOpen = {
                        onAction(NotificationSettingsUiAction.OpenSystemNotificationSettings)
                    },
                )
            }
            item {
                SectionHeading(stringResource(R.string.notification_settings_section_categories))
            }
            item {
                CloudPreferenceList(
                    preferences = snapshot.preferences,
                    savingFields = state.savingFields,
                    accountEnabled = snapshot.preferences.enabled,
                    refreshing = state.isRefreshing,
                    mutationInFlight = mutationInFlight,
                    onPreferenceChange = { field, enabled ->
                        onAction(
                            NotificationSettingsUiAction.SetCloudPreference(field, enabled),
                        )
                    },
                )
            }
            item {
                Surface(
                    color = semanticColors.infoContainer,
                    contentColor = semanticColors.onInfoContainer,
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Text(
                        text = stringResource(R.string.notification_settings_truth_note),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun CloudPreferenceList(
    preferences: NotificationCloudPreferences,
    savingFields: Set<NotificationPreferenceField>,
    accountEnabled: Boolean,
    refreshing: Boolean,
    mutationInFlight: Boolean,
    onPreferenceChange: (NotificationPreferenceField, Boolean) -> Unit,
) {
    val rows = listOf(
        PreferenceRowSpec(
            NotificationPreferenceField.DoctorRequests,
            Icons.Default.PersonAdd,
            R.string.notification_settings_doctor_requests,
            R.string.notification_settings_doctor_requests_supporting,
        ),
        PreferenceRowSpec(
            NotificationPreferenceField.AbnormalResults,
            Icons.Default.WarningAmber,
            R.string.notification_settings_abnormal_results,
            R.string.notification_settings_abnormal_results_supporting,
        ),
        PreferenceRowSpec(
            NotificationPreferenceField.DeviceOffline,
            Icons.Default.Devices,
            R.string.notification_settings_device_offline,
            R.string.notification_settings_device_offline_supporting,
        ),
        PreferenceRowSpec(
            NotificationPreferenceField.Appointments,
            Icons.Default.Event,
            R.string.notification_settings_appointments,
            R.string.notification_settings_appointments_supporting,
        ),
        PreferenceRowSpec(
            NotificationPreferenceField.Messages,
            Icons.AutoMirrored.Filled.Message,
            R.string.notification_settings_messages,
            R.string.notification_settings_messages_supporting,
        ),
        PreferenceRowSpec(
            NotificationPreferenceField.AiUpdates,
            Icons.Default.AutoGraph,
            R.string.notification_settings_ai_updates,
            R.string.notification_settings_ai_updates_supporting,
        ),
        PreferenceRowSpec(
            NotificationPreferenceField.NewLogin,
            Icons.AutoMirrored.Filled.Login,
            R.string.notification_settings_new_login,
            R.string.notification_settings_new_login_supporting,
        ),
    )
    PreferenceGroup {
        rows.forEachIndexed { index, row ->
            CloudPreferenceRow(
                icon = row.icon,
                title = stringResource(row.titleRes),
                supporting = stringResource(row.supportingRes),
                checked = preferences[row.field],
                saving = row.field in savingFields,
                enabled = accountEnabled &&
                    !refreshing &&
                    !mutationInFlight &&
                    row.field !in savingFields,
                onCheckedChange = { onPreferenceChange(row.field, it) },
            )
            if (index < rows.lastIndex) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}

private data class PreferenceRowSpec(
    val field: NotificationPreferenceField,
    val icon: ImageVector,
    @param:StringRes val titleRes: Int,
    @param:StringRes val supportingRes: Int,
)

@Composable
private fun PreferenceGroup(content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        tonalElevation = 1.dp,
        content = {
            Column(content = content)
        },
    )
}

@Composable
private fun NotificationChannelLayout(
    stackCards: Boolean,
    snapshot: NotificationPreferencesSnapshot,
    state: NotificationSettingsUiState,
    onRequestPermission: () -> Unit,
    onOpenSystemSettings: () -> Unit,
) {
    val canRequestPermission = canRequestSystemPermission(
        snapshot,
        state.runtimeReadiness,
    )
    val shouldOpenSystemSettings =
        state.runtimeReadiness.runtimePermissionGranted &&
            (!state.runtimeReadiness.appNotificationsEnabled ||
                !state.runtimeReadiness.channelEnabled)
    val pushActionLabel = when {
        canRequestPermission -> stringResource(R.string.notification_settings_action_grant)
        shouldOpenSystemSettings ->
            stringResource(R.string.notification_settings_action_open_android)
        else -> null
    }
    val pushAction = if (canRequestPermission) onRequestPermission else onOpenSystemSettings
    if (stackCards) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ChannelStatusCard(
                icon = Icons.Default.Inbox,
                title = stringResource(R.string.notification_settings_channel_in_app),
                status = accountChannelStatusText(
                    snapshot.preferences.enabled,
                    snapshot.channels.inApp,
                ),
                ready = snapshot.preferences.enabled && snapshot.channels.inApp.ready,
                modifier = Modifier.fillMaxWidth(),
            )
            ChannelStatusCard(
                icon = Icons.Default.Email,
                title = stringResource(R.string.notification_settings_channel_email),
                status = accountChannelStatusText(
                    snapshot.preferences.enabled,
                    snapshot.channels.email,
                ),
                ready = snapshot.preferences.enabled && snapshot.channels.email.ready,
                modifier = Modifier.fillMaxWidth(),
            )
            ChannelStatusCard(
                icon = Icons.Default.PhoneAndroid,
                title = stringResource(R.string.notification_settings_channel_push),
                status = pushStatusText(snapshot, state.runtimeReadiness),
                ready = state.pushReady,
                actionLabel = pushActionLabel,
                onAction = pushAction,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ChannelStatusCard(
                icon = Icons.Default.Inbox,
                title = stringResource(R.string.notification_settings_channel_in_app),
                status = accountChannelStatusText(
                    snapshot.preferences.enabled,
                    snapshot.channels.inApp,
                ),
                ready = snapshot.preferences.enabled && snapshot.channels.inApp.ready,
                modifier = Modifier.weight(1f),
            )
            ChannelStatusCard(
                icon = Icons.Default.Email,
                title = stringResource(R.string.notification_settings_channel_email),
                status = accountChannelStatusText(
                    snapshot.preferences.enabled,
                    snapshot.channels.email,
                ),
                ready = snapshot.preferences.enabled && snapshot.channels.email.ready,
                modifier = Modifier.weight(1f),
            )
            ChannelStatusCard(
                icon = Icons.Default.PhoneAndroid,
                title = stringResource(R.string.notification_settings_channel_push),
                status = pushStatusText(snapshot, state.runtimeReadiness),
                ready = state.pushReady,
                actionLabel = pushActionLabel,
                onAction = pushAction,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun CloudPreferenceRow(
    icon: ImageVector,
    title: String,
    supporting: String,
    checked: Boolean,
    saving: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    PreferenceToggleRow(
        icon = icon,
        title = title,
        supporting = supporting,
        checked = checked,
        enabled = enabled,
        trailing = {
            if (saving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                Switch(
                    checked = checked,
                    onCheckedChange = null,
                    enabled = enabled,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
        },
        onCheckedChange = onCheckedChange,
    )
}

@Composable
private fun SystemNotificationSettingsCard(
    title: String,
    supporting: String,
    actionLabel: String,
    enabled: Boolean,
    onOpen: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        tonalElevation = 1.dp,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier.size(40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Settings,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                    )
                    Text(
                        text = supporting,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Button(
                onClick = onOpen,
                enabled = enabled,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp),
            ) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
private fun PreferenceToggleRow(
    icon: ImageVector,
    title: String,
    supporting: String,
    checked: Boolean,
    enabled: Boolean,
    trailing: @Composable () -> Unit,
    onCheckedChange: (Boolean) -> Unit,
) {
    val resolvedStateDescription = if (checked) {
        stringResource(R.string.notification_settings_state_on)
    } else {
        stringResource(R.string.notification_settings_state_off)
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 72.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            )
            .semantics(mergeDescendants = true) {
                stateDescription = resolvedStateDescription
            }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(40.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (enabled) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
        Spacer(modifier = Modifier.size(12.dp))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                color = if (enabled) {
                    MaterialTheme.colorScheme.onSurface
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            Text(
                text = supporting,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.size(12.dp))
        Box(
            modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
            contentAlignment = Alignment.Center,
        ) {
            trailing()
        }
    }
}

@Composable
private fun ChannelStatusCard(
    icon: ImageVector,
    title: String,
    status: String,
    ready: Boolean,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val semanticColors = ShcareTheme.colors
    val containerColor = if (ready) {
        semanticColors.successContainer
    } else {
        MaterialTheme.colorScheme.surfaceContainerLow
    }
    val contentColor = if (ready) {
        semanticColors.onSuccessContainer
    } else {
        MaterialTheme.colorScheme.onSurface
    }
    Surface(
        modifier = modifier
            .defaultMinSize(minHeight = 136.dp)
            .semantics(mergeDescendants = true) {
                stateDescription = "$title. $status"
            },
        shape = RoundedCornerShape(16.dp),
        color = containerColor,
        contentColor = contentColor,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(imageVector = icon, contentDescription = null)
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = status,
                style = MaterialTheme.typography.bodySmall,
            )
            if (!actionLabel.isNullOrBlank() && onAction != null) {
                Button(
                    onClick = onAction,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(actionLabel)
                }
            }
        }
    }
}

@Composable
private fun SectionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun SettingsStatusBanner(
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
            stateDescription = message
        },
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp),
        )
    }
}

@Composable
private fun channelStatusText(channel: NotificationChannelAvailability): String {
    return when {
        channel.ready ->
            stringResource(R.string.notification_settings_channel_ready)
        channel.status == "disabled" ->
            stringResource(R.string.notification_settings_channel_disabled)
        channel.status == "unavailable" ->
            stringResource(R.string.notification_settings_channel_unavailable)
        else ->
            stringResource(R.string.notification_settings_channel_unknown)
    }
}

@Composable
private fun accountChannelStatusText(
    accountEnabled: Boolean,
    channel: NotificationChannelAvailability,
): String {
    return if (accountEnabled) {
        channelStatusText(channel)
    } else {
        stringResource(R.string.notification_settings_account_disabled)
    }
}

@Composable
private fun pushStatusText(
    snapshot: NotificationPreferencesSnapshot,
    runtime: NotificationRuntimeReadiness,
): String {
    return when {
        !snapshot.preferences.enabled ->
            stringResource(R.string.notification_settings_account_disabled)
        !snapshot.channels.push.ready -> channelStatusText(snapshot.channels.push)
        !runtime.firebaseConfigured ->
            stringResource(R.string.notification_settings_firebase_unconfigured)
        !runtime.encryptedSessionMatches ->
            stringResource(R.string.notification_settings_session_unbound)
        !runtime.runtimePermissionGranted ->
            stringResource(R.string.notification_settings_android_permission_missing)
        !runtime.appNotificationsEnabled ->
            stringResource(R.string.notification_settings_android_app_disabled)
        !runtime.channelEnabled ->
            stringResource(R.string.notification_settings_android_channel_disabled)
        else -> stringResource(R.string.notification_settings_push_ready)
    }
}

@Composable
private fun NotificationSettingsMessage.resolveNotificationSettingsMessage(): String {
    val resource = when (this) {
        NotificationSettingsMessage.Refreshed ->
            R.string.notification_settings_refreshed
        NotificationSettingsMessage.CloudPreferenceSaved ->
            R.string.notification_settings_cloud_saved
        NotificationSettingsMessage.SystemPermissionGranted ->
            R.string.notification_settings_permission_granted
        NotificationSettingsMessage.SystemPermissionDenied ->
            R.string.notification_settings_permission_denied
        NotificationSettingsMessage.MissingAuthority ->
            R.string.notification_settings_error_authority
        NotificationSettingsMessage.PermissionDenied ->
            R.string.notification_settings_error_permission
        NotificationSettingsMessage.ServerError ->
            R.string.notification_settings_error_server
        NotificationSettingsMessage.ConfirmationMissing ->
            R.string.notification_settings_error_confirmation
        NotificationSettingsMessage.Offline ->
            R.string.notification_settings_error_offline
        NotificationSettingsMessage.UnknownError ->
            R.string.notification_settings_error_unknown
    }
    return stringResource(resource)
}

private fun canRequestSystemPermission(
    snapshot: NotificationPreferencesSnapshot,
    runtime: NotificationRuntimeReadiness,
): Boolean {
    return snapshot.preferences.enabled &&
        snapshot.channels.push.ready &&
        runtime.firebaseConfigured &&
        runtime.encryptedSessionMatches &&
        !runtime.runtimePermissionGranted
}
