package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientShare
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.formatIso
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.ErrorRed
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import kotlinx.coroutines.launch

@Composable
fun DataAccessScreen(onNavigateBack: () -> Unit) {
    var patients by remember { mutableStateOf<List<Patient>>(emptyList()) }
    var selectedPatientId by remember { mutableStateOf("") }
    var shares by remember { mutableStateOf<List<PatientShare>>(emptyList()) }
    var targets by remember { mutableStateOf(ShareTargets()) }
    var loading by remember { mutableStateOf(true) }
    var loadingShares by remember { mutableStateOf(false) }
    var revokingShareId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun loadShares(patientId: String) {
        if (patientId.isBlank()) {
            shares = emptyList()
            return
        }
        loadingShares = true
        runCatching {
            SmartHealthRepository.api.listPatientShares(patientId)
        }.onSuccess {
            shares = it
            message = null
        }.onFailure {
            message = it.toVietnameseMessage("Không tải được lịch sử consent")
        }
        loadingShares = false
    }

    suspend fun loadAll() {
        loading = true
        runCatching {
            val loadedPatients = SmartHealthRepository.api.listPatients()
            val loadedTargets = SmartHealthRepository.api.listShareTargets()
            val nextPatientId = selectedPatientId
                .takeIf { current -> loadedPatients.any { it.id == current } }
                ?: loadedPatients.firstOrNull()?.id.orEmpty()
            Triple(loadedPatients, loadedTargets, nextPatientId)
        }.onSuccess { (loadedPatients, loadedTargets, nextPatientId) ->
            patients = loadedPatients
            targets = loadedTargets
            selectedPatientId = nextPatientId
            loadShares(nextPatientId)
        }.onFailure {
            patients = emptyList()
            shares = emptyList()
            message = it.toVietnameseMessage("Không tải được quyền truy cập dữ liệu")
        }
        loading = false
    }

    fun revokeShare(share: PatientShare) {
        if (selectedPatientId.isBlank() || revokingShareId != null) return
        scope.launch {
            revokingShareId = share.id
            runCatching {
                SmartHealthRepository.api.revokePatientShare(selectedPatientId, share.id)
                loadShares(selectedPatientId)
            }.onSuccess {
                message = "Đã thu hồi consent"
            }.onFailure {
                message = it.toVietnameseMessage("Không thu hồi được consent")
            }
            revokingShareId = null
        }
    }

    LaunchedEffect(Unit) {
        loadAll()
    }

    val selectedPatient = patients.firstOrNull { it.id == selectedPatientId }
    val activeShares = shares.count { it.active }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Quyền truy cập dữ liệu", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            DataAccessSummaryCard(
                profileCount = patients.size,
                activeShareCount = activeShares,
                selectedPatientName = selectedPatient?.name.orEmpty(),
                loading = loading,
                onRefresh = {
                    scope.launch { loadAll() }
                }
            )

            message?.let { value ->
                Text(
                    text = value,
                    color = if (value.startsWith("Đã")) PrimaryTeal else ErrorRed,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 2.dp)
                )
            }

            if (loading) {
                LoadingCard("Đang tải quyền truy cập")
            } else if (patients.isEmpty()) {
                EmptyAccessCard(
                    title = "Chưa có hồ sơ bệnh nhân",
                    body = "Tạo hồ sơ cá nhân hoặc người thân trước khi cấp quyền chia sẻ.",
                    onRetry = { scope.launch { loadAll() } }
                )
            } else {
                PatientSelector(
                    patients = patients,
                    selectedPatientId = selectedPatientId,
                    onSelect = { patient ->
                        selectedPatientId = patient.id
                        scope.launch { loadShares(patient.id) }
                    }
                )

                ConsentHistorySection(
                    shares = shares,
                    targets = targets,
                    loading = loadingShares,
                    revokingShareId = revokingShareId,
                    onRevoke = ::revokeShare,
                    onRefresh = { scope.launch { loadShares(selectedPatientId) } }
                )
            }
        }
    }
}

@Composable
private fun DataAccessSummaryCard(
    profileCount: Int,
    activeShareCount: Int,
    selectedPatientName: String,
    loading: Boolean,
    onRefresh: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Shield, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(28.dp))
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text("Consent & chia sẻ hồ sơ", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "${profileCount} hồ sơ • ${activeShareCount} quyền đang cấp",
                color = TextSecondary,
                fontSize = 12.sp
            )
            if (selectedPatientName.isNotBlank()) {
                Text(selectedPatientName, color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }
        IconButton(onClick = onRefresh, enabled = !loading) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryBlue)
            } else {
                Icon(Icons.Default.Refresh, contentDescription = "Tải lại", tint = PrimaryBlue)
            }
        }
    }
}

