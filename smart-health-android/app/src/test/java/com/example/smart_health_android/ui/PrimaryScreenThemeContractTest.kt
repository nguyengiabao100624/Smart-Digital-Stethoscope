package com.example.smart_health_android.ui

import com.example.smart_health_android.ui.theme.ShcareDarkSemanticColors
import com.example.smart_health_android.ui.theme.ShcareLightSemanticColors
import java.io.File
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
            assertTrue("$fileName must use the native brand header start role", source.contains("brandHeaderStart"))
            assertTrue("$fileName must use the native brand header end role", source.contains("brandHeaderEnd"))
            assertTrue("$fileName must use the native on-brand role", source.contains("onBrandHeader"))
        }

        assertNotEquals(
            ShcareLightSemanticColors.brandHeaderStart,
            ShcareDarkSemanticColors.brandHeaderStart,
        )
        assertNotEquals(
            ShcareLightSemanticColors.brandHeaderEnd,
            ShcareDarkSemanticColors.brandHeaderEnd,
        )
        assertNotEquals(
            ShcareLightSemanticColors.onBrandHeader,
            ShcareDarkSemanticColors.onBrandHeader,
        )
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
