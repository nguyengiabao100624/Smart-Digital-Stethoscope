package com.example.smart_health_android.patientdashboard

import com.example.smart_health_android.navigation.MobileExperience
import com.example.smart_health_android.navigation.MobileRouteAccessContext
import com.example.smart_health_android.navigation.MobileRouteAccessDecision
import com.example.smart_health_android.navigation.MobileRouteCapabilities
import com.example.smart_health_android.navigation.ShcareMobileRoute
import com.example.smart_health_android.navigation.ShcareMobileRouteContract
import java.util.Collections

@ConsistentCopyVisibility
data class PatientDashboardAuthoritySnapshot private constructor(
    val userId: String,
    val workspaceId: String,
    val role: String,
    val capabilities: Set<String>,
    val experience: MobileExperience,
    val authorityEpoch: Long,
) {
    companion object {
        fun create(
            userId: String,
            workspaceId: String,
            role: String,
            capabilities: Set<String>,
            experience: MobileExperience,
            authorityEpoch: Long,
        ): PatientDashboardAuthoritySnapshot {
            val normalizedUserId = userId.trim()
            val normalizedWorkspaceId = workspaceId.trim()
            val normalizedRole = role.trim().lowercase()
            require(normalizedUserId.isNotBlank()) {
                "Patient dashboard authority requires a backend user id."
            }
            require(normalizedWorkspaceId.isNotBlank()) {
                "Patient dashboard authority requires an active workspace id."
            }
            require(normalizedRole == PATIENT_ROLE) {
                "Patient dashboard authority requires the active patient membership."
            }
            require(experience == MobileExperience.Patient) {
                "Patient dashboard authority requires the patient experience."
            }
            require(authorityEpoch >= 0L) {
                "Patient dashboard authority epoch cannot be negative."
            }
            return PatientDashboardAuthoritySnapshot(
                userId = normalizedUserId,
                workspaceId = normalizedWorkspaceId,
                role = normalizedRole,
                capabilities = Collections.unmodifiableSet(
                    capabilities
                        .asSequence()
                        .map(String::trim)
                        .filter(String::isNotBlank)
                        .toSortedSet(),
                ),
                experience = experience,
                authorityEpoch = authorityEpoch,
            )
        }
    }
}

data class PatientDashboardFeatureAccess(
    val canStartScan: Boolean = false,
    val canViewRecords: Boolean = false,
    val canManageDevice: Boolean = false,
    val canViewAppointments: Boolean = false,
    /** Route visibility is permission-bound; provider availability is shown truthfully in the assistant screen. */
    val canUseAssistant: Boolean = false,
)

data class PatientDashboardRouteBinding(
    val authority: PatientDashboardAuthoritySnapshot?,
    val features: PatientDashboardFeatureAccess = PatientDashboardFeatureAccess(),
)

fun bindPatientDashboardRouteAccess(
    context: MobileRouteAccessContext?,
    expectedAuthorityEpoch: Long,
): PatientDashboardRouteBinding {
    if (
        context == null ||
        context.userId.isBlank() ||
        context.workspaceId.isBlank() ||
        !context.role.trim().equals(PATIENT_ROLE, ignoreCase = true) ||
        context.experience != MobileExperience.Patient ||
        ShcareMobileRouteContract.evaluate(
            contract = ShcareMobileRoute.PatientDashboard,
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ) !is MobileRouteAccessDecision.Allowed
    ) {
        return PatientDashboardRouteBinding(authority = null)
    }

    fun canOpen(route: ShcareMobileRoute): Boolean =
        ShcareMobileRouteContract.evaluate(
            contract = route,
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ) is MobileRouteAccessDecision.Allowed

    return PatientDashboardRouteBinding(
        authority = PatientDashboardAuthoritySnapshot.create(
            userId = context.userId,
            workspaceId = context.workspaceId,
            role = context.role,
            capabilities = context.capabilities,
            experience = context.experience,
            authorityEpoch = context.authorityEpoch,
        ),
        features = PatientDashboardFeatureAccess(
            canStartScan = canOpen(ShcareMobileRoute.NewScan),
            canViewRecords = canOpen(ShcareMobileRoute.Records),
            canManageDevice = context.capabilities.any(MobileRouteCapabilities.DeviceManage::contains),
            canViewAppointments = canOpen(ShcareMobileRoute.Appointments),
            canUseAssistant = canOpen(ShcareMobileRoute.AiAssistant),
        ),
    )
}

private const val PATIENT_ROLE = "patient"
