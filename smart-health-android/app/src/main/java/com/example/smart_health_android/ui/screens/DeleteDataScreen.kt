package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Report
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun DeleteDataScreen(onNavigateBack: () -> Unit) {
    var confirmText by remember { mutableStateOf("") }
    val isConfirmed = confirmText == "XOA DU LIEU"
    val dataItems = listOf(
        "Hồ sơ bệnh án và lịch sử khám",
        "Tất cả bản ghi âm thanh (PCG/Phổi)",
        "Báo cáo phân tích từ AI",
        "Thiết lập thiết bị & thông tin cá nhân"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Xoá Toàn Bộ Dữ Liệu", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(12.dp))
            Box(
                modifier = Modifier.size(64.dp).background(Color(0xFFFEE2E2), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Report, contentDescription = null, tint = ErrorRed, modifier = Modifier.size(32.dp))
            }
            Spacer(modifier = Modifier.height(16.dp))
            Text("Khu Vực Nguy Hiểm", color = TextPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Bạn đang yêu cầu xoá vĩnh viễn toàn bộ dữ liệu. Hành động này không thể hoàn tác.",
                color = TextSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                modifier = Modifier.widthIn(max = 300.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Color(0xFFFECACA), RoundedCornerShape(16.dp))
                    .padding(16.dp)
            ) {
                Text("Dữ liệu sẽ bị xoá vĩnh viễn:", color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.height(12.dp))
                dataItems.forEach { item ->
                    Row(modifier = Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.size(6.dp).background(ErrorRed, CircleShape))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(item, color = TextSecondary, fontSize = 14.sp)
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                HorizontalDivider(color = Color(0xFFF3F4F6))
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "Nhập XOA DU LIEU để xác nhận:",
                    color = TextPrimary,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = confirmText,
                    onValueChange = { confirmText = it },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Nhập vào đây...", color = Color(0xFF9CA3AF)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ErrorRed,
                        unfocusedBorderColor = Color(0xFFD1D5DB),
                        focusedContainerColor = Color(0xFFF9FAFB),
                        unfocusedContainerColor = Color(0xFFF9FAFB),
                        focusedTextColor = TextPrimary,
                        unfocusedTextColor = TextPrimary
                    )
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = { },
                enabled = isConfirmed,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ErrorRed,
                    disabledContainerColor = Color(0xFFE5E7EB),
                    disabledContentColor = Color(0xFF9CA3AF)
                )
            ) {
                Icon(Icons.Default.Delete, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Xoá Toàn Bộ Dữ Liệu", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
