package com.example.smart_health_android.notifications

import com.example.smart_health_android.data.AppNotification
import com.example.smart_health_android.data.SmartHealthApiException
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
class NotificationInboxViewModelTest {
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
    fun `initial load exposes only backend-confirmed inbox state`() = runTest(dispatcher) {
        val repository = FakeNotificationInboxRepository(
            loads = ArrayDeque(listOf(Result.success(snapshot()))),
        )

        val viewModel = viewModel(repository)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(NotificationInboxLoadState.Ready, state.loadState)
        assertEquals("notification-1", state.notifications.single().id)
        assertEquals(1, state.unreadCount)
        assertFalse(state.isStale)
    }

    @Test
    fun `ambiguous read failure retains key and confirmed retry rotates it`() =
        runTest(dispatcher) {
            val repository = FakeNotificationInboxRepository(
                loads = ArrayDeque(listOf(Result.success(snapshot()))),
                reads = ArrayDeque(
                    listOf(
                        Result.failure(IOException("offline")),
                        Result.success(receipt(NotificationInboxAction.Read, read = true)),
                        Result.success(receipt(NotificationInboxAction.Read, read = true)),
                    ),
                ),
            )
            val keys = ArrayDeque(listOf("key-1", "key-2"))
            val viewModel = viewModel(repository) { keys.removeFirst() }
            runCurrent()

            viewModel.onAction(NotificationInboxUiAction.MarkRead("notification-1"))
            runCurrent()
            assertFalse(viewModel.uiState.value.notifications.single().read)
            assertTrue(viewModel.uiState.value.isStale)

            viewModel.onAction(NotificationInboxUiAction.MarkRead("notification-1"))
            runCurrent()
            assertTrue(viewModel.uiState.value.notifications.single().read)

            repository.loads += Result.success(snapshot(read = false))
            viewModel.onAction(NotificationInboxUiAction.Refresh)
            runCurrent()
            viewModel.onAction(NotificationInboxUiAction.MarkRead("notification-1"))
            runCurrent()

            assertEquals(listOf("key-1", "key-1", "key-2"), repository.readKeys)
        }

    @Test
    fun `delete requires confirmation and replaces state only with backend snapshot`() =
        runTest(dispatcher) {
            val repository = FakeNotificationInboxRepository(
                loads = ArrayDeque(listOf(Result.success(snapshot()))),
                deletes = ArrayDeque(
                    listOf(
                        Result.success(
                            receipt(
                                action = NotificationInboxAction.Delete,
                                includeItem = false,
                                deletedId = "notification-1",
                            ),
                        ),
                    ),
                ),
            )
            val viewModel = viewModel(repository)
            runCurrent()

            viewModel.onAction(NotificationInboxUiAction.RequestDelete("notification-1"))
            runCurrent()
            assertEquals("notification-1", viewModel.uiState.value.pendingDeleteId)
            assertEquals(0, repository.deleteCalls)

            viewModel.onAction(NotificationInboxUiAction.ConfirmDelete)
            runCurrent()

            assertEquals(1, repository.deleteCalls)
            assertTrue(viewModel.uiState.value.notifications.isEmpty())
            assertEquals(NotificationInboxLoadState.Empty, viewModel.uiState.value.loadState)
            assertNull(viewModel.uiState.value.pendingDeleteId)
        }

    @Test
    fun `double submit is blocked while a mutation is active`() = runTest(dispatcher) {
        val repository = FakeNotificationInboxRepository(
            loads = ArrayDeque(listOf(Result.success(snapshot()))),
            reads = ArrayDeque(
                listOf(Result.success(receipt(NotificationInboxAction.Read, read = true))),
            ),
            holdMutations = true,
        )
        val viewModel = viewModel(repository)
        runCurrent()

        viewModel.onAction(NotificationInboxUiAction.MarkRead("notification-1"))
        runCurrent()
        viewModel.onAction(NotificationInboxUiAction.MarkRead("notification-1"))
        runCurrent()

        assertEquals(1, repository.readCalls)
        repository.releaseMutation()
        runCurrent()
    }

