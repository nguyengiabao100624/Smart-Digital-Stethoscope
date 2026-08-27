package com.example.smart_health_android.security

import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
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
class AccessLogViewModelTest {
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
    fun `initial load exposes backend confirmed access records`() = runTest(dispatcher) {
        val repository = FakeAccessLogRepository(
            results = ArrayDeque(
                listOf(Result.success(listOf(accessRecord("log-1")))),
            ),
        )

        val viewModel = AccessLogViewModel(repository)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(AccessLogLoadState.Content, state.loadState)
        assertEquals(listOf("log-1"), state.records.map(AccessLogRecord::id))
        assertTrue(state.hasLoaded)
        assertFalse(state.isStale)
        assertNull(state.error)
        assertEquals(1, repository.loadCount)
    }

    @Test
    fun `empty backend response has an explicit empty state`() = runTest(dispatcher) {
        val viewModel = AccessLogViewModel(
            FakeAccessLogRepository(
                ArrayDeque(listOf(Result.success(emptyList()))),
            ),
        )
        runCurrent()

        assertEquals(AccessLogLoadState.Empty, viewModel.uiState.value.loadState)
        assertTrue(viewModel.uiState.value.records.isEmpty())
    }

    @Test
    fun `forbidden response is permission denied and preserves request id`() =
        runTest(dispatcher) {
            val viewModel = AccessLogViewModel(
                FakeAccessLogRepository(
                    ArrayDeque(
                        listOf(
                            Result.failure(
                                SmartHealthApiException(
                                    statusCode = 403,
                                    code = "FORBIDDEN",
                                    requestId = "request-403",
                                    message = "forbidden",
                                ),
                            ),
                        ),
                    ),
                ),
            )
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(AccessLogLoadState.PermissionDenied, state.loadState)
            assertEquals(AccessLogError.PermissionDenied, state.error)
            assertEquals("request-403", state.requestId)
        }

    @Test
    fun `network failure has a dedicated offline retry state`() = runTest(dispatcher) {
        val repository = FakeAccessLogRepository(
            ArrayDeque(
                listOf(
                    Result.failure(IOException("offline")),
                    Result.success(listOf(accessRecord("log-2"))),
                ),
            ),
        )
        val viewModel = AccessLogViewModel(repository)
        runCurrent()

        assertEquals(AccessLogLoadState.Offline, viewModel.uiState.value.loadState)

        viewModel.onAction(AccessLogUiAction.Retry)
        runCurrent()

        assertEquals(AccessLogLoadState.Content, viewModel.uiState.value.loadState)
        assertEquals(listOf("log-2"), viewModel.uiState.value.records.map(AccessLogRecord::id))
    }

    @Test
    fun `refresh failure keeps confirmed records and marks content stale`() =
        runTest(dispatcher) {
            val repository = FakeAccessLogRepository(
                ArrayDeque(
                    listOf(
                        Result.success(listOf(accessRecord("log-1"))),
                        Result.failure(IOException("offline")),
                    ),
                ),
            )
            val viewModel = AccessLogViewModel(repository)
            runCurrent()

            viewModel.onAction(AccessLogUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(AccessLogLoadState.Content, state.loadState)
            assertEquals(listOf("log-1"), state.records.map(AccessLogRecord::id))
            assertTrue(state.isStale)
            assertEquals(AccessLogError.Offline, state.error)
        }

    @Test
    fun `successful explicit refresh emits a one shot confirmed effect`() =
        runTest(dispatcher) {
            val repository = FakeAccessLogRepository(
                ArrayDeque(
                    listOf(
                        Result.success(listOf(accessRecord("log-1"))),
                        Result.success(listOf(accessRecord("log-2"))),
                    ),
                ),
            )
            val viewModel = AccessLogViewModel(repository)
            runCurrent()
            val effect = async { viewModel.effects.first() }

            viewModel.onAction(AccessLogUiAction.Refresh)
            runCurrent()

            assertEquals(AccessLogUiEffect.RefreshConfirmed, effect.await())
            assertEquals(listOf("log-2"), viewModel.uiState.value.records.map(AccessLogRecord::id))
        }

    @Test
    fun `repeated actions cannot create overlapping access log requests`() =
        runTest(dispatcher) {
            val repository = BlockingAccessLogRepository()
            val viewModel = AccessLogViewModel(repository)
            runCurrent()

            viewModel.onAction(AccessLogUiAction.Retry)
            viewModel.onAction(AccessLogUiAction.Refresh)
            runCurrent()

            assertEquals(1, repository.loadCount)

            repository.response.complete(listOf(accessRecord("log-1")))
            runCurrent()

            assertEquals(AccessLogLoadState.Content, viewModel.uiState.value.loadState)
        }
}

private class FakeAccessLogRepository(
    private val results: ArrayDeque<Result<List<AccessLogRecord>>>,
) : AccessLogRepository {
    var loadCount = 0
        private set

    override suspend fun load(): List<AccessLogRecord> {
        loadCount += 1
        return results.removeFirst().getOrThrow()
    }
}

private class BlockingAccessLogRepository : AccessLogRepository {
    val response = CompletableDeferred<List<AccessLogRecord>>()
    var loadCount = 0
        private set

    override suspend fun load(): List<AccessLogRecord> {
        loadCount += 1
        return response.await()
    }
}

private fun accessRecord(id: String) = AccessLogRecord(
    id = id,
    action = "Đăng nhập",
    device = "Shcare Android",
    location = "Thành phố Hồ Chí Minh",
    ip = "127.0.0.1",
    severity = AccessLogSeverity.Info,
    createdAt = "2026-07-29T08:00:00Z",
)
