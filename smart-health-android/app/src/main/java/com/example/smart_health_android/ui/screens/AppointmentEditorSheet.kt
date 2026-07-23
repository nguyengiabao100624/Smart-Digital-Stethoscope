package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.smart_health_android.R
import com.example.smart_health_android.appointments.AppointmentEditorMode
import com.example.smart_health_android.appointments.AppointmentEditorState
import com.example.smart_health_android.appointments.AppointmentType
import com.example.smart_health_android.appointments.AppointmentUiAction
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AppointmentEditorSheet(
    editor: AppointmentEditorState,
    patients: List<Patient>,
    isSubmitting: Boolean,
    mutationError: String,
    requestId: String,
    onAction: (AppointmentUiAction) -> Unit,
) {
    var patientMenuExpanded by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }
    val spacing = ShcareTheme.spacing
    val selectedPatient = patients.firstOrNull { it.id == editor.patientId }
    val start = remember(editor.startsAt) { editor.startsAt.toZonedDateTimeOrNull() }
    val end = remember(editor.endsAt) { editor.endsAt.toZonedDateTimeOrNull() }
    val durationMinutes = remember(start, end) {
        if (start != null && end != null) {
            Duration.between(start, end).toMinutes().toInt().coerceIn(15, 180)
        } else {
            30
        }
    }

    ModalBottomSheet(
        onDismissRequest = {
            if (!isSubmitting) onAction(AppointmentUiAction.DismissEditor)
        },
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 640.dp)
                .align(Alignment.CenterHorizontally)
                .navigationBarsPadding()
                .imePadding(),
            contentPadding = PaddingValues(
                start = spacing.large,
                top = spacing.small,
                end = spacing.large,
                bottom = spacing.doubleExtraLarge,
            ),
            verticalArrangement = Arrangement.spacedBy(spacing.large),
        ) {
            item {
                Text(
                    text = if (editor.mode == AppointmentEditorMode.Create) {
                        stringResource(R.string.appointment_editor_create_title)
                    } else {
                        stringResource(R.string.appointment_editor_reschedule_title)
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }

            if (editor.mode == AppointmentEditorMode.Create) {
                item {
                    ExposedDropdownMenuBox(
                        expanded = patientMenuExpanded,
                        onExpandedChange = {
                            if (!isSubmitting) patientMenuExpanded = !patientMenuExpanded
                        },
                    ) {
                        OutlinedTextField(
                            value = selectedPatient?.let {
                                listOf(it.name, it.patientCode)
                                    .filter(String::isNotBlank)
                                    .joinToString(" · ")
                            }.orEmpty(),
                            onValueChange = {},
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = !isSubmitting)
                                .fillMaxWidth(),
                            label = { Text(stringResource(R.string.appointment_patient)) },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = patientMenuExpanded)
                            },
                            readOnly = true,
                            enabled = !isSubmitting,
                            isError = editor.fieldErrors.containsKey("patientId"),
                            supportingText = editor.fieldErrors["patientId"]?.let { messageRes ->
                                { Text(stringResource(messageRes)) }
                            },
                        )
                        ExposedDropdownMenu(
                            expanded = patientMenuExpanded,
                            onDismissRequest = { patientMenuExpanded = false },
                        ) {
                            patients.forEach { patient ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            listOf(patient.name, patient.patientCode)
                                                .filter(String::isNotBlank)
                                                .joinToString(" · ")
                                        )
                                    },
                                    onClick = {
                                        patientMenuExpanded = false
                                        onAction(AppointmentUiAction.PatientChanged(patient.id))
                                    },
                                    modifier = Modifier.heightIn(min = 48.dp),
                                )
                            }
                        }
                    }
                }
                item {
                    Text(
                        text = stringResource(R.string.appointment_title_staff),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(spacing.small))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(spacing.small)) {
                        items(AppointmentType.entries.filterNot { it == AppointmentType.Unknown }) { type ->
                            FilterChip(
                                selected = editor.type == type,
                                onClick = { onAction(AppointmentUiAction.TypeChanged(type)) },
                                enabled = !isSubmitting,
                                label = { Text(editorAppointmentTypeLabel(type)) },
                                modifier = Modifier.heightIn(min = 48.dp),
                            )
                        }
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(spacing.small),
                ) {
                    OutlinedButton(
                        onClick = { showDatePicker = true },
                        enabled = !isSubmitting,
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 56.dp),
                    ) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = null)
                        Spacer(Modifier.width(spacing.small))
                        Text(
                            start?.format(appointmentEditorDateFormatter)
                                ?: stringResource(R.string.appointment_select_date)
                        )
                    }
                    OutlinedButton(
                        onClick = { showTimePicker = true },
                        enabled = !isSubmitting,
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 56.dp),
                    ) {
                        Icon(Icons.Default.Schedule, contentDescription = null)
                        Spacer(Modifier.width(spacing.small))
                        Text(
                            start?.format(appointmentEditorTimeFormatter)
                                ?: stringResource(R.string.appointment_select_time)
                        )
                    }
                }
                editor.fieldErrors["startsAt"]?.let { messageRes ->
                    Text(
                        text = stringResource(messageRes),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = spacing.extraSmall),
                    )
                }
            }

            item {
                Text(
                    text = stringResource(R.string.appointment_duration),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(spacing.small))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(spacing.small)) {
                    items(listOf(30, 45, 60)) { minutes ->
                        FilterChip(
                            selected = durationMinutes == minutes,
                            onClick = {
                                val resolvedStart = start ?: return@FilterChip
                                onAction(
                                    AppointmentUiAction.ScheduleChanged(
                                        startsAt = resolvedStart.toInstant().toString(),
                                        endsAt = resolvedStart.plusMinutes(minutes.toLong()).toInstant().toString(),
                                    )
                                )
                            },
                            enabled = !isSubmitting && start != null,
                            label = { Text(stringResource(R.string.appointment_minutes, minutes)) },
                            modifier = Modifier.heightIn(min = 48.dp),
                        )
                    }
                }
                editor.fieldErrors["endsAt"]?.let { messageRes ->
                    Text(
                        text = stringResource(messageRes),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }

            if (editor.mode == AppointmentEditorMode.Create) {
                item {
                    OutlinedTextField(
                        value = editor.reason,
                        onValueChange = { onAction(AppointmentUiAction.ReasonChanged(it)) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.appointment_reason)) },
                        minLines = 2,
                        enabled = !isSubmitting,
                        isError = editor.fieldErrors.containsKey("reason"),
                        supportingText = editor.fieldErrors["reason"]?.let { messageRes ->
                            { Text(stringResource(messageRes)) }
                        },
                    )
                }
                item {
                    OutlinedTextField(
                        value = editor.location,
                        onValueChange = { onAction(AppointmentUiAction.LocationChanged(it)) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.appointment_location)) },
                        singleLine = true,
                        enabled = !isSubmitting,
                    )
                }
                item {
                    OutlinedTextField(
                        value = editor.notes,
                        onValueChange = { onAction(AppointmentUiAction.NotesChanged(it)) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.appointment_notes)) },
                        minLines = 2,
                        enabled = !isSubmitting,
                    )
                }
            }

            if (mutationError.isNotBlank()) {
                item { AppointmentEditorError(mutationError, requestId) }
            }

            item {
                Button(
                    onClick = { onAction(AppointmentUiAction.SubmitEditor) },
                    enabled = !isSubmitting,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 52.dp),
                ) {
                    Text(
                        if (isSubmitting) {
                            stringResource(R.string.appointment_saving)
                        } else {
                            stringResource(R.string.appointment_save)
                        }
                    )
                }
            }
        }
    }

    if (showDatePicker) {
        val selectedMillis = start
            ?.toLocalDate()
            ?.atStartOfDay(ZoneOffset.UTC)
            ?.toInstant()
            ?.toEpochMilli()
        val datePickerState = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = selectedMillis,
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        val dateMillis = datePickerState.selectedDateMillis ?: return@TextButton
                        val date = Instant.ofEpochMilli(dateMillis).atZone(ZoneOffset.UTC).toLocalDate()
                        val time = start?.toLocalTime() ?: LocalTime.of(9, 0)
                        onAction(editorScheduleAction(date, time, durationMinutes))
                        showDatePicker = false
                    },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.appointment_confirm_date))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDatePicker = false },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.appointment_close))
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    if (showTimePicker) {
        val timePickerState = androidx.compose.material3.rememberTimePickerState(
            initialHour = start?.hour ?: 9,
            initialMinute = start?.minute ?: 0,
            is24Hour = true,
        )
        AlertDialog(
            onDismissRequest = { showTimePicker = false },
            title = { Text(stringResource(R.string.appointment_select_time)) },
            text = { TimePicker(state = timePickerState) },
            confirmButton = {
                TextButton(
                    onClick = {
                        val date = start?.toLocalDate() ?: LocalDate.now().plusDays(1)
                        val time = LocalTime.of(timePickerState.hour, timePickerState.minute)
                        onAction(editorScheduleAction(date, time, durationMinutes))
                        showTimePicker = false
                    },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.appointment_confirm_time))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showTimePicker = false },
                    modifier = Modifier.heightIn(min = 48.dp),
                ) {
                    Text(stringResource(R.string.appointment_close))
                }
            },
        )
    }
}

