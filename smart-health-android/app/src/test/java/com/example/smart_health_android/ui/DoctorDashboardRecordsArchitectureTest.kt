package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DoctorDashboardRecordsArchitectureTest {
    @Test
    fun `dashboard and medical records screens collect immutable view model state`() {
        val dashboard = source("ui/screens/DashboardScreen.kt")
        val records = source("ui/screens/MedicalRecordsScreen.kt")

        listOf(dashboard, records).forEach { source ->
            assertTrue(source.contains("collectAsStateWithLifecycle"))
            assertTrue(Regex("""\w+ViewModel\.onAction\(""").containsMatchIn(source))
            assertFalse(source.contains("SmartHealthRepository.api"))
            assertFalse(source.contains("rememberCoroutineScope"))
        }
    }

    @Test
    fun `dashboard and medical records features expose state action and repository boundaries`() {
        val dashboard = source("doctor/DoctorDashboardViewModel.kt")
        val records = source("records/MedicalRecordsViewModel.kt")

        assertTrue(dashboard.contains("data class DoctorDashboardUiState"))
        assertTrue(dashboard.contains("sealed interface DoctorDashboardUiAction"))
        assertTrue(dashboard.contains("interface DoctorDashboardRepository"))

        assertTrue(records.contains("data class MedicalRecordsUiState"))
        assertTrue(records.contains("sealed interface MedicalRecordsUiAction"))
        assertTrue(records.contains("interface MedicalRecordsRepository"))
    }

    private fun source(relativePath: String): String = projectDirectory()
        .resolve("src/main/java/com/example/smart_health_android/$relativePath")
        .readText()

    private fun projectDirectory(): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory,
            workingDirectory.resolve("app"),
        ).firstOrNull { candidate ->
            candidate.resolve("src/main/java").isDirectory
        } ?: error("Cannot locate Android app module from ${workingDirectory.absolutePath}")
    }
}
