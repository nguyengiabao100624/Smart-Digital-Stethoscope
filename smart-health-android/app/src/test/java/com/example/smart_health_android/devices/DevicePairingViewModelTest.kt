package com.example.smart_health_android.devices

import com.example.smart_health_android.R
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import com.example.smart_health_android.data.DevicePairingResponse
import com.example.smart_health_android.data.DevicePairingState
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
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
    private val authority = DevicePairingAuthoritySnapshot.create(
        userId = "user-1",
        workspaceId = "workspace-1",
        authorityEpoch = 1L,
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
        assertEquals(DeviceSetupCapability.SecureSetupV1, viewModel.uiState.value.setupCapability)
        assertEquals("Shcare-9487FC14F3E6", viewModel.uiState.value.setupSsid)
        assertEquals("4hxulJ_mCLIz2XhP-KXh", viewModel.uiState.value.setupProofOfPossession)
    }

    @Test
    fun inAppProvisioningSendsWifiToEspThenWaitsForAuthenticatedOnlinePresence() =
        runTest(dispatcher) {
            val offline = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false)
            val online = offline.copy(online = true)
            val repository = FakeDeviceClaimRepository(
                claimResult = offline,
                deviceSnapshots = ArrayDeque(listOf(listOf(online))),
            )
            val provisioner = FakeDeviceWifiProvisioner()
            val viewModel = secureViewModel(
                repository = repository,
                provisioner = provisioner,
                onlineRetryDelaysMillis = listOf(0L),
            )
            val onlineEffect = async { viewModel.effects.first() }

            viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
            runCurrent()
            viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
            viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
            viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
            runCurrent()

            assertEquals(1, provisioner.calls)
            assertEquals("dev_alpha", provisioner.lastRequest?.deviceId)
            assertEquals("Shcare-9487FC14F3E6", provisioner.lastRequest?.setupSsid)
            assertEquals("4hxulJ_mCLIz2XhP-KXh", provisioner.lastRequest?.setupPassphrase)
            assertEquals("Home WiFi", provisioner.lastRequest?.targetSsid)
            assertEquals("home-pass-123", provisioner.lastRequest?.targetPassword)
            assertEquals(1, repository.listCalls)
            assertEquals(DevicePairingStage.Online, viewModel.uiState.value.stage)
            assertEquals("", viewModel.uiState.value.targetWifiPassword)
            assertEquals("", viewModel.uiState.value.setupProofOfPossession)
            assertEquals(
                DevicePairingUiEffect.DeviceOnlineConfirmed("Shcare Alpha"),
                onlineEffect.await(),
            )
        }

    @Test
    fun deniedNearbyWifiPermissionIsReportedAfterReturningFromBrowserFallback() =
        runTest(dispatcher) {
            val repository = FakeDeviceClaimRepository(
                claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false),
            )
            val permissions = listOf("android.permission.NEARBY_WIFI_DEVICES")
            val provisioner = FakeDeviceWifiProvisioner(
                availability = DeviceWifiProvisioningAvailability.PermissionRequired(permissions),
            )
            val viewModel = secureViewModel(repository, provisioner = provisioner)

            viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
            runCurrent()
            val settingsEffect = async { viewModel.effects.first() }
            viewModel.onAction(DevicePairingUiAction.OpenWifiSettings)
            runCurrent()
            assertEquals(DevicePairingUiEffect.OpenSystemWifiSettings, settingsEffect.await())
            viewModel.onAction(DevicePairingUiAction.WifiSettingsReturned)
            assertEquals(DevicePairingStage.PortalGuidance, viewModel.uiState.value.stage)

            viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
            viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
            val permissionEffect = async { viewModel.effects.first() }
            viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
            runCurrent()
            assertEquals(
                DevicePairingUiEffect.RequestNearbyWifiPermissions(permissions),
                permissionEffect.await(),
            )

            viewModel.onAction(DevicePairingUiAction.NearbyWifiPermissionResult(false))

            assertEquals(DevicePairingStage.PortalGuidance, viewModel.uiState.value.stage)
            assertEquals(DevicePairingFailureKind.Permission, viewModel.uiState.value.failureKind)
            assertEquals(
                R.string.device_pairing_nearby_wifi_permission_denied,
                viewModel.uiState.value.errorMessageRes,
            )
            assertEquals(0, provisioner.calls)
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
    fun lateClaimResponseAfterAuthorityEpochChangeIsQuarantined() = runTest(dispatcher) {
        val claimGate = CompletableDeferred<Unit>()
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha"),
            claimGate = claimGate,
        )
        var currentAuthority = authority
        val viewModel = secureViewModel(
            repository = repository,
            currentAuthority = { currentAuthority },
        )

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()
        currentAuthority = DevicePairingAuthoritySnapshot.create(
            userId = "user-1",
            workspaceId = "workspace-1",
            authorityEpoch = 2L,
        )
        claimGate.complete(Unit)
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DevicePairingFailureKind.Session, viewModel.uiState.value.failureKind)
        assertEquals(R.string.device_pairing_session_expired, viewModel.uiState.value.errorMessageRes)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals(0, repository.listCalls)
    }

    @Test
    fun pairingReceiptFromAnotherWorkspaceFailsClosed() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(
                id = "dev_alpha",
                name = "Other tenant device",
                organizationId = "workspace-other",
            ),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(R.string.device_pairing_identity_mismatch, viewModel.uiState.value.errorMessageRes)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
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
    fun manualSetupPayloadClaimsThenRequiresTheSameSecureApFlow() = runTest(dispatcher) {
        val offline = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false)
        val repository = FakeDeviceClaimRepository(
            claimResult = offline,
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.ManualDeviceIdChanged("dev_alpha"))
        viewModel.onAction(DevicePairingUiAction.ManualClaimCodeChanged("Claim_aB12"))
        viewModel.onAction(DevicePairingUiAction.ManualSetupSsidChanged("Shcare-9487FC14F3E6"))
        viewModel.onAction(DevicePairingUiAction.ManualProofChanged("4hxulJ_mCLIz2XhP-KXh"))
        viewModel.onAction(DevicePairingUiAction.SubmitManual)
        runCurrent()

        assertEquals("Claim_aB12", repository.lastPayload?.claimCode)
        assertEquals("Manual", repository.lastConnectionMethod)
        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(DeviceSetupCapability.SecureSetupV1, viewModel.uiState.value.setupCapability)
        assertEquals("", viewModel.uiState.value.manualDeviceId)
        assertEquals("", viewModel.uiState.value.manualClaimCode)
        assertEquals("", viewModel.uiState.value.manualSetupSsid)
        assertEquals("", viewModel.uiState.value.manualProofOfPossession)
        assertEquals("Shcare-9487FC14F3E6", viewModel.uiState.value.setupSsid)
        assertEquals("4hxulJ_mCLIz2XhP-KXh", viewModel.uiState.value.setupProofOfPossession)
        assertEquals(0, repository.listCalls)
    }

    @Test
    fun manualFormReportsFieldErrorsBeforeAnyBackendMutation() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository()
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.SubmitManual)

        assertEquals(0, repository.claimCalls)
        assertEquals(
            setOf(
                DeviceManualSetupField.DeviceId,
                DeviceManualSetupField.ClaimCode,
                DeviceManualSetupField.SetupSsid,
                DeviceManualSetupField.ProofOfPossession,
            ),
            viewModel.uiState.value.manualFieldErrors,
        )

        viewModel.onAction(DevicePairingUiAction.ManualDeviceIdChanged("dev_alpha"))

        assertFalse(DeviceManualSetupField.DeviceId in viewModel.uiState.value.manualFieldErrors)
        assertTrue(DeviceManualSetupField.ClaimCode in viewModel.uiState.value.manualFieldErrors)
    }

    @Test
    fun manualSetupMaterialExpiresLocallyAfterFifteenMinutes() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.ManualDeviceIdChanged("dev_alpha"))
        viewModel.onAction(DevicePairingUiAction.ManualClaimCodeChanged("Claim_aB12"))
        viewModel.onAction(DevicePairingUiAction.ManualSetupSsidChanged("Shcare-9487FC14F3E6"))
        viewModel.onAction(DevicePairingUiAction.ManualProofChanged("4hxulJ_mCLIz2XhP-KXh"))
        viewModel.onAction(DevicePairingUiAction.SubmitManual)
        runCurrent()

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        advanceTimeBy(15L * 60L * 1_000L)
        runCurrent()

        assertEquals(DevicePairingStage.Entry, viewModel.uiState.value.stage)
        assertEquals(R.string.device_pairing_setup_expired, viewModel.uiState.value.errorMessageRes)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
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
    fun deniedClaimIsNotRetryableAndClearsOneTimeSetupMaterial() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimError = SmartHealthApiException(
                statusCode = 403,
                code = "DEVICE_CLAIM_CAPABILITY_REQUIRED",
                requestId = "req-pair-denied",
                message = "forbidden",
            ),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(R.string.device_pairing_permission_denied, viewModel.uiState.value.errorMessageRes)
        assertEquals(DevicePairingFailureKind.Permission, viewModel.uiState.value.failureKind)
        assertEquals("req-pair-denied", viewModel.uiState.value.requestId)
        assertFalse(viewModel.uiState.value.canRetryClaim)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals("", viewModel.uiState.value.setupSsid)
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

    @Test
    fun revokedSessionDuringOnlineConfirmationFailsClosedAndClearsSetupProof() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
            listError = SmartHealthApiException(
                statusCode = 401,
                code = "AUTH_SESSION_REVOKED",
                requestId = "req-presence-session",
                message = "session revoked",
            ),
        )
        val viewModel = secureViewModel(repository, onlineRetryDelaysMillis = listOf(0L))

        advanceToOnlineConfirmation(viewModel)

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DevicePairingFailureKind.Session, viewModel.uiState.value.failureKind)
        assertEquals(R.string.device_pairing_session_expired, viewModel.uiState.value.errorMessageRes)
        assertEquals("req-presence-session", viewModel.uiState.value.requestId)
        assertFalse(viewModel.uiState.value.canRetryOnline)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals("", viewModel.uiState.value.setupSsid)
    }

    @Test
    fun revokedCapabilityDuringOnlineConfirmationFailsClosedAndClearsSetupProof() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
            listError = SmartHealthApiException(
                statusCode = 403,
                code = "DEVICE_CLAIM_CAPABILITY_REQUIRED",
                requestId = "req-presence-permission",
                message = "forbidden",
            ),
        )
        val viewModel = secureViewModel(repository, onlineRetryDelaysMillis = listOf(0L))

        advanceToOnlineConfirmation(viewModel)

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DevicePairingFailureKind.Permission, viewModel.uiState.value.failureKind)
        assertEquals(R.string.device_pairing_permission_denied, viewModel.uiState.value.errorMessageRes)
        assertEquals("req-presence-permission", viewModel.uiState.value.requestId)
        assertFalse(viewModel.uiState.value.canRetryOnline)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals("", viewModel.uiState.value.setupSsid)
    }

    private fun advanceToOnlineConfirmation(viewModel: DevicePairingViewModel) {
        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        dispatcher.scheduler.runCurrent()
        viewModel.onAction(DevicePairingUiAction.OpenWifiSettings)
        dispatcher.scheduler.runCurrent()
        viewModel.onAction(DevicePairingUiAction.WifiSettingsReturned)
        viewModel.onAction(DevicePairingUiAction.PortalSetupConfirmed)
        dispatcher.scheduler.runCurrent()
    }

    private fun secureViewModel(
        repository: DeviceClaimRepository,
        provisioner: DeviceWifiProvisioner = UnsupportedDeviceWifiProvisioner,
        currentAuthority: () -> DevicePairingAuthoritySnapshot? = { authority },
        idempotencyKeyFactory: () -> String = { "pair-key-1" },
        onlineRetryDelaysMillis: List<Long> = listOf(0L),
    ) = DevicePairingViewModel(
        repository = repository,
        provisioner = provisioner,
        expectedAuthority = authority,
        currentAuthority = currentAuthority,
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

private class FakeDeviceWifiProvisioner(
    private val availability: DeviceWifiProvisioningAvailability =
        DeviceWifiProvisioningAvailability.Available,
) : DeviceWifiProvisioner {
    var calls = 0
    var lastRequest: DeviceWifiProvisioningRequest? = null

    override fun availability(): DeviceWifiProvisioningAvailability =
        availability

    override suspend fun provision(request: DeviceWifiProvisioningRequest) {
        calls += 1
        lastRequest = request
    }
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
    private val claimError: Throwable? = null,
    private val listError: Throwable? = null,
    private val claimGate: CompletableDeferred<Unit>? = null,
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
        claimGate?.await()
        claimError?.let { throw it }
        if (claimFailuresRemaining > 0) {
            claimFailuresRemaining -= 1
            throw IOException("network unavailable")
        }
        return DevicePairingResponse(
            device = claimResult.withDefaultWorkspace(),
            pairing = pairingState,
        )
    }

    override suspend fun listDevices(): List<SmartDevice> {
        listCalls += 1
        listError?.let { throw it }
        if (listFailuresRemaining > 0) {
            listFailuresRemaining -= 1
            throw IOException("presence unavailable")
        }
        return (if (deviceSnapshots.isEmpty()) listOf(claimResult) else deviceSnapshots.removeFirst())
            .map { device -> device.withDefaultWorkspace() }
    }

    private fun SmartDevice.withDefaultWorkspace(): SmartDevice =
        if (organizationId.isBlank()) copy(organizationId = "workspace-1") else this
}
