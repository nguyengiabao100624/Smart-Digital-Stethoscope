package com.example.smart_health_android.security

import com.example.smart_health_android.navigation.MobileExperience
import com.example.smart_health_android.navigation.MobileRouteAccessContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChangePasswordRouteAccessTest {
    @Test
    fun `authorized binding freezes the exact account workspace and epoch`() {
        val binding = bindChangePasswordRouteAccess(
            context = context,
            firebaseUserId = "firebase-user-a",
            expectedAuthorityEpoch = 7L,
        )

        val authority = requireNotNull(binding.authority)
        assertEquals("user-a", authority.userId)
        assertEquals("firebase-user-a", authority.firebaseUserId)
        assertEquals("workspace-a", authority.workspaceId)
        assertEquals("patient", authority.role)
        assertEquals(7L, authority.authorityEpoch)
        assertTrue(authority.capabilities.contains("account.security.manage"))
    }

    @Test
    fun `stale epoch or missing workspace fails closed`() {
        assertNull(
            bindChangePasswordRouteAccess(
                context = context,
                firebaseUserId = "firebase-user-a",
                expectedAuthorityEpoch = 8L,
            ).authority,
        )
        assertNull(
            bindChangePasswordRouteAccess(
                context = context.copy(workspaceId = ""),
                firebaseUserId = "firebase-user-a",
                expectedAuthorityEpoch = 7L,
            ).authority,
        )
        assertNull(
            bindChangePasswordRouteAccess(
                context = context,
                firebaseUserId = "",
                expectedAuthorityEpoch = 7L,
            ).authority,
        )
    }

    private val context = MobileRouteAccessContext(
        userId = "user-a",
        workspaceId = "workspace-a",
        role = "patient",
        capabilities = setOf("account.security.manage"),
        experience = MobileExperience.Patient,
        authorityEpoch = 7L,
    )
}
