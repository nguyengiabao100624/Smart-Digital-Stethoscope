package com.example.smart_health_android.ui.screens

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.example.smart_health_android.R
import com.example.smart_health_android.devices.DeviceManualSetupField
import com.example.smart_health_android.devices.DeviceCurrentWifiSsidState
import com.example.smart_health_android.devices.DevicePairingFailureKind
import com.example.smart_health_android.devices.DevicePairingStage
import com.example.smart_health_android.devices.DevicePairingUiAction
import com.example.smart_health_android.devices.DevicePairingUiEffect
import com.example.smart_health_android.devices.DevicePairingUiState
import com.example.smart_health_android.devices.DevicePairingAuthoritySnapshot
import com.example.smart_health_android.devices.DevicePairingViewModel
import com.example.smart_health_android.devices.DeviceProvisioningProgress
import com.example.smart_health_android.devices.DevicePairingViewModelFactory
import com.example.smart_health_android.devices.DeviceTargetWifiField
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DevicePairingScreen(
    onNavigateBack: () -> Unit,
    onConnectionSuccess: (deviceName: String) -> Unit,
    onDeviceRegistered: (deviceId: String) -> Unit = {},
    initialWifiSetupDeviceId: String? = null,
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
    val isWifiSetupSurface = initialWifiSetupDeviceId
        ?.trim()
        ?.isNotEmpty()
        ?: false
    val snackbarHostState = remember { SnackbarHostState() }
    val lifecycleOwner = LocalLifecycleOwner.current
    val context = LocalContext.current
    val locationSettingsError = stringResource(R.string.device_pairing_location_settings_error)
    val wifiAccessPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        viewModel.onAction(
            DevicePairingUiAction.WifiAccessPermissionResult(
                granted = grants.isNotEmpty() && grants.values.all { it },
            ),
        )
    }
    val currentWifiSsidPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        viewModel.onAction(
            DevicePairingUiAction.CurrentWifiSsidPermissionResult(
                granted = grants.isNotEmpty() && grants.values.all { it },
            ),
        )
    }

    BackHandler {
        viewModel.onAction(DevicePairingUiAction.Cancel)
        onNavigateBack()
    }

    LaunchedEffect(initialWifiSetupDeviceId, viewModel) {
        initialWifiSetupDeviceId
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?.let { deviceId ->
                viewModel.onAction(DevicePairingUiAction.OpenWifiSetup(deviceId))
            }
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
                    is DevicePairingUiEffect.RequestCurrentWifiSsidPermissions -> {
                        currentWifiSsidPermissionLauncher.launch(effect.permissions.toTypedArray())
                    }

                    is DevicePairingUiEffect.RequestWifiAccessPermissions -> {
                        wifiAccessPermissionLauncher.launch(effect.permissions.toTypedArray())
                    }

                    DevicePairingUiEffect.OpenSystemLocationSettings -> {
                        runCatching {
                            context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                        }.onFailure {
                            snackbarHostState.showSnackbar(locationSettingsError)
                        }
                    }

                    is DevicePairingUiEffect.DeviceOnlineConfirmed -> {
                        onConnectionSuccess(effect.deviceName)
                    }

                    is DevicePairingUiEffect.DeviceRegistered -> {
                        onDeviceRegistered(effect.deviceId)
                    }
                }
            }
        }
    }

    Scaffold(
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(
                    if (isWifiSetupSurface) {
                        R.string.device_wifi_setup_title
                    } else {
                        R.string.device_pairing_title
                    },
                ),
                onNavigateBack = {
                    viewModel.onAction(DevicePairingUiAction.Cancel)
                    onNavigateBack()
                },
                backContentDescription = stringResource(
                    if (isWifiSetupSurface) {
                        R.string.device_wifi_setup_back
                    } else {
                        R.string.device_pairing_back
                    },
                ),
                backModifier = Modifier.testTag(
                    if (isWifiSetupSurface) "device_wifi.back" else "device_pairing.back",
                ),
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
                    .testTag(
                        if (isWifiSetupSurface) {
                            "device_wifi.surface"
                        } else {
                            "device_pairing.surface"
                        },
                    )
                    .align(Alignment.TopCenter),
            ) {
                when (state.stage) {
                DevicePairingStage.Entry -> {
                    if (isWifiSetupSurface) {
                        ShcareLoadingState(
                            message = stringResource(R.string.device_wifi_setup_preparing),
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("device_wifi.preparing"),
                        )
                    } else {
                        DevicePairingEntryContent(
                            state = state,
                            onAction = viewModel::onAction,
                        )
                    }
                }

                DevicePairingStage.Claiming -> ShcareLoadingState(
                    message = stringResource(R.string.device_pairing_claiming),
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("device_pairing.claiming"),
                )

                DevicePairingStage.PreparingWifi -> ShcareLoadingState(
                    message = stringResource(R.string.device_pairing_preparing_wifi),
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("device_pairing.preparing_wifi"),
                )

                DevicePairingStage.ClaimFailed -> {
                    if (isWifiSetupSurface) {
                        DeviceWifiSetupFailure(
                            state = state,
                            onNavigateBack = onNavigateBack,
                            onRetry = {
                                viewModel.onAction(DevicePairingUiAction.RetryWifiSetup)
                            },
                        )
                    } else if (
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
                            message = buildString {
                                append(
                                    state.resolveErrorMessageWithRequestId(
                                        fallback = stringResource(R.string.device_pairing_claim_failed_message),
                                    ),
                                )
                                if (state.failureKind == DevicePairingFailureKind.Permission) {
                                    append("\n\n")
                                    append(stringResource(R.string.device_pairing_permission_guidance))
                                }
                            },
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
                    onTargetSsidChanged = {
                        viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged(it))
                    },
                    onTargetPasswordChanged = {
                        viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged(it))
                    },
                    onStartLocalProvisioning = {
                        viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
                    },
                    onUseCurrentWifiSsid = {
                        viewModel.onAction(DevicePairingUiAction.UseCurrentWifiSsid)
                    },
                )

                DevicePairingStage.Provisioning -> DevicePairingProvisioningContent(
                    state = state,
                    modifier = Modifier.fillMaxSize(),
                    testTag = "device_pairing.provisioning",
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
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("device_pairing.online"),
                )
                }
            }
        }
    }
}

