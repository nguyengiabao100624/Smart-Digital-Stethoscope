package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay

@Composable
fun VerifyEmailScreen(
    onNavigateBack: () -> Unit,
    onVerified: () -> Unit,
    email: String = "bacsituan@benhvien.com"
) {
    var code by remember { mutableStateOf("") }
    var isVerifying by remember { mutableStateOf(false) }
    var isVerified by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var resendCooldown by remember { mutableIntStateOf(0) }

    LaunchedEffect(resendCooldown) {
        if (resendCooldown > 0) {
            delay(1000)
            resendCooldown -= 1
        }
    }

    LaunchedEffect(code) {
        if (code.length == 6 && !isVerifying && !isVerified) {
            isVerifying = true
            error = ""
            delay(1500)
            if (code == "123456") {
                isVerified = true
            } else {
                error = "Mã xác thực không chính xác. Vui lòng thử lại."
                code = ""
            }
            isVerifying = false
        }
    }

    LaunchedEffect(isVerified) {
        if (isVerified) {
            delay(1500)
            onVerified()
        }
    }

    VerificationScaffold(
        backLabel = "Quay lại",
        onNavigateBack = onNavigateBack,
        footerShowsConsent = true
    ) {
        VerificationHeroIcon(icon = Icons.Default.Email)
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            "Xác thực Email",
            color = PrimaryBlue,
            fontSize = 30.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Chúng tôi đã gửi mã xác thực 6 chữ số đến địa chỉ email",
            color = TextSecondary,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(email, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(28.dp))

        if (isVerified) {
            VerificationSuccess(
                title = "Xác thực thành công!",
                subtitle = "Đang chuyển đến trang chính..."
            )
        } else {
            VerificationOtpInput(
                code = code,
                onCodeChange = { code = it },
                enabled = !isVerifying,
                isError = error.isNotBlank()
            )
            VerificationStatusMessages(
                error = error,
                isVerifying = isVerifying,
                loadingText = "Đang xác thực..."
            )
            VerificationTip("Mã xác thực demo là 123456")
            Spacer(modifier = Modifier.height(20.dp))
            Text("Không nhận được mã?", color = TextSecondary, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(10.dp))
            VerificationResendButton(
                cooldown = resendCooldown,
                label = "Gửi lại mã",
                onClick = {
                    resendCooldown = 60
                    error = ""
                    code = ""
                }
            )
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                "Thay đổi địa chỉ email",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onNavigateBack)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerifyPhoneSettingsScreen(
    onNavigateBack: () -> Unit,
    onVerified: () -> Unit
) {
    var step by remember { mutableStateOf("input") }
    var phoneNumber by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var isVerifying by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var resendCooldown by remember { mutableIntStateOf(0) }
    val phoneDigits = phoneNumber.filter { it.isDigit() }

    LaunchedEffect(resendCooldown) {
        if (resendCooldown > 0) {
            delay(1000)
            resendCooldown -= 1
        }
    }

    LaunchedEffect(code, step) {
        if (step == "verify" && code.length == 6 && !isVerifying) {
            isVerifying = true
            error = ""
            delay(1500)
            if (code == "123456") {
                step = "success"
            } else {
                error = "Mã xác thực không chính xác. Vui lòng thử lại."
                code = ""
            }
            isVerifying = false
        }
    }

    LaunchedEffect(step) {
        if (step == "success") {
            delay(2000)
            onVerified()
        }
    }

    VerificationScaffold(
        backLabel = "Quay lại hồ sơ",
        onNavigateBack = onNavigateBack
    ) {
        when (step) {
            "input" -> {
                VerificationHeroIcon(icon = Icons.Default.Phone)
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    "Thêm số điện thoại",
                    color = PrimaryBlue,
                    fontSize = 30.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Thêm số điện thoại để tăng cường bảo mật tài khoản",
                    color = TextSecondary,
                    fontSize = 15.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 12.dp)
                )
                Spacer(modifier = Modifier.height(24.dp))
                VerificationNotice(
                    icon = Icons.Default.Security,
                    title = "Tính năng bảo mật",
                    body = "- Xác thực 2 yếu tố (2FA)\n- Khôi phục tài khoản\n- Thông báo qua SMS",
                    background = Color(0xFFEFF6FF),
                    border = Color(0xFFBFDBFE),
                    tint = Color(0xFF2563EB)
                )
                Spacer(modifier = Modifier.height(20.dp))
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text("Số điện thoại", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = phoneNumber,
                        onValueChange = { phoneNumber = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("0912 345 678", color = TextSecondary.copy(alpha = 0.6f)) },
                        leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null, tint = TextSecondary) },
                        shape = RoundedCornerShape(12.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryBlue,
                            unfocusedBorderColor = Border,
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = Color.White
                        ),
                        singleLine = true
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Nhập số điện thoại 10-11 chữ số", color = TextSecondary, fontSize = 12.sp)
                }
                Spacer(modifier = Modifier.height(22.dp))
                Button(
                    onClick = {
                        step = "verify"
                        resendCooldown = 60
                        code = ""
                        error = ""
                    },
                    enabled = phoneDigits.length in 10..11,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PrimaryBlue,
                        disabledContainerColor = Surface,
                        disabledContentColor = TextSecondary
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("Gửi mã xác thực", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }

            "verify" -> {
                VerificationHeroIcon(icon = Icons.Default.Phone)
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    "Xác thực số điện thoại",
                    color = PrimaryBlue,
                    fontSize = 30.sp,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Chúng tôi đã gửi mã xác thực 6 chữ số đến số",
                    color = TextSecondary,
                    fontSize = 15.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 12.dp)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(phoneNumber, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(28.dp))
                VerificationOtpInput(
                    code = code,
                    onCodeChange = { code = it },
                    enabled = !isVerifying,
                    isError = error.isNotBlank()
                )
                VerificationStatusMessages(error = error, isVerifying = isVerifying, loadingText = "Đang xác thực...")
                VerificationTip("Mã xác thực demo là 123456")
                Spacer(modifier = Modifier.height(20.dp))
                Text("Không nhận được mã?", color = TextSecondary, fontSize = 14.sp)
                Spacer(modifier = Modifier.height(10.dp))
                VerificationResendButton(
                    cooldown = resendCooldown,
                    label = "Gửi lại mã",
                    onClick = {
                        resendCooldown = 60
                        code = ""
                        error = ""
                    }
                )
                Spacer(modifier = Modifier.height(14.dp))
                Text(
                    "Thay đổi số điện thoại",
                    color = PrimaryBlue,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable {
                        step = "input"
                        code = ""
                        error = ""
                    }
                )
            }

            else -> {
                VerificationSuccess(
                    title = "Thêm thành công!",
                    subtitle = "Số điện thoại đã được thêm vào tài khoản"
                )
                Spacer(modifier = Modifier.height(20.dp))
                VerificationNotice(
                    icon = Icons.Default.CheckCircle,
                    title = phoneNumber,
                    body = "Đã được liên kết với tài khoản của bạn",
                    background = Color(0xFFF0FDF4),
                    border = Color(0xFFBBF7D0),
                    tint = Color(0xFF16A34A)
                )
            }
        }
    }
}

