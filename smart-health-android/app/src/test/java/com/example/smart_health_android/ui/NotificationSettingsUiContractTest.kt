package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationSettingsUiContractTest {
    private val screen = source("ui/screens/NotificationSettingsScreen.kt")
    private val navigation = source("navigation/AppNavGraph.kt")
    private val notificationCenter =
        source("notifications/SmartHealthNotificationCenter.kt")
    private val strings = projectFile("src/main/res/values/strings.xml").readText()

    @Test
    fun `notification settings is lifecycle aware native adaptive and accessible`() {
        assertTrue(screen.contains("NotificationSettingsViewModelFactory"))
        assertTrue(screen.contains("collectAsStateWithLifecycle()"))
        assertTrue(screen.contains("ShcareSettingsHeader"))
        assertTrue(screen.contains("LazyColumn"))
        assertTrue(screen.contains("ShcareLoadingState"))
        assertTrue(screen.contains("ShcareEmptyState"))
        assertTrue(screen.contains("ShcareErrorState"))
        assertTrue(screen.contains("ShcareOfflineState"))
        assertTrue(screen.contains("ShcarePermissionState"))
        assertTrue(screen.contains("MaterialTheme.colorScheme"))
        assertTrue(screen.contains("ShcareTheme.colors"))
        assertTrue(screen.contains("LiveRegionMode"))
        assertTrue(screen.contains("stateDescription"))
        assertTrue(screen.contains("defaultMinSize(minHeight = 48.dp)"))
        assertTrue(screen.contains("600.dp"))
        assertTrue(screen.contains("840.dp"))
        assertTrue(screen.contains("R.string.notification_settings_section_local"))
        assertTrue(strings.contains(">Trên thiết bị này<"))
        assertTrue(strings.contains("notification_settings_error_confirmation"))
        assertTrue(screen.contains("ACTION_APP_NOTIFICATION_SETTINGS"))
        assertTrue(
            screen.contains("NotificationSettingsUiEffect.OpenSystemNotificationSettings"),
        )

        assertFalse(screen.contains("SmartHealthRepository.api"))
        assertFalse(screen.contains("rememberCoroutineScope"))
        assertFalse(screen.contains("verticalScroll"))
        assertFalse(screen.contains("Brush.linearGradient"))
        assertFalse(screen.contains("Color.White"))
        assertFalse(screen.contains("Color(0x"))
        assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(screen))
        assertFalse(screen.contains("SetDeviceSound"))
        assertFalse(screen.contains("SetDeviceVibration"))
        assertFalse(screen.contains("\"Tùy chọn thông báo\""))
        assertFalse(screen.contains("\"Âm thanh\""))
        assertFalse(notificationCenter.contains("localChannelId"))
        assertFalse(notificationCenter.contains("SharedPreferencesDeviceNotificationPreferenceStore"))
        assertTrue(notificationCenter.contains("channel.channelId"))
    }

    @Test
    fun `route passes canonical authority into notification settings`() {
        val routeBlock = navigation.substringAfter(
            "authorizedMobileComposable(navController, \"notification-settings\")",
        ).substringBefore(
            "authorizedMobileComposable(navController, \"change-password\")",
        )

        assertTrue(routeBlock.contains("expectedUserId = routeAccessContext?.userId.orEmpty()"))
        assertTrue(routeBlock.contains("expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty()"))
        assertTrue(routeBlock.contains("role = routeAccessContext?.role.orEmpty()"))
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
