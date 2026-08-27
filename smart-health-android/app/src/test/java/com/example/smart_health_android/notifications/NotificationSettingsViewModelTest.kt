package com.example.smart_health_android.notifications

import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
class NotificationSettingsViewModelTest {
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
    fun `initial load exposes confirmed owner and complete runtime channel truth`() =
        runTest(dispatcher) {
            val repository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(listOf(Result.success(snapshot()))),
                runtime = NotificationRuntimeReadiness(
                    firebaseConfigured = true,
                    runtimePermissionGranted = true,
                    appNotificationsEnabled = true,
                    channelEnabled = true,
                    encryptedSessionMatches = true,
                ),
            )

            val viewModel = viewModel(repository)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(NotificationSettingsLoadState.Ready, state.loadState)
            assertEquals("user-1", state.snapshot?.userId)
            assertTrue(state.pushReady)
            assertFalse(state.isStale)
        }

    @Test
    fun `field update keeps idempotency key after failure and rotates after confirmation`() =
        runTest(dispatcher) {
            val repository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(listOf(Result.success(snapshot()))),
                patches = ArrayDeque(
                    listOf(
                        Result.failure(IOException("offline")),
                        Result.success(snapshot(appointments = false)),
                        Result.success(snapshot(appointments = true)),
                    ),
                ),
            )
            val keys = ArrayDeque(listOf("key-1", "key-2"))
            val viewModel = viewModel(repository, idempotencyKey = { keys.removeFirst() })
            runCurrent()

            viewModel.onAction(
                NotificationSettingsUiAction.SetCloudPreference(
                    NotificationPreferenceField.Appointments,
                    false,
                ),
            )
            runCurrent()
            assertTrue(viewModel.uiState.value.isStale)
            assertEquals(true, viewModel.uiState.value.snapshot?.preferences?.appointments)

            viewModel.onAction(
                NotificationSettingsUiAction.SetCloudPreference(
                    NotificationPreferenceField.Appointments,
                    false,
                ),
            )
            runCurrent()
            assertEquals(false, viewModel.uiState.value.snapshot?.preferences?.appointments)

            viewModel.onAction(
                NotificationSettingsUiAction.SetCloudPreference(
                    NotificationPreferenceField.Appointments,
                    true,
                ),
            )
            runCurrent()

            assertEquals(listOf("key-1", "key-1", "key-2"), repository.patchKeys)
            assertEquals(true, viewModel.uiState.value.snapshot?.preferences?.appointments)
            assertEquals(
                NotificationSettingsMessage.CloudPreferenceSaved,
                viewModel.uiState.value.statusMessage,
            )
            assertFalse(viewModel.uiState.value.isStale)
        }

    @Test
    fun `mismatched owner or unconfirmed field never becomes saved state`() =
        runTest(dispatcher) {
            val repository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(listOf(Result.success(snapshot()))),
                patches = ArrayDeque(
                    listOf(
                        Result.failure(
                            NotificationPreferenceOwnershipException(
                                "Phản hồi không thuộc phiên hiện tại",
                            ),
                        ),
                    ),
                ),
            )
            val viewModel = viewModel(repository)
            runCurrent()

            viewModel.onAction(
                NotificationSettingsUiAction.SetCloudPreference(
                    NotificationPreferenceField.Messages,
                    false,
                ),
            )
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(true, state.snapshot?.preferences?.messages)
            assertNull(state.statusMessage)
            assertEquals(NotificationSettingsMessage.MissingAuthority, state.errorMessage)
            assertTrue(state.isStale)
        }

    @Test
    fun `refresh cannot overwrite a cloud mutation that is still in flight`() =
        runTest(dispatcher) {
            val patchGate = CompletableDeferred<Unit>()
            val repository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(
                    listOf(
                        Result.success(snapshot()),
                        Result.success(snapshot(appointments = true)),
                    ),
                ),
                patches = ArrayDeque(
                    listOf(Result.success(snapshot(appointments = false))),
                ),
                patchGate = patchGate,
            )
            val viewModel = viewModel(repository)
            runCurrent()

            viewModel.onAction(
                NotificationSettingsUiAction.SetCloudPreference(
                    NotificationPreferenceField.Appointments,
                    false,
                ),
            )
            runCurrent()
            assertTrue(
                NotificationPreferenceField.Appointments in
                    viewModel.uiState.value.savingFields,
            )

            viewModel.onAction(NotificationSettingsUiAction.Refresh)
            runCurrent()
            assertEquals(1, repository.loadCalls)

            patchGate.complete(Unit)
            runCurrent()
            assertEquals(false, viewModel.uiState.value.snapshot?.preferences?.appointments)
            assertEquals(1, repository.loadCalls)
        }

    @Test
    fun `system settings action is emitted without a cloud PATCH`() = runTest(dispatcher) {
        val repository = FakeNotificationSettingsRepository(
            loads = ArrayDeque(listOf(Result.success(snapshot()))),
        )
        val viewModel = viewModel(repository)
        runCurrent()
        var effect: NotificationSettingsUiEffect? = null
        val collector = launch {
            effect = viewModel.effects.first()
        }
        runCurrent()

        viewModel.onAction(NotificationSettingsUiAction.OpenSystemNotificationSettings)
        runCurrent()

        assertEquals(0, repository.patchCalls)
        assertEquals(NotificationSettingsUiEffect.OpenSystemNotificationSettings, effect)
        collector.cancel()
    }

    @Test
    fun `permission callback never overrides disabled app or channel authority`() = runTest(dispatcher) {
        val repository = FakeNotificationSettingsRepository(
            loads = ArrayDeque(listOf(Result.success(snapshot()))),
            runtime = NotificationRuntimeReadiness(
                firebaseConfigured = true,
                runtimePermissionGranted = true,
                appNotificationsEnabled = false,
                channelEnabled = false,
                encryptedSessionMatches = true,
            ),
        )
        val viewModel = viewModel(repository)
        runCurrent()

        viewModel.onAction(NotificationSettingsUiAction.SystemPermissionResult(true))
        runCurrent()

        assertTrue(viewModel.uiState.value.runtimeReadiness.runtimePermissionGranted)
        assertFalse(viewModel.uiState.value.runtimeReadiness.appNotificationsEnabled)
        assertFalse(viewModel.uiState.value.runtimeReadiness.channelEnabled)
        assertFalse(viewModel.uiState.value.pushReady)
    }

    @Test
    fun `resume refresh is age bounded and retains stale snapshot on failure`() =
        runTest(dispatcher) {
            var now = 1_000L
            val repository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(
                    listOf(
                        Result.success(snapshot(appointments = true)),
                        Result.success(snapshot(appointments = false)),
                        Result.failure(IOException("offline")),
                    ),
                ),
            )
            val viewModel = viewModel(
                repository = repository,
                elapsedRealtimeMillis = { now },
            )
            runCurrent()

            now = 4_999L
            viewModel.onAction(NotificationSettingsUiAction.RefreshOnResume)
            runCurrent()
            assertEquals(1, repository.loadCalls)

            now = 6_001L
            viewModel.onAction(NotificationSettingsUiAction.RefreshOnResume)
            runCurrent()
            assertEquals(2, repository.loadCalls)
            assertEquals(false, viewModel.uiState.value.snapshot?.preferences?.appointments)

            now = 12_000L
            viewModel.onAction(NotificationSettingsUiAction.RefreshOnResume)
            runCurrent()
            assertEquals(3, repository.loadCalls)
            assertEquals(false, viewModel.uiState.value.snapshot?.preferences?.appointments)
            assertTrue(viewModel.uiState.value.isStale)
            assertEquals(NotificationSettingsMessage.Offline, viewModel.uiState.value.errorMessage)
        }

    @Test
    fun `refresh retains stale values and classifies offline and forbidden states`() =
        runTest(dispatcher) {
            val repository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(
                    listOf(
                        Result.success(snapshot()),
                        Result.failure(IOException("offline")),
                    ),
                ),
            )
            val viewModel = viewModel(repository)
            runCurrent()

            viewModel.onAction(NotificationSettingsUiAction.Refresh)
            runCurrent()

            assertEquals(NotificationSettingsLoadState.Ready, viewModel.uiState.value.loadState)
            assertTrue(viewModel.uiState.value.isStale)
            assertEquals("user-1", viewModel.uiState.value.snapshot?.userId)

            val forbiddenRepository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(
                    listOf(
                        Result.failure(
                            SmartHealthApiException(
                                statusCode = 403,
                                code = "FORBIDDEN",
                                message = "forbidden",
                            ),
                        ),
                    ),
                ),
            )
            val forbiddenViewModel = viewModel(forbiddenRepository)
            runCurrent()
            assertEquals(
                NotificationSettingsLoadState.PermissionDenied,
                forbiddenViewModel.uiState.value.loadState,
            )
        }

    @Test
    fun `enabling account notifications requests Android permission only after backend confirmation`() =
        runTest(dispatcher) {
            val repository = FakeNotificationSettingsRepository(
                loads = ArrayDeque(listOf(Result.success(snapshot(enabled = false)))),
                patches = ArrayDeque(listOf(Result.success(snapshot(enabled = true)))),
                runtime = NotificationRuntimeReadiness(
                    firebaseConfigured = true,
                    runtimePermissionGranted = false,
                    appNotificationsEnabled = true,
                    channelEnabled = true,
                    encryptedSessionMatches = true,
                ),
            )
            val viewModel = viewModel(repository)
            runCurrent()
            var effect: NotificationSettingsUiEffect? = null
            val collector = launch {
                effect = viewModel.effects.first()
            }
            runCurrent()

            viewModel.onAction(
                NotificationSettingsUiAction.SetCloudPreference(
                    NotificationPreferenceField.Enabled,
                    true,
                ),
            )
            runCurrent()

            assertEquals(NotificationSettingsUiEffect.RequestSystemPermission, effect)
            collector.cancel()
        }

    private fun viewModel(
        repository: NotificationSettingsRepository,
        idempotencyKey: () -> String = { "key-default" },
        elapsedRealtimeMillis: () -> Long = { 0L },
    ) = NotificationSettingsViewModel(
        repository = repository,
        expectedUserId = "user-1",
        expectedWorkspaceId = "workspace-1",
        role = "patient",
        idempotencyKey = idempotencyKey,
        elapsedRealtimeMillis = elapsedRealtimeMillis,
    )
}

