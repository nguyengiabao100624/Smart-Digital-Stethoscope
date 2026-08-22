package com.example.smart_health_android.settings

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import com.example.smart_health_android.navigation.MobileExperience
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
class SettingsOverviewViewModelTest {
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
    fun `account id and role come from the exact active current membership`() {
        val expected = authority(role = "doctor")
        val account = backendUser(
            id = expected.userId,
            topLevelRole = "patient",
            membershipId = " membership-01 ",
            membershipRole = "doctor",
        ).toSettingsOverviewAccount(expected)

        assertEquals("membership-01", account.memberId)
        assertEquals("Bác sĩ Nguyễn An", account.displayName)
        assertEquals(SettingsAccountRole.Doctor, account.role)
        assertEquals("Workspace Tim phổi", account.workspaceName)
        assertEquals("NA", account.initials)
    }

    @Test
    fun `cross user backend response is rejected without rendering account data`() =
        runTest(dispatcher) {
            val expected = authority(userId = "user-expected")
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(backendUser(id = "user-other")),
                    ),
                ),
            )
            var authorityInvalidations = 0

            val viewModel = settingsViewModel(
                repository = repository,
                expected = expected,
                invalidateExpectedAuthority = { authorityInvalidations += 1 },
            )
            runCurrent()

            assertAuthorityDenied(viewModel.uiState.value)
            assertEquals(1, repository.loadCount)
            assertEquals(1, authorityInvalidations)
        }

    @Test
    fun `cross workspace current membership is rejected`() = runTest(dispatcher) {
        val expected = authority(workspaceId = "workspace-expected")
        val viewModel = settingsViewModel(
            repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(
                            backendUser(
                                workspaceId = "workspace-other",
                            ),
                        ),
                    ),
                ),
            ),
            expected = expected,
        )
        runCurrent()

        assertAuthorityDenied(viewModel.uiState.value)
    }

    @Test
    fun `inactive or role mismatched current membership is rejected`() =
        runTest(dispatcher) {
            val expected = authority(role = "doctor")
            val roleMismatch = settingsViewModel(
                repository = FakeSettingsOverviewRepository(
                    ArrayDeque(
                        listOf(
                            Result.success(
                                backendUser(membershipRole = "nurse"),
                            ),
                        ),
                    ),
                ),
                expected = expected,
            )
            runCurrent()
            assertAuthorityDenied(roleMismatch.uiState.value)

            val inactive = settingsViewModel(
                repository = FakeSettingsOverviewRepository(
                    ArrayDeque(
                        listOf(
                            Result.success(
                                backendUser(
                                    membershipStatus = "suspended",
                                    operational = false,
                                ),
                            ),
                        ),
                    ),
                ),
                expected = expected,
            )
            runCurrent()
            assertAuthorityDenied(inactive.uiState.value)
        }

    @Test
    fun `locked or deleted account is rejected without rendering PII`() =
        runTest(dispatcher) {
            val expected = authority()
            val locked = settingsViewModel(
                repository = FakeSettingsOverviewRepository(
                    ArrayDeque(
                        listOf(
                            Result.success(
                                backendUser(accountStatus = "locked"),
                            ),
                        ),
                    ),
                ),
                expected = expected,
            )
            runCurrent()
            assertAuthorityDenied(locked.uiState.value)

            val deleted = settingsViewModel(
                repository = FakeSettingsOverviewRepository(
                    ArrayDeque(
                        listOf(
                            Result.success(
                                backendUser(deletedAt = "2026-07-29T08:00:00Z"),
                            ),
                        ),
                    ),
                ),
                expected = expected,
            )
            runCurrent()
            assertAuthorityDenied(deleted.uiState.value)
        }

    @Test
    fun `capability or experience mismatch is rejected`() = runTest(dispatcher) {
        val capabilityMismatch = settingsViewModel(
            repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(
                            backendUser(capabilities = listOf("workspace.scans.view")),
                        ),
                    ),
                ),
            ),
            expected = authority(),
        )
        runCurrent()
        assertAuthorityDenied(capabilityMismatch.uiState.value)

        val experienceMismatch = settingsViewModel(
            repository = FakeSettingsOverviewRepository(
                ArrayDeque(listOf(Result.success(backendUser()))),
            ),
            expected = authority(experience = MobileExperience.Patient),
        )
        runCurrent()
        assertAuthorityDenied(experienceMismatch.uiState.value)
    }

    @Test
    fun `stale authority epoch fails closed before requesting account data`() =
        runTest(dispatcher) {
            val expected = authority(epoch = 7L)
            val current = authority(epoch = 8L)
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(listOf(Result.success(backendUser()))),
            )

            val viewModel = SettingsOverviewViewModel(
                repository = repository,
                expectedAuthority = expected,
                currentAuthority = { current },
                invalidateExpectedAuthority = {},
                logoutCoordinator = noOpLogoutCoordinator(),
            )
            runCurrent()

            assertAuthorityDenied(viewModel.uiState.value)
            assertEquals(0, repository.loadCount)
        }

    @Test
    fun `initial load exposes only backend account matching the full authority snapshot`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(listOf(Result.success(backendUser()))),
            )

            val viewModel = settingsViewModel(repository, expected)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(SettingsOverviewLoadState.Ready, state.loadState)
            assertEquals("membership-1", state.account?.memberId)
            assertTrue(state.hasLoaded)
            assertFalse(state.isRefreshing)
            assertFalse(state.isStale)
            assertNull(state.error)
            assertEquals(1, repository.loadCount)
        }

    @Test
    fun `forbidden refresh clears previously rendered PII and actions`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(backendUser()),
                        Result.failure(
                            SmartHealthApiException(
                                statusCode = 403,
                                code = "FORBIDDEN",
                                requestId = "request-settings-403",
                                message = "forbidden",
                            ),
                        ),
                    ),
                ),
            )
            var authorityInvalidations = 0
            val viewModel = settingsViewModel(
                repository = repository,
                expected = expected,
                invalidateExpectedAuthority = { authorityInvalidations += 1 },
            )
            runCurrent()
            assertEquals(SettingsOverviewLoadState.Ready, viewModel.uiState.value.loadState)

            viewModel.onAction(SettingsOverviewUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(SettingsOverviewLoadState.PermissionDenied, state.loadState)
            assertEquals(SettingsOverviewError.PermissionDenied, state.error)
            assertEquals("request-settings-403", state.requestId)
            assertNull(state.account)
            assertFalse(state.hasLoaded)
            assertFalse(state.isStale)
            assertEquals(1, authorityInvalidations)
        }

    @Test
    fun `authority mismatch during refresh clears previously rendered PII`() =
        runTest(dispatcher) {
            val expected = authority(epoch = 7L)
            var current = expected
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(backendUser()),
                        Result.success(backendUser()),
                    ),
                ),
            )
            val viewModel = SettingsOverviewViewModel(
                repository = repository,
                expectedAuthority = expected,
                currentAuthority = { current },
                invalidateExpectedAuthority = {},
                logoutCoordinator = noOpLogoutCoordinator(),
            )
            runCurrent()
            current = authority(epoch = 8L)

            viewModel.onAction(SettingsOverviewUiAction.Refresh)
            runCurrent()

            assertAuthorityDenied(viewModel.uiState.value)
            assertEquals(1, repository.loadCount)
        }

    @Test
    fun `authority changed while getMe is in flight rejects the returned profile`() =
        runTest(dispatcher) {
            val expected = authority(epoch = 7L)
            var current = expected
            var authorityInvalidations = 0
            val repository = BlockingSettingsOverviewRepository()
            val viewModel = SettingsOverviewViewModel(
                repository = repository,
                expectedAuthority = expected,
                currentAuthority = { current },
                invalidateExpectedAuthority = { authorityInvalidations += 1 },
                logoutCoordinator = noOpLogoutCoordinator(),
            )
            runCurrent()
            assertEquals(1, repository.loadCount)

            current = authority(epoch = 8L)
            repository.response.complete(backendUser())
            runCurrent()

            assertAuthorityDenied(viewModel.uiState.value)
            assertEquals(0, authorityInvalidations)
        }

    @Test
    fun `offline state retries and only becomes ready after confirmed authority match`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.failure(IOException("offline")),
                        Result.success(backendUser()),
                    ),
                ),
            )
            val viewModel = settingsViewModel(repository, expected)
            runCurrent()

            assertEquals(SettingsOverviewLoadState.Offline, viewModel.uiState.value.loadState)

            viewModel.onAction(SettingsOverviewUiAction.Retry)
            runCurrent()

            assertEquals(SettingsOverviewLoadState.Ready, viewModel.uiState.value.loadState)
            assertEquals("membership-1", viewModel.uiState.value.account?.memberId)
            assertEquals(2, repository.loadCount)
        }

    @Test
    fun `transient refresh failure preserves confirmed account and marks it stale`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(backendUser()),
                        Result.failure(IOException("offline")),
                    ),
                ),
            )
            val viewModel = settingsViewModel(repository, expected)
            runCurrent()

            viewModel.onAction(SettingsOverviewUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(SettingsOverviewLoadState.Ready, state.loadState)
            assertEquals("membership-1", state.account?.memberId)
            assertTrue(state.isStale)
            assertEquals(SettingsOverviewError.Offline, state.error)
        }

    @Test
    fun `server failure during refresh also keeps only the last confirmed account`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(backendUser()),
                        Result.failure(
                            SmartHealthApiException(
                                statusCode = 503,
                                code = "SERVICE_UNAVAILABLE",
                                message = "unavailable",
                            ),
                        ),
                    ),
                ),
            )
            val viewModel = settingsViewModel(repository, expected)
            runCurrent()

            viewModel.onAction(SettingsOverviewUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(SettingsOverviewLoadState.Ready, state.loadState)
            assertEquals("membership-1", state.account?.memberId)
            assertTrue(state.isStale)
            assertEquals(SettingsOverviewError.Unknown, state.error)
        }

    @Test
    fun `non retryable refresh failure clears the previously rendered account`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(backendUser()),
                        Result.failure(
                            SmartHealthApiException(
                                statusCode = 400,
                                code = "INVALID_REQUEST",
                                requestId = "request-settings-400",
                                message = "invalid request",
                            ),
                        ),
                    ),
                ),
            )
            val viewModel = settingsViewModel(repository, expected)
            runCurrent()

            viewModel.onAction(SettingsOverviewUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(SettingsOverviewLoadState.Error, state.loadState)
            assertEquals(SettingsOverviewError.Unknown, state.error)
            assertEquals("request-settings-400", state.requestId)
            assertNull(state.account)
            assertFalse(state.hasLoaded)
            assertFalse(state.isStale)
        }

    @Test
    fun `successful explicit refresh emits one backend confirmed effect`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = FakeSettingsOverviewRepository(
                ArrayDeque(
                    listOf(
                        Result.success(backendUser(membershipId = "membership-1")),
                        Result.success(backendUser(membershipId = "membership-2")),
                    ),
                ),
            )
            val viewModel = settingsViewModel(repository, expected)
            runCurrent()
            val effect = async { viewModel.effects.first() }

            viewModel.onAction(SettingsOverviewUiAction.Refresh)
            runCurrent()

            assertEquals(SettingsOverviewUiEffect.RefreshConfirmed, effect.await())
            assertEquals("membership-2", viewModel.uiState.value.account?.memberId)
        }

    @Test
    fun `double logout tap terminates once and authority clears before termination`() =
        runTest(dispatcher) {
            val expected = authority()
            val order = mutableListOf<String>()
            val termination = CompletableDeferred<Unit>()
            var terminationCount = 0
            val coordinator = SettingsLogoutCoordinator(
                clearAuthority = { order += "clear" },
                terminateSession = {
                    terminationCount += 1
                    order += "terminate"
                    termination.await()
                },
                exitProtectedUi = { order += "exit" },
            )
            val viewModel = SettingsOverviewViewModel(
                repository = FakeSettingsOverviewRepository(
                    ArrayDeque(listOf(Result.success(backendUser()))),
                ),
                expectedAuthority = expected,
                currentAuthority = { expected },
                invalidateExpectedAuthority = {},
                logoutCoordinator = coordinator,
            )
            runCurrent()

            viewModel.onAction(SettingsOverviewUiAction.Logout)
            viewModel.onAction(SettingsOverviewUiAction.Logout)
            runCurrent()

            assertEquals(1, terminationCount)
            assertEquals(listOf("clear", "terminate"), order)
            assertTrue(viewModel.uiState.value.isLoggingOut)

            termination.complete(Unit)
            runCurrent()

            assertEquals(listOf("clear", "terminate", "exit"), order)
        }

    @Test
    fun `termination failure still exits protected UI in finally`() = runTest(dispatcher) {
        val order = mutableListOf<String>()
        val coordinator = SettingsLogoutCoordinator(
            clearAuthority = { order += "clear" },
            terminateSession = {
                order += "terminate"
                throw IOException("provider unavailable")
            },
            exitProtectedUi = { order += "exit" },
        )

        assertEquals(SettingsLogoutResult.Failed, coordinator.logout())
        assertEquals(listOf("clear", "terminate", "exit"), order)
    }
}

