package com.example.smart_health_android.ui.screens

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    onNavigateToVerifyPhoneSettings: () -> Unit,
    onNavigateToReVerifyContact: (String, String) -> Unit
) {
    var isEditing by remember { mutableStateOf(false) }
    var currentUser by remember { mutableStateOf<AuthUser?>(null) }
    var avatarBitmap by remember { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    var isAvatarBusy by remember { mutableStateOf(false) }
    var license by remember { mutableStateOf("") }
    var hospital by remember { mutableStateOf("") }
    var department by remember { mutableStateOf("") }
    var organizationId by remember { mutableStateOf("") }
    var selectedSpecialtyId by remember { mutableStateOf("") }
    var clinics by remember { mutableStateOf<List<ClinicOption>>(emptyList()) }
    var specialties by remember { mutableStateOf<List<SpecialtyOption>>(emptyList()) }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("Đang tải...") }
    var roleLabel by remember { mutableStateOf("Tài khoản Smart Health") }
    var isSaving by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    fun applyProfile(user: AuthUser, keepAvatar: Boolean = false) {
        currentUser = user
        displayName = user.name.ifBlank { "Tài khoản Smart Health" }
        roleLabel = when (user.role) {
            "admin" -> "Quản trị"
            "doctor" -> "Bác sĩ"
            "patient" -> "Bệnh nhân"
            else -> "Tài khoản Smart Health"
        }
        license = user.license
        hospital = user.hospital
        department = user.department
        organizationId = user.organizationId.ifBlank {
            clinics.firstOrNull { it.name.equals(user.hospital, ignoreCase = true) }?.id.orEmpty()
        }
        selectedSpecialtyId = specialties.firstOrNull { it.name == user.department || it.name == user.specialty }?.id.orEmpty()
        email = user.email
        phone = user.phone
        address = user.address
        if (!keepAvatar) {
            avatarBitmap = null
        }
    }

    suspend fun loadAvatar(user: AuthUser) {
        val hasAvatar = user.avatarUrl.isNotBlank() || user.avatarFileId.isNotBlank()
        if (!hasAvatar) {
            avatarBitmap = null
            return
        }
        avatarBitmap = runCatching {
            val bytes = SmartHealthRepository.api.downloadMyAvatarBytes()
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
        }.getOrNull()
    }

    val avatarLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            coroutineScope.launch {
                isAvatarBusy = true
                try {
                    val resolver = context.contentResolver
                    val contentType = resolver.getType(uri) ?: "image/jpeg"
                    val fileName = "avatar-${System.currentTimeMillis()}.${contentType.substringAfter("/", "jpg")}"
                    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: error("Không đọc được ảnh đã chọn")
                    val updated = SmartHealthRepository.api.uploadMyAvatar(fileName, contentType, bytes)
                    currentUser = updated
                    applyProfile(updated, keepAvatar = true)
                    loadAvatar(updated)
                    loadError = null
                } catch (error: Exception) {
                    loadError = error.message ?: "Không thể tải avatar"
                } finally {
                    isAvatarBusy = false
                }
            }
        }
    }
    val selectedClinic = clinics.firstOrNull { it.id == organizationId }
    val selectedSpecialty = specialties.firstOrNull { it.id == selectedSpecialtyId }
    val joinDate = currentUser?.createdAt?.let { formatCreatedAt(it) }.orEmpty().ifBlank { "--" }

    LaunchedEffect(Unit) {
        try {
            clinics = SmartHealthRepository.api.listClinics()
            specialties = SmartHealthRepository.api.listSpecialties()
            val user = SmartHealthRepository.api.getMe()
            applyProfile(user)
            loadAvatar(user)
            loadError = null
        } catch (error: Exception) {
            loadError = error.message ?: "Không thể tải hồ sơ"
        }
    }

    fun handleSave() {
        isSaving = true
        loadError = null
        coroutineScope.launch {
            try {
                val updated = SmartHealthRepository.api.updateMe(
                    JSONObject()
                        .put("name", displayName.trim())
                        .put("phone", phone.trim())
                        .put("license", license.trim())
                        .put("organizationId", selectedClinic?.id.orEmpty())
                        .put("hospital", selectedClinic?.name ?: hospital.trim())
                        .put("department", selectedSpecialty?.name ?: department.trim())
                        .put("specialty", selectedSpecialty?.name ?: department.trim())
                        .put("address", address.trim())
                )
                applyProfile(updated, keepAvatar = true)
                currentUser = updated
                loadAvatar(updated)
                isEditing = false
            } catch (error: Exception) {
                loadError = error.message ?: "Không thể lưu hồ sơ"
            } finally {
                isSaving = false
            }
        }
    }

    val initials = remember(displayName) {
        displayName
            .split(" ")
            .mapNotNull { it.firstOrNull()?.uppercaseChar()?.toString() }
            .take(2)
            .joinToString("")
            .ifBlank { "SH" }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Gradient Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .padding(start = 24.dp, end = 24.dp, top = 48.dp, bottom = 48.dp)
        ) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                        }
                        Text("Thông tin cá nhân", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Box(
                        modifier = Modifier
                            .background(Color.White.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .clickable(enabled = !isSaving) { if (isEditing) handleSave() else isEditing = true }
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (isSaving) {
                                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                            } else {
                                Icon(
                                    if (isEditing) Icons.Default.Check else Icons.Default.Edit,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(if (isSaving) "Đang lưu" else if (isEditing) "Lưu" else "Chỉnh sửa", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(modifier = Modifier.size(96.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .shadow(8.dp, CircleShape)
                                .clip(CircleShape)
                                .background(Color.White),
                            contentAlignment = Alignment.Center
                        ) {
                            if (avatarBitmap != null) {
                                Image(
                                    bitmap = avatarBitmap!!,
                                    contentDescription = "Ảnh đại diện",
                                    modifier = Modifier.fillMaxSize()
                                )
                            } else {
                                Text(initials, color = PrimaryBlue, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        if (isEditing) {
                            Row(
                                modifier = Modifier.align(Alignment.BottomEnd),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .shadow(4.dp, CircleShape)
                                        .background(Color.White, CircleShape)
                                        .border(2.dp, PrimaryBlue, CircleShape)
                                        .clickable(enabled = !isAvatarBusy) { avatarLauncher.launch("image/*") },
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (isAvatarBusy) {
                                        CircularProgressIndicator(color = PrimaryBlue, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                                    } else {
                                        Icon(Icons.Default.PhotoCamera, contentDescription = "Chọn ảnh", tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                                    }
                                }
                                if (currentUser?.avatarUrl?.isNotBlank() == true || currentUser?.avatarFileId?.isNotBlank() == true) {
                                    Box(
                                        modifier = Modifier
                                            .size(32.dp)
                                            .shadow(4.dp, CircleShape)
                                            .background(Color.White, CircleShape)
                                            .border(2.dp, ErrorRed, CircleShape)
                                            .clickable(enabled = !isAvatarBusy) {
                                                coroutineScope.launch {
                                                    isAvatarBusy = true
                                                    try {
                                                        val updated = SmartHealthRepository.api.deleteMyAvatar()
                                                        currentUser = updated
                                                        applyProfile(updated, keepAvatar = false)
                                                        loadError = null
                                                    } catch (error: Exception) {
                                                        loadError = error.message ?: "Không thể xóa avatar"
                                                    } finally {
                                                        isAvatarBusy = false
                                                    }
                                                }
                                            },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(Icons.Default.Delete, contentDescription = "Xóa ảnh", tint = ErrorRed, modifier = Modifier.size(16.dp))
                                    }
                                }
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(displayName, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("$roleLabel ${department.ifBlank { "" }}", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        // Scrollable Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .offset(y = (-24).dp)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            loadError?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(12.dp))
                        .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                        .padding(12.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(4.dp, RoundedCornerShape(16.dp))
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Border, RoundedCornerShape(16.dp))
                    .padding(24.dp)
            ) {
                // Section 1
                Text("THÔNG TIN CHUYÊN MÔN", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.Person,
                    iconColor = Color(0xFF0EA5E9),
                    label = "Họ và tên",
                    value = displayName,
                    isEditing = isEditing,
                    onValueChange = { displayName = it }
                )
                Spacer(modifier = Modifier.height(16.dp))
                
                ProfileItemRow(
                    icon = Icons.Default.AssignmentInd,
                    iconColor = PrimaryBlue,
                    label = "Số chứng chỉ hành nghề",
                    value = license,
                    isEditing = isEditing,
                    onValueChange = { license = it }
                )
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.Business,
                    iconColor = Color(0xFF8B5CF6),
                    label = "Cơ sở y tế",
                    value = hospital,
                    isEditing = isEditing,
                    onValueChange = { hospital = it }
                )
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.Person,
                    iconColor = Color(0xFF10B981),
                    label = "Khoa",
                    value = department,
                    isEditing = isEditing,
                    onValueChange = { department = it }
                )

                Spacer(modifier = Modifier.height(24.dp))
                HorizontalDivider(color = Border)
                Spacer(modifier = Modifier.height(24.dp))

                // Section 2
                Text("THÔNG TIN LIÊN HỆ", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(modifier = Modifier.height(16.dp))
                
                ProfileItemRow(
                    icon = Icons.Default.Email,
                    iconColor = Color(0xFF3B82F6),
                    label = "Email",
                    value = email,
                    isEditing = false,
                    onValueChange = {}
                )
                Spacer(modifier = Modifier.height(16.dp))
                if (phone.isNotBlank()) {
                    ProfileItemRow(
                        icon = Icons.Default.Phone,
                        iconColor = Color(0xFFF97316),
                        label = "Số điện thoại",
                        value = phone,
                        isEditing = isEditing,
                        onValueChange = { phone = it }
                    )
                } else {
                    ProfileAddPhoneRow(onClick = { isEditing = true })
                }
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.LocationOn,
                    iconColor = Color(0xFFEC4899),
                    label = "Địa chỉ",
                    value = address,
                    isEditing = isEditing,
                    onValueChange = { address = it },
                    isTextArea = true
                )
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.DateRange,
                    iconColor = PrimaryTeal,
                    label = "Ngày tham gia",
                    value = joinDate,
                    isEditing = false, // Never edit join date
                    onValueChange = {}
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

private fun formatCreatedAt(value: String): String {
    return runCatching {
        val instant = Instant.parse(value)
        DateTimeFormatter.ofPattern("dd/MM/yyyy")
            .withZone(ZoneId.systemDefault())
            .format(instant)
    }.getOrDefault(value)
}

@Composable
fun ProfileAddPhoneRow(onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(Color(0xFFF97316).copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFFF97316), modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text("Số điện thoại", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "+ Thêm số điện thoại",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onClick)
            )
        }
    }
}

@Composable
fun ProfileItemRow(
    icon: ImageVector,
    iconColor: Color,
    label: String,
    value: String,
    isEditing: Boolean,
    onValueChange: (String) -> Unit,
    isTextArea: Boolean = false
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = if (isEditing && isTextArea) Alignment.Top else Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .padding(top = if (isEditing && isTextArea) 8.dp else 0.dp)
                .size(40.dp)
                .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            if (isEditing) {
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = if (isTextArea) Modifier.fillMaxWidth().height(80.dp) else Modifier.fillMaxWidth(),
                    textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        focusedBorderColor = PrimaryBlue,
                        unfocusedBorderColor = Border
                    ),
                    singleLine = !isTextArea,
                    shape = RoundedCornerShape(8.dp)
                )
            } else {
                Spacer(modifier = Modifier.height(4.dp))
                Text(value, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}
