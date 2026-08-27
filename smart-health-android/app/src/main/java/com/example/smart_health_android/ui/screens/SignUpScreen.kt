package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.R
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.security.SignUpAccountType
import com.example.smart_health_android.security.SignUpUiAction
import com.example.smart_health_android.security.SignUpUiEffect
import com.example.smart_health_android.security.SignUpViewModel
import com.example.smart_health_android.security.SignUpViewModelFactory

@Composable
fun SignUpScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToVerifyEmail: (
        accountType: String,
        firebaseOwner: FirebaseOwnerBinding,
    ) -> Unit,
    signUpViewModel: SignUpViewModel = viewModel(
        factory = SignUpViewModelFactory(LocalContext.current),
    ),
) {
    val uiState by signUpViewModel.uiState.collectAsStateWithLifecycle()
    val accountType = uiState.accountType.apiValue
    val name = uiState.name
    val phone = uiState.phone
    val email = uiState.email
    val password = uiState.password
    val confirmPassword = uiState.confirmPassword
    val license = uiState.license
    val registrationReason = uiState.registrationReason
    val clinics = uiState.clinics
    val specialties = uiState.specialties
    val requestedClinicName = uiState.requestedClinicName
    val isCatalogLoading = uiState.isCatalogLoading
    val catalogError = uiState.catalogError
    val agreedToTerms = uiState.agreedToTerms
    val isSubmitting = uiState.isSubmitting
    val hasStartedSubmission = uiState.hasStartedSubmission
    val hasCapturedFirebaseOwner = uiState.hasCapturedFirebaseOwner
    val isAbandoningRegistration = uiState.isAbandoningRegistration
    val abandonmentErrorMessage = uiState.abandonmentErrorMessage
    val isFieldInteractionLocked =
        isSubmitting ||
            uiState.isSubmissionComplete ||
            isAbandoningRegistration ||
            hasStartedSubmission
    val isPrimaryActionLocked =
        isSubmitting || uiState.isSubmissionComplete || isAbandoningRegistration
    val isBackLocked =
        isSubmitting || uiState.isSubmissionComplete || isAbandoningRegistration
    val errorMessage = uiState.errorMessage
    val fieldErrors = uiState.fieldErrors
    val privateClinicOptions = uiState.privateClinicOptions
    val selectedSpecialty = uiState.selectedSpecialty
    val clinicDisplayName = uiState.clinicDisplayName
    val soloClinicDisplayName = uiState.soloClinicDisplayName
    val isDoctorRegistration = uiState.isDoctorRegistration
    val requiresClinicSelection = uiState.requiresClinicSelection

    LaunchedEffect(signUpViewModel) {
        signUpViewModel.effects.collect { effect ->
            when (effect) {
                SignUpUiEffect.NavigateLogin -> onNavigateToLogin()
                is SignUpUiEffect.NavigateVerifyEmail ->
                    onNavigateToVerifyEmail(effect.accountType, effect.firebaseOwner)
            }
        }
    }

    BackHandler(
        enabled = uiState.hasUnsavedChanges || hasStartedSubmission || isBackLocked,
    ) {
        signUpViewModel.onAction(SignUpUiAction.BackRequested)
    }

    if (uiState.showDiscardDialog) {
        AlertDialog(
            onDismissRequest = {
                signUpViewModel.onAction(SignUpUiAction.DismissDiscard)
            },
            title = {
                Text(
                    when {
                        hasCapturedFirebaseOwner ->
                            stringResource(R.string.signup_discard_owner_title)

                        hasStartedSubmission ->
                            stringResource(R.string.signup_discard_progress_title)

                        else -> stringResource(R.string.signup_discard_changes_title)
                    },
                )
            },
            text = {
                Text(
                    when {
                        hasCapturedFirebaseOwner ->
                            stringResource(R.string.signup_discard_owner_message)

                        hasStartedSubmission ->
                            stringResource(R.string.signup_discard_progress_message)

                        else -> stringResource(R.string.signup_discard_changes_message)
                    },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        signUpViewModel.onAction(SignUpUiAction.ConfirmDiscard)
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Text(
                        when {
                            hasCapturedFirebaseOwner ->
                                stringResource(R.string.signup_discard_owner_confirm)

                            hasStartedSubmission ->
                                stringResource(R.string.signup_discard_progress_confirm)

                            else -> stringResource(R.string.signup_discard_changes_confirm)
                        },
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        signUpViewModel.onAction(SignUpUiAction.DismissDiscard)
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text(stringResource(R.string.signup_discard_continue))
                }
            },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .padding(24.dp)
            .verticalScroll(rememberScrollState())
    ) {
        TextButton(
            onClick = { signUpViewModel.onAction(SignUpUiAction.BackRequested) },
            enabled = !isBackLocked,
            modifier = Modifier
                .defaultMinSize(minHeight = 48.dp)
                .padding(top = 8.dp),
        ) {
            Icon(
                Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = null,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(stringResource(R.string.signup_back))
        }

        Spacer(modifier = Modifier.height(24.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text(
                stringResource(R.string.signup_title),
                color = MaterialTheme.colorScheme.onBackground,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                stringResource(R.string.signup_description),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyLarge,
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    MaterialTheme.colorScheme.surfaceVariant,
                    MaterialTheme.shapes.medium,
                )
                .selectableGroup()
                .padding(4.dp)
        ) {
            AccountTypeTab(
                label = stringResource(R.string.signup_account_personal),
                selected = accountType == "personal",
                enabled = !isFieldInteractionLocked,
                onClick = {
                    signUpViewModel.onAction(
                        SignUpUiAction.AccountTypeChanged(SignUpAccountType.Personal),
                    )
                },
                modifier = Modifier.weight(1f)
            )
            AccountTypeTab(
                label = stringResource(R.string.signup_account_solo_doctor),
                selected = accountType == "solo_doctor",
                enabled = !isFieldInteractionLocked,
                onClick = {
                    signUpViewModel.onAction(
                        SignUpUiAction.AccountTypeChanged(SignUpAccountType.SoloDoctor),
                    )
                },
                modifier = Modifier.weight(1f)
            )
            AccountTypeTab(
                label = stringResource(R.string.signup_account_clinic_doctor),
                selected = accountType == "doctor",
                enabled = !isFieldInteractionLocked,
                onClick = {
                    signUpViewModel.onAction(
                        SignUpUiAction.AccountTypeChanged(SignUpAccountType.ClinicDoctor),
                    )
                },
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TextFieldGroup(
                label = stringResource(R.string.signup_full_name),
                value = name,
                onValueChange = {
                    signUpViewModel.onAction(SignUpUiAction.NameChanged(it))
                },
                icon = Icons.Default.Person,
                placeholder = if (isDoctorRegistration) {
                    stringResource(R.string.signup_full_name_doctor_hint)
                } else {
                    stringResource(R.string.signup_full_name_personal_hint)
                },
                enabled = !isFieldInteractionLocked,
                errorMessage = fieldErrors["name"],
            )

            if (isDoctorRegistration) {
                TextFieldGroup(
                    label = stringResource(R.string.signup_license),
                    value = license,
                    onValueChange = {
                        signUpViewModel.onAction(SignUpUiAction.LicenseChanged(it))
                    },
                    icon = Icons.Default.Info,
                    placeholder = stringResource(R.string.signup_license_hint),
                    enabled = !isFieldInteractionLocked,
                    errorMessage = fieldErrors["license"],
                )
                if (requiresClinicSelection) {
                    CatalogDropdown(
                        label = stringResource(R.string.signup_clinic),
                        value = clinicDisplayName,
                        placeholder = when {
                            isCatalogLoading ->
                                stringResource(R.string.signup_clinic_loading)

                            clinics.isEmpty() ->
                                stringResource(R.string.signup_clinic_load_failed)

                            else -> stringResource(R.string.signup_clinic_hint)
                        },
                        enabled = !isFieldInteractionLocked,
                        options = clinics.map { it.id to it.name },
                        onSelected = {
                            signUpViewModel.onAction(SignUpUiAction.ClinicSelected(it))
                        },
                        icon = Icons.Default.Home,
                        searchPlaceholder = stringResource(R.string.signup_clinic_search_hint),
                        loading = isCatalogLoading,
                        emptyMessage = catalogError
                            ?: stringResource(R.string.signup_clinic_empty),
                        onRetry = {
                            signUpViewModel.onAction(SignUpUiAction.RetryCatalog)
                        },
                        missingRequestLabel =
                            stringResource(R.string.signup_clinic_request_missing),
                        onRequestMissing = { query ->
                            signUpViewModel.onAction(
                                SignUpUiAction.MissingClinicRequested(query),
                            )
                        },
                        errorMessage = fieldErrors["clinic"],
                    )
                } else {
                    CatalogDropdown(
                        label = stringResource(R.string.signup_solo_clinic),
                        value = soloClinicDisplayName,
                        placeholder = when {
                            isCatalogLoading ->
                                stringResource(R.string.signup_solo_clinic_loading)

                            privateClinicOptions.isEmpty() ->
                                stringResource(R.string.signup_solo_clinic_empty_hint)

                            else -> stringResource(R.string.signup_solo_clinic_hint)
                        },
                        enabled = !isFieldInteractionLocked,
                        options = privateClinicOptions.map { it.id to it.name },
                        onSelected = {
                            signUpViewModel.onAction(SignUpUiAction.SoloClinicSelected(it))
                        },
                        icon = Icons.Default.Home,
                        searchPlaceholder =
                            stringResource(R.string.signup_solo_clinic_search_hint),
                        loading = isCatalogLoading,
                        emptyMessage = catalogError
                            ?: stringResource(R.string.signup_solo_clinic_empty),
                        onRetry = {
                            signUpViewModel.onAction(SignUpUiAction.RetryCatalog)
                        },
                        missingRequestLabel =
                            stringResource(R.string.signup_solo_clinic_use_name),
                        onRequestMissing = { query ->
                            signUpViewModel.onAction(SignUpUiAction.SoloClinicNamed(query))
                        },
                        errorMessage = fieldErrors["soloClinic"],
                    )
                }
                if (requiresClinicSelection && requestedClinicName.isNotBlank()) {
                    Text(
                        stringResource(
                            R.string.signup_clinic_request_recorded,
                            requestedClinicName,
                        ),
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
                CatalogDropdown(
                    label = stringResource(R.string.signup_specialty),
                    value = selectedSpecialty?.name.orEmpty(),
                    placeholder = when {
                        isCatalogLoading ->
                            stringResource(R.string.signup_specialty_loading)

                        specialties.isEmpty() ->
                            stringResource(R.string.signup_specialty_load_failed)

                        else -> stringResource(R.string.signup_specialty_hint)
                    },
                    enabled = !isFieldInteractionLocked,
                    options = specialties.map { it.id to it.name },
                    onSelected = {
                        signUpViewModel.onAction(SignUpUiAction.SpecialtySelected(it))
                    },
                    icon = Icons.Default.LocalHospital,
                    searchPlaceholder = stringResource(R.string.signup_catalog_search),
                    loading = isCatalogLoading,
                    emptyMessage = catalogError
                        ?: stringResource(R.string.signup_specialty_empty),
                    onRetry = {
                        signUpViewModel.onAction(SignUpUiAction.RetryCatalog)
                    },
                    errorMessage = fieldErrors["specialty"],
                )
                TextFieldGroup(
                    label = stringResource(R.string.signup_reason),
                    value = registrationReason,
                    onValueChange = {
                        signUpViewModel.onAction(SignUpUiAction.ReasonChanged(it))
                    },
                    icon = Icons.Default.Description,
                    placeholder = stringResource(R.string.signup_reason_hint),
                    enabled = !isFieldInteractionLocked,
                    errorMessage = fieldErrors["reason"],
                )
            }

            TextFieldGroup(
                label = stringResource(R.string.signup_phone),
                value = phone,
                onValueChange = {
                    signUpViewModel.onAction(SignUpUiAction.PhoneChanged(it))
                },
                icon = Icons.Default.Phone,
                placeholder = stringResource(R.string.signup_phone_hint),
                enabled = !isFieldInteractionLocked,
                errorMessage = fieldErrors["phone"],
            )
            TextFieldGroup(
                label = stringResource(R.string.signup_email),
                value = email,
                onValueChange = {
                    signUpViewModel.onAction(SignUpUiAction.EmailChanged(it))
                },
                icon = Icons.Default.Email,
                placeholder = if (isDoctorRegistration) {
                    stringResource(R.string.signup_email_doctor_hint)
                } else {
                    stringResource(R.string.signup_email_personal_hint)
                },
                enabled = !isFieldInteractionLocked,
                errorMessage = fieldErrors["email"],
            )
            TextFieldGroup(
                label = stringResource(R.string.signup_password),
                value = password,
                onValueChange = {
                    signUpViewModel.onAction(SignUpUiAction.PasswordChanged(it))
                },
                icon = Icons.Default.Lock,
                placeholder = stringResource(R.string.signup_password_hint),
                enabled = !isFieldInteractionLocked,
                isPassword = true,
                errorMessage = fieldErrors["password"],
            )
            TextFieldGroup(
                label = stringResource(R.string.signup_confirm_password),
                value = confirmPassword,
                onValueChange = {
                    signUpViewModel.onAction(SignUpUiAction.ConfirmPasswordChanged(it))
                },
                icon = Icons.Default.Lock,
                placeholder = stringResource(R.string.signup_confirm_password_hint),
                enabled = !isFieldInteractionLocked,
                isPassword = true,
                errorMessage = fieldErrors["confirmPassword"],
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 48.dp)
                .toggleable(
                    value = agreedToTerms,
                enabled = !isFieldInteractionLocked,
                    role = Role.Checkbox,
                    onValueChange = {
                        signUpViewModel.onAction(SignUpUiAction.TermsChanged(it))
                    },
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = agreedToTerms,
                onCheckedChange = null,
                enabled = !isFieldInteractionLocked,
                colors = CheckboxDefaults.colors(
                    checkedColor = MaterialTheme.colorScheme.primary,
                ),
            )
            Text(
                stringResource(R.string.signup_terms_agreement),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        fieldErrors["terms"]?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 48.dp, top = 4.dp)
                    .semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        errorMessage?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
                    .semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }
        catalogError?.takeIf { isDoctorRegistration }?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
                    .semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }

        abandonmentErrorMessage?.let { message ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
                    .semantics { liveRegion = LiveRegionMode.Assertive },
                color = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.onErrorContainer,
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(16.dp),
                )
            }
        }
        if (
            hasStartedSubmission &&
            abandonmentErrorMessage == null &&
            errorMessage != null
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp),
                color = MaterialTheme.colorScheme.secondaryContainer,
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                shape = MaterialTheme.shapes.medium,
            ) {
                Text(
                    text = if (hasCapturedFirebaseOwner) {
                        stringResource(R.string.signup_recovery_owner_message)
                    } else {
                        stringResource(R.string.signup_recovery_progress_message)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(16.dp),
                )
            }
        }

        Button(
            onClick = {
                signUpViewModel.onAction(
                    if (abandonmentErrorMessage == null) {
                        SignUpUiAction.Submit
                    } else {
                        SignUpUiAction.ConfirmDiscard
                    },
                )
            },
            enabled = !isPrimaryActionLocked,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
        ) {
            if (isSubmitting || isAbandoningRegistration) {
                CircularProgressIndicator(
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                    modifier = Modifier.height(20.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    if (isAbandoningRegistration) {
                        stringResource(R.string.signup_abandoning)
                    } else {
                        stringResource(R.string.signup_submitting)
                    },
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelLarge,
                )
            } else {
                Text(
                    when {
                        abandonmentErrorMessage != null ->
                            stringResource(R.string.signup_retry_abandonment)

                        hasStartedSubmission ->
                            stringResource(R.string.signup_continue_submission)

                        else -> stringResource(R.string.signup_submit)
                    },
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text(
                stringResource(R.string.signup_have_account),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
            TextButton(
                onClick = { signUpViewModel.onAction(SignUpUiAction.BackRequested) },
                enabled = !isBackLocked,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(stringResource(R.string.signup_login_now))
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
        Text(
            stringResource(R.string.signup_app_version, BuildConfig.VERSION_NAME),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
private fun AccountTypeTab(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(
                color = if (selected) {
                    MaterialTheme.colorScheme.surface
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
                shape = MaterialTheme.shapes.small,
            )
            .selectable(
                selected = selected,
                enabled = enabled,
                role = Role.Tab,
                onClick = onClick,
            )
            .defaultMinSize(minHeight = 48.dp)
            .padding(horizontal = 8.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
fun TextFieldGroup(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    icon: ImageVector,
    placeholder: String,
    enabled: Boolean = true,
    isPassword: Boolean = false,
    errorMessage: String? = null,
) {
    Column {
        Text(
            label,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.labelLarge,
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
            placeholder = {
                Text(
                    placeholder,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            leadingIcon = {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            shape = MaterialTheme.shapes.medium,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                errorContainerColor = MaterialTheme.colorScheme.surface,
            ),
            isError = errorMessage != null,
            supportingText = errorMessage?.let { message ->
                {
                    Text(
                        message,
                        modifier = Modifier.semantics {
                            liveRegion = LiveRegionMode.Assertive
                        },
                    )
                }
            },
            singleLine = true,
        )
    }
}

@Composable
private fun CatalogDropdown(
    label: String,
    value: String,
    placeholder: String,
    enabled: Boolean,
    options: List<Pair<String, String>>,
    onSelected: (String) -> Unit,
    icon: ImageVector,
    searchPlaceholder: String,
    loading: Boolean = false,
    emptyMessage: String,
    onRetry: (() -> Unit)? = null,
    missingRequestLabel: String? = null,
    onRequestMissing: ((String) -> Unit)? = null,
    errorMessage: String? = null,
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val visibleOptions = remember(options, query) {
        val cleanQuery = query.trim()
        if (cleanQuery.isBlank()) {
            options
        } else {
            options.filter { (_, name) -> name.contains(cleanQuery, ignoreCase = true) }
        }
    }
    Column {
        val controlShape = MaterialTheme.shapes.medium
        Text(
            label,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.labelLarge,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .background(MaterialTheme.colorScheme.surface, controlShape)
                .border(
                    width = 1.dp,
                    color = when {
                        errorMessage != null -> MaterialTheme.colorScheme.error
                        expanded -> MaterialTheme.colorScheme.primary
                        else -> MaterialTheme.colorScheme.outline
                    },
                    shape = controlShape,
                )
                .selectable(
                    selected = expanded,
                    enabled = enabled,
                    role = Role.Button,
                    onClick = {
                        query = ""
                        expanded = true
                    },
                )
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = value.ifBlank { placeholder },
                color = if (value.isBlank()) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f)
            )
            Icon(
                Icons.Default.KeyboardArrowDown,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        errorMessage?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 16.dp, top = 4.dp)
                    .semantics { liveRegion = LiveRegionMode.Assertive },
            )
        }
        if (expanded) {
            Dialog(onDismissRequest = { expanded = false }) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .imePadding()
                        .heightIn(max = 560.dp),
                    shape = MaterialTheme.shapes.large,
                    color = MaterialTheme.colorScheme.surface,
                    tonalElevation = 6.dp,
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            label,
                            color = MaterialTheme.colorScheme.onSurface,
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.semantics { heading() },
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = {
                                Text(stringResource(R.string.signup_catalog_search_label, label))
                            },
                            placeholder = {
                                Text(
                                    searchPlaceholder,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedContainerColor = MaterialTheme.colorScheme.surface,
                                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                            ),
                            shape = MaterialTheme.shapes.medium,
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        if (loading) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 18.dp)
                                    .semantics { liveRegion = LiveRegionMode.Polite },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                CircularProgressIndicator(
                                    color = MaterialTheme.colorScheme.primary,
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.height(22.dp),
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    stringResource(R.string.signup_catalog_loading),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                            }
                        } else {
                            LazyColumn(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 360.dp)
                            ) {
                                items(visibleOptions, key = { it.first }) { (id, name) ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .selectable(
                                                selected = name == value,
                                                role = Role.RadioButton,
                                                onClick = {
                                                    onSelected(id)
                                                    expanded = false
                                                },
                                            )
                                            .defaultMinSize(minHeight = 48.dp)
                                            .padding(vertical = 12.dp, horizontal = 4.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            name,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            style = MaterialTheme.typography.bodyLarge,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                                if (visibleOptions.isEmpty()) {
                                    item {
                                        Column(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(vertical = 14.dp, horizontal = 4.dp)
                                        ) {
                                            Text(
                                                if (query.trim().isBlank()) {
                                                    emptyMessage
                                                } else {
                                                    stringResource(R.string.signup_catalog_no_results)
                                                },
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                style = MaterialTheme.typography.bodyMedium,
                                            )
                                            if (onRetry != null) {
                                                Spacer(modifier = Modifier.height(10.dp))
                                                Button(
                                                    onClick = onRetry,
                                                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                                                ) {
                                                    Text(stringResource(R.string.signup_catalog_retry))
                                                }
                                            }
                                        }
                                    }
                                }
                                if (
                                    !missingRequestLabel.isNullOrBlank() &&
                                    query.trim().isNotBlank() &&
                                    onRequestMissing != null
                                ) {
                                    item {
                                        Text(
                                            stringResource(
                                                R.string.signup_catalog_missing_action,
                                                missingRequestLabel,
                                                query.trim(),
                                            ),
                                            color = MaterialTheme.colorScheme.primary,
                                            style = MaterialTheme.typography.labelLarge,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .selectable(
                                                    selected = false,
                                                    role = Role.Button,
                                                    onClick = {
                                                        onRequestMissing(query)
                                                        expanded = false
                                                    },
                                                )
                                                .defaultMinSize(minHeight = 48.dp)
                                                .padding(vertical = 14.dp, horizontal = 4.dp),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
