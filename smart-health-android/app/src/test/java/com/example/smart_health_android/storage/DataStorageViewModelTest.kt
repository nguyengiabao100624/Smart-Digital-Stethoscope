package com.example.smart_health_android.storage

import com.example.smart_health_android.data.StorageSummary
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DataStorageViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial load exposes backend data and measured private cache`() = runTest(dispatcher) {
        val repository = FakeDataStorageRepository(
            loads = ArrayDeque(
                listOf(
                    Result.success(
                        snapshot(
                            scanCount = 3,
                            cloudBytes = 12_345L,
                            cacheBytes = 2_048L,
                        ),
                    ),
                ),
            ),
        )

        val viewModel = DataStorageViewModel(repository)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(DataStorageLoadState.Ready, state.loadState)
        assertEquals(12_345L, state.snapshot?.remote?.cloudUsedBytes)
        assertEquals(2_048L, state.snapshot?.localCache?.byteCount)
        assertFalse(state.isStale)
        assertNull(state.errorMessage)
    }

    @Test
    fun `clear cache succeeds only with the repository-confirmed empty cache`() = runTest(dispatcher) {
        val repository = FakeDataStorageRepository(
            loads = ArrayDeque(
                listOf(
                    Result.success(snapshot(scanCount = 1, cacheBytes = 1_024L)),
                ),
            ),
            clearResults = ArrayDeque(
                listOf(
                    Result.success(LocalCacheSummary(fileCount = 0, byteCount = 0L)),
                ),
            ),
        )
        val viewModel = DataStorageViewModel(repository)
        runCurrent()

        viewModel.onAction(DataStorageUiAction.ClearLocalCache)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(0L, state.snapshot?.localCache?.byteCount)
        assertEquals(1, repository.clearCalls)
        assertTrue(state.statusMessage?.isNotBlank() == true)
        assertFalse(state.isClearingCache)
    }

    @Test
    fun `refresh failure retains confirmed values and marks them stale`() = runTest(dispatcher) {
        val repository = FakeDataStorageRepository(
            loads = ArrayDeque(
                listOf(
                    Result.success(snapshot(scanCount = 2, cloudBytes = 4_096L)),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = DataStorageViewModel(repository)
        runCurrent()

        viewModel.onAction(DataStorageUiAction.Refresh)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(DataStorageLoadState.Ready, state.loadState)
        assertEquals(4_096L, state.snapshot?.remote?.cloudUsedBytes)
        assertTrue(state.isStale)
        assertTrue(state.errorMessage?.isNotBlank() == true)
        assertNull(state.statusMessage)
    }
}

private fun snapshot(
    scanCount: Int,
    cloudBytes: Long = 0L,
    cacheBytes: Long = 0L,
) = DataStorageSnapshot(
    remote = StorageSummary(
        scanCount = scanCount,
        cloudUsedBytes = cloudBytes,
    ),
    localCache = LocalCacheSummary(
        fileCount = if (cacheBytes > 0L) 1 else 0,
        byteCount = cacheBytes,
    ),
)

private class FakeDataStorageRepository(
    private val loads: ArrayDeque<Result<DataStorageSnapshot>>,
    private val clearResults: ArrayDeque<Result<LocalCacheSummary>> = ArrayDeque(),
) : DataStorageRepository {
    var clearCalls = 0

    override suspend fun load(): DataStorageSnapshot =
        loads.removeFirst().getOrThrow()

    override suspend fun clearLocalCache(): LocalCacheSummary {
        clearCalls += 1
        return clearResults.removeFirst().getOrThrow()
    }
}
