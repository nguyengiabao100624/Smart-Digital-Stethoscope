package com.example.smart_health_android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhoneLoginScreen(onNavigateToLogin: () -> Unit, onLoginSuccess: () -> Unit) {
    var step by remember { mutableStateOf("phone") }
    var phone by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var isVerifying by remember { mutableStateOf(false) }
    var isSuccess by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var resendCooldown by remember { mutableIntStateOf(0) }
    val phoneDigits = phone.filter { it.isDigit() }

    LaunchedEffect(resendCooldown) {
        if (resendCooldown > 0) {
            delay(1000)
            resendCooldown -= 1
        }
    }

    LaunchedEffect(otp, step) {
        if (step == "otp" && otp.length == 6 && !isVerifying && !isSuccess) {
            isVerifying = true
            error = ""
            delay(1500)
            if (otp == "123456") {
                isSuccess = true
            } else {
                error = "Mã OTP không chính xác. Vui lòng thử lại."
                otp = ""
            }
            isVerifying = false
        }
    }

    LaunchedEffect(isSuccess) {
        if (isSuccess) {
            delay(1500)
            onLoginSuccess()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(horizontal = 24.dp)
    ) {
        VerificationBackButton(
            backLabel = "Quay lại",
            onNavigateBack = {
                if (step == "otp" && !isSuccess) {
                    step = "phone"
                    otp = ""
                    error = ""
                } else {
                    onNavigateToLogin()
                }
            }
        )

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center
        ) {
            Crossfade(targetState = if (isSuccess) "success" else step) { currentStep ->
                when (currentStep) {
                    "phone" -> PhoneLoginInputStep(
                        phone = phone,
                        onPhoneChange = { phone = it },
                        canSubmit = phoneDigits.length >= 10,
                        onSubmit = {
                            step = "otp"
                            resendCooldown = 60
                            otp = ""
                            error = ""
                        }
                    )

                    "otp" -> PhoneLoginOtpStep(
                        phone = phone,
                        otp = otp,
                        onOtpChange = { otp = it },
                        isVerifying = isVerifying,
                        error = error,
                        resendCooldown = resendCooldown,
                        onResend = {
                            resendCooldown = 60
                            otp = ""
                            error = ""
                        },
                        onChangePhone = {
                            step = "phone"
                            otp = ""
                            error = ""
                        }
                    )

                    else -> VerificationSuccess(
                        title = "Đăng nhập thành công!",
                        subtitle = "Đang chuyển đến trang chính..."
                    )
                }
            }
        }

        VerificationFooter(showConsent = false)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PhoneLoginInputStep(
    phone: String,
    onPhoneChange: (String) -> Unit,
    canSubmit: Boolean,
    onSubmit: () -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Phone, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(32.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text("Đăng nhập bằng SĐT", color = PrimaryBlue, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Nhập số điện thoại để nhận mã xác thực OTP",
            color = TextSecondary,
            fontSize = 14.sp,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        Column(modifier = Modifier.fillMaxWidth()) {
            Text("Số điện thoại", color = TextPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = phone,
                onValueChange = onPhoneChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("0912 345 678", color = TextSecondary.copy(alpha = 0.5f)) },
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
            Text("Vui lòng nhập số điện thoại 10 chữ số", color = TextSecondary, fontSize = 12.sp)
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onSubmit,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = PrimaryBlue,
                disabledContainerColor = Surface,
                disabledContentColor = TextSecondary
            ),
            shape = RoundedCornerShape(12.dp),
            enabled = canSubmit
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Gửi mã OTP", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
            }
        }
    }
}

@Composable
private fun PhoneLoginOtpStep(
    phone: String,
    otp: String,
    onOtpChange: (String) -> Unit,
    isVerifying: Boolean,
    error: String,
    resendCooldown: Int,
    onResend: () -> Unit,
    onChangePhone: () -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Phone, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
        }
        Spacer(modifier = Modifier.height(16.dp))
        Text("Xác thực OTP", color = PrimaryBlue, fontSize = 30.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(8.dp))
        Text("Mã OTP đã được gửi đến số", color = TextSecondary, fontSize = 14.sp, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(4.dp))
        Text(phone, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(32.dp))

        VerificationOtpInput(
            code = otp,
            onCodeChange = onOtpChange,
            enabled = !isVerifying,
            isError = error.isNotBlank()
        )
        VerificationStatusMessages(error = error, isVerifying = isVerifying, loadingText = "Đang xác thực...")
        VerificationTip("Mã OTP demo là 123456")
        Spacer(modifier = Modifier.height(20.dp))
        Text("Không nhận được mã?", color = TextSecondary, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(10.dp))
        VerificationResendButton(
            cooldown = resendCooldown,
            label = "Gửi lại",
            onClick = onResend
        )
        Spacer(modifier = Modifier.height(14.dp))
        Text(
            "Thay đổi số điện thoại",
            color = PrimaryBlue,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.clickable(onClick = onChangePhone)
        )
    }
}
