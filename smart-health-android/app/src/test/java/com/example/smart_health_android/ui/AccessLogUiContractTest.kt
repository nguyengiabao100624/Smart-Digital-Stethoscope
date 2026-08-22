package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccessLogUiContractTest {
    private val screen = source("ui/screens/AccessLogScreen.kt")
    private val dateField = source("ui/screens/SelectableDateField.kt")
    private val strings = projectFile("src/main/res/values/strings.xml").readText()

    @Test
    fun `access log is a native state driven Shcare screen`() {
        assertTrue(screen.contains("AccessLogViewModelFactory"))
        assertTrue(screen.contains("collectAsStateWithLifecycle()"))
        assertTrue(screen.contains("LazyColumn"))
        assertTrue(screen.contains("ShcareLoadingState"))
        assertTrue(screen.contains("ShcareEmptyState"))
        assertTrue(screen.contains("ShcareErrorState"))
        assertTrue(screen.contains("ShcareOfflineState"))
        assertTrue(screen.contains("ShcarePermissionState"))
        assertTrue(screen.contains("MaterialTheme.colorScheme"))
        assertTrue(screen.contains("ShcareTheme.colors"))
        assertTrue(screen.contains("stateDescription"))
        assertTrue(screen.contains("heading()"))
        assertTrue(screen.contains("RefreshConfirmed"))

        assertFalse(screen.contains("SmartHealthRepository.api"))
        assertFalse(screen.contains("remember { mutableStateOf"))
        assertFalse(screen.contains("Color.White"))
        assertFalse(screen.contains("Color(0x"))
        assertFalse(screen.contains("PrimaryBlue"))
        assertFalse(screen.contains("TextPrimary"))
        assertFalse(screen.contains("TextSecondary"))
        assertFalse(screen.contains("ErrorRed"))
        assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(screen))
        assertFalse(screen.contains("Ứng dụng Smart Health"))
    }

    @Test
    fun `date field uses semantic theme colors and accessible minimum target`() {
        assertTrue(dateField.contains("MaterialTheme.colorScheme"))
        assertTrue(dateField.contains("coerceAtLeast(48.dp)"))
        assertTrue(dateField.contains("Role.Button"))
        assertTrue(dateField.contains("stateDescription"))
        assertTrue(dateField.contains("stringResource"))

        assertFalse(dateField.contains("ui.theme.Border"))
        assertFalse(dateField.contains("ui.theme.PrimaryBlue"))
        assertFalse(dateField.contains("ui.theme.TextPrimary"))
        assertFalse(dateField.contains("ui.theme.TextSecondary"))
        assertFalse(dateField.contains("Color(0x"))
        assertFalse(dateField.contains("NgĂ"))
        assertFalse(dateField.contains("Chá»"))
        assertFalse(dateField.contains("Há»"))
    }

    @Test
    fun `access log and date picker copy is resource backed`() {
        assertTrue(strings.contains("access_log_title"))
        assertTrue(strings.contains("access_log_empty_title"))
        assertTrue(strings.contains("access_log_offline_title"))
        assertTrue(strings.contains("access_log_permission_title"))
        assertTrue(strings.contains("access_log_refresh_confirmed"))
        assertTrue(strings.contains("selectable_date_placeholder"))
        assertTrue(strings.contains("selectable_date_confirm"))
        assertTrue(strings.contains("selectable_date_dismiss"))
    }

    private fun source(relativePath: String): String =
        projectFile("src/main/java/com/example/smart_health_android/$relativePath").readText()

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
