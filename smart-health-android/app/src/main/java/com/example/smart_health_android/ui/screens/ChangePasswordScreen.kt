package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.security.ChangePasswordAuthoritySnapshot
import com.example.smart_health_android.security.ChangePasswordFailure
import com.example.smart_health_android.security.ChangePasswordFieldError
import com.example.smart_health_android.security.ChangePasswordLoadState
import com.example.smart_health_android.security.ChangePasswordUiAction
import com.example.smart_health_android.security.ChangePasswordUiEffect
import com.example.smart_health_android.security.ChangePasswordViewModel
import com.example.smart_health_android.security.ChangePasswordViewModelFactory
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.components.ShcareSettingsHeader
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun ChangePasswordScreen(
    onNavigateBack: () -> Unit,
    onOpenPasswordRecovery: () -> Unit,
    expectedAuthority: ChangePasswordAuthoritySnapshot?,
    currentAuthority: () -> ChangePasswordAuthoritySnapshot?,
    invalidateExpectedAuthority: () -> Unit,
    closeSession: suspend () -> Boolean,
    viewModel: ChangePasswordViewModel = viewModel(
        key = expectedAuthority?.let {
            "change-password-${it.userId}-${it.workspaceId}-${it.authorityEpoch}"
        } ?: "change-password-authority-denied",
        factory = ChangePasswordViewModelFactory(
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
            invalidateExpectedAuthority = invalidateExpectedAuthority,
            closeSession = closeSession,
        ),
    ),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                ChangePasswordUiEffect.NavigateBack -> onNavigateBack()
                ChangePasswordUiEffect.OpenPasswordRecovery -> onOpenPasswordRecovery()
            }
        }
    }

    BackHandler(enabled = state.hasUnsavedChanges || state.isSubmitting) {
        viewModel.onAction(ChangePasswordUiAction.BackRequested)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        ShcareSettingsHeader(
            title = stringResource(R.string.change_password_title),
            onNavigateBack = { viewModel.onAction(ChangePasswordUiAction.BackRequested) },
        )

        if (state.loadState == ChangePasswordLoadState.PermissionDenied) {
            ShcarePermissionState(
                onRequestPermission = onNavigateBack,
                modifier = Modifier.fillMaxSize(),
                title = stringResource(R.string.change_password_permission_title),
                message = stringResource(R.string.change_password_permission_message),
                actionLabel = stringResource(R.string.change_password_permission_action),
            )
            return@Column
        }

        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.TopCenter,
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = 560.dp)
                    .navigationBarsPadding()
                    .imePadding()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item {
                    PasswordSecurityNotice(
                        modifier = Modifier.padding(top = 16.dp),
                    )
                }
                item {
                    PasswordInput(
                        label = stringResource(R.string.change_password_current_label),
                        placeholder = stringResource(R.string.change_password_current_placeholder),
                        value = state.currentPassword,
                        onValueChange = {
                            viewModel.onAction(
                                ChangePasswordUiAction.CurrentPasswordChanged(it),
                            )
                        },
                        visible = state.showCurrentPassword,
                        onToggleVisible = {
                            viewModel.onAction(
                                ChangePasswordUiAction.ToggleCurrentPasswordVisibility,
                            )
                        },
                        error = state.fieldErrors.currentPassword.passwordErrorText(),
                        enabled = !state.isSubmitting,
                        imeAction = ImeAction.Next,
                    )
                }
                item {
                    PasswordInput(
                        label = stringResource(R.string.change_password_new_label),
                        placeholder = stringResource(R.string.change_password_new_placeholder),
                        value = state.newPassword,
                        onValueChange = {
                            viewModel.onAction(
                                ChangePasswordUiAction.NewPasswordChanged(it),
                            )
                        },
                        visible = state.showNewPassword,
                        onToggleVisible = {
                            viewModel.onAction(
                                ChangePasswordUiAction.ToggleNewPasswordVisibility,
                            )
                        },
                        error = state.fieldErrors.newPassword.passwordErrorText(),
                        enabled = !state.isSubmitting,
                        imeAction = ImeAction.Next,
                    )
                }
                item {
                    PasswordInput(
                        label = stringResource(R.string.change_password_confirm_label),
                        placeholder = stringResource(R.string.change_password_confirm_placeholder),
                        value = state.confirmPassword,
                        onValueChange = {
                            viewModel.onAction(
                                ChangePasswordUiAction.ConfirmPasswordChanged(it),
                            )
                        },
                        visible = state.showConfirmPassword,
                        onToggleVisible = {
                            viewModel.onAction(
                                ChangePasswordUiAction.ToggleConfirmPasswordVisibility,
                            )
                        },
                        error = state.fieldErrors.confirmPassword.passwordErrorText(),
                        enabled = !state.isSubmitting,
                        imeAction = ImeAction.Done,
                        onDone = {
                            viewModel.onAction(ChangePasswordUiAction.Submit)
                        },
                    )
                }
                if (
                    state.failure != ChangePasswordFailure.None ||
                    state.errorMessage.isNotBlank()
                ) {
                    item {
                        ChangePasswordErrorBanner(
                            message = when (state.failure) {
                                ChangePasswordFailure.Unconfirmed ->
                                    stringResource(R.string.change_password_unconfirmed)
                                ChangePasswordFailure.Generic ->
                                    state.errorMessage.ifBlank {
                                        stringResource(R.string.change_password_generic_error)
                                    }
                                ChangePasswordFailure.None -> state.errorMessage
                            },
                            requestId = state.requestId,
                            canRetry = state.canRetry,
                            onRetry = {
                                viewModel.onAction(ChangePasswordUiAction.Submit)
                            },
                        )
                    }
                }
                item {
                    Button(
                        onClick = {
                            viewModel.onAction(ChangePasswordUiAction.Submit)
                        },
                        enabled = !state.isSubmitting && !state.completed,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 52.dp),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        if (state.isSubmitting) {
                            CircularProgressIndicator(
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(stringResource(R.string.change_password_submitting))
                        } else {
                            Text(
                                stringResource(R.string.change_password_submit),
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
                item {
                    TextButton(
                        onClick = {
                            viewModel.onAction(
                                ChangePasswordUiAction.ForgotPasswordRequested,
                            )
                        },
                        enabled = !state.isSubmitting,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text(
                            stringResource(R.string.change_password_forgot),
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }
        }
    }

    if (state.showDiscardConfirmation) {
        AlertDialog(
            onDismissRequest = {
                viewModel.onAction(ChangePasswordUiAction.DiscardDismissed)
            },
            title = { Text(stringResource(R.string.change_password_discard_title)) },
            text = { Text(stringResource(R.string.change_password_discard_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.onAction(ChangePasswordUiAction.DiscardConfirmed)
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(stringResource(R.string.change_password_discard_confirm))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        viewModel.onAction(ChangePasswordUiAction.DiscardDismissed)
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(stringResource(R.string.change_password_discard_cancel))
                }
            },
        )
    }
}

@Composable
private fun PasswordSecurityNotice(modifier: Modifier = Modifier) {
    val semanticColors = ShcareTheme.colors
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(semanticColors.infoContainer, RoundedCornerShape(16.dp))
            .border(1.dp, semanticColors.info, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            Icons.Default.Shield,
            contentDescription = null,
            tint = semanticColors.onInfoContainer,
            modifier = Modifier.size(24.dp),
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = stringResource(R.string.change_password_notice_title),
                color = semanticColors.onInfoContainer,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(R.string.change_password_notice_message),
                color = semanticColors.onInfoContainer,
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                text = stringResource(R.string.change_password_sign_in_again),
                color = semanticColors.onInfoContainer,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun PasswordInput(
    label: String,
    placeholder: String,
    value: String,
    onValueChange: (String) -> Unit,
    visible: Boolean,
    onToggleVisible: () -> Unit,
    error: String?,
    enabled: Boolean,
    imeAction: ImeAction,
    onDone: () -> Unit = {},
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled,
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        leadingIcon = {
            Icon(Icons.Default.Lock, contentDescription = null)
        },
        trailingIcon = {
            IconButton(
                onClick = onToggleVisible,
                enabled = enabled,
                modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
            ) {
                Icon(
                    if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                    contentDescription = stringResource(
                        if (visible) {
                            R.string.change_password_hide_secret
                        } else {
                            R.string.change_password_show_secret
                        },
                        label,
                    ),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
        supportingText = error?.let { message ->
            {
                Text(
                    text = message,
                    modifier = Modifier.semantics {
                        liveRegion = LiveRegionMode.Assertive
                    },
                )
            }
        },
        isError = error != null,
        visualTransformation =
            if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Password,
            imeAction = imeAction,
        ),
        keyboardActions = KeyboardActions(
            onDone = { onDone() },
        ),
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
    )
}

@Composable
private fun ChangePasswordFieldError?.passwordErrorText(): String? = when (this) {
    ChangePasswordFieldError.Required ->
        stringResource(R.string.change_password_error_required)
    ChangePasswordFieldError.TooShort ->
        stringResource(R.string.change_password_error_too_short)
    ChangePasswordFieldError.MissingUppercase ->
        stringResource(R.string.change_password_error_uppercase)
    ChangePasswordFieldError.MissingLowercase ->
        stringResource(R.string.change_password_error_lowercase)
    ChangePasswordFieldError.MissingDigit ->
        stringResource(R.string.change_password_error_digit)
    ChangePasswordFieldError.MatchesCurrent ->
        stringResource(R.string.change_password_error_matches_current)
    ChangePasswordFieldError.ConfirmationMismatch ->
        stringResource(R.string.change_password_error_confirmation)
    null -> null
}

@Composable
private fun ChangePasswordErrorBanner(
    message: String,
    requestId: String,
    canRetry: Boolean,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.errorContainer,
                RoundedCornerShape(12.dp),
            )
            .padding(14.dp)
            .semantics { liveRegion = LiveRegionMode.Assertive },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = message,
            color = MaterialTheme.colorScheme.onErrorContainer,
            style = MaterialTheme.typography.bodyMedium,
        )
        if (requestId.isNotBlank()) {
            Text(
                text = stringResource(R.string.change_password_request_id, requestId),
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.labelMedium,
            )
        }
        if (canRetry) {
            TextButton(
                onClick = onRetry,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.change_password_retry))
            }
        }
    }
}
