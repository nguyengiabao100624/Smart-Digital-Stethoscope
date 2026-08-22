package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.account.FamilyProfileDraft
import com.example.smart_health_android.account.FamilyProfileField
import com.example.smart_health_android.account.FamilyProfilesAction
import com.example.smart_health_android.account.FamilyProfilesEffect
import com.example.smart_health_android.account.FamilyProfilesLoadState
import com.example.smart_health_android.account.FamilyProfilesUiState
import com.example.smart_health_android.account.FamilyProfilesViewModel
import com.example.smart_health_android.data.ActiveProfileResult
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FamilyProfilesScreen(
    onNavigateBack: () -> Unit,
    onActiveProfileConfirmed: (result: ActiveProfileResult, expectedPatientId: String) -> Unit,
    familyViewModel: FamilyProfilesViewModel = viewModel(),
) {
    val state by familyViewModel.uiState.collectAsStateWithLifecycle()
    val currentOnActiveProfileConfirmed by rememberUpdatedState(onActiveProfileConfirmed)
    var showDiscardDialog by remember { mutableStateOf(false) }
    val hasDraft = state.editingProfileId.isNotBlank() || state.draft != FamilyProfileDraft()

    LaunchedEffect(familyViewModel) {
        familyViewModel.effects.collect { effect ->
            when (effect) {
                is FamilyProfilesEffect.ActiveProfileConfirmed -> {
                    currentOnActiveProfileConfirmed(effect.result, effect.expectedPatientId)
                }
            }
        }
    }

    BackHandler(enabled = hasDraft && !state.isSaving) {
        showDiscardDialog = true
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.family_profiles_title)) },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            if (hasDraft) showDiscardDialog = true else onNavigateBack()
                        },
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.family_profiles_back),
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        when (state.loadState) {
            FamilyProfilesLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.family_profiles_loading),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            FamilyProfilesLoadState.Error -> ShcareErrorState(
                onRetry = { familyViewModel.onAction(FamilyProfilesAction.Retry) },
                title = stringResource(R.string.family_profiles_error_title),
                message = state.errorMessage.ifBlank {
                    stringResource(R.string.family_profiles_error_message)
                },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            FamilyProfilesLoadState.Offline -> ShcareOfflineState(
                onRetry = { familyViewModel.onAction(FamilyProfilesAction.Retry) },
                title = stringResource(R.string.family_profiles_offline_title),
                message = stringResource(R.string.family_profiles_offline_message),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            FamilyProfilesLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onNavigateBack,
                title = stringResource(R.string.family_profiles_permission_title),
                message = stringResource(R.string.family_profiles_permission_message),
                actionLabel = stringResource(R.string.family_profiles_back),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            FamilyProfilesLoadState.Empty,
            FamilyProfilesLoadState.Ready,
            -> FamilyProfilesContent(
                state = state,
                onAction = familyViewModel::onAction,
                modifier = Modifier
                    .padding(padding)
                    .imePadding(),
            )
        }
    }

    state.pendingDelete?.let { profile ->
        AlertDialog(
            onDismissRequest = { familyViewModel.onAction(FamilyProfilesAction.CancelDelete) },
            title = { Text(stringResource(R.string.family_profiles_delete_title)) },
            text = {
                Text(stringResource(R.string.family_profiles_delete_message, profile.name))
            },
            confirmButton = {
                Button(onClick = { familyViewModel.onAction(FamilyProfilesAction.ConfirmDelete) }) {
                    Text(stringResource(R.string.family_profiles_delete_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { familyViewModel.onAction(FamilyProfilesAction.CancelDelete) }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    if (showDiscardDialog) {
        AlertDialog(
            onDismissRequest = { showDiscardDialog = false },
            title = { Text(stringResource(R.string.family_profiles_discard_title)) },
            text = { Text(stringResource(R.string.family_profiles_discard_message)) },
            confirmButton = {
                Button(
                    onClick = {
                        familyViewModel.onAction(FamilyProfilesAction.CreateNew)
                        showDiscardDialog = false
                        onNavigateBack()
                    },
                ) {
                    Text(stringResource(R.string.family_profiles_discard_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDiscardDialog = false }) {
                    Text(stringResource(R.string.family_profiles_continue_editing))
                }
            },
        )
    }
}

@Composable
private fun FamilyProfilesContent(
    state: FamilyProfilesUiState,
    onAction: (FamilyProfilesAction) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(spacing.large),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        item {
            Text(
                text = stringResource(R.string.family_profiles_description),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (state.confirmationMessage.isNotBlank()) {
            item {
                Surface(
                    color = ShcareTheme.colors.successContainer,
                    contentColor = ShcareTheme.colors.onSuccessContainer,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Polite },
                ) {
                    Text(
                        text = stringResource(
                            R.string.family_profiles_confirmed,
                            state.confirmationMessage,
                        ),
                        modifier = Modifier.padding(spacing.large),
                    )
                }
            }
        }
        if (state.errorMessage.isNotBlank()) {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Assertive },
                ) {
                    Text(state.errorMessage, modifier = Modifier.padding(spacing.large))
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.family_profiles_list_heading),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                TextButton(
                    onClick = { onAction(FamilyProfilesAction.CreateNew) },
                    enabled = !state.isSaving && state.deletingProfileId.isBlank(),
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Text(stringResource(R.string.family_profiles_add))
                }
            }
        }

        if (state.profiles.isEmpty()) {
            item {
                ShcareEmptyState(
                    title = stringResource(R.string.family_profiles_empty_title),
                    message = stringResource(R.string.family_profiles_empty_message),
                )
            }
        } else {
            items(state.profiles, key = Patient::id) { profile ->
                FamilyProfileCard(
                    profile = profile,
                    active = profile.id == state.activePatientId,
                    editing = profile.id == state.editingProfileId,
                    switching = profile.id == state.switchingProfileId,
                    deleting = profile.id == state.deletingProfileId,
                    actionsEnabled = !state.isSaving &&
                        state.switchingProfileId.isBlank() &&
                        state.deletingProfileId.isBlank(),
                    onEdit = { onAction(FamilyProfilesAction.Edit(profile.id)) },
                    onSwitch = { onAction(FamilyProfilesAction.SwitchActive(profile.id)) },
                    onDelete = { onAction(FamilyProfilesAction.RequestDelete(profile.id)) },
                )
            }
        }

        item {
            HorizontalDivider()
        }
        item {
            FamilyProfileEditor(
                state = state,
                onAction = onAction,
            )
        }
    }
}

@Composable
private fun FamilyProfileCard(
    profile: Patient,
    active: Boolean,
    editing: Boolean,
    switching: Boolean,
    deleting: Boolean,
    actionsEnabled: Boolean,
    onEdit: () -> Unit,
    onSwitch: () -> Unit,
    onDelete: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val isSelf = profile.profileType == "self"
    val spokenState = stringResource(
        if (active) R.string.family_profiles_active else R.string.family_profiles_available,
    )
    Card(
        colors = CardDefaults.cardColors(
            containerColor = if (editing) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        border = BorderStroke(
            1.dp,
            if (editing || active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                stateDescription = spokenState
            },
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = actionsEnabled, onClick = onEdit),
            ) {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = if (isSelf) {
                        MaterialTheme.colorScheme.primaryContainer
                    } else {
                        MaterialTheme.colorScheme.secondaryContainer
                    },
                    modifier = Modifier.size(48.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = if (isSelf) Icons.Default.Person else Icons.Default.Groups,
                            contentDescription = null,
                        )
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = profile.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = listOfNotNull(
                            profile.relationship.ifBlank {
                                stringResource(
                                    if (isSelf) R.string.family_profiles_self else R.string.family_profiles_dependent,
                                )
                            },
                            profile.resolvedAge()?.let {
                                pluralStringResource(R.plurals.family_profiles_age, it, it)
                            },
                            profile.bloodType.takeUnless { it == "unknown" || it.isBlank() },
                        ).joinToString(" • "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (active) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = stringResource(R.string.family_profiles_active),
                        tint = ShcareTheme.colors.success,
                    )
                }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.small),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                OutlinedButton(
                    onClick = onSwitch,
                    enabled = actionsEnabled && !active,
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 48.dp),
                ) {
                    if (switching) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    } else {
                        Text(
                            stringResource(
                                if (active) R.string.family_profiles_active else R.string.family_profiles_use,
                            ),
                        )
                    }
                }
                IconButton(onClick = onEdit, enabled = actionsEnabled) {
                    Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.family_profiles_edit))
                }
                IconButton(
                    onClick = onDelete,
                    enabled = actionsEnabled && !isSelf && !active,
                ) {
                    if (deleting) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    } else {
                        Icon(Icons.Default.Delete, contentDescription = stringResource(R.string.family_profiles_delete))
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FamilyProfileEditor(
    state: FamilyProfilesUiState,
    onAction: (FamilyProfilesAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val draft = state.draft
    val errors = state.fieldErrors
    var bloodExpanded by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(spacing.large)) {
        Text(
            text = stringResource(
                if (state.editingProfileId.isBlank()) {
                    R.string.family_profiles_create_heading
                } else {
                    R.string.family_profiles_edit_heading
                },
            ),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        ProfileTextField(
            value = draft.name,
            label = stringResource(R.string.family_profiles_name),
            error = errors["name"]?.let { stringResource(R.string.family_profiles_required) },
            onValueChange = { onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Name, it)) },
        )
        ProfileTextField(
            value = draft.relationship,
            label = stringResource(R.string.family_profiles_relationship),
            error = errors["relationship"]?.let { stringResource(R.string.family_profiles_required) },
            onValueChange = {
                onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Relationship, it))
            },
        )
        FamilyDateField(
            value = draft.dateOfBirth,
            error = errors["dateOfBirth"]?.let {
                stringResource(R.string.family_profiles_birth_date_invalid)
            },
            onDateSelected = {
                onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.DateOfBirth, it))
            },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(spacing.medium)) {
            ProfileTextField(
                value = draft.gender,
                label = stringResource(R.string.family_profiles_gender),
                onValueChange = {
                    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Gender, it))
                },
                modifier = Modifier.weight(1f),
            )
            ExposedDropdownMenuBox(
                expanded = bloodExpanded,
                onExpandedChange = { if (!state.isSaving) bloodExpanded = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value = bloodTypeLabel(draft.bloodType),
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.family_profiles_blood_type)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = bloodExpanded) },
                    isError = errors.containsKey("bloodType"),
                    modifier = Modifier
                        .menuAnchor(
                            MenuAnchorType.PrimaryNotEditable,
                            enabled = !state.isSaving,
                        )
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = bloodExpanded,
                    onDismissRequest = { bloodExpanded = false },
                ) {
                    FamilyProfilesViewModel.BLOOD_TYPES.sorted().forEach { bloodType ->
                        androidx.compose.material3.DropdownMenuItem(
                            text = { Text(bloodTypeLabel(bloodType)) },
                            onClick = {
                                onAction(
                                    FamilyProfilesAction.DraftChanged(
                                        FamilyProfileField.BloodType,
                                        bloodType,
                                    ),
                                )
                                bloodExpanded = false
                            },
                        )
                    }
                }
            }
        }
        ProfileTextField(
            value = draft.phone,
            label = stringResource(R.string.family_profiles_phone),
            keyboardType = KeyboardType.Phone,
            onValueChange = { onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Phone, it)) },
        )
        ProfileTextField(
            value = draft.allergies,
            label = stringResource(R.string.family_profiles_allergies),
            supportingText = stringResource(R.string.family_profiles_allergies_support),
            singleLine = false,
            onValueChange = {
                onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Allergies, it))
            },
        )
        ProfileTextField(
            value = draft.notes,
            label = stringResource(R.string.family_profiles_notes),
            singleLine = false,
            onValueChange = { onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Notes, it)) },
        )

        Text(
            text = stringResource(R.string.family_profiles_emergency_heading),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = stringResource(R.string.family_profiles_emergency_support),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        ProfileTextField(
            value = draft.emergencyName,
            label = stringResource(R.string.family_profiles_emergency_name),
            error = errors["emergencyContact"]?.let {
                stringResource(R.string.family_profiles_emergency_incomplete)
            },
            onValueChange = {
                onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.EmergencyName, it))
            },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(spacing.medium)) {
            ProfileTextField(
                value = draft.emergencyPhone,
                label = stringResource(R.string.family_profiles_emergency_phone),
                keyboardType = KeyboardType.Phone,
                onValueChange = {
                    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.EmergencyPhone, it))
                },
                modifier = Modifier.weight(1f),
            )
            ProfileTextField(
                value = draft.emergencyRelationship,
                label = stringResource(R.string.family_profiles_emergency_relationship),
                onValueChange = {
                    onAction(
                        FamilyProfilesAction.DraftChanged(
                            FamilyProfileField.EmergencyRelationship,
                            it,
                        ),
                    )
                },
                modifier = Modifier.weight(1f),
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(spacing.medium)) {
            OutlinedButton(
                onClick = { onAction(FamilyProfilesAction.CreateNew) },
                enabled = !state.isSaving,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 52.dp),
            ) {
                Text(stringResource(R.string.family_profiles_clear))
            }
            Button(
                onClick = { onAction(FamilyProfilesAction.Save) },
                enabled = !state.isSaving,
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 52.dp),
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                } else {
                    Text(
                        stringResource(
                            if (state.editingProfileId.isBlank()) {
                                R.string.family_profiles_create
                            } else {
                                R.string.family_profiles_save
                            },
                        ),
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileTextField(
    value: String,
    label: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    supportingText: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        isError = error != null,
        supportingText = (error ?: supportingText)?.let { message ->
            { Text(message) }
        },
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 2,
        modifier = modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FamilyDateField(
    value: String,
    error: String?,
    onDateSelected: (String) -> Unit,
) {
    var showPicker by remember { mutableStateOf(false) }
    val selectedMillis = remember(value) {
        runCatching {
            LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }.getOrNull()
    }
    OutlinedButton(
        onClick = { showPicker = true },
        border = BorderStroke(
            1.dp,
            if (error == null) MaterialTheme.colorScheme.outline else MaterialTheme.colorScheme.error,
        ),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp),
    ) {
        Icon(Icons.Default.CalendarMonth, contentDescription = null)
        Spacer(Modifier.size(8.dp))
        Text(
            text = value.takeIf(String::isNotBlank)?.let {
                runCatching { LocalDate.parse(it).format(FAMILY_DATE_FORMAT) }.getOrDefault(it)
            } ?: stringResource(R.string.family_profiles_birth_date),
        )
    }
    error?.let {
        Text(
            text = it,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    if (showPicker) {
        val todayUtc = LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = selectedMillis,
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis <= todayUtc
            },
        )
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        pickerState.selectedDateMillis?.let { millis ->
                            onDateSelected(
                                Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString(),
                            )
                        }
                        showPicker = false
                    },
                ) {
                    Text(stringResource(R.string.family_profiles_date_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        ) {
            DatePicker(state = pickerState)
        }
    }
}

@Composable
private fun bloodTypeLabel(value: String): String = if (value == "unknown" || value.isBlank()) {
    stringResource(R.string.family_profiles_blood_unknown)
} else {
    value
}

private val FAMILY_DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
