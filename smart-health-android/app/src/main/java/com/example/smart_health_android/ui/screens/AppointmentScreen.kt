package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.CollectionItemInfo
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.collectionItemInfo
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.appointments.ApiAppointmentRepository
import com.example.smart_health_android.appointments.Appointment
import com.example.smart_health_android.appointments.AppointmentAction
import com.example.smart_health_android.appointments.AppointmentActor
import com.example.smart_health_android.appointments.AppointmentLoadState
import com.example.smart_health_android.appointments.AppointmentRepository
import com.example.smart_health_android.appointments.AppointmentRoute
import com.example.smart_health_android.appointments.AppointmentStatus
import com.example.smart_health_android.appointments.AppointmentType
import com.example.smart_health_android.appointments.AppointmentUiAction
import com.example.smart_health_android.appointments.AppointmentUiEffect
import com.example.smart_health_android.appointments.AppointmentUiState
import com.example.smart_health_android.appointments.AppointmentViewModel
import com.example.smart_health_android.appointments.AppointmentWorkflow
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentScreen(
    onNavigateBack: () -> Unit,
    initialAppointmentId: String? = null,
    viewModel: AppointmentViewModel = viewModel(factory = AppointmentViewModelFactory()),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var initialAppointmentOpened by rememberSaveable(initialAppointmentId) { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        viewModel.onAction(AppointmentUiAction.Load)
    }
    LaunchedEffect(state.loadState, initialAppointmentId, initialAppointmentOpened) {
        if (
            !initialAppointmentOpened &&
            !initialAppointmentId.isNullOrBlank() &&
            state.loadState in setOf(AppointmentLoadState.Content, AppointmentLoadState.Empty)
        ) {
            initialAppointmentOpened = true
            viewModel.onAction(AppointmentUiAction.OpenAppointment(initialAppointmentId))
        }
    }
    LaunchedEffect(viewModel, context) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is AppointmentUiEffect.BackendMutationConfirmed -> {
                    snackbarHostState.showSnackbar(context.getString(effect.messageRes))
                }
            }
        }
    }

    BackHandler(
        enabled = state.selectedAppointmentId != null ||
            state.detailAppointmentId != null ||
            state.editor != null,
    ) {
        when {
            state.editor != null -> viewModel.onAction(AppointmentUiAction.DismissEditor)
            state.selectedAppointmentId != null || state.detailAppointmentId != null -> {
                viewModel.onAction(AppointmentUiAction.CloseAppointment)
            }
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = when (state.actor) {
                            AppointmentActor.Patient -> stringResource(R.string.appointment_title_patient)
                            AppointmentActor.Doctor -> stringResource(R.string.appointment_title_doctor)
                            AppointmentActor.Staff -> stringResource(R.string.appointment_title_staff)
                        },
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            if (state.selectedAppointmentId != null || state.detailAppointmentId != null) {
                                viewModel.onAction(AppointmentUiAction.CloseAppointment)
                            } else {
                                onNavigateBack()
                            }
                        },
                        modifier = Modifier.defaultMinSize(48.dp, 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.appointment_back),
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.onAction(AppointmentUiAction.Load) },
                        enabled = state.loadState != AppointmentLoadState.Loading && !state.isMutating,
                        modifier = Modifier.defaultMinSize(48.dp, 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.shcare_action_retry),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            if (
                state.canManage &&
                state.patients.isNotEmpty() &&
                state.selectedAppointmentId == null &&
                state.loadState != AppointmentLoadState.Permission
            ) {
                ExtendedFloatingActionButton(
                    onClick = { viewModel.onAction(AppointmentUiAction.StartCreate) },
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text(stringResource(R.string.appointment_create)) },
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        },
    ) { contentPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(contentPadding),
        ) {
            AppointmentAdaptiveContent(
                state = state,
                onAction = viewModel::onAction,
            )
        }
    }

    state.editor?.let { editor ->
        AppointmentEditorSheet(
            editor = editor,
            patients = state.patients,
            isSubmitting = state.isMutating,
            mutationError = state.errorMessage,
            requestId = state.requestId,
            onAction = viewModel::onAction,
        )
    }

    if (state.confirmEditorDismiss) {
        AlertDialog(
            onDismissRequest = { viewModel.onAction(AppointmentUiAction.KeepEditing) },
            title = { Text(stringResource(R.string.appointment_unsaved_title)) },
            text = { Text(stringResource(R.string.appointment_unsaved_message)) },
            confirmButton = {
                TextButton(onClick = { viewModel.onAction(AppointmentUiAction.DiscardEditor) }) {
                    Text(stringResource(R.string.appointment_discard_changes))
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.onAction(AppointmentUiAction.KeepEditing) }) {
                    Text(stringResource(R.string.appointment_continue_editing))
                }
            },
        )
    }

    if (state.pendingCancellationId != null) {
        AppointmentCancellationDialog(
            reason = state.cancellationReason,
            reasonError = state.cancellationReasonError?.let { stringResource(it) }.orEmpty(),
            isSubmitting = state.isMutating,
            mutationError = state.errorMessage,
            onAction = viewModel::onAction,
        )
    }

    state.pendingStatusConfirmation?.let { pending ->
        AppointmentStatusConfirmationDialog(
            action = pending.action,
            onConfirm = { viewModel.onAction(AppointmentUiAction.ConfirmStatusChange) },
            onDismiss = { viewModel.onAction(AppointmentUiAction.DismissStatusChange) },
        )
    }
}

