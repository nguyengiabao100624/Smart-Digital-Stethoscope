package com.example.smart_health_android.patientdashboard

import com.example.smart_health_android.navigation.MobileExperience
import com.example.smart_health_android.navigation.MobileRouteAccessContext
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PatientDashboardRouteAccessTest {
    @Test
    fun `patient dashboard binds the exact patient authority and typed feature routes`() {
        val binding = bindPatientDashboardRouteAccess(
            context = patientContext(
                capabilities = setOf(
                    "personal.dashboard.view",
                    "personal.scans.manage",
                    "personal.devices.manage",
                    "personal.appointments.view",
                ),
            ),
            expectedAuthorityEpoch = 9L,
        )

        assertNotNull(binding.authority)
        assertTrue(binding.features.canStartScan)
        assertTrue(binding.features.canViewRecords)
        assertTrue(binding.features.canManageDevice)
        assertTrue(binding.features.canViewAppointments)
        assertTrue(binding.features.canUseAssistant)
    }

    @Test
    fun `feature actions fail closed when backend capabilities are absent`() {
        val binding = bindPatientDashboardRouteAccess(
            context = patientContext(capabilities = setOf("personal.dashboard.view")),
            expectedAuthorityEpoch = 9L,
        )

        assertNotNull(binding.authority)
        assertFalse(binding.features.canStartScan)
        assertFalse(binding.features.canViewRecords)
        assertFalse(binding.features.canManageDevice)
        assertFalse(binding.features.canViewAppointments)
        assertTrue(binding.features.canUseAssistant)
    }

    @Test
    fun `clinical experience and stale epochs cannot bind a patient dashboard`() {
        assertNull(
            bindPatientDashboardRouteAccess(
                context = patientContext(
                    experience = MobileExperience.Clinical,
                    role = "doctor",
                ),
                expectedAuthorityEpoch = 9L,
            ).authority,
        )
        assertNull(
            bindPatientDashboardRouteAccess(
                context = patientContext(),
                expectedAuthorityEpoch = 10L,
            ).authority,
        )
    }

    private fun patientContext(
        capabilities: Set<String> = setOf("personal.dashboard.view"),
        experience: MobileExperience = MobileExperience.Patient,
        role: String = "patient",
    ) = MobileRouteAccessContext(
        userId = "patient-1",
        workspaceId = "workspace-1",
        role = role,
        capabilities = capabilities,
        experience = experience,
        authorityEpoch = 9L,
    )
}