@Composable
internal fun AppointmentCancellationDialog(
    reason: String,
    reasonError: String,
    isSubmitting: Boolean,
    mutationError: String,
    onAction: (AppointmentUiAction) -> Unit,
) {
    AlertDialog(
        onDismissRequest = {
            if (!isSubmitting) onAction(AppointmentUiAction.DismissCancellation)
        },
        title = { Text(stringResource(R.string.appointment_cancel_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.medium)) {
                Text(stringResource(R.string.appointment_cancel_message))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { onAction(AppointmentUiAction.CancellationReasonChanged(it)) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.appointment_cancellation_reason)) },
                    minLines = 2,
                    enabled = !isSubmitting,
                    isError = reasonError.isNotBlank(),
                    supportingText = reasonError.takeIf(String::isNotBlank)?.let { message ->
                        { Text(message) }
                    },
                )
                if (mutationError.isNotBlank()) {
                    Text(
                        text = mutationError,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAction(AppointmentUiAction.ConfirmCancellation) },
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_confirm_cancel))
            }
        },
        dismissButton = {
            TextButton(
                onClick = { onAction(AppointmentUiAction.DismissCancellation) },
                enabled = !isSubmitting,
                modifier = Modifier.heightIn(min = 48.dp),
            ) {
                Text(stringResource(R.string.appointment_keep))
            }
        },
    )
}