    @Test
    fun `permission and offline failures expose distinct retry states`() = runTest(dispatcher) {
        val denied = viewModel(
            FakeNotificationInboxRepository(
                loads = ArrayDeque(
                    listOf(
                        Result.failure(
                            SmartHealthApiException(
                                statusCode = 403,
                                code = "NOTIFICATION_INBOX_WORKSPACE_REQUIRED",
                                message = "denied",
                            ),
                        ),
                    ),
                ),
            ),
        )
        runCurrent()
        assertEquals(
            NotificationInboxLoadState.PermissionDenied,
            denied.uiState.value.loadState,
        )

        val offline = viewModel(
            FakeNotificationInboxRepository(
                loads = ArrayDeque(listOf(Result.failure(IOException("offline")))),
            ),
        )
        runCurrent()
        assertEquals(NotificationInboxLoadState.Offline, offline.uiState.value.loadState)
    }

    private fun viewModel(
        repository: NotificationInboxRepository,
        idempotencyKey: () -> String = { "generated-key" },
    ): NotificationInboxViewModel =
        NotificationInboxViewModel(
            repository = repository,
            expectedUserId = "user-1",
            expectedWorkspaceId = "workspace-1",
            idempotencyKey = idempotencyKey,
        )

    private fun snapshot(read: Boolean = false): NotificationInboxSnapshot =
        NotificationInboxSnapshot(
            userId = "user-1",
            workspaceId = "workspace-1",
            notifications = listOf(item(read)),
            updatedAt = "2026-07-29T08:00:00.000Z",
        )

    private fun item(read: Boolean = false): AppNotification =
        AppNotification(
            id = "notification-1",
            userId = "user-1",
            workspaceId = "workspace-1",
            organizationId = "workspace-1",
            type = "info",
            title = "Shcare update",
            message = "Confirmed by backend",
            read = read,
            readAt = if (read) "2026-07-29T08:01:00.000Z" else null,
            createdAt = "2026-07-29T08:00:00.000Z",
            updatedAt = "2026-07-29T08:01:00.000Z",
        )

    private fun receipt(
        action: NotificationInboxAction,
        read: Boolean = false,
        includeItem: Boolean = true,
        deletedId: String? = null,
    ): NotificationInboxMutationReceipt =
        NotificationInboxMutationReceipt(
            userId = "user-1",
            workspaceId = "workspace-1",
            action = action,
            notification = item(read),
            notifications = if (includeItem) listOf(item(read)) else emptyList(),
            affectedIds = listOf("notification-1"),
            deletedId = deletedId,
            updatedAt = "2026-07-29T08:01:00.000Z",
            replayed = false,
        )
}

private class FakeNotificationInboxRepository(
    val loads: ArrayDeque<Result<NotificationInboxSnapshot>> = ArrayDeque(),
    private val reads: ArrayDeque<Result<NotificationInboxMutationReceipt>> = ArrayDeque(),
    private val readAll: ArrayDeque<Result<NotificationInboxMutationReceipt>> = ArrayDeque(),
    private val deletes: ArrayDeque<Result<NotificationInboxMutationReceipt>> = ArrayDeque(),
    private val holdMutations: Boolean = false,
) : NotificationInboxRepository {
    val readKeys = mutableListOf<String>()
    var readCalls = 0
    var deleteCalls = 0
    private var mutationGate =
        kotlinx.coroutines.CompletableDeferred<Unit>().apply {
            if (!holdMutations) complete(Unit)
        }

    override suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxSnapshot = loads.removeFirst().getOrThrow()

    override suspend fun markRead(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt {
        readCalls += 1
        readKeys += idempotencyKey
        mutationGate.await()
        return reads.removeFirst().getOrThrow()
    }

    override suspend fun markAllRead(
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt {
        mutationGate.await()
        return readAll.removeFirst().getOrThrow()
    }

    override suspend fun delete(
        notificationId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationInboxMutationReceipt {
        deleteCalls += 1
        mutationGate.await()
        return deletes.removeFirst().getOrThrow()
    }

    fun releaseMutation() {
        mutationGate.complete(Unit)
    }
}
