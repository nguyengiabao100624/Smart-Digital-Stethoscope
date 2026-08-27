package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.data.LiveAudioClient
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.scan.LiveMonitoringLoadState
import com.example.smart_health_android.scan.LiveMonitoringUiAction
import com.example.smart_health_android.scan.LiveMonitoringUiEffect
import com.example.smart_health_android.scan.LiveMonitoringViewModel
import com.example.smart_health_android.scan.LiveMonitoringViewModelFactory
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme

@Composable
fun LiveMonitoringScreen(
    initialScanId: String? = null,
    onNavigateBack: () -> Unit,
    onCreateScan: () -> Unit,
) {
    val context = LocalContext.current
    val spacing = ShcareTheme.spacing
    val monitoringViewModel: LiveMonitoringViewModel = viewModel(
        key = "live-monitoring:${initialScanId.orEmpty()}",
        factory = LiveMonitoringViewModelFactory(initialScanId),
    )
    val state by monitoringViewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(monitoringViewModel) {
        monitoringViewModel.effects.collect { effect ->
            when (effect) {
                LiveMonitoringUiEffect.NavigateBack -> onNavigateBack()
                LiveMonitoringUiEffect.CreateScan -> onCreateScan()
            }
        }
    }

    val realtimeEpoch = state.realtimeEpoch
    val liveClient = remember(state.expectation, realtimeEpoch) {
        state.expectation?.let { expectation ->
            LiveAudioClient(
                context = context,
                expected = expectation,
                onConnectionChanged = { connected, message ->
                    monitoringViewModel.onAction(
                        LiveMonitoringUiAction.ConnectionChanged(
                            realtimeEpoch = realtimeEpoch,
                            scanId = expectation.scanId,
                            connected = connected,
                            message = message,
                        ),
                    )
                },
                onStatus = { status ->
                    monitoringViewModel.onAction(
                        LiveMonitoringUiAction.StatusChanged(realtimeEpoch, status),
                    )
                },
                onMetrics = { metrics ->
                    monitoringViewModel.onAction(
                        LiveMonitoringUiAction.MetricsChanged(realtimeEpoch, metrics),
                    )
                },
                onSamples = { samples ->
                    monitoringViewModel.onAction(
                        LiveMonitoringUiAction.SamplesChanged(
                            realtimeEpoch,
                            expectation.scanId,
                            samples,
                        ),
                    )
                },
                onScanLifecycle = { scanId, lifecycleState ->
                    monitoringViewModel.onAction(
                        LiveMonitoringUiAction.ScanLifecycleChanged(
                            realtimeEpoch,
                            scanId,
                            lifecycleState,
                        ),
                    )
                },
                onDroppedPackets = {
                    monitoringViewModel.onAction(
                        LiveMonitoringUiAction.DroppedPacketsChanged(
                            realtimeEpoch,
                            expectation.scanId,
                            it,
                        ),
                    )
                },
            )
        }
    }

    DisposableEffect(liveClient) {
        liveClient?.connect()
        onDispose { liveClient?.close() }
    }

    val selectedDevice = state.selectedDevice
    val waveformSamples = state.waveformSamples.toFloatArray()
    val hasLiveSamples = waveformSamples.any { kotlin.math.abs(it) > LIVE_SAMPLE_EPSILON }
    val signalQualityAlert = state.isRecording && state.isConnected && state.hasMetrics &&
        state.signalQuality <= LOW_SIGNAL_THRESHOLD
    val primaryValue = when {
        !state.hasMetrics -> "--"
        state.mode == "heart" -> state.heartRate.toString()
        else -> state.metrics.rms.coerceAtLeast(0).toString()
    }
    val primaryUnit = if (state.mode == "heart") "BPM" else "RMS"
    val sqiValue = if (state.hasMetrics) state.signalQuality.toString() else "--"
    val connectionRejected = state.connectionText.contains("từ chối", ignoreCase = true)
    val connectionState = when {
        state.interruptionMessage != null -> MonitorVisualState.Interrupted
        state.actionError != null || connectionRejected -> MonitorVisualState.Error
        state.terminalNotice != null -> MonitorVisualState.Finished
        state.activeScanId == null -> MonitorVisualState.Ready
        state.isStopPending -> MonitorVisualState.Stopping
        state.isRecording && state.isConnected -> MonitorVisualState.Recording
        state.isConnected -> MonitorVisualState.Pending
        state.connectionText.startsWith("Đang kết nối", ignoreCase = true) -> MonitorVisualState.Connecting
        else -> MonitorVisualState.Offline
    }

    BackHandler {
        monitoringViewModel.onAction(LiveMonitoringUiAction.BackRequested)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            MonitoringHeader(onNavigateBack = {
                monitoringViewModel.onAction(LiveMonitoringUiAction.BackRequested)
            })
        },
    ) { contentPadding ->
        when {
            state.loadState == LiveMonitoringLoadState.Loading -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(contentPadding)
                        .imePadding(),
                    contentAlignment = Alignment.Center,
                ) {
                    ShcareLoadingState(
                        message = "Đang chuẩn bị phiên theo dõi an toàn…",
                    )
                }
            }
            state.loadState != LiveMonitoringLoadState.Content -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(contentPadding)
                        .imePadding(),
                    contentAlignment = Alignment.Center,
                ) {
                    val retry = {
                        monitoringViewModel.onAction(LiveMonitoringUiAction.Retry)
                    }
                    when (state.loadState) {
                        LiveMonitoringLoadState.PermissionDenied -> ShcarePermissionState(
                            title = "Không có quyền mở phiên theo dõi",
                            message = state.actionError,
                            actionLabel = "Kiểm tra lại quyền",
                            onRequestPermission = retry,
                        )
                        LiveMonitoringLoadState.Offline -> ShcareOfflineState(
                            title = "Không có kết nối mạng",
                            message = state.actionError,
                            retryLabel = "Thử kết nối lại",
                            onRetry = retry,
                        )
                        else -> ShcareErrorState(
                            title = "Không mở được phiên theo dõi",
                            message = state.actionError,
                            retryLabel = "Thử tải lại",
                            onRetry = retry,
                        )
                    }
                }
            }
            else -> {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(contentPadding)
                        .imePadding()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = spacing.large, vertical = spacing.medium),
                    verticalArrangement = Arrangement.spacedBy(spacing.large),
                ) {
                    DeviceContextCard(
                        device = selectedDevice,
                        activeScanId = state.activeScanId,
                    )
                    MonitorStatusCard(
                        state = connectionState,
                        connectionText = state.connectionText,
                        actionError = state.actionError,
                        interruptionMessage = state.interruptionMessage,
                        terminalNotice = state.terminalNotice,
                        hasDevice = selectedDevice != null,
                    )
                    WaveformCard(
                        mode = state.mode,
                        isRecording = state.isRecording,
                        hasLiveSamples = hasLiveSamples,
                        samples = waveformSamples,
                        heartRate = state.heartRate,
                        rms = state.metrics.rms.coerceAtLeast(0),
                        sqi = state.signalQuality,
                        hasMetrics = state.hasMetrics,
                        droppedPackets = state.droppedPackets,
                    )
                    AdaptiveVitalMetrics(
                        mode = state.mode,
                        primaryValue = primaryValue,
                        primaryUnit = primaryUnit,
                        sqiValue = sqiValue,
                        hasMetrics = state.hasMetrics,
                        signalQualityAlert = signalQualityAlert,
                        isRecording = state.isRecording,
                    )
                    if (state.isRecording) {
                        SignalGuidanceCard(
                            hasLowQuality = signalQualityAlert,
                            hasMetrics = state.hasMetrics,
                        )
                    }
                    if (state.droppedPackets > 0) {
                        DroppedPacketsCard(droppedPackets = state.droppedPackets)
                    }
                    MonitoringAction(
                        hasActiveScan = state.activeScanId != null,
                        isRecording = state.isRecording,
                        isBusy = state.isBusy || state.isStopPending,
                        onClick = {
                            monitoringViewModel.onAction(
                                if (state.activeScanId != null) {
                                    LiveMonitoringUiAction.StopRequested()
                                } else {
                                    LiveMonitoringUiAction.CreateScanRequested
                                },
                            )
                        },
                    )
                    Spacer(modifier = Modifier.height(spacing.large))
                }
            }
        }
    }
}

