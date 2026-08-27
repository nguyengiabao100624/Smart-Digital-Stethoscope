package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.security.LoginAccountMode
import com.example.smart_health_android.security.LoginAction
import com.example.smart_health_android.security.LoginEffect
import com.example.smart_health_android.security.LoginStep
import com.example.smart_health_android.security.LoginUiState
import com.example.smart_health_android.security.LoginViewModel
import com.example.smart_health_android.security.LoginViewModelFactory
import com.example.smart_health_android.ui.theme.ShcareTheme
import com.example.smart_health_android.ui.components.ShcareSignalMark

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (user: AuthUser, firebaseOwner: FirebaseOwnerBinding) -> Unit,
    onDoctorApprovalPending: (firebaseOwner: FirebaseOwnerBinding) -> Unit,
    onNavigateToVerifyEmail: (accountType: String, firebaseOwner: FirebaseOwnerBinding) -> Unit,
    onNavigateToSignUp: () -> Unit,
    onNavigateToForgotPassword: () -> Unit,
) {
    val context = LocalContext.current
    val factory = remember(context) { LoginViewModelFactory(context.applicationContext) }
    val loginViewModel: LoginViewModel = viewModel(factory = factory)
    val state by loginViewModel.uiState.collectAsStateWithLifecycle()
    val motionDuration = ShcareTheme.motion.standardMillis

    LaunchedEffect(loginViewModel) {
        loginViewModel.effects.collect { effect ->
            when (effect) {
                is LoginEffect.Authenticated ->
                    onLoginSuccess(effect.user, effect.firebaseOwner)
                is LoginEffect.DoctorApprovalPending ->
                    onDoctorApprovalPending(effect.firebaseOwner)
                is LoginEffect.VerifyEmail ->
                    onNavigateToVerifyEmail(effect.accountType, effect.firebaseOwner)
            }
        }
    }

    BackHandler(enabled = state.step == LoginStep.TwoFactor && !state.isLoading) {
        loginViewModel.onAction(LoginAction.CancelTwoFactor)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
    ) { contentPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding)
                .navigationBarsPadding()
                .imePadding(),
            contentAlignment = Alignment.Center,
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 480.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    horizontal = ShcareTheme.spacing.extraLarge,
                    vertical = ShcareTheme.spacing.doubleExtraLarge,
                ),
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraLarge),
            ) {
                item {
                    LoginBrandHeader(isTwoFactor = state.step == LoginStep.TwoFactor)
                }
                item {
                    AnimatedContent(
                        targetState = state.step,
                        transitionSpec = {
                            val forward = targetState == LoginStep.TwoFactor
                            val slide = if (forward) {
                                slideIntoContainer(
                                    AnimatedContentTransitionScope.SlideDirection.Left,
                                    tween(motionDuration),
                                )
                            } else {
                                slideIntoContainer(
                                    AnimatedContentTransitionScope.SlideDirection.Right,
                                    tween(motionDuration),
                                )
                            }
                            (slide + fadeIn(tween(motionDuration))) togetherWith
                                fadeOut(tween(motionDuration))
                        },
                        label = "login-step",
                    ) { step ->
                        when (step) {
                            LoginStep.Credentials -> CredentialsStep(
                                state = state,
                                onAction = loginViewModel::onAction,
                                onNavigateToForgotPassword = onNavigateToForgotPassword,
                                onNavigateToSignUp = onNavigateToSignUp,
                            )
                            LoginStep.TwoFactor -> TwoFactorStep(
                                state = state,
                                onAction = loginViewModel::onAction,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LoginBrandHeader(isTwoFactor: Boolean) {
    val spacing = ShcareTheme.spacing
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.small),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Surface(
            shape = MaterialTheme.shapes.large,
            color = if (isTwoFactor) {
                ShcareTheme.colors.successContainer
            } else {
                MaterialTheme.colorScheme.primaryContainer
            },
            contentColor = if (isTwoFactor) {
                ShcareTheme.colors.onSuccessContainer
            } else {
                MaterialTheme.colorScheme.onPrimaryContainer
            },
            modifier = Modifier.size(64.dp),
            shadowElevation = 2.dp,
        ) {
            Box(contentAlignment = Alignment.Center) {
                ShcareSignalMark(
                    contentDescription = stringResource(R.string.splash_logo_content_description),
                    modifier = Modifier.size(42.dp),
                )
            }
        }
        Text(
            text = stringResource(
                if (isTwoFactor) R.string.login_two_factor_title else R.string.login_title,
            ),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = if (isTwoFactor) {
                ShcareTheme.colors.success
            } else {
                MaterialTheme.colorScheme.primary
            },
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Text(
            text = stringResource(
                if (isTwoFactor) R.string.login_two_factor_description else R.string.login_subtitle,
            ),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun CredentialsStep(
    state: LoginUiState,
    onAction: (LoginAction) -> Unit,
    onNavigateToForgotPassword: () -> Unit,
    onNavigateToSignUp: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val focusManager = LocalFocusManager.current
    Column(verticalArrangement = Arrangement.spacedBy(spacing.large)) {
        LoginAccountModeSelector(
            selectedMode = state.mode,
            enabled = !state.isLoading,
            onModeSelected = { onAction(LoginAction.ModeChanged(it)) },
        )

        OutlinedTextField(
            value = state.email,
            onValueChange = { onAction(LoginAction.EmailChanged(it)) },
            label = { Text(stringResource(R.string.login_email_label)) },
            placeholder = { Text(stringResource(R.string.login_email_hint)) },
            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            keyboardActions = KeyboardActions(
                onNext = { focusManager.moveFocus(FocusDirection.Down) },
            ),
            singleLine = true,
            enabled = !state.isLoading,
            shape = MaterialTheme.shapes.medium,
            colors = legacyLoginFieldColors(),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("login.email"),
        )

        OutlinedTextField(
            value = state.password,
            onValueChange = { onAction(LoginAction.PasswordChanged(it)) },
            label = { Text(stringResource(R.string.login_password_label)) },
            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
            trailingIcon = {
                IconButton(
                    onClick = { onAction(LoginAction.TogglePasswordVisibility) },
                    enabled = !state.isLoading,
                ) {
                    Icon(
                        imageVector = if (state.showPassword) {
                            Icons.Default.VisibilityOff
                        } else {
                            Icons.Default.Visibility
                        },
                        contentDescription = stringResource(
                            if (state.showPassword) {
                                R.string.login_hide_password
                            } else {
                                R.string.login_show_password
                            },
                        ),
                    )
                }
            },
            visualTransformation = if (state.showPassword) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    onAction(LoginAction.SubmitCredentials)
                },
            ),
            singleLine = true,
            enabled = !state.isLoading,
            shape = MaterialTheme.shapes.medium,
            colors = legacyLoginFieldColors(),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("login.password"),
        )

        TextButton(
            onClick = onNavigateToForgotPassword,
            enabled = !state.isLoading,
            modifier = Modifier
                .align(Alignment.End)
                .heightIn(min = 48.dp),
        ) {
            Text(stringResource(R.string.login_forgot_password))
        }

        LoginError(message = state.errorMessage)

        Button(
            onClick = { onAction(LoginAction.SubmitCredentials) },
            enabled = !state.isLoading,
            shape = MaterialTheme.shapes.medium,
            elevation = ButtonDefaults.buttonElevation(
                defaultElevation = 3.dp,
                pressedElevation = 1.dp,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp)
                .testTag("login.submit"),
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.size(spacing.small))
                Text(stringResource(R.string.login_submitting))
            } else {
                Text(stringResource(R.string.login_submit))
            }
        }

        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = stringResource(R.string.login_no_account),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(
                onClick = onNavigateToSignUp,
                enabled = !state.isLoading,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.login_sign_up))
            }
        }

        Text(
            text = stringResource(R.string.login_brand_tagline),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun TwoFactorStep(
    state: LoginUiState,
    onAction: (LoginAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val focusManager = LocalFocusManager.current
    Column(verticalArrangement = Arrangement.spacedBy(spacing.large)) {
        if (state.challengeExpiresAt.isNotBlank()) {
            Surface(
                color = ShcareTheme.colors.infoContainer,
                contentColor = ShcareTheme.colors.onInfoContainer,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = stringResource(
                        R.string.login_two_factor_expiry,
                        formatIso(state.challengeExpiresAt, "HH:mm dd/MM/yyyy"),
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(spacing.large),
                )
            }
        }

        OutlinedTextField(
            value = state.otp,
            onValueChange = { onAction(LoginAction.OtpChanged(it)) },
            label = { Text(stringResource(R.string.login_two_factor_code_label)) },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Number,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(
                onDone = {
                    focusManager.clearFocus()
                    onAction(LoginAction.SubmitTwoFactor)
                },
            ),
            singleLine = true,
            enabled = !state.isLoading,
            isError = state.errorMessage.isNotBlank(),
            shape = MaterialTheme.shapes.medium,
            colors = legacyLoginFieldColors(),
            supportingText = {
                Text(stringResource(R.string.login_two_factor_code_support))
            },
            modifier = Modifier.fillMaxWidth(),
        )

        LoginError(message = state.errorMessage)

        Button(
            onClick = { onAction(LoginAction.SubmitTwoFactor) },
            enabled = state.otp.length == 6 && !state.isLoading,
            shape = MaterialTheme.shapes.medium,
            elevation = ButtonDefaults.buttonElevation(
                defaultElevation = 3.dp,
                pressedElevation = 1.dp,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 52.dp),
        ) {
            if (state.isLoading) {
                CircularProgressIndicator(
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.size(spacing.small))
                Text(stringResource(R.string.login_two_factor_verifying))
            } else {
                Text(stringResource(R.string.login_two_factor_submit))
            }
        }

        TextButton(
            onClick = { onAction(LoginAction.CancelTwoFactor) },
            enabled = !state.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp),
        ) {
            Text(stringResource(R.string.login_two_factor_cancel))
        }
    }
}

@Composable
private fun LoginAccountModeSelector(
    selectedMode: LoginAccountMode,
    enabled: Boolean,
    onModeSelected: (LoginAccountMode) -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            LoginAccountMode.entries.forEach { mode ->
                val selected = selectedMode == mode
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp)
                        .testTag("login.mode.${mode.name.lowercase()}")
                        .selectable(
                            selected = selected,
                            enabled = enabled,
                            role = Role.Tab,
                            onClick = { onModeSelected(mode) },
                        ),
                    shape = MaterialTheme.shapes.small,
                    color = if (selected) {
                        MaterialTheme.colorScheme.surface
                    } else {
                        MaterialTheme.colorScheme.surfaceVariant
                    },
                    contentColor = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    shadowElevation = if (selected) 2.dp else 0.dp,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            text = stringResource(
                                if (mode == LoginAccountMode.Doctor) {
                                    R.string.login_doctor_mode
                                } else {
                                    R.string.login_patient_mode
                                },
                            ),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun legacyLoginFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = MaterialTheme.colorScheme.surface,
    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
    disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
    focusedBorderColor = MaterialTheme.colorScheme.primary,
    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
    focusedLeadingIconColor = MaterialTheme.colorScheme.primary,
    unfocusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
)

@Composable
private fun LoginError(message: String) {
    if (message.isBlank()) return
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("login.error")
            .semantics {
                liveRegion = LiveRegionMode.Polite
                stateDescription = message
            },
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(ShcareTheme.spacing.large),
        )
    }
}
