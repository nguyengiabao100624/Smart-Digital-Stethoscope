package com.example.smart_health_android.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class DeviceHealthComposeContractTest {
    private val source = resolveProjectFile(
        "src/main/java/com/example/smart_health_android/ui/screens/BluetoothSettingsScreen.kt",
    ).readText()

    @Test
    fun deviceStatusUsesNativeThemeSemanticsAndAdaptiveMasterDetail() {
        assertTrue(source.contains("MaterialTheme.colorScheme"))
        assertTrue(source.contains("ShcareTheme.spacing"))
        assertTrue(source.contains("semantics(mergeDescendants = true)"))
        assertTrue(source.contains("stateDescription"))
        assertTrue(source.contains("stateDescription = info"))
        assertTrue(source.contains("maxWidth >= 720.dp"))
        assertTrue(source.contains("defaultMinSize(minHeight = 48.dp)"))
    }

    @Test
    fun statusScreenDoesNotUseWebColorsOrInferOnlineFromLegacyConnectedFlag() {
        assertFalse(source.contains("Color.White"))
        assertFalse(source.contains("Color(0x"))
        assertFalse(source.contains("online || connected"))
        assertFalse(source.contains("battery.coerceIn"))
        assertFalse(source.contains("maxLines = 1"))
    }

    @Test
    fun statusScreenExposesHonestLoadingOfflineErrorAndMissingTelemetryStates() {
        assertTrue(source.contains("ShcareLoadingState"))
        assertTrue(source.contains("ShcareOfflineState"))
        assertTrue(source.contains("ShcareErrorState"))
        assertTrue(source.contains("device_health_value_missing"))
        assertTrue(source.contains("DevicePresenceStatus.Degraded"))
        assertTrue(source.contains("DevicePresenceStatus.Stale"))
        assertTrue(source.contains("DevicePresenceStatus.Offline"))
    }

    private fun resolveProjectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