@Composable
fun ReVerifyContactScreen(
    verificationType: String,
    contact: String,
    onNavigateBack: () -> Unit,
    onVerified: () -> Unit
) {
    val isEmail = verificationType == "email"
    val icon = if (isEmail) Icons.Default.Email else Icons.Default.Phone
    val targetName = if (isEmail) "Email" else "Số điện thoại"
    var code by remember { mutableStateOf("") }
    var isVerifying by remember { mutableStateOf(false) }
    var isVerified by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var resendCooldown by remember { mutableIntStateOf(0) }

    LaunchedEffect(resendCooldown) {
        if (resendCooldown > 0) {
            delay(1000)
            resendCooldown -= 1
        }
    }

    LaunchedEffect(code) {
        if (code.length == 6 && !isVerifying && !isVerified) {
            isVerifying = true
            error = ""
            delay(1500)
            if (code == "123456") {
                isVerified = true
            } else {
                error = "Mã xác thực không chính xác. Vui lòng thử lại."
                code = ""
            }
            isVerifying = false
        }
    }

    LaunchedEffect(isVerified) {
        if (isVerified) {
            delay(1500)
            onVerified()
        }
    }

    VerificationScaffold(
        backLabel = "Quay lại hồ sơ",
        onNavigateBack = onNavigateBack
    ) {
        VerificationHeroIcon(icon = icon)
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            "Xác thực $targetName mới",
            color = PrimaryBlue,
            fontSize = 30.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            if (isEmail) {
                "Chúng tôi đã gửi mã xác thực 6 chữ số đến địa chỉ email mới"
            } else {
                "Chúng tôi đã gửi mã xác thực 6 chữ số đến số điện thoại mới"
            },
            color = TextSecondary,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 12.dp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(contact, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(22.dp))
        VerificationNotice(
            icon = Icons.Default.Warning,
            title = "Lưu ý bảo mật",
            body = "Để bảo vệ tài khoản, vui lòng xác thực ${if (isEmail) "email" else "số điện thoại"} mới trước khi thay đổi được lưu vào hệ thống.",
            background = Color(0xFFFFFBEB),
            border = Color(0xFFFDE68A),
            tint = Color(0xFFD97706)
        )
        Spacer(modifier = Modifier.height(24.dp))

        if (isVerified) {
            VerificationSuccess(
                title = "Xác thực thành công!",
                subtitle = "$targetName đã được cập nhật"
            )
        } else {
            VerificationOtpInput(
                code = code,
                onCodeChange = { code = it },
                enabled = !isVerifying,
                isError = error.isNotBlank()
            )
            VerificationStatusMessages(error = error, isVerifying = isVerifying, loadingText = "Đang xác thực...")
            VerificationTip("Mã xác thực demo là 123456")
            Spacer(modifier = Modifier.height(20.dp))
            Text("Không nhận được mã?", color = TextSecondary, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(10.dp))
            VerificationResendButton(
                cooldown = resendCooldown,
                label = "Gửi lại mã",
                onClick = {
                    resendCooldown = 60
                    code = ""
                    error = ""
                }
            )
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                "Hủy và quay lại",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onNavigateBack)
            )
        }
    }
}

