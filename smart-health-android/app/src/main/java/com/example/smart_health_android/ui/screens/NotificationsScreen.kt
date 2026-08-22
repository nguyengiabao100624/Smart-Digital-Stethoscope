package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.AppNotification
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.notifications.NotificationInboxLoadState
import com.example.smart_health_android.notifications.NotificationInboxMessage
import com.example.smart_health_android.notifications.NotificationInboxUiAction
import com.example.smart_health_android.notifications.NotificationInboxUiEffect
import com.example.smart_health_android.notifications.NotificationInboxUiState
import com.example.smart_health_android.notifications.NotificationInboxViewModel
import com.example.smart_health_android.notifications.NotificationInboxViewModelFactory
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onNavigateBack: () -> Unit,
    expectedUserId: String,
    expectedWorkspaceId: String,
    onOpenWorkspaceSwitcher: () -> Unit = {},
    providedViewModel: NotificationInboxViewModel? = null,
) {
    val notificationViewModel = providedViewModel ?: viewModel(
        key = "notification-inbox:$expectedUserId:$expectedWorkspaceId",
        factory = NotificationInboxViewModelFactory(
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        ),
    )
    val state by notificationViewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val readConfirmed = stringResource(R.string.notification_inbox_read_confirmed)
    val readAllConfirmed =
        stringResource(R.string.notification_inbox_read_all_confirmed)
    val deleteConfirmed =
        stringResource(R.string.notification_inbox_delete_confirmed)
    val backendOperationInProgress = stringResource(
        R.string.notification_inbox_backend_operation_in_progress,
    )

    LaunchedEffect(notificationViewModel) {
        notificationViewModel.effects.collect { effect ->
            snackbarHostState.showSnackbar(
                when (effect) {
                    NotificationInboxUiEffect.ReadConfirmed -> readConfirmed
                    NotificationInboxUiEffect.ReadAllConfirmed -> readAllConfirmed
                    NotificationInboxUiEffect.DeleteConfirmed -> deleteConfirmed
                },
            )
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState)
        },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                ),
                navigationIcon = {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.defaultMinSize(
                            minWidth = 48.dp,
                            minHeight = 48.dp,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(
                                R.string.notification_inbox_back,
                            ),
                        )
                    }
                },
                title = {
                    Column(
                        modifier = Modifier.semantics {
                            heading()
                        },
                    ) {
                        Text(
                            text = stringResource(
                                R.string.notification_inbox_title,
                            ),
                            style = MaterialTheme.typography.titleLarge,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = stringResource(
                                R.string.notification_inbox_unread_count,
                                state.unreadCount,
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            notificationViewModel.onAction(
                                NotificationInboxUiAction.MarkAllRead,
                            )
                        },
                        enabled = state.unreadCount > 0 && !state.isBusy,
                        modifier = Modifier.defaultMinSize(
                            minWidth = 48.dp,
                            minHeight = 48.dp,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Default.MarkEmailRead,
                            contentDescription = stringResource(
                                R.string.notification_inbox_mark_all,
                            ),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            if (state.isRefreshing || state.activeMutation != null) {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics {
                            stateDescription = backendOperationInProgress
                        },
                )
            }
            NotificationInboxContent(
                state = state,
                onAction = notificationViewModel::onAction,
                onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }

    val pendingDelete = state.pendingDeleteId?.let { notificationId ->
        state.notifications.find { it.id == notificationId }
    }
    if (pendingDelete != null) {
        AlertDialog(
            onDismissRequest = {
                notificationViewModel.onAction(
                    NotificationInboxUiAction.DismissDelete,
                )
            },
            icon = {
                Icon(
                    imageVector = Icons.Default.DeleteOutline,
                    contentDescription = null,
                )
            },
            title = {
                Text(
                    text = stringResource(
                        R.string.notification_inbox_delete_confirm_title,
                    ),
                )
            },
            text = {
                Text(
                    text = stringResource(
                        R.string.notification_inbox_delete_confirm_message,
                        pendingDelete.title,
                    ),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        notificationViewModel.onAction(
                            NotificationInboxUiAction.ConfirmDelete,
                        )
                    },
                    enabled = state.activeMutation == null,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(
                        text = stringResource(
                            R.string.notification_inbox_delete_confirm_action,
                        ),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        notificationViewModel.onAction(
                            NotificationInboxUiAction.DismissDelete,
                        )
                    },
                    enabled = state.activeMutation == null,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(
                        text = stringResource(
                            R.string.notification_inbox_delete_cancel,
                        ),
                    )
                }
            },
        )
    }
}

@Composable
private fun NotificationInboxContent(
    state: NotificationInboxUiState,
    onAction: (NotificationInboxUiAction) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier) {
        val contentWidth = when {
            maxWidth >= 840.dp -> 720.dp
            maxWidth >= 600.dp -> 600.dp
            else -> maxWidth
        }
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.TopCenter,
        ) {
            when (state.loadState) {
                NotificationInboxLoadState.Loading -> ShcareLoadingState(
                    modifier = Modifier
                        .widthIn(max = contentWidth)
                        .fillMaxWidth(),
                    message = stringResource(
                        R.string.notification_inbox_loading,
                    ),
                )

                NotificationInboxLoadState.Empty -> ShcareEmptyState(
                    modifier = Modifier
                        .widthIn(max = contentWidth)
                        .fillMaxWidth(),
                    title = stringResource(
                        R.string.notification_inbox_empty_title,
                    ),
                    message = stringResource(
                        R.string.notification_inbox_empty_message,
                    ),
                    actionLabel = stringResource(
                        R.string.notification_inbox_refresh,
                    ),
                    onAction = {
                        onAction(NotificationInboxUiAction.Refresh)
                    },
                )

                NotificationInboxLoadState.Offline -> ShcareOfflineState(
                    modifier = Modifier
                        .widthIn(max = contentWidth)
                        .fillMaxWidth(),
                    title = stringResource(
                        R.string.notification_inbox_offline_title,
                    ),
                    message = stringResource(
                        R.string.notification_inbox_offline_message,
                    ),
                    onRetry = {
                        onAction(NotificationInboxUiAction.Refresh)
                    },
                )

                NotificationInboxLoadState.PermissionDenied ->
                    ShcarePermissionState(
                        modifier = Modifier
                            .widthIn(max = contentWidth)
                            .fillMaxWidth(),
                        title = stringResource(
                            R.string.notification_inbox_permission_title,
                        ),
                        message = stringResource(
                            R.string.notification_inbox_permission_message,
                        ),
                        actionLabel = stringResource(
                            R.string.notification_inbox_open_workspace,
                        ),
                        onRequestPermission = onOpenWorkspaceSwitcher,
                    )

                NotificationInboxLoadState.Error -> ShcareErrorState(
                    modifier = Modifier
                        .widthIn(max = contentWidth)
                        .fillMaxWidth(),
                    title = stringResource(
                        R.string.notification_inbox_error_title,
                    ),
                    message = notificationInboxErrorText(state.errorMessage),
                    onRetry = {
                        onAction(NotificationInboxUiAction.Refresh)
                    },
                )

                NotificationInboxLoadState.Ready -> NotificationInboxList(
                    state = state,
                    onAction = onAction,
                    modifier = Modifier
                        .widthIn(max = contentWidth)
                        .fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun NotificationInboxList(
    state: NotificationInboxUiState,
    onAction: (NotificationInboxUiAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = modifier.testTag("notification-inbox-list"),
        contentPadding = PaddingValues(
            horizontal = spacing.large,
            vertical = spacing.large,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.medium),
    ) {
        if (state.isStale || state.errorMessage != null) {
            item(key = "notification-inbox-stale-state") {
                NotificationInboxStaleState(
                    message = notificationInboxErrorText(state.errorMessage),
                    onRetry = {
                        onAction(NotificationInboxUiAction.Refresh)
                    },
                )
            }
        }
        items(
            items = state.notifications,
            key = AppNotification::id,
        ) { notification ->
            NotificationInboxCard(
                notification = notification,
                isBusy = state.activeMutation
                    ?.endsWith(":${notification.id}") == true,
                onMarkRead = {
                    onAction(
                        NotificationInboxUiAction.MarkRead(notification.id),
                    )
                },
                onDelete = {
                    onAction(
                        NotificationInboxUiAction.RequestDelete(
                            notification.id,
                        ),
                    )
                },
            )
        }
    }
}

@Composable
private fun NotificationInboxStaleState(
    message: String,
    onRetry: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Surface(
        color = ShcareTheme.colors.offlineContainer,
        contentColor = ShcareTheme.colors.onOfflineContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                liveRegion = LiveRegionMode.Polite
                stateDescription = message
            },
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = spacing.large,
                vertical = spacing.medium,
            ),
            horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = onRetry,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(
                    text = stringResource(
                        R.string.notification_inbox_refresh,
                    ),
                )
            }
        }
    }
}

