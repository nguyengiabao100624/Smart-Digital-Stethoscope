package com.example.smart_health_android.devices

import com.example.smart_health_android.R
import com.example.smart_health_android.data.DeviceAccessGrant
import com.example.smart_health_android.data.DeviceAccessLevel
import com.example.smart_health_android.data.DeviceAccessRedeemResponse
import com.example.smart_health_android.data.SmartDevice
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DeviceAccessRedeemViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val authority = DevicePairingAuthoritySnapshot.create(
        userId = "doctor-1",
        workspaceId = "workspace-1",
        authorityEpoch = 4L,
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun validCodeEmitsOnlyTheBackendConfirmedDevice() = runTest(dispatcher) {
        val repository = FakeDeviceAccessRedeemRepository(result = validResponse())
        val viewModel = viewModel(repository)
        val effect = async { viewModel.effects.first() }

        viewModel.onAction(DeviceAccessRedeemUiAction.CodeChanged("shc abcd efgh jklm npqr"))
        viewModel.onAction(DeviceAccessRedeemUiAction.Submit)
        advanceUntilIdle()

        assertEquals(
            DeviceAccessRedeemUiEffect.DeviceGranted("device-1", "Shcare One"),
            effect.await(),
        )
        assertEquals(listOf("SHC-ABCD-EFGH-JKLM-NPQR" to "intent-1"), repository.calls)
        assertEquals("", viewModel.uiState.value.code)
    }

    @Test
    fun invalidManualDeviceIdNeverCallsTheBackend() = runTest(dispatcher) {
        val repository = FakeDeviceAccessRedeemRepository(result = validResponse())
        val viewModel = viewModel(repository)

        viewModel.onAction(DeviceAccessRedeemUiAction.CodeChanged("device-1"))
        viewModel.onAction(DeviceAccessRedeemUiAction.Submit)
        advanceUntilIdle()

        assertEquals(R.string.device_access_code_invalid, viewModel.uiState.value.errorMessageRes)
        assertFalse(viewModel.uiState.value.isSubmitting)
        assertEquals(emptyList<Pair<String, String>>(), repository.calls)
    }

    @Test
    fun retryUsesTheSameIdempotencyKeyUntilTheCodeChanges() = runTest(dispatcher) {
        val repository = FakeDeviceAccessRedeemRepository(
            result = validResponse(),
            failuresRemaining = 1,
        )
        val viewModel = viewModel(repository)
        viewModel.onAction(DeviceAccessRedeemUiAction.CodeChanged("SHC-ABCD-EFGH-JKLM-NPQR"))

        viewModel.onAction(DeviceAccessRedeemUiAction.Submit)
        advanceUntilIdle()
        viewModel.onAction(DeviceAccessRedeemUiAction.Submit)
        advanceUntilIdle()

        assertEquals(listOf("intent-1", "intent-1"), repository.calls.map { it.second })
    }

    @Test
    fun mismatchedWorkspaceFailsClosedWithoutNavigation() = runTest(dispatcher) {
        val mismatched = validResponse(
            organizationId = "workspace-other",
        )
        val viewModel = viewModel(FakeDeviceAccessRedeemRepository(mismatched))

        viewModel.onAction(DeviceAccessRedeemUiAction.QrScanned(
            "shcare://device-access?v=1&code=SHC-ABCD-EFGH-JKLM-NPQR",
        ))
        advanceUntilIdle()

        assertEquals(R.string.device_access_backend_error, viewModel.uiState.value.errorMessageRes)
        assertFalse(viewModel.uiState.value.isSubmitting)
    }

    private fun viewModel(repository: DeviceAccessRedeemRepository) =
        DeviceAccessRedeemViewModel(
            expectedAuthority = authority,
            currentAuthority = { authority },
            repository = repository,
            idempotencyKeyFactory = { "intent-1" },
        )

    private fun validResponse(
        organizationId: String = "workspace-1",
    ): DeviceAccessRedeemResponse {
        val grant = DeviceAccessGrant(
            id = "grant-1",
            deviceId = "device-1",
            organizationId = organizationId,
            userId = "doctor-1",
            accessLevel = DeviceAccessLevel.Viewer,
            status = "active",
            grantedAt = "2026-09-02T10:00:00.000Z",
        )
        return DeviceAccessRedeemResponse(
            device = SmartDevice(
                id = "device-1",
                name = "Shcare One",
                organizationId = organizationId,
                accessLevel = "viewer",
                accessGrantId = "grant-1",
            ),
            grant = grant,
            idempotent = false,
        )
    }
}

private class FakeDeviceAccessRedeemRepository(
    private val result: DeviceAccessRedeemResponse,
    private var failuresRemaining: Int = 0,
) : DeviceAccessRedeemRepository {
    val calls = mutableListOf<Pair<String, String>>()

    override suspend fun redeem(
        code: String,
        idempotencyKey: String,
    ): DeviceAccessRedeemResponse {
        calls += code to idempotencyKey
        if (failuresRemaining-- > 0) throw IOException("offline")
        return result
    }
}
