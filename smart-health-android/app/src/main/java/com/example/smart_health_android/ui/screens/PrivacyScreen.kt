package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun PrivacyScreen(
    onNavigateBack: () -> Unit,
    onNavigateToChangePassword: () -> Unit,
    onNavigateToDataAccess: () -> Unit,
    onNavigateToAccessLog: () -> Unit
) {
    var biometric by remember { mutableStateOf(false) }
    var twoFactor by remember { mutableStateOf(false) }
    var twoFactorMethod by remember { mutableStateOf("") }
    var twoFactorSecretPreview by remember { mutableStateOf("") }
    var recoveryCodes by remember { mutableStateOf<List<String>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isSavingTwoFactor by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var securityNotice by remember {
        mutableStateOf("Sinh trắc học và 2FA trên app sẽ được bật khi nối native biometric/SMS provider thật.")
    }
    val coroutineScope = rememberCoroutineScope()

    fun applyTwoFactorState(enabled: Boolean, method: String, secretPreview: String = "") {
        twoFactor = enabled
        twoFactorMethod = method
        twoFactorSecretPreview = secretPreview
        securityNotice = if (enabled) {
            val methodLabel = if (method == "sms") "SMS" else "ứng dụng OTP"
            "Cấu hình 2FA backend đang bật qua $methodLabel. OTP provider thật vẫn cần được kích hoạt ở hạ tầng."
        } else {
            "2FA đang tắt. Bật 2FA sẽ lưu cấu hình bảo mật trên backend và cấp mã khôi phục."
        }
    }

    fun updateTwoFactor(enabled: Boolean) {
        if (isSavingTwoFactor) return
        isSavingTwoFactor = true
        errorMessage = null
        recoveryCodes = emptyList()
        coroutineScope.launch {
            try {
                val result = SmartHealthRepository.api.updateTwoFactor(enable = enabled, method = "app")
                applyTwoFactorState(result.enabled, result.method, result.secretPreview)
                recoveryCodes = result.recoveryCodes
                if (result.note.isNotBlank()) {
                    securityNotice = result.note
                }
            } catch (error: Exception) {
                errorMessage = error.toVietnameseMessage("Không thể cập nhật 2FA")
            } finally {
                isSavingTwoFactor = false
            }
        }
    }

    LaunchedEffect(Unit) {
        isLoading = true
        errorMessage = null
        runCatching {
            val user = SmartHealthRepository.api.getMe()
            applyTwoFactorState(user.twoFactorEnabled, user.twoFactorMethod, user.twoFactorSecretPreview)
        }.onFailure {
            errorMessage = it.toVietnameseMessage("Không thể tải cấu hình bảo mật")
        }
        isLoading = false
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
                .padding(start = 16.dp, end = 16.dp, top = 48.dp, bottom = 24.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text("Bảo mật & Quyền riêng tư", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Text("Quản lý bảo mật tài khoản", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp)
                }
            }
        }

        // Scrollable Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            if (isLoading || isSavingTwoFactor) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = PrimaryTeal,
                    trackColor = Border
                )
            }
            errorMessage?.let { message ->
                Text(
                    text = message,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
            }
            // Section 1: Xác Thực
            Column {
                Text("XÁC THỰC", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    PrivacyToggleRow(
                        icon = Icons.Default.Fingerprint,
                        iconColor = Color(0xFF10B981),
                        title = "Xác thực sinh trắc học",
                        subtitle = "Chưa khả dụng cho bản Android hiện tại",
                        checked = biometric,
                        onCheckedChange = {
                            securityNotice = "Sinh trắc học cần tích hợp Android BiometricPrompt trước khi bật trong bản phát hành."
                        },
                        enabled = false,
                        showDivider = true
                    )
                    PrivacyToggleRow(
                        icon = Icons.Default.Smartphone,
                        iconColor = PrimaryBlue,
                        title = "Xác thực 2 yếu tố (2FA)",
                        subtitle = if (twoFactor) {
                            listOf("Đang bật", twoFactorMethod.uppercase(), twoFactorSecretPreview)
                                .filter { it.isNotBlank() }
                                .joinToString(" • ")
                        } else {
                            "Lưu cấu hình 2FA và mã khôi phục trên backend"
                        },
                        checked = twoFactor,
                        onCheckedChange = { updateTwoFactor(it) },
                        enabled = !isLoading && !isSavingTwoFactor,
                        showDivider = false
                    )
                }
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    securityNotice,
                    color = TextSecondary,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
                if (recoveryCodes.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFFEFF6FF), RoundedCornerShape(14.dp))
                            .border(1.dp, Color(0xFFBFDBFE), RoundedCornerShape(14.dp))
                            .padding(14.dp)
                    ) {
                        Text("Mã khôi phục vừa cấp", color = PrimaryBlue, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            recoveryCodes.joinToString("  •  "),
                            color = TextPrimary,
                            fontSize = 13.sp,
                            lineHeight = 20.sp
                        )
                    }
                }
            }

            // Section 2: Mật Khẩu
            Column {
                Text("MẬT KHẨU", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    PrivacyActionRow(
                        icon = Icons.Default.Lock,
                        iconColor = Color(0xFF8B5CF6),
                        title = "Đổi mật khẩu",
                        subtitle = "Cập nhật lần cuối: 2 tháng trước",
                        showDivider = true,
                        onClick = onNavigateToChangePassword
                    )
                    
                    // Password Strength
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Box(
                            modifier = Modifier
                                .padding(top = 4.dp)
                                .size(40.dp)
                                .background(Color(0xFFF97316).copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFF97316), modifier = Modifier.size(20.dp))
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Độ mạnh mật khẩu", color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(8.dp)
                                        .clip(RoundedCornerShape(4.dp))
                                        .background(Border)
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(0.75f)
                                            .fillMaxHeight()
                                            .background(Brush.horizontalGradient(listOf(Color(0xFF10B981), PrimaryTeal)))
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Mạnh", color = Color(0xFF10B981), fontSize = 12.sp, fontWeight = FontWeight.Medium)
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Khuyến nghị đổi mật khẩu mỗi 3 tháng", color = TextSecondary, fontSize = 14.sp)
                        }
                    }
                }
            }

            // Section 3: Quyền Riêng Tư
            Column {
                Text("QUYỀN RIÊNG TƯ", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, modifier = Modifier.padding(start = 8.dp, bottom = 12.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White, RoundedCornerShape(16.dp))
                        .border(1.dp, Border, RoundedCornerShape(16.dp))
                ) {
                    PrivacyActionRow(
                        icon = Icons.Default.Shield,
                        iconColor = Color(0xFF3B82F6),
                        title = "Quyền truy cập dữ liệu",
                        subtitle = "Quản lý ai có thể truy cập hồ sơ",
                        showDivider = true,
                        onClick = onNavigateToDataAccess
                    )
                    PrivacyBadgeRow(
                        icon = Icons.Default.VpnKey,
                        iconColor = PrimaryTeal,
                        title = "Mã hóa dữ liệu",
                        subtitle = "AES-256 end-to-end encryption",
                        badgeText = "Đang bật",
                        badgeColor = Color(0xFF10B981),
                        showDivider = true
                    )
                    PrivacyActionRow(
                        icon = Icons.Default.Visibility,
                        iconColor = Color(0xFFEC4899),
                        title = "Nhật ký truy cập",
                        subtitle = "Xem lịch sử đăng nhập",
                        showDivider = false,
                        onClick = onNavigateToAccessLog
                    )
                }
            }

            // Security note
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFEF3C7), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFFDE68A), RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.padding(top = 2.dp))
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text("Bảo mật dữ liệu y tế", color = Color(0xFF78350F), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Dữ liệu y tế được bảo vệ bằng xác thực Firebase, phân quyền backend và kênh truyền HTTPS. Chứng nhận y tế chính thức sẽ nằm ở giai đoạn triển khai thương mại.",
                        color = Color(0xFF92400E),
                        fontSize = 14.sp,
                        lineHeight = 20.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
fun PrivacyToggleRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
    showDivider: Boolean
) {
    Column(modifier = Modifier.alpha(if (enabled) 1f else 0.55f)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = enabled) { onCheckedChange(!checked) }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = TextSecondary, fontSize = 14.sp)
            }
            Spacer(modifier = Modifier.width(16.dp))
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = Color(0xFF10B981),
                    uncheckedThumbColor = Color.White,
                    uncheckedTrackColor = Color(0xFFE2E8F0)
                )
            )
        }
        if (showDivider) {
            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }
}

@Composable
fun PrivacyActionRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    subtitle: String,
    showDivider: Boolean,
    onClick: () -> Unit = {}
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = TextSecondary, fontSize = 14.sp)
            }
            Spacer(modifier = Modifier.width(16.dp))
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = TextSecondary.copy(alpha = 0.5f))
        }
        if (showDivider) {
            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }
}

@Composable
fun PrivacyBadgeRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    subtitle: String,
    badgeText: String,
    badgeColor: Color,
    showDivider: Boolean
) {
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { }
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = TextSecondary, fontSize = 14.sp)
            }
            Spacer(modifier = Modifier.width(16.dp))
            Box(
                modifier = Modifier
                    .background(badgeColor.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Text(badgeText, color = badgeColor, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }
        }
        if (showDivider) {
            HorizontalDivider(color = Border, modifier = Modifier.padding(horizontal = 16.dp))
        }
    }
}
