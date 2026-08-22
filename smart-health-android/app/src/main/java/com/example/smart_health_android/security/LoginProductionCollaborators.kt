package com.example.smart_health_android.security

import android.content.Context
import com.example.smart_health_android.data.AuthResult
import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.FirebaseSignInReceipt
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.TwoFactorChallengeResult
import com.example.smart_health_android.navigation.ShcareMobileSessionAuthority
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal interface LoginFirebaseSession {
    suspend fun signIn(email: String, password: String): FirebaseSignInReceipt

    suspend fun reloadCurrentUser(expectedOwner: FirebaseOwnerBinding): Boolean

    fun isCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean

    fun signOutIfCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean
}

internal interface LoginBackendSession {
    fun currentAuthSessionEpoch(): Long

    fun currentAuthSessionAuthorityFor(token: String): AuthSessionAuthority?

    suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult

    suspend fun completeTwoFactorChallenge(
        challengeId: String,
        code: String,
        expectedAuthSessionEpoch: Long,
    ): TwoFactorChallengeResult

    suspend fun requestRole(
        registration: PendingRegistration,
        expectedAuthSessionEpoch: Long,
    ): AuthUser

    fun clearAuthTokenIfCurrent(expectedAuthority: AuthSessionAuthority): Boolean
}

internal interface LoginRegistrationCheckpoint {
    suspend fun loadForOwner(owner: FirebaseOwnerBinding): PendingRegistration?

    suspend fun saveForOwner(
        registration: PendingRegistration,
        owner: FirebaseOwnerBinding,
    )

    suspend fun clearForOwner(owner: FirebaseOwnerBinding): Boolean
}

internal fun interface LoginPushRegistration {
    suspend fun register(userId: String, workspaceId: String): Boolean
}

internal fun interface IntentionalLoginTeardown {
    fun prepareForNewLogin()
}

internal object ProductionLoginFirebaseSession : LoginFirebaseSession {
    override suspend fun signIn(email: String, password: String): FirebaseSignInReceipt =
        FirebaseAuthService.signIn(email, password)

    override suspend fun reloadCurrentUser(expectedOwner: FirebaseOwnerBinding): Boolean =
        FirebaseAuthService.reloadCurrentUser(expectedOwner)

    override fun isCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean =
        FirebaseAuthService.isCurrentOwner(expectedOwner)

    override fun signOutIfCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean =
        FirebaseAuthService.signOutIfCurrentOwner(expectedOwner)
}

internal object ProductionLoginBackendSession : LoginBackendSession {
    override fun currentAuthSessionEpoch(): Long =
        SmartHealthRepository.api.currentAuthSessionEpoch()

    override fun currentAuthSessionAuthorityFor(token: String): AuthSessionAuthority? =
        SmartHealthRepository.api.currentAuthSessionAuthorityFor(token)

    override suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult = SmartHealthRepository.api.authenticateFirebase(
        idToken = idToken,
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
    )

    override suspend fun completeTwoFactorChallenge(
        challengeId: String,
        code: String,
        expectedAuthSessionEpoch: Long,
    ): TwoFactorChallengeResult = SmartHealthRepository.api.completeTwoFactorChallenge(
        challengeId = challengeId,
        code = code,
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
    )

    override suspend fun requestRole(
        registration: PendingRegistration,
        expectedAuthSessionEpoch: Long,
    ): AuthUser = SmartHealthRepository.api.requestRole(
        requestedRole = "doctor",
        name = registration.name,
        phone = registration.phone,
        license = registration.license,
        hospital = registration.hospital,
        department = registration.department,
        organizationId = registration.organizationId,
        reason = registration.reason,
        accountType = registration.accountType,
        workspaceType = registration.workspaceTypeForLoginRoleRequest(),
        idempotencyKey = registration.roleRequestIdempotencyKey,
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
    )

    override fun clearAuthTokenIfCurrent(expectedAuthority: AuthSessionAuthority): Boolean =
        SmartHealthRepository.api.clearAuthTokenIfCurrent(expectedAuthority)
}

internal class ProductionLoginRegistrationCheckpoint(
    context: Context,
) : LoginRegistrationCheckpoint {
    private val applicationContext = context.applicationContext

    override suspend fun loadForOwner(owner: FirebaseOwnerBinding): PendingRegistration? =
        withContext(Dispatchers.IO) {
            PendingRegistrationStore.loadForFirebaseOwner(
                context = applicationContext,
                firebaseUserId = owner.firebaseUserId,
                firebaseEmail = owner.email,
            )
        }

    override suspend fun saveForOwner(
        registration: PendingRegistration,
        owner: FirebaseOwnerBinding,
    ) {
        withContext(Dispatchers.IO) {
            PendingRegistrationStore.saveForFirebaseOwner(
                context = applicationContext,
                registration = registration,
                firebaseUserId = owner.firebaseUserId,
                firebaseEmail = owner.email,
            )
        }
    }

    override suspend fun clearForOwner(owner: FirebaseOwnerBinding): Boolean =
        withContext(Dispatchers.IO) {
            PendingRegistrationStore.clearForFirebaseOwner(
                context = applicationContext,
                firebaseUserId = owner.firebaseUserId,
                firebaseEmail = owner.email,
            )
        }
}

internal object ProductionLoginPushRegistration : LoginPushRegistration {
    override suspend fun register(userId: String, workspaceId: String): Boolean =
        SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated(
            userId = userId,
            workspaceId = workspaceId,
        )
}

internal object ProductionIntentionalLoginTeardown : IntentionalLoginTeardown {
    override fun prepareForNewLogin() {
        ShcareMobileSessionAuthority.store.clear()
        SmartHealthSessionTerminator.terminateLocallyForAccountReplacement()
    }
}

internal fun PendingRegistration.workspaceTypeForLoginRoleRequest(): String =
    if (accountType == "solo_doctor") "solo_practice" else "clinic"
