package com.example.smart_health_android.navigation

import com.example.smart_health_android.ui.components.ShcareNavigationType
import com.example.smart_health_android.ui.components.resolveShcareNavigationType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShcarePrimaryNavigationTest {
    @Test
    fun navigationTypeChangesAtTheSixHundredDpBreakpoint() {
        assertEquals(
            ShcareNavigationType.BottomBar,
            resolveShcareNavigationType(widthDp = 599),
        )
        assertEquals(
            ShcareNavigationType.NavigationRail,
            resolveShcareNavigationType(widthDp = 600),
        )
    }

    @Test
    fun patientDestinationsAreFilteredByBackendCapabilities() {
        val fullyAuthorizedContext = patientContext(
                capabilities = setOf(
                    "personal.dashboard.view",
                    "personal.scans.manage",
                ),
            )
        val fullyAuthorized = ShcarePrimaryNavigationContract.destinationsFor(
            context = fullyAuthorizedContext,
            expectedAuthorityEpoch = fullyAuthorizedContext.authorityEpoch,
        )

        assertEquals(
            listOf(
                ShcarePrimaryDestinationId.Overview,
                ShcarePrimaryDestinationId.Measure,
                ShcarePrimaryDestinationId.Records,
                ShcarePrimaryDestinationId.Account,
            ),
            fullyAuthorized.map(ShcarePrimaryDestination::id),
        )

        val dashboardOnlyContext =
            patientContext(capabilities = setOf("personal.dashboard.view"))
        val dashboardOnly = ShcarePrimaryNavigationContract.destinationsFor(
            context = dashboardOnlyContext,
            expectedAuthorityEpoch = dashboardOnlyContext.authorityEpoch,
        )
        assertEquals(
            listOf(
                ShcarePrimaryDestinationId.Overview,
                ShcarePrimaryDestinationId.Account,
            ),
            dashboardOnly.map(ShcarePrimaryDestination::id),
        )

        val noFeatureContext = patientContext(capabilities = emptySet())
        val noFeatureCapabilities = ShcarePrimaryNavigationContract.destinationsFor(
            context = noFeatureContext,
            expectedAuthorityEpoch = noFeatureContext.authorityEpoch,
        )
        assertEquals(
            listOf(ShcarePrimaryDestinationId.Account),
            noFeatureCapabilities.map(ShcarePrimaryDestination::id),
        )
    }

    @Test
    fun clinicalNavigationExposesOnlyRealBackendAuthorizedDestinations() {
        val clinical = clinicalContext(
                capabilities = setOf(
                    "workspace.dashboard.view",
                    "workspace.patients.view",
                    "workspace.patients.manage",
                    "workspace.alerts.view",
                    "workspace.alerts.manage",
                ),
            )
        val destinations = ShcarePrimaryNavigationContract.destinationsFor(
            context = clinical,
            expectedAuthorityEpoch = clinical.authorityEpoch,
        )

        assertEquals(
            listOf(
                ShcarePrimaryDestinationId.Today,
                ShcarePrimaryDestinationId.Patients,
                ShcarePrimaryDestinationId.Alerts,
                ShcarePrimaryDestinationId.Account,
            ),
            destinations.map(ShcarePrimaryDestination::id),
        )

        val readOnlyContext = clinicalContext(
            capabilities = setOf(
                "workspace.patients.view",
                "workspace.alerts.view",
            ),
        )
        val readOnlyDestinations = ShcarePrimaryNavigationContract.destinationsFor(
            context = readOnlyContext,
            expectedAuthorityEpoch = readOnlyContext.authorityEpoch,
        )
        assertEquals(
            listOf(
                ShcarePrimaryDestinationId.Patients,
                ShcarePrimaryDestinationId.Alerts,
                ShcarePrimaryDestinationId.Account,
            ),
            readOnlyDestinations.map(ShcarePrimaryDestination::id),
        )

        val roleWithoutCapabilityContext = clinicalContext(capabilities = emptySet())
        val roleWithoutCapability = ShcarePrimaryNavigationContract.destinationsFor(
            context = roleWithoutCapabilityContext,
            expectedAuthorityEpoch = roleWithoutCapabilityContext.authorityEpoch,
        )
        assertEquals(
            listOf(ShcarePrimaryDestinationId.Account),
            roleWithoutCapability.map(ShcarePrimaryDestination::id),
        )
    }

    @Test
    fun primaryRouteRecognitionUsesTheAuthorizedTypedDestinationSet() {
        val patient = patientContext(
            capabilities = setOf(
                "personal.dashboard.view",
                "personal.scans.manage",
            ),
        )

        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "/patient-dashboard/",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "new-scan",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "records?source=notification",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "settings",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertFalse(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "record-detail/record-42",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )
        assertFalse(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "dashboard",
                context = patient,
                expectedAuthorityEpoch = patient.authorityEpoch,
            ),
        )

        val capabilityLimitedPatient = patientContext(
            capabilities = setOf("personal.dashboard.view"),
        )
        assertFalse(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "new-scan",
                context = capabilityLimitedPatient,
                expectedAuthorityEpoch = capabilityLimitedPatient.authorityEpoch,
            ),
        )

        val clinical = clinicalContext(
            capabilities = setOf(
                "workspace.dashboard.view",
                "workspace.patients.view",
                "workspace.alerts.view",
            ),
        )
        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "dashboard",
                context = clinical,
                expectedAuthorityEpoch = clinical.authorityEpoch,
            ),
        )
        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "settings",
                context = clinical,
                expectedAuthorityEpoch = clinical.authorityEpoch,
            ),
        )
        assertFalse(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "patient-dashboard",
                context = clinical,
                expectedAuthorityEpoch = clinical.authorityEpoch,
            ),
        )
        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "clinical-patients",
                context = clinical,
                expectedAuthorityEpoch = clinical.authorityEpoch,
            ),
        )
        assertTrue(
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = "clinical-alerts",
                context = clinical,
                expectedAuthorityEpoch = clinical.authorityEpoch,
            ),
        )
    }

    private fun patientContext(
        capabilities: Set<String>,
    ) = MobileRouteAccessContext(
        userId = "patient-1",
        workspaceId = "workspace-1",
        role = "patient",
        capabilities = capabilities,
        experience = MobileExperience.Patient,
        authorityEpoch = 7L,
    )

    private fun clinicalContext(
        capabilities: Set<String>,
    ) = MobileRouteAccessContext(
        userId = "doctor-1",
        workspaceId = "workspace-1",
        role = "doctor",
        capabilities = capabilities,
        experience = MobileExperience.Clinical,
        authorityEpoch = 9L,
    )
}
