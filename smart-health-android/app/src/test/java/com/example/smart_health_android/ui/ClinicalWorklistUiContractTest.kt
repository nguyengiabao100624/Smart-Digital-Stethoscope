package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClinicalWorklistUiContractTest {
    private val patients = source(
        "clinical/patients/ClinicalPatientsScreen.kt",
    )
    private val alerts = source(
        "clinical/alerts/ClinicalAlertsScreen.kt",
    )
    private val reviews = source(
        "clinical/reviews/ClinicalReviewsScreen.kt",
    )
    private val adaptiveScaffold = projectFile(
        "src/main/java/com/example/smart_health_android/ui/components/ShcareScaffold.kt",
    ).readText()
    private val navigation = source("navigation/AppNavGraph.kt")
    private val strings = projectFile("src/main/res/values/strings.xml").readText()

    @Test
    fun `patients and alerts are native adaptive resource backed production screens`() {
        listOf(patients, alerts).forEach { screen ->
            assertTrue(screen.contains("collectAsStateWithLifecycle()"))
            assertTrue(screen.contains("LazyColumn"))
            assertTrue(screen.contains("ShcareLoadingState"))
            assertTrue(screen.contains("ShcareEmptyState"))
            assertTrue(screen.contains("ShcareErrorState"))
            assertTrue(screen.contains("ShcareOfflineState"))
            assertTrue(screen.contains("ShcarePermissionState"))
            assertTrue(screen.contains("MaterialTheme.colorScheme"))
            assertTrue(screen.contains("ShcareTheme.colors"))
            assertTrue(screen.contains("heightIn(min = 48.dp)"))
            assertTrue(screen.contains("stateDescription"))

            assertFalse(screen.contains("SmartHealthRepository.api"))
            assertFalse(screen.contains("Color.White"))
            assertFalse(screen.contains("Color(0x"))
            assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(screen))
            assertFalse(screen.contains("Brush.linearGradient"))
            assertFalse(screen.contains("rememberCoroutineScope"))
        }

        assertTrue(patients.contains("ClinicalPatientsViewModelFactory"))
        assertTrue(patients.contains("ShcareListDetailScaffold"))
        assertTrue(patients.contains("ShcareListDetailState"))
        assertTrue(patients.contains("BackHandler(enabled = compact)"))
        assertTrue(patients.contains("this.selected = selected"))
        assertFalse(patients.contains("BoxWithConstraints"))
        assertFalse(patients.contains("840.dp"))
        assertTrue(patients.contains("clinical-patients-detail"))
        assertTrue(adaptiveScaffold.contains("ShcareAdaptiveLayoutMode.TwoPane"))
        assertTrue(adaptiveScaffold.contains("TwoPaneBreakpointDp = 840f"))
        assertTrue(adaptiveScaffold.contains("LocalDensity.current.fontScale"))
        assertTrue(adaptiveScaffold.contains("ShcareListDetailScaffold"))

        assertTrue(alerts.contains("BoxWithConstraints"))
        assertTrue(alerts.contains("840.dp"))
        assertTrue(alerts.contains("LocalDensity.current.fontScale"))
        assertTrue(alerts.contains("ClinicalAlertsViewModelFactory"))
        assertTrue(alerts.contains("ClinicalAlertTransitionDialog"))
        assertTrue(alerts.contains("BackendTransitionConfirmed"))
        assertTrue(strings.contains("clinical_patients_error_workspace"))
        assertTrue(strings.contains("clinical_alerts_error_confirmation"))

        assertTrue(reviews.contains("collectAsStateWithLifecycle()"))
        assertTrue(reviews.contains("ClinicalReviewsViewModelFactory"))
        assertTrue(reviews.contains("BoxWithConstraints"))
        assertTrue(reviews.contains("840.dp"))
        assertTrue(reviews.contains("LocalDensity.current.fontScale"))
        assertTrue(reviews.contains("LazyColumn"))
        assertTrue(reviews.contains("ShcareLoadingState"))
        assertTrue(reviews.contains("ShcareEmptyState"))
        assertTrue(reviews.contains("ShcareErrorState"))
        assertTrue(reviews.contains("ShcareOfflineState"))
        assertTrue(reviews.contains("ShcarePermissionState"))
        assertTrue(reviews.contains("sizeIn(minHeight = 48.dp)"))
        assertTrue(reviews.contains("stateDescription"))
        assertTrue(reviews.contains("BackendDecisionConfirmed"))
        assertFalse(reviews.contains("SmartHealthRepository.api"))
        assertFalse(reviews.contains("Color.White"))
        assertFalse(reviews.contains("Color(0x"))
        assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(reviews))
        assertFalse(reviews.contains("rememberCoroutineScope"))
        assertTrue(strings.contains("clinical_reviews_error_confirmation"))
    }

    @Test
    fun `route passes canonical workspace and backend capabilities into both screens`() {
        val patientsBlock = navigation.substringAfter(
            "authorizedMobileComposable(navController, \"clinical-patients\")",
        ).substringBefore(
            "authorizedMobileComposable(navController, \"clinical-alerts\")",
        )
        val alertsBlock = navigation.substringAfter(
            "authorizedMobileComposable(navController, \"clinical-alerts\")",
        ).substringBefore(
            "ShcareMobileRoute.ClinicalReviews.routePattern",
        )
        val reviewsBlock = navigation.substringAfter(
            "ClinicalReviewsScreen(",
        ).substringBefore(
            "authorizedMobileComposable(navController, \"notifications\")",
        )

        assertTrue(
            patientsBlock.contains(
                "expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty()",
            ),
        )
        assertTrue(
            alertsBlock.contains(
                "expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty()",
            ),
        )
        assertTrue(alertsBlock.contains("MobileRouteCapabilities.AlertManage"))
        assertTrue(patientsBlock.contains("onOpenWorkspaceSwitcher"))
        assertTrue(alertsBlock.contains("onOpenWorkspaceSwitcher"))
        assertTrue(alertsBlock.contains("onNavigateToReviews"))
        assertTrue(reviewsBlock.contains("expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty()"))
        assertTrue(reviewsBlock.contains("MobileRouteCapabilities.ReviewManage"))
        assertTrue(reviewsBlock.contains("onOpenWorkspaceSwitcher"))
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