private class FakeSettingsOverviewRepository(
    private val results: ArrayDeque<Result<AuthUser>>,
) : SettingsOverviewRepository {
    var loadCount = 0
        private set

    override suspend fun loadCurrentUser(): AuthUser {
        loadCount += 1
        return results.removeFirst().getOrThrow()
    }
}

private class BlockingSettingsOverviewRepository : SettingsOverviewRepository {
    val response = CompletableDeferred<AuthUser>()
    var loadCount = 0
        private set

    override suspend fun loadCurrentUser(): AuthUser {
        loadCount += 1
        return response.await()
    }
}

private fun settingsViewModel(
    repository: SettingsOverviewRepository,
    expected: SettingsAuthoritySnapshot,
    invalidateExpectedAuthority: () -> Unit = {},
) = SettingsOverviewViewModel(
    repository = repository,
    expectedAuthority = expected,
    currentAuthority = { expected },
    invalidateExpectedAuthority = invalidateExpectedAuthority,
    logoutCoordinator = noOpLogoutCoordinator(),
)

private fun noOpLogoutCoordinator() = SettingsLogoutCoordinator(
    clearAuthority = {},
    terminateSession = {},
    exitProtectedUi = {},
)

private fun authority(
    userId: String = "user-1",
    workspaceId: String = "workspace-1",
    role: String = "doctor",
    capabilities: Set<String> = setOf(
        "workspace.devices.manage",
        "workspace.scans.view",
    ),
    experience: MobileExperience = MobileExperience.Clinical,
    epoch: Long = 7L,
) = SettingsAuthoritySnapshot.create(
    userId = userId,
    workspaceId = workspaceId,
    role = role,
    capabilities = capabilities,
    experience = experience,
    authorityEpoch = epoch,
)

