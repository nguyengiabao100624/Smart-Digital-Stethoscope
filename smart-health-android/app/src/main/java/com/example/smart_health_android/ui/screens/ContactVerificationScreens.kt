package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.R
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.security.EmailVerificationUiAction
import com.example.smart_health_android.security.EmailVerificationUiEffect
import com.example.smart_health_android.security.EmailVerificationViewModel
import com.example.smart_health_android.security.EmailVerificationViewModelFactory
import com.example.smart_health_android.ui.theme.ShcareTheme

private enum class VerificationNoticeKind {
    Info,
    Warning,
    Success,
    Unavailable,
}

@Composable
fun FirebaseVerifyEmailScreen(
    firebaseOwner: FirebaseOwnerBinding,
    onNavigateBack: () -> Unit,
    onVerified: (accountType: String, owner: FirebaseOwnerBinding) -> Unit,
    fallbackAccountType: String = "patient",
    verificationViewModel: EmailVerificationViewModel = viewModel(
        factory = EmailVerificationViewModelFactory(
            context = LocalContext.current,
            fallbackAccountType = fallbackAccountType,
            firebaseOwner = firebaseOwner,
        ),
    ),
) {
    val state by verificationViewModel.uiState.collectAsStateWithLifecycle()
    val busy = state.isChecking || state.isResending
    val initialInfo = stringResource(R.string.email_verification_initial_info)
    val shownEmail = state.email.ifBlank {
        stringResource(R.string.email_verification_email_unavailable)
    }

    LaunchedEffect(verificationViewModel) {
        verificationViewModel.effects.collect { effect ->
            when (effect) {
                EmailVerificationUiEffect.NavigateBack -> onNavigateBack()
                is EmailVerificationUiEffect.Verified ->
                    onVerified(effect.accountType, effect.firebaseOwner)
            }
        }
    }

    BackHandler(enabled = !state.isVerified) {
        verificationViewModel.onAction(EmailVerificationUiAction.BackRequested)
    }

    VerificationScaffold(
        backLabel = stringResource(R.string.email_verification_back),
        onNavigateBack = {
            verificationViewModel.onAction(EmailVerificationUiAction.BackRequested)
        },
        footerShowsConsent = true,
    ) {
        VerificationHeroIcon(icon = Icons.Default.Email)
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = stringResource(R.string.email_verification_title),
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.email_verification_description),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = shownEmail,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(28.dp))

        if (state.isVerified) {
            VerificationSuccess(
                title = stringResource(R.string.email_verification_success_title),
                subtitle = if (
                    state.verifiedAccountType == "doctor" ||
                    state.verifiedAccountType == "solo_doctor"
                ) {
                    stringResource(R.string.email_verification_success_doctor)
                } else {
                    stringResource(R.string.email_verification_success_patient)
                },
            )
        } else {
            VerificationNotice(
                icon = Icons.Default.Security,
                title = stringResource(R.string.email_verification_secure_link_title),
                body = state.infoMessage.ifBlank { initialInfo },
                kind = VerificationNoticeKind.Info,
            )
            VerificationStatusMessages(
                error = state.errorMessage,
                isVerifying = busy,
                loadingText = if (state.isResending) {
                    stringResource(R.string.email_verification_resending)
                } else {
                    stringResource(R.string.email_verification_checking)
                },
            )
            Button(
                onClick = {
                    verificationViewModel.onAction(EmailVerificationUiAction.CheckStatus)
                },
                enabled = !busy,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 52.dp),
            ) {
                Text(
                    text = if (state.isChecking) {
                        stringResource(R.string.email_verification_checking_short)
                    } else {
                        stringResource(R.string.email_verification_confirm_action)
                    },
                )
            }
            Spacer(modifier = Modifier.height(18.dp))
            Text(
                text = stringResource(R.string.email_verification_resend_prompt),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(modifier = Modifier.height(10.dp))
            VerificationResendButton(
                cooldown = state.resendCooldownSeconds,
                label = stringResource(R.string.email_verification_resend_action),
                loadingLabel = stringResource(R.string.email_verification_resending_short),
                enabled = !busy,
                isLoading = state.isResending,
                onClick = {
                    verificationViewModel.onAction(EmailVerificationUiAction.Resend)
                },
            )
            Spacer(modifier = Modifier.height(10.dp))
            TextButton(
                onClick = {
                    verificationViewModel.onAction(EmailVerificationUiAction.BackRequested)
                },
                enabled = !busy,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.email_verification_change_email))
            }
        }
    }
}

@Composable
fun VerifyPhoneSettingsScreen(
    onNavigateBack: () -> Unit,
) {
    VerificationUnavailableScreen(
        icon = Icons.Default.Phone,
        title = stringResource(R.string.phone_verification_unavailable_title),
        message = stringResource(R.string.phone_verification_unavailable_message),
        onNavigateBack = onNavigateBack,
    )
}

@Composable
fun ReVerifyContactScreen(
    verificationType: String,
    onNavigateBack: () -> Unit,
) {
    val isEmail = verificationType.equals("email", ignoreCase = true)
    VerificationUnavailableScreen(
        icon = if (isEmail) Icons.Default.Email else Icons.Default.Phone,
        title = if (isEmail) {
            "Thay đổi email chưa khả dụng"
        } else {
            "Thay đổi số điện thoại chưa khả dụng"
        },
        message = if (isEmail) {
            "Phiên bản hiện tại chưa có quy trình đổi email được máy chủ và hệ thống xác thực " +
                "xác nhận ở cả địa chỉ cũ lẫn mới. Dữ liệu tài khoản chưa bị thay đổi."
        } else {
            "Nhà cung cấp SMS chưa sẵn sàng nên Shcare không gửi mã mẫu và không cập nhật " +
                "số điện thoại trước khi có xác nhận thật."
        },
        onNavigateBack = onNavigateBack,
    )
}

