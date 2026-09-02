package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.devices.DeviceAccessRedeemUiAction
import com.example.smart_health_android.devices.DeviceAccessRedeemUiEffect
import com.example.smart_health_android.devices.DeviceAccessRedeemViewModel
import com.example.smart_health_android.devices.DeviceAccessRedeemViewModelFactory
import com.example.smart_health_android.devices.DevicePairingAuthoritySnapshot
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.theme.ShcareTheme
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.launch

@Composable
fun DeviceAccessRedeemScreen(
    expectedAuthority: DevicePairingAuthoritySnapshot?,
    currentAuthority: () -> DevicePairingAuthoritySnapshot?,
    onNavigateBack: () -> Unit,
    onDeviceGranted: (String) -> Unit,
    viewModel: DeviceAccessRedeemViewModel = viewModel(
        key = expectedAuthority?.let { authority ->
            "device-access-${authority.userId}-${authority.workspaceId}-${authority.authorityEpoch}"
        } ?: "device-access-authority-denied",
        factory = DeviceAccessRedeemViewModelFactory(
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
        ),
    ),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    val coroutineScope = rememberCoroutineScope()
    val scanFailedMessage = stringResource(R.string.device_access_scan_failed)
    val scanner = remember(context) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(context, options)
    }

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is DeviceAccessRedeemUiEffect.DeviceGranted -> onDeviceGranted(effect.deviceId)
            }
        }
    }

    DisposableEffect(viewModel) {
        onDispose { viewModel.onAction(DeviceAccessRedeemUiAction.Cancel) }
    }

    Scaffold(
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.device_access_title),
                onNavigateBack = {
                    viewModel.onAction(DeviceAccessRedeemUiAction.Cancel)
                    onNavigateBack()
                },
                backContentDescription = stringResource(R.string.device_access_back),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .consumeWindowInsets(innerPadding),
            contentAlignment = Alignment.TopCenter,
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 720.dp)
                    .testTag("device_access.entry"),
                contentPadding = PaddingValues(
                    horizontal = ShcareTheme.spacing.large,
                    vertical = ShcareTheme.spacing.extraLarge,
                ),
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
            ) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
                        Icon(
                            imageVector = Icons.Default.Key,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(36.dp),
                        )
                        Text(
                            text = stringResource(R.string.device_access_heading),
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(
                            text = stringResource(R.string.device_access_description),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                item {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface,
                        ),
                    ) {
                        Column(
                            modifier = Modifier.padding(ShcareTheme.spacing.large),
                            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
                        ) {
                            OutlinedTextField(
                                value = state.code,
                                onValueChange = {
                                    viewModel.onAction(DeviceAccessRedeemUiAction.CodeChanged(it))
                                },
                                enabled = !state.isSubmitting,
                                singleLine = true,
                                label = { Text(stringResource(R.string.device_access_code_label)) },
                                placeholder = {
                                    Text(stringResource(R.string.device_access_code_placeholder))
                                },
                                supportingText = {
                                    Text(stringResource(R.string.device_access_code_support))
                                },
                                keyboardOptions = KeyboardOptions(
                                    capitalization = KeyboardCapitalization.Characters,
                                ),
                                isError = state.errorMessageRes != null,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .testTag("device_access.code"),
                            )

                            if (state.errorMessageRes != null) {
                                Column(
                                    modifier = Modifier.semantics {
                                        liveRegion = LiveRegionMode.Assertive
                                    },
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Text(
                                        text = stringResource(state.errorMessageRes!!),
                                        color = MaterialTheme.colorScheme.error,
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    if (state.requestId.isNotBlank()) {
                                        Text(
                                            text = stringResource(
                                                R.string.device_access_request_id,
                                                state.requestId,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                }
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(
                                    ShcareTheme.spacing.medium,
                                ),
                            ) {
                                OutlinedButton(
                                    onClick = {
                                        scanner.startScan()
                                            .addOnSuccessListener { barcode ->
                                                viewModel.onAction(
                                                    DeviceAccessRedeemUiAction.QrScanned(
                                                        barcode.rawValue.orEmpty(),
                                                    ),
                                                )
                                            }
                                            .addOnFailureListener {
                                                snackbarHostState.currentSnackbarData?.dismiss()
                                                coroutineScope.launch {
                                                    snackbarHostState.showSnackbar(scanFailedMessage)
                                                }
                                            }
                                    },
                                    enabled = !state.isSubmitting,
                                    modifier = Modifier
                                        .weight(1f)
                                        .defaultMinSize(minHeight = 48.dp)
                                        .testTag("device_access.scan_qr"),
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.QrCodeScanner,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp),
                                    )
                                    Text(
                                        text = stringResource(R.string.device_access_scan_qr),
                                        modifier = Modifier.padding(start = 8.dp),
                                    )
                                }
                                Button(
                                    onClick = {
                                        viewModel.onAction(DeviceAccessRedeemUiAction.Submit)
                                    },
                                    enabled = !state.isSubmitting && state.code.isNotBlank(),
                                    modifier = Modifier
                                        .weight(1f)
                                        .defaultMinSize(minHeight = 48.dp)
                                        .testTag("device_access.submit"),
                                ) {
                                    if (state.isSubmitting) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(20.dp),
                                            strokeWidth = 2.dp,
                                            color = MaterialTheme.colorScheme.onPrimary,
                                        )
                                    } else {
                                        Text(stringResource(R.string.device_access_submit))
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        ),
                    ) {
                        Row(
                            modifier = Modifier.padding(ShcareTheme.spacing.large),
                            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
                            verticalAlignment = Alignment.Top,
                        ) {
                            Icon(
                                imageVector = Icons.Default.Shield,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSecondaryContainer,
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    text = stringResource(R.string.device_access_security_title),
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = stringResource(R.string.device_access_security_message),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
