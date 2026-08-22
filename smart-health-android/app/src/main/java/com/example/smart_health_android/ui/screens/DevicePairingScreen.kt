package com.example.smart_health_android.ui.screens

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.PersistableBundle
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.core.net.toUri
import com.example.smart_health_android.R
import com.example.smart_health_android.devices.DeviceManualSetupField
import com.example.smart_health_android.devices.DevicePairingFailureKind
import com.example.smart_health_android.devices.DevicePairingStage
import com.example.smart_health_android.devices.DevicePairingUiAction
import com.example.smart_health_android.devices.DevicePairingUiEffect
import com.example.smart_health_android.devices.DevicePairingUiState
import com.example.smart_health_android.devices.DevicePairingAuthoritySnapshot
import com.example.smart_health_android.devices.DevicePairingViewModel
import com.example.smart_health_android.devices.DevicePairingViewModelFactory
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicePairingScreen(
    onNavigateBack: () -> Unit,
    onConnectionSuccess: (deviceName: String) -> Unit,
    expectedAuthority: DevicePairingAuthoritySnapshot? = null,
    currentAuthority: () -> DevicePairingAuthoritySnapshot? = { expectedAuthority },
    viewModel: DevicePairingViewModel = viewModel(
        key = expectedAuthority?.let { authority ->
            "device-pairing-${authority.userId}-${authority.workspaceId}-${authority.authorityEpoch}"
        } ?: "device-pairing-authority-denied",
        factory = DevicePairingViewModelFactory(
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
        ),
    ),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current
    val scannerError = stringResource(R.string.device_pairing_scanner_error)
    val wifiSettingsError = stringResource(R.string.device_pairing_wifi_settings_error)
    val setupPortalError = stringResource(R.string.device_pairing_portal_open_error)
    val copiedMessage = stringResource(R.string.device_pairing_copied)
    val scanner = rememberDeviceScanner()

    BackHandler {
        viewModel.onAction(DevicePairingUiAction.Cancel)
        onNavigateBack()
    }

    DisposableEffect(viewModel, lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> viewModel.onAction(DevicePairingUiAction.ScreenStarted)
                Lifecycle.Event.ON_STOP -> viewModel.onAction(DevicePairingUiAction.ScreenStopped)
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            viewModel.onAction(DevicePairingUiAction.ScreenStarted)
        }
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            viewModel.onAction(DevicePairingUiAction.ScreenStopped)
        }
    }

    LaunchedEffect(viewModel, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            viewModel.effects.collectLatest { effect ->
                when (effect) {
                    DevicePairingUiEffect.OpenSystemWifiSettings -> {
                        runCatching {
                            context.startActivity(Intent(Settings.ACTION_WIFI_SETTINGS))
                        }.onFailure {
                            viewModel.onAction(DevicePairingUiAction.WifiSettingsLaunchFailed)
                            snackbarHostState.showSnackbar(wifiSettingsError)
                        }
                    }

                    is DevicePairingUiEffect.OpenExternalSetupPortal -> {
                        runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, effect.url.toUri()),
                            )
                        }.onFailure {
                            snackbarHostState.showSnackbar(setupPortalError)
                        }
                    }

                    is DevicePairingUiEffect.DeviceOnlineConfirmed -> {
                        onConnectionSuccess(effect.deviceName)
                    }
                }
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.device_pairing_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            viewModel.onAction(DevicePairingUiAction.Cancel)
                            onNavigateBack()
                        },
                        modifier = Modifier.testTag("device_pairing.back"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.device_pairing_back),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = 720.dp)
                    .align(Alignment.TopCenter),
            ) {
                when (state.stage) {
                DevicePairingStage.Entry -> DevicePairingEntryContent(
                    state = state,
                    onAction = viewModel::onAction,
                    onScanQr = {
                        scanner.startScan()
                            .addOnSuccessListener { barcode ->
                                val rawValue = barcode.rawValue
                                if (!rawValue.isNullOrBlank()) {
                                    viewModel.onAction(DevicePairingUiAction.QrScanned(rawValue))
                                }
                            }
                            .addOnFailureListener {
                                coroutineScope.launch { snackbarHostState.showSnackbar(scannerError) }
                            }
                    },
                )

                DevicePairingStage.Claiming -> ShcareLoadingState(
                    message = stringResource(R.string.device_pairing_claiming),
                    modifier = Modifier.fillMaxSize(),
                )

                DevicePairingStage.ClaimFailed -> {
                    if (
                        state.failureKind in setOf(
                            DevicePairingFailureKind.Permission,
                            DevicePairingFailureKind.Session,
                        )
                    ) {
                        ShcarePermissionState(
                            title = stringResource(
                                if (state.failureKind == DevicePairingFailureKind.Session) {
                                    R.string.device_pairing_session_title
                                } else {
                                    R.string.device_pairing_permission_title
                                },
                            ),
                            message = state.resolveErrorMessageWithRequestId(
                                fallback = stringResource(R.string.device_pairing_claim_failed_message),
                            ),
                            actionLabel = stringResource(R.string.device_pairing_back),
                            onRequestPermission = {
                                viewModel.onAction(DevicePairingUiAction.Cancel)
                                onNavigateBack()
                            },
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("device_pairing.permission_denied"),
                        )
                    } else {
                        ShcareErrorState(
                            title = stringResource(R.string.device_pairing_claim_failed_title),
                            message = state.resolveErrorMessageWithRequestId(
                                fallback = stringResource(R.string.device_pairing_claim_failed_message),
                            ),
                            retryLabel = stringResource(
                                if (state.canRetryClaim) {
                                    R.string.device_pairing_retry_claim
                                } else {
                                    R.string.device_pairing_enter_claim_again
                                },
                            ),
                            onRetry = {
                                viewModel.onAction(
                                    if (state.canRetryClaim) {
                                        DevicePairingUiAction.RetryClaim
                                    } else {
                                        DevicePairingUiAction.Reset
                                    },
                                )
                            },
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("device_pairing.retry_claim"),
                        )
                    }
                }

                DevicePairingStage.SetupReady -> DevicePairingSetupContent(
                    state = state,
                    isPortalStep = false,
                    onOpenWifiSettings = {
                        viewModel.onAction(DevicePairingUiAction.OpenWifiSettings)
                    },
                    onOpenPortal = {},
                    onConfirmPortal = {},
                    onCopy = { label, value ->
                        copySensitiveText(context, label, value)
                        coroutineScope.launch { snackbarHostState.showSnackbar(copiedMessage) }
                    },
                )

                DevicePairingStage.OpeningWifi -> ShcareLoadingState(
                    message = stringResource(R.string.device_pairing_opening_wifi),
                    modifier = Modifier.fillMaxSize(),
                )

                DevicePairingStage.PortalGuidance -> DevicePairingSetupContent(
                    state = state,
                    isPortalStep = true,
                    onOpenWifiSettings = {
                        viewModel.onAction(DevicePairingUiAction.OpenWifiSettings)
                    },
                    onOpenPortal = {
                        viewModel.onAction(DevicePairingUiAction.OpenSetupPortal)
                    },
                    onConfirmPortal = {
                        viewModel.onAction(DevicePairingUiAction.PortalSetupConfirmed)
                    },
                    onCopy = { label, value ->
                        copySensitiveText(context, label, value)
                        coroutineScope.launch { snackbarHostState.showSnackbar(copiedMessage) }
                    },
                )

                DevicePairingStage.AwaitingOnline -> DevicePairingAwaitingOnlineContent(
                    state = state,
                    onRetry = { viewModel.onAction(DevicePairingUiAction.RetryOnline) },
                )

                DevicePairingStage.Offline -> ShcareOfflineState(
                    title = stringResource(R.string.device_pairing_offline_title),
                    message = state.resolveErrorMessageWithRequestId(
                        fallback = stringResource(R.string.device_pairing_presence_offline),
                    ),
                    retryLabel = stringResource(R.string.device_pairing_retry_online),
                    onRetry = { viewModel.onAction(DevicePairingUiAction.RetryOnline) },
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("device_pairing.retry_offline"),
                )

                DevicePairingStage.Online -> ShcareLoadingState(
                    message = stringResource(R.string.device_pairing_online_confirmed),
                    modifier = Modifier.fillMaxSize(),
                )
                }
            }
        }
    }
}