@Composable
private fun NotificationInboxCard(
    notification: AppNotification,
    isBusy: Boolean,
    onMarkRead: () -> Unit,
    onDelete: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val readState = if (notification.read) {
        stringResource(R.string.notification_inbox_status_read)
    } else {
        stringResource(R.string.notification_inbox_status_unread)
    }
    val iconAppearance = notificationIconAppearance(notification.type)

    OutlinedCard(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = false) {
                stateDescription = readState
            },
    ) {
        Row(
            modifier = Modifier.padding(spacing.large),
            horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            verticalAlignment = Alignment.Top,
        ) {
            Surface(
                modifier = Modifier.size(48.dp),
                shape = MaterialTheme.shapes.medium,
                color = iconAppearance.containerColor,
                contentColor = iconAppearance.contentColor,
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = iconAppearance.icon,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(
                        spacing.small,
                    ),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = notification.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.weight(1f),
                    )
                    Surface(
                        color = if (notification.read) {
                            MaterialTheme.colorScheme.surfaceVariant
                        } else {
                            MaterialTheme.colorScheme.primaryContainer
                        },
                        contentColor = if (notification.read) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.onPrimaryContainer
                        },
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Text(
                            text = readState,
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(
                                horizontal = spacing.small,
                                vertical = spacing.extraSmall,
                            ),
                        )
                    }
                }
                Spacer(modifier = Modifier.height(spacing.small))
                Text(
                    text = notification.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(spacing.medium))
                Text(
                    text = formatIso(
                        notification.createdAt,
                        "dd/MM/yyyy HH:mm",
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.height(spacing.medium))
                HorizontalDivider()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isBusy) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp,
                        )
                        Spacer(modifier = Modifier.width(spacing.small))
                    }
                    if (!notification.read) {
                        TextButton(
                            onClick = onMarkRead,
                            enabled = !isBusy,
                            modifier = Modifier.defaultMinSize(
                                minHeight = 48.dp,
                            ),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                            )
                            Spacer(modifier = Modifier.width(spacing.small))
                            Text(
                                text = stringResource(
                                    R.string.notification_inbox_mark_read,
                                ),
                            )
                        }
                    }
                    IconButton(
                        onClick = onDelete,
                        enabled = !isBusy,
                        modifier = Modifier.defaultMinSize(
                            minWidth = 48.dp,
                            minHeight = 48.dp,
                        ),
                    ) {
                        Icon(
                            imageVector = Icons.Default.DeleteOutline,
                            contentDescription = stringResource(
                                R.string.notification_inbox_delete,
                                notification.title,
                            ),
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
    }
}

