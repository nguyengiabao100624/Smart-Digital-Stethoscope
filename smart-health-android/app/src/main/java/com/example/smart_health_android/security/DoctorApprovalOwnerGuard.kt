package com.example.smart_health_android.security

import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.normalizePendingRegistrationEmail

internal data class DoctorApprovalOwner(
    val firebaseOwner: FirebaseOwnerBinding,
    val backendEpoch: Long,
    val backendAuthority: AuthSessionAuthority?,
)

internal interface DoctorApprovalOwnerEnvironment {
    fun currentFirebaseOwner(): FirebaseOwnerBinding?
    fun currentBackendEpoch(): Long
    fun currentBackendAuthority(): AuthSessionAuthority?
    fun clearBackendAuthorityIfCurrent(expectedAuthority: AuthSessionAuthority): Boolean
}

internal class DoctorApprovalOwnerGuard(
    private val environment: DoctorApprovalOwnerEnvironment,
) {
    fun capture(): DoctorApprovalOwner {
        val firebaseOwner = environment.currentFirebaseOwner()
            ?: error("Phiên tài khoản không còn sẵn sàng. Vui lòng đăng nhập lại.")
        val backendEpoch = environment.currentBackendEpoch()
        val backendAuthority = environment.currentBackendAuthority()
        val owner = DoctorApprovalOwner(firebaseOwner, backendEpoch, backendAuthority)
        if (
            environment.currentFirebaseOwner() != firebaseOwner ||
            environment.currentBackendEpoch() != backendEpoch ||
            (backendAuthority != null && backendAuthority.epoch != backendEpoch)
        ) {
            backendAuthority?.let(environment::clearBackendAuthorityIfCurrent)
            error("Phiên tài khoản đang thay đổi. Vui lòng thử lại.")
        }
        return owner
    }

    fun requireCurrent(expected: DoctorApprovalOwner) {
        if (
            environment.currentFirebaseOwner() != expected.firebaseOwner ||
            environment.currentBackendEpoch() != expected.backendEpoch
        ) {
            expected.backendAuthority?.let(environment::clearBackendAuthorityIfCurrent)
            error("Phiên tài khoản đã thay đổi. Vui lòng đăng nhập lại.")
        }
    }

    fun requireReceiptOwner(
        user: AuthUser,
        expected: DoctorApprovalOwner,
        expectedBackendUserId: String? = null,
    ) {
        requireCurrent(expected)
        if (
            user.firebaseUid != expected.firebaseOwner.firebaseUserId ||
            normalizePendingRegistrationEmail(user.email) != expected.firebaseOwner.email ||
            !user.accountStatus.equals("active", ignoreCase = true) ||
            !user.deletedAt.isNullOrBlank() ||
            !user.verifiedEmail ||
            !user.hasActiveCoherentCurrentWorkspaceAuthority() ||
            (!expectedBackendUserId.isNullOrBlank() && user.id != expectedBackendUserId)
        ) {
            expected.backendAuthority?.let(environment::clearBackendAuthorityIfCurrent)
            error("Hệ thống trả về hồ sơ không thuộc phiên tài khoản hiện tại.")
        }
    }
}

internal object ProductionDoctorApprovalOwnerEnvironment : DoctorApprovalOwnerEnvironment {
    override fun currentFirebaseOwner(): FirebaseOwnerBinding? =
        FirebaseAuthService.currentOwnerBindingOrNull()

    override fun currentBackendEpoch(): Long =
        SmartHealthRepository.api.currentAuthSessionEpoch()

    override fun currentBackendAuthority(): AuthSessionAuthority? {
        val api = SmartHealthRepository.api
        return api.currentAuthToken()?.let(api::currentAuthSessionAuthorityFor)
    }

    override fun clearBackendAuthorityIfCurrent(
        expectedAuthority: AuthSessionAuthority,
    ): Boolean = SmartHealthRepository.api.clearAuthTokenIfCurrent(expectedAuthority)
}
