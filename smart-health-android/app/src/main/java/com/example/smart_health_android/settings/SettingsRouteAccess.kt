package com.example.smart_health_android.settings

import com.example.smart_health_android.navigation.MobileExperience
import com.example.smart_health_android.navigation.MobileRouteAccessContext
import com.example.smart_health_android.navigation.MobileRouteAccessDecision
import com.example.smart_health_android.navigation.ShcareMobileRoute
import com.example.smart_health_android.navigation.ShcareMobileRouteContract
import java.util.Collections

@ConsistentCopyVisibility
data class SettingsAuthoritySnapshot private constructor(
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
        ): SettingsAuthoritySnapshot {
            val normalizedUserId = userId.trim()
            val normalizedWorkspaceId = workspaceId.trim()
            val normalizedRole = role.trim().lowercase()
            require(normalizedUserId.isNotBlank()) {
                "Settings authority requires a backend user id."
            }
            require(normalizedWorkspaceId.isNotBlank()) {
                "Settings authority requires an active workspace id."
            }
            require(normalizedRole.isNotBlank()) {
                "Settings authority requires an active membership role."
            }
            require(authorityEpoch >= 0L) {
                "Settings authority epoch cannot be negative."
            }
            return SettingsAuthoritySnapshot(
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

data class SettingsFeatureAccess(
    val canManageFamilyProfiles: Boolean = false,
    val canManageStethoscope: Boolean = false,
    val canViewAiCalibration: Boolean = false,
    val canViewDataStorage: Boolean = false,
) {
    val anyAvailable: Boolean
        get() = canManageFamilyProfiles ||
            canManageStethoscope ||
            canViewAiCalibration ||
            canViewDataStorage
}

data class SettingsRouteBinding(
    val authority: SettingsAuthoritySnapshot?,
    val features: SettingsFeatureAccess = SettingsFeatureAccess(),
)

fun bindSettingsRouteAccess(
    context: MobileRouteAccessContext?,
    expectedAuthorityEpoch: Long,
): SettingsRouteBinding {
    if (
        context == null ||
        context.workspaceId.isBlank() ||
        context.role.isBlank() ||
        ShcareMobileRouteContract.evaluate(
            contract = ShcareMobileRoute.Settings,
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ) !is MobileRouteAccessDecision.Allowed
    ) {
        return SettingsRouteBinding(authority = null)
    }

    fun canOpen(route: ShcareMobileRoute): Boolean =
        ShcareMobileRouteContract.evaluate(
            contract = route,
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ) is MobileRouteAccessDecision.Allowed

    return SettingsRouteBinding(
        authority = SettingsAuthoritySnapshot.create(
            userId = context.userId,
            workspaceId = context.workspaceId,
            role = context.role,
            capabilities = context.capabilities,
            experience = context.experience,
            authorityEpoch = context.authorityEpoch,
        ),
        features = SettingsFeatureAccess(
            canManageFamilyProfiles = canOpen(ShcareMobileRoute.FamilyProfiles),
            canManageStethoscope = canOpen(ShcareMobileRoute.StethoscopeSettings),
            canViewAiCalibration = canOpen(ShcareMobileRoute.AiCalibration),
            canViewDataStorage = canOpen(ShcareMobileRoute.DataStorage),
        ),
    )
}
