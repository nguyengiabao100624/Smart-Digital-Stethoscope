package com.example.smart_health_android.ui.screens

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DashboardHeaderContractTest {
    private val doctorSource = projectFile(
        "src/main/java/com/example/smart_health_android/ui/screens/DashboardScreen.kt",
    ).readText()
    private val patientSource = projectFile(
        "src/main/java/com/example/smart_health_android/ui/screens/PatientDashboardScreen.kt",
    ).readText()
    private val doctorViewModelSource = projectFile(
        "src/main/java/com/example/smart_health_android/doctor/DoctorDashboardViewModel.kt",
    ).readText()

    private val doctorHeader = doctorSource.sectionBetween(
        start = "private fun DoctorDashboardHeader(",
        end = "private fun workspaceTypeLabel(",
    )
    private val doctorHeaderButton = doctorSource.sectionBetween(
        start = "private fun HeaderIconButton(",
        end = "private fun DeviceStatusCard(",
    )
    private val patientHeader = patientSource.sectionBetween(
        start = "private fun PatientDashboardTopBar(",
        end = "private fun PatientDashboardReadyContent(",
    )

    @Test
    fun doctorAndPatientHeaderActionsHaveLocalizedAccessibleNamesAndFortyEightDpTargets() {
        assertTrue(
            doctorHeader.contains(
                "contentDescription = stringResource(R.string.shcare_action_settings)",
            ),
        )
        assertTrue(
            doctorHeader.contains(
                "contentDescription = stringResource(R.string.shcare_action_notifications)",
            ),
        )
        assertTrue(doctorHeaderButton.contains("contentDescription: String"))
        assertTrue(doctorHeaderButton.contains(".size(48.dp)"))
        assertTrue(
            Regex("""contentDescription\s*=\s*contentDescription""")
                .containsMatchIn(doctorHeaderButton),
        )

        assertTrue(
            patientHeader.contains(
                "contentDescription = stringResource(R.string.patient_dashboard_refresh)",
            ),
        )
        assertTrue(
            patientHeader.contains(
                "R.string.patient_dashboard_notifications",
            ),
        )
        assertTrue(patientHeader.contains("IconButton("))
        assertTrue(patientHeader.contains(".size(48.dp)"))
        assertFalse(patientHeader.contains("R.string.shcare_action_settings"))
    }

    @Test
    fun bothScreenHeadersExposeHeadingSemanticsAndPatientHeaderUsesSystemStatusInset() {
        assertTrue(doctorHeader.contains(".semantics { heading() }"))
        assertTrue(patientHeader.contains(".semantics { heading() }"))
        assertTrue(patientHeader.contains(".statusBarsPadding()"))
        assertFalse(patientHeader.contains("top = 48.dp"))
    }

    @Test
    fun patientNotificationActionDoesNotRenderTheOldAlwaysVisibleUnreadDot() {
        assertFalse(patientHeader.contains("contentAlignment = Alignment.TopEnd"))
        assertFalse(patientHeader.contains("ErrorRed"))
        assertFalse(patientHeader.contains(".size(12.dp)"))
        assertFalse(patientSource.contains("import com.example.smart_health_android.ui.theme.ErrorRed"))
    }

    @Test
    fun doctorDashboardRefreshesAuthorityBeforeWorkspaceData() {
        val userIndex = doctorViewModelSource.indexOf("val user = repository.getCurrentUser()")
        val workspaceIndex = doctorViewModelSource.indexOf("val workspaceId = user.canonicalWorkspaceId()")
        val guardIndex = doctorViewModelSource.indexOf("require(workspaceId.isNotBlank())")
        val statusIndex = doctorViewModelSource.indexOf("repository.getStatus(workspaceId)")
        val scansIndex = doctorViewModelSource.indexOf("repository.listRecentScans()")

        assertTrue(userIndex >= 0)
        assertTrue(workspaceIndex > userIndex)
        assertTrue(guardIndex > workspaceIndex)
        assertTrue(statusIndex > guardIndex)
        assertTrue(scansIndex > statusIndex)
        assertFalse(doctorSource.contains("SmartHealthRepository.api"))
    }

    private fun String.sectionBetween(
        start: String,
        end: String,
    ): String {
        val startIndex = indexOf(start)
        require(startIndex >= 0) { "Missing source marker: $start" }
        val endIndex = indexOf(end, startIndex + start.length)
        require(endIndex > startIndex) { "Missing source marker after $start: $end" }
        return substring(startIndex, endIndex)
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