@Composable
private fun AppointmentAdaptiveContent(
    state: AppointmentUiState,
    onAction: (AppointmentUiAction) -> Unit,
) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        val useTwoPane = maxWidth >= 840.dp
        val selectedAppointment = state.selectedAppointment
        if (useTwoPane && state.loadState in setOf(AppointmentLoadState.Content, AppointmentLoadState.Empty)) {
            Row(Modifier.fillMaxSize()) {
                AppointmentListPane(
                    state = state,
                    onAction = onAction,
                    modifier = Modifier
                        .weight(0.43f)
                        .fillMaxHeight(),
                )
                VerticalDivider()
                Box(
                    modifier = Modifier
                        .weight(0.57f)
                        .fillMaxHeight(),
                ) {
                    when {
                        state.detailLoadState != null -> AppointmentDetailRequestState(
                            state = state,
                            onAction = onAction,
                        )
                        selectedAppointment != null -> AppointmentDetailPane(
                            appointment = selectedAppointment,
                            state = state,
                            onAction = onAction,
                            compact = false,
                        )
                        else -> AppointmentDetailPlaceholder()
                    }
                }
            }
        } else {
            when {
                state.detailLoadState != null -> AppointmentDetailRequestState(
                    state = state,
                    onAction = onAction,
                )
                selectedAppointment != null -> AppointmentDetailPane(
                    appointment = selectedAppointment,
                    state = state,
                    onAction = onAction,
                    compact = true,
                )
                else -> AppointmentSinglePaneState(state, onAction)
            }
        }
    }
}

@Composable
private fun AppointmentDetailRequestState(
    state: AppointmentUiState,
    onAction: (AppointmentUiAction) -> Unit,
) {
    val retry = {
        state.detailAppointmentId?.let { appointmentId ->
            onAction(AppointmentUiAction.OpenAppointment(appointmentId))
        }
        Unit
    }
    when (state.detailLoadState) {
        AppointmentLoadState.Loading -> ShcareLoadingState(
            modifier = Modifier.fillMaxSize(),
            message = stringResource(R.string.shcare_state_loading),
        )
        AppointmentLoadState.Offline -> ShcareOfflineState(
            onRetry = retry,
            modifier = Modifier.fillMaxSize(),
            message = state.detailErrorMessage.takeIf(String::isNotBlank),
        )
        AppointmentLoadState.Permission -> AppointmentPermissionState(
            message = state.detailErrorMessage,
            requestId = state.detailRequestId,
        )
        AppointmentLoadState.Error -> ShcareErrorState(
            onRetry = retry,
            modifier = Modifier.fillMaxSize(),
            title = stringResource(R.string.appointment_load_error_title),
            message = state.detailErrorMessage.takeIf(String::isNotBlank),
        )
        AppointmentLoadState.Content,
        AppointmentLoadState.Empty,
        null,
        -> AppointmentDetailPlaceholder()
    }
}

