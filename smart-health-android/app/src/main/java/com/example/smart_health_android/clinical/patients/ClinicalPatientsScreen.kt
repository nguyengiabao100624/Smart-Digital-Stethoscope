package com.example.smart_health_android.clinical.patients

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareDetailPanePresentation
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareListDetailScaffold
import com.example.smart_health_android.ui.components.ShcareListDetailState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicalPatientsScreen(
    expectedWorkspaceId: String,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
    providedViewModel: ClinicalPatientsViewModel? = null,
) {
    if (expectedWorkspaceId.isBlank() && providedViewModel == null) {
        ShcarePermissionState(
            onRequestPermission = onOpenWorkspaceSwitcher,
            title = stringResource(R.string.clinical_patients_workspace_required_title),
            message = stringResource(R.string.clinical_patients_workspace_required_message),
            actionLabel = stringResource(R.string.clinical_patients_workspace_action),
            modifier = modifier.fillMaxSize(),
        )
        return
    }

    val factory = remember(expectedWorkspaceId) {
        ClinicalPatientsViewModelFactory(expectedWorkspaceId)
    }
    val resolvedViewModel = providedViewModel ?: viewModel(factory = factory)
    val state = resolvedViewModel.uiState.collectAsStateWithLifecycle().value

    ClinicalPatientsContent(
        state = state,
        onAction = resolvedViewModel::onAction,
        onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClinicalPatientsContent(
    state: ClinicalPatientsUiState,
    onAction: (ClinicalPatientsUiAction) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier
            .fillMaxSize()
            .testTag("clinical-patients-screen"),
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.clinical_patients_title),
                onNavigateBack = null,
                actions = {
                    IconButton(
                        onClick = { onAction(ClinicalPatientsUiAction.Refresh) },
                        enabled = state.loadState != ClinicalPatientsLoadState.Loading &&
                            !state.isRefreshing,
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(
                                R.string.clinical_patients_refresh,
                            ),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        val selectedPatient = state.patients.firstOrNull {
            it.id == state.selectedPatientId
        }
        val listDetailState = when {
            selectedPatient == null -> ShcareListDetailState.NoSelection
            state.compactDetailVisible -> ShcareListDetailState.DetailVisible
            else -> ShcareListDetailState.SelectionInList
        }
        ShcareListDetailScaffold(
            state = listDetailState,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            listPane = { paneModifier ->
                ClinicalPatientsListPane(
                    state = state,
                    onAction = onAction,
                    onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
                    modifier = paneModifier,
                )
            },
            detailPane = { paneModifier, presentation ->
                ClinicalPatientDetailPane(
                    patient = checkNotNull(selectedPatient),
                    compact = presentation == ShcareDetailPanePresentation.FullScreen,
                    onBack = {
                        onAction(ClinicalPatientsUiAction.CloseDetail)
                    },
                    modifier = paneModifier,
                )
            },
            emptyDetailPane = { paneModifier ->
                Box(
                    modifier = paneModifier.testTag("clinical-patients-detail"),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = stringResource(
                            R.string.clinical_patients_detail_placeholder,
                        ),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(ShcareTheme.spacing.extraLarge),
                    )
                }
            },
        )
    }
}

@Composable
private fun ClinicalPatientsListPane(
    state: ClinicalPatientsUiState,
    onAction: (ClinicalPatientsUiAction) -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    Column(
        modifier = modifier
            .testTag("clinical-patients-list")
            .padding(horizontal = spacing.large),
    ) {
        Text(
            text = stringResource(R.string.clinical_patients_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = spacing.medium),
        )
        ClinicalPatientSearch(
            query = state.query,
            enabled = state.loadState != ClinicalPatientsLoadState.Loading &&
                !state.isRefreshing,
            onQueryChange = {
                onAction(ClinicalPatientsUiAction.UpdateQuery(it))
            },
            onSubmit = {
                onAction(ClinicalPatientsUiAction.SubmitSearch)
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = spacing.medium),
        )

        if (state.isStale && state.error != null) {
            ClinicalPatientsStaleNotice(
                error = state.error,
                requestId = state.requestId,
                onRetry = { onAction(ClinicalPatientsUiAction.Refresh) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = spacing.medium),
            )
        }

        when (state.loadState) {
            ClinicalPatientsLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.clinical_patients_loading),
                modifier = Modifier.weight(1f),
            )

            ClinicalPatientsLoadState.Empty -> ShcareEmptyState(
                title = if (state.submittedQuery.isBlank()) {
                    stringResource(R.string.clinical_patients_empty_title)
                } else {
                    stringResource(R.string.clinical_patients_search_empty_title)
                },
                message = if (state.submittedQuery.isBlank()) {
                    stringResource(R.string.clinical_patients_empty_message)
                } else {
                    stringResource(
                        R.string.clinical_patients_search_empty_message,
                        state.submittedQuery,
                    )
                },
                actionLabel = if (state.submittedQuery.isBlank()) {
                    stringResource(R.string.clinical_patients_refresh)
                } else {
                    stringResource(R.string.clinical_patients_clear_search)
                },
                onAction = {
                    if (state.submittedQuery.isBlank()) {
                        onAction(ClinicalPatientsUiAction.Refresh)
                    } else {
                        onAction(ClinicalPatientsUiAction.UpdateQuery(""))
                        onAction(ClinicalPatientsUiAction.SubmitSearch)
                    }
                },
                modifier = Modifier.weight(1f),
            )

            ClinicalPatientsLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onOpenWorkspaceSwitcher,
                title = stringResource(R.string.clinical_patients_permission_title),
                message = clinicalPatientsErrorText(state.error, state.requestId),
                actionLabel = stringResource(R.string.clinical_patients_workspace_action),
                modifier = Modifier.weight(1f),
            )

            ClinicalPatientsLoadState.Offline -> ShcareOfflineState(
                onRetry = { onAction(ClinicalPatientsUiAction.Refresh) },
                message = clinicalPatientsErrorText(state.error, state.requestId),
                modifier = Modifier.weight(1f),
            )

            ClinicalPatientsLoadState.Error -> ShcareErrorState(
                onRetry = { onAction(ClinicalPatientsUiAction.Refresh) },
                message = clinicalPatientsErrorText(state.error, state.requestId),
                modifier = Modifier.weight(1f),
            )

            ClinicalPatientsLoadState.Content -> LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(bottom = spacing.extraLarge),
                verticalArrangement = Arrangement.spacedBy(spacing.small),
            ) {
                items(
                    items = state.patients,
                    key = Patient::id,
                ) { patient ->
                    ClinicalPatientCard(
                        patient = patient,
                        selected = patient.id == state.selectedPatientId,
                        onClick = {
                            onAction(ClinicalPatientsUiAction.SelectPatient(patient.id))
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ClinicalPatientSearch(
    query: String,
    enabled: Boolean,
    onQueryChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        enabled = enabled,
        singleLine = true,
        label = { Text(stringResource(R.string.clinical_patients_search_label)) },
        leadingIcon = {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = null,
            )
        },
        trailingIcon = {
            IconButton(
                onClick = {
                    onSubmit()
                    keyboardController?.hide()
                },
                enabled = enabled,
                modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
            ) {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = stringResource(
                        R.string.clinical_patients_search_action,
                    ),
                )
            }
        },
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(
            onSearch = {
                onSubmit()
                keyboardController?.hide()
            },
        ),
        modifier = modifier
            .defaultMinSize(minHeight = 56.dp)
            .testTag("clinical-patients-search"),
    )
}

@Composable
private fun ClinicalPatientCard(
    patient: Patient,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val age = patient.resolvedAge()
    val description = listOfNotNull(
        patient.patientCode.takeIf(String::isNotBlank),
        age?.let {
            pluralStringResource(R.plurals.clinical_patients_age_value, it, it)
        },
        patient.phone.takeIf(String::isNotBlank),
    ).joinToString(" · ")
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 88.dp)
            .semantics {
                this.selected = selected
            }
            .testTag("clinical-patient-${patient.id}"),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        border = CardDefaults.outlinedCardBorder(),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                color = if (selected) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.secondaryContainer
                },
                contentColor = if (selected) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSecondaryContainer
                },
                shape = MaterialTheme.shapes.medium,
            ) {
                Box(
                    modifier = Modifier.size(48.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
            ) {
                Text(
                    text = patient.name.ifBlank {
                        stringResource(R.string.clinical_patients_name_unknown)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = description.ifBlank {
                        stringResource(R.string.clinical_patients_summary_unknown)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun ClinicalPatientDetailPane(
    patient: Patient,
    compact: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(enabled = compact) {
        onBack()
    }
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = modifier.testTag("clinical-patients-detail"),
        contentPadding = PaddingValues(spacing.large),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        if (compact) {
            item {
                TextButton(
                    onClick = onBack,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = null,
                    )
                    Spacer(Modifier.width(spacing.small))
                    Text(stringResource(R.string.clinical_patients_back_to_list))
                }
            }
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.extraSmall)) {
                Text(
                    text = stringResource(R.string.clinical_patients_detail_heading),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    text = patient.name.ifBlank {
                        stringResource(R.string.clinical_patients_name_unknown)
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = patient.patientCode.ifBlank {
                        stringResource(R.string.clinical_patients_not_updated)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item { HorizontalDivider() }

        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.CalendarMonth,
                label = stringResource(R.string.clinical_patients_date_of_birth),
                value = patient.dateOfBirth
                    .takeIf(String::isNotBlank)
                    ?.let(::formatClinicalDate)
                    ?: stringResource(R.string.clinical_patients_not_updated),
            )
        }
        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.Info,
                label = stringResource(R.string.clinical_patients_age),
                value = patient.resolvedAge()?.let {
                    pluralStringResource(R.plurals.clinical_patients_age_value, it, it)
                } ?: stringResource(R.string.clinical_patients_not_updated),
            )
        }
        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.Person,
                label = stringResource(R.string.clinical_patients_gender),
                value = clinicalPatientGender(patient.gender),
            )
        }
        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.Phone,
                label = stringResource(R.string.clinical_patients_phone),
                value = patient.phone.ifBlank {
                    stringResource(R.string.clinical_patients_not_updated)
                },
            )
        }
        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.Info,
                label = stringResource(R.string.clinical_patients_blood_type),
                value = patient.bloodType
                    .takeUnless { it.isBlank() || it.equals("unknown", ignoreCase = true) }
                    ?: stringResource(R.string.clinical_patients_not_updated),
            )
        }
        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.Info,
                label = stringResource(R.string.clinical_patients_allergies),
                value = patient.allergies
                    .filter(String::isNotBlank)
                    .joinToString(", ")
                    .ifBlank {
                        stringResource(R.string.clinical_patients_not_updated)
                    },
            )
        }
        item {
            val emergency = patient.emergencyContact
            ClinicalPatientDetailRow(
                icon = Icons.Default.Phone,
                label = stringResource(R.string.clinical_patients_emergency_contact),
                value = listOf(
                    emergency.name,
                    emergency.relationship,
                    emergency.phone,
                ).filter(String::isNotBlank)
                    .joinToString(" · ")
                    .ifBlank {
                        stringResource(R.string.clinical_patients_not_updated)
                    },
            )
        }
        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.Info,
                label = stringResource(R.string.clinical_patients_scan_count),
                value = patient.scanCount.toString(),
            )
        }
        item {
            ClinicalPatientDetailRow(
                icon = Icons.Default.CalendarMonth,
                label = stringResource(R.string.clinical_patients_last_scan),
                value = patient.lastScanAt
                    ?.takeIf(String::isNotBlank)
                    ?.let(::formatClinicalDateTime)
                    ?: stringResource(R.string.clinical_patients_no_scan),
            )
        }
        if (!patient.lastAiLabel.isNullOrBlank()) {
            item {
                ClinicalPatientDetailRow(
                    icon = Icons.Default.Info,
                    label = stringResource(R.string.clinical_patients_ai_support),
                    value = patient.lastAiLabel,
                )
            }
            item {
                Surface(
                    color = ShcareTheme.colors.infoContainer,
                    contentColor = ShcareTheme.colors.onInfoContainer,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Text(
                        text = stringResource(R.string.clinical_patients_ai_disclaimer),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(spacing.large),
                    )
                }
            }
        }
    }
}

