package com.example.smart_health_android.clinical.reviews

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.data.ClinicalReview
import com.example.smart_health_android.data.ClinicalReviewDecision
import com.example.smart_health_android.data.ClinicalReviewStatus
import com.example.smart_health_android.ui.components.ShcareEmptyState
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun ClinicalReviewsScreen(
    expectedWorkspaceId: String,
    canManage: Boolean,
    onNavigateBack: () -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    modifier: Modifier = Modifier,
    providedViewModel: ClinicalReviewsViewModel? = null,
) {
    if (expectedWorkspaceId.isBlank() && providedViewModel == null) {
        ShcarePermissionState(
            title = stringResource(R.string.clinical_reviews_workspace_required_title),
            message = stringResource(R.string.clinical_reviews_workspace_required_message),
            actionLabel = stringResource(R.string.clinical_reviews_workspace_action),
            onRequestPermission = onOpenWorkspaceSwitcher,
            modifier = modifier.fillMaxSize(),
        )
        return
    }
    val factory = remember(expectedWorkspaceId, canManage) {
        ClinicalReviewsViewModelFactory(expectedWorkspaceId, canManage)
    }
    val resolvedViewModel = providedViewModel ?: viewModel(factory = factory)
    val state = resolvedViewModel.uiState.collectAsStateWithLifecycle().value
    val snackbarHostState = remember { SnackbarHostState() }
    val accepted = stringResource(R.string.clinical_reviews_confirmed_accepted)
    val repeat = stringResource(R.string.clinical_reviews_confirmed_repeat)
    val followUp = stringResource(R.string.clinical_reviews_confirmed_follow_up)
    val refreshed = stringResource(R.string.clinical_reviews_refreshed_after_conflict)

    LaunchedEffect(resolvedViewModel, snackbarHostState) {
        resolvedViewModel.effects.collect { effect ->
            val message = when (effect) {
                is ClinicalReviewsUiEffect.BackendDecisionConfirmed -> when (effect.decision) {
                    ClinicalReviewDecision.Accepted -> accepted
                    ClinicalReviewDecision.RepeatMeasurement -> repeat
                    ClinicalReviewDecision.FollowUpRequired -> followUp
                }
                ClinicalReviewsUiEffect.BackendStateRefreshedAfterConflict -> refreshed
            }
            snackbarHostState.showSnackbar(message)
        }
    }

    ClinicalReviewsContent(
        state = state,
        onAction = resolvedViewModel::onAction,
        onNavigateBack = onNavigateBack,
        onOpenWorkspaceSwitcher = onOpenWorkspaceSwitcher,
        snackbarHostState = snackbarHostState,
        modifier = modifier,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ClinicalReviewsContent(
    state: ClinicalReviewsUiState,
    onAction: (ClinicalReviewsUiAction) -> Unit,
    onNavigateBack: () -> Unit,
    onOpenWorkspaceSwitcher: () -> Unit,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier.fillMaxSize().testTag("clinical-reviews-screen"),
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.clinical_reviews_title),
                onNavigateBack = onNavigateBack,
                backContentDescription = stringResource(R.string.clinical_reviews_back),
                actions = {
                    TextButton(
                        onClick = onOpenWorkspaceSwitcher,
                        modifier = Modifier.sizeIn(minHeight = 48.dp),
                        colors = ButtonDefaults.textButtonColors(
                            contentColor = ShcareTheme.colors.onBrandHeader,
                            disabledContentColor = ShcareTheme.colors.onBrandHeader.copy(
                                alpha = 0.55f,
                            ),
                        ),
                    ) {
                        Text(stringResource(R.string.clinical_reviews_workspace_action))
                    }
                    IconButton(
                        onClick = { onAction(ClinicalReviewsUiAction.Refresh) },
                        enabled = !state.isRefreshing && !state.isMutating,
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp),
                    ) {
                        Icon(
                            Icons.Default.Refresh,
                            contentDescription = stringResource(R.string.clinical_reviews_refresh),
                        )
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = state.filter == ClinicalReviewFilter.Pending,
                    onClick = {
                        onAction(ClinicalReviewsUiAction.ChangeFilter(ClinicalReviewFilter.Pending))
                    },
                    label = { Text(stringResource(R.string.clinical_reviews_filter_pending)) },
                    modifier = Modifier.sizeIn(minHeight = 48.dp),
                )
                FilterChip(
                    selected = state.filter == ClinicalReviewFilter.Reviewed,
                    onClick = {
                        onAction(ClinicalReviewsUiAction.ChangeFilter(ClinicalReviewFilter.Reviewed))
                    },
                    label = { Text(stringResource(R.string.clinical_reviews_filter_reviewed)) },
                    modifier = Modifier.sizeIn(minHeight = 48.dp),
                )
            }
            if (state.isStale && state.error != null) {
                ClinicalReviewStaleNotice(state, onAction)
            }
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val twoPane = maxWidth >= 840.dp && LocalDensity.current.fontScale < 1.5f
                val selected = state.reviews.firstOrNull { it.id == state.selectedReviewId }
                when (state.loadState) {
                    ClinicalReviewsLoadState.Loading -> ShcareLoadingState(
                        message = stringResource(R.string.clinical_reviews_loading),
                    )
                    ClinicalReviewsLoadState.Empty -> ShcareEmptyState(
                        title = stringResource(R.string.clinical_reviews_empty_title),
                        message = stringResource(R.string.clinical_reviews_empty_message),
                        actionLabel = stringResource(R.string.clinical_reviews_refresh),
                        onAction = { onAction(ClinicalReviewsUiAction.Refresh) },
                    )
                    ClinicalReviewsLoadState.PermissionDenied -> ShcarePermissionState(
                        title = stringResource(R.string.clinical_reviews_permission_title),
                        message = clinicalReviewErrorText(state),
                        actionLabel = stringResource(R.string.clinical_reviews_workspace_action),
                        onRequestPermission = onOpenWorkspaceSwitcher,
                    )
                    ClinicalReviewsLoadState.Offline -> ShcareOfflineState(
                        message = clinicalReviewErrorText(state),
                        onRetry = { onAction(ClinicalReviewsUiAction.Refresh) },
                    )
                    ClinicalReviewsLoadState.Error -> ShcareErrorState(
                        message = clinicalReviewErrorText(state),
                        onRetry = { onAction(ClinicalReviewsUiAction.Refresh) },
                    )
                    ClinicalReviewsLoadState.Content -> if (twoPane) {
                        Row(Modifier.fillMaxSize()) {
                            ClinicalReviewListPane(
                                state,
                                onAction,
                                Modifier.weight(0.44f).fillMaxHeight(),
                            )
                            VerticalDivider()
                            if (selected == null) {
                                Box(Modifier.weight(0.56f).fillMaxHeight(), contentAlignment = Alignment.Center) {
                                    Text(stringResource(R.string.clinical_reviews_select_prompt))
                                }
                            } else {
                                ClinicalReviewDetail(
                                    selected,
                                    state,
                                    onAction,
                                    Modifier.weight(0.56f).fillMaxHeight(),
                                )
                            }
                        }
                    } else {
                        ClinicalReviewListPane(state, onAction, Modifier.fillMaxSize(), showDetails = true)
                    }
                }
            }
        }
    }

    state.pendingDecision?.let { pending ->
        ClinicalReviewDecisionDialog(
            pending = pending,
            isMutating = state.isMutating,
            errorText = state.error?.let { clinicalReviewErrorText(state) }.orEmpty(),
            onAction = onAction,
        )
    }
}