private fun backendUser(
    id: String = "user-1",
    workspaceId: String = "workspace-1",
    accountStatus: String = "active",
    deletedAt: String? = null,
    topLevelRole: String = "patient",
    membershipId: String = "membership-1",
    membershipRole: String = "doctor",
    membershipStatus: String = "active",
    operational: Boolean = true,
    capabilities: List<String> = listOf(
        "workspace.devices.manage",
        "workspace.scans.view",
    ),
) = AuthUser(
    id = id,
    accountStatus = accountStatus,
    deletedAt = deletedAt,
    role = topLevelRole,
    name = " Bác sĩ Nguyễn An ",
    currentWorkspaceId = workspaceId,
    organizationId = workspaceId,
    clinicName = "Phòng khám dự phòng",
    currentWorkspace = WorkspaceSummary(
        id = workspaceId,
        name = " Workspace Tim phổi ",
        role = topLevelRole,
    ),
    currentMembership = WorkspaceMembership(
        id = membershipId,
        workspaceId = workspaceId,
        workspaceName = "Workspace Tim phổi",
        role = membershipRole,
        status = membershipStatus,
        operational = operational,
    ),
    capabilities = capabilities,
)

private fun assertAuthorityDenied(state: SettingsOverviewUiState) {
    assertEquals(SettingsOverviewLoadState.PermissionDenied, state.loadState)
    assertEquals(SettingsOverviewError.AuthorityMismatch, state.error)
    assertNull(state.account)
    assertFalse(state.hasLoaded)
    assertFalse(state.isStale)
}
