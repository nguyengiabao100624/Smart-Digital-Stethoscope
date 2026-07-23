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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
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
import com.example.smart_health_android.data.LiveAudioClient
import com.example.smart_health_android.data.LiveMetrics
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.scan.LiveAudioExpectation
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.theme.ShcareTheme
import kotlinx.coroutines.launch

@Composable
fun LiveMonitoringScreen(
    initialScanId: String? = null,
    onNavigateBack: () -> Unit,
    onCreateScan: () -> Unit,
) {
    val context = LocalContext.current
    val spacing = ShcareTheme.spacing
    var isRecording by remember { mutableStateOf(false) }
    var activeScanId by remember(initialScanId) { mutableStateOf(initialScanId) }
    var mode by remember { mutableStateOf("heart") }
    var heartRate by remember { mutableIntStateOf(0) }
    var sqi by remember { mutableIntStateOf(0) }
    var devices by remember { mutableStateOf<List<SmartDevice>>(emptyList()) }
    var selectedDeviceId by remember { mutableStateOf("") }
    var connectionText by remember { mutableStateOf("Đang kết nối máy chủ…") }
    var isConnected by remember { mutableStateOf(false) }
    var liveMetrics by remember { mutableStateOf(LiveMetrics()) }
    var hasMetrics by remember { mutableStateOf(false) }
    var waveformSamples by remember { mutableStateOf(FloatArray(WAVEFORM_SAMPLE_COUNT)) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var preparationError by remember { mutableStateOf<String?>(null) }
    var interruptionMessage by remember { mutableStateOf<String?>(null) }
    var terminalNotice by remember { mutableStateOf<String?>(null) }
    var isBusy by remember { mutableStateOf(false) }
    var isPreparing by remember { mutableStateOf(true) }
    var isStopPending by remember { mutableStateOf(false) }
    var liveExpectation by remember { mutableStateOf<LiveAudioExpectation?>(null) }
    var droppedPackets by remember { mutableLongStateOf(0L) }
    var navigateAfterStop by remember { mutableStateOf(false) }
    var preparationAttempt by remember { mutableIntStateOf(0) }
    val coroutineScope = rememberCoroutineScope()

    fun resetRealtimeMeasurements() {
        heartRate = 0
        sqi = 0
        liveMetrics = LiveMetrics()
        hasMetrics = false
        waveformSamples = FloatArray(WAVEFORM_SAMPLE_COUNT)
        droppedPackets = 0L
    }

    val liveClient = remember(liveExpectation) {
        liveExpectation?.let { expectation ->
            LiveAudioClient(
                context = context,
                expected = expectation,
                onConnectionChanged = { connected, message ->
                    isConnected = connected
                    connectionText = message
                },
                onStatus = { status ->
                    if (status.recording) {
                        activeScanId = status.activeScanId
                        isRecording = true
                    } else {
                        isRecording = false
                    }
                },
                onMetrics = { metrics ->
                    liveMetrics = metrics
                    hasMetrics = true
                    if (metrics.recording) {
                        activeScanId = metrics.activeScanId ?: activeScanId
                    }
                    heartRate = metrics.bpm.coerceAtLeast(0)
                    sqi = metrics.levelPercent.coerceIn(0, 100)
                },
                onSamples = { samples -> waveformSamples = samples },
                onScanLifecycle = { scanId, state ->
                    if (
                        scanId == activeScanId &&
                        (state == "scan_stopped" || state == "scan_interrupted")
                    ) {
                        activeScanId = null
                        isRecording = false
                        isConnected = false
                        isStopPending = false
                        liveExpectation = null
                        resetRealtimeMeasurements()
                        if (state == "scan_interrupted") {
                            interruptionMessage =
                                "Luồng âm thanh đã bị gián đoạn trước khi thiết bị xác nhận hoàn tất."
                        } else {
                            terminalNotice =
                                "Thiết bị đã xác nhận dừng lượt đo. Dữ liệu đã nhận có thể xem trong hồ sơ."
                        }
                        if (navigateAfterStop) onNavigateBack()
                    }
                },
                onDroppedPackets = { droppedPackets = it },
            )
        }
    }

    DisposableEffect(liveClient) {
        liveClient?.connect()
        onDispose { liveClient?.close() }
    }

    LaunchedEffect(initialScanId, preparationAttempt) {
        isPreparing = true
        preparationError = null
        actionError = null
        interruptionMessage = null
        terminalNotice = null
        isStopPending = false
        isConnected = false
        isRecording = false
        connectionText = "Đang kết nối máy chủ…"
        liveExpectation = null
        activeScanId = initialScanId
        resetRealtimeMeasurements()

        runCatching {
            val user = SmartHealthRepository.api.getMe()
            val scan = initialScanId?.takeIf { it.isNotBlank() }?.let {
                SmartHealthRepository.api.getScan(it)
            }
            val loadedDevices = SmartHealthRepository.api.listDevices()
                .filter { it.type == "stethoscope" || it.type.isBlank() }
                .sortedWith(
                    compareByDescending<SmartDevice> { it.online || it.connected }
                        .thenByDescending { it.lastSeenAt.orEmpty() },
                )
            Triple(user, scan, loadedDevices)
        }.onSuccess { (user, scan, loaded) ->
            devices = loaded
            if (scan != null) {
                selectedDeviceId = scan.deviceId
                mode = scan.mode
                when (scan.status) {
                    "completed" -> {
                        activeScanId = null
                        terminalNotice =
                            "Lượt đo này đã kết thúc. Mở hồ sơ để xem dữ liệu đã được lưu."
                    }
                    "interrupted" -> {
                        activeScanId = null
                        interruptionMessage =
                            "Lượt đo này đã bị gián đoạn. Hãy kiểm tra kết nối trước khi đo lại."
                    }
                    else -> {
                        val workspaceId = user.currentWorkspaceId
                            .ifBlank { user.currentWorkspace?.id.orEmpty() }
                            .ifBlank { user.organizationId }
                        liveExpectation = LiveAudioExpectation(
                            workspaceId = workspaceId,
                            patientId = scan.patientId,
                            deviceId = scan.deviceId,
                            scanId = scan.id,
                        )
                        activeScanId = scan.id
                    }
                }
            } else {
                activeScanId = null
                selectedDeviceId = loaded.firstOrNull()?.id.orEmpty()
            }
            isPreparing = false
        }.onFailure { error ->
            liveExpectation = null
            activeScanId = null
            isPreparing = false
            preparationError = error.message ?: "Không chuẩn bị được phiên theo dõi."
        }
    }

    fun stopRecording(navigateBackAfterStop: Boolean = false) {
        if (isBusy) return
        coroutineScope.launch {
            actionError = null
            isBusy = true
            var shouldNavigateBack = false
            runCatching {
                val scanId = activeScanId ?: error("Không có lượt đo cụ thể để dừng.")
                SmartHealthRepository.api.stopScan(scanId)
            }.onSuccess {
                shouldNavigateBack = navigateBackAfterStop
                navigateAfterStop = navigateBackAfterStop
                isStopPending = true
                connectionText = "Máy chủ đã nhận yêu cầu; đang chờ thiết bị xác nhận dừng…"
            }.onFailure { error ->
                isStopPending = false
                actionError = error.message ?: "Không gửi được yêu cầu dừng lượt đo."
            }
            isBusy = false
            if (shouldNavigateBack && activeScanId == null) onNavigateBack()
        }
    }

    val selectedDevice = devices.firstOrNull { it.id == selectedDeviceId }
    val hasLiveSamples = waveformSamples.any { kotlin.math.abs(it) > LIVE_SAMPLE_EPSILON }
    val signalQualityAlert = isRecording && isConnected && hasMetrics && sqi <= LOW_SIGNAL_THRESHOLD
    val primaryValue = when {
        !hasMetrics -> "--"
        mode == "heart" -> heartRate.toString()
        else -> liveMetrics.rms.coerceAtLeast(0).toString()
    }
    val primaryUnit = if (mode == "heart") "BPM" else "RMS"
    val sqiValue = if (hasMetrics) sqi.toString() else "--"
    val connectionRejected = connectionText.contains("từ chối", ignoreCase = true)
    val connectionState = when {
        interruptionMessage != null -> MonitorVisualState.Interrupted
        actionError != null || connectionRejected -> MonitorVisualState.Error
        terminalNotice != null -> MonitorVisualState.Finished
        activeScanId == null -> MonitorVisualState.Ready
        isStopPending -> MonitorVisualState.Stopping
        isRecording && isConnected -> MonitorVisualState.Recording
        isConnected -> MonitorVisualState.Pending
        connectionText.startsWith("Đang kết nối", ignoreCase = true) -> MonitorVisualState.Connecting
        else -> MonitorVisualState.Offline
    }

    fun toggleRecording() {
        if (activeScanId != null) {
            stopRecording()
        } else {
            onCreateScan()
        }
    }

    BackHandler {
        if (activeScanId != null) {
            stopRecording(navigateBackAfterStop = true)
        } else {
            onNavigateBack()
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            MonitoringHeader(onNavigateBack = {
                if (activeScanId != null) {
                    stopRecording(navigateBackAfterStop = true)
                } else {
                    onNavigateBack()
                }
            })
        },
    ) { contentPadding ->
        when {
            isPreparing -> {
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
            preparationError != null -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(contentPadding)
                        .imePadding(),
                    contentAlignment = Alignment.Center,
                ) {
                    ShcareErrorState(
                        title = "Không mở được phiên theo dõi",
                        message = preparationError,
                        retryLabel = "Thử tải lại",
                        onRetry = { preparationAttempt += 1 },
                    )
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
                        activeScanId = activeScanId,
                    )
                    MonitorStatusCard(
                        state = connectionState,
                        connectionText = connectionText,
                        actionError = actionError,
                        interruptionMessage = interruptionMessage,
                        terminalNotice = terminalNotice,
                        hasDevice = selectedDevice != null,
                    )
                    WaveformCard(
                        mode = mode,
                        isRecording = isRecording,
                        hasLiveSamples = hasLiveSamples,
                        samples = waveformSamples,
                        heartRate = heartRate,
                        rms = liveMetrics.rms.coerceAtLeast(0),
                        sqi = sqi,
                        hasMetrics = hasMetrics,
                        droppedPackets = droppedPackets,
                    )
                    AdaptiveVitalMetrics(
                        mode = mode,
                        primaryValue = primaryValue,
                        primaryUnit = primaryUnit,
                        sqiValue = sqiValue,
                        hasMetrics = hasMetrics,
                        signalQualityAlert = signalQualityAlert,
                        isRecording = isRecording,
                    )
                    if (isRecording) {
                        SignalGuidanceCard(
                            hasLowQuality = signalQualityAlert,
                            hasMetrics = hasMetrics,
                        )
                    }
                    if (droppedPackets > 0) {
                        DroppedPacketsCard(droppedPackets = droppedPackets)
                    }
                    MonitoringAction(
                        hasActiveScan = activeScanId != null,
                        isRecording = isRecording,
                        isBusy = isBusy,
                        onClick = ::toggleRecording,
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
