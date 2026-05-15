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
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    onLoginSuccess: (isDoctorMode: Boolean) -> Unit,
    onNavigateToSignUp: () -> Unit,
    onNavigateToForgotPassword: () -> Unit,
    onNavigateToPhoneLogin: () -> Unit
) {
    var isDoctorMode by remember { mutableStateOf(true) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var rememberMe by remember { mutableStateOf(false) }

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
            placeholder = { Text(if (isDoctorMode) "bacsytuan@benhvien.com" else "nguyenvana@gmail.com") },
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

        Button(
            onClick = { onLoginSuccess(isDoctorMode) },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
        ) {
            Text(text = "Đăng Nhập", fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(16.dp))
        
        Button(
            onClick = onNavigateToPhoneLogin,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Surface),
            border = androidx.compose.foundation.BorderStroke(1.dp, Border)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Phone, contentDescription = null, tint = TextPrimary)
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "Đăng nhập bằng điện thoại", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
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
            text = "Phần Mềm Y Tế v2.1.0\nĐạt Chuẩn HIPAA & Được FDA Cấp Phép",
            color = TextSecondary,
            fontSize = 12.sp,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(bottom = 16.dp)
        )
    }
}