@Composable
private fun ClinicalReviewListPane(
    state: ClinicalReviewsUiState,
    onAction: (ClinicalReviewsUiAction) -> Unit,
    modifier: Modifier,
    showDetails: Boolean = false,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (!state.canManage && state.filter == ClinicalReviewFilter.Pending) {
            item {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Text(
                        stringResource(R.string.clinical_reviews_read_only),
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }
        items(state.reviews, key = ClinicalReview::id) { review ->
            ClinicalReviewCard(
                review = review,
                selected = review.id == state.selectedReviewId,
                onSelect = { onAction(ClinicalReviewsUiAction.SelectReview(review.id)) },
            )
            if (showDetails) {
                ClinicalReviewDetail(review, state, onAction, Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun ClinicalReviewCard(
    review: ClinicalReview,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    Card(
        onClick = onSelect,
        colors = CardDefaults.cardColors(
            containerColor = if (selected) {
                MaterialTheme.colorScheme.secondaryContainer
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 88.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                stringResource(R.string.clinical_reviews_scan_label, review.scanId),
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                stringResource(R.string.clinical_reviews_patient_device, review.patientId, review.deviceId),
                style = MaterialTheme.typography.bodySmall,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                formatClinicalReviewTime(review.scanCreatedAt),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ClinicalReviewDetail(
    review: ClinicalReview,
    state: ClinicalReviewsUiState,
    onAction: (ClinicalReviewsUiAction) -> Unit,
    modifier: Modifier,
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            stringResource(R.string.clinical_reviews_detail_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Text(stringResource(R.string.clinical_reviews_scan_label, review.scanId))
        Text(stringResource(R.string.clinical_reviews_version, review.version))
        HorizontalDivider()
        if (review.status == ClinicalReviewStatus.Reviewed) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.semantics {
                    stateDescription = review.decision?.wireValue.orEmpty()
                },
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Text(clinicalReviewDecisionLabel(review.decision), fontWeight = FontWeight.SemiBold)
            }
            if (review.note.isNotBlank()) Text(review.note)
            Text(
                stringResource(
                    R.string.clinical_reviews_reviewer_time,
                    review.reviewerUserId,
                    formatClinicalReviewTime(review.reviewedAt),
                ),
                style = MaterialTheme.typography.bodySmall,
            )
        } else if (state.canManage) {
            Button(
                onClick = {
                    onAction(
                        ClinicalReviewsUiAction.RequestDecision(
                            review.scanId,
                            ClinicalReviewDecision.Accepted,
                        ),
                    )
                },
                enabled = !state.isMutating,
                modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.clinical_reviews_accept))
            }
            OutlinedButton(
                onClick = {
                    onAction(
                        ClinicalReviewsUiAction.RequestDecision(
                            review.scanId,
                            ClinicalReviewDecision.RepeatMeasurement,
                        ),
                    )
                },
                enabled = !state.isMutating,
                modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.clinical_reviews_repeat))
            }
            OutlinedButton(
                onClick = {
                    onAction(
                        ClinicalReviewsUiAction.RequestDecision(
                            review.scanId,
                            ClinicalReviewDecision.FollowUpRequired,
                        ),
                    )
                },
                enabled = !state.isMutating,
                modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.clinical_reviews_follow_up))
            }
        }
    }
}

@Composable
private fun ClinicalReviewDecisionDialog(
    pending: PendingClinicalReviewDecision,
    isMutating: Boolean,
    errorText: String,
    onAction: (ClinicalReviewsUiAction) -> Unit,
) {
    AlertDialog(
        onDismissRequest = {
            if (!isMutating) onAction(ClinicalReviewsUiAction.DismissDecision)
        },
        title = { Text(clinicalReviewDecisionLabel(pending.decision)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(stringResource(R.string.clinical_reviews_decision_disclaimer))
                OutlinedTextField(
                    value = pending.note,
                    onValueChange = {
                        onAction(ClinicalReviewsUiAction.UpdateDecisionNote(it))
                    },
                    label = { Text(stringResource(R.string.clinical_reviews_note)) },
                    minLines = 3,
                    enabled = !isMutating,
                    isError = pending.validationError != null,
                    supportingText = pending.validationError?.let {
                        { Text(stringResource(R.string.clinical_reviews_note_required)) }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (errorText.isNotBlank()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Text(errorText, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onAction(ClinicalReviewsUiAction.ConfirmDecision) },
                enabled = !isMutating,
                modifier = Modifier.sizeIn(minHeight = 48.dp),
            ) {
                Text(
                    if (isMutating) {
                        stringResource(R.string.clinical_reviews_confirming)
                    } else {
                        stringResource(R.string.clinical_reviews_confirm)
                    },
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = { onAction(ClinicalReviewsUiAction.DismissDecision) },
                enabled = !isMutating,
                modifier = Modifier.sizeIn(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.clinical_reviews_cancel))
            }
        },
    )
}

@Composable
private fun ClinicalReviewStaleNotice(
    state: ClinicalReviewsUiState,
    onAction: (ClinicalReviewsUiAction) -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Default.Warning, contentDescription = null)
            Text(clinicalReviewErrorText(state), modifier = Modifier.weight(1f))
            TextButton(onClick = { onAction(ClinicalReviewsUiAction.Refresh) }) {
                Text(stringResource(R.string.clinical_reviews_refresh))
            }
        }
    }
}

@Composable
private fun clinicalReviewDecisionLabel(decision: ClinicalReviewDecision?): String = when (decision) {
    ClinicalReviewDecision.Accepted -> stringResource(R.string.clinical_reviews_accept)
    ClinicalReviewDecision.RepeatMeasurement -> stringResource(R.string.clinical_reviews_repeat)
    ClinicalReviewDecision.FollowUpRequired -> stringResource(R.string.clinical_reviews_follow_up)
    null -> stringResource(R.string.clinical_reviews_decision_unknown)
}

@Composable
private fun clinicalReviewErrorText(state: ClinicalReviewsUiState): String {
    val base = when (state.error) {
        ClinicalReviewsError.PermissionDenied -> stringResource(R.string.clinical_reviews_error_permission)
        ClinicalReviewsError.Conflict -> stringResource(R.string.clinical_reviews_error_conflict)
        ClinicalReviewsError.Offline -> stringResource(R.string.clinical_reviews_error_offline)
        ClinicalReviewsError.WorkspaceMismatch -> stringResource(R.string.clinical_reviews_error_workspace)
        ClinicalReviewsError.Confirmation -> stringResource(R.string.clinical_reviews_error_confirmation)
        ClinicalReviewsError.Unknown, null -> stringResource(R.string.clinical_reviews_error_unknown)
    }
    return if (state.requestId.isBlank()) base else "$base (${state.requestId})"
}

private fun formatClinicalReviewTime(value: String): String = runCatching {
    DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", Locale.forLanguageTag("vi-VN"))
        .withZone(ZoneId.systemDefault())
        .format(Instant.parse(value))
}.getOrDefault(value.ifBlank { "—" })
