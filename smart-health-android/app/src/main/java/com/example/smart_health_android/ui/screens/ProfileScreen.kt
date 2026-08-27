package com.example.smart_health_android.ui.screens

import android.graphics.BitmapFactory
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.account.AccountProfileAction
import com.example.smart_health_android.account.AccountProfileAvatarCleanup
import com.example.smart_health_android.account.AccountProfileConfirmation
import com.example.smart_health_android.account.AccountProfileErrorKind
import com.example.smart_health_android.account.AccountProfileLoadState
import com.example.smart_health_android.account.AccountProfileUiState
import com.example.smart_health_android.account.AccountProfileViewModel
import com.example.smart_health_android.data.AvatarCleanupStatus
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareGradientTopAppBar
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcareOfflineState
import com.example.smart_health_android.ui.components.ShcarePermissionState
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    profileViewModel: AccountProfileViewModel = viewModel(),
) {
    val state by profileViewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var leaveAfterDiscard by remember { mutableStateOf(false) }

    val avatarLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            scope.launch {
                val selected = runCatching {
                    withContext(Dispatchers.IO) {
                        val resolver = context.contentResolver
                        val contentType = resolver.getType(uri).orEmpty().ifBlank { "image/jpeg" }
                        val extension = contentType.substringAfter('/', "jpg")
                        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: byteArrayOf()
                        Triple("avatar.$extension", contentType, bytes)
                    }
                }.getOrElse { Triple("avatar.jpg", "image/jpeg", byteArrayOf()) }
                profileViewModel.onAction(
                    AccountProfileAction.AvatarSelected(
                        fileName = selected.first,
                        contentType = selected.second,
                        bytes = selected.third,
                    )
                )
            }
        }
    }

    fun leaveProfile() {
        when {
            state.isSaving || state.isAvatarBusy -> Unit
            state.isEditing && state.hasUnsavedChanges -> {
                leaveAfterDiscard = true
                profileViewModel.onAction(AccountProfileAction.RequestDiscard)
            }
            state.isEditing -> {
                profileViewModel.onAction(AccountProfileAction.ConfirmDiscard)
                onNavigateBack()
            }
            else -> onNavigateBack()
        }
    }

    BackHandler(onBack = ::leaveProfile)

    Scaffold(
        topBar = {
            ShcareGradientTopAppBar(
                title = stringResource(R.string.profile_title),
                onNavigateBack = ::leaveProfile,
                backContentDescription = stringResource(R.string.profile_back),
                actions = {
                    if (state.loadState == AccountProfileLoadState.Ready) {
                        TextButton(
                            onClick = {
                                profileViewModel.onAction(
                                    if (state.isEditing) AccountProfileAction.Save
                                    else AccountProfileAction.StartEditing
                                )
                            },
                            enabled = !state.isSaving && !state.isAvatarBusy,
                            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                            colors = ButtonDefaults.textButtonColors(
                                contentColor = ShcareTheme.colors.onBrandHeader,
                                disabledContentColor = ShcareTheme.colors.onBrandHeader.copy(alpha = 0.55f),
                            ),
                        ) {
                            if (state.isSaving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = ShcareTheme.colors.onBrandHeader,
                                )
                                Spacer(Modifier.size(8.dp))
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Edit,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.size(8.dp))
                            }
                            Text(
                                stringResource(
                                    when {
                                        state.isSaving -> R.string.profile_saving
                                        state.isEditing -> R.string.profile_save
                                        else -> R.string.profile_edit
                                    }
                                )
                            )
                        }
                    }
                },
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        when (state.loadState) {
            AccountProfileLoadState.Loading -> ShcareLoadingState(
                message = stringResource(R.string.profile_loading),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            AccountProfileLoadState.Error -> ShcareErrorState(
                onRetry = { profileViewModel.onAction(AccountProfileAction.Retry) },
                title = stringResource(R.string.profile_load_error_title),
                message = profileErrorMessage(state.errorKind),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            AccountProfileLoadState.Offline -> ShcareOfflineState(
                onRetry = { profileViewModel.onAction(AccountProfileAction.Retry) },
                title = stringResource(R.string.profile_offline_title),
                message = stringResource(R.string.profile_offline_message),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            AccountProfileLoadState.PermissionDenied -> ShcarePermissionState(
                onRequestPermission = onNavigateBack,
                title = stringResource(R.string.profile_permission_title),
                message = stringResource(R.string.profile_permission_message),
                actionLabel = stringResource(R.string.profile_back),
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            )
            AccountProfileLoadState.Ready -> ProfileContent(
                state = state,
                onAction = profileViewModel::onAction,
                onPickAvatar = { avatarLauncher.launch("image/*") },
                modifier = Modifier.padding(padding),
            )
        }
    }

    if (state.showDiscardConfirmation) {
        AlertDialog(
            onDismissRequest = {
                leaveAfterDiscard = false
                profileViewModel.onAction(AccountProfileAction.KeepEditing)
            },
            title = { Text(stringResource(R.string.profile_discard_title)) },
            text = { Text(stringResource(R.string.profile_discard_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        profileViewModel.onAction(AccountProfileAction.ConfirmDiscard)
                        if (leaveAfterDiscard) onNavigateBack()
                        leaveAfterDiscard = false
                    },
                ) {
                    Text(stringResource(R.string.profile_discard_confirm))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        leaveAfterDiscard = false
                        profileViewModel.onAction(AccountProfileAction.KeepEditing)
                    },
                ) {
                    Text(stringResource(R.string.profile_continue_editing))
                }
            },
        )
    }

    if (state.showAvatarDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = {
                profileViewModel.onAction(AccountProfileAction.DismissAvatarDelete)
            },
            title = { Text(stringResource(R.string.profile_avatar_delete_title)) },
            text = { Text(stringResource(R.string.profile_avatar_delete_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        profileViewModel.onAction(AccountProfileAction.ConfirmAvatarDelete)
                    },
                ) {
                    Text(stringResource(R.string.profile_avatar_delete_confirm))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        profileViewModel.onAction(AccountProfileAction.DismissAvatarDelete)
                    },
                ) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun ProfileContent(
    state: AccountProfileUiState,
    onAction: (AccountProfileAction) -> Unit,
    onPickAvatar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = ShcareTheme.spacing
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .imePadding(),
        contentPadding = PaddingValues(spacing.large),
        verticalArrangement = Arrangement.spacedBy(spacing.large),
    ) {
        item {
            ProfileHero(
                state = state,
                onPickAvatar = onPickAvatar,
                onDeleteAvatar = { onAction(AccountProfileAction.RequestAvatarDelete) },
            )
        }

        state.errorKind?.let { errorKind ->
            item {
                ProfileStatusMessage(
                    message = buildString {
                        append(profileErrorMessage(errorKind))
                        if (state.requestId.isNotBlank()) {
                            append(' ')
                            append(stringResource(R.string.profile_request_id, state.requestId))
                        }
                    },
                    tone = ProfileStatusTone.Error,
                )
            }
        }

        state.avatarCleanupNotice?.let { cleanup ->
            item {
                ProfileStatusMessage(
                    title = stringResource(
                        if (cleanup.status == AvatarCleanupStatus.DeadLetter) {
                            R.string.profile_avatar_cleanup_support_title
                        } else {
                            R.string.profile_avatar_cleanup_pending_title
                        },
                    ),
                    message = stringResource(
                        when {
                            cleanup.status == AvatarCleanupStatus.DeadLetter -> {
                                R.string.profile_avatar_cleanup_support_message
                            }
                            cleanup.action == AccountProfileAvatarCleanup.Upload -> {
                                R.string.profile_avatar_upload_cleanup_pending
                            }
                            cleanup.action == AccountProfileAvatarCleanup.Delete -> {
                                R.string.profile_avatar_delete_cleanup_pending
                            }
                            else -> R.string.profile_avatar_orphan_cleanup_pending
                        },
                    ),
                    tone = ProfileStatusTone.Warning,
                )
            }
        }

        state.confirmation?.let { confirmation ->
            item {
                ProfileStatusMessage(
                    message = stringResource(
                        when (confirmation) {
                            AccountProfileConfirmation.ProfileSaved -> R.string.profile_saved
                            AccountProfileConfirmation.AvatarUpdated -> R.string.profile_avatar_updated
                            AccountProfileConfirmation.AvatarDeleted -> R.string.profile_avatar_deleted
                        }
                    ),
                    tone = ProfileStatusTone.Success,
                )
            }
        }

        item {
            ProfileSectionCard(title = stringResource(R.string.profile_personal_section)) {
                ProfileField(
                    label = stringResource(R.string.profile_name),
                    value = state.draft.name,
                    editing = state.isEditing,
                    onValueChange = { onAction(AccountProfileAction.ChangeName(it)) },
                    isError = state.nameInvalid,
                    supportingText = if (state.nameInvalid) {
                        stringResource(R.string.profile_name_required)
                    } else null,
                )
                ProfileField(
                    label = stringResource(R.string.profile_email),
                    value = state.user?.email.orEmpty(),
                    editing = false,
                    onValueChange = {},
                    supportingText = stringResource(R.string.profile_email_verification_note),
                )
                ProfileField(
                    label = stringResource(R.string.profile_phone),
                    value = state.draft.phone,
                    editing = false,
                    onValueChange = {},
                    supportingText = stringResource(R.string.profile_phone_unavailable),
                    keyboardType = KeyboardType.Phone,
                )
                ProfileField(
                    label = stringResource(R.string.profile_address),
                    value = state.draft.address,
                    editing = state.isEditing,
                    onValueChange = { onAction(AccountProfileAction.ChangeAddress(it)) },
                    minLines = 2,
                )
            }
        }

        if (state.isProfessionalProfile) {
            item {
                ProfileSectionCard(title = stringResource(R.string.profile_professional_section)) {
                    ProfileField(
                        label = stringResource(R.string.profile_license),
                        value = state.draft.license,
                        editing = state.isEditing,
                        onValueChange = { onAction(AccountProfileAction.ChangeLicense(it)) },
                    )
                    ProfileCatalogField(
                        label = stringResource(R.string.profile_clinic),
                        value = state.draft.hospital,
                        selectedId = state.draft.organizationId,
                        options = state.clinics.map { it.id to it.name },
                        editing = state.isEditing,
                        onSelect = { onAction(AccountProfileAction.SelectClinic(it)) },
                        onValueChange = { onAction(AccountProfileAction.ChangeHospital(it)) },
                    )
                    ProfileCatalogField(
                        label = stringResource(R.string.profile_specialty),
                        value = state.draft.department,
                        selectedId = state.draft.specialtyId,
                        options = state.specialties.map { it.id to it.name },
                        editing = state.isEditing,
                        onSelect = { onAction(AccountProfileAction.SelectSpecialty(it)) },
                        onValueChange = { onAction(AccountProfileAction.ChangeDepartment(it)) },
                    )
                }
            }
        }

        item {
            ProfileSectionCard(title = stringResource(R.string.profile_account_section)) {
                ProfileReadOnlyValue(
                    label = stringResource(R.string.profile_role),
                    value = profileRoleLabel(state.user?.role.orEmpty()),
                )
                ProfileReadOnlyValue(
                    label = stringResource(R.string.profile_joined),
                    value = formatCreatedAt(state.user?.createdAt),
                )
            }
        }

        if (state.isEditing) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(spacing.medium)) {
                    Button(
                        onClick = { onAction(AccountProfileAction.Save) },
                        enabled = !state.isSaving && !state.isAvatarBusy,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 52.dp),
                    ) {
                        if (state.isSaving) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.size(8.dp))
                        }
                        Text(
                            stringResource(
                                if (state.isSaving) R.string.profile_saving else R.string.profile_save
                            )
                        )
                    }
                    OutlinedButton(
                        onClick = { onAction(AccountProfileAction.RequestDiscard) },
                        enabled = !state.isSaving && !state.isAvatarBusy,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 52.dp),
                    ) {
                        Text(stringResource(R.string.action_cancel))
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileHero(
    state: AccountProfileUiState,
    onPickAvatar: () -> Unit,
    onDeleteAvatar: () -> Unit,
) {
    val spacing = ShcareTheme.spacing
    val bitmap by produceState<ImageBitmap?>(initialValue = null, key1 = state.avatarBytes) {
        value = withContext(Dispatchers.Default) { state.avatarBytes?.decodeImageBitmap() }
    }
    val resolvedBitmap = bitmap
    val displayName = state.draft.name.ifBlank { stringResource(R.string.profile_account_fallback) }
    val initials = remember(displayName) {
        displayName
            .split(' ')
            .mapNotNull { it.firstOrNull()?.uppercaseChar()?.toString() }
            .take(2)
            .joinToString("")
            .ifBlank { "SH" }
    }
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(spacing.large),
            horizontalArrangement = Arrangement.spacedBy(spacing.large),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.size(88.dp),
                ) {
                    if (resolvedBitmap != null) {
                        Image(
                            bitmap = resolvedBitmap,
                            contentDescription = stringResource(R.string.profile_avatar_description),
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                text = initials,
                                style = MaterialTheme.typography.headlineMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }
                if (state.isAvatarBusy) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.scrim.copy(alpha = 0.54f),
                        modifier = Modifier.size(88.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(
                                color = MaterialTheme.colorScheme.inverseOnSurface,
                                modifier = Modifier.size(28.dp),
                            )
                        }
                    }
                }
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.extraSmall),
            ) {
                Text(
                    text = displayName,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = profileRoleLabel(state.user?.role.orEmpty()),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
                if (state.isEditing) {
                    Row(horizontalArrangement = Arrangement.spacedBy(spacing.small)) {
                        IconButton(
                            onClick = onPickAvatar,
                            enabled = !state.isAvatarBusy && !state.isSaving,
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.PhotoCamera,
                                contentDescription = stringResource(R.string.profile_avatar_choose),
                            )
                        }
                        if (state.hasAvatar) {
                            IconButton(
                                onClick = onDeleteAvatar,
                                enabled = !state.isAvatarBusy && !state.isSaving,
                                modifier = Modifier.size(48.dp),
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = stringResource(R.string.profile_avatar_delete),
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileStatusMessage(
    message: String,
    tone: ProfileStatusTone,
    title: String? = null,
) {
    Surface(
        color = when (tone) {
            ProfileStatusTone.Error -> MaterialTheme.colorScheme.errorContainer
            ProfileStatusTone.Success -> ShcareTheme.colors.successContainer
            ProfileStatusTone.Warning -> ShcareTheme.colors.warningContainer
        },
        contentColor = when (tone) {
            ProfileStatusTone.Error -> MaterialTheme.colorScheme.onErrorContainer
            ProfileStatusTone.Success -> ShcareTheme.colors.onSuccessContainer
            ProfileStatusTone.Warning -> ShcareTheme.colors.onWarningContainer
        },
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier
            .fillMaxWidth()
            .semantics {
                liveRegion = if (tone == ProfileStatusTone.Error) {
                    LiveRegionMode.Assertive
                } else {
                    LiveRegionMode.Polite
                }
            },
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small),
        ) {
            title?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

private enum class ProfileStatusTone {
    Error,
    Success,
    Warning,
}

@Composable
private fun ProfileSectionCard(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            content()
        }
    }
}

@Composable
private fun ProfileField(
    label: String,
    value: String,
    editing: Boolean,
    onValueChange: (String) -> Unit,
    isError: Boolean = false,
    supportingText: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    minLines: Int = 1,
) {
    if (editing) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            isError = isError,
            supportingText = supportingText?.let { text -> ({ Text(text) }) },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            singleLine = minLines == 1,
            minLines = minLines,
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 56.dp),
        )
    } else {
        ProfileReadOnlyValue(label = label, value = value, supportingText = supportingText)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileCatalogField(
    label: String,
    value: String,
    selectedId: String,
    options: List<Pair<String, String>>,
    editing: Boolean,
    onSelect: (String) -> Unit,
    onValueChange: (String) -> Unit,
) {
    if (!editing) {
        ProfileReadOnlyValue(label = label, value = value)
        return
    }
    if (options.isEmpty()) {
        ProfileField(
            label = label,
            value = value,
            editing = true,
            onValueChange = onValueChange,
        )
        return
    }

    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = !expanded },
    ) {
        OutlinedTextField(
            value = options.firstOrNull { it.first == selectedId }?.second ?: value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true)
                .fillMaxWidth()
                .defaultMinSize(minHeight = 56.dp),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            options.forEach { (id, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        onSelect(id)
                        expanded = false
                    },
                    leadingIcon = if (id == selectedId) {
                        {
                            Icon(
                                imageVector = Icons.Default.VerifiedUser,
                                contentDescription = null,
                            )
                        }
                    } else null,
                )
            }
        }
    }
}