private data class NotificationIconAppearance(
    val icon: ImageVector,
    val containerColor: Color,
    val contentColor: Color,
)

@Composable
private fun notificationIconAppearance(
    type: String,
): NotificationIconAppearance = when (type.lowercase()) {
    "success" -> NotificationIconAppearance(
        icon = Icons.Default.CheckCircle,
        containerColor = ShcareTheme.colors.successContainer,
        contentColor = ShcareTheme.colors.onSuccessContainer,
    )
    "warning", "doctor_info_requested" -> NotificationIconAppearance(
        icon = Icons.Default.Warning,
        containerColor = ShcareTheme.colors.warningContainer,
        contentColor = ShcareTheme.colors.onWarningContainer,
    )
    "info", "appointment_scheduled" -> NotificationIconAppearance(
        icon = Icons.Default.Info,
        containerColor = ShcareTheme.colors.infoContainer,
        contentColor = ShcareTheme.colors.onInfoContainer,
    )
    else -> NotificationIconAppearance(
        icon = Icons.Default.Notifications,
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
    )
}

@Composable
private fun notificationInboxErrorText(
    message: NotificationInboxMessage?,
): String = stringResource(
    when (message) {
        NotificationInboxMessage.MissingAuthority ->
            R.string.notification_inbox_error_authority
        NotificationInboxMessage.PermissionDenied ->
            R.string.notification_inbox_error_permission
        NotificationInboxMessage.Offline ->
            R.string.notification_inbox_error_offline
        NotificationInboxMessage.ServerError ->
            R.string.notification_inbox_error_server
        NotificationInboxMessage.ConfirmationMissing ->
            R.string.notification_inbox_error_confirmation
        NotificationInboxMessage.UnknownError, null ->
            R.string.notification_inbox_error_unknown
    },
)
