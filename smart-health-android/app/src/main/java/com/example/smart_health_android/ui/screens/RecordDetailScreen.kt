package com.example.smart_health_android.ui.screens

import android.content.ClipData
import android.content.Context
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ScanWaveform
import com.example.smart_health_android.data.scanIsNormal
import com.example.smart_health_android.data.scanLabel
import com.example.smart_health_android.data.scanSummary
import com.example.smart_health_android.records.RecordAudioArtifact
import com.example.smart_health_android.records.RecordAudioOperation
import com.example.smart_health_android.records.RecordAudioPlayerController
import com.example.smart_health_android.records.RecordDetailLoadState
import com.example.smart_health_android.records.RecordDetailUiAction
import com.example.smart_health_android.records.RecordDetailUiEffect
import com.example.smart_health_android.records.RecordDetailUiState
import com.example.smart_health_android.records.RecordDetailViewModel
import com.example.smart_health_android.records.RecordDetailViewModelFactory
import com.example.smart_health_android.records.RecordPlaybackState
import com.example.smart_health_android.records.RecordPlaybackStatus
import com.example.smart_health_android.records.RecordWaveformLoadState
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.components.ShcareSettingsHeader
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun RecordDetailScreen(
    recordId: String,
    canManageScan: Boolean,
    onNavigateBack: () -> Unit,
) {
    val context = LocalContext.current
    val factory = remember(context, recordId, canManageScan) {
        RecordDetailViewModelFactory(
            context = context.applicationContext,
            recordId = recordId,
            canManageScan = canManageScan,
        )
    }
    val recordViewModel: RecordDetailViewModel = viewModel(
        key = "record-detail:$recordId:$canManageScan",
        factory = factory,
    )
    val state by recordViewModel.uiState.collectAsStateWithLifecycle()
    val lifecycleOwner = LocalLifecycleOwner.current
    val audioController = remember(context) {
        RecordAudioPlayerController(context.applicationContext)
    }
    val playbackState by audioController.state.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()
    var pendingSaveArtifact by remember { mutableStateOf<RecordAudioArtifact?>(null) }
    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("audio/wav"),
    ) { destination ->
        val artifact = pendingSaveArtifact
        pendingSaveArtifact = null
        if (artifact == null) return@rememberLauncherForActivityResult
        if (destination == null) {
            artifact.download.file.delete()
            recordViewModel.onAction(RecordDetailUiAction.SaveAudioCancelled)
            return@rememberLauncherForActivityResult
        }
        coroutineScope.launch {
            val saved = withContext(Dispatchers.IO) {
                runCatching {
                    context.contentResolver.openOutputStream(destination, "w")
                        ?.use { output ->
                            artifact.download.file.inputStream().use { input ->
                                input.copyTo(output)
                            }
                        }
                        ?: error("Cannot open selected destination")
                }.isSuccess
            }
            artifact.download.file.delete()
            recordViewModel.onAction(
                RecordDetailUiAction.SaveAudioFinished(saved),
            )
        }
    }

    DisposableEffect(lifecycleOwner, audioController) {
        lifecycleOwner.lifecycle.addObserver(audioController)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(audioController)
            audioController.release()
        }
    }

    LaunchedEffect(audioController, playbackState.status) {
        while (playbackState.status == RecordPlaybackStatus.Playing) {
            delay(250)
            audioController.refreshPosition()
        }
    }

    LaunchedEffect(recordViewModel, audioController, context) {
        recordViewModel.effects.collect { effect ->
            when (effect) {
                is RecordDetailUiEffect.PlayAudio -> {
                    audioController.prepare(effect.source)
                }
                is RecordDetailUiEffect.ShareAudio -> {
                    if (!openRecordSharesheet(context, effect.artifact)) {
                        recordViewModel.onAction(RecordDetailUiAction.ShareLaunchFailed)
                    }
                }
                is RecordDetailUiEffect.ChooseSaveDestination -> {
                    pendingSaveArtifact = effect.artifact
                    saveLauncher.launch(effect.artifact.displayName)
                }
            }
        }
    }

    RecordDetailContent(
        state = state,
        playbackState = playbackState,
        onNavigateBack = onNavigateBack,
        onAction = recordViewModel::onAction,
        onTogglePlayback = audioController::togglePlayback,
        onSeekBy = audioController::seekBy,
    )
}

