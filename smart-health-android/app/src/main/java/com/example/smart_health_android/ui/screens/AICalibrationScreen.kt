package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.Forum
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SettingsSuggest
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.ai.SignalAnalysisLoadState
import com.example.smart_health_android.ai.SignalAnalysisUiAction
import com.example.smart_health_android.ai.SignalAnalysisUiState
import com.example.smart_health_android.ai.SignalAnalysisViewModel
import com.example.smart_health_android.data.SignalAnalysisStatus
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AICalibrationScreen(
    onNavigateBack: () -> Unit,
    viewModel: SignalAnalysisViewModel = viewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.signal_analysis_title)) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.signal_analysis_back),
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.onAction(SignalAnalysisUiAction.Retry) },
                        enabled = state.loadState != SignalAnalysisLoadState.Loading,
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.signal_analysis_refresh),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        SignalAnalysisBody(
            state = state,
            onRetry = { viewModel.onAction(SignalAnalysisUiAction.Retry) },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        )
    }
}

@Composable
private fun SignalAnalysisBody(
    state: SignalAnalysisUiState,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        when (state.loadState) {
            SignalAnalysisLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.signal_analysis_loading),
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("signal_analysis.loading"),
            )

            SignalAnalysisLoadState.Offline -> SignalAnalysisFailurePane(
                state = state,
                onRetry = onRetry,
                offline = true,
            )

            SignalAnalysisLoadState.PermissionDenied -> SignalAnalysisPermissionPane(
                state = state,
                onRetry = onRetry,
            )

            SignalAnalysisLoadState.Error -> SignalAnalysisFailurePane(
                state = state,
                onRetry = onRetry,
                offline = false,
            )

            SignalAnalysisLoadState.Ready -> {
                val status = state.status
                if (status == null) {
                    SignalAnalysisFailurePane(
                        state = state,
                        onRetry = onRetry,
                        offline = false,
                    )
                } else {
                    SignalAnalysisReadyContent(status)
                }
            }
        }
    }
}

@Composable
private fun SignalAnalysisFailurePane(
    state: SignalAnalysisUiState,
    onRetry: () -> Unit,
    offline: Boolean,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        if (offline) {
            ShcareOfflineState(
                onRetry = onRetry,
                title = stringResource(R.string.signal_analysis_offline_title),
                message = stringResource(R.string.signal_analysis_offline_message),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .testTag("signal_analysis.offline"),
            )
        } else {
            ShcareErrorState(
                onRetry = onRetry,
                title = stringResource(R.string.signal_analysis_error_title),
                message = stringResource(R.string.signal_analysis_error_message),
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .testTag("signal_analysis.error"),
            )
        }
        SignalAnalysisRequestId(state.requestId)
    }
}

@Composable
private fun SignalAnalysisPermissionPane(
    state: SignalAnalysisUiState,
    onRetry: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        ShcarePermissionState(
            onRequestPermission = onRetry,
            title = stringResource(R.string.signal_analysis_permission_title),
            message = stringResource(R.string.signal_analysis_permission_message),
            actionLabel = stringResource(R.string.shcare_action_retry),
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .testTag("signal_analysis.permission"),
        )
        SignalAnalysisRequestId(state.requestId)
    }
}

@Composable
private fun SignalAnalysisRequestId(requestId: String) {
    if (requestId.isBlank()) return
    Text(
        text = stringResource(R.string.signal_analysis_request_id, requestId),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .padding(ShcareTheme.spacing.large),
    )
}

@Composable
private fun SignalAnalysisReadyContent(status: SignalAnalysisStatus) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val useTwoColumns = maxWidth >= 720.dp
        LazyColumn(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .widthIn(max = 960.dp)
                .fillMaxWidth()
                .fillMaxHeight()
                .testTag("signal_analysis.ready"),
            contentPadding = PaddingValues(
                horizontal = if (useTwoColumns) ShcareTheme.spacing.doubleExtraLarge else ShcareTheme.spacing.large,
                vertical = ShcareTheme.spacing.extraLarge,
            ),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraLarge),
        ) {
            item(key = "overview") {
                SignalAnalysisOverview()
            }
            item(key = "status") {
                if (useTwoColumns) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraLarge),
                        verticalAlignment = Alignment.Top,
                    ) {
                        SignalAnalysisConfigurationPanel(
                            status = status,
                            modifier = Modifier.weight(1f),
                        )
                        SignalAnalysisRuntimePanel(
                            status = status,
                            modifier = Modifier.weight(1f),
                        )
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraLarge)) {
                        SignalAnalysisConfigurationPanel(status = status)
                        SignalAnalysisRuntimePanel(status = status)
                    }
                }
            }
            item(key = "read-only") {
                SignalAnalysisReadOnlyNotice()
            }
        }
    }
}

