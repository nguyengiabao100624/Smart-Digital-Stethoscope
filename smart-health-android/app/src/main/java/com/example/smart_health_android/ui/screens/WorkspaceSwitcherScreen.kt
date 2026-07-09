package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.WorkspaceSummary
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.Background
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.ErrorRed
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import com.example.smart_health_android.ui.theme.SuccessGreen
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import com.example.smart_health_android.ui.theme.WarningYellow
import kotlinx.coroutines.launch

@Composable
fun WorkspaceSwitcherScreen(
    onNavigateBack: () -> Unit
) {
    var currentUser by remember { mutableStateOf<AuthUser?>(null) }
    var loading by remember { mutableStateOf(true) }
    var switchingWorkspaceId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var reloadKey by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    suspend fun loadUser() {
        loading = true
        runCatching {
            currentUser = SmartHealthRepository.api.getMe()
            message = null
        }.onFailure {
            message = it.toVietnameseMessage("Không tải được danh sách workspace")
        }
        loading = false
    }

    LaunchedEffect(reloadKey) {
        loadUser()
    }

    val user = currentUser
    val currentWorkspaceId = user?.currentWorkspaceId?.ifBlank { user.organizationId }.orEmpty()
    val workspaces = user?.workspaceOptions().orEmpty()

    fun switchWorkspace(workspace: WorkspaceSummary) {
        if (workspace.id.isBlank() || workspace.id == currentWorkspaceId || switchingWorkspaceId != null) return
        scope.launch {
            switchingWorkspaceId = workspace.id
            message = null
            runCatching {
                currentUser = SmartHealthRepository.api.switchWorkspace(workspace.id)
            }.onSuccess {
                message = "Đã chuyển sang ${workspace.name.ifBlank { workspace.id }}"
            }.onFailure {
                message = it.toVietnameseMessage("Không thể chuyển workspace lúc này")
            }
            switchingWorkspaceId = null
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        WorkspaceSwitcherHeader(onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            message?.let { text ->
                Text(
                    text = text,
                    color = if (text.startsWith("Đã chuyển")) SuccessGreen else MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
            }

            if (loading) {
                WorkspaceLoadingCard()
            } else if (workspaces.isEmpty()) {
                WorkspaceEmptyCard(onRetry = { reloadKey += 1 })
            } else {
                workspaces.forEach { workspace ->
                    WorkspaceOptionCard(
                        workspace = workspace,
                        active = workspace.id == currentWorkspaceId,
                        switching = switchingWorkspaceId == workspace.id,
                        disabled = switchingWorkspaceId != null,
                        onClick = { switchWorkspace(workspace) }
                    )
                }
            }
        }
    }
}

@Composable
private fun WorkspaceSwitcherHeader(onNavigateBack: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
            .padding(start = 16.dp, end = 16.dp, top = 48.dp, bottom = 22.dp)
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Quay lại", tint = Color.White)
                }
                Text(
                    text = "Workspace",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                text = "Chọn cơ sở làm việc để đồng bộ dashboard, bệnh nhân, thiết bị và hồ sơ.",
                color = Color.White.copy(alpha = 0.82f),
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(horizontal = 8.dp)
            )
        }
    }
}

@Composable
private fun WorkspaceOptionCard(
    workspace: WorkspaceSummary,
    active: Boolean,
    switching: Boolean,
    disabled: Boolean,
    onClick: () -> Unit
) {
    val borderColor = if (active) PrimaryTeal.copy(alpha = 0.75f) else Border
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .clickable(enabled = !disabled && !active, onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, borderColor),
        elevation = CardDefaults.cardElevation(defaultElevation = if (active) 4.dp else 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Business, contentDescription = null, tint = PrimaryBlue)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = workspace.name.ifBlank { workspace.id },
                            color = TextPrimary,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "${workspaceTypeLabel(workspace)} • ${roleLabel(workspace.role)}",
                            color = TextSecondary,
                            fontSize = 13.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                if (active) {
                    WorkspaceStatusPill("Đang dùng", SuccessGreen, Icons.Default.CheckCircle)
                } else if (switching) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = PrimaryBlue)
                        Text("Đang chuyển", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                WorkspaceMetric(Icons.Default.Group, "${workspace.patientCount}", "bệnh nhân", Modifier.weight(1f))
                WorkspaceMetric(Icons.Default.Devices, "${workspace.deviceOnline}/${workspace.deviceCount}", "online", Modifier.weight(1f))
                WorkspaceMetric(Icons.Default.MonitorHeart, "${workspace.scanCount}", "lượt đo", Modifier.weight(1f))
            }

            if (workspace.alertCount > 0) {
                Spacer(modifier = Modifier.height(10.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(WarningYellow.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                        .border(1.dp, WarningYellow.copy(alpha = 0.24f), RoundedCornerShape(12.dp))
                        .padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = WarningYellow, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("${workspace.alertCount} cảnh báo thiết bị cần xử lý", color = TextPrimary, fontSize = 13.sp)
                }
            }
        }
    }
}

@Composable
private fun WorkspaceMetric(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    value: String,
    label: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(Background, RoundedCornerShape(12.dp))
            .border(1.dp, Border, RoundedCornerShape(12.dp))
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(icon, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.height(4.dp))
        Text(value, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text(label, color = TextSecondary, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun WorkspaceStatusPill(
    text: String,
    color: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector
) {
    Row(
        modifier = Modifier
            .background(color.copy(alpha = 0.12f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun WorkspaceLoadingCard() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryBlue)
        Spacer(modifier = Modifier.width(12.dp))
        Text("Đang tải workspace...", color = TextSecondary, fontSize = 14.sp)
    }
}

@Composable
private fun WorkspaceEmptyCard(onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text("Chưa có workspace khả dụng", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "Tài khoản này chưa có membership workspace hoặc backend chưa trả dữ liệu workspace.",
            color = TextSecondary,
            fontSize = 13.sp,
            lineHeight = 19.sp
        )
        TextButton(
            onClick = onRetry,
            colors = ButtonDefaults.textButtonColors(contentColor = PrimaryBlue)
        ) {
            Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("Tải lại")
        }
    }
}

private fun workspaceTypeLabel(workspace: WorkspaceSummary): String {
    return when (workspace.workspaceType.ifBlank { workspace.type }) {
        "solo_practice", "doctor_private" -> "Bác sĩ tư"
        "clinic" -> "Phòng khám"
        "hospital" -> "Bệnh viện"
        "personal" -> "Cá nhân/gia đình"
        "platform" -> "Nền tảng"
        else -> "Cơ sở y tế"
    }
}

private fun roleLabel(role: String): String {
    return when (role) {
        "doctor" -> "Bác sĩ"
        "workspace_owner" -> "Chủ workspace"
        "workspace_admin", "clinic_manager" -> "Quản lý workspace"
        "nurse" -> "Điều dưỡng"
        "technician" -> "Kỹ thuật viên"
        "billing" -> "Tài chính"
        "viewer" -> "Chỉ xem"
        "patient" -> "Bệnh nhân"
        else -> role.ifBlank { "Thành viên" }
    }
}
