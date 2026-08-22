package com.example.smart_health_android.storage

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.ExportDownloadProgress
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ExportFormat(
    val wireValue: String,
    val contentType: String,
    val extension: String,
) {
    Pdf(
        wireValue = "pdf",
        contentType = "application/pdf",
        extension = "pdf",
    ),
    Csv(
        wireValue = "csv",
        contentType = "text/csv",
        extension = "csv",
    ),
    Xlsx(
        wireValue = "xlsx",
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension = "xlsx",
    ),
    Json(
        wireValue = "json",
        contentType = "application/json",
        extension = "json",
    ),
}

data class ExportDataRequest(
    val format: ExportFormat = ExportFormat.Pdf,
    val includeAudio: Boolean = false,
    val includeReports: Boolean = true,
    val includeHistory: Boolean = true,
    val startDate: String = "",
    val endDate: String = "",
)

data class ExportArtifact(
    val file: File,
    val fileName: String,
    val contentType: String,
    val byteCount: Long,
    val artifactSha256: String,
    val rendererVersion: String,
)

sealed interface ExportProgress {
    data object Creating : ExportProgress

    data class Downloading(
        val bytesDownloaded: Long,
        val totalBytes: Long?,
    ) : ExportProgress
}

interface ExportDataRepository {
    suspend fun createAndDownload(
        request: ExportDataRequest,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        onProgress: (ExportProgress) -> Unit,
    ): ExportArtifact

    fun discard(file: File)
}

class ApiExportDataRepository(
    private val api: SmartHealthApi,
    private val cacheDirectory: File,
) : ExportDataRepository {
    override suspend fun createAndDownload(
        request: ExportDataRequest,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        onProgress: (ExportProgress) -> Unit,
    ): ExportArtifact {
        if (expectedUserId.isBlank() || expectedWorkspaceId.isBlank()) {
            throw IOException("Phiên tài khoản hoặc workspace hiện tại không hợp lệ")
        }
        onProgress(ExportProgress.Creating)
        val job = api.createExport(
            format = request.format.wireValue,
            includeAudio = request.includeAudio,
            includeReports = request.includeReports,
            includeHistory = request.includeHistory,
            startDate = request.startDate,
            endDate = request.endDate,
            idempotencyKey = idempotencyKey,
        )
        if (
            job.id.isBlank() ||
            job.createdByUserId != expectedUserId ||
            job.workspaceId != expectedWorkspaceId ||
            job.organizationId != job.workspaceId ||
            job.dataset != "clinical_bundle" ||
            job.scopeKind !in setOf("personal", "assigned_patients", "workspace") ||
            job.status != "ready" ||
            job.format != request.format.wireValue ||
            job.downloadUrl.isBlank() ||
            job.rendererVersion != EXPECTED_RENDERER_VERSION ||
            job.artifactByteSize == null ||
            job.artifactByteSize !in 1L..MAX_ARTIFACT_BYTES ||
            !job.artifactSha256.matches(SHA256_HEX_REGEX)
        ) {
            throw IOException("Backend trả về bản xuất không khớp tài khoản hoặc workspace hiện tại")
        }
        val destination = createDestination(job.id, request.format)
        val downloaded = api.downloadExport(
            exportJob = job,
            destination = destination,
            onProgress = { progress: ExportDownloadProgress ->
                onProgress(
                    ExportProgress.Downloading(
                        bytesDownloaded = progress.bytesDownloaded,
                        totalBytes = progress.totalBytes,
                    ),
                )
            },
        )
        return ExportArtifact(
            file = downloaded.file,
            fileName = downloaded.fileName,
            contentType = downloaded.contentType,
            byteCount = downloaded.byteCount,
            artifactSha256 = downloaded.artifactSha256,
            rendererVersion = downloaded.rendererVersion,
        )
    }

    override fun discard(file: File) {
        val isOwnedArtifact = runCatching {
            file.parentFile?.canonicalFile == cacheDirectory.canonicalFile
        }.getOrDefault(false)
        if (isOwnedArtifact) {
            runCatching { file.delete() }
        }
    }

    private fun createDestination(exportId: String, format: ExportFormat): File {
        if (!cacheDirectory.exists() && !cacheDirectory.mkdirs()) {
            throw IOException("Không thể tạo bộ nhớ tạm cho bản xuất")
        }
        purgeCache(maxFiles = MAX_CACHE_FILES - 1)
        val safeId = exportId.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80)
        return File(
            cacheDirectory,
            "export-${safeId.ifBlank { UUID.randomUUID().toString() }}.${format.extension}",
        )
    }

    private fun purgeCache(
        nowMillis: Long = System.currentTimeMillis(),
        maxFiles: Int = MAX_CACHE_FILES,
    ) {
        cacheDirectory.listFiles()
            .orEmpty()
            .filter(File::isFile)
            .sortedByDescending(File::lastModified)
            .forEachIndexed { index, file ->
                if (
                    index >= maxFiles ||
                    nowMillis - file.lastModified() > MAX_CACHE_AGE_MILLIS
                ) {
                    file.delete()
                }
            }
    }

    private companion object {
        const val MAX_CACHE_FILES = 4
        const val MAX_CACHE_AGE_MILLIS = 2L * 60L * 60L * 1_000L
        const val MAX_ARTIFACT_BYTES = 100L * 1024L * 1024L
        const val EXPECTED_RENDERER_VERSION = "shcare.export-artifact.v1"
        val SHA256_HEX_REGEX = Regex("^[0-9a-fA-F]{64}$")
    }
}

