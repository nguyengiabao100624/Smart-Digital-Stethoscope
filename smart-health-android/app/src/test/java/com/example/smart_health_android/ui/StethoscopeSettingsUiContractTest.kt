package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StethoscopeSettingsUiContractTest {
    private val screen = source("ui/screens/StethoscopeSettingsScreen.kt")

    @Test
    fun deviceSettingsUsesBackendStateWithoutUnsupportedControlsOrLegacyTheme() {
        assertTrue(screen.contains("collectAsStateWithLifecycle()"))
        assertTrue(screen.contains("StethoscopeSettingsViewModel"))
        assertTrue(screen.contains("ShcareLoadingState"))
        assertTrue(screen.contains("ShcareEmptyState"))
        assertTrue(screen.contains("ShcareErrorState"))
        assertTrue(screen.contains("MaterialTheme.colorScheme"))
        assertTrue(screen.contains("ShcareTheme.colors"))
        assertTrue(screen.contains(".navigationBarsPadding()"))
        assertTrue(screen.contains("LiveRegionMode.Assertive"))
        assertTrue(screen.contains("LiveRegionMode.Polite"))
        assertTrue(screen.contains("defaultMinSize(minHeight = 48.dp)"))
        assertTrue(screen.contains("onNavigateToDevicePairing"))
        assertTrue(screen.contains("onNavigateToDeviceManagement"))

        assertFalse(screen.contains("Color.White"))
        assertFalse(screen.contains("Color(0x"))
        assertFalse(screen.contains("import com.example.smart_health_android.ui.theme.*"))
        assertFalse(screen.contains("SmartHealthRepository.api"))
        assertFalse(screen.contains("updateSettings("))
        assertFalse(screen.contains("calibrateDevice("))
        assertFalse(screen.contains("Slider("))
        assertFalse(screen.contains("Switch("))
        assertFalse(screen.contains("Hiệu chuẩn cảm biến"))
        assertFalse(screen.contains("Tự động kết nối"))
        assertFalse(screen.contains("Online qua cloud"))
        assertFalse(screen.contains("Bluetooth"))
    }

    private fun source(relativePath: String): String {
        return projectFile(
            "src/main/java/com/example/smart_health_android/$relativePath",
        ).readText()
    }

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
