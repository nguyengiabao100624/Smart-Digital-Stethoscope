package com.example.smart_health_android.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShcareMobileRouteContractTest {
    @Test
    fun verifyEmailRouteBuilderAllowsOnlyCanonicalAccountTypes() {
        assertEquals(
            "verify-email?accountType=doctor",
            ShcareMobileRouteContract.verifyEmailRoute("doctor"),
        )
        assertEquals(
            "verify-email?accountType=solo_doctor",
            ShcareMobileRouteContract.verifyEmailRoute("solo_doctor"),
        )
        assertEquals(
            "verify-email?accountType=patient",
            ShcareMobileRouteContract.verifyEmailRoute("personal"),
        )
        assertEquals(
            "verify-email?accountType=patient",
            ShcareMobileRouteContract.verifyEmailRoute("../doctor?admin=true"),
        )
    }

    @Test
    fun everyExistingAppNavGraphRouteResolvesToATypedContract() {
        val existingRoutes = mapOf(
            "splash" to ShcareMobileRoute.Splash,
            "login" to ShcareMobileRoute.Login,
            "sign-up" to ShcareMobileRoute.SignUp,
            "verify-email?accountType=doctor" to ShcareMobileRoute.VerifyEmail,
            "doctor-approval-pending" to ShcareMobileRoute.DoctorApprovalPending,
            "forgot-password" to ShcareMobileRoute.ForgotPassword,
            "dashboard" to ShcareMobileRoute.ClinicalDashboard,
            "clinical-patients" to ShcareMobileRoute.ClinicalPatients,
            "clinical-alerts" to ShcareMobileRoute.ClinicalAlerts,
            "clinical-alerts/reviews" to ShcareMobileRoute.ClinicalReviews,
            "patient-dashboard" to ShcareMobileRoute.PatientDashboard,
            "notifications" to ShcareMobileRoute.Notifications,
            "appointments" to ShcareMobileRoute.Appointments,
            "appointments?appointmentId=appointment-42" to ShcareMobileRoute.Appointments,
            "new-scan" to ShcareMobileRoute.NewScan,
            "monitoring?scanId=scan-42" to ShcareMobileRoute.Monitoring,
            "device-pairing?returnRoute=dashboard" to ShcareMobileRoute.DevicePairing,
            "device-wifi/device-42" to ShcareMobileRoute.DeviceWifiSetup,
            "device-management?deviceId=device-42" to ShcareMobileRoute.DeviceManagement,
            "bluetooth?returnRoute=dashboard" to ShcareMobileRoute.LegacyBluetoothPairing,
            "connection-success/Shcare%20One?returnRoute=dashboard" to ShcareMobileRoute.ConnectionSuccess,
            "records" to ShcareMobileRoute.Records,
            "record-detail/record%2F42" to ShcareMobileRoute.RecordDetail,
            "ai-assistant" to ShcareMobileRoute.AiAssistant,
            "settings" to ShcareMobileRoute.Settings,
            "workspace-switcher" to ShcareMobileRoute.WorkspaceSwitcher,
            "profile" to ShcareMobileRoute.Profile,
            "family-profiles" to ShcareMobileRoute.FamilyProfiles,
            "verify-phone-settings" to ShcareMobileRoute.VerifyPhoneSettings,
            "re-verify/email" to ShcareMobileRoute.ReVerifyContact,
            "privacy" to ShcareMobileRoute.Privacy,
            "stethoscope-settings" to ShcareMobileRoute.StethoscopeSettings,
            "ai-calibration" to ShcareMobileRoute.AiCalibration,
            "data-storage" to ShcareMobileRoute.DataStorage,
            "notification-settings" to ShcareMobileRoute.NotificationSettings,
            "change-password" to ShcareMobileRoute.ChangePassword,
            "data-access" to ShcareMobileRoute.DataAccess,
            "access-log" to ShcareMobileRoute.AccessLog,
            "bluetooth-settings" to ShcareMobileRoute.LegacyBluetoothSettings,
            "export-data" to ShcareMobileRoute.ExportData,
        )

        existingRoutes.forEach { (route, expected) ->
            assertEquals(route, expected, ShcareMobileRouteContract.resolve(route))
        }
    }

    @Test
    fun resolverNormalizesLeadingSlashTrailingSlashQueryAndFragment() {
        assertEquals(
            ShcareMobileRoute.Appointments,
            ShcareMobileRouteContract.resolve("/appointments/?appointmentId=appointment-42#details"),
        )
        assertEquals(
            ShcareMobileRoute.RecordDetail,
            ShcareMobileRouteContract.resolve("  /record-detail/record-42/  "),
        )
    }

    @Test
    fun deviceWifiSetupRouteIsTypedAndLetsBackendEnforcePerDeviceAccess() {
        assertEquals(
            "route.device-wifi",
            ShcareMobileRouteContract.rootTestTagFor("device-wifi/device-42"),
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "device-wifi/device-42",
                patientAuthority(capabilities = emptySet()),
            ) is MobileRouteAccessDecision.Allowed,
        )
    }

    @Test
    fun deviceManagementRouteSelectsAnOptionalDeviceAndKeepsTheBluetoothRouteAsAnAlias() {
        val authority = patientAuthority(capabilities = emptySet())

        assertEquals(
            "route.device-management",
            ShcareMobileRouteContract.rootTestTagFor("device-management?deviceId=device-42"),
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "device-management?deviceId=device-42",
                authority,
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "bluetooth-settings",
                authority,
            ) is MobileRouteAccessDecision.Allowed,
        )
    }

    @Test
    fun authenticatedDoctorCanRedeemADeviceCodeWithoutWorkspaceManageCapability() {
        val doctor = clinicalAuthority(capabilities = setOf("workspace.devices.view"))

        listOf(
            "device-management?deviceId=device-42",
            "bluetooth-settings?deviceId=device-42",
            "device-wifi/device-42",
            "connection-success/Shcare%20One?returnRoute=dashboard",
        ).forEach { route ->
            assertTrue(
                route,
                ShcareMobileRouteContract.evaluate(route, doctor) is MobileRouteAccessDecision.Allowed,
            )
        }

        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "device-pairing?returnRoute=dashboard",
                doctor,
            ) is MobileRouteAccessDecision.Allowed,
        )
    }

    @Test
    fun publicAuthRoutesOpenWithoutBackendAuthority() {
        listOf(
            "splash",
            "login",
            "sign-up",
            "verify-email?accountType=patient",
            "doctor-approval-pending",
            "forgot-password",
        ).forEach { route ->
            assertTrue(
                route,
                ShcareMobileRouteContract.evaluate(route, null) is MobileRouteAccessDecision.Allowed,
            )
        }
        assertNull(ShcareMobileRouteContract.resolve("phone-login"))
    }

    @Test
    fun authenticatedAndUnknownDirectRoutesFailClosed() {
        val authenticatedDecision = ShcareMobileRouteContract.evaluate("notifications", null)
        assertEquals(
            MobileRouteDenialReason.AuthenticationRequired,
            (authenticatedDecision as MobileRouteAccessDecision.Denied).reason,
        )

        val unknownDecision = ShcareMobileRouteContract.evaluate(
            "platform-admin/users",
            clinicalAuthority(),
        )
        assertEquals(
            MobileRouteDenialReason.UnknownRoute,
            (unknownDecision as MobileRouteAccessDecision.Denied).reason,
        )
        assertNull(unknownDecision.contract)

        assertNull(ShcareMobileRouteContract.resolve("record-detail/record/42"))
        assertNull(ShcareMobileRouteContract.resolve("record-detail/{recordId}"))
    }

    @Test
    fun protectedRoutesUseAnyOfBackendCapabilities() {
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "appointments?appointmentId=appointment-42",
                clinicalAuthority(capabilities = setOf("workspace.appointments.view")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "new-scan",
                patientAuthority(capabilities = setOf("personal.scans.manage")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "device-management?deviceId=device-42",
                clinicalAuthority(capabilities = setOf("platform.devices.manage")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "clinical-patients",
                clinicalAuthority(capabilities = setOf("workspace.patients.view")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "clinical-alerts",
                clinicalAuthority(capabilities = setOf("workspace.alerts.manage")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "clinical-alerts/reviews",
                clinicalAuthority(capabilities = setOf("workspace.review.manage")),
            ) is MobileRouteAccessDecision.Allowed,
        )

        val denied = ShcareMobileRouteContract.evaluate(
            "records",
            clinicalAuthority(capabilities = setOf("workspace.patients.view")),
        )
        assertEquals(
            MobileRouteDenialReason.CapabilityMissing,
            (denied as MobileRouteAccessDecision.Denied).reason,
        )
    }

    @Test
    fun patientAndClinicalRootsAreDistinctAndExperienceGated() {
        assertEquals(
            ShcareMobileRoute.PatientDashboard,
            ShcareMobileRouteContract.rootFor(MobileExperience.Patient),
        )
        assertEquals(
            ShcareMobileRoute.ClinicalDashboard,
            ShcareMobileRouteContract.rootFor(MobileExperience.Clinical),
        )

        val patientAtClinicalRoot = ShcareMobileRouteContract.evaluate(
            "dashboard",
            patientAuthority(capabilities = setOf("personal.dashboard.view")),
        )
        assertEquals(
            MobileRouteDenialReason.ExperienceMismatch,
            (patientAtClinicalRoot as MobileRouteAccessDecision.Denied).reason,
        )

        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "patient-dashboard",
                patientAuthority(capabilities = setOf("personal.dashboard.view")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        val patientAtClinicalPatients = ShcareMobileRouteContract.evaluate(
            "clinical-patients",
            patientAuthority(capabilities = setOf("workspace.patients.view")),
        )
        assertEquals(
            MobileRouteDenialReason.ExperienceMismatch,
            (patientAtClinicalPatients as MobileRouteAccessDecision.Denied).reason,
        )
    }

    @Test
    fun initialDestinationUsesTheFirstAuthorizedNativeDestinationAndRejectsStaleEpochs() {
        val dashboardAuthority = patientAuthority(
            capabilities = setOf("personal.dashboard.view"),
        )
        assertEquals(
            ShcareMobileRoute.PatientDashboard,
            ShcareMobileRouteContract.initialDestinationFor(
                context = dashboardAuthority,
                expectedAuthorityEpoch = dashboardAuthority.authorityEpoch,
            ),
        )

        val scanOnlyAuthority = patientAuthority(
            capabilities = setOf("personal.scans.manage"),
        )
        assertEquals(
            ShcareMobileRoute.NewScan,
            ShcareMobileRouteContract.initialDestinationFor(
                context = scanOnlyAuthority,
                expectedAuthorityEpoch = scanOnlyAuthority.authorityEpoch,
            ),
        )

        val accountOnlyAuthority = clinicalAuthority(capabilities = emptySet())
        assertEquals(
            ShcareMobileRoute.Settings,
            ShcareMobileRouteContract.initialDestinationFor(
                context = accountOnlyAuthority,
                expectedAuthorityEpoch = accountOnlyAuthority.authorityEpoch,
            ),
        )
        assertEquals(
            ShcareMobileRoute.Splash,
            ShcareMobileRouteContract.initialDestinationFor(
                context = accountOnlyAuthority,
                expectedAuthorityEpoch = accountOnlyAuthority.authorityEpoch + 1L,
            ),
        )
    }

    @Test
    fun deviceReturnRouteIsTypedExperienceGatedAndEpochBound() {
        val patient = patientAuthority(
            capabilities = setOf(
                "personal.dashboard.view",
                "personal.scans.manage",
            ),
        )
        assertEquals(
            ShcareMobileRoute.Settings,
            ShcareMobileRouteContract.safeReturnDestination(
                candidateRoute = "settings",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertEquals(
            ShcareMobileRoute.PatientDashboard,
            ShcareMobileRouteContract.safeReturnDestination(
                candidateRoute = "dashboard",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertEquals(
            ShcareMobileRoute.PatientDashboard,
            ShcareMobileRouteContract.safeReturnDestination(
                candidateRoute = "record-detail/record-42",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertEquals(
            ShcareMobileRoute.Splash,
            ShcareMobileRouteContract.safeReturnDestination(
                candidateRoute = "settings",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch + 1L,
            ),
        )
    }

    @Test
    fun accountRoutesNeedAuthenticationButDoNotInventPlatformCapabilities() {
        val authority = patientAuthority(capabilities = emptySet())

        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "profile",
                authority,
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertFalse(ShcareMobileRoute.Profile.anyOfCapabilities.isNotEmpty())

        val familyProfiles = ShcareMobileRouteContract.evaluate("family-profiles", authority)
        assertEquals(
            MobileRouteDenialReason.CapabilityMissing,
            (familyProfiles as MobileRouteAccessDecision.Denied).reason,
        )
    }

    @Test
    fun storageAndExportRoutesUseBackendCapabilitiesAndPlatformDeleteIsNotMobile() {
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "data-storage",
                patientAuthority(capabilities = setOf("personal.scans.manage")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        assertTrue(
            ShcareMobileRouteContract.evaluate(
                "export-data",
                patientAuthority(capabilities = setOf("personal.data.export")),
            ) is MobileRouteAccessDecision.Allowed,
        )
        val deniedStorage = ShcareMobileRouteContract.evaluate(
            "data-storage",
            patientAuthority(capabilities = emptySet()),
        )
        assertEquals(
            MobileRouteDenialReason.CapabilityMissing,
            (deniedStorage as MobileRouteAccessDecision.Denied).reason,
        )
        val deniedExport = ShcareMobileRouteContract.evaluate(
            "export-data",
            clinicalAuthority(capabilities = setOf("workspace.scans.view")),
        )
        assertEquals(
            MobileRouteDenialReason.CapabilityMissing,
            (deniedExport as MobileRouteAccessDecision.Denied).reason,
        )
        assertNull(ShcareMobileRouteContract.resolve("delete-data"))
    }

    @Test
    fun backendConfirmedSessionAuthorityAdaptsWithoutLosingWorkspaceOrEpoch() {
        val authority = MobileSessionAuthority(
            userId = "doctor-1",
            firebaseUserId = "firebase-doctor-1",
            workspaceId = "workspace-42",
            role = "doctor",
            capabilities = setOf("workspace.dashboard.view"),
            epoch = 7L,
            experience = MobileExperience.Clinical,
        )

        assertEquals(
            MobileRouteAccessContext(
                userId = "doctor-1",
                workspaceId = "workspace-42",
                role = "doctor",
                capabilities = setOf("workspace.dashboard.view"),
                experience = MobileExperience.Clinical,
                authorityEpoch = 7L,
            ),
            authority.toRouteAccessContext(),
        )
    }

    @Test
    fun restoredDestinationFromAnOlderWorkspaceEpochFailsClosed() {
        val decision = ShcareMobileRouteContract.evaluate(
            route = "records",
            context = clinicalAuthority(
                capabilities = setOf("workspace.scans.view"),
            ),
            expectedAuthorityEpoch = 3L,
        )

        assertEquals(
            MobileRouteDenialReason.StaleAuthority,
            (decision as MobileRouteAccessDecision.Denied).reason,
        )
    }

    private fun clinicalAuthority(
        capabilities: Set<String> = setOf("workspace.dashboard.view"),
    ) = MobileRouteAccessContext(
        userId = "doctor-1",
        workspaceId = "workspace-1",
        role = "doctor",
        capabilities = capabilities,
        experience = MobileExperience.Clinical,
        authorityEpoch = 4L,
    )

    private fun patientAuthority(
        capabilities: Set<String> = setOf("personal.dashboard.view"),
    ) = MobileRouteAccessContext(
        userId = "patient-1",
        workspaceId = "workspace-1",
        role = "patient",
        capabilities = capabilities,
        experience = MobileExperience.Patient,
        authorityEpoch = 2L,
    )
}
