package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.startup.DefaultSplashBootstrapGateway
import com.example.smart_health_android.startup.SplashLoadState
import com.example.smart_health_android.startup.SplashUiAction
import com.example.smart_health_android.startup.SplashUiEffect
import com.example.smart_health_android.startup.SplashViewModel
import com.example.smart_health_android.startup.SplashViewModelFactory
import com.example.smart_health_android.ui.components.ShcareRetryButton
import com.example.smart_health_android.ui.components.ShcareSignalMark
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun SplashScreen(
    onNavigateToLogin: () -> Unit,
    onAuthenticated: (user: AuthUser, firebaseOwner: FirebaseOwnerBinding) -> Unit,
    onDoctorApprovalPending: (firebaseOwner: FirebaseOwnerBinding) -> Unit,
    onNavigateToVerifyEmail: (
        accountType: String,
        firebaseOwner: FirebaseOwnerBinding,
    ) -> Unit,
) {
    val context = LocalContext.current.applicationContext
    val factory = remember(context) {
        SplashViewModelFactory(DefaultSplashBootstrapGateway(context))
    }
    val splashViewModel: SplashViewModel = viewModel(factory = factory)
    val state by splashViewModel.uiState.collectAsStateWithLifecycle()

    val latestNavigateToLogin by rememberUpdatedState(onNavigateToLogin)
    val latestAuthenticated by rememberUpdatedState(onAuthenticated)
    val latestDoctorApprovalPending by rememberUpdatedState(onDoctorApprovalPending)
    val latestNavigateToVerifyEmail by rememberUpdatedState(onNavigateToVerifyEmail)

    LaunchedEffect(splashViewModel) {
        splashViewModel.effects.collect { effect ->
            when (effect) {
                SplashUiEffect.NavigateToLogin -> latestNavigateToLogin()
                is SplashUiEffect.Authenticated -> {
                    latestAuthenticated(effect.user, effect.firebaseOwner)
                }
                is SplashUiEffect.NavigateToDoctorApprovalPending -> {
                    latestDoctorApprovalPending(effect.firebaseOwner)
                }
                is SplashUiEffect.NavigateToVerifyEmail -> {
                    latestNavigateToVerifyEmail(effect.accountType, effect.firebaseOwner)
                }
            }
        }
    }

    ShcareStartupContent(
        isChecking = state.loadState == SplashLoadState.Checking,
        errorMessage = state.errorMessage.takeIf { state.loadState == SplashLoadState.Error },
        onRetry = { splashViewModel.onAction(SplashUiAction.Retry) },
    )
}

@Composable
fun ShcareStartupContent(
    isChecking: Boolean,
    errorMessage: String?,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    val scrollState = rememberScrollState()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.safeDrawing),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 480.dp)
                .verticalScroll(scrollState)
                .padding(
                    horizontal = spacing.extraLarge,
                    vertical = spacing.doubleExtraLarge,
                ),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Column(
                modifier = Modifier.testTag("splash.brand"),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(spacing.small),
            ) {
                Surface(
                    modifier = Modifier.size(88.dp),
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.primaryContainer,
                    contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        ShcareSignalMark(
                            contentDescription = stringResource(
                                R.string.splash_logo_content_description,
                            ),
                            modifier = Modifier.size(60.dp),
                        )
                    }
                }

                Spacer(modifier = Modifier.height(spacing.small))
                Text(
                    text = stringResource(R.string.splash_brand_name),
                    modifier = Modifier
                        .testTag("splash.brand.heading")
                        .semantics { heading() },
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.splash_brand_endorsement),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = stringResource(R.string.splash_brand_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(modifier = Modifier.height(spacing.doubleExtraLarge))
            if (isChecking || errorMessage.isNullOrBlank()) {
                SplashLoadingStatus()
            } else {
                SplashErrorStatus(
                    message = errorMessage,
                    onRetry = onRetry,
                )
            }
        }
    }
}

@Composable
private fun SplashLoadingStatus() {
    val spacing = ShcareTheme.spacing
    val loadingMessage = stringResource(R.string.splash_loading)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("splash.loading")
            .semantics(mergeDescendants = true) {
                liveRegion = LiveRegionMode.Polite
                stateDescription = loadingMessage
            },
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceVariant,
        contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(spacing.large),
            horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = loadingMessage,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun SplashErrorStatus(
    message: String,
    onRetry: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val title = stringResource(R.string.splash_error_title)
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("splash.error")
            .semantics(mergeDescendants = true) {
                liveRegion = LiveRegionMode.Polite
                stateDescription = "$title. $message"
            },
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Icon(
                imageVector = Icons.Default.ErrorOutline,
                contentDescription = null,
                modifier = Modifier.size(28.dp),
            )
            Text(
                text = title,
                modifier = Modifier
                    .testTag("splash.error.heading")
                    .semantics { heading() },
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            ShcareRetryButton(
                onRetry = onRetry,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("splash.retry"),
            )
        }
    }
}
