package com.example.smart_health_android.ui.screens

import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.scan.NewScanFailure
import com.example.smart_health_android.scan.NewScanLoadState
import com.example.smart_health_android.scan.NewScanReadinessCheck
import com.example.smart_health_android.scan.NewScanType
import com.example.smart_health_android.scan.NewScanUiAction
import com.example.smart_health_android.scan.NewScanUiEffect
import com.example.smart_health_android.scan.NewScanUiState
import com.example.smart_health_android.scan.NewScanViewModel
import com.example.smart_health_android.scan.NewScanViewModelFactory
import com.example.smart_health_android.scan.ScanBodySite
import com.example.smart_health_android.scan.isEligibleForScan
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.util.Locale
import kotlinx.coroutines.flow.collectLatest

@Composable
fun NewScanScreen(
    onNavigateBack: () -> Unit,
    onScanStarted: (String) -> Unit,
    showBackNavigation: Boolean = true,
    viewModel: NewScanViewModel = viewModel(factory = NewScanViewModelFactory()),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(viewModel) {
        viewModel.effects.collectLatest { effect ->
            when (effect) {
                is NewScanUiEffect.BackendAccepted -> onScanStarted(effect.scanId)
            }
        }
    }

    NewScanContent(
        state = state,
        onAction = viewModel::onAction,
        onNavigateBack = onNavigateBack,
        showBackNavigation = showBackNavigation,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun NewScanContent(
    state: NewScanUiState,
    onAction: (NewScanUiAction) -> Unit,
    onNavigateBack: () -> Unit,
    showBackNavigation: Boolean,
) {
    val semanticColors = ShcareTheme.colors
    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .testTag("new_scan.screen"),
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            Box(
                modifier = Modifier.background(
                    Brush.horizontalGradient(
                        listOf(
                            semanticColors.brandHeaderStart,
                            semanticColors.brandHeaderEnd,
                        ),
                    ),
                ),
            ) {
                TopAppBar(
                    title = {
                        Text(
                            text = stringResource(R.string.new_scan_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.testTag("new_scan.title"),
                        )
                    },
                    navigationIcon = {
                        if (showBackNavigation) {
                            IconButton(
                                onClick = onNavigateBack,
                                modifier = Modifier
                                    .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                                    .testTag("new_scan.back"),
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                                    contentDescription = stringResource(R.string.shcare_action_back),
                                )
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        titleContentColor = semanticColors.onBrandHeader,
                        navigationIconContentColor = semanticColors.onBrandHeader,
                    ),
                )
            }
        },
        bottomBar = {
            if (state.loadState == NewScanLoadState.Content) {
                NewScanStartBar(state = state, onAction = onAction)
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (state.loadState) {
                NewScanLoadState.Loading -> ShcareLoadingState(
                    modifier = Modifier.fillMaxSize(),
                    message = stringResource(R.string.new_scan_loading),
                )
                NewScanLoadState.Offline -> ShcareOfflineState(
                    onRetry = { onAction(NewScanUiAction.Retry) },
                    modifier = Modifier.fillMaxSize(),
                    message = newScanStateMessage(
                        base = stringResource(R.string.new_scan_offline_error),
                        requestId = state.requestId,
                    ),
                    retryLabel = stringResource(R.string.new_scan_retry),
                )
                NewScanLoadState.Permission -> ShcarePermissionState(
                    onRequestPermission = { onAction(NewScanUiAction.Retry) },
                    modifier = Modifier.fillMaxSize(),
                    title = stringResource(R.string.new_scan_permission_title),
                    message = newScanStateMessage(
                        base = stringResource(R.string.new_scan_permission_message),
                        requestId = state.requestId,
                    ),
                    actionLabel = stringResource(R.string.new_scan_retry),
                )
                NewScanLoadState.Error -> ShcareErrorState(
                    onRetry = { onAction(NewScanUiAction.Retry) },
                    modifier = Modifier.fillMaxSize(),
                    title = stringResource(R.string.new_scan_error_title),
                    message = newScanStateMessage(
                        base = stringResource(R.string.new_scan_error_message),
                        requestId = state.requestId,
                    ),
                    retryLabel = stringResource(R.string.new_scan_retry),
                )
                NewScanLoadState.Content -> NewScanForm(
                    state = state,
                    onAction = onAction,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun NewScanStartBar(
    state: NewScanUiState,
    onAction: (NewScanUiAction) -> Unit,
) {
    Card(
        shape = RectangleShape,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Button(
                onClick = { onAction(NewScanUiAction.Submit) },
                enabled = state.canStart,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 56.dp)
                    .testTag("new_scan.start"),
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp,
                    )
                    Spacer(modifier = Modifier.size(10.dp))
                }
                Text(
                    text = stringResource(
                        if (state.isSubmitting) R.string.new_scan_starting
                        else R.string.new_scan_start,
                    ),
                    style = MaterialTheme.typography.labelLarge,
                )
                if (!state.isSubmitting) {
                    Spacer(modifier = Modifier.size(8.dp))
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                        contentDescription = null,
                    )
                }
            }
            Text(
                text = stringResource(R.string.new_scan_start_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun NewScanForm(
    state: NewScanUiState,
    onAction: (NewScanUiAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(start = 16.dp, top = 20.dp, end = 16.dp, bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "intro") {
            Text(
                text = stringResource(R.string.new_scan_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (state.failure != NewScanFailure.None) {
            item(key = "failure") {
                NewScanFailurePane(state = state, onAction = onAction)
            }
        }

        item(key = "profiles-heading") {
            NewScanSectionHeader(
                title = stringResource(R.string.new_scan_profiles_heading),
                icon = Icons.Default.AccountCircle,
            )
        }
        if (state.profiles.isEmpty()) {
            item(key = "profiles-empty") {
                InlineEmptyPane(
                    title = stringResource(R.string.new_scan_no_profile_title),
                    message = stringResource(R.string.new_scan_no_profile_message),
                )
            }
        } else {
            items(state.profiles, key = { "profile-${it.id}" }) { profile ->
                ProfileChoice(
                    profile = profile,
                    selected = profile.id == state.selectedProfileId,
                    enabled = !state.isSubmitting && !state.isCreatingProfile,
                    onSelected = { onAction(NewScanUiAction.ProfileSelected(profile.id)) },
                )
            }
        }

        item(key = "create-profile") {
            CreateProfilePane(state = state, onAction = onAction)
        }

        item(key = "profile-device-divider") {
            SectionDivider()
        }
        item(key = "devices-heading") {
            NewScanSectionHeader(
                title = stringResource(R.string.new_scan_device_heading),
                description = stringResource(R.string.new_scan_device_description),
                icon = Icons.Default.GraphicEq,
            )
        }
        if (state.devices.isEmpty()) {
            item(key = "devices-empty") {
                InlineEmptyPane(
                    title = stringResource(R.string.new_scan_no_device_title),
                    message = stringResource(R.string.new_scan_no_device_message),
                )
            }
        } else {
            items(state.devices, key = { "device-${it.id}" }) { device ->
                DeviceChoice(
                    device = device,
                    selectedProfile = state.selectedProfile,
                    selected = device.id == state.selectedDeviceId,
                    enabled = !state.isSubmitting && !state.isCreatingProfile,
                    onSelected = { onAction(NewScanUiAction.DeviceSelected(device.id)) },
                )
            }
        }

        item(key = "device-type-divider") {
            SectionDivider()
        }
        item(key = "type-heading") {
            NewScanSectionHeader(
                title = stringResource(R.string.new_scan_type_heading),
                icon = Icons.Default.Favorite,
            )
        }
        items(NewScanType.entries, key = { "type-${it.wireValue}" }) { scanType ->
            ScanTypeChoice(
                scanType = scanType,
                selected = scanType == state.scanType,
                enabled = !state.isSubmitting,
                onSelected = { onAction(NewScanUiAction.ScanTypeSelected(scanType)) },
            )
        }

        item(key = "type-site-divider") {
            SectionDivider()
        }
        item(key = "site-heading") {
            NewScanSectionHeader(
                title = stringResource(R.string.new_scan_body_site_heading),
                description = stringResource(R.string.new_scan_body_site_description),
                icon = Icons.Default.CheckCircle,
            )
        }
        items(state.availableBodySites, key = { "site-${it.wireValue}" }) { bodySite ->
            BodySiteChoice(
                bodySite = bodySite,
                selected = bodySite == state.selectedBodySite,
                enabled = !state.isSubmitting,
                onSelected = { onAction(NewScanUiAction.BodySiteSelected(bodySite)) },
            )
        }

        item(key = "site-readiness-divider") {
            SectionDivider()
        }
        item(key = "readiness-heading") {
            NewScanSectionHeader(
                title = stringResource(R.string.new_scan_readiness_heading),
                description = stringResource(R.string.new_scan_readiness_description),
                icon = Icons.Default.WarningAmber,
            )
        }
        items(NewScanReadinessCheck.entries, key = { "readiness-${it.name}" }) { item ->
            ReadinessChoice(
                item = item,
                checked = item in state.readiness,
                enabled = !state.isSubmitting,
                onToggle = { onAction(NewScanUiAction.ReadinessToggled(item)) },
            )
        }

        item(key = "readiness-notes-divider") {
            SectionDivider()
        }
        item(key = "notes") {
            NewScanSectionHeader(
                title = stringResource(R.string.new_scan_notes_heading),
                description = stringResource(R.string.new_scan_notes_optional),
            )
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedTextField(
                value = state.notes,
                onValueChange = { onAction(NewScanUiAction.NotesChanged(it)) },
                enabled = !state.isSubmitting,
                label = { Text(stringResource(R.string.new_scan_notes_label)) },
                supportingText = {
                    Text(stringResource(R.string.new_scan_notes_count, state.notes.length))
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 128.dp)
                    .testTag("new_scan.notes"),
                minLines = 3,
                maxLines = 6,
            )
        }
    }
}

@Composable
private fun NewScanSectionHeader(
    title: String,
    description: String? = null,
    icon: ImageVector? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { heading() },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            icon?.let {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(22.dp),
                )
            }
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.SemiBold,
            )
        }
        if (!description.isNullOrBlank()) {
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ProfileChoice(
    profile: Patient,
    selected: Boolean,
    enabled: Boolean,
    onSelected: () -> Unit,
) {
    val profileDescription = listOf(profile.relationship, profile.patientCode)
        .filter(String::isNotBlank)
        .joinToString(" • ")
    val description = if (profileDescription.isBlank()) {
        stringResource(R.string.new_scan_profile_fallback)
    } else {
        profileDescription
    }
    SelectableSurface(
        selected = selected,
        enabled = enabled,
        onSelected = onSelected,
        modifier = Modifier.testTag("new_scan.profile.${profile.id}"),
        stateDescription = if (selected) {
            stringResource(R.string.new_scan_profile_selected, profile.name)
        } else {
            stringResource(R.string.new_scan_profile_not_selected, profile.name)
        },
    ) {
        Icon(
            imageVector = Icons.Default.AccountCircle,
            contentDescription = null,
            tint = if (selected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = profile.name.ifBlank { profile.patientCode.ifBlank { profile.id } },
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        RadioButton(
            selected = selected,
            onClick = null,
            enabled = enabled,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

@Composable
private fun CreateProfilePane(
    state: NewScanUiState,
    onAction: (NewScanUiAction) -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.new_scan_add_profile_heading),
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.SemiBold,
            )
            OutlinedTextField(
                value = state.profileName,
                onValueChange = { onAction(NewScanUiAction.ProfileNameChanged(it)) },
                enabled = !state.isCreatingProfile && !state.isSubmitting,
                isError = state.profileNameInvalid,
                label = { Text(stringResource(R.string.new_scan_profile_name_label)) },
                supportingText = if (state.profileNameInvalid) {
                    { Text(stringResource(R.string.new_scan_profile_name_error)) }
                } else {
                    null
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("new_scan.profile_name"),
                singleLine = true,
            )
            OutlinedTextField(
                value = state.relationship,
                onValueChange = { onAction(NewScanUiAction.RelationshipChanged(it)) },
                enabled = !state.isCreatingProfile && !state.isSubmitting,
                isError = state.relationshipInvalid,
                label = { Text(stringResource(R.string.new_scan_relationship_label)) },
                placeholder = { Text(stringResource(R.string.new_scan_relationship_hint)) },
                supportingText = if (state.relationshipInvalid) {
                    { Text(stringResource(R.string.new_scan_relationship_error)) }
                } else {
                    null
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("new_scan.relationship"),
                singleLine = true,
            )
            OutlinedButton(
                onClick = { onAction(NewScanUiAction.CreateProfile) },
                enabled = state.canCreateProfile,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 48.dp)
                    .testTag("new_scan.create_profile"),
            ) {
                if (state.isCreatingProfile) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(imageVector = Icons.Default.Add, contentDescription = null)
                }
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    stringResource(
                        if (state.isCreatingProfile) R.string.new_scan_creating_profile
                        else R.string.new_scan_create_profile,
                    ),
                )
            }
        }
    }
}

@Composable
private fun DeviceChoice(
    device: SmartDevice,
    selectedProfile: Patient?,
    selected: Boolean,
    enabled: Boolean,
    onSelected: () -> Unit,
) {
    val eligible = enabled && device.isEligibleForScan(selectedProfile)
    val status = deviceStatus(device, selectedProfile)
    SelectableSurface(
        selected = selected,
        enabled = eligible,
        onSelected = onSelected,
        modifier = Modifier.testTag("new_scan.device.${device.id}"),
        stateDescription = if (eligible) {
            listOf(
                status,
                if (selected) stringResource(R.string.new_scan_device_selected) else null,
            ).filterNotNull().joinToString(". ")
        } else {
            "$status. ${stringResource(R.string.new_scan_device_not_selectable)}"
        },
    ) {
        Icon(
            imageVector = Icons.Default.GraphicEq,
            contentDescription = null,
            tint = if (eligible) ShcareTheme.colors.success else ShcareTheme.colors.offline,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = device.name.ifBlank { device.id },
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = listOf(
                    status,
                    device.wifiRssi?.let { "RSSI $it dBm" }.orEmpty(),
                    device.firmwareVersion,
                ).filter(String::isNotBlank).joinToString(" • "),
                style = MaterialTheme.typography.bodySmall,
                color = if (eligible) ShcareTheme.colors.success
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        RadioButton(
            selected = selected,
            onClick = null,
            enabled = eligible,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

@Composable
private fun ScanTypeChoice(
    scanType: NewScanType,
    selected: Boolean,
    enabled: Boolean,
    onSelected: () -> Unit,
) {
    val label = stringResource(scanType.labelRes())
    SelectableSurface(
        selected = selected,
        enabled = enabled,
        onSelected = onSelected,
        modifier = Modifier.testTag("new_scan.type.${scanType.wireValue}"),
        stateDescription = if (selected) {
            stringResource(R.string.new_scan_type_selected, label)
        } else {
            stringResource(R.string.new_scan_type_not_selected, label)
        },
    ) {
        Icon(
            imageVector = if (scanType == NewScanType.Heart) Icons.Default.Favorite
            else Icons.Default.Air,
            contentDescription = null,
            tint = if (selected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(scanType.descriptionRes()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        RadioButton(
            selected = selected,
            onClick = null,
            enabled = enabled,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

@Composable
private fun BodySiteChoice(
    bodySite: ScanBodySite,
    selected: Boolean,
    enabled: Boolean,
    onSelected: () -> Unit,
) {
    val label = stringResource(bodySite.labelRes())
    SelectableSurface(
        selected = selected,
        enabled = enabled,
        onSelected = onSelected,
        modifier = Modifier.testTag("new_scan.body_site.${bodySite.wireValue}"),
        stateDescription = stringResource(
            if (selected) R.string.new_scan_site_selected else R.string.new_scan_site_not_selected,
            label,
        ),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = stringResource(bodySite.guideRes()),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.testTag("new_scan.guide.${bodySite.wireValue}"),
            )
        }
        RadioButton(
            selected = selected,
            onClick = null,
            enabled = enabled,
            modifier = Modifier.clearAndSetSemantics { },
        )
    }
}

@Composable
private fun ReadinessChoice(
    item: NewScanReadinessCheck,
    checked: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Checkbox,
                onValueChange = { onToggle() },
            )
            .testTag("new_scan.readiness.${item.name.lowercase(Locale.ROOT)}"),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (checked) MaterialTheme.colorScheme.secondaryContainer
            else MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        border = BorderStroke(
            1.dp,
            if (checked) MaterialTheme.colorScheme.secondary
            else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = checked,
                onCheckedChange = null,
                enabled = enabled,
                modifier = Modifier.clearAndSetSemantics { },
            )
            Text(
                text = stringResource(item.labelRes()),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun SelectableSurface(
    selected: Boolean,
    enabled: Boolean,
    onSelected: () -> Unit,
    stateDescription: String,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp)
            .selectable(
                selected = selected,
                enabled = enabled,
                role = Role.RadioButton,
                onClick = onSelected,
            )
            .semantics { this.stateDescription = stateDescription },
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer
            else MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
        ),
        border = BorderStroke(
            1.dp,
            if (selected) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = content,
        )
    }
}

@Composable
private fun NewScanFailurePane(
    state: NewScanUiState,
    onAction: (NewScanUiAction) -> Unit,
) {
    val message = when (state.failure) {
        NewScanFailure.Validation -> stringResource(R.string.new_scan_validation_error)
        NewScanFailure.Offline -> stringResource(R.string.new_scan_offline_error)
        NewScanFailure.Permission -> stringResource(R.string.new_scan_permission_message)
        NewScanFailure.DeviceOffline -> stringResource(R.string.new_scan_device_offline_error)
        NewScanFailure.InvalidReceipt -> stringResource(R.string.new_scan_invalid_receipt_error)
        NewScanFailure.Backend -> stringResource(R.string.new_scan_backend_error)
        NewScanFailure.None -> ""
    }
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .semantics { stateDescription = message }
            .testTag("new_scan.failure"),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.onErrorContainer,
        ),
    ) {
        Row(
            modifier = Modifier.padding(start = 14.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(imageVector = Icons.Default.WarningAmber, contentDescription = null)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(text = message, style = MaterialTheme.typography.bodyMedium)
                if (state.errorDetail.isNotBlank() && state.failure == NewScanFailure.Backend) {
                    Text(text = state.errorDetail, style = MaterialTheme.typography.bodySmall)
                }
                if (state.requestId.isNotBlank()) {
                    Text(
                        text = stringResource(R.string.new_scan_request_id, state.requestId),
                        style = MaterialTheme.typography.labelSmall,
                    )
                }
                if (state.failure in setOf(
                        NewScanFailure.Offline,
                        NewScanFailure.DeviceOffline,
                        NewScanFailure.Permission,
                    )
                ) {
                    FilledTonalButton(
                        onClick = { onAction(NewScanUiAction.Retry) },
                        modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text(stringResource(R.string.new_scan_retry))
                    }
                }
            }
            IconButton(
                onClick = { onAction(NewScanUiAction.DismissFailure) },
                modifier = Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = stringResource(R.string.new_scan_dismiss_error),
                )
            }
        }
    }
}

@Composable
private fun InlineEmptyPane(
    title: String,
    message: String,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleSmall)
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun SectionDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(vertical = 8.dp),
        color = MaterialTheme.colorScheme.outlineVariant,
    )
}

@Composable
private fun newScanStateMessage(base: String, requestId: String): String =
    if (requestId.isBlank()) {
        base
    } else {
        "$base\n${stringResource(R.string.new_scan_request_id, requestId)}"
    }

@Composable
private fun deviceStatus(device: SmartDevice, selectedProfile: Patient?): String = when {
    device.status.equals("revoked", ignoreCase = true) ->
        stringResource(R.string.new_scan_device_revoked)
    !device.online -> stringResource(R.string.new_scan_device_offline)
    selectedProfile != null &&
        device.organizationId.isNotBlank() &&
        selectedProfile.organizationId.isNotBlank() &&
        device.organizationId != selectedProfile.organizationId ->
        stringResource(R.string.new_scan_device_other_workspace)
    device.assignedPatientId.isNotBlank() && device.assignedPatientId != selectedProfile?.id ->
        stringResource(R.string.new_scan_device_other_profile)
    else -> stringResource(R.string.new_scan_device_online)
}

@StringRes
private fun NewScanType.labelRes(): Int = when (this) {
    NewScanType.Heart -> R.string.new_scan_type_heart
    NewScanType.Lung -> R.string.new_scan_type_lung
}

@StringRes
private fun NewScanType.descriptionRes(): Int = when (this) {
    NewScanType.Heart -> R.string.new_scan_type_heart_description
    NewScanType.Lung -> R.string.new_scan_type_lung_description
}

@StringRes
private fun ScanBodySite.labelRes(): Int = when (this) {
    ScanBodySite.Aortic -> R.string.new_scan_site_aortic
    ScanBodySite.Pulmonic -> R.string.new_scan_site_pulmonic
    ScanBodySite.Tricuspid -> R.string.new_scan_site_tricuspid
    ScanBodySite.Mitral -> R.string.new_scan_site_mitral
    ScanBodySite.RightUpperAnterior -> R.string.new_scan_site_right_upper_anterior
    ScanBodySite.LeftUpperAnterior -> R.string.new_scan_site_left_upper_anterior
    ScanBodySite.RightLowerPosterior -> R.string.new_scan_site_right_lower_posterior
    ScanBodySite.LeftLowerPosterior -> R.string.new_scan_site_left_lower_posterior
}

@StringRes
private fun ScanBodySite.guideRes(): Int = when (this) {
    ScanBodySite.Aortic -> R.string.new_scan_site_aortic_guide
    ScanBodySite.Pulmonic -> R.string.new_scan_site_pulmonic_guide
    ScanBodySite.Tricuspid -> R.string.new_scan_site_tricuspid_guide
    ScanBodySite.Mitral -> R.string.new_scan_site_mitral_guide
    ScanBodySite.RightUpperAnterior -> R.string.new_scan_site_right_upper_anterior_guide
    ScanBodySite.LeftUpperAnterior -> R.string.new_scan_site_left_upper_anterior_guide
    ScanBodySite.RightLowerPosterior -> R.string.new_scan_site_right_lower_posterior_guide
    ScanBodySite.LeftLowerPosterior -> R.string.new_scan_site_left_lower_posterior_guide
}

@StringRes
private fun NewScanReadinessCheck.labelRes(): Int = when (this) {
    NewScanReadinessCheck.QuietEnvironment -> R.string.new_scan_readiness_quiet
    NewScanReadinessCheck.DirectSkinContact -> R.string.new_scan_readiness_skin
    NewScanReadinessCheck.PatientReady -> R.string.new_scan_readiness_patient
}
