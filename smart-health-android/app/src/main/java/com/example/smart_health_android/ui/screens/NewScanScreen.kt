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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewScanScreen(onNavigateBack: () -> Unit, onNavigateToMonitoring: () -> Unit) {
    var patientId by remember { mutableStateOf("") }
    var scanType by remember { mutableStateOf("heart") } // "heart" or "lung"
    var date by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

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
                .statusBarsPadding()
                .padding(horizontal = 16.dp, vertical = 16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Text("Tạo Lượt Đo Mới", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Spacer(modifier = Modifier.width(48.dp))
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(24.dp)
        ) {
            Text("THÔNG TIN BỆNH NHÂN", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = patientId,
                onValueChange = { patientId = it },
                placeholder = { Text("Mã bệnh nhân hoặc Họ tên") },
                leadingIcon = { Icon(Icons.Default.Person, contentDescription = null, tint = TextSecondary) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Border
                )
            )
            Spacer(modifier = Modifier.height(12.dp))
            SelectableDateField(
                value = date,
                onDateSelected = { date = it },
                placeholder = "Ngày (dd/MM/yyyy)",
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(24.dp))
            Divider(color = Border)
            Spacer(modifier = Modifier.height(24.dp))

            Text("LOẠI KIỂM TRA", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(modifier = Modifier.height(16.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                // Heart button
                val isHeart = scanType == "heart"
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (isHeart) PrimaryBlue.copy(alpha = 0.05f) else Color.White)
                        .border(2.dp, if (isHeart) PrimaryBlue else Border, RoundedCornerShape(16.dp))
                        .clickable { scanType = "heart" }
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(if (isHeart) PrimaryBlue.copy(alpha = 0.1f) else Surface, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Favorite, contentDescription = null, tint = if (isHeart) PrimaryBlue else TextSecondary, modifier = Modifier.size(24.dp))
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Tim", color = if (isHeart) PrimaryBlue else TextSecondary, fontWeight = FontWeight.SemiBold)
                    }
                }

                // Lung button
                val isLung = scanType == "lung"
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (isLung) PrimaryTeal.copy(alpha = 0.05f) else Color.White)
                        .border(2.dp, if (isLung) PrimaryTeal else Border, RoundedCornerShape(16.dp))
                        .clickable { scanType = "lung" }
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .background(if (isLung) PrimaryTeal.copy(alpha = 0.1f) else Surface, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            // Using Default.Air or a generic icon for stethoscope/lung
                            Icon(Icons.Default.Air, contentDescription = null, tint = if (isLung) PrimaryTeal else TextSecondary, modifier = Modifier.size(24.dp))
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Phổi", color = if (isLung) PrimaryTeal else TextSecondary, fontWeight = FontWeight.SemiBold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            Divider(color = Border)
            Spacer(modifier = Modifier.height(24.dp))

            Text("GHI CHÚ LÂM SÀNG (TÙY CHỌN)", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                placeholder = { Text("Thêm triệu chứng sơ bộ hoặc ghi chú...") },
                leadingIcon = { Icon(Icons.Default.Description, contentDescription = null, tint = TextSecondary) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryBlue,
                    unfocusedBorderColor = Border
                )
            )

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = onNavigateToMonitoring,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .clip(RoundedCornerShape(16.dp)),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent),
                contentPadding = PaddingValues()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Brush.horizontalGradient(listOf(PrimaryBlue, PrimaryTeal))),
                    contentAlignment = Alignment.Center
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Tiếp tục để Theo dõi", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.width(8.dp))
                        Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = Color.White)
                    }
                }
            }
        }
    }
}
