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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.Background
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.Surface
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun SignUpScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToVerifyEmail: (accountType: String) -> Unit
) {
    var accountType by remember { mutableStateOf("personal") }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var license by remember { mutableStateOf("") }
    var registrationReason by remember { mutableStateOf("") }
    var clinics by remember { mutableStateOf<List<ClinicOption>>(emptyList()) }
    var specialties by remember { mutableStateOf<List<SpecialtyOption>>(emptyList()) }
    var selectedClinicId by remember { mutableStateOf("") }
    var selectedSoloClinicId by remember { mutableStateOf("") }
    var selectedSpecialtyId by remember { mutableStateOf("") }
    var requestedClinicName by remember { mutableStateOf("") }
    var soloClinicName by remember { mutableStateOf("") }
    var catalogReloadKey by remember { mutableStateOf(0) }
    var isCatalogLoading by remember { mutableStateOf(false) }
    var catalogError by remember { mutableStateOf<String?>(null) }
    var agreedToTerms by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current
    val selectedClinic = clinics.firstOrNull { it.id == selectedClinicId }
    val privateClinicOptions = clinics.filter { it.type != "hospital" }
    val selectedSoloClinic = privateClinicOptions.firstOrNull { it.id == selectedSoloClinicId }
    val selectedSpecialty = specialties.firstOrNull { it.id == selectedSpecialtyId }
    val clinicDisplayName = selectedClinic?.name ?: requestedClinicName
    val soloClinicDisplayName = selectedSoloClinic?.name ?: soloClinicName
    val isDoctorRegistration = accountType == "doctor" || accountType == "solo_doctor"
    val requiresClinicSelection = accountType == "doctor"

    LaunchedEffect(catalogReloadKey) {
        isCatalogLoading = true
        catalogError = null
        try {
            clinics = SmartHealthRepository.api.listClinics()
            specialties = SmartHealthRepository.api.listSpecialties()
        } catch (error: Exception) {
            catalogError = error.toVietnameseMessage("Không thể tải danh sách cơ sở y tế/chuyên khoa từ backend.")
        } finally {
            isCatalogLoading = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(24.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier
                    .clickable(onClick = onNavigateToLogin)
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.ArrowBack, contentDescription = null, tint = PrimaryBlue)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Quay lại", color = PrimaryBlue, fontWeight = FontWeight.Medium)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text("Tạo tài khoản mới", color = PrimaryBlue, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text("Điền thông tin để bắt đầu", color = TextSecondary, fontSize = 16.sp)
        }

        Spacer(modifier = Modifier.height(32.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Surface, RoundedCornerShape(12.dp))
                .padding(4.dp)
        ) {
            AccountTypeTab(
                label = "Cá nhân",
                selected = accountType == "personal",
                onClick = {
                    accountType = "personal"
                    selectedClinicId = ""
                    selectedSoloClinicId = ""
                    requestedClinicName = ""
                    soloClinicName = ""
                },
                modifier = Modifier.weight(1f)
            )
            AccountTypeTab(
                label = "Bác sĩ tư",
                selected = accountType == "solo_doctor",
                onClick = {
                    accountType = "solo_doctor"
                    selectedClinicId = ""
                    requestedClinicName = ""
                },
                modifier = Modifier.weight(1f)
            )
            AccountTypeTab(
                label = "Bác sĩ cơ sở",
                selected = accountType == "doctor",
                onClick = {
                    accountType = "doctor"
                    selectedSoloClinicId = ""
                    soloClinicName = ""
                },
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            TextFieldGroup(
                label = "Họ và tên",
                value = name,
                onValueChange = { name = it },
                icon = Icons.Default.Person,
                placeholder = if (isDoctorRegistration) "Họ tên bác sĩ" else "Họ tên người dùng"
            )

            if (isDoctorRegistration) {
                TextFieldGroup(
                    label = "Số chứng chỉ hành nghề",
                    value = license,
                    onValueChange = { license = it },
                    icon = Icons.Default.Info,
                    placeholder = "VD: CCHN-BYT-2026-001"
                )
                if (requiresClinicSelection) {
                    CatalogDropdown(
                        label = "Cơ sở y tế",
                        value = clinicDisplayName,
                        placeholder = when {
                            isCatalogLoading -> "Đang tải cơ sở y tế..."
                            clinics.isEmpty() -> "Không tải được cơ sở y tế - bấm để thử lại"
                            else -> "Tìm và chọn cơ sở y tế"
                        },
                        enabled = !isCatalogLoading,
                        options = clinics.map { it.id to it.name },
                        onSelected = {
                            selectedClinicId = it
                            requestedClinicName = ""
                        },
                        icon = Icons.Default.Home,
                        searchPlaceholder = "Tìm bệnh viện/phòng khám",
                        loading = isCatalogLoading,
                        emptyMessage = catalogError ?: "Chưa có cơ sở y tế trong danh mục backend. Bạn có thể nhập tên để gửi yêu cầu bổ sung.",
                        onRetry = { catalogReloadKey++ },
                        missingRequestLabel = "Không thấy trong danh sách? Yêu cầu bổ sung",
                        onRequestMissing = { query ->
                            requestedClinicName = query.trim()
                            selectedClinicId = ""
                        }
                    )
                } else {
                    CatalogDropdown(
                        label = "Phòng khám tư",
                        value = soloClinicDisplayName,
                        placeholder = when {
                            isCatalogLoading -> "Đang tải gợi ý phòng khám..."
                            privateClinicOptions.isEmpty() -> "Nhập tên phòng khám tư của bạn"
                            else -> "Chọn gợi ý hoặc nhập tên phòng khám tư"
                        },
                        enabled = !isCatalogLoading,
                        options = privateClinicOptions.map { it.id to it.name },
                        onSelected = {
                            selectedSoloClinicId = it
                            soloClinicName = ""
                        },
                        icon = Icons.Default.Home,
                        searchPlaceholder = "Tìm hoặc nhập tên phòng khám tư",
                        loading = isCatalogLoading,
                        emptyMessage = catalogError ?: "Nhập tên phòng khám tư để tạo workspace riêng cho bác sĩ tư.",
                        onRetry = { catalogReloadKey++ },
                        missingRequestLabel = "Dùng tên phòng khám tư này",
                        onRequestMissing = { query ->
                            soloClinicName = query.trim()
                            selectedSoloClinicId = ""
                        }
                    )
                }
                if (requiresClinicSelection && requestedClinicName.isNotBlank()) {
                    Text(
                        "Đã ghi nhận yêu cầu bổ sung: $requestedClinicName",
                        color = PrimaryBlue,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
                CatalogDropdown(
                    label = "Chuyên khoa",
                    value = selectedSpecialty?.name.orEmpty(),
                    placeholder = when {
                        isCatalogLoading -> "Đang tải chuyên khoa..."
                        specialties.isEmpty() -> "Không tải được chuyên khoa - bấm để thử lại"
                        else -> "Chọn chuyên khoa"
                    },
                    enabled = !isCatalogLoading,
                    options = specialties.map { it.id to it.name },
                    onSelected = { selectedSpecialtyId = it },
                    icon = Icons.Default.LocalHospital,
                    loading = isCatalogLoading,
                    emptyMessage = catalogError ?: "Chưa có chuyên khoa trong danh mục backend. Hãy tải lại hoặc kiểm tra backend.",
                    onRetry = { catalogReloadKey++ }
                )
                TextFieldGroup(
                    label = "Lý do đăng ký",
                    value = registrationReason,
                    onValueChange = { registrationReason = it },
                    icon = Icons.Default.Description,
                    placeholder = "VD: Sử dụng hệ thống cho phòng khám tim mạch"
                )
            }

            TextFieldGroup(
                label = "Số điện thoại",
                value = phone,
                onValueChange = { phone = it },
                icon = Icons.Default.Phone,
                placeholder = "0912 345 678"
            )
            TextFieldGroup(
                label = "Địa chỉ Email",
                value = email,
                onValueChange = { email = it },
                icon = Icons.Default.Email,
                placeholder = if (isDoctorRegistration) "bacsi@example.com" else "email@example.com"
            )
            TextFieldGroup(
                label = "Mật khẩu",
                value = password,
                onValueChange = { password = it },
                icon = Icons.Default.Lock,
                placeholder = "Tối thiểu 8 ký tự",
                isPassword = true
            )
            TextFieldGroup(
                label = "Xác nhận mật khẩu",
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                icon = Icons.Default.Lock,
                placeholder = "Nhập lại mật khẩu",
                isPassword = true
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = agreedToTerms,
                onCheckedChange = { agreedToTerms = it },
                colors = CheckboxDefaults.colors(checkedColor = PrimaryBlue)
            )
            Text(
                "Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật",
                color = TextSecondary,
                fontSize = 14.sp
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        errorMessage?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
            )
        }
        catalogError?.takeIf { isDoctorRegistration }?.let { message ->
            Text(
                text = message,
                color = MaterialTheme.colorScheme.error,
                fontSize = 13.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
            )
        }

        Button(
            onClick = {
                val cleanName = name.trim()
                val cleanEmail = email.trim()
                val cleanPhone = phone.trim()
                val cleanPassword = password.trim()

                errorMessage = when {
                    cleanName.isBlank() -> "Vui lòng nhập họ tên"
                    cleanEmail.isBlank() -> "Vui lòng nhập email để xác thực tài khoản"
                    cleanPassword.length < 8 -> "Mật khẩu cần tối thiểu 8 ký tự"
                    cleanPassword != confirmPassword.trim() -> "Mật khẩu xác nhận không khớp"
                    !agreedToTerms -> "Vui lòng đồng ý điều khoản sử dụng"
                    isDoctorRegistration && license.isBlank() -> "Vui lòng nhập số chứng chỉ hành nghề"
                    accountType == "solo_doctor" && soloClinicDisplayName.isBlank() -> "Vui lòng chọn hoặc nhập tên phòng khám tư"
                    requiresClinicSelection && selectedClinic == null && requestedClinicName.isBlank() -> "Vui lòng chọn cơ sở y tế hoặc gửi yêu cầu bổ sung"
                    isDoctorRegistration && selectedSpecialty == null -> "Vui lòng chọn chuyên khoa"
                    else -> null
                }
                if (errorMessage != null) return@Button

                isSubmitting = true
                coroutineScope.launch {
                    try {
                        FirebaseAuthService.createAccount(
                            email = cleanEmail,
                            password = cleanPassword,
                            displayName = cleanName
                        )
                        withContext(Dispatchers.IO) {
                            PendingRegistrationStore.save(
                                context,
                                PendingRegistration(
                                    accountType = accountType,
                                    name = cleanName,
                                    email = cleanEmail,
                                    phone = cleanPhone,
                                    license = license.trim(),
                                    hospital = if (accountType == "solo_doctor") soloClinicDisplayName.trim() else clinicDisplayName,
                                    department = selectedSpecialty?.name.orEmpty(),
                                    organizationId = if (accountType == "solo_doctor") "" else selectedClinic?.id.orEmpty(),
                                    reason = registrationReason.trim()
                                )
                            )
                        }
                        onNavigateToVerifyEmail(accountType)
                    } catch (error: Exception) {
                        errorMessage = error.toVietnameseMessage("Không thể tạo tài khoản. Vui lòng kiểm tra thông tin và thử lại.")
                    } finally {
                        isSubmitting = false
                    }
                }
            },
            enabled = !isSubmitting,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
            shape = RoundedCornerShape(12.dp)
        ) {
            if (isSubmitting) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.height(20.dp)
                )
            } else {
                Text("Đăng ký", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("Đã có tài khoản? ", color = TextSecondary, fontSize = 14.sp)
            Text(
                "Đăng nhập ngay",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onNavigateToLogin)
            )
        }

        Spacer(modifier = Modifier.height(32.dp))
        Text(
            "Phần mềm Y tế v2.1.0",
            color = TextSecondary,
            fontSize = 12.sp,
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
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(if (selected) Color.White else Color.Transparent, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (selected) PrimaryBlue else TextSecondary,
            fontWeight = FontWeight.Medium
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
    isPassword: Boolean = false
) {
    Column {
        Text(label, color = TextPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(placeholder, color = TextSecondary.copy(alpha = 0.5f)) },
            leadingIcon = { Icon(icon, contentDescription = null, tint = TextSecondary) },
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryBlue,
                unfocusedBorderColor = Border,
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White
            ),
            singleLine = true
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
    searchPlaceholder: String = "Tìm kiếm",
    loading: Boolean = false,
    emptyMessage: String = "Không có kết quả phù hợp",
    onRetry: (() -> Unit)? = null,
    missingRequestLabel: String? = null,
    onRequestMissing: ((String) -> Unit)? = null
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
                .clickable(enabled = enabled) {
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
                        placeholder = { Text(searchPlaceholder, color = TextSecondary.copy(alpha = 0.6f)) },
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryBlue,
                            unfocusedBorderColor = Border,
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = Color.White
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    if (loading) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 18.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                color = PrimaryBlue,
                                strokeWidth = 2.dp,
                                modifier = Modifier.height(22.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Text("Đang tải danh mục...", color = TextSecondary, fontSize = 14.sp)
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
                                        .clickable {
                                            onSelected(id)
                                            expanded = false
                                        }
                                        .padding(vertical = 14.dp, horizontal = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(name, color = TextPrimary, fontSize = 15.sp, modifier = Modifier.weight(1f))
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
                                            if (query.trim().isBlank()) emptyMessage else "Không có kết quả phù hợp",
                                            color = TextSecondary,
                                            fontSize = 14.sp,
                                            lineHeight = 20.sp
                                        )
                                        if (onRetry != null) {
                                            Spacer(modifier = Modifier.height(10.dp))
                                            Button(
                                                onClick = onRetry,
                                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                                                shape = RoundedCornerShape(10.dp)
                                            ) {
                                                Text("Tải lại danh mục", color = Color.White, fontWeight = FontWeight.SemiBold)
                                            }
                                        }
                                    }
                                }
                            }
                            if (!missingRequestLabel.isNullOrBlank() && query.trim().isNotBlank() && onRequestMissing != null) {
                                item {
                                    Text(
                                        "$missingRequestLabel: ${query.trim()}",
                                        color = PrimaryBlue,
                                        fontWeight = FontWeight.SemiBold,
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clickable {
                                                onRequestMissing(query)
                                                expanded = false
                                            }
                                            .padding(vertical = 14.dp, horizontal = 4.dp)
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
