package com.example.smart_health_android.navigation

import com.example.smart_health_android.data.ActiveProfileResult
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.canonicalWorkspaceId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Collections

enum class MobileExperience {
    Patient,
    Clinical,
}

data class MobileSessionAuthority(
    val userId: String,
    val firebaseUserId: String,
    val workspaceId: String,
    val role: String,
    val capabilities: Set<String>,
    val epoch: Long,
    val experience: MobileExperience,
    val activePatientId: String = "",
)

data class MobileSessionAuthorityState(
    val authority: MobileSessionAuthority? = null,
    val epoch: Long = 0L,
    val reauthorizing: Boolean = false,
    val verifiedAtElapsedRealtimeMillis: Long = 0L,
)

enum class MobileAuthorityRejection {
    MissingUser,
    MissingWorkspace,
    MissingLocalIdentity,
    MissingIdentityBinding,
    IdentityMismatch,
    AccountInactive,
    MembershipInactive,
    UnsupportedRole,
    NoActiveAuthority,
    AccountMismatch,
    WorkspaceMismatch,
    ActivePatientMismatch,
    PatientWorkspaceMismatch,
    AuthorityChanged,
}

sealed interface MobileAuthorityUpdate {
    data class Accepted(
        val authority: MobileSessionAuthority,
    ) : MobileAuthorityUpdate

    data class Rejected(
        val reason: MobileAuthorityRejection,
    ) : MobileAuthorityUpdate
}

/**
 * Holds only the minimum backend-confirmed identity and authorization context needed for
 * navigation. It deliberately has no persistence so account/workspace authority cannot survive
 * process-level sign-out or be restored from a stale local profile.
 */
class MobileSessionAuthorityStore {
    private val mutableState = MutableStateFlow(MobileSessionAuthorityState())

    val state: StateFlow<MobileSessionAuthorityState> = mutableState.asStateFlow()

    @Synchronized
    fun establish(
        user: AuthUser,
        firebaseUserId: String,
        verifiedAtElapsedRealtimeMillis: Long = 0L,
    ): MobileAuthorityUpdate {
        val normalized = normalize(user, firebaseUserId)
        if (normalized is NormalizedAuthority.Rejected) {
            return MobileAuthorityUpdate.Rejected(normalized.reason)
        }

        normalized as NormalizedAuthority.Accepted
        val nextEpoch = mutableState.value.epoch + 1L
        val authority = normalized.authority.copy(epoch = nextEpoch)
        mutableState.value = MobileSessionAuthorityState(
            authority = authority,
            epoch = nextEpoch,
            verifiedAtElapsedRealtimeMillis = verifiedAtElapsedRealtimeMillis,
        )
        return MobileAuthorityUpdate.Accepted(authority)
    }