enum class ExportDataPhase {
    Idle,
    Creating,
    Downloading,
    AwaitingDocument,
    Saved,
    Error,
}

data class ExportDataUiState(
    val request: ExportDataRequest = ExportDataRequest(),
    val phase: ExportDataPhase = ExportDataPhase.Idle,
    val bytesDownloaded: Long = 0L,
    val totalBytes: Long? = null,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
) {
    val busy: Boolean
        get() = phase == ExportDataPhase.Creating || phase == ExportDataPhase.Downloading
}

sealed interface ExportDataUiAction {
    data class FormatChanged(val format: ExportFormat) : ExportDataUiAction
    data class IncludeAudioChanged(val checked: Boolean) : ExportDataUiAction
    data class IncludeReportsChanged(val checked: Boolean) : ExportDataUiAction
    data class IncludeHistoryChanged(val checked: Boolean) : ExportDataUiAction

    data class DateRangeChanged(
        val startDate: String,
        val endDate: String,
    ) : ExportDataUiAction

    data object Submit : ExportDataUiAction
    data object DocumentSaved : ExportDataUiAction
    data object DocumentSaveCancelled : ExportDataUiAction
    data class DocumentSaveFailed(val message: String) : ExportDataUiAction
    data object DismissMessage : ExportDataUiAction
}

sealed interface ExportDataUiEffect {
    data class SaveDocument(
        val file: File,
        val fileName: String,
        val contentType: String,
    ) : ExportDataUiEffect
}

