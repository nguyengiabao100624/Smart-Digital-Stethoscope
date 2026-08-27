package com.example.smart_health_android.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.R
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.security.DoctorApprovalUiAction
import com.example.smart_health_android.security.DoctorApprovalUiEffect
import com.example.smart_health_android.security.DoctorApprovalViewModel
import com.example.smart_health_android.security.DoctorApprovalViewModelFactory
import com.example.smart_health_android.ui.theme.ShcareTheme

private fun roleInfoFieldLabel(field: String): String {
    return when (field) {
        "name" -> "họ và tên"
        "phone" -> "số điện thoại"
        "license" -> "chứng chỉ hành nghề"
        "clinic" -> "phòng khám/cơ sở y tế"
        "specialty" -> "chuyên khoa"
        "reason" -> "lý do đăng ký"
        else -> field
    }
}

@Composable
fun DoctorApprovalPendingScreen(
    firebaseOwner: FirebaseOwnerBinding,
    onApproved: (FirebaseOwnerBinding) -> Unit,
    onLogout: (FirebaseOwnerBinding) -> Unit,
) {
    val factory = remember(firebaseOwner) {
        DoctorApprovalViewModelFactory(firebaseOwner)
    }
    val doctorApprovalViewModel: DoctorApprovalViewModel = viewModel(
        factory = factory,
    )
    DoctorApprovalPendingRoute(
        onApproved = onApproved,
        onLogout = onLogout,
        doctorApprovalViewModel = doctorApprovalViewModel,
    )
}

