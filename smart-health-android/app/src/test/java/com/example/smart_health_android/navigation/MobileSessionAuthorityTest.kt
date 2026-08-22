package com.example.smart_health_android.navigation

import com.example.smart_health_android.data.ActiveProfileResult
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MobileSessionAuthorityTest {
    @Test
    fun establishNormalizesBackendAuthorityAndMatchesFirebaseIdentity() {
        val store = MobileSessionAuthorityStore()

        val result = store.establish(
            user = clinicalUser(
                capabilities = listOf(
                    " workspace.patients.view ",
                    "workspace.alerts.manage",
                    "workspace.patients.view",
                    "",
                ),
            ),
            firebaseUserId = "firebase-uid-1",
        )

        assertTrue(result is MobileAuthorityUpdate.Accepted)
        assertEquals(
            MobileSessionAuthority(
                userId = "usr-internal-1",
                firebaseUserId = "firebase-uid-1",
                workspaceId = "workspace-1",
                role = "doctor",
                capabilities = setOf(
                    "workspace.alerts.manage",
                    "workspace.patients.view",
                ),
                epoch = 1L,
                experience = MobileExperience.Clinical,
            ),
            store.state.value.authority,
        )
    }

    @Test
    fun backendUserIdAndFirebaseUidRemainDistinctIdentityNamespaces() {
        val store = MobileSessionAuthorityStore()
        val result = store.establish(
            user = clinicalUser().copy(
                id = "usr-internal-42",
                firebaseUid = "firebase-uid-42",
            ),
            firebaseUserId = "firebase-uid-42",
        )

        assertTrue(result is MobileAuthorityUpdate.Accepted)
        assertEquals("usr-internal-42", store.state.value.authority?.userId)
        assertEquals("firebase-uid-42", store.state.value.authority?.firebaseUserId)
    }

    @Test
    fun establishRejectsMissingOrMismatchedIdentityWithoutReplacingAuthority() {
        val store = MobileSessionAuthorityStore()
        store.establish(clinicalUser(), firebaseUserId = "firebase-uid-1")
        val original = store.state.value

        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.MissingUser),
            store.establish(
                clinicalUser().copy(id = " "),
                firebaseUserId = "firebase-uid-1",
            ),
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.IdentityMismatch),
            store.establish(
                clinicalUser(),
                firebaseUserId = "different-user",
            ),
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.MissingLocalIdentity),
            store.establish(
                clinicalUser(),
                firebaseUserId = " ",
            ),
        )
        assertEquals(original, store.state.value)
    }

    @Test
    fun establishRejectsMissingWorkspaceAndUnsupportedRolesFailClosed() {
        val store = MobileSessionAuthorityStore()

        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.MissingWorkspace),
            store.establish(
                AuthUser(
                    id = "usr-internal-1",
                    firebaseUid = "firebase-uid-1",
                    role = "patient",
                ),
                firebaseUserId = "firebase-uid-1",
            ),
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.UnsupportedRole),
            store.establish(
                clinicalUser().copy(
                    role = "viewer",
                    currentMembership = clinicalUser().currentMembership?.copy(role = "viewer"),
                    currentWorkspace = clinicalUser().currentWorkspace?.copy(role = "viewer"),
                ),
                firebaseUserId = "firebase-uid-1",
            ),
        )
        assertNull(store.state.value.authority)
        assertEquals(0L, store.state.value.epoch)
    }

    @Test
    fun lockedDeletedOrSuspendedBackendAuthorityFailsClosed() {
        val store = MobileSessionAuthorityStore()

        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountInactive),
            store.establish(
                clinicalUser().copy(accountStatus = "locked"),
                firebaseUserId = "firebase-uid-1",
            ),
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountInactive),
            store.establish(
                clinicalUser().copy(deletedAt = "2026-07-26T12:00:00.000Z"),
                firebaseUserId = "firebase-uid-1",
            ),
        )
        val suspendedMembership = clinicalUser().currentMembership!!.copy(
            status = "suspended",
            operational = false,
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.MembershipInactive),
            store.establish(
                clinicalUser().copy(
                    currentMembership = suspendedMembership,
                    memberships = listOf(suspendedMembership),
                ),
                firebaseUserId = "firebase-uid-1",
            ),
        )
        assertNull(store.state.value.authority)
    }

    @Test
    fun patientAuthorityUsesThePatientExperience() {
        val store = MobileSessionAuthorityStore()

        val result = store.establish(
            user = patientUser(activePatientId = "patient-a"),
            firebaseUserId = "firebase-uid-1",
        )

        assertTrue(result is MobileAuthorityUpdate.Accepted)
        assertEquals(MobileExperience.Patient, store.state.value.authority?.experience)
        assertEquals("patient-a", store.state.value.authority?.activePatientId)
    }

    @Test
    fun confirmedActiveProfileSwitchAdvancesAuthorityEpochForTheBoundPatientSubject() {
        val store = MobileSessionAuthorityStore()
        val established = store.establish(
            user = patientUser(activePatientId = "patient-a"),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        assertTrue(established is MobileAuthorityUpdate.Accepted)
        val authorityA = checkNotNull(store.state.value.authority)
        assertEquals("patient-a", authorityA.activePatientId)

        val switched = store.confirmActiveProfileSwitch(
            result = ActiveProfileResult(
                user = patientUser(activePatientId = "patient-b"),
                activePatient = patientProfile(
                    id = "patient-b",
                    guardianUserId = "usr-internal-1",
                ),
            ),
            expectedPatientId = "patient-b",
            expectedAuthority = authorityA,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 2_000L,
        )

        assertTrue(switched is MobileAuthorityUpdate.Accepted)
        val authorityB = (switched as MobileAuthorityUpdate.Accepted).authority
        assertEquals(authorityA.userId, authorityB.userId)
        assertEquals(authorityA.workspaceId, authorityB.workspaceId)
        assertEquals("patient-b", authorityB.activePatientId)
        assertEquals(authorityA.epoch + 1L, authorityB.epoch)
        assertEquals(authorityB, store.state.value.authority)
        assertEquals(2_000L, store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun activeProfileSwitchRejectsForeignAccountWorkspaceOrPatientWithoutChangingAuthority() {
        val store = MobileSessionAuthorityStore()
        store.establish(
            user = patientUser(activePatientId = "patient-a"),
            firebaseUserId = "firebase-uid-1",
        )
        val original = store.state.value
        val expectedAuthority = checkNotNull(original.authority)

        val foreignAccount = store.confirmActiveProfileSwitch(
            result = ActiveProfileResult(
                user = patientUser(activePatientId = "patient-b").copy(id = "usr-foreign"),
                activePatient = patientProfile(
                    id = "patient-b",
                    guardianUserId = "usr-foreign",
                ),
            ),
            expectedPatientId = "patient-b",
            expectedAuthority = expectedAuthority,
            firebaseUserId = "firebase-uid-1",
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountMismatch),
            foreignAccount,
        )
        assertEquals(original, store.state.value)

        val foreignWorkspace = store.confirmActiveProfileSwitch(
            result = ActiveProfileResult(
                user = patientUser(activePatientId = "patient-b"),
                activePatient = patientProfile(
                    id = "patient-b",
                    organizationId = "workspace-foreign",
                    guardianUserId = "usr-internal-1",
                ),
            ),
            expectedPatientId = "patient-b",
            expectedAuthority = expectedAuthority,
            firebaseUserId = "firebase-uid-1",
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.PatientWorkspaceMismatch),
            foreignWorkspace,
        )
        assertEquals(original, store.state.value)

        val foreignPatient = store.confirmActiveProfileSwitch(
            result = ActiveProfileResult(
                user = patientUser(activePatientId = "patient-b"),
                activePatient = patientProfile(
                    id = "patient-b",
                    guardianUserId = "usr-foreign",
                ),
            ),
            expectedPatientId = "patient-b",
            expectedAuthority = expectedAuthority,
            firebaseUserId = "firebase-uid-1",
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.ActivePatientMismatch),
            foreignPatient,
        )
        assertEquals(original, store.state.value)
    }

    @Test
    fun staleActiveProfileSwitchReceiptCannotMutateAReplacementAuthorityForTheSameIdentity() {
        val store = MobileSessionAuthorityStore()
        val staleAuthority = (
            store.establish(
                user = patientUser(activePatientId = "patient-a"),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 1_000L,
            ) as MobileAuthorityUpdate.Accepted
            ).authority
        val replacementAuthority = (
            store.establish(
                user = patientUser(activePatientId = "patient-a"),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 2_000L,
            ) as MobileAuthorityUpdate.Accepted
            ).authority
        val replacementState = store.state.value

        val result = store.confirmActiveProfileSwitch(
            result = ActiveProfileResult(
                user = patientUser(activePatientId = "patient-b"),
                activePatient = patientProfile(
                    id = "patient-b",
                    guardianUserId = "usr-internal-1",
                ),
            ),
            expectedPatientId = "patient-b",
            expectedAuthority = staleAuthority,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 3_000L,
        )

        assertEquals(staleAuthority.userId, replacementAuthority.userId)
        assertEquals(staleAuthority.firebaseUserId, replacementAuthority.firebaseUserId)
        assertEquals(staleAuthority.epoch + 1L, replacementAuthority.epoch)
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AuthorityChanged),
            result,
        )
        assertEquals(replacementState, store.state.value)
    }

    @Test
    fun confirmedWorkspaceSwitchRequiresSameAccountAndBackendConfirmedTarget() {
        val store = MobileSessionAuthorityStore()
        store.establish(clinicalUser(), firebaseUserId = "firebase-uid-1")
        val original = store.state.value
        val expectedAuthority = checkNotNull(original.authority)

        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountMismatch),
            store.confirmWorkspaceSwitch(
                user = clinicalUser().copy(
                    id = "usr-internal-2",
                    firebaseUid = "firebase-uid-2",
                    currentWorkspaceId = "workspace-2",
                ),
                expectedWorkspaceId = "workspace-2",
                expectedAuthority = expectedAuthority,
                firebaseUserId = "firebase-uid-2",
            ),
        )
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.WorkspaceMismatch),
            store.confirmWorkspaceSwitch(
                user = clinicalUser().copy(currentWorkspaceId = "workspace-1"),
                expectedWorkspaceId = "workspace-2",
                expectedAuthority = expectedAuthority,
                firebaseUserId = "firebase-uid-1",
            ),
        )
        assertEquals(original, store.state.value)
    }

    @Test
    fun confirmedWorkspaceSwitchRefreshesRoleCapabilitiesAndEpoch() {
        val store = MobileSessionAuthorityStore()
        store.establish(clinicalUser(), firebaseUserId = "firebase-uid-1")
        val expectedAuthority = checkNotNull(store.state.value.authority)
        val switchedUser = clinicalUser().copy(
            currentWorkspaceId = " workspace-2 ",
            currentMembership = WorkspaceMembership(
                workspaceId = "workspace-2",
                role = "nurse",
            ),
            currentWorkspace = WorkspaceSummary(
                id = "workspace-2",
                role = "nurse",
            ),
            capabilities = listOf("workspace.alerts.manage"),
        )

        val result = store.confirmWorkspaceSwitch(
            user = switchedUser,
            expectedWorkspaceId = "workspace-2",
            expectedAuthority = expectedAuthority,
            firebaseUserId = "firebase-uid-1",
        )

        assertTrue(result is MobileAuthorityUpdate.Accepted)
        assertEquals("workspace-2", store.state.value.authority?.workspaceId)
        assertEquals("nurse", store.state.value.authority?.role)
        assertEquals(setOf("workspace.alerts.manage"), store.state.value.authority?.capabilities)
        assertEquals(2L, store.state.value.authority?.epoch)
        assertEquals(2L, store.state.value.epoch)
    }

    @Test
    fun staleWorkspaceSwitchReceiptCannotMutateAReplacementAuthorityForTheSameIdentity() {
        val store = MobileSessionAuthorityStore()
        val staleAuthority = (
            store.establish(
                user = clinicalUser(),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 1_000L,
            ) as MobileAuthorityUpdate.Accepted
            ).authority
        val replacementAuthority = (
            store.establish(
                user = clinicalUser(),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 2_000L,
            ) as MobileAuthorityUpdate.Accepted
            ).authority
        val replacementState = store.state.value

        val result = store.confirmWorkspaceSwitch(
            user = clinicalUser().copy(
                currentWorkspaceId = "workspace-2",
                currentMembership = WorkspaceMembership(
                    workspaceId = "workspace-2",
                    role = "nurse",
                ),
                currentWorkspace = WorkspaceSummary(
                    id = "workspace-2",
                    role = "nurse",
                ),
                capabilities = listOf("workspace.alerts.manage"),
            ),
            expectedWorkspaceId = "workspace-2",
            expectedAuthority = staleAuthority,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 3_000L,
        )

        assertEquals(staleAuthority.userId, replacementAuthority.userId)
        assertEquals(staleAuthority.firebaseUserId, replacementAuthority.firebaseUserId)
        assertEquals(staleAuthority.epoch + 1L, replacementAuthority.epoch)
        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AuthorityChanged),
            result,
        )
        assertEquals(replacementState, store.state.value)
    }

    @Test
    fun switchWithoutAnActiveAuthorityIsRejected() {
        val store = MobileSessionAuthorityStore()
        val expectedAuthority = (
            MobileSessionAuthorityStore().establish(
                user = clinicalUser(),
                firebaseUserId = "firebase-uid-1",
            ) as MobileAuthorityUpdate.Accepted
            ).authority

        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.NoActiveAuthority),
            store.confirmWorkspaceSwitch(
                user = clinicalUser().copy(currentWorkspaceId = "workspace-2"),
                expectedWorkspaceId = "workspace-2",
                expectedAuthority = expectedAuthority,
                firebaseUserId = "firebase-uid-1",
            ),
        )
    }

    @Test
    fun beginReauthorizationLocksTheActiveAuthorityState() {
        val store = MobileSessionAuthorityStore()
        store.establish(
            clinicalUser(),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        val active = store.state.value.authority

        val lockedAuthority = store.beginReauthorization()
        val lockedState = store.state.value

        assertNotNull(lockedAuthority)
        assertEquals(active, lockedAuthority)
        assertEquals(active, lockedState.authority)
        assertEquals(1L, lockedState.epoch)
        assertEquals(1_000L, lockedState.verifiedAtElapsedRealtimeMillis)
        assertTrue(lockedState.reauthorizing)
        assertNull(store.beginReauthorization())
        assertEquals(lockedState, store.state.value)
    }

    @Test
    fun sameAuthorityReauthorizationKeepsEpochAndRefreshesVerificationTime() {
        val store = MobileSessionAuthorityStore()
        store.establish(
            clinicalUser(),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        val expectedAuthority = checkNotNull(store.beginReauthorization())

        val result = store.completeReauthorization(
            user = clinicalUser(),
            expectedAuthority = expectedAuthority,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 2_500L,
        )

        assertTrue(result is MobileAuthorityUpdate.Accepted)
        assertEquals(1L, store.state.value.epoch)
        assertEquals(1L, store.state.value.authority?.epoch)
        assertFalse(store.state.value.reauthorizing)
        assertEquals(2_500L, store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun changedWorkspaceRoleAndCapabilitiesAdvanceEpochAfterReauthorization() {
        val store = MobileSessionAuthorityStore()
        store.establish(
            clinicalUser(),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        val expectedAuthority = checkNotNull(store.beginReauthorization())
        val refreshedUser = clinicalUser().copy(
            currentWorkspaceId = "workspace-2",
            currentMembership = WorkspaceMembership(
                workspaceId = "workspace-2",
                role = "nurse",
            ),
            memberships = listOf(
                WorkspaceMembership(
                    workspaceId = "workspace-2",
                    role = "nurse",
                ),
            ),
            currentWorkspace = WorkspaceSummary(
                id = "workspace-2",
                role = "nurse",
            ),
            capabilities = listOf(
                "workspace.alerts.manage",
                "workspace.patients.view",
            ),
        )

        val result = store.completeReauthorization(
            user = refreshedUser,
            expectedAuthority = expectedAuthority,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 3_000L,
        )

        assertTrue(result is MobileAuthorityUpdate.Accepted)
        assertEquals(2L, store.state.value.epoch)
        assertEquals(2L, store.state.value.authority?.epoch)
        assertEquals("workspace-2", store.state.value.authority?.workspaceId)
        assertEquals("nurse", store.state.value.authority?.role)
        assertEquals(
            setOf("workspace.alerts.manage", "workspace.patients.view"),
            store.state.value.authority?.capabilities,
        )
        assertFalse(store.state.value.reauthorizing)
        assertEquals(3_000L, store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun changedActivePatientAdvancesEpochAfterReauthorization() {
        val store = MobileSessionAuthorityStore()
        store.establish(
            patientUser(activePatientId = "patient-a"),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        val expectedAuthority = checkNotNull(store.beginReauthorization())
        assertEquals("patient-a", expectedAuthority.activePatientId)

        val result = store.completeReauthorization(
            user = patientUser(activePatientId = "patient-b"),
            expectedAuthority = expectedAuthority,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 2_000L,
        )

        assertTrue(result is MobileAuthorityUpdate.Accepted)
        assertEquals(2L, store.state.value.epoch)
        assertEquals(2L, store.state.value.authority?.epoch)
        assertEquals("patient-b", store.state.value.authority?.activePatientId)
        assertFalse(store.state.value.reauthorizing)
        assertEquals(2_000L, store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun staleResponseCannotCompleteAReplacementAuthorityForTheSameBackendAccount() {
        val store = MobileSessionAuthorityStore()
        store.establish(
            clinicalUser(),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        val staleAuthority = checkNotNull(store.beginReauthorization())

        store.clear()
        store.establish(
            clinicalUser(),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 2_000L,
        )
        val replacementAuthority = checkNotNull(store.beginReauthorization())

        val result = store.completeReauthorization(
            user = clinicalUser(),
            expectedAuthority = staleAuthority,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 3_000L,
        )

        assertEquals(
            MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AuthorityChanged),
            result,
        )
        assertFalse(store.clearIfCurrent(staleAuthority))
        assertEquals(replacementAuthority, store.state.value.authority)
        assertTrue(store.state.value.reauthorizing)
        assertEquals(2_000L, store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun staleLogoutSnapshotCannotInvalidateAReplacementAuthority() {
        val store = MobileSessionAuthorityStore()
        val staleAuthority = (
            store.establish(
                clinicalUser(),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 1_000L,
            ) as MobileAuthorityUpdate.Accepted
            ).authority
        val replacementAuthority = (
            store.establish(
                clinicalUser(),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 2_000L,
            ) as MobileAuthorityUpdate.Accepted
            ).authority

        assertFalse(store.invalidateIfCurrent(staleAuthority))
        assertEquals(replacementAuthority, store.state.value.authority)
        assertEquals(2_000L, store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun invalidIdentityAccountOrMembershipCannotCompleteReauthorization() {
        val suspendedMembership = clinicalUser().currentMembership!!.copy(
            status = "suspended",
            operational = false,
        )
        val cases = listOf(
            Triple(
                clinicalUser(),
                " ",
                MobileAuthorityRejection.MissingLocalIdentity,
            ),
            Triple(
                clinicalUser().copy(firebaseUid = " "),
                "firebase-uid-1",
                MobileAuthorityRejection.MissingIdentityBinding,
            ),
            Triple(
                clinicalUser(),
                "another-firebase-uid",
                MobileAuthorityRejection.IdentityMismatch,
            ),
            Triple(
                clinicalUser().copy(
                    id = "usr-internal-2",
                    firebaseUid = "firebase-uid-2",
                ),
                "firebase-uid-2",
                MobileAuthorityRejection.AccountMismatch,
            ),
            Triple(
                clinicalUser().copy(accountStatus = "locked"),
                "firebase-uid-1",
                MobileAuthorityRejection.AccountInactive,
            ),
            Triple(
                clinicalUser().copy(deletedAt = "2026-07-26T12:00:00.000Z"),
                "firebase-uid-1",
                MobileAuthorityRejection.AccountInactive,
            ),
            Triple(
                clinicalUser().copy(
                    currentMembership = suspendedMembership,
                    memberships = listOf(suspendedMembership),
                ),
                "firebase-uid-1",
                MobileAuthorityRejection.MembershipInactive,
            ),
        )

        cases.forEach { (user, firebaseUserId, expectedRejection) ->
            val store = MobileSessionAuthorityStore()
            store.establish(
                clinicalUser(),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 1_000L,
            )
            val expectedAuthority = checkNotNull(store.beginReauthorization())
            val lockedState = store.state.value

            val result = store.completeReauthorization(
                user = user,
                expectedAuthority = expectedAuthority,
                firebaseUserId = firebaseUserId,
                verifiedAtElapsedRealtimeMillis = 2_000L,
            )

            assertEquals(
                MobileAuthorityUpdate.Rejected(expectedRejection),
                result,
            )
            assertEquals(lockedState, store.state.value)
            assertTrue(store.state.value.reauthorizing)
        }
    }

    @Test
    fun needsReauthorizationUsesMonotonicVerificationTtl() {
        val store = MobileSessionAuthorityStore()

        assertFalse(
            store.needsReauthorization(
                elapsedRealtimeMillis = 1_000L,
                maxAgeMillis = 500L,
            ),
        )
        store.establish(
            clinicalUser(),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )

        assertFalse(store.needsReauthorization(1_499L, 500L))
        assertTrue(store.needsReauthorization(1_500L, 500L))
        assertTrue(store.needsReauthorization(999L, 500L))
        assertTrue(store.needsReauthorization(1_000L, 0L))

        store.beginReauthorization()
        assertFalse(store.needsReauthorization(2_000L, 500L))
    }

    @Test
    fun clearRemovesAuthorityAdvancesEpochAndResetsReauthorizationMetadata() {
        val store = MobileSessionAuthorityStore()
        store.establish(
            clinicalUser(),
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        store.beginReauthorization()

        val cleared = store.clear()

        assertNull(cleared.authority)
        assertEquals(2L, cleared.epoch)
        assertFalse(cleared.reauthorizing)
        assertEquals(0L, cleared.verifiedAtElapsedRealtimeMillis)
        assertEquals(cleared, store.state.value)
    }

    private fun clinicalUser(
        capabilities: List<String> = listOf("workspace.dashboard.view"),
    ): AuthUser {
        return AuthUser(
            id = " usr-internal-1 ",
            firebaseUid = "firebase-uid-1",
            role = "DOCTOR",
            organizationId = "organization-fallback",
            currentWorkspaceId = " workspace-1 ",
            currentMembership = WorkspaceMembership(
                workspaceId = "workspace-1",
                role = " Doctor ",
            ),
            currentWorkspace = WorkspaceSummary(
                id = "workspace-1",
                role = "doctor",
            ),
            capabilities = capabilities,
        )
    }

    private fun patientUser(activePatientId: String): AuthUser {
        val membership = WorkspaceMembership(
            workspaceId = "workspace-1",
            role = "patient",
        )
        return AuthUser(
            id = "usr-internal-1",
            firebaseUid = "firebase-uid-1",
            role = "patient",
            organizationId = "workspace-1",
            currentWorkspaceId = "workspace-1",
            activePatientId = activePatientId,
            currentMembership = membership,
            currentWorkspace = WorkspaceSummary(
                id = "workspace-1",
                role = "patient",
            ),
            memberships = listOf(membership),
            capabilities = listOf("personal.dashboard.view"),
        )
    }

    private fun patientProfile(
        id: String,
        organizationId: String = "workspace-1",
        guardianUserId: String = "",
    ) = Patient(
        id = id,
        patientCode = "P-$id",
        name = "Patient $id",
        profileType = "dependent",
        guardianUserId = guardianUserId,
        organizationId = organizationId,
    )
}
