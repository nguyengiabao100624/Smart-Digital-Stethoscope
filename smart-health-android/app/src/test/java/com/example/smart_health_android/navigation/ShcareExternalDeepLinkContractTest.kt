package com.example.smart_health_android.navigation

import com.example.smart_health_android.data.FirebaseOwnerBinding
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ShcareExternalDeepLinkContractTest {
    @Test
    fun canonicalHttpsAndAppSchemeLinksResolveToTypedAuthorizedDestinations() {
        val authority = clinicalAuthority(
            capabilities = setOf(
                "workspace.dashboard.view",
                "workspace.scans.view",
                "workspace.appointments.view",
            ),
        )

        val recordDecision = evaluate(
            rawUri = "https://shcare.web.app/app/records/record-42",
            authority = authority,
        )
        assertEquals(
            ExternalMobileDeepLinkDecision.Allowed(
                contract = ShcareMobileRoute.RecordDetail,
                destinationRoute = "record-detail/record-42",
            ),
            recordDecision,
        )

        val appointmentDecision = evaluate(
            rawUri = "shcare://app/appointments/appointment-7",
            authority = authority,
        )
        assertEquals(
            ExternalMobileDeepLinkDecision.Allowed(
                contract = ShcareMobileRoute.Appointments,
                destinationRoute = "appointments?appointmentId=appointment-7",
            ),
            appointmentDecision,
        )
    }

    @Test
    fun externalLinkBindingRequiresAndFreezesTheCurrentFirebaseOwner() {
        val authority = clinicalAuthority()

        assertNull(
            ShcareExternalDeepLinkContract.bind(
                rawUri = "https://shcare.web.app/app/settings",
                currentAuthority = authority,
                currentFirebaseOwner = null,
            ),
        )
        assertNull(
            ShcareExternalDeepLinkContract.bind(
                rawUri = "https://shcare.web.app/app/settings",
                currentAuthority = authority,
                currentFirebaseOwner = firebaseOwner(firebaseUserId = "firebase-user-b"),
            ),
        )

        assertEquals(
            ShcareExternalDeepLinkLaunchRequest(
                rawUri = "https://shcare.web.app/app/settings",
                expectedFirebaseOwner = firebaseOwner(),
                expectedUserId = "doctor-1",
                expectedWorkspaceId = "workspace-1",
                expectedAuthorityEpoch = 8L,
            ),
            ShcareExternalDeepLinkContract.bind(
                rawUri = "https://shcare.web.app/app/settings",
                currentAuthority = authority,
                currentFirebaseOwner = firebaseOwner(),
            ),
        )
    }

    @Test
    fun staleOwnerWorkspaceEpochAndReauthorizationFailClosed() {
        val authority = clinicalAuthority()
        val request = requireNotNull(
            ShcareExternalDeepLinkContract.bind(
                rawUri = "https://shcare.web.app/app/settings",
                currentAuthority = authority,
                currentFirebaseOwner = firebaseOwner(),
            ),
        )

        assertDenied(
            ExternalMobileDeepLinkDenialReason.OwnerMismatch,
            ShcareExternalDeepLinkContract.evaluate(
                request = request,
                authorityState = MobileSessionAuthorityState(
                    authority = authority,
                    epoch = authority.epoch,
                ),
                currentFirebaseOwner = firebaseOwner(firebaseUserId = "firebase-user-b"),
            ),
        )
        assertDenied(
            ExternalMobileDeepLinkDenialReason.WorkspaceMismatch,
            ShcareExternalDeepLinkContract.evaluate(
                request = request.copy(expectedWorkspaceId = "workspace-old"),
                authorityState = MobileSessionAuthorityState(
                    authority = authority,
                    epoch = authority.epoch,
                ),
                currentFirebaseOwner = firebaseOwner(),
            ),
        )
        assertDenied(
            ExternalMobileDeepLinkDenialReason.StaleAuthority,
            ShcareExternalDeepLinkContract.evaluate(
                request = request.copy(expectedAuthorityEpoch = authority.epoch - 1L),
                authorityState = MobileSessionAuthorityState(
                    authority = authority,
                    epoch = authority.epoch,
                ),
                currentFirebaseOwner = firebaseOwner(),
            ),
        )
        assertDenied(
            ExternalMobileDeepLinkDenialReason.AuthorityReauthorizing,
            ShcareExternalDeepLinkContract.evaluate(
                request = request,
                authorityState = MobileSessionAuthorityState(
                    authority = authority,
                    epoch = authority.epoch,
                    reauthorizing = true,
                ),
                currentFirebaseOwner = firebaseOwner(),
            ),
        )
    }

    @Test
    fun sameFirebaseIdentityWithANewerOwnerEpochCannotConsumeAStaleLink() {
        val authority = clinicalAuthority()
        val request = requireNotNull(
            ShcareExternalDeepLinkContract.bind(
                rawUri = "https://shcare.web.app/app/settings",
                currentAuthority = authority,
                currentFirebaseOwner = firebaseOwner(sessionEpoch = 11L),
            ),
        )

        assertDenied(
            ExternalMobileDeepLinkDenialReason.OwnerMismatch,
            ShcareExternalDeepLinkContract.evaluate(
                request = request,
                authorityState = MobileSessionAuthorityState(
                    authority = authority,
                    epoch = authority.epoch,
                ),
                currentFirebaseOwner = firebaseOwner(sessionEpoch = 12L),
            ),
        )
    }

    @Test
    fun roleExperienceAndCapabilityMappingsFailClosed() {
        val incoherentAuthority = clinicalAuthority(
            role = "patient",
            capabilities = setOf("workspace.patients.view"),
        )
        assertDenied(
            ExternalMobileDeepLinkDenialReason.RoleExperienceMismatch,
            evaluate(
                rawUri = "https://shcare.web.app/app/patients",
                authority = incoherentAuthority,
            ),
        )

        assertDenied(
            ExternalMobileDeepLinkDenialReason.CapabilityMissing,
            evaluate(
                rawUri = "https://shcare.web.app/app/patients",
                authority = clinicalAuthority(capabilities = setOf("workspace.dashboard.view")),
            ),
        )

        assertDenied(
            ExternalMobileDeepLinkDenialReason.ExperienceMismatch,
            evaluate(
                rawUri = "https://shcare.web.app/app/patients",
                authority = patientAuthority(capabilities = setOf("workspace.patients.view")),
            ),
        )
    }

    @Test
    fun malformedUntrustedAndUnregisteredLinksNeverBecomeNavigationCommands() {
        val authority = clinicalAuthority()
        listOf(
            "https://evil.example/app/settings",
            "https://user@shcare.web.app/app/settings",
            "https://shcare.web.app:444/app/settings",
            "https://shcare.web.app/app/settings?next=platform-admin",
            "https://shcare.web.app/app/settings#fragment",
            "https://shcare.web.app/app/record-detail/record-42",
            "shcare://other/settings",
            "javascript:alert(1)",
        ).forEach { rawUri ->
            val decision = evaluate(rawUri, authority)
            assertTrue(rawUri, decision is ExternalMobileDeepLinkDecision.Denied)
        }
    }

    private fun evaluate(
        rawUri: String,
        authority: MobileSessionAuthority,
    ): ExternalMobileDeepLinkDecision {
        val request = requireNotNull(
            ShcareExternalDeepLinkContract.bind(
                rawUri = rawUri,
                currentAuthority = authority,
                currentFirebaseOwner = firebaseOwner(
                    firebaseUserId = authority.firebaseUserId,
                ),
            ),
        )
        return ShcareExternalDeepLinkContract.evaluate(
            request = request,
            authorityState = MobileSessionAuthorityState(
                authority = authority,
                epoch = authority.epoch,
            ),
            currentFirebaseOwner = firebaseOwner(
                firebaseUserId = authority.firebaseUserId,
            ),
        )
    }

    private fun assertDenied(
        expectedReason: ExternalMobileDeepLinkDenialReason,
        decision: ExternalMobileDeepLinkDecision,
    ) {
        assertEquals(
            expectedReason,
            (decision as ExternalMobileDeepLinkDecision.Denied).reason,
        )
    }

    private fun clinicalAuthority(
        role: String = "doctor",
        capabilities: Set<String> = setOf("workspace.dashboard.view"),
    ) = MobileSessionAuthority(
        userId = "doctor-1",
        firebaseUserId = "firebase-user-a",
        workspaceId = "workspace-1",
        role = role,
        capabilities = capabilities,
        epoch = 8L,
        experience = MobileExperience.Clinical,
    )

    private fun patientAuthority(
        capabilities: Set<String>,
    ) = MobileSessionAuthority(
        userId = "patient-1",
        firebaseUserId = "firebase-patient-1",
        workspaceId = "workspace-1",
        role = "patient",
        capabilities = capabilities,
        epoch = 4L,
        experience = MobileExperience.Patient,
    )

    private fun firebaseOwner(
        firebaseUserId: String = "firebase-user-a",
        sessionEpoch: Long = 11L,
    ) = FirebaseOwnerBinding(
        firebaseUserId = firebaseUserId,
        email = "owner@shcare.test",
        sessionEpoch = sessionEpoch,
    )
}