@Composable
internal fun RecordDetailContent(
    state: RecordDetailUiState,
    playbackState: RecordPlaybackState,
    onNavigateBack: () -> Unit,
    onAction: (RecordDetailUiAction) -> Unit,
    onTogglePlayback: () -> Unit,
    onSeekBy: (Int) -> Unit,
) {
    val screenStateDescription = when (state.loadState) {
        RecordDetailLoadState.Loading -> stringResource(R.string.record_detail_loading)
        RecordDetailLoadState.Ready -> stringResource(R.string.record_detail_state_ready)
        RecordDetailLoadState.NotFound -> stringResource(R.string.record_detail_not_found_title)
        RecordDetailLoadState.PermissionDenied -> stringResource(
            R.string.record_detail_permission_title,
        )
        RecordDetailLoadState.Offline -> stringResource(R.string.shcare_state_offline_title)
        RecordDetailLoadState.Error -> stringResource(R.string.shcare_state_error_title)
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .navigationBarsPadding(),
    ) {
        ShcareSettingsHeader(
            title = stringResource(R.string.record_detail_title),
            onNavigateBack = onNavigateBack,
            actions = {
                IconButton(
                    onClick = { onAction(RecordDetailUiAction.ShareAudio) },
                    enabled = state.hasAudio &&
                        state.audioOperation == RecordAudioOperation.None,
                    modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                ) {
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = stringResource(R.string.record_detail_share),
                    )
                }
                IconButton(
                    onClick = { onAction(RecordDetailUiAction.Refresh) },
                    enabled = !state.isRefreshing &&
                        state.audioOperation == RecordAudioOperation.None,
                    modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                ) {
                    if (state.isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.record_detail_refresh),
                        )
                    }
                }
            },
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .semantics {
                    stateDescription = screenStateDescription
                },
        ) {
            when (state.loadState) {
                RecordDetailLoadState.Loading -> {
                    ShcareLoadingState(
                        message = stringResource(R.string.record_detail_loading),
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                RecordDetailLoadState.NotFound -> {
                    ShcareEmptyState(
                        title = stringResource(R.string.record_detail_not_found_title),
                        message = stringResource(R.string.record_detail_not_found_message),
                        actionLabel = stringResource(R.string.shcare_action_retry),
                        onAction = { onAction(RecordDetailUiAction.Retry) },
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                RecordDetailLoadState.PermissionDenied -> {
                    ShcarePermissionState(
                        onRequestPermission = onNavigateBack,
                        title = stringResource(R.string.record_detail_permission_title),
                        message = stringResource(R.string.record_detail_permission_message),
                        actionLabel = stringResource(R.string.shcare_action_back),
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                RecordDetailLoadState.Offline -> {
                    ShcareOfflineState(
                        onRetry = { onAction(RecordDetailUiAction.Retry) },
                        message = state.errorMessage.ifBlank {
                            stringResource(R.string.shcare_state_offline_message)
                        },
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                RecordDetailLoadState.Error -> {
                    ShcareErrorState(
                        onRetry = { onAction(RecordDetailUiAction.Retry) },
                        message = state.errorMessage.ifBlank {
                            stringResource(R.string.record_detail_error_message)
                        },
                        modifier = Modifier.align(Alignment.Center),
                    )
                }
                RecordDetailLoadState.Ready -> {
                    val scan = state.scan
                    if (scan == null) {
                        ShcareErrorState(
                            onRetry = { onAction(RecordDetailUiAction.Retry) },
                            modifier = Modifier.align(Alignment.Center),
                        )
                    } else {
                        RecordDetailReadyContent(
                            state = state,
                            scan = scan,
                            playbackState = playbackState,
                            onAction = onAction,
                            onTogglePlayback = onTogglePlayback,
                            onSeekBy = onSeekBy,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RecordDetailReadyContent(
    state: RecordDetailUiState,
    scan: Scan,
    playbackState: RecordPlaybackState,
    onAction: (RecordDetailUiAction) -> Unit,
    onTogglePlayback: () -> Unit,
    onSeekBy: (Int) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val twoPane = maxWidth >= 840.dp
        if (twoPane) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = spacing.extraLarge),
                horizontalArrangement = Arrangement.spacedBy(spacing.extraLarge),
            ) {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                    contentPadding = PaddingValues(vertical = spacing.extraLarge),
                    verticalArrangement = Arrangement.spacedBy(spacing.large),
                ) {
                    item {
                        RecordMessageStack(state, onAction)
                    }
                    item {
                        RecordSummaryCard(state, scan, onAction)
                    }
                    item {
                        RecordWaveformAndAudioCard(
                            state = state,
                            scan = scan,
                            playbackState = playbackState,
                            onAction = onAction,
                            onTogglePlayback = onTogglePlayback,
                            onSeekBy = onSeekBy,
                        )
                    }
                }
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                    contentPadding = PaddingValues(vertical = spacing.extraLarge),
                    verticalArrangement = Arrangement.spacedBy(spacing.large),
                ) {
                    item { RecordSignalCard(scan) }
                    item { RecordNotesCard(scan) }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(spacing.large),
                verticalArrangement = Arrangement.spacedBy(spacing.large),
            ) {
                item {
                    RecordMessageStack(state, onAction)
                }
                item {
                    RecordSummaryCard(state, scan, onAction)
                }
                item {
                    RecordWaveformAndAudioCard(
                        state = state,
                        scan = scan,
                        playbackState = playbackState,
                        onAction = onAction,
                        onTogglePlayback = onTogglePlayback,
                        onSeekBy = onSeekBy,
                    )
                }
                item { RecordSignalCard(scan) }
                item { RecordNotesCard(scan) }
            }
        }
    }
}

@Composable
private fun RecordMessageStack(
    state: RecordDetailUiState,
    onAction: (RecordDetailUiAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
        if (state.isStale) {
            RecordMessageBanner(
                message = stringResource(R.string.record_detail_stale),
                isError = false,
                onDismiss = { onAction(RecordDetailUiAction.DismissMessage) },
            )
        }
        if (state.errorMessage.isNotBlank()) {
            RecordMessageBanner(
                message = state.errorMessage,
                isError = true,
                onDismiss = { onAction(RecordDetailUiAction.DismissMessage) },
            )
        }
        if (state.statusMessage.isNotBlank()) {
            RecordMessageBanner(
                message = state.statusMessage,
                isError = false,
                success = true,
                onDismiss = { onAction(RecordDetailUiAction.DismissMessage) },
            )
        }
        if (state.audioOperation in setOf(
                RecordAudioOperation.PreparingShare,
                RecordAudioOperation.PreparingDownload,
            )
        ) {
            RecordAudioProgress(state)
        }
    }
}

@Composable
private fun RecordMessageBanner(
    message: String,
    isError: Boolean,
    onDismiss: () -> Unit,
    success: Boolean = false,
) {
    val semanticColors = ShcareTheme.colors
    val colors = when {
        isError -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
        success -> semanticColors.successContainer to semanticColors.onSuccessContainer
        else -> semanticColors.warningContainer to semanticColors.onWarningContainer
    }
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                liveRegion = if (isError) LiveRegionMode.Assertive else LiveRegionMode.Polite
            },
    ) {
        Row(
            modifier = Modifier.padding(
                start = ShcareTheme.spacing.large,
                top = ShcareTheme.spacing.medium,
                bottom = ShcareTheme.spacing.medium,
            ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = onDismiss,
                modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = stringResource(R.string.shcare_action_close),
                )
            }
        }
    }
}

@Composable
private fun RecordAudioProgress(state: RecordDetailUiState) {
    val progress = state.audioProgress
    val fraction = progress?.fraction
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            Text(
                text = if (fraction == null) {
                    stringResource(R.string.record_detail_audio_progress_indeterminate)
                } else {
                    stringResource(
                        R.string.record_detail_audio_progress,
                        (fraction * 100).toInt(),
                    )
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            if (fraction == null) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            } else {
                LinearProgressIndicator(
                    progress = { fraction },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun RecordSummaryCard(
    state: RecordDetailUiState,
    scan: Scan,
    onAction: (RecordDetailUiAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier.padding(spacing.extraLarge),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = scan.patientName,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.semantics { heading() },
                    )
                    Spacer(modifier = Modifier.height(spacing.extraSmall))
                    Text(
                        text = stringResource(
                            R.string.record_detail_patient_code,
                            scan.patientCode,
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                RecordStatusBadge(scan)
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            RecordInfoRow(
                icon = Icons.Default.CalendarToday,
                label = scan.formattedDate(),
            )
            RecordInfoRow(
                icon = Icons.Default.AccessTime,
                label = scan.formattedTime(),
            )
            RecordInfoRow(
                icon = Icons.Default.Timer,
                label = scan.formattedDuration(),
            )
            RecordInfoRow(
                icon = if (scan.isHeart) Icons.Default.Favorite else Icons.Default.Air,
                label = stringResource(
                    if (scan.isHeart) {
                        R.string.record_detail_measure_heart
                    } else {
                        R.string.record_detail_measure_lung
                    },
                ),
            )
            if (scan.isRecording && state.canManageScan) {
                Button(
                    onClick = { onAction(RecordDetailUiAction.StopRecording) },
                    enabled = !state.isStopping,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp),
                ) {
                    if (state.isStopping) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                        Spacer(modifier = Modifier.width(spacing.small))
                    }
                    Text(
                        text = stringResource(
                            if (state.isStopping) {
                                R.string.record_detail_stopping
                            } else {
                                R.string.record_detail_stop
                            },
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun RecordStatusBadge(scan: Scan) {
    val normal = scanIsNormal(scan)
    val colors = if (normal) {
        ShcareTheme.colors.successContainer to ShcareTheme.colors.onSuccessContainer
    } else {
        ShcareTheme.colors.warningContainer to ShcareTheme.colors.onWarningContainer
    }
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.small,
    ) {
        Text(
            text = scanLabel(scan),
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.padding(
                horizontal = ShcareTheme.spacing.medium,
                vertical = ShcareTheme.spacing.small,
            ),
        )
    }
}

@Composable
private fun RecordInfoRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun RecordWaveformAndAudioCard(
    state: RecordDetailUiState,
    scan: Scan,
    playbackState: RecordPlaybackState,
    onAction: (RecordDetailUiAction) -> Unit,
    onTogglePlayback: () -> Unit,
    onSeekBy: (Int) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    ) {
        Column(
            modifier = Modifier.padding(spacing.extraLarge),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            Text(
                text = stringResource(
                    if (scan.isHeart) {
                        R.string.record_detail_heart_waveform_title
                    } else {
                        R.string.record_detail_lung_waveform_title
                    },
                ),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            when (state.waveformLoadState) {
                RecordWaveformLoadState.Loading -> {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    Text(
                        text = stringResource(R.string.record_detail_waveform_loading),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                RecordWaveformLoadState.Ready -> {
                    state.waveform?.let { waveform ->
                        RecordWaveform(
                            waveform = waveform,
                            playbackState = playbackState,
                        )
                    }
                }
                RecordWaveformLoadState.Unavailable -> {
                    RecordArtifactNotice(
                        message = stringResource(
                            R.string.record_detail_waveform_unavailable,
                        ),
                        error = false,
                    )
                }
                RecordWaveformLoadState.Error -> {
                    RecordArtifactNotice(
                        message = stringResource(R.string.record_detail_waveform_error),
                        error = true,
                    )
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(
                text = stringResource(R.string.record_detail_audio_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            if (!state.hasAudio) {
                Text(
                    text = stringResource(R.string.record_detail_audio_unavailable),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                RecordAudioControls(
                    state = state,
                    playbackState = playbackState,
                    onAction = onAction,
                    onTogglePlayback = onTogglePlayback,
                    onSeekBy = onSeekBy,
                )
            }
            if (playbackState.errorMessage.isNotBlank()) {
                Text(
                    text = playbackState.errorMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.semantics {
                        liveRegion = LiveRegionMode.Assertive
                    },
                )
            }
            if (scan.isRecording) {
                Text(
                    text = stringResource(R.string.record_detail_audio_unavailable),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun RecordWaveform(
    waveform: ScanWaveform,
    playbackState: RecordPlaybackState,
) {
    val waveformColor = MaterialTheme.colorScheme.primary
    val baselineColor = MaterialTheme.colorScheme.outlineVariant
    val markerColor = MaterialTheme.colorScheme.error
    val peak = (waveform.peakAmplitude * 100).toInt().coerceIn(0, 100)
    val average = (waveform.averageAmplitude * 100).toInt().coerceIn(0, 100)
    val description = pluralStringResource(
        R.plurals.record_detail_waveform_description,
        waveform.points.size,
        waveform.points.size,
        peak,
        average,
        waveform.sampleRate,
    )
    val playbackFraction = if (playbackState.durationMillis > 0) {
        playbackState.positionMillis.toFloat() / playbackState.durationMillis.toFloat()
    } else {
        0f
    }.coerceIn(0f, 1f)

    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(160.dp)
                .padding(ShcareTheme.spacing.medium)
                .testTag("record_detail.biomedical_waveform")
                .clearAndSetSemantics {
                    contentDescription = description
                },
        ) {
            val centerY = size.height / 2f
            drawLine(
                color = baselineColor,
                start = Offset(0f, centerY),
                end = Offset(size.width, centerY),
                strokeWidth = 2f,
            )
            if (waveform.representation == "signed_peak_v1") {
                drawPath(
                    path = recordWaveformSignedPath(
                        points = waveform.points,
                        width = size.width,
                        height = size.height,
                    ),
                    color = waveformColor,
                    style = Stroke(
                        width = 2.5.dp.toPx(),
                        cap = StrokeCap.Round,
                    ),
                )
            } else {
                val envelope = recordWaveformEnvelopePath(
                    points = waveform.points,
                    width = size.width,
                    height = size.height,
                )
                drawPath(
                    path = envelope.area,
                    color = waveformColor.copy(alpha = 0.14f),
                )
                drawPath(
                    path = envelope.upper,
                    color = waveformColor,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                )
                drawPath(
                    path = envelope.lower,
                    color = waveformColor,
                    style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                )
            }
            if (playbackState.durationMillis > 0) {
                val markerX = size.width * playbackFraction
                drawLine(
                    color = markerColor,
                    start = Offset(markerX, 0f),
                    end = Offset(markerX, size.height),
                    strokeWidth = 3f,
                )
            }
        }
    }
}

private data class RecordWaveformEnvelopePaths(
    val area: Path,
    val upper: Path,
    val lower: Path,
)

private fun recordWaveformSignedPath(
    points: List<Float>,
    width: Float,
    height: Float,
): Path {
    val path = Path()
    val centerY = height / 2f
    val denominator = (points.size - 1).coerceAtLeast(1)
    points.forEachIndexed { index, point ->
        val x = width * index.toFloat() / denominator.toFloat()
        val y = centerY - point.coerceIn(-1f, 1f) * height * 0.44f
        if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    return path
}

private fun recordWaveformEnvelopePath(
    points: List<Float>,
    width: Float,
    height: Float,
): RecordWaveformEnvelopePaths {
    val centerY = height / 2f
    val denominator = (points.size - 1).coerceAtLeast(1)
    val upper = Path()
    val lower = Path()
    val area = Path()

    points.forEachIndexed { index, point ->
        val x = width * index.toFloat() / denominator.toFloat()
        val amplitude = point.coerceIn(0f, 1f) * height * 0.44f
        val y = centerY - amplitude
        if (index == 0) {
            upper.moveTo(x, y)
            area.moveTo(x, y)
        } else {
            upper.lineTo(x, y)
            area.lineTo(x, y)
        }
    }
    points.indices.reversed().forEach { index ->
        val x = width * index.toFloat() / denominator.toFloat()
        val amplitude = points[index].coerceIn(0f, 1f) * height * 0.44f
        area.lineTo(x, centerY + amplitude)
    }
    area.close()
    points.forEachIndexed { index, point ->
        val x = width * index.toFloat() / denominator.toFloat()
        val amplitude = point.coerceIn(0f, 1f) * height * 0.44f
        val y = centerY + amplitude
        if (index == 0) lower.moveTo(x, y) else lower.lineTo(x, y)
    }
    return RecordWaveformEnvelopePaths(area = area, upper = upper, lower = lower)
}

@Composable
private fun RecordArtifactNotice(
    message: String,
    error: Boolean,
) {
    val colors = if (error) {
        MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(ShcareTheme.spacing.large),
        )
    }
}

@Composable
private fun RecordAudioControls(
    state: RecordDetailUiState,
    playbackState: RecordPlaybackState,
    onAction: (RecordDetailUiAction) -> Unit,
    onTogglePlayback: () -> Unit,
    onSeekBy: (Int) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val duration = playbackState.durationMillis
    val position = playbackState.positionMillis.coerceIn(0, duration.coerceAtLeast(0))
    val fraction = if (duration > 0) {
        position.toFloat() / duration.toFloat()
    } else {
        0f
    }
    Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
        LinearProgressIndicator(
            progress = { fraction.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = formatPlaybackTime(position),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = formatPlaybackTime(duration),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilledTonalIconButton(
                onClick = { onSeekBy(-10_000) },
                enabled = duration > 0,
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Replay10,
                    contentDescription = stringResource(
                        R.string.record_detail_audio_rewind,
                    ),
                )
            }
            FilledTonalIconButton(
                onClick = {
                    when (playbackState.status) {
                        RecordPlaybackStatus.Idle,
                        RecordPlaybackStatus.Error,
                        -> onAction(RecordDetailUiAction.PlayAudio)
                        else -> onTogglePlayback()
                    }
                },
                enabled = state.audioOperation == RecordAudioOperation.None &&
                    playbackState.status != RecordPlaybackStatus.Preparing,
                modifier = Modifier.size(56.dp),
            ) {
                if (
                    playbackState.status == RecordPlaybackStatus.Preparing ||
                    state.audioOperation == RecordAudioOperation.ResolvingPlayback
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    val playing = playbackState.status == RecordPlaybackStatus.Playing
                    Icon(
                        imageVector = if (playing) {
                            Icons.Default.Pause
                        } else {
                            Icons.Default.PlayArrow
                        },
                        contentDescription = stringResource(
                            if (playing) {
                                R.string.record_detail_audio_pause
                            } else {
                                R.string.record_detail_audio_play
                            },
                        ),
                    )
                }
            }
            FilledTonalIconButton(
                onClick = { onSeekBy(10_000) },
                enabled = duration > 0,
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = stringResource(
                        R.string.record_detail_audio_forward,
                    ),
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            OutlinedButton(
                onClick = { onAction(RecordDetailUiAction.DownloadAudio) },
                enabled = state.audioOperation == RecordAudioOperation.None,
                modifier = Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = 48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Download,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(spacing.small))
                Text(
                    text = stringResource(R.string.record_detail_audio_download),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            OutlinedButton(
                onClick = { onAction(RecordDetailUiAction.ShareAudio) },
                enabled = state.audioOperation == RecordAudioOperation.None,
                modifier = Modifier
                    .weight(1f)
                    .defaultMinSize(minHeight = 48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Share,
                    contentDescription = null,
                )
                Spacer(modifier = Modifier.width(spacing.small))
                Text(
                    text = stringResource(R.string.record_detail_audio_share),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun RecordSignalCard(scan: Scan) {
    val spacing = ShcareTheme.spacing
    val metricTags = buildList {
        add(
            stringResource(
                if (scan.isHeart) {
                    R.string.record_detail_measure_heart
                } else {
                    R.string.record_detail_measure_lung
                },
            ),
        )
        if (scan.bpm > 0) add("BPM ${scan.bpm}")
        if (scan.rms > 0) add("RMS ${scan.rms}")
        if (scan.levelPercent > 0) add("SQI ${scan.levelPercent}%")
        if (scan.sampleCount > 0) add("${scan.sampleCount} mẫu")
    }
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(spacing.extraLarge),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            Text(
                text = stringResource(R.string.record_detail_signal_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                text = stringResource(
                    R.string.record_detail_conclusion,
                    scanLabel(scan),
                ),
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = scanSummary(scan),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            ) {
                RecordMetric(
                    label = stringResource(R.string.record_detail_confidence),
                    value = scan.aiConfidence
                        ?.let { "${(it * 100).toInt().coerceIn(0, 100)}%" }
                        ?: "—",
                    modifier = Modifier.weight(1f),
                )
                RecordMetric(
                    label = stringResource(R.string.record_detail_level),
                    value = scanLabel(scan),
                    modifier = Modifier.weight(1f),
                )
            }
            Text(
                text = stringResource(R.string.record_detail_metrics),
                style = MaterialTheme.typography.titleSmall,
            )
            if (metricTags.isEmpty()) {
                Text(
                    text = stringResource(R.string.record_detail_metrics_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(spacing.small),
                    contentPadding = PaddingValues(end = spacing.small),
                ) {
                    items(metricTags) { metric ->
                        Surface(
                            color = MaterialTheme.colorScheme.secondaryContainer,
                            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                            shape = MaterialTheme.shapes.small,
                        ) {
                            Text(
                                text = metric,
                                style = MaterialTheme.typography.labelLarge,
                                modifier = Modifier.padding(
                                    horizontal = spacing.medium,
                                    vertical = spacing.small,
                                ),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RecordMetric(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = value,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun RecordNotesCard(scan: Scan) {
    val spacing = ShcareTheme.spacing
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(spacing.extraLarge),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Default.Description,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = stringResource(R.string.record_detail_notes_title),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
            }
            Text(
                text = scan.doctorNotes.ifBlank {
                    stringResource(R.string.record_detail_notes_empty)
                },
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontStyle = if (scan.doctorNotes.isBlank()) {
                    FontStyle.Italic
                } else {
                    FontStyle.Normal
                },
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(
                text = stringResource(
                    R.string.record_detail_device,
                    scan.deviceId.ifBlank { "—" },
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = "${scan.formattedDate()} · ${scan.formattedTime()}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun formatPlaybackTime(milliseconds: Int): String {
    val seconds = (milliseconds.coerceAtLeast(0) / 1_000)
    return "%d:%02d".format(seconds / 60, seconds % 60)
}

private fun openRecordSharesheet(
    context: Context,
    artifact: RecordAudioArtifact,
): Boolean {
    return runCatching {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            artifact.download.file,
        )
        val shareIntent = Intent(Intent.ACTION_SEND)
            .setType(artifact.download.contentType)
            .putExtra(Intent.EXTRA_STREAM, uri)
        shareIntent.clipData = ClipData.newUri(
            context.contentResolver,
            artifact.displayName,
            uri,
        )
        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(
            Intent.createChooser(
                shareIntent,
                context.getString(R.string.record_detail_share_chooser),
            ),
        )
    }.isSuccess
}