@Composable
private fun SignalAnalysisOverview() {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.extraLarge),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
            verticalAlignment = Alignment.Top,
        ) {
            Surface(
                color = MaterialTheme.colorScheme.secondary,
                contentColor = MaterialTheme.colorScheme.onSecondary,
                shape = MaterialTheme.shapes.medium,
            ) {
                Box(
                    modifier = Modifier.size(48.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.GraphicEq,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
                Text(
                    text = stringResource(R.string.signal_analysis_overview_title),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(R.string.signal_analysis_overview_message),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun SignalAnalysisConfigurationPanel(
    status: SignalAnalysisStatus,
    modifier: Modifier = Modifier,
) {
    val settings = status.settings
    val analysisKind = settings.analysisKind.ifBlank { status.runtime.scanAnalysis.analysisKind }
    val analyzerVersion = settings.analyzerVersion
        .ifBlank { settings.version }
        .ifBlank { status.runtime.scanAnalysis.analyzerVersion }
    val scopeText = if (analysisKind == "signal_quality") {
        stringResource(R.string.signal_analysis_scope_signal_quality)
    } else {
        stringResource(R.string.signal_analysis_scope_unknown)
    }
    val analyzerText = if (analyzerVersion == "signal_quality_rules_v1") {
        stringResource(R.string.signal_analysis_analyzer_rules_v1)
    } else {
        stringResource(R.string.signal_analysis_value_unreported)
    }
    val modeText = if (settings.status == "local_signal_quality_only") {
        stringResource(R.string.signal_analysis_mode_local_rules)
    } else {
        stringResource(R.string.signal_analysis_mode_unknown)
    }

    SignalAnalysisPanel(
        title = stringResource(R.string.signal_analysis_configuration_heading),
        modifier = modifier.testTag("signal_analysis.configuration"),
    ) {
        SignalAnalysisStatusRow(
            icon = Icons.Default.Analytics,
            label = stringResource(R.string.signal_analysis_scope_label),
            value = scopeText,
            iconContainerColor = MaterialTheme.colorScheme.primaryContainer,
            iconContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            testTag = "signal_analysis.row.scope",
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        SignalAnalysisStatusRow(
            icon = Icons.Default.SettingsSuggest,
            label = stringResource(R.string.signal_analysis_analyzer_label),
            value = analyzerText,
            support = analyzerVersion.takeIf { it.isNotBlank() }?.let {
                stringResource(R.string.signal_analysis_technical_id, it)
            }.orEmpty(),
            iconContainerColor = ShcareTheme.colors.infoContainer,
            iconContentColor = ShcareTheme.colors.onInfoContainer,
            testTag = "signal_analysis.row.analyzer",
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        SignalAnalysisStatusRow(
            icon = Icons.Default.GraphicEq,
            label = stringResource(R.string.signal_analysis_mode_label),
            value = modeText,
            iconContainerColor = MaterialTheme.colorScheme.secondaryContainer,
            iconContentColor = MaterialTheme.colorScheme.onSecondaryContainer,
            testTag = "signal_analysis.row.mode",
        )
    }
}

@Composable
private fun SignalAnalysisRuntimePanel(
    status: SignalAnalysisStatus,
    modifier: Modifier = Modifier,
) {
    val settings = status.settings
    val runtime = status.runtime
    val scanAvailable = runtime.scanAnalysis.available
    val clinicalEnabled = settings.clinicalDecisionSupport || runtime.scanAnalysis.clinicalDecisionSupport
    val updateAvailable = settings.updateSupported && runtime.modelUpdate.available

    SignalAnalysisPanel(
        title = stringResource(R.string.signal_analysis_runtime_heading),
        modifier = modifier.testTag("signal_analysis.runtime"),
    ) {
        SignalAnalysisStatusRow(
            icon = Icons.Default.GraphicEq,
            label = stringResource(R.string.signal_analysis_scan_label),
            value = stringResource(
                if (scanAvailable) R.string.signal_analysis_scan_available
                else R.string.signal_analysis_scan_unavailable,
            ),
            iconContainerColor = if (scanAvailable) {
                ShcareTheme.colors.successContainer
            } else {
                ShcareTheme.colors.offlineContainer
            },
            iconContentColor = if (scanAvailable) {
                ShcareTheme.colors.onSuccessContainer
            } else {
                ShcareTheme.colors.onOfflineContainer
            },
            testTag = "signal_analysis.row.scan",
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        SignalAnalysisStatusRow(
            icon = Icons.Default.HealthAndSafety,
            label = stringResource(R.string.signal_analysis_clinical_label),
            value = stringResource(
                if (clinicalEnabled) R.string.signal_analysis_clinical_enabled
                else R.string.signal_analysis_clinical_disabled,
            ),
            iconContainerColor = if (clinicalEnabled) {
                ShcareTheme.colors.successContainer
            } else {
                ShcareTheme.colors.warningContainer
            },
            iconContentColor = if (clinicalEnabled) {
                ShcareTheme.colors.onSuccessContainer
            } else {
                ShcareTheme.colors.onWarningContainer
            },
            testTag = "signal_analysis.row.clinical",
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        SignalAnalysisStatusRow(
            icon = Icons.Default.SystemUpdate,
            label = stringResource(R.string.signal_analysis_update_label),
            value = stringResource(
                if (updateAvailable) R.string.signal_analysis_update_available
                else R.string.signal_analysis_update_unavailable,
            ),
            iconContainerColor = ShcareTheme.colors.warningContainer,
            iconContentColor = ShcareTheme.colors.onWarningContainer,
            testTag = "signal_analysis.row.update",
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        SignalAnalysisStatusRow(
            icon = Icons.Default.Verified,
            label = stringResource(R.string.signal_analysis_accuracy_label),
            value = stringResource(
                if (settings.accuracyMetricsAvailable) R.string.signal_analysis_accuracy_available
                else R.string.signal_analysis_accuracy_unavailable,
            ),
            iconContainerColor = ShcareTheme.colors.infoContainer,
            iconContentColor = ShcareTheme.colors.onInfoContainer,
            testTag = "signal_analysis.row.accuracy",
        )
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        SignalAnalysisStatusRow(
            icon = Icons.Default.Forum,
            label = stringResource(R.string.signal_analysis_chat_label),
            value = stringResource(
                if (runtime.chatProvider.available) R.string.signal_analysis_chat_available
                else R.string.signal_analysis_chat_unavailable,
            ),
            iconContainerColor = if (runtime.chatProvider.available) {
                ShcareTheme.colors.successContainer
            } else {
                ShcareTheme.colors.offlineContainer
            },
            iconContentColor = if (runtime.chatProvider.available) {
                ShcareTheme.colors.onSuccessContainer
            } else {
                ShcareTheme.colors.onOfflineContainer
            },
            testTag = "signal_analysis.row.chat",
        )
    }
}

@Composable
private fun SignalAnalysisPanel(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier
                    .padding(
                        start = ShcareTheme.spacing.large,
                        end = ShcareTheme.spacing.large,
                        top = ShcareTheme.spacing.large,
                        bottom = ShcareTheme.spacing.medium,
                    )
                    .semantics { heading() },
            )
            content()
        }
    }
}

@Composable
private fun ColumnScope.SignalAnalysisStatusRow(
    icon: ImageVector,
    label: String,
    value: String,
    iconContainerColor: Color,
    iconContentColor: Color,
    testTag: String,
    support: String = "",
) {
    val spokenStatus = listOf(label, value, support)
        .filter { it.isNotBlank() }
        .joinToString(". ")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(testTag)
            .semantics(mergeDescendants = true) { stateDescription = spokenStatus }
            .padding(ShcareTheme.spacing.large),
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        verticalAlignment = Alignment.Top,
    ) {
        Surface(
            color = iconContainerColor,
            contentColor = iconContentColor,
            shape = MaterialTheme.shapes.medium,
        ) {
            Box(
                modifier = Modifier.size(40.dp),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (support.isNotBlank()) {
                Text(
                    text = support,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SignalAnalysisReadOnlyNotice() {
    Surface(
        color = ShcareTheme.colors.infoContainer,
        contentColor = ShcareTheme.colors.onInfoContainer,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                modifier = Modifier.size(22.dp),
            )
            Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall)) {
                Text(
                    text = stringResource(R.string.signal_analysis_read_only_title),
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = stringResource(R.string.signal_analysis_read_only_message),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}
