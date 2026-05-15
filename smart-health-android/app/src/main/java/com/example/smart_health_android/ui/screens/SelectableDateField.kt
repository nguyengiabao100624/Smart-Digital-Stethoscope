package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.Border
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.TextPrimary
import com.example.smart_health_android.ui.theme.TextSecondary
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val displayDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.getDefault())

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectableDateField(
    value: String,
    onDateSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Ngày (dd/MM/yyyy)",
    height: Dp = 56.dp,
    shape: RoundedCornerShape = RoundedCornerShape(12.dp),
    containerColor: Color = Color.Transparent,
    horizontalPadding: Dp = 14.dp,
    fontSize: TextUnit = 14.sp,
    iconSize: Dp = 20.dp,
    textFontWeight: FontWeight = FontWeight.Normal
) {
    var showPicker by remember { mutableStateOf(false) }
    val initialDateMillis = remember(value) { value.toDatePickerMillis() ?: todayDatePickerMillis() }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .clip(shape)
            .background(containerColor)
            .border(1.dp, if (showPicker) PrimaryBlue else Border, shape)
            .clickable { showPicker = true }
            .padding(horizontal = horizontalPadding),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            Icons.Default.DateRange,
            contentDescription = null,
            tint = TextSecondary,
            modifier = Modifier.size(iconSize)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = value.ifBlank { placeholder },
            color = if (value.isBlank()) TextSecondary else TextPrimary,
            fontSize = fontSize,
            fontWeight = textFontWeight
        )
    }

    if (showPicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = initialDateMillis,
            initialDisplayedMonthMillis = initialDateMillis
        )

        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        val selectedMillis = datePickerState.selectedDateMillis ?: initialDateMillis
                        onDateSelected(selectedMillis.formatDatePickerMillis())
                        showPicker = false
                    }
                ) {
                    Text("Chọn")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text("Hủy")
                }
            }
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

private fun String.toDatePickerMillis(): Long? {
    return runCatching {
        LocalDate.parse(this, displayDateFormatter)
            .atStartOfDay(ZoneOffset.UTC)
            .toInstant()
            .toEpochMilli()
    }.getOrNull()
}

private fun Long.formatDatePickerMillis(): String {
    return Instant.ofEpochMilli(this)
        .atZone(ZoneOffset.UTC)
        .toLocalDate()
        .format(displayDateFormatter)
}

private fun todayDatePickerMillis(): Long {
    return LocalDate.now(ZoneId.systemDefault())
        .atStartOfDay(ZoneOffset.UTC)
        .toInstant()
        .toEpochMilli()
}
