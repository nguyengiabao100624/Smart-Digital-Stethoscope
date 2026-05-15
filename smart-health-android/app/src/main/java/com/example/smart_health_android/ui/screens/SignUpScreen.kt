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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignUpScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToVerifyEmail: () -> Unit
) {
    var accountType by remember { mutableStateOf("doctor") }
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var license by remember { mutableStateOf("") }
    var hospital by remember { mutableStateOf("") }
    var agreedToTerms by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(24.dp)
            .verticalScroll(rememberScrollState())
    ) {
        // Back Button
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier.clickable(onClick = onNavigateToLogin).padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.ArrowBack, contentDescription = null, tint = PrimaryBlue)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Quay lại", color = PrimaryBlue, fontWeight = FontWeight.Medium)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        
        // Header
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text("Tạo tài khoản mới", color = PrimaryBlue, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text("Điền thông tin để bắt đầu", color = TextSecondary, fontSize = 16.sp)
        }

        Spacer(modifier = Modifier.height(32.dp))

        // Account Type Toggle
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Surface, RoundedCornerShape(12.dp))
                .padding(4.dp)
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (accountType == "doctor") Color.White else Color.Transparent)
                    .clickable { accountType = "doctor" }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("Bác sĩ", color = if (accountType == "doctor") PrimaryBlue else TextSecondary, fontWeight = FontWeight.Medium)
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (accountType == "patient") Color.White else Color.Transparent)
                    .clickable { accountType = "patient" }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center
            ) {
                Text("Bệnh nhân", color = if (accountType == "patient") PrimaryBlue else TextSecondary, fontWeight = FontWeight.Medium)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Form Fields
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // Name
            TextFieldGroup(
                label = "Họ và tên",
                value = name,
                onValueChange = { name = it },
                icon = Icons.Default.Person,
                placeholder = if (accountType == "doctor") "Bs. Nguyễn Văn Tuấn" else "Nguyễn Văn An"
            )

            if (accountType == "doctor") {
                TextFieldGroup(
                    label = "Số chứng chỉ hành nghề",
                    value = license,
                    onValueChange = { license = it },
                    icon = Icons.Default.Info, // Use info as generic id card
                    placeholder = "VD: 123456/BYT-CCHN"
                )
                TextFieldGroup(
                    label = "Cơ sở y tế",
                    value = hospital,
                    onValueChange = { hospital = it },
                    icon = Icons.Default.Home, // Use home as generic building
                    placeholder = "Bệnh viện Đa khoa Trung ương"
                )
            }

            TextFieldGroup(
                label = "Số điện thoại", value = phone, onValueChange = { phone = it },
                icon = Icons.Default.Phone, placeholder = "0912 345 678"
            )

            TextFieldGroup(
                label = "Địa chỉ Email", value = email, onValueChange = { email = it },
                icon = Icons.Default.Email, placeholder = if (accountType == "doctor") "bacsituan@benhvien.com" else "nguyenvana@gmail.com"
            )

            TextFieldGroup(
                label = "Mật khẩu", value = password, onValueChange = { password = it },
                icon = Icons.Default.Lock, placeholder = "Tối thiểu 8 ký tự", isPassword = true
            )

            TextFieldGroup(
                label = "Xác nhận mật khẩu", value = confirmPassword, onValueChange = { confirmPassword = it },
                icon = Icons.Default.Lock, placeholder = "Nhập lại mật khẩu", isPassword = true
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Terms Checkbox
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(
                checked = agreedToTerms,
                onCheckedChange = { agreedToTerms = it },
                colors = CheckboxDefaults.colors(checkedColor = PrimaryBlue)
            )
            Text("Tôi đồng ý với Điều khoản sử dụng và Chính sách bảo mật", color = TextSecondary, fontSize = 14.sp)
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Submit Button
        Button(
            onClick = onNavigateToVerifyEmail,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Đăng Ký", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
        }

        Spacer(modifier = Modifier.height(24.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("Đã có tài khoản? ", color = TextSecondary, fontSize = 14.sp)
            Text(
                "Đăng nhập ngay",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onNavigateToLogin)
            )
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        Text(
            "Phần Mềm Y Tế v2.1.0\nĐạt Chuẩn HIPAA & Được FDA Cấp Phép",
            color = TextSecondary,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TextFieldGroup(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    placeholder: String,
    isPassword: Boolean = false
) {
    Column {
        Text(label, color = TextPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(placeholder, color = TextSecondary.copy(alpha = 0.5f)) },
            leadingIcon = { Icon(icon, contentDescription = null, tint = TextSecondary) },
            visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryBlue,
                unfocusedBorderColor = Border,
                focusedContainerColor = Color.White,
                unfocusedContainerColor = Color.White
            ),
            singleLine = true
        )
    }
}
