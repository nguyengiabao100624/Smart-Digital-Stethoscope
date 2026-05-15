package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.*

@Composable
fun ExportDataScreen(onNavigateBack: () -> Unit) {
    var format by remember { mutableStateOf("pdf") }
    var includeAudio by remember { mutableStateOf(true) }
    var includeReports by remember { mutableStateOf(true) }
    var includeHistory by remember { mutableStateOf(true) }
    var startDate by remember { mutableStateOf("01/01/2026") }
    var endDate by remember { mutableStateOf("13/05/2026") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF9FAFB))
    ) {
        SimpleWhiteHeader(title = "Xuất Dữ Liệu", onNavigateBack = onNavigateBack)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            Text(
                "Trích xuất hồ sơ bệnh án, bản ghi âm và báo cáo phân tích để lưu trữ hoặc chia sẻ với Bác sĩ khác.",
                color = TextSecondary,
                fontSize = 14.sp,
                lineHeight = 20.sp
            )
            Spacer(modifier = Modifier.height(24.dp))

            ExportCard(title = "Phạm vi thời gian") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ReadOnlyDateField(
                        value = startDate,
                        onDateSelected = { startDate = it },
                        modifier = Modifier.weight(1f)
                    )
                    Text("đến", color = TextSecondary, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 10.dp))
                    ReadOnlyDateField(
                        value = endDate,
                        onDateSelected = { endDate = it },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            ExportCard(title = "Loại dữ liệu") {
                ExportCheckboxRow(
                    icon = Icons.Default.TableChart,
                    label = "Lịch sử khám & thông số",
                    checked = includeHistory,
                    onCheckedChange = { includeHistory = it }
                )
                ExportCheckboxRow(
                    icon = Icons.Default.Description,
                    label = "Báo cáo phân tích AI",
                    checked = includeReports,
                    onCheckedChange = { includeReports = it }
                )
                ExportCheckboxRow(
                    icon = Icons.Default.AudioFile,
                    label = "Bản ghi âm thanh gốc (.wav)",
                    checked = includeAudio,
                    onCheckedChange = { includeAudio = it }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            ExportCard(title = "Định dạng tập tin") {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    ExportFormatButton(
                        label = "PDF + WAV",
                        selected = format == "pdf",
                        onClick = { format = "pdf" },
                        modifier = Modifier.weight(1f)
                    )
                    ExportFormatButton(
                        label = "Nén ZIP",
                        selected = format == "zip",
                        onClick = { format = "zip" },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
            Button(
                onClick = { },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryBlue)
            ) {
                Icon(Icons.Default.Download, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Tạo bản xuất dữ liệu", fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun ExportCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White, RoundedCornerShape(16.dp))
            .border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(16.dp))
            .padding(16.dp)
    ) {
        Text(title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Spacer(modifier = Modifier.height(12.dp))
        content()
    }
}

@Composable
private fun ReadOnlyDateField(
    value: String,
    onDateSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    SelectableDateField(
        value = value,
        onDateSelected = onDateSelected,
        modifier = modifier,
        placeholder = "dd/MM/yyyy",
        height = 40.dp,
        shape = RoundedCornerShape(10.dp),
        containerColor = Color(0xFFF9FAFB),
        horizontalPadding = 10.dp,
        fontSize = 13.sp,
        iconSize = 16.dp,
        textFontWeight = FontWeight.Medium
    )
}

@Composable
private fun ExportCheckboxRow(
    icon: ImageVector,
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = CheckboxDefaults.colors(
                checkedColor = PrimaryBlue,
                uncheckedColor = Color(0xFFD1D5DB)
            )
        )
        Icon(icon, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Text(label, color = Color(0xFF374151), fontSize = 14.sp)
    }
}

@Composable
private fun ExportFormatButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .height(52.dp)
            .background(if (selected) Color(0xFFEFF6FF) else Color.White, RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (selected) PrimaryBlue else Color(0xFFE5E7EB),
                RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            color = if (selected) PrimaryBlue else TextSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )
    }
}
