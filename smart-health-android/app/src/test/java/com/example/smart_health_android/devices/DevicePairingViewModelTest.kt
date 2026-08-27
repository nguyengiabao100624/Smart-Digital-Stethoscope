package com.example.smart_health_android.devices

import com.example.smart_health_android.R
import com.example.smart_health_android.data.DevicePairingOutcome
import com.example.smart_health_android.data.DevicePairingPresence
import com.example.smart_health_android.data.DevicePairingResponse
import com.example.smart_health_android.data.DevicePairingState
import com.example.smart_health_android.data.DeviceWifiSetupSession
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
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
    fun selectedQrImageUsesTheSameClaimContractAsTheCameraScanner() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false),
        )
        val decoder = FakeDeviceQrImageDecoder(
            DeviceQrImageDecodeResult.Decoded(secureQr()),
        )
        val viewModel = secureViewModel(
            repository = repository,
            qrImageDecoder = decoder,
        )

        viewModel.onAction(DevicePairingUiAction.QrImageSelected("content://picker/shcare-qr"))
        runCurrent()

        assertEquals(listOf("content://picker/shcare-qr"), decoder.requestedUris)
        assertEquals(1, repository.claimCalls)
        assertEquals("QR", repository.lastConnectionMethod)
        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertFalse(viewModel.uiState.value.isQrImageDecoding)
    }

    @Test
    fun imageWithoutQrStaysLocalAndDoesNotCallTheClaimApi() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository()
        val viewModel = secureViewModel(
            repository = repository,
            qrImageDecoder = FakeDeviceQrImageDecoder(DeviceQrImageDecodeResult.NoQrCode),
        )

        viewModel.onAction(DevicePairingUiAction.QrImageSelected("content://picker/no-qr"))
        runCurrent()

        assertEquals(0, repository.claimCalls)
        assertEquals(DevicePairingStage.Entry, viewModel.uiState.value.stage)
        assertEquals(
            R.string.device_pairing_qr_image_no_code,
            viewModel.uiState.value.errorMessageRes,
        )
        assertFalse(viewModel.uiState.value.isQrImageDecoding)
    }

    @Test
    fun currentPhoneWifiIsPrefilledOnlyAfterTheUserRequestsIt() = runTest(dispatcher) {
        val provisioner = FakeDeviceWifiProvisioner(
            currentWifiSsid = DeviceCurrentWifiSsid.Available("Home WiFi"),
        )
        val viewModel = secureViewModel(
            repository = FakeDeviceClaimRepository(),
            provisioner = provisioner,
        )

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals("", viewModel.uiState.value.targetWifiSsid)
        assertEquals(
            DeviceCurrentWifiSsidState.Idle,
            viewModel.uiState.value.currentWifiSsidState,
        )

        viewModel.onAction(DevicePairingUiAction.UseCurrentWifiSsid)
        runCurrent()

        assertEquals("Home WiFi", viewModel.uiState.value.targetWifiSsid)
        assertEquals(
            DeviceCurrentWifiSsidState.Detected,
            viewModel.uiState.value.currentWifiSsidState,
        )
    }

    @Test
    fun currentWifiPermissionIsRequestedOnlyAfterTheUserRequestsTheSsid() = runTest(dispatcher) {
        val permissions = wifiLocationPermissions()
        val provisioner = FakeDeviceWifiProvisioner(
            currentWifiSsid = DeviceCurrentWifiSsid.PermissionRequired(permissions),
        )
        val viewModel = secureViewModel(
            repository = FakeDeviceClaimRepository(),
            provisioner = provisioner,
        )
        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DeviceCurrentWifiSsidState.Idle, viewModel.uiState.value.currentWifiSsidState)
        val permissionEffect = async { viewModel.effects.first() }
        viewModel.onAction(DevicePairingUiAction.UseCurrentWifiSsid)
        runCurrent()

        assertEquals(
            DevicePairingUiEffect.RequestCurrentWifiSsidPermissions(permissions),
            permissionEffect.await(),
        )
        assertEquals(
            DeviceCurrentWifiSsidState.PermissionRequired,
            viewModel.uiState.value.currentWifiSsidState,
        )

        provisioner.currentWifiSsid = DeviceCurrentWifiSsid.Available("Home WiFi")
        viewModel.onAction(DevicePairingUiAction.CurrentWifiSsidPermissionResult(granted = true))
        runCurrent()

        assertEquals("Home WiFi", viewModel.uiState.value.targetWifiSsid)
        assertEquals(
            DeviceCurrentWifiSsidState.Detected,
            viewModel.uiState.value.currentWifiSsidState,
        )
    }

    @Test
    fun locationDisabledOffersSystemRecoveryOnlyAfterTheUserRequestsIt() = runTest(dispatcher) {
        val provisioner = FakeDeviceWifiProvisioner(
            currentWifiSsid = DeviceCurrentWifiSsid.LocationDisabled,
        )
        val viewModel = secureViewModel(
            repository = FakeDeviceClaimRepository(),
            provisioner = provisioner,
        )

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DeviceCurrentWifiSsidState.Idle, viewModel.uiState.value.currentWifiSsidState)
        viewModel.onAction(DevicePairingUiAction.UseCurrentWifiSsid)
        runCurrent()

        assertEquals(
            DeviceCurrentWifiSsidState.LocationDisabled,
            viewModel.uiState.value.currentWifiSsidState,
        )

        val settingsEffect = async { viewModel.effects.first() }
        viewModel.onAction(DevicePairingUiAction.UseCurrentWifiSsid)
        runCurrent()

        assertEquals(
            DevicePairingUiEffect.OpenSystemLocationSettings,
            settingsEffect.await(),
        )

        provisioner.currentWifiSsid = DeviceCurrentWifiSsid.Available("Home WiFi")
        viewModel.onAction(DevicePairingUiAction.ScreenStopped)
        viewModel.onAction(DevicePairingUiAction.ScreenStarted)
        runCurrent()

        assertEquals("Home WiFi", viewModel.uiState.value.targetWifiSsid)
        assertEquals(
            DeviceCurrentWifiSsidState.Detected,
            viewModel.uiState.value.currentWifiSsidState,
        )
    }

    @Test
    fun delayedCurrentWifiResultNeverOverwritesAnSsidEditedByTheUser() = runTest(dispatcher) {
        val permissions = wifiLocationPermissions()
        val provisioner = FakeDeviceWifiProvisioner(
            currentWifiSsid = DeviceCurrentWifiSsid.PermissionRequired(permissions),
        )
        val viewModel = secureViewModel(
            repository = FakeDeviceClaimRepository(),
            provisioner = provisioner,
        )
        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()
        val permissionEffect = async { viewModel.effects.first() }
        viewModel.onAction(DevicePairingUiAction.UseCurrentWifiSsid)
        runCurrent()
        permissionEffect.await()
        viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Wi-Fi nhập tay"))
        provisioner.currentWifiSsid = DeviceCurrentWifiSsid.Available("Home WiFi")
        viewModel.onAction(DevicePairingUiAction.CurrentWifiSsidPermissionResult(granted = true))
        runCurrent()

        assertEquals("Wi-Fi nhập tay", viewModel.uiState.value.targetWifiSsid)
        assertEquals(
            DeviceCurrentWifiSsidState.Manual,
            viewModel.uiState.value.currentWifiSsidState,
        )
    }

    @Test
    fun deniedCurrentWifiPermissionFallsBackToManualEntryWithoutBlockingPairing() =
        runTest(dispatcher) {
            val permissions = wifiLocationPermissions()
            val provisioner = FakeDeviceWifiProvisioner(
                currentWifiSsid = DeviceCurrentWifiSsid.PermissionRequired(permissions),
            )
            val viewModel = secureViewModel(
                repository = FakeDeviceClaimRepository(),
                provisioner = provisioner,
            )
            viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
            runCurrent()
            val permissionEffect = async { viewModel.effects.first() }
            viewModel.onAction(DevicePairingUiAction.UseCurrentWifiSsid)
            runCurrent()
            permissionEffect.await()
            viewModel.onAction(DevicePairingUiAction.CurrentWifiSsidPermissionResult(granted = false))

            assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
            assertEquals("", viewModel.uiState.value.targetWifiSsid)
            assertEquals(
                DeviceCurrentWifiSsidState.Unavailable,
                viewModel.uiState.value.currentWifiSsidState,
            )
            assertEquals(null, viewModel.uiState.value.errorMessageRes)
        }

    @Test
    fun qrResultWaitsForTransientForegroundReauthorizationBeforeClaiming() =
        runTest(dispatcher) {
            val repository = FakeDeviceClaimRepository(
                claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false),
            )
            var currentAuthority: DevicePairingAuthoritySnapshot? = null
            val viewModel = secureViewModel(
                repository = repository,
                currentAuthority = { currentAuthority },
                authorityRetryDelaysMillis = listOf(0L, 100L),
            )

            viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
            runCurrent()

            assertEquals(DevicePairingStage.Claiming, viewModel.uiState.value.stage)
            assertEquals(0, repository.claimCalls)

            currentAuthority = authority
            advanceTimeBy(100L)
            runCurrent()

            assertEquals(1, repository.claimCalls)
            assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
            assertEquals(DevicePairingFailureKind.None, viewModel.uiState.value.failureKind)
        }

    @Test
    fun consumedQrResumesSetupOnlyWhenBackendListsTheSameOwnedDevice() =
        runTest(dispatcher) {
            val repository = FakeDeviceClaimRepository(
                claimResult = SmartDevice(
                    id = "dev_alpha",
                    name = "Shcare Alpha",
                    ownerUserId = "user-1",
                    pairedUserId = "user-1",
                    online = false,
                ),
                claimError = SmartHealthApiException(
                    statusCode = 409,
                    code = "DEVICE_CLAIM_STATE_INVALID",
                    requestId = "req-consumed",
                    message = "already claimed",
                ),
            )
            val viewModel = secureViewModel(repository)

            viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
            runCurrent()

            assertEquals(1, repository.claimCalls)
            assertEquals(1, repository.listCalls)
            assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
            assertEquals("Shcare Alpha", viewModel.uiState.value.claimedDeviceName)
            assertTrue(viewModel.uiState.value.setupProofOfPossession.isNotBlank())
            assertEquals(DevicePairingFailureKind.None, viewModel.uiState.value.failureKind)
        }

    @Test
    fun consumedQrCannotResumeSetupForAnotherOwner() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(
                id = "dev_alpha",
                ownerUserId = "user-other",
                pairedUserId = "user-other",
            ),
            claimError = SmartHealthApiException(
                statusCode = 409,
                code = "DEVICE_CLAIM_STATE_INVALID",
                requestId = "req-other-owner",
                message = "already claimed",
            ),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.QrScanned(secureQr()))
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DevicePairingFailureKind.Conflict, viewModel.uiState.value.failureKind)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
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
            prepareEspTouchSetup(viewModel)
            viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
            viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
            val onlineEffect = async { viewModel.effects.first() }
            viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
            runCurrent()
            runCurrent()

            assertEquals(1, provisioner.calls)
            assertEquals("dev_alpha", provisioner.lastRequest?.deviceId)
            assertEquals(16, provisioner.lastRequest?.provisioningKey?.size)
            assertEquals(35, provisioner.lastRequest?.reservedData?.size)
            assertEquals("Home WiFi", provisioner.lastRequest?.targetSsid)
            assertEquals("home-pass-123", provisioner.lastRequest?.targetPassword)
            assertEquals(1, repository.listCalls)
            assertEquals(DevicePairingStage.Online, viewModel.uiState.value.stage)
            assertEquals(
                DeviceProvisioningProgress.DeviceOnline,
                viewModel.uiState.value.provisioningProgress,
            )
            assertEquals("", viewModel.uiState.value.targetWifiPassword)
            assertEquals("", viewModel.uiState.value.setupProofOfPossession)
            assertEquals(
                DevicePairingUiEffect.DeviceOnlineConfirmed("Shcare Alpha"),
                onlineEffect.await(),
            )
        }

    @Test
    fun completedBroadcastWithoutDirectAckStillChecksAuthenticatedDevicePresence() =
        runTest(dispatcher) {
            val repository = FakeDeviceClaimRepository(
                claimResult = SmartDevice(id = "dev_alpha", online = false),
                deviceSnapshots = ArrayDeque(listOf(listOf(SmartDevice(id = "dev_alpha", online = false)))),
            )
            val provisioner = FakeDeviceWifiProvisioner(
                broadcastResult =
                    DeviceSmartConfigBroadcastResult.BroadcastCompletedWithoutDirectResponse,
            )
            val viewModel = secureViewModel(
                repository = repository,
                provisioner = provisioner,
                onlineRetryDelaysMillis = listOf(0L),
            )

            prepareEspTouchSetup(viewModel)
            viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
            viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
            viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
            runCurrent()

            assertEquals(1, provisioner.calls)
            assertTrue(repository.listCalls >= 1)
            assertEquals(DevicePairingStage.AwaitingOnline, viewModel.uiState.value.stage)
            assertFalse(viewModel.uiState.value.isBusy)
            assertEquals(
                DeviceProvisioningProgress.DeviceNotOnlineWithoutDirectResponse,
                viewModel.uiState.value.provisioningProgress,
            )
        }

    @Test
    fun deniedWifiAccessPermissionIsReportedWithoutOpeningSystemWifiOrBrowser() =
        runTest(dispatcher) {
            val repository = FakeDeviceClaimRepository(
                claimResult = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false),
            )
            val permissions = wifiLocationPermissions()
            val provisioner = FakeDeviceWifiProvisioner(
                availability = DeviceWifiProvisioningAvailability.PermissionRequired(permissions),
            )
            val viewModel = secureViewModel(repository, provisioner = provisioner)

            prepareEspTouchSetup(viewModel)
            viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
            viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
            val permissionEffect = async { viewModel.effects.first() }
            viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
            runCurrent()
            assertEquals(
                DevicePairingUiEffect.RequestWifiAccessPermissions(permissions),
                permissionEffect.await(),
            )

            viewModel.onAction(DevicePairingUiAction.WifiAccessPermissionResult(false))

            assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
            assertEquals(DevicePairingFailureKind.Permission, viewModel.uiState.value.failureKind)
            assertEquals(
                R.string.device_pairing_wifi_access_permission_denied,
                viewModel.uiState.value.errorMessageRes,
            )
            assertEquals(0, provisioner.calls)
        }

    @Test
    fun inAppProvisioningExposesSafeProgressWhileSendingWifiToEsp() = runTest(dispatcher) {
        val provisionGate = CompletableDeferred<Unit>()
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val provisioner = FakeDeviceWifiProvisioner(
            progressBeforeCompletion = DeviceProvisioningProgress.BroadcastingCredentials,
            provisionGate = provisionGate,
        )
        val viewModel = secureViewModel(repository, provisioner = provisioner)

        prepareEspTouchSetup(viewModel)
        viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
        viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
        viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
        runCurrent()
        runCurrent()

        assertEquals(DevicePairingStage.Provisioning, viewModel.uiState.value.stage)
        assertEquals(
            DeviceProvisioningProgress.BroadcastingCredentials,
            viewModel.uiState.value.provisioningProgress,
        )

        provisionGate.complete(Unit)
    }

    @Test
    fun authenticatedPresenceFinishesWifiSetupWithoutWaitingForBroadcastTimeout() =
        runTest(dispatcher) {
            val broadcastGate = CompletableDeferred<Unit>()
            val offline = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false)
            val online = offline.copy(online = true)
            val repository = FakeDeviceClaimRepository(
                claimResult = offline,
                deviceSnapshots = ArrayDeque(listOf(listOf(online))),
            )
            val provisioner = FakeDeviceWifiProvisioner(
                progressBeforeCompletion = DeviceProvisioningProgress.BroadcastingCredentials,
                provisionGate = broadcastGate,
            )
            val viewModel = secureViewModel(
                repository = repository,
                provisioner = provisioner,
                onlineRetryDelaysMillis = listOf(0L),
            )

            prepareEspTouchSetup(viewModel)
            viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
            viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
            val onlineEffect = async { viewModel.effects.first() }
            viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
            runCurrent()
            runCurrent()

            assertEquals(1, repository.listCalls)
            assertTrue(provisioner.wasCancelled)
            assertEquals(DevicePairingStage.Online, viewModel.uiState.value.stage)
            assertEquals(
                DevicePairingUiEffect.DeviceOnlineConfirmed("Shcare Alpha"),
                onlineEffect.await(),
            )
        }

    @Test
    fun retryingWifiSetupClearsAStaleBroadcastFailureAndThePreviousPassword() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val provisioner = FakeDeviceWifiProvisioner(
            provisionError = DeviceSmartConfigUnavailableException("broadcast did not start"),
        )
        val viewModel = secureViewModel(repository, provisioner = provisioner)

        prepareEspTouchSetup(viewModel)
        viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
        viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
        viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DeviceProvisioningProgress.SmartConfigFailed, viewModel.uiState.value.provisioningProgress)
        assertEquals("", viewModel.uiState.value.targetWifiPassword)

        viewModel.onAction(DevicePairingUiAction.RetryWifiSetup)
        runCurrent()

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(DeviceProvisioningProgress.Idle, viewModel.uiState.value.provisioningProgress)
        assertEquals("", viewModel.uiState.value.targetWifiPassword)
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
    fun deviceIdOnlyRegistrationConfirmsAnAssignedDeviceWithoutClaimMaterial() = runTest(dispatcher) {
        val offline = SmartDevice(id = "dev_alpha", name = "Shcare Alpha", online = false)
        val repository = FakeDeviceClaimRepository(
            claimResult = offline,
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.ManualDeviceIdChanged("dev_alpha"))
        val effect = async { viewModel.effects.first() }
        viewModel.onAction(DevicePairingUiAction.SubmitManual)
        runCurrent()

        assertEquals(0, repository.claimCalls)
        assertEquals(0, repository.listCalls)
        assertEquals(DevicePairingStage.Entry, viewModel.uiState.value.stage)
        assertEquals(
            DevicePairingUiEffect.DeviceRegistered("dev_alpha", "Shcare Alpha"),
            effect.await(),
        )
    }

    @Test
    fun manualFormReportsFieldErrorsBeforeAnyBackendMutation() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository()
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.SubmitManual)

        assertEquals(0, repository.claimCalls)
        assertEquals(
            setOf(DeviceManualSetupField.DeviceId),
            viewModel.uiState.value.manualFieldErrors,
        )

        viewModel.onAction(DevicePairingUiAction.ManualDeviceIdChanged("dev_alpha"))

        assertFalse(DeviceManualSetupField.DeviceId in viewModel.uiState.value.manualFieldErrors)
        assertTrue(viewModel.uiState.value.manualFieldErrors.isEmpty())
    }

    @Test
    fun expiredSoftApSessionStaysInWifiFlowAndCanBeRetried() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
        )
        val viewModel = secureViewModel(repository)

        viewModel.onAction(DevicePairingUiAction.OpenWifiSetup("dev_alpha"))
        runCurrent()

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(1, repository.wifiSetupCalls)
        advanceTimeBy(10L * 60L * 1_000L)
        runCurrent()

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DevicePairingFailureKind.Expired, viewModel.uiState.value.failureKind)
        assertEquals(R.string.device_pairing_setup_expired, viewModel.uiState.value.errorMessageRes)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)

        viewModel.onAction(DevicePairingUiAction.RetryWifiSetup)
        runCurrent()

        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(2, repository.wifiSetupCalls)
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

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DevicePairingFailureKind.Expired, viewModel.uiState.value.failureKind)
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
    fun onlinePollingFailureRemainsHonestAndRetryableAfterSoftApProvisioning() = runTest(dispatcher) {
        val repository = FakeDeviceClaimRepository(
            claimResult = SmartDevice(id = "dev_alpha", online = false),
            listFailuresRemaining = 1,
        )
        val viewModel = secureViewModel(
            repository,
            provisioner = FakeDeviceWifiProvisioner(),
            onlineRetryDelaysMillis = listOf(0L),
        )

        prepareEspTouchSetup(viewModel)
        viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
        viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
        viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
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
        val viewModel = secureViewModel(
            repository,
            provisioner = FakeDeviceWifiProvisioner(),
            onlineRetryDelaysMillis = listOf(0L),
        )

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
        val viewModel = secureViewModel(
            repository,
            provisioner = FakeDeviceWifiProvisioner(),
            onlineRetryDelaysMillis = listOf(0L),
        )

        advanceToOnlineConfirmation(viewModel)

        assertEquals(DevicePairingStage.ClaimFailed, viewModel.uiState.value.stage)
        assertEquals(DevicePairingFailureKind.Permission, viewModel.uiState.value.failureKind)
        assertEquals(R.string.device_pairing_permission_denied, viewModel.uiState.value.errorMessageRes)
        assertEquals("req-presence-permission", viewModel.uiState.value.requestId)
        assertFalse(viewModel.uiState.value.canRetryOnline)
        assertEquals("", viewModel.uiState.value.setupProofOfPossession)
        assertEquals("", viewModel.uiState.value.setupSsid)
    }

    private suspend fun prepareEspTouchSetup(viewModel: DevicePairingViewModel) = coroutineScope {
        val registeredEffect = async(start = CoroutineStart.UNDISPATCHED) {
            viewModel.effects.first()
        }
        viewModel.onAction(DevicePairingUiAction.ManualDeviceIdChanged("dev_alpha"))
        viewModel.onAction(DevicePairingUiAction.SubmitManual)
        dispatcher.scheduler.runCurrent()
        val registered = registeredEffect.await() as DevicePairingUiEffect.DeviceRegistered
        assertEquals("dev_alpha", registered.deviceId)
        viewModel.onAction(DevicePairingUiAction.OpenWifiSetup("dev_alpha"))
        dispatcher.scheduler.runCurrent()
        assertEquals(DevicePairingStage.SetupReady, viewModel.uiState.value.stage)
        assertEquals(DeviceSetupCapability.ESPTouchV2, viewModel.uiState.value.setupCapability)
    }

    private suspend fun advanceToOnlineConfirmation(viewModel: DevicePairingViewModel) {
        prepareEspTouchSetup(viewModel)
        viewModel.onAction(DevicePairingUiAction.TargetWifiSsidChanged("Home WiFi"))
        viewModel.onAction(DevicePairingUiAction.TargetWifiPasswordChanged("home-pass-123"))
        viewModel.onAction(DevicePairingUiAction.StartLocalProvisioning)
        dispatcher.scheduler.runCurrent()
        dispatcher.scheduler.runCurrent()
    }

    private fun secureViewModel(
        repository: DeviceClaimRepository,
        provisioner: DeviceWifiProvisioner = UnsupportedDeviceWifiProvisioner,
        qrImageDecoder: DeviceQrImageDecoder = UnsupportedDeviceQrImageDecoder,
        currentAuthority: () -> DevicePairingAuthoritySnapshot? = { authority },
        idempotencyKeyFactory: () -> String = { "pair-key-1" },
        onlineRetryDelaysMillis: List<Long> = listOf(0L),
        authorityRetryDelaysMillis: List<Long> = listOf(0L),
    ) = DevicePairingViewModel(
        repository = repository,
        provisioner = provisioner,
        qrImageDecoder = qrImageDecoder,
        expectedAuthority = authority,
        currentAuthority = currentAuthority,
        idempotencyKeyFactory = idempotencyKeyFactory,
        onlineRetryDelaysMillis = onlineRetryDelaysMillis,
        authorityRetryDelaysMillis = authorityRetryDelaysMillis,
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
    var currentWifiSsid: DeviceCurrentWifiSsid = DeviceCurrentWifiSsid.Unavailable,
    private val progressBeforeCompletion: DeviceProvisioningProgress? = null,
    private val provisionGate: CompletableDeferred<Unit>? = null,
    private val provisionError: Throwable? = null,
    private val broadcastResult: DeviceSmartConfigBroadcastResult =
        DeviceSmartConfigBroadcastResult.DirectAcknowledged,
) : DeviceWifiProvisioner {
    var calls = 0
    var lastRequest: DeviceWifiProvisioningRequest? = null
    var wasCancelled = false

    override fun availability(): DeviceWifiProvisioningAvailability =
        availability

    override suspend fun currentWifiSsid(): DeviceCurrentWifiSsid = currentWifiSsid

    override suspend fun provision(
        request: DeviceWifiProvisioningRequest,
        onProgress: (DeviceProvisioningProgress) -> Unit,
    ): DeviceSmartConfigBroadcastResult {
        calls += 1
        lastRequest = request
        progressBeforeCompletion?.let(onProgress)
        try {
            provisionGate?.await()
        } catch (error: CancellationException) {
            wasCancelled = true
            throw error
        }
        provisionError?.let { throw it }
        return broadcastResult
    }
}

