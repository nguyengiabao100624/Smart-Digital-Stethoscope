package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.HourglassTop
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.Background
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import com.example.smart_health_android.ui.theme.Surface
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

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

private fun AuthUser.isSoloPracticeDoctor(): Boolean {
    return workspaceType == "solo_practice" || accountType == "solo_doctor"
}

@Composable
fun DoctorApprovalPendingScreen(
    onApproved: () -> Unit,
    onLogout: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    var user by remember { mutableStateOf<AuthUser?>(null) }
    var clinics by remember { mutableStateOf<List<ClinicOption>>(emptyList()) }
    var specialties by remember { mutableStateOf<List<SpecialtyOption>>(emptyList()) }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var license by remember { mutableStateOf("") }
    var selectedClinicId by remember { mutableStateOf("") }
    var clinicName by remember { mutableStateOf("") }
    var selectedAccountType by remember { mutableStateOf("doctor") }
    var selectedSpecialtyId by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var isChecking by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var statusMessage by remember {
        mutableStateOf("Yêu cầu của bạn đã được gửi đến quản trị viên. Bạn sẽ dùng được chế độ bác sĩ sau khi tài khoản được phê duyệt.")
    }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun applyUser(nextUser: AuthUser) {
        user = nextUser
        name = nextUser.name
        phone = nextUser.phone
        license = nextUser.license
        clinicName = nextUser.hospital.ifBlank { nextUser.clinicName.ifBlank { nextUser.clinicSuggestion } }
        selectedAccountType = if (nextUser.isSoloPracticeDoctor()) "solo_doctor" else "doctor"
        selectedClinicId = if (nextUser.isSoloPracticeDoctor()) "" else nextUser.organizationId
        selectedSpecialtyId = specialties.firstOrNull { it.name == nextUser.department || it.name == nextUser.specialty }?.id.orEmpty()
        reason = nextUser.registrationReason
    }

    fun refreshStatus(showLoading: Boolean = true) {
        if (showLoading) {
            isChecking = true
        }
        errorMessage = null
        coroutineScope.launch {
            try {
                val idToken = FirebaseAuthService.getFreshIdToken(forceRefresh = true)
                val result = SmartHealthRepository.api.authenticateFirebase(idToken)
                runCatching { SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated() }
                applyUser(result.user)
                val approvedDoctor = result.user.role == "doctor" && result.user.roleRequestStatus == "approved"
                if (approvedDoctor || result.user.role == "admin") {
                    statusMessage = "Tài khoản đã được phê duyệt. Đang chuyển vào dashboard bác sĩ..."
                    onApproved()
                } else {
                    statusMessage = when (result.user.roleRequestStatus) {
                        "rejected" -> "Yêu cầu bác sĩ đã bị từ chối. Vui lòng liên hệ quản trị viên."
                        "needs_info" -> result.user.roleInfoRequestMessage.ifBlank {
                            "Quản trị viên yêu cầu bổ sung thông tin hồ sơ bác sĩ."
                        }
                        "pending" -> "Tài khoản vẫn đang chờ quản trị viên phê duyệt."
                        else -> "Tài khoản chưa có quyền bác sĩ. Vui lòng gửi yêu cầu hoặc liên hệ quản trị viên."
                    }
                }
            } catch (exception: Exception) {
                if (showLoading) {
                    errorMessage = exception.toVietnameseMessage("Không thể kiểm tra trạng thái duyệt tài khoản.")
                }
            } finally {
                if (showLoading) {
                    isChecking = false
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        try {
            clinics = SmartHealthRepository.api.listClinics()
            specialties = SmartHealthRepository.api.listSpecialties()
        } catch (_: Exception) {
            // The status check below still works; the form will show a retryable error if submit needs catalogs.
        }
        refreshStatus()
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(15000)
            val currentStatus = user?.roleRequestStatus
            if (currentStatus == "approved" || currentStatus == "rejected" || currentStatus == "needs_info") {
                break
            }
            refreshStatus(showLoading = false)
        }
    }

    val selectedClinic = clinics.firstOrNull { it.id == selectedClinicId }
    val selectedSpecialty = specialties.firstOrNull { it.id == selectedSpecialtyId }
    val needsInfo = user?.roleRequestStatus == "needs_info"
    val isSoloPractice = selectedAccountType == "solo_doctor"
    val requiredFieldLabels = user?.roleInfoRequiredFields
        .orEmpty()
        .map(::roleInfoFieldLabel)
        .distinct()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(24.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(24.dp))
        Box(
            modifier = Modifier
                .size(88.dp)
                .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.HourglassTop, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(44.dp))
        }

        Spacer(modifier = Modifier.height(24.dp))
        Text(
            if (needsInfo) "Cần bổ sung hồ sơ bác sĩ" else "Đang chờ duyệt tài khoản bác sĩ",
            color = TextPrimary,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(10.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFFFF7ED), RoundedCornerShape(14.dp))
                .border(1.dp, Color(0xFFF59E0B).copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                .padding(14.dp)
        ) {
            Text(
                statusMessage,
                color = Color(0xFF92400E),
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                lineHeight = 22.sp,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(modifier = Modifier.height(24.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color.White, RoundedCornerShape(16.dp))
                .border(1.dp, Border, RoundedCornerShape(16.dp))
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            PendingStep(Icons.Default.Email, PrimaryTeal, "Email đã xác thực", "Tài khoản đã qua bước xác thực Firebase.")
            PendingStep(
                Icons.Default.VerifiedUser,
                PrimaryBlue,
                "Hồ sơ đang được kiểm tra",
                if (isSoloPractice) {
                    "Quản trị viên xác minh giấy phép, phòng khám tư và chuyên khoa."
                } else {
                    "Quản trị viên xác minh giấy phép, cơ sở y tế và chuyên khoa."
                }
            )
            PendingStep(Icons.Default.CheckCircle, Color(0xFF10B981), "Kích hoạt quyền bác sĩ", "Sau khi được duyệt, bấm kiểm tra trạng thái để vào dashboard.")
        }

        if (needsInfo) {
            Spacer(modifier = Modifier.height(18.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Border, RoundedCornerShape(16.dp))
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text("Bổ sung thông tin", color = TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                if (requiredFieldLabels.isNotEmpty()) {
                    Text(
                        "Admin yêu cầu bổ sung: ${requiredFieldLabels.joinToString(", ")}.",
                        color = Color(0xFF92400E),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        lineHeight = 18.sp
                    )
                }
                TextFieldGroup("Họ và tên", name, { name = it }, androidx.compose.material.icons.Icons.Default.VerifiedUser, "Nhập họ tên")
                TextFieldGroup("Số điện thoại", phone, { phone = it }, Icons.Default.Phone, "0912 345 678")
                TextFieldGroup("Số chứng chỉ hành nghề", license, { license = it }, androidx.compose.material.icons.Icons.Default.VerifiedUser, "VD: CCHN-BYT-2026-001")
                DoctorAccountTypeSelector(
                    selectedAccountType = selectedAccountType,
                    onSelected = { nextType ->
                        if (nextType == selectedAccountType) return@DoctorAccountTypeSelector
                        selectedAccountType = nextType
                        if (nextType == "solo_doctor") {
                            clinicName = ""
                            selectedClinicId = ""
                        } else {
                            val currentOrganizationId = user?.organizationId.orEmpty()
                            selectedClinicId = currentOrganizationId
                            clinicName = clinics.firstOrNull { it.id == currentOrganizationId }?.name.orEmpty()
                        }
                    }
                )
                if (isSoloPractice) {
                    TextFieldGroup("Tên phòng khám tư", clinicName, { clinicName = it }, Icons.Default.Home, "VD: Phòng khám Tim mạch An Khang")
                } else {
                    PendingDropdown("Cơ sở y tế", selectedClinic?.name.orEmpty(), "Chọn cơ sở y tế", clinics.map { it.id to it.name }, Icons.Default.Home) {
                        selectedClinicId = it
                    }
                }
                PendingDropdown("Chuyên khoa", selectedSpecialty?.name.orEmpty(), "Chọn chuyên khoa", specialties.map { it.id to it.name }, Icons.Default.LocalHospital) {
                    selectedSpecialtyId = it
                }
                TextFieldGroup("Lý do đăng ký", reason, { reason = it }, Icons.Default.Send, "Bổ sung lý do nếu admin yêu cầu")
                Button(
                    onClick = {
                        val clinic = clinics.firstOrNull { it.id == selectedClinicId }
                        val specialty = specialties.firstOrNull { it.id == selectedSpecialtyId }
                        val nextClinicName = if (isSoloPractice) clinicName.trim() else clinic?.name.orEmpty()
                        if (name.isBlank() || phone.isBlank() || license.isBlank() || specialty == null) {
                            errorMessage = "Vui lòng bổ sung đủ họ tên, số điện thoại, CCHN và chuyên khoa."
                            return@Button
                        }
                        if (isSoloPractice && nextClinicName.isBlank()) {
                            errorMessage = "Vui lòng nhập tên phòng khám tư."
                            return@Button
                        }
                        if (!isSoloPractice && clinic == null) {
                            errorMessage = "Vui lòng chọn cơ sở y tế."
                            return@Button
                        }
                        val nextAccountType = if (isSoloPractice) "solo_doctor" else "doctor"
                        val nextWorkspaceType = if (isSoloPractice) "solo_practice" else "clinic"
                        val nextOrganizationId = if (isSoloPractice) "" else clinic!!.id
                        isSubmitting = true
                        errorMessage = null
                        coroutineScope.launch {
                            try {
                                val profilePayload = JSONObject()
                                    .put("name", name.trim())
                                    .put("phone", phone.trim())
                                    .put("license", license.trim())
                                    .put("hospital", nextClinicName)
                                    .put("department", specialty.name)
                                    .put("specialty", specialty.name)
                                    .put("accountType", nextAccountType)
                                    .put("workspaceType", nextWorkspaceType)
                                if (!isSoloPractice) {
                                    profilePayload.put("organizationId", nextOrganizationId)
                                }
                                SmartHealthRepository.api.updateMe(profilePayload)
                                val updated = SmartHealthRepository.api.requestRole(
                                    requestedRole = "doctor",
                                    name = name.trim(),
                                    phone = phone.trim(),
                                    license = license.trim(),
                                    hospital = nextClinicName,
                                    department = specialty.name,
                                    organizationId = nextOrganizationId,
                                    reason = reason.trim(),
                                    accountType = nextAccountType,
                                    workspaceType = nextWorkspaceType
                                )
                                applyUser(updated)
                                statusMessage = "Đã gửi lại hồ sơ. Tài khoản đang chờ quản trị viên phê duyệt."
                            } catch (exception: Exception) {
                                errorMessage = exception.toVietnameseMessage("Không thể gửi lại hồ sơ bác sĩ.")
                            } finally {
                                isSubmitting = false
                            }
                        }
                    },
                    enabled = !isSubmitting,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    } else {
                        Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Cập nhật và gửi lại", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        errorMessage?.let {
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = { refreshStatus() },
            enabled = !isChecking,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
            shape = RoundedCornerShape(12.dp)
        ) {
            if (isChecking) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
            } else {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Kiểm tra lại trạng thái", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = Surface),
            shape = RoundedCornerShape(12.dp)
        ) {
            Icon(Icons.Default.Logout, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Đăng xuất", color = TextSecondary, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
private fun DoctorAccountTypeSelector(
    selectedAccountType: String,
    onSelected: (String) -> Unit
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text("Loại đăng ký", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            DoctorAccountTypeButton(
                label = "Bác sĩ tư",
                selected = selectedAccountType == "solo_doctor",
                onClick = { onSelected("solo_doctor") },
                modifier = Modifier.weight(1f)
            )
            DoctorAccountTypeButton(
                label = "Bác sĩ cơ sở",
                selected = selectedAccountType == "doctor",
                onClick = { onSelected("doctor") },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun DoctorAccountTypeButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val containerColor = if (selected) PrimaryBlue else Color.White
    val contentColor = if (selected) Color.White else TextPrimary
    Button(
        onClick = onClick,
        modifier = modifier.height(44.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = containerColor,
            contentColor = contentColor
        ),
        shape = RoundedCornerShape(10.dp),
        border = if (selected) null else androidx.compose.foundation.BorderStroke(1.dp, Border)
    ) {
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun PendingStep(icon: ImageVector, iconTint: Color, title: String, description: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(iconTint.copy(alpha = 0.12f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(3.dp))
            Text(description, color = TextSecondary, fontSize = 13.sp, lineHeight = 18.sp)
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
    onSelected: (String) -> Unit
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
        Text(label, color = TextPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .background(Color.White, RoundedCornerShape(12.dp))
                .border(1.dp, if (expanded) PrimaryBlue else Border, RoundedCornerShape(12.dp))
                .clickable {
                    query = ""
                    expanded = true
                }
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, tint = TextSecondary)
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = value.ifBlank { placeholder },
                color = if (value.isBlank()) TextSecondary.copy(alpha = 0.55f) else TextPrimary,
                fontSize = 14.sp,
                modifier = Modifier.weight(1f)
            )
            Icon(Icons.Default.KeyboardArrowDown, contentDescription = null, tint = TextSecondary)
        }
        if (expanded) {
            Dialog(onDismissRequest = { expanded = false }) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .padding(16.dp)
                ) {
                    Text(label, color = TextPrimary, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Tìm kiếm", color = TextSecondary.copy(alpha = 0.6f)) },
                        singleLine = true,
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryBlue,
                            unfocusedBorderColor = Border,
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = Color.White
                        )
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 360.dp)
                    ) {
                        items(visibleOptions, key = { it.first }) { (id, name) ->
                            Text(
                                text = name,
                                color = TextPrimary,
                                fontSize = 15.sp,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        onSelected(id)
                                        expanded = false
                                    }
                                    .padding(vertical = 14.dp, horizontal = 4.dp)
                            )
                        }
                        if (visibleOptions.isEmpty()) {
                            item {
                                Text(
                                    text = "Không có kết quả phù hợp",
                                    color = TextSecondary,
                                    fontSize = 14.sp,
                                    modifier = Modifier.padding(vertical = 14.dp, horizontal = 4.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