@Composable
fun DeviceWifiSetupScreen(
    deviceId: String,
    onNavigateBack: () -> Unit,
    onWifiConfigured: (deviceName: String) -> Unit,
    expectedAuthority: DevicePairingAuthoritySnapshot? = null,
    currentAuthority: () -> DevicePairingAuthoritySnapshot? = { expectedAuthority },
    viewModel: DevicePairingViewModel = viewModel(
        key = expectedAuthority?.let { authority ->
            "device-wifi-${deviceId.trim()}-${authority.userId}-${authority.workspaceId}-${authority.authorityEpoch}"
        } ?: "device-wifi-authority-denied",
        factory = DevicePairingViewModelFactory(
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
        ),
    ),
) {
    DevicePairingScreen(
        onNavigateBack = onNavigateBack,
        onConnectionSuccess = onWifiConfigured,
        initialWifiSetupDeviceId = deviceId,
        expectedAuthority = expectedAuthority,
        currentAuthority = currentAuthority,
        viewModel = viewModel,
    )
}

@Composable
private fun DeviceWifiSetupFailure(
    state: DevicePairingUiState,
    onNavigateBack: () -> Unit,
    onRetry: () -> Unit,
) {
    val isPermissionFailure = state.failureKind in setOf(
        DevicePairingFailureKind.Permission,
        DevicePairingFailureKind.Session,
    )
    val fallback = stringResource(R.string.device_wifi_setup_failed_message)
    if (isPermissionFailure) {
        ShcarePermissionState(
            title = stringResource(R.string.device_wifi_setup_unavailable_title),
            message = state.resolveErrorMessageWithRequestId(fallback = fallback),
            actionLabel = stringResource(R.string.device_wifi_setup_back),
            onRequestPermission = onNavigateBack,
            modifier = Modifier
                .fillMaxSize()
                .testTag("device_wifi.permission_denied"),
        )
    } else {
        ShcareErrorState(
            title = stringResource(R.string.device_wifi_setup_failed_title),
            message = state.resolveErrorMessageWithRequestId(fallback = fallback),
            retryLabel = stringResource(R.string.device_wifi_setup_retry),
            onRetry = onRetry,
            modifier = Modifier
                .fillMaxSize()
                .testTag("device_wifi.error"),
        )
    }
}