@Composable
private fun ProfileReadOnlyValue(
    label: String,
    value: String,
    supportingText: String? = null,
) {
    ListItem(
        headlineContent = {
            Text(
                text = value.ifBlank { stringResource(R.string.profile_not_provided) },
                style = MaterialTheme.typography.bodyLarge,
            )
        },
        overlineContent = { Text(label) },
        supportingContent = supportingText?.let { text -> ({ Text(text) }) },
        colors = androidx.compose.material3.ListItemDefaults.colors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
    )
}

@Composable
private fun profileErrorMessage(kind: AccountProfileErrorKind?): String = stringResource(
    when (kind) {
        AccountProfileErrorKind.Save -> R.string.profile_save_error
        AccountProfileErrorKind.ServerUnconfirmed -> R.string.profile_server_unconfirmed
        AccountProfileErrorKind.AvatarRead -> R.string.profile_avatar_read_error
        AccountProfileErrorKind.AvatarType -> R.string.profile_avatar_type_error
        AccountProfileErrorKind.AvatarSize -> R.string.profile_avatar_size_error
        AccountProfileErrorKind.AvatarUpload -> R.string.profile_avatar_upload_error
        AccountProfileErrorKind.AvatarUnconfirmed -> R.string.profile_avatar_unconfirmed
        AccountProfileErrorKind.AvatarRefresh -> R.string.profile_avatar_refresh_error
        AccountProfileErrorKind.AvatarDelete -> R.string.profile_avatar_delete_error
        AccountProfileErrorKind.AvatarDeleteUnconfirmed -> R.string.profile_avatar_delete_unconfirmed
        AccountProfileErrorKind.Load, null -> R.string.profile_load_error_message
    }
)

@Composable
private fun profileRoleLabel(role: String): String = stringResource(
    when (role) {
        "doctor" -> R.string.workspace_role_doctor
        "owner" -> R.string.workspace_role_owner
        "admin" -> R.string.workspace_role_admin
        "nurse" -> R.string.workspace_role_nurse
        "technician" -> R.string.workspace_role_technician
        "billing" -> R.string.workspace_role_billing
        "viewer" -> R.string.workspace_role_viewer
        "patient" -> R.string.workspace_role_patient
        else -> R.string.workspace_role_member
    }
)

@Composable
private fun formatCreatedAt(value: String?): String {
    if (value.isNullOrBlank()) return stringResource(R.string.profile_not_provided)
    return runCatching {
        DateTimeFormatter.ofPattern("dd/MM/yyyy")
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(value))
    }.getOrDefault(value)
}

private fun ByteArray.decodeImageBitmap(): ImageBitmap? = runCatching {
    BitmapFactory.decodeByteArray(this, 0, size)?.asImageBitmap()
}.getOrNull()
