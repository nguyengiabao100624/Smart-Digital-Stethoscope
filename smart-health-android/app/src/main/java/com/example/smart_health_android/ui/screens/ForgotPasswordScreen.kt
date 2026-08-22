package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.security.ForgotPasswordError
import com.example.smart_health_android.security.ForgotPasswordUiAction
import com.example.smart_health_android.security.ForgotPasswordUiEffect
import com.example.smart_health_android.security.ForgotPasswordUiState
import com.example.smart_health_android.security.ForgotPasswordViewModel
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun ForgotPasswordScreen(
    onNavigateToLogin: () -> Unit,
    providedViewModel: ForgotPasswordViewModel? = null,
) {
    val forgotPasswordViewModel = providedViewModel ?: viewModel()
    val state by forgotPasswordViewModel.uiState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current

    LaunchedEffect(forgotPasswordViewModel, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            forgotPasswordViewModel.effects.collect { effect ->
                when (effect) {
                    ForgotPasswordUiEffect.NavigateToLogin -> onNavigateToLogin()
                }
            }
        }
    }
    BackHandler {
        forgotPasswordViewModel.onAction(ForgotPasswordUiAction.NavigateToLogin)
    }
    ForgotPasswordContent(
        state = state,
        onAction = forgotPasswordViewModel::onAction,
    )
}

@Composable
internal fun ForgotPasswordContent(
    state: ForgotPasswordUiState,
    onAction: (ForgotPasswordUiAction) -> Unit,
) {
    val focusManager = LocalFocusManager.current
    val spacing = ShcareTheme.spacing
    val navigateToLogin = {
        onAction(ForgotPasswordUiAction.NavigateToLogin)
    }
    val submit = {
        focusManager.clearFocus()
        onAction(ForgotPasswordUiAction.Submit)
    }

    Scaffold(containerColor = MaterialTheme.colorScheme.background) { contentPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .navigationBarsPadding()
                .imePadding(),
            contentAlignment = Alignment.TopCenter,
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = 480.dp),
                contentPadding = PaddingValues(
                    horizontal = spacing.extraLarge,
                    vertical = spacing.large,
                ),
                verticalArrangement = Arrangement.spacedBy(spacing.extraLarge),
            ) {
                item {
                    TextButton(
                        onClick = navigateToLogin,
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.shcare_action_back),
                        )
                        Spacer(modifier = Modifier.width(spacing.small))
                        Text(stringResource(R.string.forgot_password_back))
                    }
                }

                item {
                    Crossfade(
                        targetState = state.sentEmail.isNotBlank(),
                        label = "forgot-password-state",
                    ) { isSent ->
                        if (isSent) {
                            PasswordResetSent(
                                email = state.sentEmail,
                                onNavigateToLogin = navigateToLogin,
                            )
                        } else {
                            PasswordResetRequest(
                                state = state,
                                onEmailChange = {
                                    onAction(ForgotPasswordUiAction.EmailChanged(it))
                                },
                                onSubmit = submit,
                                onNavigateToLogin = navigateToLogin,
                                onMoveFocus = {
                                    focusManager.moveFocus(FocusDirection.Down)
                                },
                            )
                        }
                    }
                }

                item {
                    Text(
                        text = stringResource(R.string.forgot_password_brand_intro),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
    }
}

@Composable
private fun PasswordResetRequest(
    state: ForgotPasswordUiState,
    onEmailChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onNavigateToLogin: () -> Unit,
    onMoveFocus: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.large),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Surface(
            modifier = Modifier.size(64.dp),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.Email,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                )
            }
        }
        Text(
            text = stringResource(R.string.forgot_password_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.forgot_password_description),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        OutlinedTextField(
            value = state.email,
            onValueChange = onEmailChange,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("forgot-password.email"),
            label = { Text(stringResource(R.string.forgot_password_email_label)) },
            placeholder = { Text(stringResource(R.string.forgot_password_email_placeholder)) },
            leadingIcon = {
                Icon(Icons.Default.Email, contentDescription = null)
            },
            shape = RoundedCornerShape(12.dp),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Send,
            ),
            keyboardActions = KeyboardActions(
                onNext = { onMoveFocus() },
                onSend = { onSubmit() },
                onDone = { onSubmit() },
            ),
            singleLine = true,
            enabled = !state.isSubmitting,
            isError = state.emailError != null,
            supportingText = state.emailError?.message()?.let { message ->
                {
                    Text(
                        text = message,
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Assertive
                        },
                    )
                }
            },
        )

        state.requestError?.message()?.let { message ->
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }

        Button(
            onClick = onSubmit,
            enabled = !state.isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .testTag("forgot-password.submit"),
            shape = RoundedCornerShape(12.dp),
        ) {
            if (state.isSubmitting) {
                CircularProgressIndicator(
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(modifier = Modifier.width(spacing.small))
                Text(
                    text = stringResource(R.string.forgot_password_sending),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
            } else {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.Send,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(modifier = Modifier.width(spacing.small))
                Text(
                    text = stringResource(R.string.forgot_password_send),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = stringResource(R.string.forgot_password_remembered),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(
                onClick = onNavigateToLogin,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.forgot_password_login_now))
            }
        }
    }
}

@Composable
private fun PasswordResetSent(
    email: String,
    onNavigateToLogin: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val semanticColors = ShcareTheme.colors
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.large),
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = LiveRegionMode.Polite
            },
    ) {
        Surface(
            modifier = Modifier.size(80.dp),
            shape = CircleShape,
            color = semanticColors.successContainer,
            contentColor = semanticColors.onSuccessContainer,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                )
            }
        }
        Text(
            text = stringResource(R.string.forgot_password_sent_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(R.string.forgot_password_sent_message, email),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Button(
            onClick = onNavigateToLogin,
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp),
        ) {
            Text(stringResource(R.string.forgot_password_back_to_login))
        }
    }
}

@Composable
private fun ForgotPasswordError.message(): String = stringResource(
    when (this) {
        ForgotPasswordError.InvalidEmail -> R.string.forgot_password_error_invalid_email
        ForgotPasswordError.Offline -> R.string.forgot_password_error_offline
        ForgotPasswordError.RateLimited -> R.string.forgot_password_error_rate_limited
        ForgotPasswordError.SessionChanged -> R.string.forgot_password_error_session_changed
        ForgotPasswordError.ServiceUnavailable -> R.string.forgot_password_error_service_unavailable
        ForgotPasswordError.Unconfirmed -> R.string.forgot_password_error_unconfirmed
        ForgotPasswordError.Unknown -> R.string.forgot_password_error_unknown
    },
)
