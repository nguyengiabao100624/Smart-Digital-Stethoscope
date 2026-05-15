package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun ChangePasswordScreen(onNavigateBack: () -> Unit) {
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var showCurrent by remember { mutableStateOf(false) }
    var showNew by remember { mutableStateOf(false) }
    var showConfirm by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Đổi Mật Khẩu", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFEFF6FF), RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFDBEAFE), RoundedCornerShape(16.dp))
                    .padding(16.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(
                    Icons.Default.Shield,
                    contentDescription = null,
                    tint = PrimaryBlue,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        "Bảo mật tài khoản y tế",
                        color = PrimaryBlue,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "Mật khẩu cần tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường và số để đảm bảo an toàn cho dữ liệu bệnh nhân.",
                        color = TextSecondary,
                        fontSize = 12.sp,
                        lineHeight = 18.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            PasswordInput(
                label = "Mật khẩu hiện tại",
                placeholder = "Nhập mật khẩu hiện tại",
                value = currentPassword,
                onValueChange = { currentPassword = it },
                visible = showCurrent,
                onToggleVisible = { showCurrent = !showCurrent }
            )
            Spacer(modifier = Modifier.height(16.dp))
            PasswordInput(
                label = "Mật khẩu mới",
                placeholder = "Nhập mật khẩu mới",
                value = newPassword,
                onValueChange = { newPassword = it },
                visible = showNew,
                onToggleVisible = { showNew = !showNew }
            )
            Spacer(modifier = Modifier.height(16.dp))
            PasswordInput(
                label = "Xác nhận mật khẩu mới",
                placeholder = "Nhập lại mật khẩu mới",
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                visible = showConfirm,
                onToggleVisible = { showConfirm = !showConfirm }
            )

            Spacer(modifier = Modifier.height(40.dp))

            Button(
                onClick = { },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
            ) {
                Text("Cập nhật mật khẩu", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
            }

            TextButton(
                onClick = { },
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                Text("Quên mật khẩu hiện tại?", color = PrimaryBlue, fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun PasswordInput(
    label: String,
    placeholder: String,
    value: String,
    onValueChange: (String) -> Unit,
    visible: Boolean,
    onToggleVisible: () -> Unit
) {
    Column {
        Text(
            label,
            color = Color(0xFF374151),
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 6.dp)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(placeholder, color = Color(0xFF9CA3AF), fontSize = 14.sp) },
            leadingIcon = {
                Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFF9CA3AF))
            },
            trailingIcon = {
                IconButton(onClick = onToggleVisible) {
                    Icon(
                        if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = null,
                        tint = Color(0xFF6B7280)
                    )
                }
            },
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryBlue,
                unfocusedBorderColor = Color(0xFFD1D5DB),
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary
            )
        )
    }
}

@Composable
fun SimpleWhiteHeader(title: String, onNavigateBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .border(1.dp, Color(0xFFE5E7EB))
            .statusBarsPadding()
            .padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onNavigateBack) {
            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color(0xFF4B5563))
        }
        Text(title, color = TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}
