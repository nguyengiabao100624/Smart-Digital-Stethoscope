package com.example.smart_health_android.devices

import com.example.smart_health_android.R
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import com.example.smart_health_android.data.DevicePairingResponse
import com.example.smart_health_android.data.DevicePairingState
import com.example.smart_health_android.data.SmartDevice
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.IOException
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class DevicePairingViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val now = Instant.parse("2026-07-18T00:00:00Z")

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun secureQrClaimsFirstThenStopsAtSetupReadyWithoutPollingPresence() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(1, repository.claimCalls)
        assertEquals("QR", repository.lastConnectionMethod)
        assertEquals(0, repository.listCalls)
        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(DeviceSetupCapability.SecureQrV1, viewModel.uiState.value.setupCapability)
        assertEquals("Shcare-9487FC14F3E6", viewModel.uiState.value.setupSsid)
        assertEquals("4hxulJ_mCLIz2XhP-KXh", viewModel.uiState.value.setupProofOfPossession)
    }

    @Test
    fun acceptedPairingNeverInfersOnlineFromTheDeviceFlag() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(
                id = "dev_alpha",
                name = "Shcare Alpha",
                connected = true,
                online = true,
            ),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertFalse(viewModel.uiState.value.isBusy)
        assertEquals(0, repository.listCalls)
        assertTrue(viewModel.uiState.value.setupProofOfPossession.isNotBlank())
    }

    @Test
    fun backendConfirmedOnlinePairingCompletesWithoutFallbackPolling() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(
                id = "dev_alpha",
                name = "Shcare Alpha",
                connected = true,
                online = true,
            ),
            pairingState = DevicePairingState(
                outcome = DevicePairingOutcome.Success,
                presence = DevicePairingPresence.Online,
                onlineConfirmed = true,
                authenticatedTransport = "wss",
            ),
        )
        val viewModel = secureViewModel(repository)
        val onlineEffect = async { viewModel.effects.first() }

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.Online, viewModel.uiState.value.stage)
        assertEquals(0, repository.listCalls)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals(DevicePairingUiEffect.DeviceOnlineConfirmed("Shcare Alpha"), onlineEffect.await())
    }

    @Test
    fun onlineConfirmationWithOfflineDeviceFailsClosed() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false),
            pairingState = DevicePairingState(
                outcome = DevicePairingOutcome.Success,
                presence = DevicePairingPresence.Online,
                onlineConfirmed = true,
                authenticatedTransport = "wss",
            ),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(R.string.device_pairing_backend_error, viewModel.uiState.value.errorMessageRes)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals(0, repository.listCalls)
    }

    @Test
    fun qrFlowOnlyPollsAfterWifiReturnPortalGuidanceAndExplicitConfirmation() = runTest(dispatcher) {
        val offline = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false)
        val online = offline.copy(online = true)
        val repository = FakeDeviceClaimRepository(
            claimResult = offline,
            deviceSnapshots = ArrayDeque(listOf(listOf(online))),
        )
        val viewModel = secureViewModel(repository, onlineRetryDelaysMillis = listOf(0L))

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        val wifiEffect = async { viewModel.effects.first() }
        viewModel.onAction(DevicePairingUiAction.OpenWifiSettings)
        runCurrent()
        assertEquals(DevicePairingUiEffect.OpenSystemWifiSettings, wifiEffect.await())
        assertEquals(DevicePairingStage.OpeningWifi, viewModel.uiState.value.stage)
        assertEquals(0, repository.listCalls)

        viewModel.onAction(DevicePairingUiAction.WifiSettingsReturned)
        assertEquals(DevicePairingStage.PortalGuidance, viewModel.uiState.value.stage)
        assertEquals(0, repository.listCalls)

        val portalEffect = async { viewModel.effects.first() }
        viewModel.onAction(DevicePairingUiAction.OpenSetupPortal)
        runCurrent()
        assertEquals(
            DevicePairingUiEffect.OpenExternalSetupPortal("http://192.168.4.1"),
            portalEffect.await(),
        )
        assertEquals(0, repository.listCalls)

        val onlineEffect = async { viewModel.effects.first() }
        viewModel.onAction(DevicePairingUiAction.PortalSetupConfirmed)
        runCurrent()

        assertEquals(1, repository.listCalls)
        assertEquals(DevicePairingStage.Online, viewModel.uiState.value.stage)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals(DevicePairingUiEffect.DeviceOnlineConfirmed("Shcare Alpha"), onlineEffect.await())
    }

    @Test
    fun portalConfirmationIsIgnoredUntilSystemWifiHasReturned() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val viewModel = secureViewModel(repository, onlineRetryDelaysMillis = listOf(0L))

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()
        viewModel.onAction(DevicePairingUiAction.PortalSetupConfirmed)
        runCurrent()

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(0, repository.listCalls)
        assertTrue(viewModel.uiState.value.setupProofOfPossession.isNotBlank())
    }

    @Test
    fun failedSystemWifiLaunchReturnsToSetupWithoutPollingOrLosingOneTimeProof() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()
        viewModel.onAction(DevicePairingUiAction.OpenWifiSettings)
        runCurrent()
        viewModel.onAction(DevicePairingUiAction.WifiSettingsLaunchFailed)

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(0, repository.listCalls)
        assertEquals("4hxulJ_mCLIz2XhP-KXh", viewModel.uiState.value.setupProofOfPossession)
    }

    @Test
    fun manualEntryIsClaimOnlyAndNeverExposesOrPretendsWifiSetup() = runTest(dispatcher) {
        val offline = SmartDevice(id = "DEV_001", name = "Legacy device", online = false)
        val online = offline.copy(online = true)
        val repository = FakeDeviceClaimRepository(
            claimResult = offline,
            deviceSnapshots = ArrayDeque(listOf(listOf(online))),
        )
        val viewModel = secureViewModel(repository, onlineRetryDelaysMillis = listOf(10_000L))

        viewModel.onAction(DevicePairingUiAction.DeviceIdChanged("DEV_001"))
        viewModel.onAction(DevicePairingUiAction.ClaimCodeChanged("Claim_aB12"))
        viewModel.onAction(DevicePairingUiAction.SubmitManual)
        runCurrent()

        assertEquals("Claim_aB12", repository.lastPayload?.claimCode)
        assertEquals("Manual", repository.lastConnectionMethod)
        assertEquals(DevicePairingStage.AwaitingOnline, viewModel.uiState.value.stage)
        assertEquals(DeviceSetupCapability.ClaimOnly, viewModel.uiState.value.setupCapability)
        assertTrue(viewModel.uiState.value.isManualClaimOnly)
        assertEquals("", viewModel.uiState.value.setupSsid)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals(0, repository.listCalls)

        advanceTimeBy(10_000L)
        runCurrent()
        assertEquals(DevicePairingStage.Online, viewModel.uiState.value.stage)
    }

    @Test
    fun setupProofIsClearedAutomaticallyAtQrExpiry() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(
            DevicePairingUiAction.QrScanned(
                secureQr(expiresAt = "2026-07-18T00:00:01Z"),
            ),
        )
        runCurrent()
        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertTrue(viewModel.uiState.value.setupProofOfPossession.isNotBlank())

        advanceTimeBy(1_000L)
        runCurrent()

        assertEquals(DevicePairingStage.Entry, viewModel.uiState.value.stage)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals(R.string.device_pairing_setup_expired, viewModel.uiState.value.errorMessageRes)
    }

    @Test
    fun cancelClearsAllOneTimeSetupMaterialAndStopsPolling() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()
        viewModel.onAction(DevicePairingUiAction.Cancel)

        assertEquals(DevicePairingStage.Entry, viewModel.uiState.value.stage)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals("", viewModel.uiState.value.setupSsid)
        assertEquals("", viewModel.uiState.value.claimedDeviceId)
    }

    @Test
    fun failedClaimCanRetryWithTheSameIdempotencyKeyAndSetupProof() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
            claimFailuresRemaining = 1,
        )
        val viewModel = secureViewModel(
            repository,
            idempotencyKeyFactory = { "pair-key-stable" },
        )

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertTrue(viewModel.uiState.value.canRetryClaim)
        assertEquals("4hxulJ_mCLIz2XhP-KXh", viewModel.uiState.value.setupProofOfPossession)

        viewModel.onAction(DevicePairingUiAction.RetryClaim)
        runCurrent()

        assertEquals(listOf("pair-key-stable", "pair-key-stable"), repository.idempotencyKeys)
        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
    }

    @Test
    fun mismatchedClaimResponseFailsClosedAndClearsSetupProof() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev-other", online = true),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(R.string.device_pairing_identity_mismatch, viewModel.uiState.value.errorMessageRes)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertFalse(viewModel.uiState.value.canRetryClaim)
        assertEquals(0, repository.listCalls)
    }

    @Test
    fun pairingOutcomeDriftFailsClosedAndNeverStartsPresencePolling() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false),
            pairingState = DevicePairingState(
                outcome = DevicePairingOutcome.Success,
                presence = DevicePairingPresence.AwaitingOnline,
                onlineConfirmed = false,
            ),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(R.string.device_pairing_backend_error, viewModel.uiState.value.errorMessageRes)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertFalse(viewModel.uiState.value.canRetryClaim)
        assertEquals(0, repository.listCalls)
    }

    @Test
    fun onlinePollingFailureRemainsHonestAndRetryableAfterPortalConfirmation() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
            listFailuresRemaining = 1,
        )
        val viewModel = secureViewModel(repository, onlineRetryDelaysMillis = listOf(0L))

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()
        viewModel.onAction(DevicePairingUiAction.OpenWifiSettings)
        runCurrent()
        viewModel.onAction(DevicePairingUiAction.WifiSettingsReturned)
        viewModel.onAction(DevicePairingUiAction.PortalSetupConfirmed)
        runCurrent()

        assertEquals(DevicePairingStage.Offline, viewModel.uiState.value.stage)
        assertTrue(viewModel.uiState.value.canRetryOnline)
        assertEquals(R.string.device_pairing_presence_offline, viewModel.uiState.value.errorMessageRes)
    }

    private fun secureViewModel(
        repository: DeviceClaimRepository,
        idempotencyKeyFactory: () -> String = { "pair-key-1" },
        onlineRetryDelaysMillis: List<Long> = listOf(0L),
    ) = DevicePairingViewModel(
        repository = repository,
        idempotencyKeyFactory = idempotencyKeyFactory,
        onlineRetryDelaysMillis = onlineRetryDelaysMillis,
        nowMillis = { now.toEpochMilli() },
    )

    private fun secureQr(expiresAt: String = "2026-07-19T00:00:00Z"): String =
        """
        {
          "type": "shcare.device.setup",
          "protocolVersion": 1,
          "deviceId": "dev_alpha",
          "claimCode": "Claim_aB12",
          "claimExpiresAt": "$expiresAt",
          "setupAp": {
            "ssid": "Shcare-9487FC14F3E6",
            "security": "WPA2_PSK",
            "proofOfPossession": "4hxulJ_mCLIz2XhP-KXh"
          }
        }
        """.trimIndent()
}