@Composable
private fun MonitoringHeader(onNavigateBack: () -> Unit) {
    val spacing = ShcareTheme.spacing
    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = spacing.extraSmall, vertical = spacing.small),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onNavigateBack) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Quay lại",
                )
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = spacing.small),
            ) {
                Text(
                    text = "Theo dõi tín hiệu",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = "Âm thanh trực tiếp từ lượt đo đang chọn",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DeviceContextCard(device: SmartDevice?, activeScanId: String?) {
    val spacing = ShcareTheme.spacing
    val isOnline = device?.let { it.online || it.connected } == true
    val deviceName = device?.name?.ifBlank { device.id } ?: "Chưa chọn ống nghe"
    val metadata = listOfNotNull(
        activeScanId?.let { "Lượt đo: $it" },
        device?.wifiSsid?.takeIf { it.isNotBlank() }?.let { "Wi-Fi: $it" },
        device?.firmwareVersion?.takeIf { it.isNotBlank() }?.let { "Firmware: $it" },
    ).joinToString(" • ").ifBlank {
        "Liên kết thiết bị trước khi bắt đầu một lượt đo mới."
    }
    val spokenState = "$deviceName. ${if (isOnline) "Thiết bị đang trực tuyến" else "Thiết bị đang ngoại tuyến"}. $metadata"

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { stateDescription = spokenState },
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.46f),
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.GraphicEq,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = deviceName,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = metadata,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            DevicePresenceBadge(isOnline = isOnline)
        }
    }
}

