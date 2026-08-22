package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class DoctorApprovalOwnerGuardTest {
    @Test
    fun `A to B to A Firebase race cannot reuse the captured approval session or clear B`() {
        val accountA = owner("firebase-a", "doctor-a@shcare.vn", sessionEpoch = 1L)
        val accountAReturned = accountA.copy(sessionEpoch = 3L)
        val authorityA = AuthSessionAuthority("bearer-a", epoch = 7L)
        val authorityB = AuthSessionAuthority("bearer-b", epoch = 8L)
        val environment = FakeDoctorApprovalOwnerEnvironment(
            firebaseOwner = accountA,
            backendEpoch = authorityA.epoch,
            backendAuthority = authorityA,
        )
        val guard = DoctorApprovalOwnerGuard(environment)
        val captured = guard.capture()

        environment.firebaseOwner = accountAReturned
        environment.backendEpoch = authorityB.epoch
        environment.backendAuthority = authorityB

        assertThrows(IllegalStateException::class.java) {
            guard.requireCurrent(captured)
        }

        assertEquals(listOf(authorityA), environment.clearAttempts)
        assertEquals(authorityB, environment.backendAuthority)
    }

    @Test
    fun `malformed approval receipt clears only the still-owned backend authority`() {
        val accountA = owner("firebase-a", "doctor-a@shcare.vn", sessionEpoch = 1L)
        val authorityA = AuthSessionAuthority("bearer-a", epoch = 7L)
        val environment = FakeDoctorApprovalOwnerEnvironment(
            firebaseOwner = accountA,
            backendEpoch = authorityA.epoch,
            backendAuthority = authorityA,
        )
        val guard = DoctorApprovalOwnerGuard(environment)
        val captured = guard.capture()

        assertThrows(IllegalStateException::class.java) {
            guard.requireReceiptOwner(
                user = validUser().copy(firebaseUid = "firebase-b"),
                expected = captured,
                expectedBackendUserId = "backend-a",
            )
        }

        assertEquals(listOf(authorityA), environment.clearAttempts)
        assertNull(environment.backendAuthority)
    }

    @Test
    fun `approval receipt must match Firebase identity email lifecycle and backend user`() {
        val accountA = owner("firebase-a", "doctor-a@shcare.vn", sessionEpoch = 1L)
        val authorityA = AuthSessionAuthority("bearer-a", epoch = 7L)
        val environment = FakeDoctorApprovalOwnerEnvironment(
            firebaseOwner = accountA,
            backendEpoch = authorityA.epoch,
            backendAuthority = authorityA,
        )
        val guard = DoctorApprovalOwnerGuard(environment)
        val captured = guard.capture()

        guard.requireReceiptOwner(
            user = validUser(),
            expected = captured,
            expectedBackendUserId = "backend-a",
        )

        assertEquals(emptyList<AuthSessionAuthority>(), environment.clearAttempts)
        assertEquals(authorityA, environment.backendAuthority)
    }

    @Test
    fun `incoherent current workspace projection is rejected before approval side effects`() {
        val authorityA = AuthSessionAuthority("bearer-a", epoch = 7L)
        val environment = environment(authorityA)
        val guard = DoctorApprovalOwnerGuard(environment)

        assertThrows(IllegalStateException::class.java) {
            guard.requireReceiptOwner(
                user = validUser().copy(
                    organizationId = "clinic-a",
                    currentWorkspaceId = "clinic-b",
                    currentWorkspace = WorkspaceSummary(id = "clinic-c"),
                    currentMembership = activeMembership("clinic-b"),
                ),
                expected = guard.capture(),
                expectedBackendUserId = "backend-a",
            )
        }

        assertNull(environment.backendAuthority)
        assertEquals(listOf(authorityA), environment.clearAttempts)
    }

    @Test
    fun `suspended or non operational membership is rejected before approval side effects`() {
        listOf(
            activeMembership("clinic-a").copy(status = "suspended", suspendedAt = "2026-08-01T00:00:00Z"),
            activeMembership("clinic-a").copy(operational = false),
        ).forEach { membership ->
            val authorityA = AuthSessionAuthority("bearer-${membership.status}-${membership.operational}", epoch = 7L)
            val environment = environment(authorityA)
            val guard = DoctorApprovalOwnerGuard(environment)

            assertThrows(IllegalStateException::class.java) {
                guard.requireReceiptOwner(
                    user = validUser().copy(
                        organizationId = "clinic-a",
                        currentWorkspaceId = "clinic-a",
                        currentWorkspace = WorkspaceSummary(id = "clinic-a"),
                        currentMembership = membership,
                    ),
                    expected = guard.capture(),
                    expectedBackendUserId = "backend-a",
                )
            }

            assertNull(environment.backendAuthority)
            assertEquals(listOf(authorityA), environment.clearAttempts)
        }
    }

    private fun owner(
        firebaseUserId: String,
        email: String,
        sessionEpoch: Long,
    ) = FirebaseOwnerBinding(
        firebaseUserId = firebaseUserId,
        email = email,
        sessionEpoch = sessionEpoch,
    )

    private fun validUser() = AuthUser(
        id = "backend-a",
        firebaseUid = "firebase-a",
        email = "DOCTOR-A@shcare.vn ",
        accountStatus = "active",
        deletedAt = null,
        verifiedEmail = true,
        organizationId = "clinic-a",
        currentWorkspaceId = "clinic-a",
        currentWorkspace = WorkspaceSummary(id = "clinic-a"),
        currentMembership = activeMembership("clinic-a"),
    )

    private fun activeMembership(workspaceId: String) = WorkspaceMembership(
        id = "membership-$workspaceId",
        workspaceId = workspaceId,
        organizationId = workspaceId,
        workspaceType = "clinic",
        role = "doctor",
        status = "active",
        operational = true,
    )

    private fun environment(authority: AuthSessionAuthority) =
        FakeDoctorApprovalOwnerEnvironment(
            firebaseOwner = owner("firebase-a", "doctor-a@shcare.vn", sessionEpoch = 1L),
            backendEpoch = authority.epoch,
            backendAuthority = authority,
        )
}

private class FakeDoctorApprovalOwnerEnvironment(
    var firebaseOwner: FirebaseOwnerBinding?,
    var backendEpoch: Long,
    var backendAuthority: AuthSessionAuthority?,
) : DoctorApprovalOwnerEnvironment {
    val clearAttempts = mutableListOf<AuthSessionAuthority>()

    override fun currentFirebaseOwner(): FirebaseOwnerBinding? = firebaseOwner

    override fun currentBackendEpoch(): Long = backendEpoch

    override fun currentBackendAuthority(): AuthSessionAuthority? = backendAuthority

    override fun clearBackendAuthorityIfCurrent(expectedAuthority: AuthSessionAuthority): Boolean {
        clearAttempts += expectedAuthority
        if (backendAuthority != expectedAuthority || backendEpoch != expectedAuthority.epoch) {
            return false
        }
        backendAuthority = null
        backendEpoch += 1L
        return true
    }
}