    @Synchronized
    fun confirmWorkspaceSwitch(
        user: AuthUser,
        expectedWorkspaceId: String,
        expectedAuthority: MobileSessionAuthority,
        firebaseUserId: String,
        verifiedAtElapsedRealtimeMillis: Long = 0L,
    ): MobileAuthorityUpdate {
        val current = mutableState.value
        val active = current.authority
            ?: return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.NoActiveAuthority)
        if (current.reauthorizing || active != expectedAuthority) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AuthorityChanged)
        }

        val normalizedExpectedWorkspaceId = expectedWorkspaceId.trim()
        if (normalizedExpectedWorkspaceId.isEmpty()) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.WorkspaceMismatch)
        }

        val normalizedUserId = user.id.trim()
        if (normalizedUserId != active.userId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountMismatch)
        }

        val normalized = normalize(user, firebaseUserId)
        if (normalized is NormalizedAuthority.Rejected) {
            return MobileAuthorityUpdate.Rejected(normalized.reason)
        }

        normalized as NormalizedAuthority.Accepted
        if (normalized.authority.workspaceId != normalizedExpectedWorkspaceId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.WorkspaceMismatch)
        }

        val nextEpoch = current.epoch + 1L
        val authority = normalized.authority.copy(epoch = nextEpoch)
        mutableState.value = MobileSessionAuthorityState(
            authority = authority,
            epoch = nextEpoch,
            verifiedAtElapsedRealtimeMillis = verifiedAtElapsedRealtimeMillis,
        )
        return MobileAuthorityUpdate.Accepted(authority)
    }

    @Synchronized
    fun confirmActiveProfileSwitch(
        result: ActiveProfileResult,
        expectedPatientId: String,
        expectedAuthority: MobileSessionAuthority,
        firebaseUserId: String,
        verifiedAtElapsedRealtimeMillis: Long = 0L,
    ): MobileAuthorityUpdate {
        val current = mutableState.value
        val active = current.authority
            ?: return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.NoActiveAuthority)
        if (current.reauthorizing || active != expectedAuthority) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AuthorityChanged)
        }
        if (active.experience != MobileExperience.Patient) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.UnsupportedRole)
        }

        val normalizedExpectedPatientId = expectedPatientId.trim()
        if (
            normalizedExpectedPatientId.isBlank() ||
            result.user.activePatientId.trim() != normalizedExpectedPatientId ||
            result.activePatient.id.trim() != normalizedExpectedPatientId
        ) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.ActivePatientMismatch)
        }
        if (result.user.id.trim() != active.userId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountMismatch)
        }

        val normalized = normalize(result.user, firebaseUserId)
        if (normalized is NormalizedAuthority.Rejected) {
            return MobileAuthorityUpdate.Rejected(normalized.reason)
        }
        normalized as NormalizedAuthority.Accepted
        if (normalized.authority.userId != active.userId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountMismatch)
        }
        if (normalized.authority.workspaceId != active.workspaceId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.WorkspaceMismatch)
        }
        if (normalized.authority.experience != MobileExperience.Patient) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.UnsupportedRole)
        }
        if (normalized.authority.activePatientId != normalizedExpectedPatientId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.ActivePatientMismatch)
        }
        if (result.activePatient.organizationId.trim() != active.workspaceId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.PatientWorkspaceMismatch)
        }
        val patientPrincipalIds = setOf(
            result.activePatient.ownerUserId.trim(),
            result.activePatient.accountUserId.trim(),
            result.activePatient.guardianUserId.trim(),
        ).filter(String::isNotBlank)
        if (active.userId !in patientPrincipalIds) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.ActivePatientMismatch)
        }

        val nextEpoch = current.epoch + 1L
        val authority = normalized.authority.copy(epoch = nextEpoch)
        mutableState.value = MobileSessionAuthorityState(
            authority = authority,
            epoch = nextEpoch,
            reauthorizing = false,
            verifiedAtElapsedRealtimeMillis = verifiedAtElapsedRealtimeMillis,
        )
        return MobileAuthorityUpdate.Accepted(authority)
    }

    @Synchronized
    fun beginReauthorization(): MobileSessionAuthority? {
        val current = mutableState.value
        val authority = current.authority ?: return null
        if (current.reauthorizing) return null
        mutableState.value = current.copy(reauthorizing = true)
        return authority
    }

    @Synchronized
    fun completeReauthorization(
        user: AuthUser,
        expectedAuthority: MobileSessionAuthority,
        firebaseUserId: String,
        verifiedAtElapsedRealtimeMillis: Long = 0L,
    ): MobileAuthorityUpdate {
        val current = mutableState.value
        val active = current.authority
            ?: return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.NoActiveAuthority)
        if (!current.reauthorizing || active != expectedAuthority) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AuthorityChanged)
        }

        val normalized = normalize(user, firebaseUserId)
        if (normalized is NormalizedAuthority.Rejected) {
            return MobileAuthorityUpdate.Rejected(normalized.reason)
        }
        normalized as NormalizedAuthority.Accepted
        if (normalized.authority.userId != active.userId) {
            return MobileAuthorityUpdate.Rejected(MobileAuthorityRejection.AccountMismatch)
        }

        val authorityChanged =
            normalized.authority.workspaceId != active.workspaceId ||
                normalized.authority.role != active.role ||
                normalized.authority.capabilities != active.capabilities ||
                normalized.authority.experience != active.experience ||
                normalized.authority.activePatientId != active.activePatientId
        val nextEpoch = if (authorityChanged) current.epoch + 1L else current.epoch
        val authority = normalized.authority.copy(epoch = nextEpoch)
        mutableState.value = MobileSessionAuthorityState(
            authority = authority,
            epoch = nextEpoch,
            reauthorizing = false,
            verifiedAtElapsedRealtimeMillis = verifiedAtElapsedRealtimeMillis,
        )
        return MobileAuthorityUpdate.Accepted(authority)
    }

    @Synchronized
    fun needsReauthorization(
        elapsedRealtimeMillis: Long,
        maxAgeMillis: Long,
    ): Boolean {
        require(maxAgeMillis >= 0L)
        val current = mutableState.value
        if (current.authority == null || current.reauthorizing) return false
        val age = elapsedRealtimeMillis - current.verifiedAtElapsedRealtimeMillis
        return current.verifiedAtElapsedRealtimeMillis <= 0L || age < 0L || age >= maxAgeMillis
    }

    @Synchronized
    fun clear(): MobileSessionAuthorityState {
        val cleared = MobileSessionAuthorityState(
            authority = null,
            epoch = mutableState.value.epoch + 1L,
            reauthorizing = false,
            verifiedAtElapsedRealtimeMillis = 0L,
        )
        mutableState.value = cleared
        return cleared
    }

    @Synchronized
    fun clearIfCurrent(expectedAuthority: MobileSessionAuthority): Boolean {
        val current = mutableState.value
        if (current.authority != expectedAuthority || !current.reauthorizing) {
            return false
        }
        clearLocked(current)
        return true
    }

    @Synchronized
    fun invalidateIfCurrent(expectedAuthority: MobileSessionAuthority): Boolean {
        val current = mutableState.value
        if (current.authority != expectedAuthority) {
            return false
        }
        clearLocked(current)
        return true
    }

    private fun clearLocked(current: MobileSessionAuthorityState) {
        mutableState.value = MobileSessionAuthorityState(
            authority = null,
            epoch = current.epoch + 1L,
            reauthorizing = false,
            verifiedAtElapsedRealtimeMillis = 0L,
        )
    }

    private fun normalize(
        user: AuthUser,
        firebaseUserId: String,
    ): NormalizedAuthority {
        val userId = user.id.trim()
        if (userId.isEmpty()) {
            return NormalizedAuthority.Rejected(MobileAuthorityRejection.MissingUser)
        }
        if (
            !user.accountStatus.trim().equals("active", ignoreCase = true) ||
            !user.deletedAt.isNullOrBlank()
        ) {
            return NormalizedAuthority.Rejected(MobileAuthorityRejection.AccountInactive)
        }
        val localFirebaseUid = firebaseUserId.trim()
        if (localFirebaseUid.isEmpty()) {
            return NormalizedAuthority.Rejected(MobileAuthorityRejection.MissingLocalIdentity)
        }
        val backendFirebaseUid = user.firebaseUid.trim()
        if (backendFirebaseUid.isEmpty()) {
            return NormalizedAuthority.Rejected(MobileAuthorityRejection.MissingIdentityBinding)
        }
        if (localFirebaseUid != backendFirebaseUid) {
            return NormalizedAuthority.Rejected(MobileAuthorityRejection.IdentityMismatch)
        }

        val workspaceId = user.confirmedWorkspaceId()
        if (workspaceId.isEmpty()) {
            return NormalizedAuthority.Rejected(MobileAuthorityRejection.MissingWorkspace)
        }

        val role = user.effectiveRole(workspaceId)
        val experience = role.toMobileExperienceOrNull()
            ?: return NormalizedAuthority.Rejected(MobileAuthorityRejection.UnsupportedRole)
        if (!user.hasOperationalMembership(workspaceId, role)) {
            return NormalizedAuthority.Rejected(MobileAuthorityRejection.MembershipInactive)
        }

        return NormalizedAuthority.Accepted(
            MobileSessionAuthority(
                userId = userId,
                firebaseUserId = localFirebaseUid,
                workspaceId = workspaceId,
                role = role,
                capabilities = Collections.unmodifiableSet(
                    user.capabilities
                        .asSequence()
                        .map(String::trim)
                        .filter(String::isNotEmpty)
                        .toSortedSet(),
                ),
                epoch = 0L,
                experience = experience,
                activePatientId = if (experience == MobileExperience.Patient) {
                    user.activePatientId.trim()
                } else {
                    ""
                },
            ),
        )
    }

    private sealed interface NormalizedAuthority {
        data class Accepted(
            val authority: MobileSessionAuthority,
        ) : NormalizedAuthority

        data class Rejected(
            val reason: MobileAuthorityRejection,
        ) : NormalizedAuthority
    }
}