private class FakeDeviceClaimRepository(
    private val claimResult: SmartDevice = SmartDevice(id = "dev_alpha"),
    private val pairingState: DevicePairingState = DevicePairingState(
        outcome = DevicePairingOutcome.Accepted,
        presence = DevicePairingPresence.AwaitingOnline,
        onlineConfirmed = false,
    ),
    private val deviceSnapshots: ArrayDeque<List<SmartDevice>> = ArrayDeque(),
    private var claimFailuresRemaining: Int = 0,
    private var listFailuresRemaining: Int = 0,
) : DeviceClaimRepository {
    var claimCalls = 0
    var lastPayload: DeviceClaimPayload? = null
    var lastConnectionMethod = ""
    val idempotencyKeys = mutableListOf<String>()
    var listCalls = 0

    override suspend fun claimDevice(
        payload: DeviceClaimPayload,
        connectionMethod: String,
        idempotencyKey: String,
    ): DevicePairingResponse {
        claimCalls += 1
        lastPayload = payload
        lastConnectionMethod = connectionMethod
        idempotencyKeys += idempotencyKey
        if (claimFailuresRemaining > 0) {
            claimFailuresRemaining -= 1
            throw IOException("network unavailable")
        }
        return DevicePairingResponse(
            device = claimResult,
            pairing = pairingState,
        )
    }

    override suspend fun listDevices(): List<SmartDevice> {
        listCalls += 1
        if (listFailuresRemaining > 0) {
            listFailuresRemaining -= 1
            throw IOException("presence unavailable")
        }
        return if (deviceSnapshots.isEmpty()) listOf(claimResult) else deviceSnapshots.removeFirst()
    }
}
