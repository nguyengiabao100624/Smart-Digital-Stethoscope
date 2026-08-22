package com.example.smart_health_android.settings

import com.example.smart_health_android.navigation.MobileExperience
import com.example.smart_health_android.navigation.MobileRouteAccessContext
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsRouteAccessTest {
    @Test
    fun `patient feature gates come from typed route contracts`() {
        val binding = bindSettingsRouteAccess(
            context = context(
                experience = MobileExperience.Patient,
                capabilities = setOf(
                    "personal.profiles.manage",
                    "personal.devices.manage",
                    "personal.scans.manage",
                ),
            ),
            expectedAuthorityEpoch = 11L,
        )

        assertTrue(binding.authority != null)
        assertTrue(binding.features.canManageFamilyProfiles)
        assertTrue(binding.features.canManageStethoscope)
        assertFalse(binding.features.canViewAiCalibration)
        assertTrue(binding.features.canViewDataStorage)
    }

    @Test
    fun `clinical feature gates keep patient family profiles closed`() {
        val binding = bindSettingsRouteAccess(
            context = context(
                experience = MobileExperience.Clinical,
                capabilities = setOf(
                    "workspace.devices.manage",
                    "workspace.scans.view",
                ),
            ),
            expectedAuthorityEpoch = 11L,
        )

        assertFalse(binding.features.canManageFamilyProfiles)
        assertTrue(binding.features.canManageStethoscope)
        assertTrue(binding.features.canViewAiCalibration)
        assertTrue(binding.features.canViewDataStorage)
    }

    @Test
    fun `missing capabilities independently hide stethoscope and storage`() {
        val binding = bindSettingsRouteAccess(
            context = context(
                experience = MobileExperience.Clinical,
                capabilities = emptySet(),
            ),
            expectedAuthorityEpoch = 11L,
        )

        assertFalse(binding.features.canManageFamilyProfiles)
        assertFalse(binding.features.canManageStethoscope)
        assertTrue(binding.features.canViewAiCalibration)
        assertFalse(binding.features.canViewDataStorage)
    }

    @Test
    fun `null or stale route context fails closed for authority and every feature`() {
        val missing = bindSettingsRouteAccess(
            context = null,
            expectedAuthorityEpoch = 11L,
        )
        val stale = bindSettingsRouteAccess(
            context = context(
                experience = MobileExperience.Patient,
                capabilities = setOf(
                    "personal.profiles.manage",
                    "personal.devices.manage",
                    "personal.scans.manage",
                ),
            ),
            expectedAuthorityEpoch = 12L,
        )

        assertNull(missing.authority)
        assertFalse(missing.features.anyAvailable)
        assertNull(stale.authority)
        assertFalse(stale.features.anyAvailable)
    }

    private fun context(
        experience: MobileExperience,
        capabilities: Set<String>,
    ) = MobileRouteAccessContext(
        userId = "user-1",
        workspaceId = "workspace-1",
        role = if (experience == MobileExperience.Patient) "patient" else "doctor",
        capabilities = capabilities,
        experience = experience,
        authorityEpoch = 11L,
    )
}