@Composable
internal fun VerificationScaffold(
    backLabel: String,
    onNavigateBack: () -> Unit,
    footerShowsConsent: Boolean = false,
    content: @Composable ColumnScope.() -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(horizontal = 24.dp)
    ) {
        VerificationBackButton(backLabel = backLabel, onNavigateBack = onNavigateBack)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            content = content
        )
        VerificationFooter(showConsent = footerShowsConsent)
    }
}

@Composable
internal fun VerificationBackButton(backLabel: String, onNavigateBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 20.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onNavigateBack)
                .padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.ArrowBack, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(backLabel, color = PrimaryBlue, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
internal fun VerificationHeroIcon(icon: ImageVector) {
    Box(
        modifier = Modifier
            .size(80.dp)
            .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)), CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
    }
}

@Composable
internal fun VerificationOtpInput(
    code: String,
    onCodeChange: (String) -> Unit,
    enabled: Boolean,
    isError: Boolean
) {
    BasicTextField(
        value = code,
        onValueChange = { raw -> onCodeChange(raw.filter { it.isDigit() }.take(6)) },
        modifier = Modifier.fillMaxWidth(),
        enabled = enabled,
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        cursorBrush = SolidColor(Color.Transparent),
        textStyle = LocalTextStyle.current.copy(color = Color.Transparent),
        decorationBox = { innerTextField ->
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val gap = 8.dp
                val boxWidth = ((maxWidth - gap * 5) / 6).coerceAtMost(48.dp)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(gap, Alignment.CenterHorizontally)
                ) {
                    repeat(6) { index ->
                        val digit = code.getOrNull(index)?.toString().orEmpty()
                        val borderColor = when {
                            isError -> ErrorRed
                            digit.isNotEmpty() -> PrimaryBlue
                            else -> Border
                        }
                        val backgroundColor = when {
                            isError -> Color(0xFFFEF2F2)
                            digit.isNotEmpty() -> PrimaryBlue.copy(alpha = 0.06f)
                            else -> Color.White
                        }
                        Box(
                            modifier = Modifier
                                .width(boxWidth)
                                .height(56.dp)
                                .background(backgroundColor, RoundedCornerShape(12.dp))
                                .border(
                                    width = if (digit.isNotEmpty() || isError) 2.dp else 1.dp,
                                    color = borderColor,
                                    shape = RoundedCornerShape(12.dp)
                                )
                                .alpha(if (enabled) 1f else 0.5f),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(digit, color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Box(modifier = Modifier.size(1.dp).alpha(0f)) {
                    innerTextField()
                }
            }
        }
    )
}

@Composable
internal fun VerificationStatusMessages(error: String, isVerifying: Boolean, loadingText: String) {
    if (error.isNotBlank()) {
        Spacer(modifier = Modifier.height(16.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFFEF2F2), RoundedCornerShape(12.dp))
                .border(1.dp, Color(0xFFFECACA), RoundedCornerShape(12.dp))
                .padding(14.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(error, color = Color(0xFFB91C1C), fontSize = 14.sp, textAlign = TextAlign.Center)
        }
    }
    if (isVerifying) {
        Spacer(modifier = Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = PrimaryBlue,
                strokeWidth = 2.dp
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(loadingText, color = PrimaryBlue, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
    }
    Spacer(modifier = Modifier.height(16.dp))
}

@Composable
internal fun VerificationTip(message: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFFEFF6FF), RoundedCornerShape(12.dp))
            .border(1.dp, Color(0xFFBFDBFE), RoundedCornerShape(12.dp))
            .padding(14.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFF1D4ED8), modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(message, color = Color(0xFF1E40AF), fontSize = 14.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable
internal fun VerificationResendButton(cooldown: Int, label: String, onClick: () -> Unit) {
    val disabled = cooldown > 0
    val foreground = if (disabled) TextSecondary else PrimaryBlue
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(if (disabled) Surface else PrimaryBlue.copy(alpha = 0.1f))
            .clickable(enabled = !disabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Refresh, contentDescription = null, tint = foreground, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                if (disabled) "Gửi lại sau ${cooldown}s" else label,
                color = foreground,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
internal fun VerificationSuccess(title: String, subtitle: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 28.dp)
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(SuccessGreen, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(48.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            title,
            color = Color(0xFF16A34A),
            fontSize = 24.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            subtitle,
            color = TextSecondary,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
internal fun VerificationNotice(
    icon: ImageVector,
    title: String,
    body: String,
    background: Color,
    border: Color,
    tint: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(12.dp))
            .border(1.dp, border, RoundedCornerShape(12.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.Top
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Column {
            Text(title, color = tint, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(body, color = tint, fontSize = 13.sp, lineHeight = 18.sp)
        }
    }
}

@Composable
internal fun VerificationFooter(showConsent: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp, bottom = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        HorizontalDivider(color = Border)
        Spacer(modifier = Modifier.height(14.dp))
        if (showConsent) {
            Text(
                "Bằng việc xác thực email, bạn xác nhận đồng ý với các điều khoản bảo mật dữ liệu y tế",
                color = TextSecondary,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                lineHeight = 16.sp
            )
            Spacer(modifier = Modifier.height(10.dp))
        }
        Text("Phần Mềm Y Tế v2.1.0", color = TextSecondary, fontSize = 12.sp, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(4.dp))
        Text("Đạt Chuẩn HIPAA & Được FDA Cấp Phép", color = TextSecondary, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}
