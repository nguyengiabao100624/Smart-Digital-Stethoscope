package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.consent.ApiConsentRepository
import com.example.smart_health_android.consent.ConsentGrantEditorState
import com.example.smart_health_android.consent.ConsentLoadState
import com.example.smart_health_android.consent.ConsentRecipientKind
import com.example.smart_health_android.consent.ConsentRepository
import com.example.smart_health_android.consent.ConsentScope
import com.example.smart_health_android.consent.ConsentUiAction
import com.example.smart_health_android.consent.ConsentUiEffect
import com.example.smart_health_android.consent.ConsentUiState
import com.example.smart_health_android.consent.ConsentViewModel
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientShare
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.ZoneOffset

private val ExpandedConsentWidth = 840.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataAccessScreen(
    onNavigateBack: () -> Unit,
    viewModel: ConsentViewModel = viewModel(factory = ConsentViewModelFactory()),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        viewModel.onAction(ConsentUiAction.Load)
    }
    LaunchedEffect(viewModel, context) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is ConsentUiEffect.BackendMutationConfirmed -> {
                    snackbarHostState.showSnackbar(context.getString(effect.messageRes))
                }
            }
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.consent_title),
                onNavigateBack = onNavigateBack,
                backContentDescription = stringResource(R.string.consent_back),
                actions = {
                    IconButton(
                        onClick = { viewModel.onAction(ConsentUiAction.Refresh) },
                        enabled = state.loadState != ConsentLoadState.Loading &&
                            !state.isRefreshing &&
                            !state.isMutating,
                        modifier = Modifier.defaultMinSize(48.dp, 48.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.consent_refresh),
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        floatingActionButton = {
            if (state.canCreateGrant && state.editor == null) {
                ExtendedFloatingActionButton(
                    onClick = { viewModel.onAction(ConsentUiAction.StartCreateGrant) },
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text(stringResource(R.string.consent_create_grant)) },
                    modifier = Modifier
                        .heightIn(min = 48.dp)
                        .testTag("consent_create_grant"),
                )
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            ConsentScreenState(
                state = state,
                onAction = viewModel::onAction,
            )
            if (state.isRefreshing) {
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter),
                )
            }
        }
    }

    state.editor?.let { editor ->
        ConsentGrantSheet(
            state = state,
            editor = editor,
            onAction = viewModel::onAction,
        )
    }

    if (state.confirmEditorDismiss) {
        AlertDialog(
            onDismissRequest = { viewModel.onAction(ConsentUiAction.KeepEditing) },
            title = { Text(stringResource(R.string.consent_discard_title)) },
            text = { Text(stringResource(R.string.consent_discard_message)) },
            confirmButton = {
                TextButton(onClick = { viewModel.onAction(ConsentUiAction.DiscardEditor) }) {
                    Text(stringResource(R.string.consent_discard_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.onAction(ConsentUiAction.KeepEditing) }) {
                    Text(stringResource(R.string.consent_keep_editing))
                }
            },
        )
    }

    state.pendingRevocation?.let { pending ->
        val share = state.shares.firstOrNull { it.id == pending.shareId }
        AlertDialog(
            onDismissRequest = {
                if (!state.isMutating) viewModel.onAction(ConsentUiAction.DismissRevoke)
            },
            icon = { Icon(Icons.Default.WarningAmber, contentDescription = null) },
            title = { Text(stringResource(R.string.consent_revoke_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
                    Text(
                        stringResource(
                            R.string.consent_revoke_message,
                            share?.recipientLabel()
                                ?: stringResource(R.string.consent_recipient_unknown),
                        )
                    )
                    MutationError(state)
                }
            },
            confirmButton = {
                Button(
                    onClick = { viewModel.onAction(ConsentUiAction.ConfirmRevoke) },
                    enabled = !state.isMutating,
                ) {
                    Text(
                        if (state.isMutating) {
                            stringResource(R.string.consent_waiting_backend)
                        } else {
                            stringResource(R.string.consent_revoke_confirm)
                        }
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { viewModel.onAction(ConsentUiAction.DismissRevoke) },
                    enabled = !state.isMutating,
                ) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun ConsentScreenState(
    state: ConsentUiState,
    onAction: (ConsentUiAction) -> Unit,
) {
    when (state.loadState) {
        ConsentLoadState.Loading -> ShcareLoadingState(
            message = stringResource(R.string.consent_loading),
            modifier = Modifier.fillMaxSize(),
        )
        ConsentLoadState.Empty -> ShcareEmptyState(
            title = stringResource(R.string.consent_no_profiles_title),
            message = stringResource(R.string.consent_no_profiles_message),
            actionLabel = stringResource(R.string.consent_refresh),
            onAction = { onAction(ConsentUiAction.Load) },
            modifier = Modifier.fillMaxSize(),
        )
        ConsentLoadState.Offline -> ShcareOfflineState(
            onRetry = { onAction(ConsentUiAction.Refresh) },
            title = stringResource(R.string.consent_offline_title),
            message = stringResource(R.string.consent_offline_message),
            modifier = Modifier.fillMaxSize(),
        )
        ConsentLoadState.Permission -> ShcarePermissionState(
            onRequestPermission = { onAction(ConsentUiAction.Refresh) },
            title = stringResource(R.string.consent_permission_title),
            message = stringResource(R.string.consent_permission_message),
            actionLabel = stringResource(R.string.shcare_action_retry),
            modifier = Modifier.fillMaxSize(),
        )
        ConsentLoadState.Error -> ShcareErrorState(
            onRetry = { onAction(ConsentUiAction.Refresh) },
            title = stringResource(R.string.consent_error_title),
            message = state.errorMessage.ifBlank {
                stringResource(R.string.consent_error_message)
            },
            modifier = Modifier.fillMaxSize(),
        )
        ConsentLoadState.Content -> BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            if (maxWidth >= ExpandedConsentWidth) {
                ExpandedConsentContent(state, onAction)
            } else {
                CompactConsentContent(state, onAction)
            }
        }
    }
}

@Composable
private fun CompactConsentContent(
    state: ConsentUiState,
    onAction: (ConsentUiAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .testTag("consent_compact_content"),
        contentPadding = PaddingValues(
            start = spacing.large,
            top = spacing.large,
            end = spacing.large,
            bottom = 104.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        item { ConsentSummary(state) }
        consentIssueItems(state, onAction)
        item {
            SectionHeading(
                title = stringResource(R.string.consent_profiles_heading),
                supporting = state.selectedPatient?.name.orEmpty(),
            )
        }
        item {
            PatientRow(
                patients = state.patients,
                selectedPatientId = state.selectedPatientId,
                onSelect = { onAction(ConsentUiAction.SelectPatient(it)) },
            )
        }
        item { GrantSectionHeader(state, onAction) }
        grantItems(state, onAction)
    }
}

@Composable
private fun ExpandedConsentContent(
    state: ConsentUiState,
    onAction: (ConsentUiAction) -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = spacing.extraLarge, vertical = spacing.large)
            .testTag("consent_expanded_content"),
        horizontalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        LazyColumn(
            modifier = Modifier
                .width(300.dp)
                .fillMaxHeight(),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
            contentPadding = PaddingValues(bottom = spacing.extraLarge),
        ) {
            item { ConsentSummary(state) }
            item {
                SectionHeading(
                    title = stringResource(R.string.consent_profiles_heading),
                    supporting = stringResource(R.string.consent_profiles_supporting),
                )
            }
            items(state.patients, key = { it.id }) { patient ->
                PatientOption(
                    patient = patient,
                    selected = patient.id == state.selectedPatientId,
                    onClick = { onAction(ConsentUiAction.SelectPatient(patient.id)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        VerticalDivider()
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
            contentPadding = PaddingValues(bottom = 104.dp),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            consentIssueItems(state, onAction)
            item { GrantSectionHeader(state, onAction) }
            grantItems(state, onAction)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.consentIssueItems(
    state: ConsentUiState,
    onAction: (ConsentUiAction) -> Unit,
) {
    if (state.isStale) {
        item {
            ConsentIssueCard(
                title = stringResource(R.string.consent_stale_title),
                message = state.errorMessage.ifBlank {
                    stringResource(R.string.consent_stale_message)
                },
                onRetry = { onAction(ConsentUiAction.Refresh) },
            )
        }
    }
    if (!state.recipientCatalogAvailable) {
        item {
            ConsentIssueCard(
                title = stringResource(R.string.consent_targets_unavailable_title),
                message = state.recipientCatalogError.ifBlank {
                    stringResource(R.string.consent_targets_unavailable_message)
                },
                onRetry = { onAction(ConsentUiAction.RetryRecipients) },
            )
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.grantItems(
    state: ConsentUiState,
    onAction: (ConsentUiAction) -> Unit,
) {
    if (state.isLoadingPatientData) {
        item {
            ShcareLoadingState(message = stringResource(R.string.consent_loading_grants))
        }
        return
    }
    if (state.visibleShares.isEmpty()) {
        item {
            ShcareEmptyState(
                title = if (state.shares.isEmpty()) {
                    stringResource(R.string.consent_no_grants_title)
                } else {
                    stringResource(R.string.consent_no_active_grants_title)
                },
                message = if (state.shares.isEmpty()) {
                    stringResource(R.string.consent_no_grants_message)
                } else {
                    stringResource(R.string.consent_no_active_grants_message)
                },
                actionLabel = stringResource(R.string.consent_refresh),
                onAction = { onAction(ConsentUiAction.Refresh) },
            )
        }
        return
    }
    items(state.visibleShares, key = { it.id }) { share ->
        ConsentGrantCard(
            share = share,
            onRevoke = { onAction(ConsentUiAction.RequestRevoke(share.id)) },
        )
    }
}

@Composable
private fun ConsentSummary(state: ConsentUiState) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(ShcareTheme.spacing.large),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.primary,
            ) {
                Icon(
                    imageVector = Icons.Default.Shield,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.padding(ShcareTheme.spacing.medium),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.consent_summary_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                Text(
                    text = pluralStringResource(
                        R.plurals.consent_summary_counts,
                        state.activeShareCount,
                        state.patients.size,
                        state.activeShareCount,
                    ),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
    }
}

@Composable
private fun SectionHeading(
    title: String,
    supporting: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.semantics { heading() },
        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
    ) {
        Text(text = title, style = MaterialTheme.typography.titleLarge)
        if (supporting.isNotBlank()) {
            Text(
                text = supporting,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PatientRow(
    patients: List<Patient>,
    selectedPatientId: String,
    onSelect: (String) -> Unit,
) {
    LazyRow(
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        modifier = Modifier.semantics {
            collectionInfo = CollectionInfo(rowCount = 1, columnCount = patients.size)
        },
    ) {
        items(patients, key = { it.id }) { patient ->
            PatientOption(
                patient = patient,
                selected = patient.id == selectedPatientId,
                onClick = { onSelect(patient.id) },
                modifier = Modifier.width(240.dp),
            )
        }
    }
}

@Composable
private fun PatientOption(
    patient: Patient,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val selectedDescription = if (selected) {
        stringResource(R.string.consent_profile_selected)
    } else {
        stringResource(R.string.consent_profile_not_selected)
    }
    Surface(
        modifier = modifier
            .defaultMinSize(minHeight = 64.dp)
            .semantics { stateDescription = selectedDescription }
            .clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = if (selected) {
            MaterialTheme.colorScheme.secondaryContainer
        } else {
            MaterialTheme.colorScheme.surface
        },
        border = BorderStroke(
            1.dp,
            if (selected) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.outlineVariant,
        ),
    ) {
        Row(
            modifier = Modifier.padding(ShcareTheme.spacing.medium),
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (patient.profileType == "dependent") {
                    Icons.Default.Groups
                } else {
                    Icons.Default.Person
                },
                contentDescription = null,
                tint = if (selected) {
                    MaterialTheme.colorScheme.onSecondaryContainer
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = patient.name.ifBlank { patient.patientCode.ifBlank { patient.id } },
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = patient.profileLabel(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (selected) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                )
            }
        }
    }
}

@Composable
private fun GrantSectionHeader(
    state: ConsentUiState,
    onAction: (ConsentUiAction) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SectionHeading(
            title = stringResource(R.string.consent_access_heading),
            supporting = stringResource(
                R.string.consent_access_supporting,
                state.selectedPatient?.name.orEmpty(),
            ),
            modifier = Modifier.weight(1f),
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.consent_active_only),
                style = MaterialTheme.typography.labelMedium,
            )
            Switch(
                checked = state.showOnlyActive,
                onCheckedChange = {
                    onAction(ConsentUiAction.ShowOnlyActiveChanged(it))
                },
                modifier = Modifier.testTag("consent_active_filter"),
            )
        }
    }
}

@Composable
private fun ConsentGrantCard(
    share: PatientShare,
    onRevoke: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("consent_grant_${share.id}"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier.padding(spacing.large),
            verticalArrangement = Arrangement.spacedBy(spacing.medium),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.medium),
                verticalAlignment = Alignment.Top,
            ) {
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    Icon(
                        imageVector = if (share.recipient.type == "workspace") {
                            Icons.Default.Business
                        } else {
                            Icons.Default.Person
                        },
                        contentDescription = null,
                        modifier = Modifier.padding(spacing.medium),
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = share.recipientLabel(),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = share.authorityLabel(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                ConsentStatusBadge(share)
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

            AccessMetadataRow(
                label = stringResource(R.string.consent_scope_label),
                value = share.scopeLabel(),
            )
            AccessMetadataRow(
                label = stringResource(R.string.consent_expiry_label),
                value = share.expiresAt?.let { formatIso(it, "dd/MM/yyyy") }
                    ?: stringResource(R.string.consent_no_expiry),
            )
            AccessMetadataRow(
                label = stringResource(R.string.consent_granted_by_label),
                value = share.grantedByLabel(),
            )
            share.createdAt?.let {
                AccessMetadataRow(
                    label = stringResource(R.string.consent_created_at_label),
                    value = formatIso(it, "dd/MM/yyyy HH:mm"),
                )
            }
            share.revokedAt?.let {
                AccessMetadataRow(
                    label = stringResource(R.string.consent_revoked_at_label),
                    value = buildString {
                        append(formatIso(it, "dd/MM/yyyy HH:mm"))
                        share.revokedByActor?.name?.takeIf(String::isNotBlank)?.let { actorName ->
                            append(" · ")
                            append(actorName)
                        }
                    },
                )
            }

            if (share.isActive) {
                OutlinedButton(
                    onClick = onRevoke,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                ) {
                    Icon(Icons.Default.Security, contentDescription = null)
                    Spacer(modifier = Modifier.width(spacing.small))
                    Text(stringResource(R.string.consent_revoke_action))
                }
            }
        }
    }
}

@Composable
private fun ConsentStatusBadge(share: PatientShare) {
    val semanticColors = ShcareTheme.colors
    val (container, content) = when (share.status) {
        "active" -> semanticColors.successContainer to semanticColors.onSuccessContainer
        "expired" -> semanticColors.warningContainer to semanticColors.onWarningContainer
        "revoked" -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        else -> if (share.isActive) {
            semanticColors.successContainer to semanticColors.onSuccessContainer
        } else {
            MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
        }
    }
    val label = when (share.status) {
        "active" -> stringResource(R.string.consent_status_active)
        "revoked" -> stringResource(R.string.consent_status_revoked)
        "expired" -> stringResource(R.string.consent_status_expired)
        else -> stringResource(R.string.consent_status_unknown)
    }
    Surface(
        shape = MaterialTheme.shapes.extraLarge,
        color = container,
        contentColor = content,
        modifier = Modifier.semantics { stateDescription = label },
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(
                horizontal = ShcareTheme.spacing.medium,
                vertical = ShcareTheme.spacing.small,
            ),
        )
    }
}

@Composable
private fun AccessMetadataRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(112.dp),
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun ConsentIssueCard(
    title: String,
    message: String,
    onRetry: () -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = ShcareTheme.colors.warningContainer,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                color = ShcareTheme.colors.onWarningContainer,
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = ShcareTheme.colors.onWarningContainer,
            )
            TextButton(
                onClick = onRetry,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.shcare_action_retry))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConsentGrantSheet(
    state: ConsentUiState,
    editor: ConsentGrantEditorState,
    onAction: (ConsentUiAction) -> Unit,
) {
    var showDatePicker by remember { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = { onAction(ConsentUiAction.DismissEditor) },
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 720.dp)
                .navigationBarsPadding()
                .imePadding()
                .testTag("consent_grant_sheet"),
            contentPadding = PaddingValues(
                start = ShcareTheme.spacing.large,
                end = ShcareTheme.spacing.large,
                bottom = ShcareTheme.spacing.extraLarge,
            ),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
        ) {
            item {
                SectionHeading(
                    title = stringResource(R.string.consent_create_title),
                    supporting = stringResource(
                        R.string.consent_create_supporting,
                        state.selectedPatient?.name.orEmpty(),
                    ),
                )
            }
            item {
                RecipientKindSelector(state, editor, onAction)
            }
            item {
                RecipientSelector(state, editor, onAction)
            }
            item {
                ScopeSelector(state, editor, onAction)
            }
            item {
                ExpirySelector(
                    editor = editor,
                    onOpenDatePicker = { showDatePicker = true },
                    onClear = { onAction(ConsentUiAction.ExpiryChanged("")) },
                )
            }
            item { MutationError(state) }
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
                ) {
                    OutlinedButton(
                        onClick = { onAction(ConsentUiAction.DismissEditor) },
                        enabled = !state.isMutating,
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp),
                    ) {
                        Text(stringResource(R.string.action_cancel))
                    }
                    Button(
                        onClick = { onAction(ConsentUiAction.SubmitGrant) },
                        enabled = !state.isMutating,
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .testTag("consent_submit_grant"),
                    ) {
                        Text(
                            if (state.isMutating) {
                                stringResource(R.string.consent_waiting_backend)
                            } else {
                                stringResource(R.string.consent_submit_grant)
                            }
                        )
                    }
                }
            }
        }
    }

    if (showDatePicker) {
        val datePickerState = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = editor.expiresAt.toDatePickerMillis(),
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        datePickerState.selectedDateMillis?.let { millis ->
                            onAction(ConsentUiAction.ExpiryChanged(millis.toEndOfDayIso()))
                        }
                        showDatePicker = false
                    },
                    enabled = datePickerState.selectedDateMillis != null,
                ) {
                    Text(stringResource(R.string.action_complete))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

@Composable
private fun RecipientKindSelector(
    state: ConsentUiState,
    editor: ConsentGrantEditorState,
    onAction: (ConsentUiAction) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
        FieldLabel(stringResource(R.string.consent_recipient_type))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
            if (state.targets.doctors.isNotEmpty()) {
                item {
                    FilterChip(
                        selected = editor.recipientKind == ConsentRecipientKind.Doctor,
                        onClick = {
                            onAction(ConsentUiAction.RecipientKindChanged(ConsentRecipientKind.Doctor))
                        },
                        label = { Text(stringResource(R.string.consent_recipient_doctor)) },
                        leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                        modifier = Modifier.heightIn(min = 48.dp),
                    )
                }
            }
            if (state.targets.workspaces.isNotEmpty()) {
                item {
                    FilterChip(
                        selected = editor.recipientKind == ConsentRecipientKind.Workspace,
                        onClick = {
                            onAction(ConsentUiAction.RecipientKindChanged(ConsentRecipientKind.Workspace))
                        },
                        label = { Text(stringResource(R.string.consent_recipient_workspace)) },
                        leadingIcon = { Icon(Icons.Default.Business, contentDescription = null) },
                        modifier = Modifier.heightIn(min = 48.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun RecipientSelector(
    state: ConsentUiState,
    editor: ConsentGrantEditorState,
    onAction: (ConsentUiAction) -> Unit,
) {
    val entries = when (editor.recipientKind) {
        ConsentRecipientKind.Doctor -> state.targets.doctors.map {
            Triple(it.id, it.name.ifBlank { it.id }, it.specialty.ifBlank { it.clinicName })
        }
        ConsentRecipientKind.Workspace -> state.targets.workspaces.map {
            Triple(it.id, it.name.ifBlank { it.id }, it.address)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
        FieldLabel(stringResource(R.string.consent_recipient_label))
        entries.forEach { (id, title, supporting) ->
            val selected = editor.recipientId == id
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 56.dp)
                    .clickable { onAction(ConsentUiAction.RecipientChanged(id)) },
                shape = MaterialTheme.shapes.medium,
                color = if (selected) {
                    MaterialTheme.colorScheme.secondaryContainer
                } else {
                    MaterialTheme.colorScheme.surface
                },
                border = BorderStroke(
                    1.dp,
                    if (selected) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.outlineVariant,
                ),
            ) {
                Row(
                    modifier = Modifier.padding(ShcareTheme.spacing.medium),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(
                        selected = selected,
                        onClick = null,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(text = title, style = MaterialTheme.typography.titleSmall)
                        if (supporting.isNotBlank()) {
                            Text(
                                text = supporting,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        editor.fieldErrors["recipient"]?.let {
            FieldError(stringResource(it))
        }
    }
}

@Composable
private fun ScopeSelector(
    state: ConsentUiState,
    editor: ConsentGrantEditorState,
    onAction: (ConsentUiAction) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
        FieldLabel(stringResource(R.string.consent_scope_label))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
            item {
                FilterChip(
                    selected = editor.scope == ConsentScope.PatientProfile,
                    onClick = { onAction(ConsentUiAction.ScopeChanged(ConsentScope.PatientProfile)) },
                    label = { Text(stringResource(R.string.consent_scope_profile)) },
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
            item {
                FilterChip(
                    selected = editor.scope == ConsentScope.SelectedScans,
                    onClick = { onAction(ConsentUiAction.ScopeChanged(ConsentScope.SelectedScans)) },
                    label = { Text(stringResource(R.string.consent_scope_scans)) },
                    enabled = state.scanCatalogAvailable && state.scans.isNotEmpty(),
                    modifier = Modifier.heightIn(min = 48.dp),
                )
            }
        }
        if (!state.scanCatalogAvailable) {
            Text(
                text = state.scanCatalogError.ifBlank {
                    stringResource(R.string.consent_scans_unavailable)
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        if (editor.scope == ConsentScope.SelectedScans) {
            if (state.scans.isEmpty()) {
                Text(
                    text = stringResource(R.string.consent_no_scans),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
                    items(state.scans, key = { it.id }) { scan ->
                        FilterChip(
                            selected = scan.id in editor.selectedScanIds,
                            onClick = {
                                onAction(ConsentUiAction.ScanSelectionChanged(scan.id))
                            },
                            label = { Text(scan.accessibilityLabel()) },
                            modifier = Modifier.heightIn(min = 48.dp),
                        )
                    }
                }
            }
            editor.fieldErrors["scanIds"]?.let {
                FieldError(stringResource(it))
            }
        }
    }
}

@Composable
private fun ExpirySelector(
    editor: ConsentGrantEditorState,
    onOpenDatePicker: () -> Unit,
    onClear: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
        FieldLabel(stringResource(R.string.consent_expiry_optional))
        Column(
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
            horizontalAlignment = Alignment.Start,
        ) {
            FilledTonalButton(
                onClick = onOpenDatePicker,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Icon(Icons.Default.CalendarMonth, contentDescription = null)
                Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                Text(
                    editor.expiresAt.takeIf(String::isNotBlank)?.let {
                        formatIso(it, "dd/MM/yyyy")
                    } ?: stringResource(R.string.consent_choose_expiry)
                )
            }
            if (editor.expiresAt.isNotBlank()) {
                TextButton(
                    onClick = onClear,
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.consent_clear_expiry))
                }
            }
        }
        editor.fieldErrors["expiresAt"]?.let {
            FieldError(stringResource(it))
        }
    }
}

@Composable
private fun FieldLabel(label: String) {
    Text(
        text = label,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun FieldError(message: String) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.error,
    )
}

@Composable
private fun MutationError(state: ConsentUiState) {
    if (state.mutationErrorMessage.isBlank()) return
    Column(
        modifier = Modifier.semantics {
            stateDescription = state.mutationErrorMessage
        },
        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
    ) {
        Text(
            text = state.mutationErrorMessage,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
        )
        if (state.mutationRequestId.isNotBlank()) {
            Text(
                text = stringResource(
                    R.string.consent_request_id,
                    state.mutationRequestId,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private class ConsentViewModelFactory(
    private val repository: ConsentRepository = ApiConsentRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ConsentViewModel::class.java)) {
            return ConsentViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}

@Composable
private fun Patient.profileLabel(): String {
    return when {
        relationship.isNotBlank() -> relationship
        profileType == "self" -> stringResource(R.string.consent_profile_self)
        profileType == "dependent" -> stringResource(R.string.consent_profile_dependent)
        patientCode.isNotBlank() -> patientCode
        else -> id
    }
}

@Composable
private fun PatientShare.authorityLabel(): String {
    return when (authorityType) {
        "patient_consent" -> stringResource(R.string.consent_authority_patient)
        "clinician_access_grant" -> stringResource(R.string.consent_authority_clinician)
        "administrative_assignment" -> stringResource(R.string.consent_authority_administrative)
        else -> stringResource(R.string.consent_authority_unspecified)
    }
}

@Composable
private fun PatientShare.scopeLabel(): String {
    return when (scope) {
        "selected_scans" -> stringResource(R.string.consent_scope_selected_count, scanIds.size)
        "patient_profile" -> stringResource(R.string.consent_scope_profile)
        else -> scope.ifBlank { stringResource(R.string.consent_scope_unspecified) }
    }
}

@Composable
private fun PatientShare.recipientLabel(): String {
    if (recipient.name.isNotBlank()) return recipient.name
    return recipient.id.ifBlank { stringResource(R.string.consent_recipient_unknown) }
}

@Composable
private fun PatientShare.grantedByLabel(): String {
    return grantedByActor?.let { actor ->
        actor.name.ifBlank { actor.id }.takeIf(String::isNotBlank)
    } ?: grantedByUserId.takeIf(String::isNotBlank)
        ?: stringResource(R.string.consent_actor_unavailable)
}

@Composable
private fun Scan.accessibilityLabel(): String {
    val type = when (mode) {
        "heart" -> stringResource(R.string.consent_scan_heart)
        "lung" -> stringResource(R.string.consent_scan_lung)
        else -> mode.ifBlank { stringResource(R.string.consent_scan_unknown) }
    }
    return stringResource(
        R.string.consent_scan_label,
        type,
        formattedDate(),
        formattedTime(),
    )
}

private fun String.toDatePickerMillis(): Long? {
    if (isBlank()) return null
    return runCatching {
        Instant.parse(this).atZone(ZoneOffset.UTC).toLocalDate()
            .atStartOfDay(ZoneOffset.UTC)
            .toInstant()
            .toEpochMilli()
    }.getOrNull()
}

private fun Long.toEndOfDayIso(): String {
    return Instant.ofEpochMilli(this)
        .atZone(ZoneOffset.UTC)
        .toLocalDate()
        .atTime(23, 59, 59, 999_000_000)
        .toInstant(ZoneOffset.UTC)
        .toString()
}
