package com.example.smart_health_android.navigation

import com.example.smart_health_android.notifications.NotificationNavigationPolicy
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidNavigationSecurityRegressionTest {
    @Test
    fun staleAuthorityEpochExposesNoPrimaryDestinationAndNoRestoredPrimaryRoute() {
        val authority = patientAuthority()
        val staleEpoch = authority.authorityEpoch + 1L

        assertTrue(
            ShcarePrimaryNavigationContract.destinationsFor(
                context = authority,
                expectedAuthorityEpoch = staleEpoch,
            ).isEmpty(),
        )
        assertFalse(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = ShcareMobileRoute.PatientDashboard.routePattern,
                context = authority,
                expectedAuthorityEpoch = staleEpoch,
            ),
        )
        assertEquals(
            ShcareMobileRoute.Splash,
            ShcareMobileRouteContract.initialDestinationFor(
                context = authority,
                expectedAuthorityEpoch = staleEpoch,
            ),
        )
    }

    @Test
    fun patientCannotEnterOrReturnToAClinicalRouteEvenWithClinicalCapabilityText() {
        val authority = patientAuthority(
            capabilities = setOf(
                "personal.dashboard.view",
                "workspace.dashboard.view",
            ),
        )

        val directDecision = ShcareMobileRouteContract.evaluate(
            contract = ShcareMobileRoute.ClinicalDashboard,
            context = authority,
            expectedAuthorityEpoch = authority.authorityEpoch,
        )
        assertEquals(
            MobileRouteDenialReason.ExperienceMismatch,
            (directDecision as MobileRouteAccessDecision.Denied).reason,
        )
        assertFalse(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = ShcareMobileRoute.ClinicalDashboard.routePattern,
                context = authority,
                expectedAuthorityEpoch = authority.authorityEpoch,
            ),
        )
        assertEquals(
            ShcareMobileRoute.PatientDashboard,
            ShcareMobileRouteContract.safeReturnDestination(
                candidateRoute = ShcareMobileRoute.ClinicalDashboard.routePattern,
                context = authority,
                expectedAuthorityEpoch = authority.authorityEpoch,
            ),
        )
    }

    @Test
    fun notificationNavigationRejectsPublicAuthEndpointsAndStaleAuthority() {
        val authority = clinicalAuthority()

        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = ShcareMobileRoute.ClinicalDashboard.routePattern,
                destinationRoute = ShcareMobileRoute.DoctorApprovalPending.routePattern,
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = authority,
                expectedAuthorityEpoch = authority.authorityEpoch,
            ),
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = ShcareMobileRoute.DoctorApprovalPending.routePattern,
                destinationRoute = ShcareMobileRoute.Notifications.routePattern,
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = authority,
                expectedAuthorityEpoch = authority.authorityEpoch,
            ),
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = ShcareMobileRoute.ClinicalDashboard.routePattern,
                destinationRoute = ShcareMobileRoute.Notifications.routePattern,
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = authority,
                expectedAuthorityEpoch = authority.authorityEpoch + 1L,
            ),
        )
    }

    @Test
    fun notificationLaunchWiringPassesCurrentWorkspaceAndCurrentAuthorityEpoch() {
        val notificationLaunchBlock = navigationSource
            .substringAfter(
                "val hasMatchingNotificationOwner = SmartHealthNotificationSession.canOpen(",
            )
            .substringBefore("if (!hasMatchingNotificationOwner)")

        assertTrue(
            notificationLaunchBlock.contains(
                "currentWorkspaceId = authorityState.authority?.workspaceId",
            ),
        )

        val navigationPolicyBlock = navigationSource
            .substringAfter("NotificationNavigationPolicy.canNavigate(")
            .substringBefore(") {")

        assertTrue(
            navigationPolicyBlock.contains(
                "expectedAuthorityEpoch = authorityState.epoch",
            ),
        )

        assertTrue(
            notificationSessionSource.contains(
                "binding.workspaceId == normalizedCurrentWorkspaceId",
            ),
        )
        assertTrue(
            notificationSessionSource.contains(
                "messageWorkspaceId = request.workspaceId",
            ),
        )
        assertTrue(
            notificationSessionSource.contains(
                "binding.workspaceId == normalizedWorkspaceId",
            ),
        )
    }

    @Test
    fun workspaceSwitchInvalidatesOldNotificationStateBeforeConfirmingNewAuthority() {
        val workspaceSwitchBlock = navigationSource
            .substringAfter("onWorkspaceConfirmed = workspaceConfirmed@{ user, workspaceId ->")
            .substringBefore("onReauthorizationRequired = {")

        assertOrdered(
            source = workspaceSwitchBlock,
            "val expectedAuthority = routeAuthority",
            "authorityStore.state.value.authority != expectedAuthority",
            "!FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner)",
            "SmartHealthNotificationSession.deactivateAndClearPostedNotifications",
            "SmartHealthNotificationCenter.clearAllPostedNotifications()",
            "onNotificationLaunchRequestConsumed()",
            "authorityStore.confirmWorkspaceSwitch(",
            "expectedAuthority = expectedAuthority",
            "is MobileAuthorityUpdate.Accepted ->",
            "SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated(",
            "workspaceId = user.canonicalWorkspaceId()",
        )
        assertFalse(workspaceSwitchBlock.contains("authorityStore.clear()"))
        assertFalse(workspaceSwitchBlock.contains("SmartHealthSessionTerminator.terminate()"))
    }

    @Test
    fun confirmedFamilyProfileSwitchAdvancesAuthorityBeforeDashboardBackStackCanRender() {
        val familySwitchBlock = navigationSource
            .substringAfter(
                "onActiveProfileConfirmed = activeProfileConfirmed@{ result, expectedPatientId ->",
            )
            .substringBefore("onNavigateBack = { navController.popBackStack() }")

        assertOrdered(
            source = familySwitchBlock,
            "val expectedAuthority = routeAuthority",
            "authorityStore.state.value.authority != expectedAuthority",
            "!FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner)",
            "authorityStore.confirmActiveProfileSwitch(",
            "expectedPatientId = expectedPatientId",
            "expectedAuthority = expectedAuthority",
            "is MobileAuthorityUpdate.Accepted ->",
        )
        assertFalse(familySwitchBlock.contains("authorityStore.clear()"))
        assertFalse(familySwitchBlock.contains("SmartHealthSessionTerminator.terminate()"))
        assertTrue(
            patientDashboardSource.contains(
                "\"patient-dashboard-${'$'}{authority.userId}-${'$'}{authority.workspaceId}-${'$'}{authority.authorityEpoch}\"",
            ),
        )
    }

    private fun patientAuthority(
        capabilities: Set<String> = setOf(
            "personal.dashboard.view",
            "personal.scans.manage",
        ),
    ) = MobileRouteAccessContext(
        userId = "patient-1",
        workspaceId = "workspace-patient",
        role = "patient",
        capabilities = capabilities,
        experience = MobileExperience.Patient,
        authorityEpoch = 11L,
    )

    private fun clinicalAuthority() = MobileRouteAccessContext(
        userId = "doctor-1",
        workspaceId = "workspace-clinical",
        role = "doctor",
        capabilities = setOf(
            "workspace.dashboard.view",
            "workspace.notifications.view",
        ),
        experience = MobileExperience.Clinical,
        authorityEpoch = 13L,
    )

    private fun assertOrdered(source: String, vararg tokens: String) {
        var previousIndex = -1
        var previousToken = "<start>"
        tokens.forEach { token ->
            val currentIndex = source.indexOf(token)
            assertTrue("Missing source token: $token", currentIndex >= 0)
            assertTrue(
                "Expected '$token' after '$previousToken'",
                currentIndex > previousIndex,
            )
            previousIndex = currentIndex
            previousToken = token
        }
    }

    private val navigationSource = projectFile(
        "src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt",
    ).readText()
    private val notificationSessionSource = projectFile(
        "src/main/java/com/example/smart_health_android/notifications/SmartHealthNotificationSession.kt",
    ).readText()
    private val patientDashboardSource = projectFile(
        "src/main/java/com/example/smart_health_android/ui/screens/PatientDashboardScreen.kt",
    ).readText()

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