@Composable
private fun AppointmentEditorError(message: String, requestId: String) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(
            modifier = Modifier.padding(ShcareTheme.spacing.large),
            verticalArrangement = Arrangement.spacedBy(ShcareTheme.spacing.extraSmall),
        ) {
            Text(
                text = stringResource(R.string.appointment_mutation_error),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(message, style = MaterialTheme.typography.bodyMedium)
            if (requestId.isNotBlank()) {
                Text(
                    stringResource(R.string.appointment_request_id, requestId),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}

@Composable
private fun editorAppointmentTypeLabel(type: AppointmentType): String = when (type) {
    AppointmentType.RemoteConsultation -> stringResource(R.string.appointment_type_remote)
    AppointmentType.ClinicVisit -> stringResource(R.string.appointment_type_clinic)
    AppointmentType.Measurement -> stringResource(R.string.appointment_type_measurement)
    AppointmentType.FollowUp -> stringResource(R.string.appointment_type_follow_up)
    AppointmentType.Unknown -> stringResource(R.string.appointment_type_unknown)
}

private fun editorScheduleAction(
    date: LocalDate,
    time: LocalTime,
    durationMinutes: Int,
): AppointmentUiAction.ScheduleChanged {
    val start = ZonedDateTime.of(date, time, ZoneId.systemDefault())
    return AppointmentUiAction.ScheduleChanged(
        startsAt = start.toInstant().toString(),
        endsAt = start.plusMinutes(durationMinutes.toLong()).toInstant().toString(),
    )
}

private fun String.toZonedDateTimeOrNull(): ZonedDateTime? = runCatching {
    Instant.parse(this).atZone(ZoneId.systemDefault())
}.getOrNull()

private val appointmentEditorDateFormatter = DateTimeFormatter.ofPattern(
    "dd/MM/yyyy",
    Locale.forLanguageTag("vi-VN"),
)
private val appointmentEditorTimeFormatter = DateTimeFormatter.ofPattern(
    "HH:mm",
    Locale.forLanguageTag("vi-VN"),
)