@Composable
private fun AppointmentSinglePaneState(
    state: AppointmentUiState,
    onAction: (AppointmentUiAction) -> Unit,
) {
    when (state.loadState) {
        AppointmentLoadState.Loading -> ShcareLoadingState(
            modifier = Modifier.fillMaxSize(),
            message = stringResource(R.string.shcare_state_loading),
        )
        AppointmentLoadState.Offline -> ShcareOfflineState(
            onRetry = { onAction(AppointmentUiAction.Load) },
            modifier = Modifier.fillMaxSize(),
            message = state.errorMessage.takeIf(String::isNotBlank),
        )
        AppointmentLoadState.Error -> ShcareErrorState(
            onRetry = { onAction(AppointmentUiAction.Load) },
            modifier = Modifier.fillMaxSize(),
            title = stringResource(R.string.appointment_load_error_title),
            message = state.errorMessage.takeIf(String::isNotBlank),
        )
        AppointmentLoadState.Permission -> AppointmentPermissionState(
            message = state.errorMessage,
            requestId = state.requestId,
        )
        AppointmentLoadState.Empty,
        AppointmentLoadState.Content,
        -> AppointmentListPane(state, onAction, Modifier.fillMaxSize())
    }
}

@Composable
private fun AppointmentListPane(
    state: AppointmentUiState,
    onAction: (AppointmentUiAction) -> Unit,
    modifier: Modifier,
) {
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = modifier
            .testTag(AppointmentRoute.List.testTag)
            .semantics {
                collectionInfo = CollectionInfo(rowCount = state.visibleAppointments.size, columnCount = 1)
            },
        contentPadding = PaddingValues(
            start = spacing.large,
            top = spacing.medium,
            end = spacing.large,
            bottom = 104.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.medium),
    ) {
        item {
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = { onAction(AppointmentUiAction.SearchChanged(it)) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.appointment_search_label)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = if (state.searchQuery.isNotBlank()) {
                    {
                        IconButton(
                            onClick = { onAction(AppointmentUiAction.SearchChanged("")) },
                            modifier = Modifier.defaultMinSize(48.dp, 48.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = stringResource(R.string.appointment_close),
                            )
                        }
                    }
                } else {
                    null
                },
                singleLine = true,
            )
        }
        item {
            AppointmentStatusFilters(
                selected = state.statusFilter,
                onSelected = { onAction(AppointmentUiAction.StatusFilterChanged(it)) },
            )
        }
        if (!state.patientCatalogAvailable && state.canManage) {
            item {
                InlineInformationCard(
                    text = stringResource(R.string.appointment_patient_catalog_unavailable),
                )
            }
        }
        if (state.errorMessage.isNotBlank() && state.loadState == AppointmentLoadState.Content) {
            item {
                InlineMutationError(state.errorMessage, state.requestId)
            }
        }
        if (state.appointments.isEmpty()) {
            item {
                ShcareEmptyState(
                    title = stringResource(R.string.appointment_empty_title),
                    message = if (state.actor == AppointmentActor.Doctor) {
                        stringResource(R.string.appointment_empty_doctor)
                    } else {
                        stringResource(R.string.appointment_empty_patient)
                    },
                    actionLabel = if (state.canManage && state.patients.isNotEmpty()) {
                        stringResource(R.string.appointment_create)
                    } else {
                        null
                    },
                    onAction = if (state.canManage && state.patients.isNotEmpty()) {
                        { onAction(AppointmentUiAction.StartCreate) }
                    } else {
                        null
                    },
                )
            }
        } else if (state.visibleAppointments.isEmpty()) {
            item {
                ShcareEmptyState(
                    title = stringResource(R.string.appointment_no_results_title),
                    message = stringResource(R.string.appointment_no_results_message),
                )
            }
        } else {
            itemsIndexed(
                items = state.visibleAppointments,
                key = { _, appointment -> appointment.id },
            ) { index, appointment ->
                AppointmentCard(
                    appointment = appointment,
                    selected = state.selectedAppointmentId == appointment.id,
                    onClick = { onAction(AppointmentUiAction.OpenAppointment(appointment.id)) },
                    modifier = Modifier.semantics {
                        collectionItemInfo = CollectionItemInfo(
                            rowIndex = index,
                            rowSpan = 1,
                            columnIndex = 0,
                            columnSpan = 1,
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun AppointmentStatusFilters(
    selected: AppointmentStatus?,
    onSelected: (AppointmentStatus?) -> Unit,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        contentPadding = PaddingValues(vertical = ShcareTheme.spacing.extraSmall),
    ) {
        item {
            FilterChip(
                selected = selected == null,
                onClick = { onSelected(null) },
                label = { Text(stringResource(R.string.appointment_filter_all)) },
                modifier = Modifier.heightIn(min = 48.dp),
            )
        }
        val filterStatuses = AppointmentStatus.entries.filterNot { it == AppointmentStatus.Unknown }
        items(filterStatuses.size) { index ->
            val status = filterStatuses[index]
            FilterChip(
                selected = selected == status,
                onClick = { onSelected(status) },
                label = { Text(appointmentStatusLabel(status)) },
                modifier = Modifier.heightIn(min = 48.dp),
            )
        }
    }
}

@Composable
private fun AppointmentCard(
    appointment: Appointment,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    Card(
        modifier = modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 96.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        border = CardDefaults.outlinedCardBorder(),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.small),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = appointment.patient?.name
                            .orEmpty()
                            .ifBlank { appointment.doctor?.name.orEmpty() }
                            .ifBlank { appointment.patient?.patientCode.orEmpty() }
                            .ifBlank { appointment.id },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = formatAppointmentDateTime(appointment.startsAt),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AppointmentStatusBadge(appointment.status)
            }
            if (appointment.reason.isNotBlank()) {
                Text(
                    text = appointment.reason,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = appointmentTypeLabel(appointment.type),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun AppointmentDetailPane(
    appointment: Appointment,
    state: AppointmentUiState,
    onAction: (AppointmentUiAction) -> Unit,
    compact: Boolean,
) {
    val spacing = ShcareTheme.spacing
    val actions = AppointmentWorkflow.availableActions(
        status = appointment.status,
        actor = state.actor,
        canManage = state.canManage,
    )
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag(AppointmentRoute.Detail(appointment.id).testTag),
        contentPadding = PaddingValues(spacing.large),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        if (compact) {
            item {
                TextButton(
                    onClick = { onAction(AppointmentUiAction.CloseAppointment) },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    Spacer(Modifier.width(spacing.small))
                    Text(stringResource(R.string.appointment_back))
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.small)) {
                AppointmentStatusBadge(appointment.status)
                Text(
                    text = appointment.patient?.name
                        .orEmpty()
                        .ifBlank { appointment.patient?.patientCode.orEmpty() }
                        .ifBlank { stringResource(R.string.appointment_title_staff) },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    text = appointmentTypeLabel(appointment.type),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
        item {
            AppointmentDetailSection(
                icon = Icons.Default.Schedule,
                label = stringResource(R.string.appointment_time),
                value = formatAppointmentRange(appointment.startsAt, appointment.endsAt),
            )
        }
        appointment.patient?.let { patient ->
            item {
                AppointmentDetailSection(
                    icon = Icons.Default.Person,
                    label = stringResource(R.string.appointment_patient),
                    value = listOf(patient.name, patient.patientCode)
                        .filter(String::isNotBlank)
                        .joinToString(" · "),
                )
            }
        }
        appointment.doctor?.let { doctor ->
            item {
                AppointmentDetailSection(
                    icon = Icons.Default.Person,
                    label = stringResource(R.string.appointment_doctor),
                    value = listOf(doctor.name, doctor.specialty)
                        .filter(String::isNotBlank)
                        .joinToString(" · "),
                )
            }
        }
        if (appointment.reason.isNotBlank()) {
            item {
                AppointmentDetailSection(
                    icon = Icons.Default.CalendarMonth,
                    label = stringResource(R.string.appointment_reason),
                    value = appointment.reason,
                )
            }
        }
        if (appointment.location.isNotBlank()) {
            item {
                AppointmentDetailSection(
                    icon = Icons.Default.CalendarMonth,
                    label = stringResource(R.string.appointment_location),
                    value = appointment.location,
                )
            }
        }
        if (appointment.notes.isNotBlank()) {
            item {
                AppointmentDetailSection(
                    icon = Icons.Default.CalendarMonth,
                    label = stringResource(R.string.appointment_notes),
                    value = appointment.notes,
                )
            }
        }
        if (appointment.cancellationReason.isNotBlank()) {
            item {
                AppointmentDetailSection(
                    icon = Icons.Default.EventBusy,
                    label = stringResource(R.string.appointment_cancellation_reason),
                    value = appointment.cancellationReason,
                )
            }
        }
        if (actions.isNotEmpty()) {
            item {
                AppointmentActions(
                    appointment = appointment,
                    actions = actions,
                    enabled = !state.isMutating,
                    onAction = onAction,
                )
            }
        }
        if (state.errorMessage.isNotBlank()) {
            item { InlineMutationError(state.errorMessage, state.requestId) }
        }
    }
}

@Composable
private fun AppointmentActions(
    appointment: Appointment,
    actions: Set<AppointmentAction>,
    enabled: Boolean,
    onAction: (AppointmentUiAction) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
    ) {
        if (AppointmentAction.Confirm in actions) {
            Button(
                onClick = {
                    onAction(AppointmentUiAction.ApplyWorkflowAction(appointment.id, AppointmentAction.Confirm))
                },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_confirm_action))
            }
        }
        if (AppointmentAction.Complete in actions) {
            Button(
                onClick = {
                    onAction(AppointmentUiAction.ApplyWorkflowAction(appointment.id, AppointmentAction.Complete))
                },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_complete_action))
            }
        }
        if (AppointmentAction.Reschedule in actions) {
            FilledTonalButton(
                onClick = { onAction(AppointmentUiAction.StartReschedule(appointment.id)) },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_reschedule_action))
            }
        }
        if (AppointmentAction.MarkNoShow in actions) {
            OutlinedButton(
                onClick = {
                    onAction(AppointmentUiAction.ApplyWorkflowAction(appointment.id, AppointmentAction.MarkNoShow))
                },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_no_show_action))
            }
        }
        if (AppointmentAction.Cancel in actions) {
            OutlinedButton(
                onClick = { onAction(AppointmentUiAction.RequestCancellation(appointment.id)) },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                Text(
                    text = stringResource(R.string.appointment_cancel_action),
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun AppointmentStatusConfirmationDialog(
    action: AppointmentAction,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val isNoShow = action == AppointmentAction.MarkNoShow
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                stringResource(
                    if (isNoShow) {
                        R.string.appointment_no_show_confirm_title
                    } else {
                        R.string.appointment_complete_confirm_title
                    }
                )
            )
        },
        text = {
            Text(
                stringResource(
                    if (isNoShow) {
                        R.string.appointment_no_show_confirm_message
                    } else {
                        R.string.appointment_complete_confirm_message
                    }
                )
            )
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_confirm_status_change))
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_close))
            }
        },
    )
}

