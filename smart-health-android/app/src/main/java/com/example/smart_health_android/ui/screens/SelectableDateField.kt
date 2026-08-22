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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.example.smart_health_android.R
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

private val displayDateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.ROOT)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectableDateField(
    value: String,
    onDateSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    height: Dp? = null,
    shape: Shape? = null,
    containerColor: Color? = null,
    horizontalPadding: Dp? = null,
    fontSize: TextUnit? = null,
    iconSize: Dp? = null,
    textFontWeight: FontWeight = FontWeight.Normal,
    accessibilityLabel: String? = null,
) {
    var showPicker by remember { mutableStateOf(false) }
    val initialDateMillis = remember(value) {
        value.toDatePickerMillis() ?: todayDatePickerMillis()
    }
    val resolvedPlaceholder =
        placeholder ?: stringResource(R.string.selectable_date_placeholder)
    val resolvedHeight = (height ?: 56.dp).coerceAtLeast(48.dp)
    val resolvedShape = shape ?: MaterialTheme.shapes.medium
    val resolvedContainerColor = containerColor ?: MaterialTheme.colorScheme.surface
    val resolvedHorizontalPadding = horizontalPadding ?: ShcareTheme.spacing.large
    val resolvedIconSize = iconSize ?: 20.dp
    val resolvedLabel =
        accessibilityLabel ?: stringResource(R.string.selectable_date_label)
    val resolvedStateDescription = if (value.isBlank()) {
        stringResource(R.string.selectable_date_not_selected)
    } else {
        stringResource(R.string.selectable_date_selected, value)
    }
    val baseTextStyle = MaterialTheme.typography.bodyMedium
    val resolvedTextStyle = if (fontSize == null) {
        baseTextStyle.copy(fontWeight = textFontWeight)
    } else {
        baseTextStyle.copy(
            fontSize = fontSize,
            fontWeight = textFontWeight,
        )
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(resolvedHeight)
            .clip(resolvedShape)
            .background(resolvedContainerColor)
            .border(
                width = 1.dp,
                color = if (showPicker) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.outline
                },
                shape = resolvedShape,
            )
            .clickable(
                role = Role.Button,
                onClick = { showPicker = true },
            )
            .semantics(mergeDescendants = true) {
                contentDescription = resolvedLabel
                stateDescription = resolvedStateDescription
            }
            .padding(horizontal = resolvedHorizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Default.DateRange,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(resolvedIconSize),
        )
        Spacer(modifier = Modifier.width(ShcareTheme.spacing.small))
        Text(
            text = value.ifBlank { resolvedPlaceholder },
            color = if (value.isBlank()) {
                MaterialTheme.colorScheme.onSurfaceVariant
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            style = resolvedTextStyle,
        )
    }

    if (showPicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = initialDateMillis,
            initialDisplayedMonthMillis = initialDateMillis,
        )

        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        val selectedMillis =
                            datePickerState.selectedDateMillis ?: initialDateMillis
                        onDateSelected(selectedMillis.formatDatePickerMillis())
                        showPicker = false
                    },
                ) {
                    Text(stringResource(R.string.selectable_date_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text(stringResource(R.string.selectable_date_dismiss))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }
}

private fun String.toDatePickerMillis(): Long? =
    runCatching {
        LocalDate.parse(this, displayDateFormatter)
            .atStartOfDay(ZoneOffset.UTC)
            .toInstant()
            .toEpochMilli()
    }.getOrNull()

private fun Long.formatDatePickerMillis(): String =
    Instant.ofEpochMilli(this)
        .atZone(ZoneOffset.UTC)
        .toLocalDate()
        .format(displayDateFormatter)

private fun todayDatePickerMillis(): Long =
    LocalDate.now(ZoneId.systemDefault())
        .atStartOfDay(ZoneOffset.UTC)
        .toInstant()
        .toEpochMilli()