@Composable
private fun VerificationUnavailableScreen(
    icon: ImageVector,
    title: String,
    message: String,
    onNavigateBack: () -> Unit,
) {
    BackHandler(onBack = onNavigateBack)
    VerificationScaffold(
        backLabel = "Quay lại hồ sơ",
        onNavigateBack = onNavigateBack,
    ) {
        VerificationHeroIcon(icon = icon)
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = title,
            color = MaterialTheme.colorScheme.onBackground,
            style = MaterialTheme.typography.headlineMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.contact_verification_unavailable_protection),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(24.dp))
        VerificationNotice(
            icon = Icons.Default.Info,
            title = stringResource(R.string.phone_verification_unchanged_title),
            body = message,
            kind = VerificationNoticeKind.Unavailable,
        )
        Spacer(modifier = Modifier.height(24.dp))
        OutlinedButton(
            onClick = onNavigateBack,
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 52.dp),
        ) {
            Text("Quay lại hồ sơ")
        }
    }
}

@Composable
internal fun VerificationScaffold(
    backLabel: String,
    onNavigateBack: () -> Unit,
    footerShowsConsent: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .navigationBarsPadding()
            .imePadding()
            .padding(horizontal = 24.dp),
    ) {
        VerificationBackButton(
            backLabel = backLabel,
            onNavigateBack = onNavigateBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(top = 24.dp, bottom = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top,
            content = content,
        )
        VerificationFooter(showConsent = footerShowsConsent)
    }
}

@Composable
internal fun VerificationBackButton(
    backLabel: String,
    onNavigateBack: () -> Unit,
) {
    TextButton(
        onClick = onNavigateBack,
        modifier = Modifier
            .statusBarsPadding()
            .defaultMinSize(minHeight = 48.dp)
            .padding(top = 8.dp),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(backLabel)
    }
}

@Composable
internal fun VerificationHeroIcon(icon: ImageVector) {
    Surface(
        modifier = Modifier.size(80.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primaryContainer,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(40.dp),
            )
        }
    }
}

@Composable
internal fun VerificationStatusMessages(
    error: String,
    isVerifying: Boolean,
    loadingText: String,
) {
    if (error.isNotBlank()) {
        Spacer(modifier = Modifier.height(16.dp))
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .semantics { liveRegion = LiveRegionMode.Assertive },
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.errorContainer,
        ) {
            Text(
                text = error,
                color = MaterialTheme.colorScheme.onErrorContainer,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(14.dp),
            )
        }
    }
    if (isVerifying) {
        Spacer(modifier = Modifier.height(16.dp))
        Row(
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = MaterialTheme.colorScheme.primary,
                strokeWidth = 2.dp,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = loadingText,
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
    Spacer(modifier = Modifier.height(16.dp))
}

@Composable
internal fun VerificationResendButton(
    cooldown: Int,
    label: String,
    loadingLabel: String,
    enabled: Boolean,
    isLoading: Boolean,
    onClick: () -> Unit,
) {
    val disabled = cooldown > 0 || !enabled || isLoading
    FilledTonalButton(
        onClick = onClick,
        enabled = !disabled,
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp),
    ) {
        Icon(
            Icons.Default.Refresh,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            when {
                isLoading -> loadingLabel
                cooldown > 0 -> stringResource(
                    R.string.email_verification_resend_after_seconds,
                    cooldown,
                )
                else -> label
            },
        )
    }
}

@Composable
internal fun VerificationSuccess(
    title: String,
    subtitle: String,
) {
    val semanticColors = ShcareTheme.colors
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 28.dp)
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Surface(
            modifier = Modifier.size(80.dp),
            shape = CircleShape,
            color = semanticColors.successContainer,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = semanticColors.onSuccessContainer,
                    modifier = Modifier.size(48.dp),
                )
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = title,
            color = semanticColors.success,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { heading() },
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = subtitle,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun VerificationNotice(
    icon: ImageVector,
    title: String,
    body: String,
    kind: VerificationNoticeKind,
) {
    val semanticColors = ShcareTheme.colors
    val (containerColor, contentColor) = when (kind) {
        VerificationNoticeKind.Info ->
            semanticColors.infoContainer to semanticColors.onInfoContainer

        VerificationNoticeKind.Warning ->
            semanticColors.warningContainer to semanticColors.onWarningContainer

        VerificationNoticeKind.Success ->
            semanticColors.successContainer to semanticColors.onSuccessContainer

        VerificationNoticeKind.Unavailable ->
            semanticColors.offlineContainer to semanticColors.onOfflineContainer
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
        shape = MaterialTheme.shapes.medium,
        color = containerColor,
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(20.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = title,
                    color = contentColor,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = body,
                    color = contentColor,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
internal fun VerificationFooter(showConsent: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, bottom = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        Spacer(modifier = Modifier.height(14.dp))
        if (showConsent) {
            Text(
                text = stringResource(R.string.contact_verification_consent_notice),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(10.dp))
        }
        Text(
            text = stringResource(
                R.string.contact_verification_app_version,
                BuildConfig.VERSION_NAME,
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.contact_verification_security_tagline),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
        )
    }
}
