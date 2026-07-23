package com.example.smart_health_android.devices

import com.example.smart_health_android.data.SmartDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class DeviceManagementViewModelTest {
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
    fun initialLoadSelectsCanonicalOnlineDeviceBeforeConnectedOnlyDevice() = runTest(dispatcher) {
        val connectedOnly = SmartDevice(id = "dev-connected", connected = true, online = false)
        val online = SmartDevice(id = "dev-online", connected = false, online = true)
        val repository = FakeDeviceManagementRepository(devices = mutableListOf(connectedOnly, online))
        val viewModel = DeviceManagementViewModel(repository)

        viewModel.onAction(DeviceManagementUiAction.ScreenOpened)
        advanceUntilIdle()

        assertEquals(listOf(connectedOnly, online), viewModel.uiState.value.devices)
        assertEquals("dev-online", viewModel.uiState.value.selectedDeviceId)
        assertTrue(viewModel.uiState.value.hasLoaded)
        assertFalse(viewModel.uiState.value.isLoading)
        assertNull(viewModel.uiState.value.failure)
    }

    @Test
    fun initialIoFailureProducesExplicitOfflineStateWithoutFakeDevices() = runTest(dispatcher) {
        val repository = FakeDeviceManagementRepository(listFailure = IOException("network unavailable"))
        val viewModel = DeviceManagementViewModel(repository)

        viewModel.onAction(DeviceManagementUiAction.ScreenOpened)
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.devices.isEmpty())
        assertEquals(DeviceManagementFailureKind.Offline, viewModel.uiState.value.failure?.kind)
        assertTrue(viewModel.uiState.value.hasLoaded)
    }

    @Test
    fun refreshFailureKeepsConfirmedDataAndMarksItStale() = runTest(dispatcher) {
        val online = SmartDevice(id = "dev-online", online = true)
        val repository = FakeDeviceManagementRepository(devices = mutableListOf(online))
        val viewModel = DeviceManagementViewModel(repository)

        viewModel.onAction(DeviceManagementUiAction.ScreenOpened)
        advanceUntilIdle()
        repository.listFailure = IOException("offline")
        viewModel.onAction(DeviceManagementUiAction.Refresh)
        advanceUntilIdle()

        assertEquals(listOf(online), viewModel.uiState.value.devices)
        assertTrue(viewModel.uiState.value.hasStaleData)
        assertEquals(DeviceManagementFailureKind.Offline, viewModel.uiState.value.failure?.kind)
        assertEquals(DeviceManagementOperation.Refresh, viewModel.uiState.value.failure?.operation)
    }

    @Test
    fun disconnectOnlyAppliesTheDeviceReturnedByBackend() = runTest(dispatcher) {
        val online = SmartDevice(id = "dev-online", online = true)
        val confirmed = online.copy(online = false, status = "disconnected")
        val repository = FakeDeviceManagementRepository(
            devices = mutableListOf(online),
            disconnectResult = confirmed,
        )
        val viewModel = DeviceManagementViewModel(repository)

        viewModel.onAction(DeviceManagementUiAction.ScreenOpened)
        advanceUntilIdle()
        viewModel.onAction(DeviceManagementUiAction.Disconnect("dev-online"))

        assertEquals("dev-online", viewModel.uiState.value.disconnectingDeviceId)
        assertTrue(viewModel.uiState.value.devices.single().online)
        advanceUntilIdle()

        assertEquals(confirmed, viewModel.uiState.value.devices.single())
        assertEquals("", viewModel.uiState.value.disconnectingDeviceId)
        assertEquals(listOf("dev-online"), repository.disconnectCalls)
    }

    @Test
    fun unconfirmedDeleteDoesNotRemoveTheDeviceLocally() = runTest(dispatcher) {
        val device = SmartDevice(id = "dev-001")
        val repository = FakeDeviceManagementRepository(
            devices = mutableListOf(device),
            deleteResult = false,
        )
        val viewModel = DeviceManagementViewModel(repository)

        viewModel.onAction(DeviceManagementUiAction.ScreenOpened)
        advanceUntilIdle()
        viewModel.onAction(DeviceManagementUiAction.Delete("dev-001"))
        advanceUntilIdle()

        assertEquals(listOf(device), viewModel.uiState.value.devices)
        assertEquals(DeviceManagementFailureKind.Error, viewModel.uiState.value.failure?.kind)
        assertEquals(DeviceManagementOperation.Delete, viewModel.uiState.value.failure?.operation)
        assertEquals(listOf("dev-001"), repository.deleteCalls)
    }

    @Test
    fun selectionOnlyChangesToADeviceReturnedByBackend() = runTest(dispatcher) {
        val first = SmartDevice(id = "dev-001")
        val second = SmartDevice(id = "dev-002")
        val viewModel = DeviceManagementViewModel(
            FakeDeviceManagementRepository(devices = mutableListOf(first, second)),
        )

        viewModel.onAction(DeviceManagementUiAction.ScreenOpened)
        advanceUntilIdle()
        viewModel.onAction(DeviceManagementUiAction.SelectDevice("dev-002"))
        assertEquals("dev-002", viewModel.uiState.value.selectedDeviceId)

        viewModel.onAction(DeviceManagementUiAction.SelectDevice("missing"))
        assertEquals("dev-002", viewModel.uiState.value.selectedDeviceId)
    }
}

private class FakeDeviceManagementRepository(
    val devices: MutableList<SmartDevice> = mutableListOf(),
    var listFailure: Throwable? = null,
    var disconnectResult: SmartDevice? = null,
    var deleteResult: Boolean = true,
) : DeviceManagementRepository {
    val disconnectCalls = mutableListOf<String>()
    val deleteCalls = mutableListOf<String>()

    override suspend fun listDevices(): List<SmartDevice> {
        listFailure?.let { throw it }
        return devices.toList()
    }

    override suspend fun disconnectDevice(deviceId: String): SmartDevice {
        disconnectCalls += deviceId
        return disconnectResult ?: error("Missing disconnect result")
    }

    override suspend fun deleteDevice(deviceId: String): Boolean {
        deleteCalls += deviceId
        return deleteResult
    }
}