@Composable
private fun PatientSelector(
    patients: List<Patient>,
    selectedPatientId: String,
    onSelect: (Patient) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Hồ sơ", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            patients.forEach { patient ->
                val selected = patient.id == selectedPatientId
                Surface(
                    modifier = Modifier
                        .width(220.dp)
                        .clickable { onSelect(patient) },
                    shape = RoundedCornerShape(14.dp),
                    color = if (selected) Color(0xFFEFF6FF) else Color.White,
                    tonalElevation = 0.dp,
                    shadowElevation = 0.dp,
                    border = androidx.compose.foundation.BorderStroke(
                        1.dp,
                        if (selected) PrimaryBlue else Border
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (patient.profileType == "dependent") Icons.Default.Groups else Icons.Default.Person,
                            contentDescription = null,
                            tint = if (selected) PrimaryBlue else TextSecondary,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(patient.name.ifBlank { patient.id }, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Text(patient.profileLabel(), color = TextSecondary, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ConsentHistorySection(
    shares: List<PatientShare>,
    targets: ShareTargets,
    loading: Boolean,
    revokingShareId: String?,
    onRevoke: (PatientShare) -> Unit,
    onRefresh: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.History, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(22.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Lịch sử consent", color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
            IconButton(onClick = onRefresh, enabled = !loading) {
                if (loading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryBlue)
                } else {
                    Icon(Icons.Default.Refresh, contentDescription = "Tải lại consent", tint = PrimaryBlue)
                }
            }
        }

        if (loading) {
            LoadingCard("Đang tải consent")
        } else if (shares.isEmpty()) {
            EmptyAccessCard(
                title = "Chưa có quyền chia sẻ",
                body = "Các consent đã cấp hoặc thu hồi sẽ xuất hiện tại đây.",
                onRetry = onRefresh
            )
        } else {
            shares.sortedWith(compareByDescending<PatientShare> { it.active }.thenByDescending { it.createdAt.orEmpty() })
                .forEach { share ->
                    ConsentGrantCard(
                        share = share,
                        targetLabel = share.targetLabel(targets),
                        targetIcon = share.targetIcon(),
                        revoking = revokingShareId == share.id,
                        onRevoke = { onRevoke(share) }
                    )
                }
        }
    }
}

@Composable
private fun ConsentGrantCard(
    share: PatientShare,
    targetLabel: String,
    targetIcon: ImageVector,
    revoking: Boolean,
    onRevoke: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFF8FAFC), RoundedCornerShape(14.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(targetIcon, contentDescription = null, tint = if (share.active) PrimaryBlue else TextSecondary, modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(targetLabel, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(share.scopeLabel(), color = TextSecondary, fontSize = 12.sp)
            }
            StatusPill(active = share.active)
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            MetadataPill("Lượt đo", if (share.scanIds.isEmpty()) "Tất cả" else share.scanIds.size.toString())
            MetadataPill("Hết hạn", share.expiresAt?.let { formatIso(it, "dd/MM/yyyy") } ?: "Không")
        }

        if (share.active) {
            OutlinedButton(
                onClick = onRevoke,
                enabled = !revoking,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = ErrorRed)
            ) {
                if (revoking) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = ErrorRed)
                    Spacer(modifier = Modifier.width(8.dp))
                } else {
                    Icon(Icons.Default.Delete, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text("Thu hồi consent")
            }
        }
    }
}

@Composable
private fun StatusPill(active: Boolean) {
    val bg = if (active) Color(0xFFE7F8F3) else Color(0xFFF3F4F6)
    val fg = if (active) PrimaryTeal else TextSecondary
    Text(
        text = if (active) "Đang cấp" else "Đã thu hồi",
        color = fg,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .background(bg, RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp)
    )
}

@Composable
private fun MetadataPill(label: String, value: String) {
    Text(
        text = "$label: $value",
        color = TextSecondary,
        fontSize = 11.sp,
        modifier = Modifier
            .background(Color.White, RoundedCornerShape(999.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(999.dp))
            .padding(horizontal = 10.dp, vertical = 5.dp)
    )
}

@Composable
private fun LoadingCard(text: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(14.dp))
            .border(1.dp, Border, RoundedCornerShape(14.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryBlue)
        Spacer(modifier = Modifier.width(10.dp))
        Text(text, color = TextSecondary, fontSize = 13.sp)
    }
}

@Composable
private fun EmptyAccessCard(title: String, body: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(14.dp))
            .border(1.dp, Border, RoundedCornerShape(14.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text(body, color = TextSecondary, fontSize = 12.sp, lineHeight = 18.sp)
        Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)) {
            Text("Tải lại")
        }
    }
}

private fun Patient.profileLabel(): String {
    return when {
        relationship.isNotBlank() -> relationship
        profileType == "self" -> "Hồ sơ cá nhân"
        profileType == "dependent" -> "Người thân"
        profileType.isNotBlank() -> profileType
        else -> patientCode.ifBlank { id }
    }
}

private fun PatientShare.scopeLabel(): String {
    return when (scope) {
        "selected_scans" -> "Chỉ ${scanIds.size} lượt đo đã chọn"
        "patient_profile" -> "Toàn bộ hồ sơ bệnh nhân"
        else -> scope.ifBlank { "Toàn bộ hồ sơ bệnh nhân" }
    }
}

private fun PatientShare.targetIcon(): ImageVector {
    return if (organizationId.isNotBlank()) Icons.Default.Business else Icons.Default.Person
}

private fun PatientShare.targetLabel(targets: ShareTargets): String {
    val doctorKey = doctorUserId.ifBlank { doctorId }
    if (doctorKey.isNotBlank()) {
        val doctor = targets.doctors.firstOrNull { it.id == doctorKey }
        return doctor?.name?.ifBlank { doctor.id } ?: doctorKey
    }
    if (organizationId.isNotBlank()) {
        val workspace = targets.workspaces.firstOrNull { it.id == organizationId }
        return workspace?.name?.ifBlank { workspace.id } ?: organizationId
    }
    return "Đối tượng chia sẻ"
}