@Composable
internal fun DoctorApprovalPendingRoute(
    onApproved: (FirebaseOwnerBinding) -> Unit,
    onLogout: (FirebaseOwnerBinding) -> Unit,
    doctorApprovalViewModel: DoctorApprovalViewModel,
) {
    val uiState by doctorApprovalViewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(doctorApprovalViewModel, onApproved, onLogout) {
        doctorApprovalViewModel.effects.collect { effect ->
            when (effect) {
                is DoctorApprovalUiEffect.NavigateApproved ->
                    onApproved(effect.firebaseOwner)
                is DoctorApprovalUiEffect.NavigateLogout ->
                    onLogout(effect.firebaseOwner)
            }
        }
    }

    val user = uiState.user
    val clinics = uiState.clinics
    val specialties = uiState.specialties
    val name = uiState.name
    val phone = uiState.phone
    val license = uiState.license
    val selectedClinicId = uiState.selectedClinicId
    val clinicName = uiState.clinicName
    val selectedSpecialtyId = uiState.selectedSpecialtyId
    val reason = uiState.reason
    val isChecking = uiState.isChecking
    val isSubmitting = uiState.isSubmitting
    val isLoadingCatalogs = uiState.isLoadingCatalogs
    val fieldErrors = uiState.fieldErrors
    val showDiscardDialog = uiState.showDiscardDialog
    val statusMessage = uiState.statusMessage
    val errorMessage = uiState.errorMessage.takeIf(String::isNotBlank)
    val catalogErrorMessage = listOf(
        uiState.clinicCatalogError,
        uiState.specialtyCatalogError,
    ).filter(String::isNotBlank).joinToString(" ").takeIf(String::isNotBlank)
    val selectedClinic = clinics.firstOrNull { it.id == selectedClinicId }
    val selectedSpecialty = specialties.firstOrNull { it.id == selectedSpecialtyId }
    val needsInfo = uiState.needsInfo
    val isRejected = uiState.isRejected
    val isSoloPractice = uiState.isSoloPractice
    val requiredFields = user?.roleInfoRequiredFields.orEmpty()
    val requiredFieldLabels = requiredFields
        .map(::roleInfoFieldLabel)
        .distinct()

    BackHandler(enabled = uiState.isBusy || uiState.hasUnsavedChanges) {
        doctorApprovalViewModel.onAction(DoctorApprovalUiAction.LogoutRequested)
    }

    if (showDiscardDialog) {
        AlertDialog(
            onDismissRequest = {
                doctorApprovalViewModel.onAction(DoctorApprovalUiAction.DiscardDismissed)
            },
            title = { Text("Bỏ thay đổi chưa gửi?") },
            text = {
                Text(
                    "Thông tin bạn vừa sửa chưa được quản trị viên nhận. " +
                        "Bạn có muốn bỏ thay đổi và đăng xuất không?",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        doctorApprovalViewModel.onAction(
                            DoctorApprovalUiAction.DiscardLogoutConfirmed,
                        )
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text("Bỏ thay đổi và đăng xuất")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        doctorApprovalViewModel.onAction(DoctorApprovalUiAction.DiscardDismissed)
                    },
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text("Tiếp tục chỉnh sửa")
                }
            },
        )
    }

    val statusContainerColor = when {
        isRejected -> MaterialTheme.colorScheme.errorContainer
        needsInfo || user?.roleRequestStatus == "pending" ->
            ShcareTheme.colors.warningContainer

        else -> ShcareTheme.colors.infoContainer
    }
    val statusContentColor = when {
        isRejected -> MaterialTheme.colorScheme.onErrorContainer
        needsInfo || user?.roleRequestStatus == "pending" ->
            ShcareTheme.colors.onWarningContainer

        else -> ShcareTheme.colors.onInfoContainer
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding(),
        contentAlignment = Alignment.TopCenter,
    ) {
        LazyColumn(
            modifier = Modifier
                .widthIn(max = 640.dp)
                .fillMaxWidth()
                .fillMaxHeight(),
            contentPadding = PaddingValues(
                horizontal = ShcareTheme.spacing.extraLarge,
                vertical = ShcareTheme.spacing.extraLarge,
            ),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            item {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
                ) {
                    Box(
                        modifier = Modifier
                            .size(88.dp)
                            .background(
                                MaterialTheme.colorScheme.primaryContainer,
                                CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Default.HourglassTop,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(44.dp),
                        )
                    }
                    Text(
                        text = if (needsInfo) {
                            "Cần bổ sung hồ sơ bác sĩ"
                        } else {
                            "Đang chờ duyệt tài khoản bác sĩ"
                        },
                        color = MaterialTheme.colorScheme.onBackground,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.semantics { heading() },
                    )
                }
            }

            item {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Polite },
                    shape = MaterialTheme.shapes.large,
                    color = statusContainerColor,
                    contentColor = statusContentColor,
                    border = BorderStroke(
                        width = 1.dp,
                        color = statusContentColor.copy(alpha = 0.28f),
                    ),
                ) {
                    Text(
                        text = statusMessage,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(ShcareTheme.spacing.large),
                    )
                }
            }

            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.large,
                    color = MaterialTheme.colorScheme.surface,
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    border = BorderStroke(
                        width = 1.dp,
                        color = MaterialTheme.colorScheme.outlineVariant,
                    ),
                ) {
                    Column(
                        modifier = Modifier.padding(ShcareTheme.spacing.large),
                        verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
                    ) {
                        PendingStep(
                            icon = Icons.Default.Email,
                            iconTint = ShcareTheme.colors.success,
                            iconContainerColor = ShcareTheme.colors.successContainer,
                            title = stringResource(R.string.doctor_approval_email_verified_title),
                            description = stringResource(
                                R.string.doctor_approval_email_verified_description,
                            ),
                        )
                        PendingStep(
                            icon = Icons.Default.VerifiedUser,
                            iconTint = MaterialTheme.colorScheme.primary,
                            iconContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            title = stringResource(R.string.doctor_approval_review_title),
                            description = if (isSoloPractice) {
                                "Quản trị viên xác minh giấy phép, phòng khám tư và chuyên khoa."
                            } else {
                                "Quản trị viên xác minh giấy phép, cơ sở y tế và chuyên khoa."
                            },
                        )
                        PendingStep(
                            icon = Icons.Default.CheckCircle,
                            iconTint = ShcareTheme.colors.info,
                            iconContainerColor = ShcareTheme.colors.infoContainer,
                            title = stringResource(R.string.doctor_approval_activation_title),
                            description =
                                "Sau khi được duyệt, hãy kiểm tra trạng thái để mở không gian bác sĩ.",
                        )
                    }
                }
            }

            if (needsInfo) {
                item {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = MaterialTheme.shapes.large,
                        color = MaterialTheme.colorScheme.surface,
                        contentColor = MaterialTheme.colorScheme.onSurface,
                        border = BorderStroke(
                            width = 1.dp,
                            color = MaterialTheme.colorScheme.outlineVariant,
                        ),
                    ) {
                        Column(
                            modifier = Modifier.padding(ShcareTheme.spacing.large),
                            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.large),
                        ) {
                            Text(
                                text = stringResource(R.string.doctor_approval_add_information),
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.semantics { heading() },
                            )

                            if (requiredFieldLabels.isNotEmpty()) {
                                Surface(
                                    color = ShcareTheme.colors.warningContainer,
                                    contentColor = ShcareTheme.colors.onWarningContainer,
                                    shape = MaterialTheme.shapes.medium,
                                ) {
                                    Text(
                                        text =
                                            "Quản trị viên yêu cầu bổ sung: " +
                                                "${requiredFieldLabels.joinToString(", ")}.",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier.padding(ShcareTheme.spacing.medium),
                                    )
                                }
                            }

                            if (isLoadingCatalogs) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .semantics { liveRegion = LiveRegionMode.Polite },
                                    horizontalArrangement = Arrangement.spacedBy(
                                        ShcareTheme.spacing.medium,
                                    ),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        strokeWidth = 2.dp,
                                    )
                                    Text(
                                        text = stringResource(R.string.doctor_approval_loading_catalog),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }

                            catalogErrorMessage?.let { catalogError ->
                                Surface(
                                    color = MaterialTheme.colorScheme.errorContainer,
                                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                                    shape = MaterialTheme.shapes.medium,
                                ) {
                                    Column(
                                        modifier = Modifier.padding(ShcareTheme.spacing.medium),
                                        verticalArrangement = Arrangement.spacedBy(
                                            ShcareTheme.spacing.small,
                                        ),
                                    ) {
                                        Text(
                                            text = catalogError,
                                            style = MaterialTheme.typography.bodySmall,
                                            modifier = Modifier.semantics {
                                                liveRegion = LiveRegionMode.Assertive
                                            },
                                        )
                                        TextButton(
                                            onClick = {
                                                doctorApprovalViewModel.onAction(
                                                    DoctorApprovalUiAction.RetryCatalogs,
                                                )
                                            },
                                            modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                                        ) {
                                            Text("Thử tải lại")
                                        }
                                    }
                                }
                            }

                            TextFieldGroup(
                                label = stringResource(R.string.doctor_approval_full_name),
                                value = name,
                                onValueChange = {
                                    doctorApprovalViewModel.onAction(
                                        DoctorApprovalUiAction.NameChanged(it),
                                    )
                                },
                                icon = Icons.Default.VerifiedUser,
                                placeholder = stringResource(R.string.doctor_approval_full_name_hint),
                                enabled = !uiState.isBusy,
                                errorMessage = fieldErrors["name"],
                            )
                            TextFieldGroup(
                                label = stringResource(R.string.doctor_approval_phone),
                                value = phone,
                                onValueChange = {
                                    doctorApprovalViewModel.onAction(
                                        DoctorApprovalUiAction.PhoneChanged(it),
                                    )
                                },
                                icon = Icons.Default.Phone,
                                placeholder = stringResource(R.string.doctor_approval_phone_hint),
                                enabled = !uiState.isBusy,
                                errorMessage = fieldErrors["phone"],
                            )
                            TextFieldGroup(
                                label = stringResource(R.string.doctor_approval_license),
                                value = license,
                                onValueChange = {
                                    doctorApprovalViewModel.onAction(
                                        DoctorApprovalUiAction.LicenseChanged(it),
                                    )
                                },
                                icon = Icons.Default.VerifiedUser,
                                placeholder = stringResource(R.string.doctor_approval_license_hint),
                                enabled = !uiState.isBusy,
                                errorMessage = fieldErrors["license"],
                            )
                            if (isSoloPractice) {
                                TextFieldGroup(
                                    label = stringResource(R.string.doctor_approval_private_clinic),
                                    value = clinicName,
                                    onValueChange = {
                                        doctorApprovalViewModel.onAction(
                                            DoctorApprovalUiAction.ClinicNameChanged(it),
                                        )
                                    },
                                    icon = Icons.Default.Home,
                                    placeholder = stringResource(
                                        R.string.doctor_approval_private_clinic_hint,
                                    ),
                                    enabled = !uiState.isBusy,
                                    errorMessage = fieldErrors["clinic"],
                                )
                            } else {
                                PendingDropdown(
                                    label = stringResource(R.string.doctor_approval_facility),
                                    value = selectedClinic?.name.orEmpty(),
                                    placeholder = stringResource(R.string.doctor_approval_facility_hint),
                                    options = clinics.map { it.id to it.name },
                                    icon = Icons.Default.Home,
                                    enabled = !uiState.isBusy,
                                    errorMessage = fieldErrors["clinic"],
                                ) {
                                    doctorApprovalViewModel.onAction(
                                        DoctorApprovalUiAction.ClinicSelected(it),
                                    )
                                }
                            }
                            PendingDropdown(
                                label = stringResource(R.string.doctor_approval_department),
                                value = selectedSpecialty?.name.orEmpty(),
                                placeholder = stringResource(R.string.doctor_approval_department_hint),
                                options = specialties.map { it.id to it.name },
                                icon = Icons.Default.LocalHospital,
                                enabled = !uiState.isBusy,
                                errorMessage = fieldErrors["specialty"],
                            ) {
                                doctorApprovalViewModel.onAction(
                                    DoctorApprovalUiAction.SpecialtySelected(it),
                                )
                            }
                            TextFieldGroup(
                                label = stringResource(R.string.doctor_approval_reason),
                                value = reason,
                                onValueChange = {
                                    doctorApprovalViewModel.onAction(
                                        DoctorApprovalUiAction.ReasonChanged(it),
                                    )
                                },
                                icon = Icons.AutoMirrored.Filled.Send,
                                placeholder = stringResource(R.string.doctor_approval_reason_hint),
                                enabled = !uiState.isBusy,
                                errorMessage = fieldErrors["reason"],
                            )
                            Button(
                                onClick = {
                                    doctorApprovalViewModel.onAction(
                                        DoctorApprovalUiAction.SubmitNeedsInfo,
                                    )
                                },
                                enabled = !uiState.isBusy && !isLoadingCatalogs,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .defaultMinSize(minHeight = 52.dp),
                            ) {
                                if (isSubmitting) {
                                    CircularProgressIndicator(
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        strokeWidth = 2.dp,
                                        modifier = Modifier.size(20.dp),
                                    )
                                    Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                                    Text("Đang gửi hồ sơ…")
                                } else {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Filled.Send,
                                        contentDescription = null,
                                        modifier = Modifier.size(18.dp),
                                    )
                                    Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                                    Text(
                                        text = stringResource(R.string.doctor_approval_update_and_resubmit),
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            errorMessage?.let { message ->
                item {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .semantics { liveRegion = LiveRegionMode.Assertive },
                        color = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        shape = MaterialTheme.shapes.medium,
                    ) {
                        Text(
                            text = message,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(ShcareTheme.spacing.large),
                        )
                    }
                }
            }

            item {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
                ) {
                    Button(
                        onClick = {
                            doctorApprovalViewModel.onAction(
                                DoctorApprovalUiAction.RefreshStatus,
                            )
                        },
                        enabled = !isChecking && !isSubmitting,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 52.dp),
                    ) {
                        if (isChecking) {
                            CircularProgressIndicator(
                                color = MaterialTheme.colorScheme.onPrimary,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                            Text("Đang kiểm tra…")
                        } else {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp),
                            )
                            Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                            Text(
                                text = stringResource(R.string.doctor_approval_refresh_status),
                                fontWeight = FontWeight.Bold,
                            )
                        }
                    }

                    OutlinedButton(
                        onClick = {
                            doctorApprovalViewModel.onAction(
                                DoctorApprovalUiAction.LogoutRequested,
                            )
                        },
                        enabled = !uiState.isBusy,
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 52.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Logout,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
                        Text(
                            text = stringResource(R.string.doctor_approval_sign_out),
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }

            item {
                Text(
                    text = stringResource(
                        R.string.doctor_approval_app_version,
                        BuildConfig.VERSION_NAME,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun PendingStep(
    icon: ImageVector,
    iconTint: Color,
    iconContainerColor: Color,
    title: String,
    description: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                stateDescription = title
            },
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(iconContainerColor, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(modifier = Modifier.width(ShcareTheme.spacing.medium))
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = title,
                color = MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = description,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

@Composable
private fun PendingDropdown(
    label: String,
    value: String,
    placeholder: String,
    options: List<Pair<String, String>>,
    icon: ImageVector,
    enabled: Boolean,
    errorMessage: String?,
    onSelected: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(enabled) {
        if (!enabled) expanded = false
    }
    val visibleOptions = remember(options, query) {
        val cleanQuery = query.trim()
        if (cleanQuery.isBlank()) {
            options
        } else {
            options.filter { (_, name) -> name.contains(cleanQuery, ignoreCase = true) }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.small)) {
        Text(
            text = label,
            color = MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.Medium,
        )
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 56.dp)
                .clickable(
                    enabled = enabled,
                    role = Role.Button,
                    onClickLabel = "Mở danh sách $label",
                ) {
                    query = ""
                    expanded = true
                }
                .semantics {
                    role = Role.Button
                    stateDescription = value.ifBlank { "Chưa chọn" }
                },
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            border = BorderStroke(
                width = 1.dp,
                color = when {
                    errorMessage != null -> MaterialTheme.colorScheme.error
                    expanded -> MaterialTheme.colorScheme.primary
                    else -> MaterialTheme.colorScheme.outlineVariant
                },
            ),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = ShcareTheme.spacing.large),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.width(ShcareTheme.spacing.medium))
                Text(
                    text = value.ifBlank { placeholder },
                    color = if (value.isBlank()) {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    imageVector = Icons.Default.KeyboardArrowDown,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        errorMessage?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.semantics {
                    liveRegion = LiveRegionMode.Assertive
                },
            )
        }
    }

    if (expanded) {
        Dialog(onDismissRequest = { expanded = false }) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                tonalElevation = 6.dp,
            ) {
                Column(
                    modifier = Modifier.padding(ShcareTheme.spacing.large),
                    verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium),
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics { heading() },
                    )
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Tìm kiếm") },
                        singleLine = true,
                        shape = MaterialTheme.shapes.medium,
                    )
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 360.dp),
                    ) {
                        items(visibleOptions, key = { it.first }) { (id, optionName) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .defaultMinSize(minHeight = 48.dp)
                                    .clickable(
                                        role = Role.Button,
                                        onClickLabel = "Chọn $optionName",
                                    ) {
                                        onSelected(id)
                                        expanded = false
                                    }
                                    .padding(horizontal = ShcareTheme.spacing.small),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = optionName,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                            }
                        }
                        if (visibleOptions.isEmpty()) {
                            item {
                                Text(
                                    text = stringResource(R.string.doctor_approval_no_matching_result),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.padding(
                                        vertical = ShcareTheme.spacing.large,
                                        horizontal = ShcareTheme.spacing.small,
                                    ),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
