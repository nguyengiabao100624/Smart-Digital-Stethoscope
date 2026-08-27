package com.example.smart_health_android.clinical.alerts

import com.example.smart_health_android.data.ClinicalAlert
import com.example.smart_health_android.data.ClinicalAlertList
import com.example.smart_health_android.data.ClinicalAlertStatus
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
class ClinicalAlertsViewModelTest {
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
    fun `initial load exposes the workspace ledger and current selection`() = runTest(dispatcher) {
        val repository = FakeClinicalAlertsRepository(
            loads = ArrayDeque(
                listOf(Result.success(alertList())),
            ),
        )

        val viewModel = ClinicalAlertsViewModel(
            repository = repository,
            expectedWorkspaceId = "workspace-1",
            canManage = true,
            idempotencyKeyFactory = { "unused" },
        )
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(ClinicalAlertsLoadState.Content, state.loadState)
        assertEquals(listOf("alert-1"), state.alerts.map(ClinicalAlert::id))
        assertEquals("alert-1", state.selectedAlertId)
        assertEquals(listOf(ClinicalAlertFilter.Open), repository.filters)
    }

    @Test
    fun `read-only authority cannot create a local mutation intent`() = runTest(dispatcher) {
        val repository = FakeClinicalAlertsRepository(
            loads = ArrayDeque(listOf(Result.success(alertList()))),
        )
        val viewModel = ClinicalAlertsViewModel(
            repository = repository,
            expectedWorkspaceId = "workspace-1",
            canManage = false,
        )
        runCurrent()

        viewModel.onAction(
            ClinicalAlertsUiAction.RequestTransition(
                alertId = "alert-1",
                action = ClinicalAlertAction.Acknowledge,
            ),
        )

        assertNull(viewModel.uiState.value.pendingTransition)
        assertEquals(0, repository.transitionCalls.size)
    }

    @Test
    fun `resolve validates the note before calling the backend`() = runTest(dispatcher) {
        val repository = FakeClinicalAlertsRepository(
            loads = ArrayDeque(listOf(Result.success(alertList()))),
        )
        val viewModel = ClinicalAlertsViewModel(
            repository = repository,
            expectedWorkspaceId = "workspace-1",
            canManage = true,
            idempotencyKeyFactory = { "resolve-key" },
        )
        runCurrent()

        viewModel.onAction(
            ClinicalAlertsUiAction.RequestTransition(
                alertId = "alert-1",
                action = ClinicalAlertAction.Resolve,
            ),
        )
        viewModel.onAction(ClinicalAlertsUiAction.ConfirmTransition)

        assertEquals(
            ClinicalAlertValidationError.ResolutionNoteRequired,
            viewModel.uiState.value.pendingTransition?.validationError,
        )
        assertEquals(0, repository.transitionCalls.size)
    }

    @Test
    fun `ambiguous retry reuses one idempotency key and confirms only backend state`() =
        runTest(dispatcher) {
            val repository = FakeClinicalAlertsRepository(
                loads = ArrayDeque(listOf(Result.success(alertList()))),
                transitions = ArrayDeque(
                    listOf(
                        Result.failure(IOException("timeout")),
                        Result.success(
                            alert(
                                status = ClinicalAlertStatus.Acknowledged,
                                version = 2,
                            ),
                        ),
                    ),
                ),
            )
            val viewModel = ClinicalAlertsViewModel(
                repository = repository,
                expectedWorkspaceId = "workspace-1",
                canManage = true,
                idempotencyKeyFactory = { "ack-key-1" },
            )
            runCurrent()

            viewModel.onAction(
                ClinicalAlertsUiAction.RequestTransition(
                    alertId = "alert-1",
                    action = ClinicalAlertAction.Acknowledge,
                ),
            )
            viewModel.onAction(ClinicalAlertsUiAction.UpdateTransitionNote("Đang kiểm tra"))
            viewModel.onAction(ClinicalAlertsUiAction.ConfirmTransition)
            runCurrent()

            assertEquals(ClinicalAlertsError.Offline, viewModel.uiState.value.error)
            assertEquals("ack-key-1", viewModel.uiState.value.pendingTransition?.idempotencyKey)
            assertEquals(ClinicalAlertStatus.Open, viewModel.uiState.value.alerts.single().status)

            val effect = async { viewModel.effects.first() }
            viewModel.onAction(ClinicalAlertsUiAction.ConfirmTransition)
            runCurrent()

            assertEquals(
                listOf("ack-key-1", "ack-key-1"),
                repository.transitionCalls.map(TransitionCall::idempotencyKey),
            )
            assertEquals(ClinicalAlertsLoadState.Empty, viewModel.uiState.value.loadState)
            assertTrue(viewModel.uiState.value.alerts.isEmpty())
            assertNull(viewModel.uiState.value.pendingTransition)
            assertFalse(viewModel.uiState.value.isMutating)
            assertEquals(
                ClinicalAlertsUiEffect.BackendTransitionConfirmed(
                    ClinicalAlertAction.Acknowledge,
                ),
                effect.await(),
            )
        }