@Composable
private fun rememberDeviceScanner(): GmsBarcodeScanner {
    val context = LocalContext.current
    val options = remember {
        GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
    }
    return remember(context, options) { GmsBarcodeScanning.getClient(context, options) }
}

@Composable
private fun DevicePairingEntryContent(
    state: DevicePairingUiState,
    onAction: (DevicePairingUiAction) -> Unit,
    onScanQr: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val resolvedErrorMessage = state.resolveErrorMessage()
    var showClaimCode by rememberSaveable { mutableStateOf(false) }
    var showSetupProof by rememberSaveable { mutableStateOf(false) }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .imePadding()
            .testTag("device_pairing.entry"),
        contentPadding = PaddingValues(
            start = spacing.large,
            top = spacing.large,
            end = spacing.large,
            bottom = spacing.doubleExtraLarge,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                Text(
                    text = stringResource(R.string.device_pairing_heading),
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(R.string.device_pairing_description),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                PairingStepCard(
                    number = 1,
                    icon = Icons.Default.VerifiedUser,
                    title = stringResource(R.string.device_pairing_step_claim_title),
                    description = stringResource(R.string.device_pairing_step_claim_description),
                )
                PairingStepCard(
                    number = 2,
                    icon = Icons.Default.Router,
                    title = stringResource(R.string.device_pairing_step_wifi_title),
                    description = stringResource(R.string.device_pairing_step_wifi_description),
                )
                PairingStepCard(
                    number = 3,
                    icon = Icons.Default.CloudDone,
                    title = stringResource(R.string.device_pairing_step_online_title),
                    description = stringResource(R.string.device_pairing_step_online_description),
                )
            }
        }

        item {
            Button(
                onClick = onScanQr,
                enabled = !state.isBusy,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("device_pairing.scan_qr"),
            ) {
                Icon(
                    imageVector = Icons.Default.QrCodeScanner,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                )
                Spacer(Modifier.size(spacing.small))
                Column {
                    Text(stringResource(R.string.device_pairing_scan_qr))
                    Text(
                        text = stringResource(R.string.device_pairing_scan_qr_description),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
            }
        }

        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
            ) {
                HorizontalDivider(Modifier.weight(1f))
                Text(
                    text = stringResource(R.string.device_pairing_or_manual),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                HorizontalDivider(Modifier.weight(1f))
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                OutlinedTextField(
                    value = state.manualDeviceId,
                    onValueChange = { onAction(DevicePairingUiAction.ManualDeviceIdChanged(it)) },
                    label = { Text(stringResource(R.string.device_pairing_device_id)) },
                    placeholder = { Text(stringResource(R.string.device_pairing_device_id_hint)) },
                    enabled = !state.isBusy,
                    isError = DeviceManualSetupField.DeviceId in state.manualFieldErrors,
                    supportingText = if (DeviceManualSetupField.DeviceId in state.manualFieldErrors) {
                        { Text(stringResource(R.string.device_pairing_invalid_device_id)) }
                    } else {
                        null
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Next,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.device_id"),
                )
                OutlinedTextField(
                    value = state.manualClaimCode,
                    onValueChange = { onAction(DevicePairingUiAction.ManualClaimCodeChanged(it)) },
                    label = { Text(stringResource(R.string.device_pairing_claim_code)) },
                    placeholder = { Text(stringResource(R.string.device_pairing_claim_code_hint)) },
                    enabled = !state.isBusy,
                    isError = DeviceManualSetupField.ClaimCode in state.manualFieldErrors,
                    supportingText = if (DeviceManualSetupField.ClaimCode in state.manualFieldErrors) {
                        { Text(stringResource(R.string.device_pairing_invalid_claim_code)) }
                    } else {
                        null
                    },
                    singleLine = true,
                    visualTransformation = if (showClaimCode) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    trailingIcon = {
                        IconButton(onClick = { showClaimCode = !showClaimCode }) {
                            Icon(
                                imageVector = if (showClaimCode) {
                                    Icons.Default.VisibilityOff
                                } else {
                                    Icons.Default.Visibility
                                },
                                contentDescription = stringResource(
                                    if (showClaimCode) {
                                        R.string.device_pairing_hide_claim_code
                                    } else {
                                        R.string.device_pairing_show_claim_code
                                    },
                                ),
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Next,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.claim_code"),
                )
                OutlinedTextField(
                    value = state.manualSetupSsid,
                    onValueChange = { onAction(DevicePairingUiAction.ManualSetupSsidChanged(it)) },
                    label = { Text(stringResource(R.string.device_pairing_manual_setup_ssid)) },
                    placeholder = { Text(stringResource(R.string.device_pairing_manual_setup_ssid_hint)) },
                    enabled = !state.isBusy,
                    isError = DeviceManualSetupField.SetupSsid in state.manualFieldErrors,
                    supportingText = if (DeviceManualSetupField.SetupSsid in state.manualFieldErrors) {
                        { Text(stringResource(R.string.device_pairing_invalid_setup_ssid)) }
                    } else {
                        null
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Next,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.setup_ssid"),
                )
                OutlinedTextField(
                    value = state.manualProofOfPossession,
                    onValueChange = { onAction(DevicePairingUiAction.ManualProofChanged(it)) },
                    label = { Text(stringResource(R.string.device_pairing_manual_setup_proof)) },
                    placeholder = { Text(stringResource(R.string.device_pairing_manual_setup_proof_hint)) },
                    enabled = !state.isBusy,
                    isError = DeviceManualSetupField.ProofOfPossession in state.manualFieldErrors,
                    supportingText = if (
                        DeviceManualSetupField.ProofOfPossession in state.manualFieldErrors
                    ) {
                        { Text(stringResource(R.string.device_pairing_invalid_setup_proof)) }
                    } else {
                        { Text(stringResource(R.string.device_pairing_manual_setup_help)) }
                    },
                    singleLine = true,
                    visualTransformation = if (showSetupProof) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    trailingIcon = {
                        IconButton(onClick = { showSetupProof = !showSetupProof }) {
                            Icon(
                                imageVector = if (showSetupProof) {
                                    Icons.Default.VisibilityOff
                                } else {
                                    Icons.Default.Visibility
                                },
                                contentDescription = stringResource(
                                    if (showSetupProof) {
                                        R.string.device_pairing_hide_setup_proof
                                    } else {
                                        R.string.device_pairing_show_setup_proof
                                    },
                                ),
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = { onAction(DevicePairingUiAction.SubmitManual) },
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.setup_proof"),
                )
                Button(
                    onClick = { onAction(DevicePairingUiAction.SubmitManual) },
                    enabled = !state.isBusy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("device_pairing.submit_manual"),
                ) {
                    Text(stringResource(R.string.device_pairing_submit_manual))
                }
            }
        }

        if (resolvedErrorMessage.isNotBlank() && state.manualFieldErrors.isEmpty()) {
            item { DevicePairingInlineError(state, resolvedErrorMessage) }
        }
    }
}

@Composable
private fun DevicePairingSetupContent(
    state: DevicePairingUiState,
    isPortalStep: Boolean,
    onOpenWifiSettings: () -> Unit,
    onOpenPortal: () -> Unit,
    onConfirmPortal: () -> Unit,
    onCopy: (label: String, value: String) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val ssidLabel = stringResource(R.string.device_pairing_setup_ssid)
    val passwordLabel = stringResource(R.string.device_pairing_setup_password)
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag(
                if (isPortalStep) {
                    "device_pairing.portal_guidance"
                } else {
                    "device_pairing.setup_ready"
                },
            ),
        contentPadding = PaddingValues(
            start = spacing.large,
            top = spacing.large,
            end = spacing.large,
            bottom = spacing.doubleExtraLarge,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                Text(
                    text = stringResource(
                        if (isPortalStep) {
                            R.string.device_pairing_portal_heading
                        } else {
                            R.string.device_pairing_setup_heading
                        },
                    ),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(
                        if (isPortalStep) {
                            R.string.device_pairing_portal_description
                        } else {
                            R.string.device_pairing_setup_description
                        },
                    ),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(
                    modifier = Modifier.padding(spacing.large),
                    verticalArrangement = Arrangement.spacedBy(spacing.large),
                ) {
                    Text(
                        text = stringResource(R.string.device_pairing_setup_network_heading),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    SetupCredentialRow(
                        label = ssidLabel,
                        value = state.setupSsid,
                        copyDescription = stringResource(R.string.device_pairing_copy_ssid),
                        onCopy = { onCopy(ssidLabel, state.setupSsid) },
                    )
                    HorizontalDivider()
                    SetupCredentialRow(
                        label = passwordLabel,
                        value = state.setupProofOfPossession,
                        copyDescription = stringResource(R.string.device_pairing_copy_password),
                        onCopy = { onCopy(passwordLabel, state.setupProofOfPossession) },
                    )
                    Text(
                        text = stringResource(R.string.device_pairing_setup_sensitive_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (!isPortalStep) {
            item {
                Button(
                    onClick = onOpenWifiSettings,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("device_pairing.open_wifi_settings"),
                ) {
                    Icon(Icons.Default.Router, contentDescription = null)
                    Spacer(Modifier.size(spacing.small))
                    Text(stringResource(R.string.device_pairing_open_wifi_settings))
                }
            }
        } else {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                    Text(
                        text = stringResource(R.string.device_pairing_portal_instruction),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(
                        onClick = onOpenWifiSettings,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .testTag("device_pairing.reopen_wifi_settings"),
                    ) {
                        Text(stringResource(R.string.device_pairing_reopen_wifi_settings))
                    }
                    Button(
                        onClick = onOpenPortal,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .testTag("device_pairing.open_portal"),
                    ) {
                        Text(stringResource(R.string.device_pairing_open_portal))
                    }
                    OutlinedButton(
                        onClick = onConfirmPortal,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp)
                            .testTag("device_pairing.confirm_portal"),
                    ) {
                        Text(stringResource(R.string.device_pairing_confirm_portal))
                    }
                }
            }
        }
    }
}

@Composable
private fun SetupCredentialRow(
    label: String,
    value: String,
    copyDescription: String,
    onCopy: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
    ) {
        Column(
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
        }
        OutlinedButton(
            onClick = onCopy,
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp),
        ) {
            Text(copyDescription)
        }
    }
}

@Composable
private fun DevicePairingAwaitingOnlineContent(
    state: DevicePairingUiState,
    onRetry: () -> Unit,
) {
    val resolvedErrorMessage = state.resolveErrorMessage()
    if (state.isBusy) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(ShcareTheme.spacing.extraLarge),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            CircularProgressIndicator(modifier = Modifier.size(40.dp))
            Spacer(Modifier.height(ShcareTheme.spacing.large))
            Text(
                text = stringResource(R.string.device_pairing_waiting_online_title),
                style = MaterialTheme.typography.titleLarge,
            )
            Spacer(Modifier.height(ShcareTheme.spacing.small))
            Text(
                text = stringResource(R.string.device_pairing_waiting_online),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    ShcareErrorState(
        title = stringResource(R.string.device_pairing_not_online_title),
        message = resolvedErrorMessage.ifBlank { stringResource(R.string.device_pairing_waiting_online) },
        retryLabel = stringResource(R.string.device_pairing_retry_online),
        onRetry = onRetry,
        modifier = Modifier
            .fillMaxSize()
            .testTag("device_pairing.retry_online"),
    )
}

@Composable
private fun PairingStepCard(
    number: Int,
    icon: ImageVector,
    title: String,
    description: String,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(ShcareTheme.spacing.large),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.Top,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
            ) {
                Text(
                    text = number.toString(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(24.dp),
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
            ) {
                Text(text = title, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DevicePairingInlineError(state: DevicePairingUiState, message: String) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Assertive }
            .testTag("device_pairing.error"),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(message, style = MaterialTheme.typography.bodyMedium)
            if (state.requestId.isNotBlank()) {
                Text(
                    text = stringResource(R.string.device_pairing_request_id, state.requestId),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

@Composable
private fun DevicePairingUiState.resolveErrorMessage(): String = when {
    errorMessage.isNotBlank() -> errorMessage
    errorMessageRes != null -> stringResource(errorMessageRes)
    else -> ""
}

@Composable
private fun DevicePairingUiState.resolveErrorMessageWithRequestId(fallback: String): String {
    val message = resolveErrorMessage().ifBlank { fallback }
    if (requestId.isBlank()) return message
    return "$message\n${stringResource(R.string.device_pairing_request_id, requestId)}"
}

private fun copySensitiveText(context: Context, label: String, value: String) {
    if (value.isBlank()) return
    val clip = ClipData.newPlainText(label, value)
    clip.description.extras = PersistableBundle().apply {
        putBoolean("android.content.extra.IS_SENSITIVE", true)
    }
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(clip)
}
