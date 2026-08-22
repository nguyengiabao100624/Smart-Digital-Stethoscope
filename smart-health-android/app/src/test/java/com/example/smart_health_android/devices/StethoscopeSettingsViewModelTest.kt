package com.example.smart_health_android.devices

import com.example.smart_health_android.data.SmartDevice
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
class StethoscopeSettingsViewModelTest {
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
    fun initialLoadPrefersAnOnlineDeviceAndUsesBackendPresence() = runTest(dispatcher) {
        val repository = FakeStethoscopeDeviceRepository(
            responses = ArrayDeque(
                listOf(
                    Result.success(
                        listOf(
                            SmartDevice(id = "offline", name = "Offline", online = false),
                            SmartDevice(id = "online", name = "Online", online = true),
                        ),
                    ),
                ),
            ),
        )

        val viewModel = StethoscopeSettingsViewModel(repository)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(StethoscopeSettingsLoadState.Ready, state.loadState)
        assertEquals("online", state.currentDevice?.id)
        assertFalse(state.isRefreshing)
        assertFalse(state.isStale)
        assertNull(state.errorMessage)
    }

    @Test
    fun emptyInventoryIsAnExplicitStateInsteadOfAFakeDevice() = runTest(dispatcher) {
        val repository = FakeStethoscopeDeviceRepository(
            responses = ArrayDeque(listOf(Result.success(emptyList()))),
        )

        val viewModel = StethoscopeSettingsViewModel(repository)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(StethoscopeSettingsLoadState.Empty, state.loadState)
        assertNull(state.currentDevice)
        assertNull(state.errorMessage)
    }

    @Test
    fun retryRecoversAnInitialFailureWithoutInventingSuccess() = runTest(dispatcher) {
        val repository = FakeStethoscopeDeviceRepository(
            responses = ArrayDeque(
                listOf(
                    Result.failure(IOException("offline")),
                    Result.success(listOf(SmartDevice(id = "device-1", online = false))),
                ),
            ),
        )
        val viewModel = StethoscopeSettingsViewModel(repository)
        runCurrent()

        assertEquals(
            StethoscopeSettingsLoadState.Error,
            viewModel.uiState.value.loadState,
        )
        assertTrue(viewModel.uiState.value.errorMessage?.isNotBlank() == true)

        viewModel.onAction(StethoscopeSettingsUiAction.Refresh)
        runCurrent()

        assertEquals(StethoscopeSettingsLoadState.Ready, viewModel.uiState.value.loadState)
        assertEquals("device-1", viewModel.uiState.value.currentDevice?.id)
        assertEquals(2, repository.calls)
        assertTrue(viewModel.uiState.value.statusMessage?.isNotBlank() == true)
    }

    @Test
    fun refreshFailureRetainsTheLastConfirmedDeviceAndMarksItStale() = runTest(dispatcher) {
        val repository = FakeStethoscopeDeviceRepository(
            responses = ArrayDeque(
                listOf(
                    Result.success(listOf(SmartDevice(id = "device-1", online = true))),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = StethoscopeSettingsViewModel(repository)
        runCurrent()

        viewModel.onAction(StethoscopeSettingsUiAction.Refresh)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(StethoscopeSettingsLoadState.Ready, state.loadState)
        assertEquals("device-1", state.currentDevice?.id)
        assertTrue(state.isStale)
        assertTrue(state.errorMessage?.isNotBlank() == true)
        assertNull(state.statusMessage)
    }
}

private class FakeStethoscopeDeviceRepository(
    private val responses: ArrayDeque<Result<List<SmartDevice>>>,
) : StethoscopeDeviceRepository {
    var calls = 0

    override suspend fun listDevices(): List<SmartDevice> {
        calls += 1
        return responses.removeFirst().getOrThrow()
    }
}
