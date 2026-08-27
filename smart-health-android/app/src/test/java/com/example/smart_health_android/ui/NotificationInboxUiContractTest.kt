package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationInboxUiContractTest {
    private val screen = source("ui/screens/NotificationsScreen.kt")
    private val navigation = source("navigation/AppNavGraph.kt")
    private val strings = projectFile("src/main/res/values/strings.xml").readText()

    @Test
    fun `notification inbox is lifecycle-aware native accessible and backend-confirmed`() {
        assertTrue(screen.contains("NotificationInboxViewModelFactory"))
        assertTrue(screen.contains("collectAsStateWithLifecycle()"))
        assertTrue(screen.contains("LazyColumn"))
        assertTrue(screen.contains("ShcareLoadingState"))
        assertTrue(screen.contains("ShcareEmptyState"))
        assertTrue(screen.contains("ShcareErrorState"))
        assertTrue(screen.contains("ShcareOfflineState"))
        assertTrue(screen.contains("ShcarePermissionState"))
        assertTrue(screen.contains("MaterialTheme.colorScheme"))
        assertTrue(screen.contains("defaultMinSize(minHeight = 48.dp)"))
        assertTrue(screen.contains("stateDescription"))
        assertTrue(screen.contains("LiveRegionMode"))
        assertTrue(screen.contains("AlertDialog"))
        assertTrue(screen.contains("NotificationInboxUiAction.RequestDelete"))
        assertTrue(screen.contains("NotificationInboxUiAction.ConfirmDelete"))
        assertTrue(screen.contains("R.string.notification_inbox_title"))
        assertTrue(screen.contains("R.string.notification_inbox_backend_operation_in_progress"))
        assertTrue(strings.contains("name=\"notification_inbox_delete_confirm_title\""))
        assertTrue(strings.contains("name=\"notification_inbox_error_confirmation\""))
        assertTrue(
            strings.contains(
                "name=\"notification_inbox_backend_operation_in_progress\"",
            ),
        )

        assertFalse(screen.contains("SmartHealthRepository.api"))
        assertFalse(screen.contains("rememberCoroutineScope"))
        assertFalse(screen.contains("Brush.linearGradient"))
        assertFalse(screen.contains("Color.White"))
        assertFalse(screen.contains("Color(0x"))
        assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(screen))
        assertFalse(screen.contains("var notifications by remember"))
        assertFalse(screen.contains("data class NotificationItem"))
        assertFalse(screen.contains("modifier = Modifier.size(8.dp)"))
        assertFalse(screen.contains("\"Back\""))
        assertFalse(screen.contains("\"notification_inbox_backend_operation_in_progress\""))
    }

    @Test
    fun `route passes canonical account and workspace authority into inbox`() {
        val routeBlock = navigation.substringAfter(
            "authorizedMobileComposable(navController, \"notifications\")",
        ).substringBefore(
            "authorizedMobileComposable(\n            navController = navController,\n            route = AppointmentRoute.NAVIGATION_PATTERN",
        )

        assertTrue(routeBlock.contains("expectedUserId = routeAccessContext?.userId.orEmpty()"))
        assertTrue(routeBlock.contains("expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty()"))
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
