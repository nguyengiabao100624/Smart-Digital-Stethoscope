package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import com.example.smart_health_android.R
import com.example.smart_health_android.security.BiometricLocalUnlockError
import com.example.smart_health_android.security.BiometricLocalUnlockUiAction
import com.example.smart_health_android.security.BiometricLocalUnlockUiState
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
internal fun BiometricLocalUnlockCard(
    state: BiometricLocalUnlockUiState,
    onAction: (BiometricLocalUnlockUiAction) -> Unit,
) {
    if (!state.showSettingsControl) return
    val spacing = ShcareTheme.spacing
    val status = if (state.configured) {
        stringResource(R.string.biometric_local_unlock_enabled)
    } else {
        stringResource(R.string.biometric_local_unlock_disabled)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("security-biometric-local-unlock-card")
            .semantics {
                stateDescription = status
            },
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
                    color = ShcareTheme.colors.infoContainer,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Icon(
                        imageVector = Icons.Default.Fingerprint,
                        contentDescription = null,
                        tint = ShcareTheme.colors.onInfoContainer,
                        modifier = Modifier.padding(spacing.medium),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.biometric_local_unlock_title),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = status,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Text(
                text = stringResource(R.string.biometric_local_unlock_description),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            state.error?.let { error ->
                Text(
                    text = biometricLocalUnlockErrorMessage(error),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier
                        .testTag("security-biometric-local-unlock-error")
                        .semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
            FilledTonalButton(
                onClick = {
                    onAction(
                        if (state.configured) {
                            BiometricLocalUnlockUiAction.DisableRequested
                        } else {
                            BiometricLocalUnlockUiAction.EnableRequested
                        },
                    )
                },
                enabled = !state.promptInFlight,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("security-biometric-local-unlock-action"),
            ) {
                if (state.promptInFlight) {
                    CircularProgressIndicator(
                        modifier = Modifier.padding(end = spacing.small),
                        strokeWidth = 2.dp,
                    )
                }
                Text(
                    text = when {
                        state.promptInFlight ->
                            stringResource(R.string.biometric_local_unlock_busy)
                        state.configured ->
                            stringResource(R.string.biometric_local_unlock_disable)
                        else -> stringResource(R.string.biometric_local_unlock_enable)
                    },
                )
            }
        }
    }
}

@Composable
fun BiometricLocalUnlockGate(
    state: BiometricLocalUnlockUiState,
    onUnlock: () -> Unit,
    onSignOut: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Surface(
        modifier = Modifier
            .fillMaxSize()
            .testTag("biometric-local-unlock-gate"),
        color = MaterialTheme.colorScheme.background,
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
            contentPadding = PaddingValues(spacing.extraLarge),
            verticalArrangement = Arrangement.spacedBy(
                spacing.large,
                alignment = Alignment.CenterVertically,
            ),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Surface(
                    color = ShcareTheme.colors.infoContainer,
                    shape = MaterialTheme.shapes.extraLarge,
                ) {
                    Icon(
                        imageVector = Icons.Default.Lock,
                        contentDescription = null,
                        tint = ShcareTheme.colors.onInfoContainer,
                        modifier = Modifier.padding(spacing.extraLarge),
                    )
                }
            }
            item {
                Text(
                    text = stringResource(R.string.biometric_local_unlock_gate_title),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() },
                )
            }
            item {
                Text(
                    text = stringResource(R.string.biometric_local_unlock_gate_description),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .widthIn(max = 480.dp)
                        .fillMaxWidth(),
                )
            }
            state.error?.let { error ->
                item {
                    Text(
                        text = biometricLocalUnlockErrorMessage(error),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .widthIn(max = 480.dp)
                            .fillMaxWidth()
                            .testTag("biometric-local-unlock-error")
                            .semantics { liveRegion = LiveRegionMode.Assertive },
                    )
                }
            }
            item {
                FilledTonalButton(
                    onClick = onUnlock,
                    enabled = !state.promptInFlight && state.configured,
                    modifier = Modifier
                        .widthIn(max = 480.dp)
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("biometric-local-unlock-retry"),
                ) {
                    if (state.promptInFlight) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(end = spacing.small),
                            strokeWidth = 2.dp,
                        )
                    }
                    Text(
                        if (state.promptInFlight) {
                            stringResource(R.string.biometric_local_unlock_busy)
                        } else {
                            stringResource(R.string.biometric_local_unlock_gate_unlock)
                        },
                    )
                }
            }
            item {
                OutlinedButton(
                    onClick = onSignOut,
                    enabled = !state.terminationRequired,
                    modifier = Modifier
                        .widthIn(max = 480.dp)
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("biometric-local-unlock-sign-out"),
                ) {
                    Text(stringResource(R.string.biometric_local_unlock_gate_sign_out))
                }
            }
        }
    }
}

@Composable
private fun biometricLocalUnlockErrorMessage(error: BiometricLocalUnlockError): String =
    stringResource(
        when (error) {
            BiometricLocalUnlockError.AuthenticationCancelled ->
                R.string.biometric_local_unlock_error_cancelled
            BiometricLocalUnlockError.AuthenticationFailed ->
                R.string.biometric_local_unlock_error_failed
            BiometricLocalUnlockError.KeyInvalidated ->
                R.string.biometric_local_unlock_error_key_invalidated
            BiometricLocalUnlockError.AuthorityChanged ->
                R.string.biometric_local_unlock_error_authority_changed
            BiometricLocalUnlockError.RuntimeUnavailable ->
                R.string.biometric_local_unlock_error_unavailable
            BiometricLocalUnlockError.StorageFailure ->
                R.string.biometric_local_unlock_error_storage
        },
    )
