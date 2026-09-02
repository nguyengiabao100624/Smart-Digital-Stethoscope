package com.example.smart_health_android.devices

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DevicePairingCanonicalSourceTest {
    private val appRoot = locateAppRoot()
    private val androidRoot = requireNotNull(appRoot.parentFile)
    private val mainScreens =
        appRoot.resolve("src/main/java/com/example/smart_health_android/ui/screens")
    private val navGraph =
        appRoot.resolve(
            "src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt",
        ).readText()
    private val canonicalPairing =
        mainScreens.resolve("DevicePairingScreen.kt").readText()
    private val accessRedeemScreen =
        mainScreens.resolve("DeviceAccessRedeemScreen.kt").readText()
    private val accessRedeemViewModel =
        appRoot.resolve("src/main/java/com/example/smart_health_android/devices/DeviceAccessRedeemViewModel.kt")
            .readText()
    private val pairingViewModel =
        appRoot.resolve("src/main/java/com/example/smart_health_android/devices/DevicePairingViewModel.kt")
            .readText()
    private val wifiProvisioner =
        appRoot.resolve("src/main/java/com/example/smart_health_android/devices/DeviceWifiProvisioner.kt")
            .readText()
    private val manifest = appRoot.resolve("src/main/AndroidManifest.xml").readText()
    private val pairingStrings = appRoot.resolve("src/main/res/values/strings.xml").readText()
    private val firmwareMain = requireNotNull(androidRoot.parentFile)
        .resolve("smart-health-embedded/MSM261S4030H0/src/main.cpp")
        .readText()

    @Test
    fun productionSourceUsesOnlyAnAccessCodeForAttachmentAndEspTouchForWifi() {
        assertFalse(mainScreens.resolve("BluetoothPairingScreen.kt").exists())
        assertFalse(navGraph.contains("BluetoothPairingScreen("))
        assertTrue(navGraph.contains("route = \"bluetooth?returnRoute={returnRoute}\""))
        assertTrue(navGraph.contains("route = \"device-wifi/{deviceId}\""))
        assertTrue(navGraph.contains("onWifiConfigured = { deviceName ->"))
        assertTrue(navGraph.contains("\"connection-success/${'$'}{Uri.encode(deviceName)}\""))
        assertTrue(
            Regex("""\bDeviceAccessRedeemScreen\(""")
                .findAll(navGraph)
                .count() >= 2,
        )
        assertFalse(navGraph.contains("onDeviceRegistered ="))
        assertTrue(accessRedeemScreen.contains("device_access.entry"))
        assertTrue(accessRedeemScreen.contains("device_access.code"))
        assertTrue(accessRedeemScreen.contains("device_access.scan_qr"))
        assertTrue(accessRedeemScreen.contains("device_access.submit"))
        assertFalse(accessRedeemScreen.contains("Device ID"))
        assertTrue(accessRedeemViewModel.contains("redeemDeviceAccess"))
        assertTrue(accessRedeemViewModel.contains("parseDeviceAccessCode"))

        // DevicePairingScreen remains the Wi-Fi provisioning host used by
        // DeviceWifiSetupScreen; it is no longer an attachment entry point.
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.ManualDeviceIdChanged"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.SubmitManual"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.OpenWifiSetup"))
        assertTrue(canonicalPairing.contains("DevicePairingStage.SetupReady"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.StartLocalProvisioning"))
        assertTrue(canonicalPairing.contains("DevicePairingUiEffect.DeviceOnlineConfirmed"))
        assertFalse(canonicalPairing.contains("device_pairing.scan_qr"))
        assertFalse(canonicalPairing.contains("device_pairing.pick_qr_image"))
        assertFalse(canonicalPairing.contains("device_pairing.claim_code"))
        assertFalse(canonicalPairing.contains("device_pairing.setup_ssid"))
        assertFalse(canonicalPairing.contains("device_pairing.setup_proof"))
        assertFalse(canonicalPairing.contains("device_pairing.open_bluetooth_settings"))
        assertFalse(canonicalPairing.contains("copySensitiveText"))
        assertFalse(canonicalPairing.contains("BluetoothRadarScreen"))
        assertFalse(canonicalPairing.contains("pairDefaultQr"))
        assertFalse(canonicalPairing.contains("stetho-ai-pro"))
        assertFalse(canonicalPairing.contains("scanDevices()"))
        assertFalse(canonicalPairing.contains("ManualSetupCodeChanged"))
    }

    @Test
    fun productionProvisioningIsEspTouchV2WithoutBleSoftApOrBrowserFallback() {
        assertFalse(pairingViewModel.contains("DeviceBleProvisioner"))
        assertFalse(pairingViewModel.contains("StartBleProvisioning"))
        assertFalse(pairingViewModel.contains("OpenSystemBluetoothSettings"))
        assertFalse(pairingViewModel.contains("OpenSystemWifiSettings"))
        assertFalse(pairingViewModel.contains("OpenExternalSetupPortal"))
        assertFalse(manifest.contains("android.permission.BLUETOOTH_"))
        assertFalse(manifest.contains("android.permission.NEARBY_WIFI_DEVICES"))
        assertFalse(Regex("""<string name="device_pairing_(?:send_wifi_bluetooth|bluetooth_[^"]*|ble_[^"]*)""")
            .containsMatchIn(pairingStrings))
        assertFalse(pairingStrings.contains("device_pairing_portal_"))
        assertFalse(pairingStrings.contains("API nội bộ"))
        assertTrue(pairingStrings.contains("ESPTouch V2"))
        assertTrue(wifiProvisioner.contains("EspProvisioner"))
        assertTrue(wifiProvisioner.contains("setAESKey"))
        assertTrue(wifiProvisioner.contains("Manifest.permission.ACCESS_FINE_LOCATION"))
        assertFalse(wifiProvisioner.contains("Manifest.permission.NEARBY_WIFI_DEVICES"))
        // ESPTouch stays on the existing router connection.  It must encode
        // the BSSID currently used by Android; a scanned 2.4 GHz BSSID from
        // the same SSID would corrupt the ESPTouch V2 integrity check.
        assertTrue(wifiProvisioner.contains("currentRouterBssid"))
        assertFalse(wifiProvisioner.contains("WifiNetworkSpecifier"))
        assertFalse(wifiProvisioner.contains("bindProcessToNetwork"))
        assertFalse(wifiProvisioner.contains(".setBand("))
        assertFalse(wifiProvisioner.contains("setSecurityVer"))
        assertFalse(
            appRoot.resolve(
                "src/main/java/com/example/smart_health_android/devices/LocalDeviceSetupHttpCodec.kt",
            ).exists(),
        )
        assertTrue(firmwareMain.contains("SMART_HEALTH_ENABLE_BLE_PROVISIONING"))
        assertFalse(firmwareMain.contains("  setupBleProvisioning();"))
        assertTrue(firmwareMain.contains("SC_TYPE_ESPTOUCH_V2"))
        assertTrue(firmwareMain.contains("SMARTCONFIG_LISTENING"))
        assertFalse(firmwareMain.contains("runSetupPortal(\"Authorized Shcare app requested WiFi setup."))
    }

    @Test
    fun archivedDemoHasARecordedPreArchiveChecksumAndCannotCompile() {
        val archiveRoot = androidRoot.resolve("archive/legacy-compose")
        val archivedDemo = archiveRoot.resolve("BluetoothPairingScreen.kt")
        val archiveReadme = archiveRoot.resolve("README.md")

        assertTrue(archivedDemo.isFile)
        assertTrue(archiveReadme.isFile)
        assertTrue(
            archiveReadme.readText().contains(
                "BD1A2D0C407C0BBFD49F1D6B13F53071D0F29CCC4E8B56C5D6D6D623D3180626",
            ),
        )
        assertFalse(
            archivedDemo.canonicalPath.startsWith(
                appRoot.resolve("src").canonicalPath + File.separator,
            ),
        )
    }

    private fun locateAppRoot(): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory,
            workingDirectory.resolve("app"),
        ).firstOrNull { candidate ->
            candidate.resolve("src/main/AndroidManifest.xml").isFile
        } ?: error("Cannot locate Android app root from ${workingDirectory.absolutePath}")
    }
}