private class FakeDeviceQrImageDecoder(
    private vararg val results: DeviceQrImageDecodeResult,
) : DeviceQrImageDecoder {
    val requestedUris = mutableListOf<String>()

    override suspend fun decode(contentUri: String): DeviceQrImageDecodeResult {
        requestedUris += contentUri
        return results.firstOrNull() ?: DeviceQrImageDecodeResult.NoQrCode
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
    private val wifiSetupSession: DeviceWifiSetupSession = DeviceWifiSetupSession(
        device = SmartDevice(id = "dev_alpha", organizationId = "workspace-1"),
        transport = "esptouch_v2",
        security = "aes128",
        provisioningKey = ByteArray(16) { 0x5a },
        reservedData = "v2:${"2b".repeat(16)}".toByteArray(),
        expiresAt = Instant.parse("2026-07-18T00:10:00Z"),
    ),
) : DeviceClaimRepository {
    var claimCalls = 0
    var lastPayload: DeviceClaimPayload? = null
    var lastConnectionMethod = ""
    val idempotencyKeys = mutableListOf<String>()
    var listCalls = 0
    var wifiSetupCalls = 0

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

    override suspend fun getRegisteredDevice(deviceId: String): SmartDevice {
        if (deviceId != claimResult.id) {
            throw NoSuchElementException("Device is unavailable in the current account scope")
        }
        return claimResult.withDefaultWorkspace()
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

    override suspend fun openWifiSetupSession(deviceId: String): DeviceWifiSetupSession {
        wifiSetupCalls += 1
        return wifiSetupSession.copy(
            device = wifiSetupSession.device.copy(
                id = deviceId,
                organizationId = wifiSetupSession.device.organizationId.ifBlank { "workspace-1" },
            ),
            provisioningKey = wifiSetupSession.provisioningKey.copyOf(),
            reservedData = wifiSetupSession.reservedData.copyOf(),
        )
    }

    private fun SmartDevice.withDefaultWorkspace(): SmartDevice =
        if (organizationId.isBlank()) copy(organizationId = "workspace-1") else this
}

private fun wifiLocationPermissions(): List<String> = listOf(
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION",
)
