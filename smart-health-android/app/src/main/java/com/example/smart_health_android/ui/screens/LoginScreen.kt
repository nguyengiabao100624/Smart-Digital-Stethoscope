package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Suppress("UNUSED_PARAMETER")
@Composable
fun LoginScreen(
    onLoginSuccess: (isDoctorMode: Boolean) -> Unit,
    onDoctorApprovalPending: () -> Unit,
    onNavigateToVerifyEmail: (accountType: String) -> Unit,
    onNavigateToSignUp: () -> Unit,
    onNavigateToForgotPassword: () -> Unit,
    onNavigateToPhoneLogin: () -> Unit
) {
    var isDoctorMode by remember { mutableStateOf(true) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var rememberMe by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Spacer(modifier = Modifier.weight(0.5f))
        
        Text(
            text = "Chào mừng trở lại",
            color = PrimaryBlue,
            fontSize = 28.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Text(
            text = "Đăng nhập để tiếp tục",
            color = TextSecondary,
            fontSize = 16.sp,
            modifier = Modifier.padding(bottom = 32.dp)
        )

        // Toggle Bác sĩ / Bệnh nhân
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(4.dp)
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (isDoctorMode) Color.White else Color.Transparent)
                    .clickable { isDoctorMode = true }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Bác sĩ",
                    color = if (isDoctorMode) PrimaryBlue else TextSecondary,
                    fontWeight = FontWeight.Medium
                )
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (!isDoctorMode) Color.White else Color.Transparent)
                    .clickable { isDoctorMode = false }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Bệnh nhân",
                    color = if (!isDoctorMode) PrimaryBlue else TextSecondary,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Input Email
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Địa chỉ Email") },
            placeholder = { Text("email@example.com") },
            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null, tint = TextSecondary) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryBlue,
                unfocusedBorderColor = Border,
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Input Password
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Mật khẩu") },
            placeholder = { Text("Nhập mật khẩu") },
            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = TextSecondary) },
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(
                        if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (showPassword) "Ẩn mật khẩu" else "Hiện mật khẩu",
                        tint = TextSecondary
                    )
                }
            },
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryBlue,
                unfocusedBorderColor = Border,
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = rememberMe,
                    onCheckedChange = { rememberMe = it },
                    colors = CheckboxDefaults.colors(checkedColor = PrimaryBlue)
                )
                Text(text = "Ghi nhớ hệ thống", color = TextSecondary, fontSize = 14.sp)
            }
            Text(
                text = "Quên mật khẩu?",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onNavigateToForgotPassword)
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

        Button(
            onClick = {
                val login = email.trim()
                val currentPassword = password.trim()
                if (login.isBlank() || currentPassword.isBlank()) {
                    errorMessage = "Vui lòng nhập email và mật khẩu"
                    return@Button
                }

                isLoading = true
                errorMessage = null
                coroutineScope.launch {
                    try {
                        FirebaseAuthService.signIn(login, currentPassword)
                        val verifiedEmail = FirebaseAuthService.reloadCurrentUser()
                        if (!verifiedEmail) {
                            PendingRegistrationStore.save(
                                context,
                                PendingRegistration(
                                    accountType = if (isDoctorMode) "doctor" else "patient",
                                    name = "",
                                    email = login,
                                    phone = ""
                                )
                            )
                            onNavigateToVerifyEmail(if (isDoctorMode) "doctor" else "patient")
                            return@launch
                        }

                        val idToken = FirebaseAuthService.getFreshIdToken(forceRefresh = true)
                        val result = SmartHealthRepository.api.authenticateFirebase(idToken)
                        runCatching { SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated() }
                        val isDoctorAccount = result.user.role == "doctor" || result.user.role == "admin"
                        val isPendingDoctorApproval =
                            result.user.requestedRole == "doctor" &&
                                (result.user.roleRequestStatus == "pending" || result.user.roleRequestStatus == "needs_info")
                        if (isDoctorMode && isPendingDoctorApproval) {
                            onDoctorApprovalPending()
                            return@launch
                        }
                        if (isDoctorMode && !isDoctorAccount) {
                            error("Tài khoản này chưa được cấp quyền bác sĩ")
                        }
                        if (!isDoctorMode && result.user.role != "patient") {
                            error("Vui lòng chọn chế độ bác sĩ cho tài khoản này")
                        }
                        onLoginSuccess(isDoctorAccount)
                    } catch (error: Exception) {
                        errorMessage = error.toVietnameseMessage("Không thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại.")
                    } finally {
                        isLoading = false
                    }
                }
            },
            enabled = !isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp)
                )
            } else {
                Text(text = "Đăng nhập", fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("Chưa có tài khoản? ", color = TextSecondary, fontSize = 14.sp)
            Text(
                "Đăng ký ngay",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onNavigateToSignUp)
            )
        }

        Spacer(modifier = Modifier.weight(1f))
        
        Text(
            text = "Smart Health\nTheo dõi và lưu trữ dữ liệu ống nghe thông minh",
            color = TextSecondary,
            fontSize = 12.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(bottom = 16.dp)
        )
    }
}