object ShcareMobileSessionAuthority {
    val store = MobileSessionAuthorityStore()
}

private fun AuthUser.confirmedWorkspaceId(): String {
    return canonicalWorkspaceId()
}

private fun AuthUser.effectiveRole(workspaceId: String): String {
    val membershipRole = currentMembership
        ?.takeIf { membership ->
            membership.workspaceId.ifBlank { membership.organizationId }.trim() == workspaceId
        }
        ?.role
    val workspaceRole = currentWorkspace
        ?.takeIf { workspace -> workspace.id.trim() == workspaceId }
        ?.role
    val listedMembershipRole = memberships
        .firstOrNull { membership ->
            membership.workspaceId.ifBlank { membership.organizationId }.trim() == workspaceId
        }
        ?.role

    return sequenceOf(membershipRole, workspaceRole, listedMembershipRole, role)
        .filterNotNull()
        .map(String::trim)
        .firstOrNull(String::isNotEmpty)
        ?.lowercase()
        .orEmpty()
}

private fun AuthUser.hasOperationalMembership(
    workspaceId: String,
    effectiveRole: String,
): Boolean {
    if (effectiveRole == "admin" && workspaceId == "platform") return true

    return sequenceOf(currentMembership)
        .plus(memberships.asSequence())
        .filterNotNull()
        .any { membership ->
            membership.workspaceId.ifBlank { membership.organizationId }.trim() == workspaceId &&
                membership.operational &&
                membership.status.trim().equals("active", ignoreCase = true)
        }
}

internal fun String.toMobileExperienceOrNull(): MobileExperience? {
    return when (this) {
        "patient" -> MobileExperience.Patient
        "doctor",
        "nurse",
        "technician",
        "admin",
        "workspace_admin",
        "workspace_owner",
        -> MobileExperience.Clinical
        else -> null
    }
}
