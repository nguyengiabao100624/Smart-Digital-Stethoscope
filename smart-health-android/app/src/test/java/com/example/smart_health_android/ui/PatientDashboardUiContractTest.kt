package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PatientDashboardUiContractTest {
    private val screen = source("ui/screens/PatientDashboardScreen.kt")
    private val appNavGraph = source("navigation/AppNavGraph.kt")
    private val strings = projectFile("src/main/res/values/strings.xml").readText()

    @Test
    fun `patient dashboard is state driven adaptive and native`() {
        assertTrue(screen.contains("PatientDashboardViewModelFactory"))
        assertTrue(screen.contains("collectAsStateWithLifecycle()"))
        assertTrue(screen.contains("PatientDashboardUiAction.Retry"))
        assertTrue(screen.contains("PatientDashboardUiAction.Refresh"))
        assertTrue(screen.contains("PatientDashboardUiAction.SearchChanged"))
        assertTrue(screen.contains("ShcareLoadingState"))
        assertTrue(screen.contains("ShcareOfflineState"))
        assertTrue(screen.contains("ShcarePermissionState"))
        assertTrue(screen.contains("ShcareErrorState"))
        assertTrue(screen.contains("LazyColumn"))
        assertTrue(screen.contains("BoxWithConstraints"))
        assertTrue(screen.contains("heightIn(min = 48.dp)"))
        assertTrue(screen.contains("heading()"))
        assertTrue(screen.contains("LiveRegionMode.Polite"))
        assertTrue(screen.contains("device.batteryPercent?.let"))
        assertTrue(screen.contains("batteryPercent <= 15"))
        assertTrue(screen.contains("patient_dashboard_firmware_value"))
        assertTrue(screen.contains(") + \" \" + summary"))

        assertFalse(screen.contains("SmartHealthRepository.api"))
        assertFalse(screen.contains("remember { mutableStateOf"))
        assertFalse(screen.contains("while (true)"))
        assertFalse(screen.contains("verticalScroll"))
        assertFalse(screen.contains("fillMaxWidth(0.85f)"))
        assertFalse(screen.contains("scanIsNormal"))
        assertFalse(screen.contains("onNavigateToBluetooth"))
        assertFalse(screen.contains("Color.White"))
        assertFalse(screen.contains("Color(0x"))
        assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(screen))
    }

    @Test
    fun `patient dashboard route binds exact authority and typed NewScan navigation`() {
        assertTrue(appNavGraph.contains("bindPatientDashboardRouteAccess("))
        assertTrue(appNavGraph.contains("currentPatientDashboardAuthority"))
        assertTrue(appNavGraph.contains("patientDashboardRouteBinding.authority"))
        assertTrue(appNavGraph.contains("authorityStore.invalidateIfCurrent(patientDashboardAuthorityOwner)"))
        assertTrue(appNavGraph.contains("ShcareMobileRoute.NewScan.routePattern"))
        assertTrue(appNavGraph.contains("canStartScan"))
        assertTrue(appNavGraph.contains("canViewRecords"))
        assertTrue(appNavGraph.contains("canManageDevice"))
        assertTrue(appNavGraph.contains("canViewAppointments"))
    }

    @Test
    fun `patient dashboard copy is resource backed and never labels blank AI as normal`() {
        listOf(
            "patient_dashboard_title",
            "patient_dashboard_search_hint",
            "patient_dashboard_loading",
            "patient_dashboard_offline_title",
            "patient_dashboard_permission_title",
            "patient_dashboard_error_title",
            "patient_dashboard_partial",
            "patient_dashboard_stale",
            "patient_dashboard_device_title",
            "patient_dashboard_device_unpaired",
            "patient_dashboard_quick_actions",
            "patient_dashboard_start_scan",
            "patient_dashboard_recent_scans",
            "patient_dashboard_analysis_unavailable",
            "patient_dashboard_analysis_available",
            "patient_dashboard_analysis_attention",
            "patient_dashboard_analysis_technical_failure",
            "patient_dashboard_analysis_technical_failure_description",
            "patient_dashboard_retry",
        ).forEach { resourceName ->
            assertTrue("Missing $resourceName", strings.contains("name=\"$resourceName\""))
        }
        assertFalse(screen.contains("\"Bình thường\""))
        assertFalse(screen.contains("ai_assistant_result_label"))
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
