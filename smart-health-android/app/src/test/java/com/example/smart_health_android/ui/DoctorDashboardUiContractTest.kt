package com.example.smart_health_android.ui

import com.example.smart_health_android.ui.screens.resolveDoctorDashboardQuickActionColumns
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DoctorDashboardUiContractTest {
    private val dashboard = source("ui/screens/DashboardScreen.kt")
    private val clinicalScreens = listOf(
        source("clinical/patients/ClinicalPatientsScreen.kt"),
        source("clinical/alerts/ClinicalAlertsScreen.kt"),
        source("clinical/reviews/ClinicalReviewsScreen.kt"),
    )
    private val strings = projectFile("src/main/res/values/phase2_foundation_strings.xml").readText()

    @Test
    fun `doctor quick actions use three columns on phones and remain accessible with large text`() {
        assertEquals(3, resolveDoctorDashboardQuickActionColumns(widthDp = 360f, fontScale = 1f))
        assertEquals(3, resolveDoctorDashboardQuickActionColumns(widthDp = 412f, fontScale = 1f))
        assertEquals(3, resolveDoctorDashboardQuickActionColumns(widthDp = 600f, fontScale = 1f))
        assertEquals(3, resolveDoctorDashboardQuickActionColumns(widthDp = 840f, fontScale = 1f))
        assertEquals(1, resolveDoctorDashboardQuickActionColumns(widthDp = 412f, fontScale = 2f))
        assertEquals(1, resolveDoctorDashboardQuickActionColumns(widthDp = 840f, fontScale = 1.5f))
    }

    @Test
    fun `doctor dashboard uses the same adaptive native foundation as patient dashboard`() {
        assertTrue(dashboard.contains("internal fun DoctorDashboardContent("))
        assertTrue(dashboard.contains("BoxWithConstraints"))
        assertTrue(dashboard.contains("LocalDensity.current.fontScale"))
        assertTrue(dashboard.contains("widthIn(max = contentWidth)"))
        assertTrue(dashboard.contains("LiveRegionMode.Polite"))
        assertTrue(dashboard.contains("ShcareLoadingState"))
        assertTrue(dashboard.contains("ShcareOfflineState"))
        assertTrue(dashboard.contains("ShcarePermissionState"))
        assertTrue(dashboard.contains("ShcareErrorState"))
        assertTrue(dashboard.contains("ShcareEmptyState"))
        assertTrue(dashboard.contains("heightIn(min = 48.dp)"))
        assertTrue(dashboard.contains("doctor-dashboard.action.refresh"))
        assertTrue(dashboard.contains("doctor-dashboard.action.notifications"))
        assertTrue(dashboard.contains("doctor-dashboard.action.scan"))
        assertTrue(dashboard.contains("doctor-dashboard.action.records"))
        assertTrue(dashboard.contains("doctor-dashboard.action.assistant"))
        assertTrue(dashboard.contains("doctor-dashboard.device"))
        assertTrue(dashboard.contains("doctor-dashboard.scan."))

        assertFalse(dashboard.contains("while (true)"))
        assertFalse(dashboard.contains("aspectRatio("))
        assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(dashboard))
        assertFalse(dashboard.contains("SmartHealthRepository.api"))
    }

    @Test
    fun `all clinical doctor surfaces use the canonical Shcare header`() {
        clinicalScreens.forEach { screen ->
            assertTrue(screen.contains("ShcareGradientTopAppBar("))
            assertFalse(
                Regex("""(?<!ShcareGradient)TopAppBar\(""").containsMatchIn(screen),
            )
        }
    }

    @Test
    fun `doctor dashboard user visible copy is resource backed`() {
        listOf(
            "doctor_dashboard_loading",
            "doctor_dashboard_permission_title",
            "doctor_dashboard_offline_title",
            "doctor_dashboard_error_title",
            "doctor_dashboard_refresh",
            "doctor_dashboard_refreshing",
            "doctor_dashboard_stale",
            "doctor_dashboard_device_online",
            "doctor_dashboard_device_offline",
            "doctor_dashboard_empty_title",
            "doctor_dashboard_empty_message",
            "doctor_dashboard_search_empty_title",
            "doctor_dashboard_search_empty_message",
            "doctor_dashboard_stop_recording",
        ).forEach { resourceName ->
            assertTrue("Missing $resourceName", strings.contains("name=\"$resourceName\""))
        }
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
