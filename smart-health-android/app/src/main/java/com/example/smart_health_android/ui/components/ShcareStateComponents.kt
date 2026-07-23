package com.example.smart_health_android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.smart_health_android.R
import com.example.smart_health_android.ui.foundation.ShcareStateAction
import com.example.smart_health_android.ui.foundation.ShcareStateKind
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun ShcareLoadingState(
    modifier: Modifier = Modifier,
    message: String? = null,
) {
    val resolvedMessage = message ?: stringResource(R.string.shcare_state_loading)
    ShcareStatePane(
        kind = ShcareStateKind.Loading,
        title = resolvedMessage,
        message = null,
        modifier = modifier,
        leadingContent = {
            CircularProgressIndicator(
                modifier = Modifier.size(36.dp),
                strokeWidth = 3.dp,
            )
        },
    )
}

@Composable
fun ShcareEmptyState(
    modifier: Modifier = Modifier,
    title: String? = null,
    message: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    ShcareStatePane(
        kind = ShcareStateKind.Empty,
        icon = Icons.Default.Inbox,
        title = title ?: stringResource(R.string.shcare_state_empty_title),
        message = message ?: stringResource(R.string.shcare_state_empty_message),
        actionLabel = actionLabel,
        onAction = onAction,
        modifier = modifier,
    )
}

@Composable
fun ShcareErrorState(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    message: String? = null,
    retryLabel: String? = null,
) {
    ShcareStatePane(
        kind = ShcareStateKind.Error,
        icon = Icons.Default.ErrorOutline,
        title = title ?: stringResource(R.string.shcare_state_error_title),
        message = message ?: stringResource(R.string.shcare_state_error_message),
        actionLabel = retryLabel ?: stringResource(R.string.shcare_action_retry),
        onAction = onRetry,
        modifier = modifier,
    )
}

@Composable
fun ShcareOfflineState(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    message: String? = null,
    retryLabel: String? = null,
) {
    ShcareStatePane(
        kind = ShcareStateKind.Offline,
        icon = Icons.Default.CloudOff,
        title = title ?: stringResource(R.string.shcare_state_offline_title),
        message = message ?: stringResource(R.string.shcare_state_offline_message),
        actionLabel = retryLabel ?: stringResource(R.string.shcare_action_retry),
        onAction = onRetry,
        modifier = modifier,
    )
}

@Composable
fun ShcarePermissionState(
    onRequestPermission: () -> Unit,
    modifier: Modifier = Modifier,
    permissionName: String? = null,
    title: String? = null,
    message: String? = null,
    actionLabel: String? = null,
) {
    val resolvedMessage = message ?: if (permissionName.isNullOrBlank()) {
        stringResource(R.string.shcare_state_permission_message)
    } else {
        stringResource(R.string.shcare_state_permission_message_named, permissionName)
    }
    ShcareStatePane(
        kind = ShcareStateKind.Permission,
        icon = Icons.Default.Security,
        title = title ?: stringResource(R.string.shcare_state_permission_title),
        message = resolvedMessage,
        actionLabel = actionLabel ?: stringResource(R.string.shcare_action_grant_permission),
        onAction = onRequestPermission,
        modifier = modifier,
    )
}

@Composable
fun ShcareRetryButton(
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    tonal: Boolean = false,
) {
    val resolvedLabel = label ?: stringResource(R.string.shcare_action_retry)
    if (tonal) {
        FilledTonalButton(
            onClick = onRetry,
            modifier = modifier.defaultMinSize(minHeight = 48.dp),
        ) {
            RetryButtonContent(resolvedLabel)
        }
    } else {
        Button(
            onClick = onRetry,
            modifier = modifier.defaultMinSize(minHeight = 48.dp),
        ) {
            RetryButtonContent(resolvedLabel)
        }
    }
}

@Composable
private fun RetryButtonContent(label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.Refresh,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Text(text = label, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun ShcareStatePane(
    kind: ShcareStateKind,
    title: String,
    message: String?,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    leadingContent: (@Composable () -> Unit)? = null,
) {
    val spacing = ShcareTheme.spacing
    val semanticColors = ShcareTheme.colors
    val (containerColor, contentColor) = when (kind) {
        ShcareStateKind.Loading -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.primary
        ShcareStateKind.Empty -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        ShcareStateKind.Error -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
        ShcareStateKind.Offline -> semanticColors.offlineContainer to semanticColors.onOfflineContainer
        ShcareStateKind.Permission -> semanticColors.infoContainer to semanticColors.onInfoContainer
    }
    val spokenState = listOfNotNull(title, message).joinToString(". ")
    val liveRegionMode = when (kind) {
        ShcareStateKind.Error, ShcareStateKind.Offline -> LiveRegionMode.Assertive
        else -> LiveRegionMode.Polite
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = spokenState
                liveRegion = liveRegionMode
            }
            .padding(horizontal = spacing.extraLarge, vertical = spacing.doubleExtraLarge),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(containerColor, MaterialTheme.shapes.large),
            contentAlignment = Alignment.Center,
        ) {
            when {
                leadingContent != null -> leadingContent()
                icon != null -> Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = contentColor,
                    modifier = Modifier.size(30.dp),
                )
            }
        }
        Spacer(modifier = Modifier.height(spacing.large))
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        if (!message.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(spacing.small))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        if (!actionLabel.isNullOrBlank() && onAction != null) {
            Spacer(modifier = Modifier.height(spacing.extraLarge))
            when (kind.defaultAction) {
                ShcareStateAction.Retry -> ShcareRetryButton(
                    onRetry = onAction,
                    label = actionLabel,
                    tonal = kind == ShcareStateKind.Offline,
                )
                ShcareStateAction.RequestPermission -> Button(
                    onClick = onAction,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(text = actionLabel, style = MaterialTheme.typography.labelLarge)
                }
                ShcareStateAction.None -> OutlinedButton(
                    onClick = onAction,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(text = actionLabel, style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}
