package com.example.smart_health_android.ui.screens

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForgotPasswordScreen(onNavigateToLogin: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }

    LaunchedEffect(sent) {
        if (sent) {
            delay(3000)
            onNavigateToLogin()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(24.dp)
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

        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
            Crossfade(targetState = sent) { isSent ->
                if (!isSent) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .background(PrimaryBlue.copy(alpha = 0.1f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Email, contentDescription = null, tint = PrimaryBlue, modifier = Modifier.size(32.dp))
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Quên mật khẩu?", color = PrimaryBlue, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Nhập địa chỉ email của bạn và chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu", color = TextSecondary, fontSize = 14.sp, textAlign = TextAlign.Center)

                        Spacer(modifier = Modifier.height(32.dp))

                        Column(modifier = Modifier.fillMaxWidth()) {
                            Text("Địa chỉ Email", color = TextPrimary, fontWeight = FontWeight.Medium, fontSize = 14.sp)
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = email,
                                onValueChange = { email = it },
                                modifier = Modifier.fillMaxWidth(),
                                placeholder = { Text("bacsituan@benhvien.com", color = TextSecondary.copy(alpha = 0.5f)) },
                                leadingIcon = { Icon(Icons.Default.Email, contentDescription = null, tint = TextSecondary) },
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

                        Spacer(modifier = Modifier.height(24.dp))

                        Button(
                            onClick = { sent = true },
                            modifier = Modifier.fillMaxWidth().height(56.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Gửi hướng dẫn", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White)
                            }
                        }

                        Spacer(modifier = Modifier.height(24.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                            Text("Nhớ mật khẩu? ", color = TextSecondary, fontSize = 14.sp)
                            Text(
                                "Đăng nhập ngay",
                                color = PrimaryBlue,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.clickable(onClick = onNavigateToLogin)
                            )
                        }
                    }
                } else {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Box(
                            modifier = Modifier
                                .size(80.dp)
                                .background(SuccessGreen.copy(alpha = 0.1f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = SuccessGreen, modifier = Modifier.size(40.dp))
                        }
                        Spacer(modifier = Modifier.height(24.dp))
                        Text("Đã gửi email!", color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Vui lòng kiểm tra hộp thư của bạn tại\n${email}", color = PrimaryBlue, fontSize = 16.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
                        Spacer(modifier = Modifier.height(24.dp))
                        Text("Đang chuyển hướng về trang đăng nhập...", color = TextSecondary, fontSize = 14.sp)
                    }
                }
            }
        }

        Text(
            "Phần Mềm Y Tế v2.1.0\nĐạt Chuẩn HIPAA & Được FDA Cấp Phép",
            color = TextSecondary,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        )
    }
}