@Composable
private fun AppointmentDetailSection(
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
        Column(Modifier.weight(1f)) {
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
private fun AppointmentStatusBadge(status: AppointmentStatus) {
    val colors = when (status) {
        AppointmentStatus.Scheduled -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        AppointmentStatus.Confirmed -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        AppointmentStatus.Completed -> ShcareTheme.colors.successContainer to ShcareTheme.colors.onSuccessContainer
        AppointmentStatus.Cancelled -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
        AppointmentStatus.NoShow -> ShcareTheme.colors.warningContainer to ShcareTheme.colors.onWarningContainer
        AppointmentStatus.Unknown -> ShcareTheme.colors.offlineContainer to ShcareTheme.colors.onOfflineContainer
    }
    val label = appointmentStatusLabel(status)
    Surface(
        color = colors.first,
        contentColor = colors.second,
        shape = MaterialTheme.shapes.small,
        modifier = Modifier.semantics { stateDescription = label },
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun AppointmentPermissionState(message: String, requestId: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(ShcareTheme.spacing.doubleExtraLarge),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Default.Lock,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.error,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(ShcareTheme.spacing.large))
        Text(
            text = stringResource(R.string.appointment_permission_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(ShcareTheme.spacing.small))
        Text(
            text = message.ifBlank { stringResource(R.string.appointment_permission_message) },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (requestId.isNotBlank()) {
            Spacer(Modifier.height(ShcareTheme.spacing.small))
            Text(
                text = stringResource(R.string.appointment_request_id, requestId),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun AppointmentDetailPlaceholder() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = stringResource(R.string.appointment_detail_placeholder),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(ShcareTheme.spacing.extraLarge),
        )
    }
}

@Composable
private fun InlineInformationCard(text: String) {
    Surface(
        color = ShcareTheme.colors.infoContainer,
        contentColor = ShcareTheme.colors.onInfoContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(ShcareTheme.spacing.large),
        )
    }
}

@Composable
private fun InlineMutationError(message: String, requestId: String) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = stringResource(R.string.appointment_mutation_error),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(text = message, style = MaterialTheme.typography.bodyMedium)
            if (requestId.isNotBlank()) {
                Text(
                    text = stringResource(R.string.appointment_request_id, requestId),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}

@Composable
private fun appointmentStatusLabel(status: AppointmentStatus): String = when (status) {
    AppointmentStatus.Scheduled -> stringResource(R.string.appointment_status_scheduled)
    AppointmentStatus.Confirmed -> stringResource(R.string.appointment_status_confirmed)
    AppointmentStatus.Completed -> stringResource(R.string.appointment_status_completed)
    AppointmentStatus.Cancelled -> stringResource(R.string.appointment_status_cancelled)
    AppointmentStatus.NoShow -> stringResource(R.string.appointment_status_no_show)
    AppointmentStatus.Unknown -> stringResource(R.string.appointment_status_unknown)
}

@Composable
private fun appointmentTypeLabel(type: AppointmentType): String = when (type) {
    AppointmentType.RemoteConsultation -> stringResource(R.string.appointment_type_remote)
    AppointmentType.ClinicVisit -> stringResource(R.string.appointment_type_clinic)
    AppointmentType.Measurement -> stringResource(R.string.appointment_type_measurement)
    AppointmentType.FollowUp -> stringResource(R.string.appointment_type_follow_up)
    AppointmentType.Unknown -> stringResource(R.string.appointment_type_unknown)
}

private val appointmentDateTimeFormatter = DateTimeFormatter.ofPattern(
    "EEEE, dd/MM/yyyy · HH:mm",
    Locale.forLanguageTag("vi-VN"),
)
private val appointmentTimeFormatter = DateTimeFormatter.ofPattern(
    "HH:mm",
    Locale.forLanguageTag("vi-VN"),
)

private fun formatAppointmentDateTime(value: String): String = runCatching {
    Instant.parse(value).atZone(ZoneId.systemDefault()).format(appointmentDateTimeFormatter)
}.getOrDefault(value)

private fun formatAppointmentRange(startsAt: String, endsAt: String): String {
    val start = runCatching { Instant.parse(startsAt).atZone(ZoneId.systemDefault()) }.getOrNull()
    val end = runCatching { Instant.parse(endsAt).atZone(ZoneId.systemDefault()) }.getOrNull()
    return when {
        start != null && end != null -> {
            "${start.format(appointmentDateTimeFormatter)} – ${end.format(appointmentTimeFormatter)}"
        }
        else -> listOf(startsAt, endsAt).filter(String::isNotBlank).joinToString(" – ")
    }
}

private class AppointmentViewModelFactory(
    private val repository: AppointmentRepository = ApiAppointmentRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(AppointmentViewModel::class.java))
        return AppointmentViewModel(repository) as T
    }
}
