package com.example.smart_health_android.ui.screens

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smart_health_android.R
import com.example.smart_health_android.storage.ExportDataPhase
import com.example.smart_health_android.storage.ExportDataUiAction
import com.example.smart_health_android.storage.ExportDataUiEffect
import com.example.smart_health_android.storage.ExportDataViewModel
import com.example.smart_health_android.storage.ExportDataViewModelFactory
import com.example.smart_health_android.storage.ExportFormat
import com.example.smart_health_android.ui.components.ShcareSettingsHeader
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
fun ExportDataScreen(
    onNavigateBack: () -> Unit,
    expectedUserId: String,
    expectedWorkspaceId: String,
    modifier: Modifier = Modifier,
    viewModel: ExportDataViewModel = viewModel(
        factory = ExportDataViewModelFactory(
            context = LocalContext.current,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        ),
    ),
) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var pendingDocument by remember {
        mutableStateOf<ExportDataUiEffect.SaveDocument?>(null)
    }
    var pendingTarget by remember {
        mutableStateOf<Pair<ExportDataUiEffect.SaveDocument, Uri>?>(null)
    }
    val handleDocumentResult: (Uri?) -> Unit = { uri ->
        val artifact = pendingDocument
        pendingDocument = null
        if (uri == null || artifact == null) {
            viewModel.onAction(ExportDataUiAction.DocumentSaveCancelled)
        } else {
            pendingTarget = artifact to uri
        }
    }
    val pdfDocumentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument(ExportFormat.Pdf.contentType),
        onResult = handleDocumentResult,
    )
    val csvDocumentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument(ExportFormat.Csv.contentType),
        onResult = handleDocumentResult,
    )
    val xlsxDocumentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument(ExportFormat.Xlsx.contentType),
        onResult = handleDocumentResult,
    )
    val jsonDocumentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument(ExportFormat.Json.contentType),
        onResult = handleDocumentResult,
    )

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is ExportDataUiEffect.SaveDocument -> {
                    pendingDocument = effect
                    when (effect.contentType) {
                        ExportFormat.Pdf.contentType ->
                            pdfDocumentLauncher.launch(effect.fileName)
                        ExportFormat.Csv.contentType ->
                            csvDocumentLauncher.launch(effect.fileName)
                        ExportFormat.Xlsx.contentType ->
                            xlsxDocumentLauncher.launch(effect.fileName)
                        ExportFormat.Json.contentType ->
                            jsonDocumentLauncher.launch(effect.fileName)
                        else -> {
                            pendingDocument = null
                            viewModel.onAction(
                                ExportDataUiAction.DocumentSaveFailed(
                                    "Định dạng bản xuất không được Android hỗ trợ.",
                                ),
                            )
                        }
                    }
                }
            }
        }
    }

    LaunchedEffect(pendingTarget) {
        val (artifact, uri) = pendingTarget ?: return@LaunchedEffect
        pendingTarget = null
        runCatching {
            copyExportToDocument(
                context = context,
                source = artifact.file,
                destination = uri,
            )
        }.onSuccess {
            viewModel.onAction(ExportDataUiAction.DocumentSaved)
        }.onFailure { error ->
            viewModel.onAction(
                ExportDataUiAction.DocumentSaveFailed(
                    error.message?.takeIf(String::isNotBlank)
                        ?: "Không thể lưu tệp vào vị trí đã chọn.",
                ),
            )
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .testTag("export-data-screen"),
    ) {
        ShcareSettingsHeader(
            title = stringResource(R.string.export_data_title),
            onNavigateBack = onNavigateBack,
        )
        ExportDataContent(
            state = state,
            onAction = viewModel::onAction,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExportDataContent(
    state: com.example.smart_health_android.storage.ExportDataUiState,
    onAction: (ExportDataUiAction) -> Unit,
) {
    val semanticColors = ShcareTheme.colors
    var dateTarget by remember { mutableStateOf<DateTarget?>(null) }
    val selectedDate = when (dateTarget) {
        DateTarget.Start -> state.request.startDate
        DateTarget.End -> state.request.endDate
        null -> ""
    }
    val datePickerState = key(dateTarget, selectedDate) {
        rememberDatePickerState(
            initialSelectedDateMillis = selectedDate
                .takeIf(String::isNotBlank)
                ?.let(::dateToMillis),
        )
    }

    if (dateTarget != null) {
        DatePickerDialog(
            onDismissRequest = { dateTarget = null },
            confirmButton = {
                TextButton(
                    onClick = {
                        val isoDate = datePickerState.selectedDateMillis
                            ?.let(::millisToDate)
                            ?: return@TextButton
                        onAction(
                            ExportDataUiAction.DateRangeChanged(
                                startDate = if (dateTarget == DateTarget.Start) {
                                    isoDate
                                } else {
                                    state.request.startDate
                                },
                                endDate = if (dateTarget == DateTarget.End) {
                                    isoDate
                                } else {
                                    state.request.endDate
                                },
                            ),
                        )
                        dateTarget = null
                    },
                ) {
                    Text("Chọn")
                }
            },
            dismissButton = {
                TextButton(onClick = { dateTarget = null }) {
                    Text("Hủy")
                }
            },
        ) {
            DatePicker(state = datePickerState)
        }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .testTag("export-data-list"),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Text(
                text = stringResource(R.string.export_data_verified_artifact_note),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (!state.errorMessage.isNullOrBlank()) {
            item {
                ExportStatusBanner(
                    message = state.errorMessage,
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    assertive = true,
                )
            }
        }
        if (!state.statusMessage.isNullOrBlank()) {
            item {
                ExportStatusBanner(
                    message = state.statusMessage,
                    containerColor = semanticColors.successContainer,
                    contentColor = semanticColors.onSuccessContainer,
                    assertive = false,
                )
            }
        }
        if (state.phase == ExportDataPhase.Creating) {
            item {
                ExportProgressCard(
                    title = stringResource(R.string.export_data_creating_snapshot),
                    progress = null,
                )
            }
        } else if (state.phase == ExportDataPhase.Downloading) {
            item {
                val progress = state.totalBytes
                    ?.takeIf { it > 0L }
                    ?.let { state.bytesDownloaded.toFloat() / it.toFloat() }
                    ?.coerceIn(0f, 1f)
                ExportProgressCard(
                    title = stringResource(R.string.export_data_downloading_artifact),
                    progress = progress,
                )
            }
        }
        item {
            SectionTitle("PHẠM VI THỜI GIAN")
        }
        item {
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerLow,
                shape = RoundedCornerShape(16.dp),
            ) {
                BoxWithConstraints(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                ) {
                    val useSingleColumn =
                        maxWidth < 600.dp || LocalDensity.current.fontScale >= 1.5f
                    if (useSingleColumn) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            DateField(
                                label = stringResource(R.string.export_data_from_date),
                                value = state.request.startDate,
                                enabled = !state.busy,
                                onClick = { dateTarget = DateTarget.Start },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            DateField(
                                label = stringResource(R.string.export_data_to_date),
                                value = state.request.endDate,
                                enabled = !state.busy,
                                onClick = { dateTarget = DateTarget.End },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            DateField(
                                label = stringResource(R.string.export_data_from_date),
                                value = state.request.startDate,
                                enabled = !state.busy,
                                onClick = { dateTarget = DateTarget.Start },
                                modifier = Modifier.weight(1f),
                            )
                            DateField(
                                label = stringResource(R.string.export_data_to_date),
                                value = state.request.endDate,
                                enabled = !state.busy,
                                onClick = { dateTarget = DateTarget.End },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
        if (state.request.startDate.isNotBlank() || state.request.endDate.isNotBlank()) {
            item {
                TextButton(
                    onClick = {
                        onAction(ExportDataUiAction.DateRangeChanged("", ""))
                    },
                    enabled = !state.busy,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text("Bỏ lọc ngày")
                }
            }
        }
        item {
            SectionTitle("NHÓM DỮ LIỆU")
        }
        item {
            Surface(
                color = MaterialTheme.colorScheme.surfaceContainerLow,
                shape = RoundedCornerShape(16.dp),
            ) {
                Column {
                    ExportToggleRow(
                        icon = Icons.Default.History,
                        title = stringResource(R.string.export_data_history_and_scans),
                        checked = state.request.includeHistory,
                        enabled = !state.busy,
                        onCheckedChange = {
                            onAction(ExportDataUiAction.IncludeHistoryChanged(it))
                        },
                    )
                    ExportToggleRow(
                        icon = Icons.Default.Description,
                        title = stringResource(R.string.export_data_signal_quality_reports),
                        checked = state.request.includeReports,
                        enabled = !state.busy,
                        onCheckedChange = {
                            onAction(ExportDataUiAction.IncludeReportsChanged(it))
                        },
                    )
                    ExportToggleRow(
                        icon = Icons.Default.AudioFile,
                        title = stringResource(R.string.export_data_authorized_raw_audio),
                        checked = state.request.includeAudio,
                        enabled = !state.busy,
                        onCheckedChange = {
                            onAction(ExportDataUiAction.IncludeAudioChanged(it))
                        },
                    )
                }
            }
        }
        item {
            SectionTitle("ĐỊNH DẠNG")
        }
        item {
            BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
                val useSingleColumn =
                    maxWidth < 360.dp || LocalDensity.current.fontScale >= 1.5f
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (useSingleColumn) {
                        ExportFormat.entries.forEach { format ->
                            ExportFormatChoice(
                                format = format,
                                selected = state.request.format == format,
                                enabled = !state.busy,
                                onClick = {
                                    onAction(ExportDataUiAction.FormatChanged(format))
                                },
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    } else {
                        ExportFormat.entries.chunked(2).forEach { row ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                row.forEach { format ->
                                    ExportFormatChoice(
                                        format = format,
                                        selected = state.request.format == format,
                                        enabled = !state.busy,
                                        onClick = {
                                            onAction(ExportDataUiAction.FormatChanged(format))
                                        },
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                if (row.size == 1) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                }
            }
        }
        item {
            Button(
                onClick = { onAction(ExportDataUiAction.Submit) },
                enabled = !state.busy && state.phase != ExportDataPhase.AwaitingDocument,
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = 52.dp),
            ) {
                if (state.busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Download,
                        contentDescription = null,
                    )
                }
                Spacer(modifier = Modifier.size(8.dp))
                Text(
                    text = if (state.phase == ExportDataPhase.AwaitingDocument) {
                        "Đang chờ vị trí lưu"
                    } else {
                        "Tạo và tải bản xuất"
                    },
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

@Composable
private fun ExportFormatChoice(
    format: ExportFormat,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val resolvedModifier = modifier.defaultMinSize(minHeight = 48.dp)
    if (selected) {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = resolvedModifier,
        ) {
            Text(format.displayName())
        }
    } else {
        FilledTonalButton(
            onClick = onClick,
            enabled = enabled,
            modifier = resolvedModifier,
        ) {
            Text(format.displayName())
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.semantics { heading() },
    )
}

@Composable
private fun DateField(
    label: String,
    value: String,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FilledTonalButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.defaultMinSize(minHeight = 64.dp),
    ) {
        Icon(
            imageVector = Icons.Default.CalendarMonth,
            contentDescription = null,
        )
        Spacer(modifier = Modifier.size(8.dp))
        Column(horizontalAlignment = Alignment.Start) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
            )
            Text(
                text = value.takeIf(String::isNotBlank)?.let(::displayDate) ?: "Tất cả",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun ExportToggleRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = 56.dp)
            .padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
        )
        Spacer(modifier = Modifier.size(12.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Checkbox(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange,
        )
    }
}

@Composable
private fun ExportProgressCard(
    title: String,
    progress: Float?,
) {
    Surface(
        color = ShcareTheme.colors.infoContainer,
        contentColor = ShcareTheme.colors.onInfoContainer,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.semantics {
            liveRegion = LiveRegionMode.Polite
        },
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            if (progress == null) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            } else {
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun ExportStatusBanner(
    message: String,
    containerColor: androidx.compose.ui.graphics.Color,
    contentColor: androidx.compose.ui.graphics.Color,
    assertive: Boolean,
) {
    Surface(
        color = containerColor,
        contentColor = contentColor,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.semantics {
            liveRegion = if (assertive) LiveRegionMode.Assertive else LiveRegionMode.Polite
        },
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(12.dp),
        )
    }
}

internal suspend fun copyExportToDocument(
    context: Context,
    source: java.io.File,
    destination: Uri,
) = withContext(Dispatchers.IO) {
    require(source.isFile && source.length() > 0L) {
        "Bản xuất tạm không còn khả dụng."
    }
    val resolver = context.contentResolver
    val expectedBytes = source.length()
    try {
        val output = resolver.openOutputStream(destination, "w")
            ?: error("Không thể mở vị trí lưu đã chọn.")
        source.inputStream().use { input ->
            output.use { destinationStream ->
                val copiedBytes = input.copyTo(destinationStream, bufferSize = 16 * 1024)
                destinationStream.flush()
                check(copiedBytes == expectedBytes) {
                    "Bản xuất chưa được ghi đầy đủ vào vị trí đã chọn."
                }
            }
        }
    } catch (error: Throwable) {
        runCatching { resolver.delete(destination, null, null) }
        throw error
    }
}

private enum class DateTarget {
    Start,
    End,
}

private fun ExportFormat.displayName(): String = when (this) {
    ExportFormat.Pdf -> "PDF"
    ExportFormat.Csv -> "CSV"
    ExportFormat.Xlsx -> "XLSX"
    ExportFormat.Json -> "JSON"
}

private fun dateToMillis(value: String): Long =
    LocalDate.parse(value)
        .atStartOfDay(ZoneOffset.UTC)
        .toInstant()
        .toEpochMilli()

private fun millisToDate(value: Long): String =
    Instant.ofEpochMilli(value)
        .atZone(ZoneOffset.UTC)
        .toLocalDate()
        .toString()

private fun displayDate(value: String): String =
    LocalDate.parse(value)
        .format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
