package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun FamilyProfilesScreen(onNavigateBack: () -> Unit) {
    var profiles by remember { mutableStateOf<List<Patient>>(emptyList()) }
    var editingProfile by remember { mutableStateOf<Patient?>(null) }
    var name by remember { mutableStateOf("") }
    var relationship by remember { mutableStateOf("") }
    var ageText by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var deletingProfileId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun clearForm() {
        editingProfile = null
        name = ""
        relationship = ""
        ageText = ""
        gender = ""
        phone = ""
        notes = ""
    }

    fun editProfile(profile: Patient) {
        editingProfile = profile
        name = profile.name
        relationship = profile.relationship
        ageText = profile.age?.toString().orEmpty()
        gender = profile.gender
        phone = profile.phone
        notes = profile.notes
        message = null
    }

    suspend fun loadProfiles() {
        isLoading = true
        runCatching {
            SmartHealthRepository.api.listPatients()
        }.onSuccess { loaded ->
            profiles = loaded.sortedWith(
                compareBy<Patient> { if (it.profileType == "self") 0 else 1 }
                    .thenBy { it.name.lowercase() }
            )
            if (editingProfile != null && loaded.none { it.id == editingProfile?.id }) {
                clearForm()
            }
            message = null
        }.onFailure {
            profiles = emptyList()
            message = it.toVietnameseMessage("Không tải được hồ sơ gia đình")
        }
        isLoading = false
    }

    fun saveProfile() {
        val cleanName = name.trim()
        if (cleanName.isBlank() || isSaving) {
            message = "Cần nhập tên hồ sơ."
            return
        }
        val cleanAge = ageText.trim().takeIf { it.isNotBlank() }?.toIntOrNull()
        if (ageText.isNotBlank() && cleanAge == null) {
            message = "Tuổi phải là số."
            return
        }
        scope.launch {
            isSaving = true
            runCatching {
                val current = editingProfile
                if (current == null) {
                    SmartHealthRepository.api.createPatient(
                        patientCode = "",
                        name = cleanName,
                        age = cleanAge,
                        gender = gender.trim(),
                        phone = phone.trim(),
                        notes = notes.trim(),
                        profileType = "dependent",
                        relationship = relationship.trim()
                    )
                } else {
                    SmartHealthRepository.api.updatePatient(
                        patientId = current.id,
                        name = cleanName,
                        age = cleanAge,
                        gender = gender.trim(),
                        phone = phone.trim(),
                        notes = notes.trim(),
                        relationship = relationship.trim()
                    )
                }
            }.onSuccess {
                message = if (editingProfile == null) "Đã thêm hồ sơ gia đình." else "Đã cập nhật hồ sơ."
                clearForm()
                loadProfiles()
            }.onFailure {
                message = it.toVietnameseMessage("Không lưu được hồ sơ")
            }
            isSaving = false
        }
    }

    fun deleteProfile(profile: Patient) {
        if (profile.profileType == "self" || deletingProfileId != null) return
        scope.launch {
            deletingProfileId = profile.id
            runCatching {
                SmartHealthRepository.api.deletePatient(profile.id)
            }.onSuccess {
                message = "Đã xóa hồ sơ ${profile.name}."
                if (editingProfile?.id == profile.id) clearForm()
                loadProfiles()
            }.onFailure {
                message = it.toVietnameseMessage("Không xóa được hồ sơ")
            }
            deletingProfileId = null
        }
    }

    LaunchedEffect(Unit) {
        loadProfiles()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .padding(start = 16.dp, end = 16.dp, top = 48.dp, bottom = 24.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text("Hồ sơ gia đình", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text("Quản lý người thân dùng chung tài khoản", color = Color.White.copy(alpha = 0.82f), fontSize = 14.sp)
                }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            if (isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = PrimaryTeal, trackColor = Border)
            }
            message?.let {
                Text(it, color = if (it.startsWith("Đã")) PrimaryTeal else MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }

            Column {
                Text("DANH SÁCH HỒ SƠ", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 10.dp))
                if (!isLoading && profiles.isEmpty()) {
                    EmptyFamilyProfiles(onRefresh = { scope.launch { loadProfiles() } })
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        profiles.forEach { profile ->
                            FamilyProfileRow(
                                profile = profile,
                                isEditing = editingProfile?.id == profile.id,
                                isDeleting = deletingProfileId == profile.id,
                                onEdit = { editProfile(profile) },
                                onDelete = { deleteProfile(profile) }
                            )
                        }
                    }
                }
            }

            Column {
                Text(if (editingProfile == null) "THÊM HỒ SƠ" else "CẬP NHẬT HỒ SƠ", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 10.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Họ tên") },
                        leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = relationship,
                            onValueChange = { relationship = it },
                            label = { Text("Quan hệ") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        OutlinedTextField(
                            value = ageText,
                            onValueChange = { ageText = it.filter(Char::isDigit).take(3) },
                            label = { Text("Tuổi") },
                            singleLine = true,
                            modifier = Modifier.width(96.dp)
                        )
                    }
                    OutlinedTextField(
                        value = gender,
                        onValueChange = { gender = it },
                        label = { Text("Giới tính") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Số điện thoại") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Ghi chú") },
                        minLines = 2,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { clearForm() },
                            enabled = !isSaving,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Làm mới")
                        }
                        Button(
                            onClick = { saveProfile() },
                            enabled = !isSaving,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
                        ) {
                            if (isSaving) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                            } else {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(if (editingProfile == null) "Thêm" else "Lưu")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyFamilyProfiles(onRefresh: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.Groups, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(32.dp))
        Spacer(modifier = Modifier.height(8.dp))
        Text("Chưa có hồ sơ gia đình", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(4.dp))
        Text("Thêm hồ sơ người thân để đo, theo dõi và chia sẻ consent riêng.", color = TextSecondary, fontSize = 13.sp)
        Spacer(modifier = Modifier.height(10.dp))
        OutlinedButton(onClick = onRefresh) {
            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Tải lại")
        }
    }
}

@Composable
private fun FamilyProfileRow(
    profile: Patient,
    isEditing: Boolean,
    isDeleting: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    val isSelf = profile.profileType == "self"
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isEditing) PrimaryBlue.copy(alpha = 0.08f) else Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, if (isEditing) PrimaryBlue else Border, RoundedCornerShape(16.dp))
            .clickable(onClick = onEdit)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .background((if (isSelf) PrimaryBlue else PrimaryTeal).copy(alpha = 0.12f), RoundedCornerShape(13.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(if (isSelf) Icons.Default.Person else Icons.Default.Groups, contentDescription = null, tint = if (isSelf) PrimaryBlue else PrimaryTeal)
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(profile.name, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, lineHeight = 20.sp)
            Text(
                listOf(
                    profile.relationship.ifBlank { if (isSelf) "Hồ sơ cá nhân" else "Người thân" },
                    profile.age?.let { "$it tuổi" }.orEmpty(),
                    profile.gender,
                    profile.patientCode
                ).filter { it.isNotBlank() }.joinToString(" • "),
                color = TextSecondary,
                fontSize = 13.sp,
                lineHeight = 18.sp
            )
            if (profile.scanCount > 0 || !profile.lastScanAt.isNullOrBlank()) {
                Text("${profile.scanCount} lượt đo", color = TextSecondary, fontSize = 12.sp)
            }
        }
        IconButton(onClick = onEdit) {
            Icon(Icons.Default.Edit, contentDescription = "Sửa", tint = PrimaryBlue)
        }
        IconButton(onClick = onDelete, enabled = !isSelf && !isDeleting) {
            if (isDeleting) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = ErrorRed)
            } else {
                Icon(Icons.Default.Delete, contentDescription = "Xóa", tint = if (isSelf) TextSecondary.copy(alpha = 0.35f) else ErrorRed)
            }
        }
    }
}