@Composable
private fun DevicePairingEntryContent(
    state: DevicePairingUiState,
    onAction: (DevicePairingUiAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val resolvedErrorMessage = state.resolveErrorMessage()
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
            Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                OutlinedTextField(
                    value = state.manualDeviceId,
                    onValueChange = { onAction(DevicePairingUiAction.ManualDeviceIdChanged(it)) },
                    label = { Text(stringResource(R.string.device_pairing_device_id)) },
                    placeholder = { Text(stringResource(R.string.device_pairing_device_id_hint)) },
                    enabled = !state.isBusy,
                    isError = DeviceManualSetupField.DeviceId in state.manualFieldErrors,
                    supportingText = if (DeviceManualSetupField.DeviceId in state.manualFieldErrors) {
                        {
                            Text(
                                stringResource(R.string.device_pairing_invalid_device_id),
                                modifier = Modifier.testTag("device_pairing.device_id.error"),
                            )
                        }
                    } else {
                        null
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = { onAction(DevicePairingUiAction.SubmitManual) },
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.device_id"),
                )
                Button(
                    onClick = { onAction(DevicePairingUiAction.SubmitManual) },
                    enabled = !state.isBusy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.submit_manual")
                        .heightIn(min = 48.dp),
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
    onTargetSsidChanged: (String) -> Unit,
    onTargetPasswordChanged: (String) -> Unit,
    onStartLocalProvisioning: () -> Unit,
    onUseCurrentWifiSsid: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    var showTargetPassword by rememberSaveable(state.claimedDeviceId) { mutableStateOf(false) }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("device_pairing.setup_ready"),
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
                    text = stringResource(R.string.device_pairing_setup_heading),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(R.string.device_pairing_setup_description),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                Text(
                    text = stringResource(R.string.device_pairing_target_wifi_heading),
                    style = MaterialTheme.typography.titleMedium,
                )
                OutlinedTextField(
                    value = state.targetWifiSsid,
                    onValueChange = onTargetSsidChanged,
                    label = { Text(stringResource(R.string.device_pairing_target_wifi_ssid)) },
                    placeholder = {
                        Text(stringResource(R.string.device_pairing_target_wifi_ssid_hint))
                    },
                    singleLine = true,
                    isError = DeviceTargetWifiField.Ssid in state.targetWifiFieldErrors,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.target_wifi_ssid"),
                )
                if (state.currentWifiSsidState != DeviceCurrentWifiSsidState.Idle) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(spacing.small),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Wifi,
                            contentDescription = null,
                            tint = if (
                                state.currentWifiSsidState == DeviceCurrentWifiSsidState.Detected
                            ) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                            modifier = Modifier.size(20.dp),
                        )
                        Text(
                            text = stringResource(
                                when (state.currentWifiSsidState) {
                                    DeviceCurrentWifiSsidState.Detected ->
                                        R.string.device_pairing_current_wifi_detected
                                    DeviceCurrentWifiSsidState.Manual ->
                                        R.string.device_pairing_current_wifi_manual
                                    DeviceCurrentWifiSsidState.LocationDisabled ->
                                        R.string.device_pairing_current_wifi_location_disabled
                                    DeviceCurrentWifiSsidState.PermissionRequired,
                                    DeviceCurrentWifiSsidState.Unavailable,
                                    -> R.string.device_pairing_current_wifi_unavailable
                                    DeviceCurrentWifiSsidState.Idle ->
                                        R.string.device_pairing_current_wifi_unavailable
                                },
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (
                    state.currentWifiSsidState in setOf(
                        DeviceCurrentWifiSsidState.Idle,
                        DeviceCurrentWifiSsidState.PermissionRequired,
                        DeviceCurrentWifiSsidState.LocationDisabled,
                        DeviceCurrentWifiSsidState.Unavailable,
                    )
                ) {
                    TextButton(
                        onClick = onUseCurrentWifiSsid,
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .testTag("device_pairing.use_current_wifi"),
                    ) {
                        Text(
                            stringResource(
                                if (
                                    state.currentWifiSsidState ==
                                    DeviceCurrentWifiSsidState.LocationDisabled
                                ) {
                                    R.string.device_pairing_enable_location
                                } else {
                                    R.string.device_pairing_use_current_wifi
                                },
                            ),
                        )
                    }
                }
                OutlinedTextField(
                    value = state.targetWifiPassword,
                    onValueChange = onTargetPasswordChanged,
                    label = { Text(stringResource(R.string.device_pairing_target_wifi_password)) },
                    placeholder = {
                        Text(stringResource(R.string.device_pairing_target_wifi_password_hint))
                    },
                    singleLine = true,
                    isError = DeviceTargetWifiField.Password in state.targetWifiFieldErrors,
                    visualTransformation = if (showTargetPassword) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    trailingIcon = {
                        IconButton(onClick = { showTargetPassword = !showTargetPassword }) {
                            Icon(
                                imageVector = if (showTargetPassword) {
                                    Icons.Default.VisibilityOff
                                } else {
                                    Icons.Default.Visibility
                                },
                                contentDescription = stringResource(
                                    if (showTargetPassword) {
                                        R.string.device_pairing_hide_target_wifi_password
                                    } else {
                                        R.string.device_pairing_show_target_wifi_password
                                    },
                                ),
                            )
                        }
                    },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(onDone = { onStartLocalProvisioning() }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("device_pairing.target_wifi_password"),
                )
                Text(
                    text = stringResource(R.string.device_pairing_target_wifi_help),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = onStartLocalProvisioning,
                    enabled = !state.isBusy,
                    modifier = Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("device_pairing.provision_in_app"),
                ) {
                    Icon(Icons.Default.Wifi, contentDescription = null)
                    Spacer(Modifier.size(spacing.small))
                    Text(stringResource(R.string.device_pairing_connect_in_app))
                }
                val errorMessage = state.resolveErrorMessage()
                if (errorMessage.isNotBlank()) {
                    DevicePairingInlineError(state, errorMessage)
                }
                if (state.provisioningProgress.isFailure()) {
                    DevicePairingConnectionTrace(state.provisioningProgress)
                }
            }
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
        DevicePairingProvisioningContent(
            state = state,
            modifier = Modifier.fillMaxSize(),
            testTag = "device_pairing.awaiting_online",
        )
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
private fun DevicePairingProvisioningContent(
    state: DevicePairingUiState,
    modifier: Modifier = Modifier,
    testTag: String,
) {
    val spacing = ShcareTheme.spacing
    val progress = state.provisioningProgress
    LazyColumn(
        modifier = modifier.testTag(testTag),
        contentPadding = PaddingValues(
            start = spacing.large,
            top = spacing.extraLarge,
            end = spacing.large,
            bottom = spacing.doubleExtraLarge,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                Text(
                    text = stringResource(R.string.device_pairing_progress_title),
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = stringResource(progress.messageRes()),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
        item {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            DevicePairingConnectionTrace(progress)
        }
    }
}

private enum class DeviceProvisioningTraceStatus {
    Pending,
    Active,
    Complete,
    NoDirectResponse,
    Failed,
}

private data class DeviceProvisioningTraceStep(
    val titleRes: Int,
)

private val DeviceProvisioningTraceSteps = listOf(
    DeviceProvisioningTraceStep(R.string.device_pairing_trace_network),
    DeviceProvisioningTraceStep(R.string.device_pairing_trace_prepare),
    DeviceProvisioningTraceStep(R.string.device_pairing_trace_broadcast),
    DeviceProvisioningTraceStep(R.string.device_pairing_trace_received),
    DeviceProvisioningTraceStep(R.string.device_pairing_trace_wait),
    DeviceProvisioningTraceStep(R.string.device_pairing_trace_online),
)

@Composable
private fun DevicePairingConnectionTrace(progress: DeviceProvisioningProgress) {
    val spacing = ShcareTheme.spacing
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
        ),
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite }
            .testTag("device_pairing.connection_trace"),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.extraSmall)) {
                Text(
                    text = stringResource(R.string.device_pairing_trace_title),
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = stringResource(R.string.device_pairing_trace_privacy),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            DeviceProvisioningTraceSteps.forEachIndexed { index, step ->
                DevicePairingTraceRow(
                    title = stringResource(step.titleRes),
                    status = progress.traceStatus(index),
                )
                if (index < DeviceProvisioningTraceSteps.lastIndex) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}

@Composable
private fun DevicePairingTraceRow(
    title: String,
    status: DeviceProvisioningTraceStatus,
) {
    val semanticColors = ShcareTheme.colors
    val tint = when (status) {
        DeviceProvisioningTraceStatus.Complete -> semanticColors.success
        DeviceProvisioningTraceStatus.Active -> semanticColors.info
        DeviceProvisioningTraceStatus.NoDirectResponse -> semanticColors.warning
        DeviceProvisioningTraceStatus.Failed -> MaterialTheme.colorScheme.error
        DeviceProvisioningTraceStatus.Pending -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val statusRes = when (status) {
        DeviceProvisioningTraceStatus.Complete -> R.string.device_pairing_trace_complete
        DeviceProvisioningTraceStatus.Active -> R.string.device_pairing_trace_active
        DeviceProvisioningTraceStatus.NoDirectResponse ->
            R.string.device_pairing_trace_no_direct_response
        DeviceProvisioningTraceStatus.Failed -> R.string.device_pairing_trace_failed
        DeviceProvisioningTraceStatus.Pending -> R.string.device_pairing_trace_pending
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (status) {
            DeviceProvisioningTraceStatus.Active -> CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                color = tint,
                strokeWidth = 2.dp,
            )

            DeviceProvisioningTraceStatus.Complete -> Icon(
                imageVector = Icons.Default.CheckCircle,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(22.dp),
            )

            DeviceProvisioningTraceStatus.NoDirectResponse -> Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(22.dp),
            )

            DeviceProvisioningTraceStatus.Failed -> Icon(
                imageVector = Icons.Default.ErrorOutline,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(22.dp),
            )

            DeviceProvisioningTraceStatus.Pending -> Icon(
                imageVector = Icons.Default.Router,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(22.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(text = title, style = MaterialTheme.typography.bodyMedium)
            Text(
                text = stringResource(statusRes),
                style = MaterialTheme.typography.labelMedium,
                color = tint,
            )
        }
    }
}

private fun DeviceProvisioningProgress.messageRes(): Int = when (this) {
    DeviceProvisioningProgress.Idle -> R.string.device_pairing_progress_idle
    DeviceProvisioningProgress.CheckingTargetNetwork ->
        R.string.device_pairing_progress_connecting_setup
    DeviceProvisioningProgress.PreparingSecureSession ->
        R.string.device_pairing_progress_validating_device
    DeviceProvisioningProgress.BroadcastingCredentials ->
        R.string.device_pairing_progress_sending_wifi
    DeviceProvisioningProgress.BroadcastCompletedWithoutDirectResponse ->
        R.string.device_pairing_progress_waiting_online
    DeviceProvisioningProgress.DeviceAcknowledged ->
        R.string.device_pairing_progress_restarting_device
    DeviceProvisioningProgress.WaitingForDeviceOnline ->
        R.string.device_pairing_progress_waiting_online
    DeviceProvisioningProgress.WaitingForDeviceOnlineWithoutDirectResponse ->
        R.string.device_pairing_progress_waiting_online
    DeviceProvisioningProgress.CheckingDeviceOnline ->
        R.string.device_pairing_progress_checking_online
    DeviceProvisioningProgress.CheckingDeviceOnlineWithoutDirectResponse ->
        R.string.device_pairing_progress_checking_online
    DeviceProvisioningProgress.TargetNetworkUnavailable ->
        R.string.device_pairing_progress_setup_network_unavailable
    DeviceProvisioningProgress.SmartConfigFailed ->
        R.string.device_pairing_progress_local_api_failed
    DeviceProvisioningProgress.DeviceNotOnline ->
        R.string.device_pairing_progress_device_not_online
    DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse ->
        R.string.device_pairing_progress_device_not_online_no_direct_response
    DeviceProvisioningProgress.DeviceOnline ->
        R.string.device_pairing_online_confirmed
}

private fun DeviceProvisioningProgress.isFailure(): Boolean = this in setOf(
    DeviceProvisioningProgress.TargetNetworkUnavailable,
    DeviceProvisioningProgress.SmartConfigFailed,
    DeviceProvisioningProgress.DeviceNotOnline,
    DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse,
)

private fun DeviceProvisioningProgress.traceStatus(index: Int): DeviceProvisioningTraceStatus {
    if (this in setOf(
            DeviceProvisioningProgress.BroadcastCompletedWithoutDirectResponse,
            DeviceProvisioningProgress.WaitingForDeviceOnlineWithoutDirectResponse,
            DeviceProvisioningProgress.CheckingDeviceOnlineWithoutDirectResponse,
            DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse,
        )
    ) {
        return when (index) {
            in 0..2 -> DeviceProvisioningTraceStatus.Complete
            3 -> DeviceProvisioningTraceStatus.NoDirectResponse
            4 -> if (this == DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse) {
                DeviceProvisioningTraceStatus.Failed
            } else {
                DeviceProvisioningTraceStatus.Active
            }

            else -> DeviceProvisioningTraceStatus.Pending
        }
    }
    val (completedThrough, activeIndex, failedIndex) = when (this) {
        DeviceProvisioningProgress.Idle -> Triple(-1, null, null)
        DeviceProvisioningProgress.CheckingTargetNetwork -> Triple(-1, 0, null)
        DeviceProvisioningProgress.PreparingSecureSession -> Triple(0, 1, null)
        DeviceProvisioningProgress.BroadcastingCredentials -> Triple(1, 2, null)
        DeviceProvisioningProgress.BroadcastCompletedWithoutDirectResponse,
        DeviceProvisioningProgress.WaitingForDeviceOnlineWithoutDirectResponse,
        DeviceProvisioningProgress.CheckingDeviceOnlineWithoutDirectResponse,
        DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse ->
            error("Handled above")
        DeviceProvisioningProgress.DeviceAcknowledged -> Triple(2, 3, null)
        DeviceProvisioningProgress.WaitingForDeviceOnline,
        DeviceProvisioningProgress.CheckingDeviceOnline -> Triple(3, 4, null)
        DeviceProvisioningProgress.TargetNetworkUnavailable -> Triple(-1, null, 0)
        DeviceProvisioningProgress.SmartConfigFailed -> Triple(1, null, 2)
        DeviceProvisioningProgress.DeviceNotOnline -> Triple(4, null, 4)
        DeviceProvisioningProgress.DeviceOnline -> Triple(5, null, null)
    }
    return when {
        index == failedIndex -> DeviceProvisioningTraceStatus.Failed
        index == activeIndex -> DeviceProvisioningTraceStatus.Active
        index <= completedThrough -> DeviceProvisioningTraceStatus.Complete
        else -> DeviceProvisioningTraceStatus.Pending
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