    @Test
    fun `version conflict discards stale intent and refreshes before another mutation`() =
        runTest(dispatcher) {
            val repository = ConflictReloadClinicalAlertsRepository()
            val viewModel = ClinicalAlertsViewModel(
                repository = repository,
                expectedWorkspaceId = "workspace-1",
                canManage = true,
                idempotencyKeyFactory = { "stale-ack-key" },
            )
            runCurrent()

            val effect = async { viewModel.effects.first() }
            viewModel.onAction(
                ClinicalAlertsUiAction.RequestTransition(
                    alertId = "alert-1",
                    action = ClinicalAlertAction.Acknowledge,
                ),
            )
            viewModel.onAction(ClinicalAlertsUiAction.ConfirmTransition)
            runCurrent()

            val refreshing = viewModel.uiState.value
            assertTrue(refreshing.isRefreshing)
            assertTrue(refreshing.isStale)
            assertEquals(ClinicalAlertsError.Conflict, refreshing.error)
            assertEquals("conflict-request", refreshing.requestId)
            assertNull(refreshing.pendingTransition)
            assertEquals(
                listOf(ClinicalAlertFilter.Open, ClinicalAlertFilter.Open),
                repository.filters,
            )

            viewModel.onAction(
                ClinicalAlertsUiAction.RequestTransition(
                    alertId = "alert-1",
                    action = ClinicalAlertAction.Acknowledge,
                ),
            )
            assertNull(viewModel.uiState.value.pendingTransition)

            repository.refreshed.complete(
                ClinicalAlertList(
                    workspaceId = "workspace-1",
                    alerts = emptyList(),
                ),
            )
            runCurrent()

            val refreshed = viewModel.uiState.value
            assertEquals(ClinicalAlertsLoadState.Empty, refreshed.loadState)
            assertFalse(refreshed.isRefreshing)
            assertFalse(refreshed.isStale)
            assertNull(refreshed.error)
            assertTrue(refreshed.alerts.isEmpty())
            assertEquals(
                ClinicalAlertsUiEffect.BackendStateRefreshedAfterConflict,
                effect.await(),
            )
        }

