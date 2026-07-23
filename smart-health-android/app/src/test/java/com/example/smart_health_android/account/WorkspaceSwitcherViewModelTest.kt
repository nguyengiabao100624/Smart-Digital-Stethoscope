package com.example.smart_health_android.account

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.WorkspaceMembership
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WorkspaceSwitcherViewModelTest {
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
    fun `load derives workspace options only from backend membership`() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(currentUser = user("workspace_1"))
        val viewModel = WorkspaceSwitcherViewModel(repository)
        advanceUntilIdle()

        assertEquals(WorkspaceLoadState.Ready, viewModel.uiState.value.loadState)
        assertEquals("workspace_1", viewModel.uiState.value.currentWorkspaceId)
        assertEquals(listOf("workspace_1", "workspace_2"), viewModel.uiState.value.workspaces.map { it.id })
    }

    @Test
    fun `offline load has explicit retry state`() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(
            currentUser = user("workspace_1"),
            loadFailure = IOException("offline"),
        )
        val viewModel = WorkspaceSwitcherViewModel(repository)
        advanceUntilIdle()

        assertEquals(WorkspaceLoadState.Offline, viewModel.uiState.value.loadState)

        repository.loadFailure = null
        viewModel.onAction(WorkspaceSwitcherAction.Retry)
        advanceUntilIdle()

        assertEquals(WorkspaceLoadState.Ready, viewModel.uiState.value.loadState)
    }

    @Test
    fun `permission failure is distinct from connectivity error`() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(
            currentUser = user("workspace_1"),
            loadFailure = SmartHealthApiException(
                statusCode = 403,
                code = "FORBIDDEN",
                message = "forbidden",
            ),
        )
        val viewModel = WorkspaceSwitcherViewModel(repository)
        advanceUntilIdle()

        assertEquals(WorkspaceLoadState.PermissionDenied, viewModel.uiState.value.loadState)
    }

    @Test
    fun `switch updates active workspace only after server confirms target`() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(
            currentUser = user("workspace_1"),
            switchedUser = user("workspace_2"),
        )
        val viewModel = WorkspaceSwitcherViewModel(repository) { "workspace_switch_key" }
        advanceUntilIdle()

        viewModel.onAction(WorkspaceSwitcherAction.Switch("workspace_2"))
        assertEquals("workspace_1", viewModel.uiState.value.currentWorkspaceId)
        advanceUntilIdle()

        assertEquals(1, repository.switchCalls)
        assertEquals(listOf("workspace_switch_key"), repository.switchKeys)
        assertEquals("workspace_2", viewModel.uiState.value.currentWorkspaceId)
        assertEquals("Cơ sở 2", viewModel.uiState.value.confirmationMessage)
    }

    @Test
    fun `unconfirmed server response keeps previous workspace and reports error`() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(
            currentUser = user("workspace_1"),
            switchedUser = user("workspace_1"),
        )
        val viewModel = WorkspaceSwitcherViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(WorkspaceSwitcherAction.Switch("workspace_2"))
        advanceUntilIdle()

        assertEquals("workspace_1", viewModel.uiState.value.currentWorkspaceId)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
        assertTrue(viewModel.uiState.value.confirmationMessage.isBlank())
    }

    @Test
    fun `unknown workspace cannot trigger a mutation`() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(currentUser = user("workspace_1"))
        val viewModel = WorkspaceSwitcherViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(WorkspaceSwitcherAction.Switch("workspace_outside_membership"))
        advanceUntilIdle()

        assertEquals(0, repository.switchCalls)
        assertEquals("workspace_1", viewModel.uiState.value.currentWorkspaceId)
    }

    @Test
    fun `failed workspace retry reuses idempotency key`() = runTest(dispatcher) {
        val repository = FakeWorkspaceRepository(
            currentUser = user("workspace_1"),
            switchedUser = user("workspace_2"),
            failuresRemaining = 1,
        )
        val viewModel = WorkspaceSwitcherViewModel(repository) { "stable_workspace_key" }
        advanceUntilIdle()

        viewModel.onAction(WorkspaceSwitcherAction.Switch("workspace_2"))
        advanceUntilIdle()
        viewModel.onAction(WorkspaceSwitcherAction.Switch("workspace_2"))
        advanceUntilIdle()

        assertEquals(listOf("stable_workspace_key", "stable_workspace_key"), repository.switchKeys)
        assertEquals("workspace_2", viewModel.uiState.value.currentWorkspaceId)
    }
}

private class FakeWorkspaceRepository(
    private val currentUser: AuthUser,
    private val switchedUser: AuthUser = currentUser,
    private var failuresRemaining: Int = 0,
    var loadFailure: Throwable? = null,
) : WorkspaceSwitcherRepository {
    var switchCalls = 0
    val switchKeys = mutableListOf<String>()

    override suspend fun getCurrentUser(): AuthUser = loadFailure?.let { throw it } ?: currentUser

    override suspend fun switchWorkspace(workspaceId: String, idempotencyKey: String): AuthUser {
        switchCalls += 1
        switchKeys += idempotencyKey
        if (failuresRemaining > 0) {
            failuresRemaining -= 1
            error("temporary failure")
        }
        return switchedUser
    }
}

private fun user(currentWorkspaceId: String): AuthUser = AuthUser(
    id = "user_1",
    role = "doctor",
    currentWorkspaceId = currentWorkspaceId,
    organizationId = currentWorkspaceId,
    memberships = listOf(
        WorkspaceMembership(
            id = "membership_1",
            workspaceId = "workspace_1",
            organizationId = "workspace_1",
            workspaceName = "Cơ sở 1",
            workspaceType = "clinic",
            role = "doctor",
        ),
        WorkspaceMembership(
            id = "membership_2",
            workspaceId = "workspace_2",
            organizationId = "workspace_2",
            workspaceName = "Cơ sở 2",
            workspaceType = "clinic",
            role = "doctor",
        ),
    ),
)