@Composable
private fun DevicePresenceBadge(isOnline: Boolean) {
    val semanticColors = ShcareTheme.colors
    val spacing = ShcareTheme.spacing
    val containerColor = if (isOnline) {
        semanticColors.successContainer
    } else {
        semanticColors.offlineContainer
    }
    val contentColor = if (isOnline) {
        semanticColors.onSuccessContainer
    } else {
        semanticColors.onOfflineContainer
    }
    val label = if (isOnline) "Thiết bị trực tuyến" else "Thiết bị ngoại tuyến"

    Surface(
        modifier = Modifier.semantics { stateDescription = label },
        color = containerColor,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.small,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = spacing.medium, vertical = spacing.small),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(spacing.small),
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(contentColor, CircleShape),
            )
            Text(text = label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun MonitorStatusCard(
    state: MonitorVisualState,
    connectionText: String,
    actionError: String?,
    interruptionMessage: String?,
    terminalNotice: String?,
    hasDevice: Boolean,
) {
    val semanticColors = ShcareTheme.colors
    val spacing = ShcareTheme.spacing
    val presentation = when (state) {
        MonitorVisualState.Ready -> MonitorStatusPresentation(
            title = "Sẵn sàng tạo lượt đo",
            message = if (hasDevice) {
                "Chọn tạo lượt đo mới để xác định hồ sơ, vị trí nghe và thiết bị."
            } else {
                "Chưa có ống nghe được liên kết. Hãy ghép thiết bị trước khi tạo lượt đo."
            },
            icon = Icons.Default.GraphicEq,
            containerColor = semanticColors.infoContainer,
            contentColor = semanticColors.onInfoContainer,
        )
        MonitorVisualState.Connecting -> MonitorStatusPresentation(
            title = "Đang kết nối an toàn",
            message = connectionText,
            icon = Icons.Default.Wifi,
            containerColor = semanticColors.infoContainer,
            contentColor = semanticColors.onInfoContainer,
        )
        MonitorVisualState.Pending -> MonitorStatusPresentation(
            title = "Đang chờ thiết bị gửi tín hiệu",
            message = connectionText,
            icon = Icons.Default.Wifi,
            containerColor = semanticColors.infoContainer,
            contentColor = semanticColors.onInfoContainer,
        )
        MonitorVisualState.Stopping -> MonitorStatusPresentation(
            title = "Đã gửi yêu cầu dừng",
            message = "Máy chủ đã nhận yêu cầu. Lượt đo chỉ kết thúc sau khi thiết bị xác nhận.",
            icon = Icons.Default.Wifi,
            containerColor = semanticColors.warningContainer,
            contentColor = semanticColors.onWarningContainer,
        )
        MonitorVisualState.Recording -> MonitorStatusPresentation(
            title = "Đang nhận tín hiệu trực tiếp",
            message = "Thiết bị đã xác nhận phiên và đang gửi dữ liệu âm thanh hợp lệ.",
            icon = Icons.Default.GraphicEq,
            containerColor = semanticColors.successContainer,
            contentColor = semanticColors.onSuccessContainer,
        )
        MonitorVisualState.Offline -> MonitorStatusPresentation(
            title = "Mất kết nối realtime",
            message = "$connectionText Hệ thống sẽ tự kết nối lại khi mạng sẵn sàng.",
            icon = Icons.Default.WifiOff,
            containerColor = semanticColors.offlineContainer,
            contentColor = semanticColors.onOfflineContainer,
        )
        MonitorVisualState.Interrupted -> MonitorStatusPresentation(
            title = "Lượt đo bị gián đoạn",
            message = interruptionMessage ?: "Luồng âm thanh đã dừng ngoài dự kiến.",
            icon = Icons.Default.Warning,
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        )
        MonitorVisualState.Error -> MonitorStatusPresentation(
            title = "Không thể hoàn tất thao tác",
            message = actionError ?: connectionText,
            icon = Icons.Default.Warning,
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        )
        MonitorVisualState.Finished -> MonitorStatusPresentation(
            title = "Lượt đo đã kết thúc",
            message = terminalNotice ?: "Mở hồ sơ để xem dữ liệu đã nhận.",
            icon = Icons.Default.VerifiedUser,
            containerColor = semanticColors.successContainer,
            contentColor = semanticColors.onSuccessContainer,
        )
    }
    val spokenState = "${presentation.title}. ${presentation.message}"
    val liveRegionMode = when (state) {
        MonitorVisualState.Error,
        MonitorVisualState.Interrupted,
        MonitorVisualState.Offline,
        -> LiveRegionMode.Assertive
        else -> LiveRegionMode.Polite
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = spokenState
                liveRegion = liveRegionMode
            },
        color = presentation.containerColor,
        contentColor = presentation.contentColor,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier.padding(spacing.large),
            horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = presentation.icon,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.extraSmall),
            ) {
                Text(text = presentation.title, style = MaterialTheme.typography.titleSmall)
                Text(text = presentation.message, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun WaveformCard(
    mode: String,
    isRecording: Boolean,
    hasLiveSamples: Boolean,
    samples: FloatArray,
    heartRate: Int,
    rms: Int,
    sqi: Int,
    hasMetrics: Boolean,
    droppedPackets: Long,
) {
    val spacing = ShcareTheme.spacing
    val semanticColors = ShcareTheme.colors
    val isHeartMode = mode == "heart"
    val title = if (isHeartMode) "Tín hiệu âm tim" else "Tín hiệu âm phổi"
    val waveformDescription = buildList {
        add(title)
        add(if (hasLiveSamples) "Đang hiển thị mẫu âm thanh hợp lệ" else "Chưa có mẫu âm thanh hợp lệ")
        if (hasMetrics) {
            if (isHeartMode) add("Nhịp tim $heartRate BPM") else add("Cường độ RMS $rms")
            add("Chất lượng tín hiệu $sqi phần trăm")
        }
        if (droppedPackets > 0) add("$droppedPackets gói bị gián đoạn")
    }.joinToString(". ")
    val chartSurface = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.34f)
    val gridMinor = MaterialTheme.colorScheme.error.copy(alpha = 0.12f)
    val gridMajor = MaterialTheme.colorScheme.error.copy(alpha = 0.24f)
    val waveColor = if (isHeartMode) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.secondary
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Default.GraphicEq,
                    contentDescription = null,
                    tint = waveColor,
                    modifier = Modifier.size(24.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = "Dữ liệu âm thanh thô, không phải kết luận lâm sàng",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (isRecording) {
                    Surface(
                        color = semanticColors.successContainer,
                        contentColor = semanticColors.onSuccessContainer,
                        shape = MaterialTheme.shapes.small,
                    ) {
                        Text(
                            text = "Đang thu",
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(
                                horizontal = spacing.medium,
                                vertical = spacing.small,
                            ),
                        )
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 220.dp)
                    .clip(MaterialTheme.shapes.medium)
                    .background(chartSurface)
                    .semantics(mergeDescendants = true) {
                        contentDescription = "Biểu đồ dạng sóng âm thanh trực tiếp"
                        stateDescription = waveformDescription
                    },
                contentAlignment = Alignment.Center,
            ) {
                MedicalWaveformCanvas(
                    samples = samples,
                    minorGridColor = gridMinor,
                    majorGridColor = gridMajor,
                    waveColor = waveColor,
                    modifier = Modifier.fillMaxSize(),
                )
                if (!hasLiveSamples) {
                    Text(
                        text = if (isRecording) {
                            "Đang chờ khung âm thanh hợp lệ…"
                        } else {
                            "Chưa có tín hiệu để hiển thị"
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(spacing.extraLarge),
                    )
                }
            }
        }
    }
}

@Composable
private fun MedicalWaveformCanvas(
    samples: FloatArray,
    minorGridColor: Color,
    majorGridColor: Color,
    waveColor: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        val width = size.width
        val height = size.height
        val centerY = height / 2f
        val minorGridStep = 10.dp.toPx()
        val majorGridStep = 50.dp.toPx()

        var xGrid = 0f
        while (xGrid <= width) {
            drawLine(
                color = minorGridColor,
                start = Offset(xGrid, 0f),
                end = Offset(xGrid, height),
                strokeWidth = 1f,
            )
            xGrid += minorGridStep
        }

        var yGrid = 0f
        while (yGrid <= height) {
            drawLine(
                color = minorGridColor,
                start = Offset(0f, yGrid),
                end = Offset(width, yGrid),
                strokeWidth = 1f,
            )
            yGrid += minorGridStep
        }

        xGrid = 0f
        while (xGrid <= width) {
            drawLine(
                color = majorGridColor,
                start = Offset(xGrid, 0f),
                end = Offset(xGrid, height),
                strokeWidth = 1.2f,
            )
            xGrid += majorGridStep
        }

        yGrid = 0f
        while (yGrid <= height) {
            drawLine(
                color = majorGridColor,
                start = Offset(0f, yGrid),
                end = Offset(width, yGrid),
                strokeWidth = 1.2f,
            )
            yGrid += majorGridStep
        }

        val path = Path()
        val hasLiveSamples = samples.any { kotlin.math.abs(it) > LIVE_SAMPLE_EPSILON }
        if (hasLiveSamples) {
            samples.forEachIndexed { index, sample ->
                val x = (index.toFloat() / (samples.size - 1).coerceAtLeast(1)) * width
                val y = centerY - sample.coerceIn(-1f, 1f) * height * 0.42f
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
        } else {
            path.moveTo(0f, centerY)
            path.lineTo(width, centerY)
        }

        drawPath(
            path = path,
            color = waveColor,
            style = Stroke(width = 2.5.dp.toPx()),
        )
    }
}

@Composable
private fun AdaptiveVitalMetrics(
    mode: String,
    primaryValue: String,
    primaryUnit: String,
    sqiValue: String,
    hasMetrics: Boolean,
    signalQualityAlert: Boolean,
    isRecording: Boolean,
) {
    val spacing = ShcareTheme.spacing
    val semanticColors = ShcareTheme.colors
    val isHeartMode = mode == "heart"
    val firstMetric: @Composable (Modifier) -> Unit = { modifier ->
        VitalMetricCard(
            modifier = modifier,
            label = if (isHeartMode) "Nhịp tim" else "Cường độ âm phổi",
            value = primaryValue,
            unit = primaryUnit,
            icon = if (isHeartMode) Icons.Default.Favorite else Icons.Default.Air,
            accent = if (isHeartMode) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.secondary
            },
            hasValue = hasMetrics,
            isActive = isRecording,
        )
    }
    val qualityMetric: @Composable (Modifier) -> Unit = { modifier ->
        VitalMetricCard(
            modifier = modifier,
            label = "Chất lượng tín hiệu",
            value = sqiValue,
            unit = "% SQI",
            icon = Icons.Default.VerifiedUser,
            accent = if (signalQualityAlert) semanticColors.warning else MaterialTheme.colorScheme.secondary,
            hasValue = hasMetrics,
            isActive = isRecording,
        )
    }

    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        if (maxWidth >= TABLET_METRIC_BREAKPOINT) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.large),
            ) {
                firstMetric(Modifier.weight(1f))
                qualityMetric(Modifier.weight(1f))
            }
        } else {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(spacing.medium),
            ) {
                firstMetric(Modifier.fillMaxWidth())
                qualityMetric(Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun VitalMetricCard(
    label: String,
    value: String,
    unit: String,
    icon: ImageVector,
    accent: Color,
    hasValue: Boolean,
    isActive: Boolean,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    val spokenValue = if (hasValue) "$value $unit" else "Chưa có dữ liệu"
    val spokenState = "$label. $spokenValue. ${if (isActive) "Đang cập nhật" else "Chưa cập nhật trực tiếp"}"

    Card(
        modifier = modifier
            .heightIn(min = 112.dp)
            .semantics(mergeDescendants = true) { stateDescription = spokenState },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = MaterialTheme.shapes.large,
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.small),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (isActive) accent else MaterialTheme.colorScheme.outline,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column {
                Text(
                    text = value,
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = if (hasValue) unit else "Chưa có dữ liệu",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun SignalGuidanceCard(hasLowQuality: Boolean, hasMetrics: Boolean) {
    val semanticColors = ShcareTheme.colors
    val spacing = ShcareTheme.spacing
    val showWarning = hasMetrics && hasLowQuality
    val containerColor = if (showWarning) {
        semanticColors.warningContainer
    } else {
        semanticColors.infoContainer
    }
    val contentColor = if (showWarning) {
        semanticColors.onWarningContainer
    } else {
        semanticColors.onInfoContainer
    }
    val title = if (showWarning) "Chất lượng tín hiệu thấp" else "Đang thu dữ liệu thô"
    val message = if (showWarning) {
        "Kiểm tra vị trí đầu nghe, tiếp xúc cảm biến và kết nối Wi-Fi trước khi lưu dữ liệu."
    } else {
        "Giữ đầu nghe ổn định và theo dõi dạng sóng. Màn hình này không đưa ra chẩn đoán."
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { stateDescription = "$title. $message" },
        color = containerColor,
        contentColor = contentColor,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier.padding(spacing.large),
            horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = if (showWarning) Icons.Default.Warning else Icons.Default.GraphicEq,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.extraSmall),
            ) {
                Text(text = title, style = MaterialTheme.typography.titleSmall)
                Text(text = message, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun DroppedPacketsCard(droppedPackets: Long) {
    val semanticColors = ShcareTheme.colors
    val spacing = ShcareTheme.spacing
    val message =
        "$droppedPackets gói âm thanh bị gián đoạn. Chỉ dữ liệu đúng phiên và đúng thứ tự được hiển thị."

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = message
                liveRegion = LiveRegionMode.Assertive
            },
        color = semanticColors.warningContainer,
        contentColor = semanticColors.onWarningContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier.padding(spacing.large),
            horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = Icons.Default.Warning,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MonitoringAction(
    hasActiveScan: Boolean,
    isRecording: Boolean,
    isBusy: Boolean,
    onClick: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val containerColor = if (hasActiveScan) {
        MaterialTheme.colorScheme.error
    } else {
        MaterialTheme.colorScheme.primary
    }
    val contentColor = if (hasActiveScan) {
        MaterialTheme.colorScheme.onError
    } else {
        MaterialTheme.colorScheme.onPrimary
    }
    val actionLabel = when {
        isBusy -> "Đang gửi yêu cầu…"
        hasActiveScan -> "Gửi yêu cầu dừng"
        else -> "Tạo lượt đo mới"
    }
    val supportingText = when {
        hasActiveScan && isRecording ->
            "Nút dừng chỉ gửi yêu cầu; lượt đo kết thúc sau khi thiết bị xác nhận."
        hasActiveScan ->
            "Phiên đang chờ thiết bị. Bạn vẫn có thể gửi yêu cầu dừng an toàn."
        else ->
            "Bạn sẽ chọn hồ sơ, vị trí nghe và thiết bị ở bước tiếp theo."
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.small),
    ) {
        Button(
            onClick = onClick,
            enabled = !isBusy,
            colors = ButtonDefaults.buttonColors(
                containerColor = containerColor,
                contentColor = contentColor,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 52.dp)
                .semantics {
                    stateDescription = if (isBusy) {
                        "Đang xử lý"
                    } else if (hasActiveScan) {
                        "Có lượt đo đang hoạt động"
                    } else {
                        "Chưa có lượt đo đang hoạt động"
                    }
                },
        ) {
            if (isBusy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                    color = contentColor,
                )
                Spacer(modifier = Modifier.width(spacing.small))
            }
            Text(text = actionLabel, style = MaterialTheme.typography.labelLarge)
        }
        Text(
            text = supportingText,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

private enum class MonitorVisualState {
    Ready,
    Connecting,
    Pending,
    Stopping,
    Recording,
    Offline,
    Interrupted,
    Error,
    Finished,
}

private data class MonitorStatusPresentation(
    val title: String,
    val message: String,
    val icon: ImageVector,
    val containerColor: Color,
    val contentColor: Color,
)

private const val WAVEFORM_SAMPLE_COUNT = 1_024
private const val LIVE_SAMPLE_EPSILON = 0.0001f
private const val LOW_SIGNAL_THRESHOLD = 25
private val TABLET_METRIC_BREAKPOINT = 600.dp