@Composable
private fun ClinicalPatientDetailRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp),
        )
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
            )
        }
    }
}

@Composable
private fun ClinicalPatientsStaleNotice(
    error: ClinicalPatientsError,
    requestId: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val message = clinicalPatientsErrorText(error, requestId)
    Surface(
        modifier = modifier
            .testTag("clinical-patients-stale")
            .semantics {
                stateDescription = message
            },
        color = ShcareTheme.colors.warningContainer,
        contentColor = ShcareTheme.colors.onWarningContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier.padding(
                start = ShcareTheme.spacing.large,
                top = ShcareTheme.spacing.small,
                end = ShcareTheme.spacing.small,
                bottom = ShcareTheme.spacing.small,
            ),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = onRetry,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.shcare_action_retry))
            }
        }
    }
}

@Composable
private fun clinicalPatientsErrorText(
    error: ClinicalPatientsError?,
    requestId: String,
): String {
    val message = when (error) {
        ClinicalPatientsError.PermissionDenied ->
            stringResource(R.string.clinical_patients_error_permission)
        ClinicalPatientsError.Offline ->
            stringResource(R.string.clinical_patients_error_offline)
        ClinicalPatientsError.WorkspaceMismatch ->
            stringResource(R.string.clinical_patients_error_workspace)
        ClinicalPatientsError.Unknown, null ->
            stringResource(R.string.clinical_patients_error_unknown)
    }
    return if (requestId.isBlank()) {
        message
    } else {
        stringResource(R.string.clinical_request_id_message, message, requestId)
    }
}

@Composable
private fun clinicalPatientGender(value: String): String = when (value.trim().lowercase()) {
    "male", "nam" -> stringResource(R.string.clinical_patients_gender_male)
    "female", "nữ", "nu" -> stringResource(R.string.clinical_patients_gender_female)
    "other", "khác", "khac" -> stringResource(R.string.clinical_patients_gender_other)
    else -> stringResource(R.string.clinical_patients_not_updated)
}

private val clinicalDateFormatter = DateTimeFormatter.ofPattern(
    "dd/MM/yyyy",
    Locale.forLanguageTag("vi-VN"),
)
private val clinicalDateTimeFormatter = DateTimeFormatter.ofPattern(
    "dd/MM/yyyy · HH:mm",
    Locale.forLanguageTag("vi-VN"),
)

private fun formatClinicalDate(value: String): String = runCatching {
    java.time.LocalDate.parse(value).format(clinicalDateFormatter)
}.getOrDefault(value)

private fun formatClinicalDateTime(value: String): String = runCatching {
    Instant.parse(value)
        .atZone(ZoneId.systemDefault())
        .format(clinicalDateTimeFormatter)
}.getOrDefault(value)