class ExportDataViewModel(
    private val repository: ExportDataRepository,
    private val expectedUserId: String,
    private val expectedWorkspaceId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ExportDataUiState())
    val uiState: StateFlow<ExportDataUiState> = _uiState.asStateFlow()

    private val effectChannel = Channel<ExportDataUiEffect>(Channel.BUFFERED)
    val effects = effectChannel.receiveAsFlow()

    private var intentFingerprint = ""
    private var idempotencyKey = ""
    private var pendingArtifact: ExportArtifact? = null

    fun onAction(action: ExportDataUiAction) {
        when (action) {
            is ExportDataUiAction.FormatChanged -> updateRequest {
                copy(format = action.format)
            }
            is ExportDataUiAction.IncludeAudioChanged -> updateRequest {
                copy(includeAudio = action.checked)
            }
            is ExportDataUiAction.IncludeReportsChanged -> updateRequest {
                copy(includeReports = action.checked)
            }
            is ExportDataUiAction.IncludeHistoryChanged -> updateRequest {
                copy(includeHistory = action.checked)
            }
            is ExportDataUiAction.DateRangeChanged -> updateRequest {
                copy(
                    startDate = action.startDate,
                    endDate = action.endDate,
                )
            }
            ExportDataUiAction.Submit -> submit()
            ExportDataUiAction.DocumentSaved -> finishDocumentSave(
                saved = true,
                message = "Đã lưu bản xuất vào vị trí bạn chọn",
            )
            ExportDataUiAction.DocumentSaveCancelled -> finishDocumentSave(
                saved = false,
                message = "Chưa lưu bản xuất. Bạn có thể tạo lại khi cần.",
            )
            is ExportDataUiAction.DocumentSaveFailed -> finishDocumentSave(
                saved = false,
                message = action.message,
                failed = true,
            )
            ExportDataUiAction.DismissMessage -> _uiState.update {
                it.copy(errorMessage = null, statusMessage = null)
            }
        }
    }

    private fun updateRequest(transform: ExportDataRequest.() -> ExportDataRequest) {
        if (_uiState.value.busy) return
        discardPendingArtifact()
        _uiState.update {
            it.copy(
                request = it.request.transform(),
                phase = ExportDataPhase.Idle,
                bytesDownloaded = 0L,
                totalBytes = null,
                errorMessage = null,
                statusMessage = null,
            )
        }
    }

    private fun submit() {
        val state = _uiState.value
        if (state.busy || state.phase == ExportDataPhase.AwaitingDocument) return
        val validationError = validateRequest(state.request)
        if (validationError != null) {
            _uiState.update {
                it.copy(
                    phase = ExportDataPhase.Error,
                    errorMessage = validationError,
                    statusMessage = null,
                )
            }
            return
        }
        val fingerprint = state.request.toString()
        if (intentFingerprint != fingerprint) {
            intentFingerprint = fingerprint
            idempotencyKey = "android-export-${UUID.randomUUID()}"
        }
        discardPendingArtifact()
        _uiState.update {
            it.copy(
                phase = ExportDataPhase.Creating,
                bytesDownloaded = 0L,
                totalBytes = null,
                errorMessage = null,
                statusMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.createAndDownload(
                    request = state.request,
                    idempotencyKey = idempotencyKey,
                    expectedUserId = expectedUserId,
                    expectedWorkspaceId = expectedWorkspaceId,
                    onProgress = ::onProgress,
                )
            }.onSuccess { artifact ->
                pendingArtifact = artifact
                _uiState.update {
                    it.copy(
                        phase = ExportDataPhase.AwaitingDocument,
                        bytesDownloaded = artifact.byteCount,
                        totalBytes = artifact.byteCount,
                        errorMessage = null,
                        statusMessage = "Bản xuất đã được xác minh. Hãy chọn nơi lưu.",
                    )
                }
                effectChannel.send(
                    ExportDataUiEffect.SaveDocument(
                        file = artifact.file,
                        fileName = artifact.fileName,
                        contentType = artifact.contentType,
                    ),
                )
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        phase = ExportDataPhase.Error,
                        errorMessage = exportErrorMessage(error),
                        statusMessage = null,
                    )
                }
            }
        }
    }

    private fun onProgress(progress: ExportProgress) {
        _uiState.update { state ->
            when (progress) {
                ExportProgress.Creating -> state.copy(
                    phase = ExportDataPhase.Creating,
                    bytesDownloaded = 0L,
                    totalBytes = null,
                )
                is ExportProgress.Downloading -> state.copy(
                    phase = ExportDataPhase.Downloading,
                    bytesDownloaded = progress.bytesDownloaded,
                    totalBytes = progress.totalBytes,
                )
            }
        }
    }

    private fun finishDocumentSave(
        saved: Boolean,
        message: String,
        failed: Boolean = false,
    ) {
        if (_uiState.value.phase != ExportDataPhase.AwaitingDocument) return
        discardPendingArtifact()
        if (saved) {
            intentFingerprint = ""
            idempotencyKey = ""
        }
        _uiState.update {
            it.copy(
                phase = if (saved) ExportDataPhase.Saved else if (failed) {
                    ExportDataPhase.Error
                } else {
                    ExportDataPhase.Idle
                },
                errorMessage = message.takeIf { failed },
                statusMessage = message.takeUnless { failed },
            )
        }
    }

    private fun discardPendingArtifact() {
        pendingArtifact?.file?.let(repository::discard)
        pendingArtifact = null
    }

    override fun onCleared() {
        discardPendingArtifact()
        super.onCleared()
    }
}

class ExportDataViewModelFactory(
    context: Context,
    private val expectedUserId: String,
    private val expectedWorkspaceId: String,
) : ViewModelProvider.Factory {
    private val repository = ApiExportDataRepository(
        api = SmartHealthRepository.api,
        cacheDirectory = File(context.applicationContext.cacheDir, "export-artifacts"),
    )

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(ExportDataViewModel::class.java))
        return ExportDataViewModel(
            repository = repository,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        ) as T
    }
}

private fun validateRequest(request: ExportDataRequest): String? {
    if (!request.includeAudio && !request.includeReports && !request.includeHistory) {
        return "Hãy chọn ít nhất một nhóm dữ liệu."
    }
    if (request.startDate.isBlank() && request.endDate.isBlank()) return null
    if (request.startDate.isBlank() || request.endDate.isBlank()) {
        return "Hãy chọn đủ ngày bắt đầu và ngày kết thúc."
    }
    val datePattern = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    if (!request.startDate.matches(datePattern) || !request.endDate.matches(datePattern)) {
        return "Khoảng ngày không hợp lệ."
    }
    if (request.endDate < request.startDate) {
        return "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu."
    }
    return null
}

private fun exportErrorMessage(error: Throwable): String = when (error) {
    is IOException ->
        "Không thể tạo hoặc tải bản xuất. Hãy kiểm tra mạng và thử lại."
    else -> error.message?.takeIf(String::isNotBlank)
        ?: "Không thể tạo hoặc tải bản xuất."
}
