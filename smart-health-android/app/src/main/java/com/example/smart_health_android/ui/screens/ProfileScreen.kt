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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    onNavigateToVerifyPhoneSettings: () -> Unit,
    onNavigateToReVerifyContact: (String, String) -> Unit
) {
    var isEditing by remember { mutableStateOf(false) }
    var license by remember { mutableStateOf("123456/BYT-CCHN") }
    var hospital by remember { mutableStateOf("Bệnh viện Đa khoa Trung ương") }
    var department by remember { mutableStateOf("Khoa Tim mạch") }
    var email by remember { mutableStateOf("bacsituan@benhvien.com") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("123 Đường Láng, Đống Đa, Hà Nội") }
    val joinDate = "15/03/2020"
    val originalEmail = "bacsituan@benhvien.com"
    val originalPhone = "0912 345 678"

    fun handleSave() {
        when {
            email != originalEmail -> onNavigateToReVerifyContact("email", email)
            phone.isNotBlank() && phone != originalPhone -> onNavigateToReVerifyContact("phone", phone)
            else -> isEditing = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Gradient Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(PrimaryBlue, PrimaryTeal)))
                .padding(start = 24.dp, end = 24.dp, top = 48.dp, bottom = 48.dp)
        ) {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                        }
                        Text("Thông tin cá nhân", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Box(
                        modifier = Modifier
                            .background(Color.White.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color.White.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .clickable { if (isEditing) handleSave() else isEditing = true }
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                if (isEditing) Icons.Default.Check else Icons.Default.Edit,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(if (isEditing) "Lưu" else "Chỉnh sửa", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(modifier = Modifier.size(96.dp)) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .shadow(8.dp, CircleShape)
                                .clip(CircleShape)
                                .background(Color.White),
                            contentAlignment = Alignment.Center
                        ) {
                            Text("NT", color = PrimaryBlue, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                        }
                        if (isEditing) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(32.dp)
                                    .shadow(4.dp, CircleShape)
                                    .background(Color.White, CircleShape)
                                    .border(2.dp, PrimaryBlue, CircleShape)
                                    .clickable { /* Upload avatar */ },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.PhotoCamera, contentDescription = "Camera", tint = PrimaryBlue, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Nguyễn Tuấn", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text("Bác sĩ Tim mạch • ID: 89432", color = Color.White.copy(alpha = 0.8f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }
        }

        // Scrollable Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .offset(y = (-24).dp)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .shadow(4.dp, RoundedCornerShape(16.dp))
                    .background(Color.White, RoundedCornerShape(16.dp))
                    .border(1.dp, Border, RoundedCornerShape(16.dp))
                    .padding(24.dp)
            ) {
                // Section 1
                Text("THÔNG TIN CHUYÊN MÔN", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(modifier = Modifier.height(16.dp))
                
                ProfileItemRow(
                    icon = Icons.Default.AssignmentInd,
                    iconColor = PrimaryBlue,
                    label = "Số chứng chỉ hành nghề",
                    value = license,
                    isEditing = isEditing,
                    onValueChange = { license = it }
                )
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.Business,
                    iconColor = Color(0xFF8B5CF6),
                    label = "Cơ sở y tế",
                    value = hospital,
                    isEditing = isEditing,
                    onValueChange = { hospital = it }
                )
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.Person,
                    iconColor = Color(0xFF10B981),
                    label = "Khoa",
                    value = department,
                    isEditing = isEditing,
                    onValueChange = { department = it }
                )

                Spacer(modifier = Modifier.height(24.dp))
                HorizontalDivider(color = Border)
                Spacer(modifier = Modifier.height(24.dp))

                // Section 2
                Text("THÔNG TIN LIÊN HỆ", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                Spacer(modifier = Modifier.height(16.dp))
                
                ProfileItemRow(
                    icon = Icons.Default.Email,
                    iconColor = Color(0xFF3B82F6),
                    label = "Email",
                    value = email,
                    isEditing = isEditing,
                    onValueChange = { email = it }
                )
                Spacer(modifier = Modifier.height(16.dp))
                if (phone.isNotBlank()) {
                    ProfileItemRow(
                        icon = Icons.Default.Phone,
                        iconColor = Color(0xFFF97316),
                        label = "Số điện thoại",
                        value = phone,
                        isEditing = isEditing,
                        onValueChange = { phone = it }
                    )
                } else {
                    ProfileAddPhoneRow(onClick = onNavigateToVerifyPhoneSettings)
                }
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.LocationOn,
                    iconColor = Color(0xFFEC4899),
                    label = "Địa chỉ",
                    value = address,
                    isEditing = isEditing,
                    onValueChange = { address = it },
                    isTextArea = true
                )
                Spacer(modifier = Modifier.height(16.dp))
                ProfileItemRow(
                    icon = Icons.Default.DateRange,
                    iconColor = PrimaryTeal,
                    label = "Ngày tham gia",
                    value = joinDate,
                    isEditing = false, // Never edit join date
                    onValueChange = {}
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
fun ProfileAddPhoneRow(onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .background(Color(0xFFF97316).copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFFF97316), modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text("Số điện thoại", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "+ Thêm số điện thoại",
                color = PrimaryBlue,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.clickable(onClick = onClick)
            )
        }
    }
}

@Composable
fun ProfileItemRow(
    icon: ImageVector,
    iconColor: Color,
    label: String,
    value: String,
    isEditing: Boolean,
    onValueChange: (String) -> Unit,
    isTextArea: Boolean = false
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = if (isEditing && isTextArea) Alignment.Top else Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .padding(top = if (isEditing && isTextArea) 8.dp else 0.dp)
                .size(40.dp)
                .background(iconColor.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
            if (isEditing) {
                Spacer(modifier = Modifier.height(4.dp))
                OutlinedTextField(
                    value = value,
                    onValueChange = onValueChange,
                    modifier = if (isTextArea) Modifier.fillMaxWidth().height(80.dp) else Modifier.fillMaxWidth(),
                    textStyle = LocalTextStyle.current.copy(fontSize = 14.sp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        focusedBorderColor = PrimaryBlue,
                        unfocusedBorderColor = Border
                    ),
                    singleLine = !isTextArea,
                    shape = RoundedCornerShape(8.dp)
                )
            } else {
                Spacer(modifier = Modifier.height(4.dp))
                Text(value, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            }
        }
    }
}
