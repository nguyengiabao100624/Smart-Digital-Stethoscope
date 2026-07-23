package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Launch
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.AuthSession
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.security.AccountSecurityAction
import com.example.smart_health_android.security.AccountSecurityLoadState
import com.example.smart_health_android.security.AccountSecurityUiState
import com.example.smart_health_android.security.AccountSecurityViewModel
import com.example.smart_health_android.security.TwoFactorSetupStep
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacyScreen(
    onNavigateBack: () -> Unit,
    onNavigateToChangePassword: () -> Unit,
    onNavigateToDataAccess: () -> Unit,
    onNavigateToAccessLog: () -> Unit,
    viewModel: AccountSecurityViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val spacing = ShcareTheme.spacing

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.security_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.security_back),
                        )
                    }
                },
            )
        },
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .imePadding(),
    ) { innerPadding ->
        when (state.loadState) {
            AccountSecurityLoadState.Loading -> ShcareLoadingState(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                message = stringResource(R.string.security_loading),
            )

            AccountSecurityLoadState.Error -> ShcareErrorState(
                onRetry = { viewModel.onAction(AccountSecurityAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                title = stringResource(R.string.security_load_error_title),
                message = state.errorMessage.ifBlank {
                    stringResource(R.string.security_load_error_message)
                },
            )

            AccountSecurityLoadState.Offline -> ShcareOfflineState(
                onRetry = { viewModel.onAction(AccountSecurityAction.Retry) },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                title = stringResource(R.string.security_offline_title),
                message = stringResource(R.string.security_offline_message),
            )

            AccountSecurityLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onNavigateBack,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                title = stringResource(R.string.security_permission_title),
                message = stringResource(R.string.security_permission_message),
                actionLabel = stringResource(R.string.security_back),
            )

            AccountSecurityLoadState.Ready,
            AccountSecurityLoadState.Unavailable,
            -> LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentPadding = PaddingValues(
                    start = spacing.large,
                    top = spacing.medium,
                    end = spacing.large,
                    bottom = spacing.tripleExtraLarge,
                ),
                verticalArrangement = Arrangement.spacedBy(spacing.large),
            ) {
                item {
                    Text(
                        text = stringResource(R.string.security_description),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                item {
                    TwoFactorCard(
                        state = state,
                        available = state.loadState == AccountSecurityLoadState.Ready,
                        onAction = viewModel::onAction,
                    )
                }
                item {
                    SecurityNavigationCard(
                        onNavigateToChangePassword = onNavigateToChangePassword,
                        onNavigateToDataAccess = onNavigateToDataAccess,
                        onNavigateToAccessLog = onNavigateToAccessLog,
                    )
                }
                item {
                    Text(
                        text = stringResource(R.string.security_sessions_title),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.semantics { heading() },
                    )
                }
                if (state.sessionsLoading) {
                    item {
                        ShcareLoadingState(message = stringResource(R.string.security_sessions_loading))
                    }
                } else if (state.sessions.isEmpty()) {
                    item {
                        Surface(
                            shape = MaterialTheme.shapes.large,
                            color = MaterialTheme.colorScheme.surfaceVariant,
                        ) {
                            Text(
                                text = stringResource(R.string.security_sessions_empty),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(spacing.large),
                            )
                        }
                    }
                } else {
                    items(state.sessions, key = AuthSession::id) { session ->
                        SessionCard(
                            session = session,
                            revoking = state.revokingSessionId == session.id,
                            onRevoke = {
                                viewModel.onAction(AccountSecurityAction.RevokeSession(session.id))
                            },
                        )
                    }
                }
                if (state.sessionsError.isNotBlank() || state.sessionRevokeUnconfirmed) {
                    item {
                        Text(
                            text = if (state.sessionRevokeUnconfirmed) {
                                stringResource(R.string.security_session_revoke_unconfirmed)
                            } else {
                                state.sessionsError
                            },
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TwoFactorCard(
    state: AccountSecurityUiState,
    available: Boolean,
    onAction: (AccountSecurityAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val semanticColors = ShcareTheme.colors
    val clipboard = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current
    var copyAnnouncement by remember { mutableStateOf("") }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("security-two-factor-card"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    color = if (state.twoFactor.enabled) {
                        semanticColors.successContainer
                    } else {
                        semanticColors.infoContainer
                    },
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Icon(
                        imageVector = Icons.Default.Shield,
                        contentDescription = null,
                        tint = if (state.twoFactor.enabled) {
                            semanticColors.onSuccessContainer
                        } else {
                            semanticColors.onInfoContainer
                        },
                        modifier = Modifier.padding(spacing.medium),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.security_two_factor_title),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = if (state.twoFactor.enabled) {
                            stringResource(R.string.security_two_factor_enabled)
                        } else {
                            stringResource(R.string.security_two_factor_disabled)
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (!available) {
                Surface(
                    color = semanticColors.warningContainer,
                    contentColor = semanticColors.onWarningContainer,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Text(
                        text = stringResource(R.string.security_two_factor_unavailable),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(spacing.medium),
                    )
                }
                return@Column
            }

            if (state.isMutating) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(spacing.small),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Text(
                        text = stringResource(R.string.security_two_factor_saving),
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            when (state.step) {
                TwoFactorSetupStep.Status -> {
                    Text(
                        text = if (state.twoFactor.enabled) {
                            stringResource(R.string.security_two_factor_enabled_description)
                        } else {
                            stringResource(R.string.security_two_factor_disabled_description)
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (state.twoFactor.enabled) {
                        OutlinedButton(
                            onClick = { onAction(AccountSecurityAction.RequestDisable) },
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                        ) {
                            Text(stringResource(R.string.security_two_factor_disable_action))
                        }
                    } else {
                        Button(
                            onClick = { onAction(AccountSecurityAction.StartEnrollment) },
                            enabled = !state.isMutating,
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 48.dp),
                        ) {
                            Icon(Icons.Default.Security, contentDescription = null)
                            Text(
                                text = stringResource(R.string.security_two_factor_start_action),
                                modifier = Modifier.padding(start = spacing.small),
                            )
                        }
                    }
                }

                TwoFactorSetupStep.Verify -> {
                    val enrollment = state.enrollment
                    Text(
                        text = stringResource(R.string.security_two_factor_enrollment_description),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (enrollment != null) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = MaterialTheme.shapes.medium,
                        ) {
                            Text(
                                text = enrollment.manualKey,
                                style = MaterialTheme.typography.titleSmall,
                                fontFamily = FontFamily.Monospace,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(spacing.medium),
                            )
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(spacing.small),
                        ) {
                            TextButton(
                                onClick = {
                                    clipboard.setText(AnnotatedString(enrollment.manualKey))
                                    copyAnnouncement = "copied"
                                },
                                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                            ) {
                                Icon(Icons.Default.ContentCopy, contentDescription = null)
                                Text(stringResource(R.string.security_copy_key))
                            }
                            TextButton(
                                onClick = { uriHandler.openUri(enrollment.otpauthUri) },
                                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                            ) {
                                Icon(Icons.Default.Launch, contentDescription = null)
                                Text(stringResource(R.string.security_open_authenticator))
                            }
                        }
                        if (copyAnnouncement.isNotBlank()) {
                            Text(
                                text = stringResource(R.string.security_copied),
                                style = MaterialTheme.typography.bodySmall,
                                color = semanticColors.success,
                                modifier = Modifier.semantics {
                                    liveRegion = LiveRegionMode.Polite
                                },
                            )
                        }
                        OtpField(
                            value = state.otp,
                            label = stringResource(R.string.security_otp_label),
                            error = state.errorMessage,
                            onValueChange = { onAction(AccountSecurityAction.OtpChanged(it)) },
                        )
                        Text(
                            text = stringResource(
                                R.string.security_enrollment_expires,
                                formatIso(enrollment.expiresAt, "HH:mm dd/MM/yyyy"),
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(spacing.small)) {
                            Button(
                                onClick = { onAction(AccountSecurityAction.VerifyEnrollment) },
                                enabled = state.otp.length == 6 && !state.isMutating,
                                modifier = Modifier
                                    .weight(1f)
                                    .defaultMinSize(minHeight = 48.dp),
                            ) {
                                Text(stringResource(R.string.security_verify_and_enable))
                            }
                            OutlinedButton(
                                onClick = { onAction(AccountSecurityAction.CancelStep) },
                                enabled = !state.isMutating,
                                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                            ) {
                                Text(stringResource(R.string.action_cancel))
                            }
                        }
                    }
                }

                TwoFactorSetupStep.Recovery -> {
                    Text(
                        text = stringResource(R.string.security_recovery_title),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        text = stringResource(R.string.security_recovery_description),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                        state.recoveryCodes.forEach { code ->
                            Surface(
                                color = semanticColors.warningContainer,
                                contentColor = semanticColors.onWarningContainer,
                                shape = MaterialTheme.shapes.small,
                            ) {
                                Text(
                                    text = code,
                                    fontFamily = FontFamily.Monospace,
                                    style = MaterialTheme.typography.labelLarge,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(spacing.medium),
                                )
                            }
                        }
                    }
                    TextButton(
                        onClick = {
                            clipboard.setText(AnnotatedString(state.recoveryCodes.joinToString("\n")))
                            copyAnnouncement = "copied"
                        },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) {
                        Icon(Icons.Default.ContentCopy, contentDescription = null)
                        Text(stringResource(R.string.security_copy_recovery))
                    }
                    Row(verticalAlignment = Alignment.Top) {
                        Checkbox(
                            checked = state.recoveryAcknowledged,
                            onCheckedChange = {
                                onAction(AccountSecurityAction.RecoveryAcknowledged(it))
                            },
                        )
                        Text(
                            text = stringResource(R.string.security_recovery_acknowledge),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = spacing.medium),
                        )
                    }
                    Button(
                        onClick = { onAction(AccountSecurityAction.CompleteRecovery) },
                        enabled = state.recoveryAcknowledged,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text(stringResource(R.string.action_complete))
                    }
                }

                TwoFactorSetupStep.Disable -> {
                    Surface(
                        color = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Text(
                            text = stringResource(R.string.security_disable_warning),
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(spacing.medium),
                        )
                    }
                    OtpField(
                        value = state.otp,
                        label = stringResource(R.string.security_current_otp_label),
                        error = state.errorMessage,
                        onValueChange = { onAction(AccountSecurityAction.OtpChanged(it)) },
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(spacing.small)) {
                        Button(
                            onClick = { onAction(AccountSecurityAction.ConfirmDisable) },
                            enabled = state.otp.length == 6 && !state.isMutating,
                            modifier = Modifier
                                .weight(1f)
                                .defaultMinSize(minHeight = 48.dp),
                        ) {
                            Text(stringResource(R.string.security_confirm_disable))
                        }
                        OutlinedButton(
                            onClick = { onAction(AccountSecurityAction.CancelStep) },
                            enabled = !state.isMutating,
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                        ) {
                            Text(stringResource(R.string.security_keep_enabled))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OtpField(
    value: String,
    label: String,
    error: String,
    onValueChange: (String) -> Unit,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        supportingText = if (error.isNotBlank()) {
            { Text(error) }
        } else {
            null
        },
        isError = error.isNotBlank(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        singleLine = true,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("security-otp-field"),
    )
}

@Composable
private fun SecurityNavigationCard(
    onNavigateToChangePassword: () -> Unit,
    onNavigateToDataAccess: () -> Unit,
    onNavigateToAccessLog: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        SecurityNavigationRow(
            icon = Icons.Default.Lock,
            title = stringResource(R.string.security_change_password),
            onClick = onNavigateToChangePassword,
        )
        HorizontalDivider()
        SecurityNavigationRow(
            icon = Icons.Default.Key,
            title = stringResource(R.string.security_data_access),
            onClick = onNavigateToDataAccess,
        )
        HorizontalDivider()
        SecurityNavigationRow(
            icon = Icons.Default.Logout,
            title = stringResource(R.string.security_access_log),
            onClick = onNavigateToAccessLog,
        )
    }
}

@Composable
private fun SecurityNavigationRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    onClick: () -> Unit,
) {
    FilledTonalButton(
        onClick = onClick,
        shape = MaterialTheme.shapes.extraSmall,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp),
    ) {
        Icon(icon, contentDescription = null)
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = ShcareTheme.spacing.medium),
        )
        Icon(Icons.Default.ChevronRight, contentDescription = null)
    }
}

@Composable
private fun SessionCard(
    session: AuthSession,
    revoking: Boolean,
    onRevoke: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.small),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = session.device.ifBlank {
                            session.userAgent.ifBlank {
                                stringResource(R.string.security_session_unknown_device)
                            }
                        },
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        text = listOfNotNull(
                            session.provider.takeIf(String::isNotBlank),
                            session.ip.takeIf(String::isNotBlank),
                            (session.lastSeenAt.ifBlank { session.createdAt })
                                .takeIf(String::isNotBlank)
                                ?.let { formatIso(it, "HH:mm dd/MM/yyyy") },
                        ).joinToString(" • "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (session.current) {
                    Text(
                        text = stringResource(R.string.security_session_current),
                        style = MaterialTheme.typography.labelMedium,
                        color = ShcareTheme.colors.success,
                    )
                }
            }
            if (!session.current && session.revokedAt.isNullOrBlank()) {
                TextButton(
                    onClick = onRevoke,
                    enabled = !revoking,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    if (revoking) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    }
                    Text(stringResource(R.string.security_session_revoke))
                }
            } else if (!session.revokedAt.isNullOrBlank()) {
                Text(
                    text = stringResource(R.string.security_session_revoked),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}
