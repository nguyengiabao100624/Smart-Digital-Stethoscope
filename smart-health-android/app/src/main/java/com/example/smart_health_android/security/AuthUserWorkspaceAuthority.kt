package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.canonicalWorkspaceId

internal fun AuthUser.hasActiveCoherentWorkspaceAuthority(
    expectedWorkspaceId: String? = null,
): Boolean = hasActiveCoherentCurrentWorkspaceAuthority(
    expectedWorkspaceId = expectedWorkspaceId,
    requireOrganizationIdMatch = true,
)

internal fun AuthUser.hasActiveCoherentCurrentWorkspaceAuthority(
    expectedWorkspaceId: String? = null,
): Boolean = hasActiveCoherentCurrentWorkspaceAuthority(
    expectedWorkspaceId = expectedWorkspaceId,
    requireOrganizationIdMatch = false,
)

internal fun AuthUser.hasActiveCoherentDoctorRequestAuthority(
    expectedTargetWorkspaceId: String? = null,
    expectedCurrentWorkspaceId: String? = null,
): Boolean {
    val normalizedStatus = roleRequestStatus.trim().lowercase()
    val currentWorkspaceId = canonicalWorkspaceId()
    val targetWorkspaceId = organizationId.trim()
    val expectedTarget = expectedTargetWorkspaceId?.trim().orEmpty()
    val expectedCurrent = expectedCurrentWorkspaceId?.trim().orEmpty()
    val currentMembershipRole = currentMembership?.role?.trim()?.lowercase().orEmpty()

    if (
        requestedRole.trim().lowercase() != "doctor" ||
        normalizedStatus !in DOCTOR_REQUEST_AUTHORITY_STATUSES ||
        targetWorkspaceId.isBlank() ||
        (expectedTarget.isNotBlank() && targetWorkspaceId != expectedTarget) ||
        !hasActiveCoherentCurrentWorkspaceAuthority(
            expectedWorkspaceId = expectedCurrent.takeIf {
                it.isNotBlank() && normalizedStatus != "approved"
            },
        )
    ) {
        return false
    }

    return if (normalizedStatus == "approved") {
        role.trim().lowercase() == "doctor" &&
            currentMembershipRole == "doctor" &&
            currentWorkspaceId == targetWorkspaceId
    } else {
        role.trim().lowercase() == "patient" &&
            currentMembershipRole == "patient" &&
            memberships.none { membership ->
                membership.workspaceId
                    .ifBlank { membership.organizationId }
                    .trim() == targetWorkspaceId &&
                    membership.status.equals("active", ignoreCase = true) &&
                    membership.operational &&
                    membership.suspendedAt.isBlank() &&
                    membership.role.trim().lowercase() == "doctor"
            }
    }
}

private fun AuthUser.hasActiveCoherentCurrentWorkspaceAuthority(
    expectedWorkspaceId: String?,
    requireOrganizationIdMatch: Boolean,
): Boolean {
    val canonicalWorkspaceId = canonicalWorkspaceId()
    val organizationId = organizationId.trim()
    val currentWorkspaceId = currentWorkspaceId.trim()
    val expected = expectedWorkspaceId?.trim().orEmpty()
    val membership = currentMembership ?: return false
    val membershipWorkspaceId = membership.workspaceId
        .ifBlank { membership.organizationId }
        .trim()
    val projectedWorkspaceId = currentWorkspace?.id?.trim().orEmpty()

    if (
        canonicalWorkspaceId.isBlank() ||
        (requireOrganizationIdMatch && organizationId != canonicalWorkspaceId) ||
        currentWorkspaceId != canonicalWorkspaceId ||
        (expected.isNotBlank() && expected != canonicalWorkspaceId) ||
        membership.id.isBlank() ||
        membershipWorkspaceId != canonicalWorkspaceId ||
        (
            membership.organizationId.isNotBlank() &&
                membership.organizationId.trim() != canonicalWorkspaceId
            ) ||
        !membership.status.equals("active", ignoreCase = true) ||
        !membership.operational ||
        membership.suspendedAt.isNotBlank() ||
        membership.role.isBlank() ||
        (
            currentWorkspace != null &&
                (projectedWorkspaceId.isBlank() || projectedWorkspaceId != canonicalWorkspaceId)
            )
    ) {
        return false
    }

    if (memberships.isNotEmpty()) {
        val currentMembershipIsProjected = memberships.any { candidate ->
            candidate.id == membership.id &&
                candidate.workspaceId.ifBlank { candidate.organizationId }.trim() ==
                canonicalWorkspaceId &&
                candidate.status.equals("active", ignoreCase = true) &&
                candidate.operational &&
                candidate.suspendedAt.isBlank()
        }
        if (!currentMembershipIsProjected) return false
    }

    return true
}

internal val DOCTOR_REQUEST_AUTHORITY_STATUSES =
    setOf("pending", "needs_info", "approved", "rejected")
