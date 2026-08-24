package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShcareStartupBrandContractTest {
    private val splashSource = projectFile(
        "src/main/java/com/example/smart_health_android/ui/screens/SplashScreen.kt",
    ).readText()
    private val strings = projectFile("src/main/res/values/strings.xml").readText()
    private val launcherBackground = projectFile(
        "src/main/res/drawable/ic_launcher_background.xml",
    ).readText()
    private val launcherForeground = projectFile(
        "src/main/res/drawable/ic_launcher_foreground.xml",
    ).readText()
    private val notificationIcon = projectFile(
        "src/main/res/drawable/ic_notification_shcare.xml",
    ).readText()

    @Test
    fun startupUsesNativeShcareThemeResourcesAndAccessibleStateContract() {
        assertTrue(splashSource.contains("ShcareStartupContent"))
        assertTrue(splashSource.contains("MaterialTheme.colorScheme"))
        assertTrue(splashSource.contains("ShcareTheme.spacing"))
        assertTrue(splashSource.contains("WindowInsets.safeDrawing"))
        assertTrue(splashSource.contains("stateDescription"))
        assertTrue(splashSource.contains("LiveRegionMode.Polite"))
        assertTrue(splashSource.contains("splash.brand.heading"))
        assertTrue(splashSource.contains("splash.error.heading"))
        assertTrue(splashSource.split("heading()").size - 1 >= 2)
        assertTrue(splashSource.contains("ShcareRetryButton"))
        assertTrue(strings.contains("name=\"splash_brand_name\">Shcare</string>"))
        assertTrue(strings.contains("name=\"splash_brand_endorsement\">Smart Health Care</string>"))
        assertTrue(strings.contains("name=\"splash_brand_description\">Theo dõi tim phổi từ xa</string>"))
    }

    @Test
    fun startupRemovesLegacyHeartGradientAndInlineWebStyle() {
        assertFalse(splashSource.contains("Icons.Default.Favorite"))
        assertFalse(splashSource.contains("material.icons.filled.Favorite"))
        assertTrue(splashSource.contains("Brush.linearGradient"))
        assertTrue(splashSource.contains("brandHeaderStart"))
        assertTrue(splashSource.contains("brandHeaderEnd"))
        assertFalse(splashSource.contains("text = \"SmartHealth\""))
        assertFalse(splashSource.contains("text = \"Ống nghe điện tử thông minh\""))
        assertTrue(splashSource.contains("ShcareSignalMark"))
    }

    @Test
    fun launcherAndNotificationUseTheCanonicalSignalMarkInsteadOfTemplateSymbols() {
        assertTrue(launcherBackground.contains("#2457D6"))
        assertFalse(launcherBackground.contains("#3DDC84"))
        assertFalse(launcherForeground.contains("M65.3,45.828"))
        assertTrue(launcherForeground.contains("M10,19C18,8"))
        assertTrue(launcherForeground.contains("M29,29L24,38"))
        assertFalse(notificationIcon.contains("M9,3h6v6h6v6"))
        assertTrue(notificationIcon.contains("M10,19C18,8"))
        assertTrue(notificationIcon.contains("M29,29L24,38"))
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
