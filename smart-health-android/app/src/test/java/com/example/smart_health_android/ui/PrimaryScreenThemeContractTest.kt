package com.example.smart_health_android.ui

import com.example.smart_health_android.ui.theme.ShcareDarkSemanticColors
import com.example.smart_health_android.ui.theme.ShcareLightSemanticColors
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PrimaryScreenThemeContractTest {
    private val primaryScreenNames = listOf(
        "DashboardScreen.kt",
        "PatientDashboardScreen.kt",
        "SettingsScreen.kt",
        "MedicalRecordsScreen.kt",
        "NewScanScreen.kt",
    )

    private val primaryScreens = primaryScreenNames.associateWith { fileName ->
        projectFile(
            "src/main/java/com/example/smart_health_android/ui/screens/$fileName",
        ).readText()
    }

    private val legacyHeaderScreenNames = listOf(
        "AIAssistantScreen.kt",
        "AICalibrationScreen.kt",
        "AccessLogScreen.kt",
        "AppointmentScreen.kt",
        "BluetoothSettingsScreen.kt",
        "ChangePasswordScreen.kt",
        "DataAccessScreen.kt",
        "DataStorageScreen.kt",
        "DevicePairingScreen.kt",
        "ExportDataScreen.kt",
        "FamilyProfilesScreen.kt",
        "NewScanScreen.kt",
        "NotificationSettingsScreen.kt",
        "NotificationsScreen.kt",
        "PrivacyScreen.kt",
        "ProfileScreen.kt",
        "RecordDetailScreen.kt",
        "StethoscopeSettingsScreen.kt",
        "WorkspaceSwitcherScreen.kt",
    )

    @Test
    fun primaryScreensResolveSurfacesAndContentFromTheNativeTheme() {
        primaryScreens.forEach { (fileName, source) ->
            assertTrue("$fileName must resolve Material surface roles", source.contains("MaterialTheme.colorScheme"))
            assertTrue("$fileName must resolve Shcare semantic roles", source.contains("ShcareTheme.colors"))
        }
    }

    @Test
    fun primaryScreensDoNotReintroduceLightOnlyOrWebStyleColorLiterals() {
        val legacyTokenPattern = Regex(
            """\b(Background|Surface|Border|TextPrimary|TextSecondary|PrimaryBlue|PrimaryTeal|SuccessGreen|WarningYellow|ErrorRed)\b""",
        )

        primaryScreens.forEach { (fileName, source) ->
            assertFalse("$fileName must not hard-code Color.White", source.contains("Color.White"))
            assertFalse("$fileName must not hard-code hexadecimal Compose colors", source.contains("Color(0x"))
            assertFalse("$fileName must not use the legacy light-only palette", legacyTokenPattern.containsMatchIn(source))
        }
    }

    @Test
    fun brandedHeadersUseThemeSpecificSemanticColors() {
        primaryScreens.forEach { (fileName, source) ->
            val usesDirectBrandRoles =
                source.contains("brandHeaderStart") &&
                    source.contains("brandHeaderEnd") &&
                    source.contains("onBrandHeader")
            val usesCanonicalLegacyHeader = source.contains("ShcareGradientTopAppBar")
            assertTrue(
                "$fileName must use direct native brand roles or the canonical legacy header",
                usesDirectBrandRoles || usesCanonicalLegacyHeader,
            )
        }

        assertNotEquals(
            ShcareLightSemanticColors.brandHeaderStart,
            ShcareDarkSemanticColors.brandHeaderStart,
        )
        assertEquals(
            ShcareLightSemanticColors.brandHeaderEnd,
            ShcareDarkSemanticColors.brandHeaderEnd,
        )
        assertEquals(
            ShcareLightSemanticColors.onBrandHeader,
            ShcareDarkSemanticColors.onBrandHeader,
        )
    }

    @Test
    fun lightThemeUsesAWhiteApplicationCanvas() {
        val themeSource = projectFile(
            "src/main/java/com/example/smart_health_android/ui/theme/Theme.kt",
        ).readText()

        assertTrue(
            "The light app canvas must be white on every screen",
            Regex("""background\s*=\s*Color\.White""").containsMatchIn(themeSource),
        )
        assertFalse(
            "The retired grey app canvas must not return",
            themeSource.contains("background = Color(0xFFF5F7FA)"),
        )
    }

    @Test
    fun newFeatureScreensKeepTheCanonicalOriginalStyleHeader() {
        legacyHeaderScreenNames.forEach { fileName ->
            val source = projectFile(
                "src/main/java/com/example/smart_health_android/ui/screens/$fileName",
            ).readText()
            assertTrue(
                "$fileName must keep the canonical original-style Shcare header",
                source.contains("ShcareGradientTopAppBar(") ||
                    source.contains("ShcareSettingsHeader("),
            )
            assertFalse(
                "$fileName must not reintroduce a flat Material TopAppBar",
                Regex("""(?<!ShcareGradient)TopAppBar\(""").containsMatchIn(source),
            )
        }
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
