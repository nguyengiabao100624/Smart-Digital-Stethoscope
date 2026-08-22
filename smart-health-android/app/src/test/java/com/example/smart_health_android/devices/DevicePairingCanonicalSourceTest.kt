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

    @Test
    fun productionSourceContainsOnlyTheRealQrManualAndWifiProvisioningFlow() {
        assertFalse(mainScreens.resolve("BluetoothPairingScreen.kt").exists())
        assertFalse(navGraph.contains("BluetoothPairingScreen("))
        assertTrue(navGraph.contains("route = \"bluetooth?returnRoute={returnRoute}\""))
        assertTrue(
            Regex("""\bDevicePairingScreen\(""")
                .findAll(navGraph)
                .count() >= 2,
        )

        assertTrue(canonicalPairing.contains("rememberDeviceScanner()"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.QrScanned"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.ManualDeviceIdChanged"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.ManualClaimCodeChanged"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.ManualSetupSsidChanged"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.ManualProofChanged"))
        assertTrue(canonicalPairing.contains("DevicePairingUiAction.SubmitManual"))
        assertTrue(canonicalPairing.contains("DevicePairingStage.SetupReady"))
        assertTrue(canonicalPairing.contains("DevicePairingUiEffect.DeviceOnlineConfirmed"))
        assertFalse(canonicalPairing.contains("BluetoothRadarScreen"))
        assertFalse(canonicalPairing.contains("pairDefaultQr"))
        assertFalse(canonicalPairing.contains("stetho-ai-pro"))
        assertFalse(canonicalPairing.contains("scanDevices()"))
        assertFalse(canonicalPairing.contains("ManualSetupCodeChanged"))
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