    @Test
    fun `filter reload failure retains the prior ledger as stale`() = runTest(dispatcher) {
        val repository = FakeClinicalAlertsRepository(
            loads = ArrayDeque(
                listOf(
                    Result.success(alertList()),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = ClinicalAlertsViewModel(repository, "workspace-1", canManage = true)
        runCurrent()

        viewModel.onAction(ClinicalAlertsUiAction.ChangeFilter(ClinicalAlertFilter.Resolved))
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(ClinicalAlertsLoadState.Content, state.loadState)
        assertEquals(ClinicalAlertFilter.Resolved, state.filter)
        assertTrue(state.isStale)
        assertEquals(ClinicalAlertsError.Offline, state.error)
        assertEquals(1, state.alerts.size)
    }

    @Test
    fun `http server failure is not misreported as offline`() = runTest(dispatcher) {
        val repository = FakeClinicalAlertsRepository(
            loads = ArrayDeque(
                listOf(
                    Result.failure(
                        SmartHealthApiException(
                            statusCode = 500,
                            code = "INTERNAL_ERROR",
                            message = "server failure",
                        ),
                    ),
                ),
            ),
        )

        val viewModel = ClinicalAlertsViewModel(
            repository = repository,
            expectedWorkspaceId = "workspace-1",
            canManage = true,
        )
        runCurrent()

        assertEquals(ClinicalAlertsLoadState.Error, viewModel.uiState.value.loadState)
        assertEquals(ClinicalAlertsError.Unknown, viewModel.uiState.value.error)
    }

    @Test
    fun `initial load cannot be replaced by an unconfirmed filter request`() =
        runTest(dispatcher) {
            val repository = BlockingClinicalAlertsRepository()
            val viewModel = ClinicalAlertsViewModel(
                repository = repository,
                expectedWorkspaceId = "workspace-1",
                canManage = true,
            )
            runCurrent()

            viewModel.onAction(
                ClinicalAlertsUiAction.ChangeFilter(ClinicalAlertFilter.Resolved),
            )
            runCurrent()

            assertEquals(listOf(ClinicalAlertFilter.Open), repository.filters)
            assertEquals(ClinicalAlertFilter.Open, viewModel.uiState.value.filter)

            repository.response.complete(alertList())
            runCurrent()
            assertEquals(ClinicalAlertsLoadState.Content, viewModel.uiState.value.loadState)
    }
}

private class ConflictReloadClinicalAlertsRepository : ClinicalAlertsRepository {
    val filters = mutableListOf<ClinicalAlertFilter>()
    val refreshed = CompletableDeferred<ClinicalAlertList>()

    override suspend fun load(
        filter: ClinicalAlertFilter,
        expectedWorkspaceId: String,
    ): ClinicalAlertList {
        filters += filter
        return if (filters.size == 1) {
            alertList()
        } else {
            refreshed.await()
        }
    }

    override suspend fun transition(
        alert: ClinicalAlert,
        action: ClinicalAlertAction,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalAlert {
        throw SmartHealthApiException(
            statusCode = 409,
            code = "ALERT_VERSION_CONFLICT",
            requestId = "conflict-request",
            message = "The alert changed on the server.",
        )
    }
}

private class BlockingClinicalAlertsRepository : ClinicalAlertsRepository {
    val filters = mutableListOf<ClinicalAlertFilter>()
    val response = CompletableDeferred<ClinicalAlertList>()

    override suspend fun load(
        filter: ClinicalAlertFilter,
        expectedWorkspaceId: String,
    ): ClinicalAlertList {
        filters += filter
        return response.await()
    }

    override suspend fun transition(
        alert: ClinicalAlert,
        action: ClinicalAlertAction,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalAlert = error("Not used")
}

private data class TransitionCall(
    val alertId: String,
    val action: ClinicalAlertAction,
    val note: String,
    val expectedVersion: Int,
    val idempotencyKey: String,
)

private class FakeClinicalAlertsRepository(
    private val loads: ArrayDeque<Result<ClinicalAlertList>>,
    private val transitions: ArrayDeque<Result<ClinicalAlert>> = ArrayDeque(),
) : ClinicalAlertsRepository {
    val filters = mutableListOf<ClinicalAlertFilter>()
    val transitionCalls = mutableListOf<TransitionCall>()

    override suspend fun load(
        filter: ClinicalAlertFilter,
        expectedWorkspaceId: String,
    ): ClinicalAlertList {
        filters += filter
        return loads.removeFirst().getOrThrow()
    }

    override suspend fun transition(
        alert: ClinicalAlert,
        action: ClinicalAlertAction,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalAlert {
        transitionCalls += TransitionCall(
            alertId = alert.id,
            action = action,
            note = note,
            expectedVersion = alert.version,
            idempotencyKey = idempotencyKey,
        )
        return transitions.removeFirst().getOrThrow()
    }
}

private fun alertList() = ClinicalAlertList(
    workspaceId = "workspace-1",
    alerts = listOf(alert()),
)

private fun alert(
    status: ClinicalAlertStatus = ClinicalAlertStatus.Open,
    version: Int = 1,
) = ClinicalAlert(
    id = "alert-1",
    organizationId = "workspace-1",
    sourceType = "scan",
    sourceId = "scan-1",
    status = status,
    severity = "warning",
    title = "Cần xem lại",
    message = "Lượt đo có nhiễu.",
    version = version,
)
