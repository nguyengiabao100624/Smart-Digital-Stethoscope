package com.example.smart_health_android.storage

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.StorageSummary
import com.example.smart_health_android.records.RecordAudioCache
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LocalCacheSummary(
    val fileCount: Int,
    val byteCount: Long,
)

data class DataStorageSnapshot(
    val remote: StorageSummary,
    val localCache: LocalCacheSummary,
)

interface DataStorageRepository {
    suspend fun load(): DataStorageSnapshot
    suspend fun clearLocalCache(): LocalCacheSummary
}

class ApiDataStorageRepository(
    private val api: SmartHealthApi,
) : DataStorageRepository {
    override suspend fun load(): DataStorageSnapshot =
        snapshot(api.getDataSummary())

    override suspend fun clearLocalCache(): LocalCacheSummary {
        val remaining = RecordAudioCache.clear()
        if (remaining.fileCount > 0 || remaining.byteCount > 0L) {
            throw IOException("Không thể xóa toàn bộ tệp tạm trên thiết bị")
        }
        return LocalCacheSummary(
            fileCount = remaining.fileCount,
            byteCount = remaining.byteCount,
        )
    }

    private fun snapshot(remote: StorageSummary): DataStorageSnapshot {
        val local = RecordAudioCache.summary()
        return DataStorageSnapshot(
            remote = remote,
            localCache = LocalCacheSummary(
                fileCount = local.fileCount,
                byteCount = local.byteCount,
            ),
        )
    }
}

enum class DataStorageLoadState {
    Loading,
    Ready,
    Empty,
    PermissionDenied,
    Offline,
    Error,
}

data class DataStorageUiState(
    val loadState: DataStorageLoadState = DataStorageLoadState.Loading,
    val snapshot: DataStorageSnapshot? = null,
    val isRefreshing: Boolean = false,
    val isClearingCache: Boolean = false,
    val isStale: Boolean = false,
    val errorMessage: String? = null,
    val statusMessage: String? = null,
)

sealed interface DataStorageUiAction {
    data object Refresh : DataStorageUiAction
    data object ClearLocalCache : DataStorageUiAction
    data object DismissMessage : DataStorageUiAction
}

class DataStorageViewModel(
    private val repository: DataStorageRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DataStorageUiState())
    val uiState: StateFlow<DataStorageUiState> = _uiState.asStateFlow()

    init {
        refresh(initial = true)
    }

    fun onAction(action: DataStorageUiAction) {
        when (action) {
            DataStorageUiAction.Refresh -> refresh(initial = false)
            DataStorageUiAction.ClearLocalCache -> clearLocalCache()
            DataStorageUiAction.DismissMessage -> _uiState.update {
                it.copy(errorMessage = null, statusMessage = null)
            }
        }
    }

    private fun refresh(initial: Boolean) {
        if (_uiState.value.isRefreshing || _uiState.value.isClearingCache) return
        _uiState.update {
            it.copy(
                loadState = if (initial && it.snapshot == null) {
                    DataStorageLoadState.Loading
                } else {
                    it.loadState
                },
                isRefreshing = !initial,
                errorMessage = null,
                statusMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching { repository.load() }
                .onSuccess { snapshot ->
                    _uiState.value = DataStorageUiState(
                        loadState = snapshot.loadState(),
                        snapshot = snapshot,
                        statusMessage = if (initial) null else "Đã cập nhật số liệu lưu trữ",
                    )
                }
                .onFailure { error ->
                    val previous = _uiState.value.snapshot
                    _uiState.update {
                        if (previous != null) {
                            it.copy(
                                loadState = previous.loadState(),
                                isRefreshing = false,
                                isStale = true,
                                errorMessage = storageErrorMessage(error),
                                statusMessage = null,
                            )
                        } else {
                            it.copy(
                                loadState = storageFailureState(error),
                                isRefreshing = false,
                                isStale = false,
                                errorMessage = storageErrorMessage(error),
                                statusMessage = null,
                            )
                        }
                    }
                }
        }
    }

    private fun clearLocalCache() {
        if (_uiState.value.isClearingCache || _uiState.value.isRefreshing) return
        _uiState.update {
            it.copy(
                isClearingCache = true,
                errorMessage = null,
                statusMessage = null,
            )
        }
        viewModelScope.launch {
            runCatching { repository.clearLocalCache() }
                .onSuccess { localCache ->
                    val currentSnapshot = _uiState.value.snapshot
                    if (currentSnapshot == null) {
                        _uiState.update {
                            it.copy(
                                loadState = DataStorageLoadState.Error,
                                isClearingCache = false,
                                errorMessage = "Không còn số liệu lưu trữ để cập nhật.",
                            )
                        }
                    } else {
                        val updatedSnapshot = currentSnapshot.copy(localCache = localCache)
                        _uiState.value = DataStorageUiState(
                            loadState = updatedSnapshot.loadState(),
                            snapshot = updatedSnapshot,
                            statusMessage = "Đã xóa tệp tạm trên thiết bị",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isClearingCache = false,
                            errorMessage = storageErrorMessage(error),
                            statusMessage = null,
                        )
                    }
                }
        }
    }
}

class DataStorageViewModelFactory : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(DataStorageViewModel::class.java))
        return DataStorageViewModel(
            repository = ApiDataStorageRepository(SmartHealthRepository.api),
        ) as T
    }
}

private fun DataStorageSnapshot.loadState(): DataStorageLoadState =
    if (
        remote.scanCount == 0 &&
        remote.patientCount == 0 &&
        remote.storageFileCount == 0 &&
        localCache.fileCount == 0
    ) {
        DataStorageLoadState.Empty
    } else {
        DataStorageLoadState.Ready
    }

private fun storageFailureState(error: Throwable): DataStorageLoadState = when {
    error is SmartHealthApiException && error.statusCode == 403 ->
        DataStorageLoadState.PermissionDenied
    error is IOException -> DataStorageLoadState.Offline
    else -> DataStorageLoadState.Error
}

private fun storageErrorMessage(error: Throwable): String = when {
    error is SmartHealthApiException && error.statusCode == 403 ->
        "Tài khoản không có quyền xem dữ liệu lưu trữ này."
    error is IOException ->
        "Không thể kết nối để tải số liệu lưu trữ. Hãy kiểm tra mạng rồi thử lại."
    else -> error.message?.takeIf(String::isNotBlank)
        ?: "Không thể tải số liệu lưu trữ."
}
