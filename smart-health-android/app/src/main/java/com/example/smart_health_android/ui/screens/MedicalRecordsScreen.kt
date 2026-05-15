package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

data class MedicalRecord(
    val id: String,
    val patientId: String,
    val patientName: String,
    val date: String,
    val time: String,
    val duration: String,
    val type: String, // "heart" or "lung"
    val status: String, // "normal" or "abnormal"
    val diagnosis: String,
    val aiConfidence: Int
)

@Composable
fun MedicalRecordsScreen(onNavigateBack: () -> Unit, onNavigateToDetail: (String) -> Unit) {
    var activeTab by remember { mutableStateOf("recent") }

    val records = listOf(
        MedicalRecord("HS-2845", "BN-2845", "Nguyễn Văn An", "12-05-2026", "14:35", "2:34", "heart", "normal", "Nhịp xoang bình thường", 98),
        MedicalRecord("HS-2844", "BN-2844", "Trần Thị Mai", "12-05-2026", "13:20", "3:12", "lung", "abnormal", "Phát hiện tiếng ran nổ - Đáy phổi trái", 94),
        MedicalRecord("HS-2843", "BN-2843", "Lê Văn Minh", "12-05-2026", "11:45", "2:18", "heart", "normal", "Âm sắc tim bình thường", 99),
        MedicalRecord("HS-2842", "BN-2842", "Phạm Thuỳ Linh", "11-05-2026", "16:20", "4:05", "lung", "abnormal", "Tiếng rít - Cả hai bên phổi", 91),
        MedicalRecord("HS-2841", "BN-2841", "Hoàng Minh Tuấn", "11-05-2026", "15:10", "2:45", "heart", "abnormal", "Âm thổi tim - Mức 2/6", 96),
        MedicalRecord("HS-2840", "BN-2840", "Đặng Mai Phương", "11-05-2026", "14:00", "2:55", "lung", "normal", "Âm thanh nhịp thở rõ ràng", 97)
    )

    val filteredRecords = records.filter {
        when (activeTab) {
            "recent" -> true
            "heart" -> it.type == "heart"
            "lung" -> it.type == "lung"
            "abnormal" -> it.status == "abnormal"
            else -> true
        }
    }

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
                .padding(horizontal = 16.dp, vertical = 16.dp)
                .statusBarsPadding()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack, modifier = Modifier.offset(x = (-12).dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
                Text("Hồ Sơ Bệnh Án", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                IconButton(onClick = { }, modifier = Modifier.offset(x = 12.dp)) {
                    Icon(Icons.Default.FilterList, contentDescription = "Filter", tint = Color.White)
                }
            }
        }

        // Tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterTab(
                text = "Gần đây",
                icon = null,
                isSelected = activeTab == "recent",
                onClick = { activeTab = "recent" }
            )
            FilterTab(
                text = "Đo Tim",
                icon = Icons.Default.Favorite,
                isSelected = activeTab == "heart",
                onClick = { activeTab = "heart" }
            )
            FilterTab(
                text = "Đo Phổi",
                icon = Icons.Default.Air,
                isSelected = activeTab == "lung",
                onClick = { activeTab = "lung" }
            )
            FilterTab(
                text = "Chỉ cảnh báo",
                icon = Icons.Default.Warning,
                isSelected = activeTab == "abnormal",
                onClick = { activeTab = "abnormal" }
            )
        }

        // List
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            filteredRecords.forEach { record ->
                RecordCard(record = record, onClick = { onNavigateToDetail(record.id) })
            }
            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
fun FilterTab(text: String, icon: ImageVector?, isSelected: Boolean, onClick: () -> Unit) {
    val bgColor = if (isSelected) PrimaryBlue else Color.White
    val textColor = if (isSelected) Color.White else TextPrimary
    val borderColor = if (isSelected) Color.Transparent else Border
    val shadow = if (isSelected) 4.dp else 0.dp

    Row(
        modifier = Modifier
            .shadow(shadow, RoundedCornerShape(12.dp))
            .background(bgColor, RoundedCornerShape(12.dp))
            .border(1.dp, borderColor, RoundedCornerShape(12.dp))
            .clickable { onClick() }
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = textColor, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
        }
        Text(text, color = textColor, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun RecordCard(record: MedicalRecord, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Border, RoundedCornerShape(16.dp))
            .clickable { onClick() }
            .padding(16.dp)
    ) {
        // Header row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(record.id, color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .background(
                                if (record.type == "heart") Color(0xFFEF4444).copy(alpha = 0.1f) else Color(0xFF0EA5E9).copy(alpha = 0.1f),
                                RoundedCornerShape(4.dp)
                            )
                            .padding(4.dp)
                    ) {
                        Icon(
                            if (record.type == "heart") Icons.Default.Favorite else Icons.Default.Air,
                            contentDescription = null,
                            tint = if (record.type == "heart") Color(0xFFEF4444) else Color(0xFF0EA5E9),
                            modifier = Modifier.size(12.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(record.patientName, color = TextPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Text(record.patientId, color = TextSecondary, fontSize = 14.sp)
            }
            
            Box(
                modifier = Modifier
                    .background(
                        if (record.status == "normal") Color(0xFF10B981).copy(alpha = 0.1f) else Color(0xFFF59E0B).copy(alpha = 0.1f),
                        RoundedCornerShape(16.dp)
                    )
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (record.status == "normal") Icons.Default.CheckCircle else Icons.Default.Warning,
                        contentDescription = null,
                        tint = if (record.status == "normal") Color(0xFF10B981) else Color(0xFFF59E0B),
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        if (record.status == "normal") "Bình thường" else "Bất thường",
                        color = if (record.status == "normal") Color(0xFF10B981) else Color(0xFFF59E0B),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Diagnosis Box
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFF8FAFC), RoundedCornerShape(12.dp))
                .border(1.dp, Color(0xFFF1F5F9), RoundedCornerShape(12.dp))
                .padding(12.dp)
        ) {
            Text(record.diagnosis, color = TextPrimary.copy(alpha = 0.8f), fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
        
        Spacer(modifier = Modifier.height(12.dp))
        
        // Footer Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${record.date} • ${record.time}", color = TextSecondary, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                Spacer(modifier = Modifier.width(16.dp))
                Text("Thời lượng: ${record.duration}", color = TextSecondary, fontSize = 14.sp)
            }
            Box(
                modifier = Modifier
                    .background(PrimaryBlue.copy(alpha = 0.05f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 4.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("AI:", color = TextSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("${record.aiConfidence}%", color = PrimaryBlue, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