private class FakeNotificationSettingsRepository(
    private val loads: ArrayDeque<Result<NotificationPreferencesSnapshot?>>,
    private val patches: ArrayDeque<Result<NotificationPreferencesSnapshot>> = ArrayDeque(),
    private val runtime: NotificationRuntimeReadiness = NotificationRuntimeReadiness(),
    private val patchGate: CompletableDeferred<Unit>? = null,
) : NotificationSettingsRepository {
    var loadCalls = 0
    var patchCalls = 0
    val patchKeys = mutableListOf<String>()

    override suspend fun load(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot? {
        loadCalls += 1
        return loads.removeFirst().getOrThrow()
    }

    override suspend fun patch(
        field: NotificationPreferenceField,
        enabled: Boolean,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationPreferencesSnapshot {
        patchCalls += 1
        patchKeys += idempotencyKey
        patchGate?.await()
        return patches.removeFirst().getOrThrow()
    }

    override fun runtimeReadiness(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): NotificationRuntimeReadiness = runtime
}

private fun snapshot(
    enabled: Boolean = true,
    appointments: Boolean = true,
) = NotificationPreferencesSnapshot(
    userId = "user-1",
    workspaceId = "workspace-1",
    ownership = NotificationPreferenceOwnership(kind = "self", userId = "user-1"),
    preferences = NotificationCloudPreferences(
        enabled = enabled,
        doctorRequests = true,
        abnormalResults = true,
        deviceOffline = true,
        appointments = appointments,
        messages = true,
        aiUpdates = false,
        newLogin = true,
    ),
    channels = NotificationChannelAvailabilitySet(
        inApp = NotificationChannelAvailability(true, "ready", ""),
        email = NotificationChannelAvailability(false, "disabled", "PROVIDER_DISABLED"),
        push = NotificationChannelAvailability(true, "ready", ""),
    ),
    updatedAt = "2026-07-27T10:00:00.000Z",
)
