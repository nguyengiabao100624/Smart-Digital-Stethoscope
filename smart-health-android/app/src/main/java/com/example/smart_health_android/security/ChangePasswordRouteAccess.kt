package com.example.smart_health_android.security

import com.example.smart_health_android.navigation.MobileRouteAccessContext
import com.example.smart_health_android.navigation.MobileRouteAccessDecision
import com.example.smart_health_android.navigation.ShcareMobileRoute
import com.example.smart_health_android.navigation.ShcareMobileRouteContract
import java.util.Collections

@ConsistentCopyVisibility
data class ChangePasswordAuthoritySnapshot private constructor(
    val userId: String,
    val firebaseUserId: String,
    val workspaceId: String,
    val role: String,
    val capabilities: Set<String>,
    val authorityEpoch: Long,
) {
    companion object {
        fun create(
            userId: String,
            firebaseUserId: String,
            workspaceId: String,
            role: String,
            capabilities: Set<String>,
            authorityEpoch: Long,
        ): ChangePasswordAuthoritySnapshot {
            val normalizedCapabilities = capabilities
                .asSequence()
                .map(String::trim)
                .filter(String::isNotBlank)
                .toSortedSet()
            return ChangePasswordAuthoritySnapshot(
                userId = userId.trim(),
                firebaseUserId = firebaseUserId.trim(),
                workspaceId = workspaceId.trim(),
                role = role.trim().lowercase(),
                capabilities = Collections.unmodifiableSet(normalizedCapabilities),
                authorityEpoch = authorityEpoch,
            )
        }
    }
}

data class ChangePasswordRouteBinding(
    val authority: ChangePasswordAuthoritySnapshot?,
)

fun bindChangePasswordRouteAccess(
    context: MobileRouteAccessContext?,
    firebaseUserId: String,
    expectedAuthorityEpoch: Long,
): ChangePasswordRouteBinding {
    if (
        context == null ||
        context.userId.isBlank() ||
        firebaseUserId.isBlank() ||
        context.workspaceId.isBlank() ||
        context.role.isBlank() ||
        ShcareMobileRouteContract.evaluate(
            contract = ShcareMobileRoute.ChangePassword,
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ) !is MobileRouteAccessDecision.Allowed
    ) {
        return ChangePasswordRouteBinding(authority = null)
    }

    return ChangePasswordRouteBinding(
        authority = ChangePasswordAuthoritySnapshot.create(
            userId = context.userId,
            firebaseUserId = firebaseUserId,
            workspaceId = context.workspaceId,
            role = context.role,
            capabilities = context.capabilities,
            authorityEpoch = context.authorityEpoch,
        ),
    )
}
