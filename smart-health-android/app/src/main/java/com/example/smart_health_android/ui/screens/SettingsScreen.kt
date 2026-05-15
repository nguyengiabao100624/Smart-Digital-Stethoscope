package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToPrivacy: () -> Unit,
    onNavigateToStethoscopeSettings: () -> Unit,
    onNavigateToAICalibration: () -> Unit,
    onNavigateToDataStorage: () -> Unit,
    onNavigateToNotificationSettings: () -> Unit,
    onLogout: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .padding(start = 16.dp, end = 16.dp, top = 48.dp, bottom = 24.dp)
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                    Text("Cài Đặt", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // Profile Card
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp)
                        .background(Color.White.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .background(Color.White, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("NT", color = PrimaryBlue, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.width(16.dp))
                    Column {
                        Text("Nguyễn Tuấn", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        Text("Bác sĩ Tim mạch • ID: 89432", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }

        // Settings Lists
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            SettingsGroup("TÀI KHOẢN") {
                SettingsItem(Icons.Default.Person, "Thông tin cá nhân", Color(0xFF3B82F6), onClick = onNavigateToProfile)
                Divider(color = Border)
                SettingsItem(Icons.Default.Lock, "Bảo mật & Quyền riêng tư", Color(0xFF10B981), onClick = onNavigateToPrivacy)
            }

            Spacer(modifier = Modifier.height(24.dp))

            SettingsGroup("THIẾT BỊ & AI") {
                SettingsItem(Icons.Default.Build, "Cài đặt ống nghe", Color(0xFFA855F7), onClick = onNavigateToStethoscopeSettings)
                Divider(color = Border)
                SettingsItem(Icons.Default.Settings, "Hiệu chuẩn mô hình AI", Color(0xFFF97316), onClick = onNavigateToAICalibration)
                Divider(color = Border)
                SettingsItem(Icons.Default.Share, "Lưu trữ dữ liệu cục bộ", PrimaryBlue, onClick = onNavigateToDataStorage)
            }

            Spacer(modifier = Modifier.height(24.dp))

            SettingsGroup("TÙY CHỌN") {
                SettingsItem(Icons.Default.Notifications, "Thông báo", Color(0xFFEC4899), onClick = onNavigateToNotificationSettings)
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Logout Button
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFFFEF2F2))
                    .border(1.dp, Color(0xFFFEE2E2), RoundedCornerShape(16.dp))
                    .clickable(onClick = onLogout),
                contentAlignment = Alignment.Center
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.ExitToApp, contentDescription = null, tint = ErrorRed)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Đăng Xuất", color = ErrorRed, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

@Composable
fun SettingsGroup(title: String, content: @Composable () -> Unit) {
    Column {
        Text(title, color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 8.dp, bottom = 8.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Color.White)
                .border(1.dp, Border, RoundedCornerShape(16.dp))
        ) {
            content()
        }
    }
}

@Composable
fun SettingsItem(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, tint: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .background(tint.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                    .padding(8.dp)
            ) {
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.width(16.dp))
            Text(title, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        }
        Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = TextSecondary.copy(alpha = 0.5f))
    }
}
