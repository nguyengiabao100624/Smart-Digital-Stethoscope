package com.example.smart_health_android.startup

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.normalizePendingRegistrationEmail
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.data.twoFactorChallengeOrNull
import com.example.smart_health_android.navigation.ShcareMobileSessionAuthority
import com.example.smart_health_android.security.SmartHealthSessionTerminator
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val STALE_SPLASH_SESSION_MESSAGE =
    "Phiên Firebase đã thay đổi trong lúc khôi phục đăng nhập."

enum class SplashLoadState {
    Checking,
    Error,
}

data class SplashUiState(
    val loadState: SplashLoadState = SplashLoadState.Checking,
    val errorMessage: String = "",
)

sealed interface SplashUiAction {
    data object Retry : SplashUiAction
}

sealed interface SplashUiEffect {
    data object NavigateToLogin : SplashUiEffect
    data class Authenticated(
        val user: AuthUser,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : SplashUiEffect
    data class NavigateToDoctorApprovalPending(
        val firebaseOwner: FirebaseOwnerBinding,
    ) : SplashUiEffect
    data class NavigateToVerifyEmail(
        val accountType: String,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : SplashUiEffect
}

interface SplashBootstrapGateway {
    suspend fun checkHealth(): Boolean
    suspend fun existingSessionToken(): String?
    fun pinnedFirebaseOwner(): FirebaseOwnerBinding?
    fun sessionIsCurrent(): Boolean
    fun hasNoCurrentFirebaseOwner(): Boolean
    suspend fun reloadCurrentUser(): Boolean
    suspend fun pendingAccountType(): String
    suspend fun authenticateCurrentUser(): AuthUser
    suspend fun registerPushBestEffort(user: AuthUser)
    suspend fun clearSession(): Boolean
}

class DefaultSplashBootstrapGateway(
    context: Context,
) : SplashBootstrapGateway {
    private val applicationContext = context.applicationContext
    private val ownerPinLock = Any()
    private var ownerPinEstablished = false
    private var expectedFirebaseOwner: FirebaseOwnerBinding? = null

    override suspend fun checkHealth(): Boolean = SmartHealthRepository.api.getHealth().ok

    override fun pinnedFirebaseOwner(): FirebaseOwnerBinding? {
        val owner = FirebaseAuthService.currentOwnerBindingOrNull()
        synchronized(ownerPinLock) {
            expectedFirebaseOwner = owner
            ownerPinEstablished = true
        }
        return owner
    }

    override fun sessionIsCurrent(): Boolean {
        val (established, owner) = synchronized(ownerPinLock) {
            ownerPinEstablished to expectedFirebaseOwner
        }
        if (!established) return false
        return if (owner == null) {
            FirebaseAuthService.currentOwnerBindingOrNull() == null
        } else {
            FirebaseAuthService.isCurrentOwner(owner)
        }
    }

    override fun hasNoCurrentFirebaseOwner(): Boolean =
        FirebaseAuthService.currentOwnerBindingOrNull() == null

    override suspend fun existingSessionToken(): String? {
        val owner = pinnedOwnerOrNull()
        if (owner == null) {
            check(sessionIsCurrent()) { STALE_SPLASH_SESSION_MESSAGE }
            return null
        }
        requirePinnedOwner(owner)
        return FirebaseAuthService.getFreshIdToken(
            expectedOwner = owner,
            forceRefresh = false,
        ).also {
            requirePinnedOwner(owner)
        }
    }

    override suspend fun reloadCurrentUser(): Boolean {
        val owner = requirePinnedOwner()
        return FirebaseAuthService.reloadCurrentUser(owner).also {
            requirePinnedOwner(owner)
        }
    }

    override suspend fun pendingAccountType(): String = withContext(Dispatchers.IO) {
        val owner = requirePinnedOwner()
        val accountType = PendingRegistrationStore.loadForFirebaseOwner(
            context = applicationContext,
            firebaseUserId = owner.firebaseUserId,
            firebaseEmail = owner.email,
        )?.accountType.orEmpty()
        requirePinnedOwner(owner)
        accountType
    }

    override suspend fun authenticateCurrentUser(): AuthUser {
        val owner = requirePinnedOwner()
        val expectedFirebaseUserId = owner.firebaseUserId
        val expectedEmail = owner.email
        val expectedAuthSessionEpoch =
            SmartHealthRepository.api.currentAuthSessionEpoch()
        if (expectedFirebaseUserId.isBlank() || expectedEmail.isBlank()) {
            error("Phiên Firebase không còn tài khoản hợp lệ.")
        }
        val idToken = FirebaseAuthService.getFreshIdToken(
            expectedOwner = owner,
            forceRefresh = true,
        )
        requirePinnedOwner(owner)
        val result = SmartHealthRepository.api.authenticateFirebase(
            idToken = idToken,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        try {
            requirePinnedOwner(owner)
            if (
                result.user.firebaseUid != expectedFirebaseUserId ||
                normalizePendingRegistrationEmail(result.user.email) != expectedEmail
            ) {
                error("Máy chủ trả về phiên không thuộc tài khoản Firebase hiện tại.")
            }
            return result.user
        } catch (error: Throwable) {
            result.authority?.let(SmartHealthRepository.api::clearAuthTokenIfCurrent)
            throw error
        }
    }

    private fun pinnedOwnerOrNull(): FirebaseOwnerBinding? = synchronized(ownerPinLock) {
        check(ownerPinEstablished)
        expectedFirebaseOwner
    }

    private fun requirePinnedOwner(
        expectedOwner: FirebaseOwnerBinding? = pinnedOwnerOrNull(),
    ): FirebaseOwnerBinding {
        val owner = requireNotNull(expectedOwner) { STALE_SPLASH_SESSION_MESSAGE }
        check(FirebaseAuthService.isCurrentOwner(owner)) { STALE_SPLASH_SESSION_MESSAGE }
        return owner
    }

    override suspend fun registerPushBestEffort(user: AuthUser) {
        val owner = requirePinnedOwner()
        SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated(
            userId = user.id,
            workspaceId = user.canonicalWorkspaceId(),
        )
        requirePinnedOwner(owner)
    }

    override suspend fun clearSession(): Boolean {
        val owner = pinnedOwnerOrNull() ?: return false
        if (!FirebaseAuthService.isCurrentOwner(owner)) return false
        val authorityStore = ShcareMobileSessionAuthority.store
        val authorityToInvalidate = authorityStore.state.value.authority?.takeIf { authority ->
            authority.firebaseUserId == owner.firebaseUserId
        }
        val terminated = SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(owner)
        if (terminated) {
            authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)
        }
        return terminated
    }
}

class SplashViewModel(
    private val gateway: SplashBootstrapGateway,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SplashUiState())
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<SplashUiEffect>(capacity = Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    private var requestInFlight = false

    init {
        bootstrap()
    }

    fun onAction(action: SplashUiAction) {
        when (action) {
            SplashUiAction.Retry -> bootstrap()
        }
    }

    private fun bootstrap() {
        if (requestInFlight) return
        requestInFlight = true
        _uiState.update {
            SplashUiState(loadState = SplashLoadState.Checking)
        }

        viewModelScope.launch {
            try {
                val firebaseOwner = gateway.pinnedFirebaseOwner()
                if (firebaseOwner == null) {
                    requirePinnedSession()
                    _effects.send(SplashUiEffect.NavigateToLogin)
                    return@launch
                }
                check(gateway.checkHealth()) {
                    "Máy chủ chưa sẵn sàng. Vui lòng thử lại."
                }
                requirePinnedSession()

                val existingSessionToken = gateway.existingSessionToken()
                requirePinnedSession()
                if (existingSessionToken.isNullOrBlank()) {
                    error("Phiên Firebase hiện tại không trả về mã xác thực.")
                }
                val authenticatedFirebaseOwner = firebaseOwner

                val verified = gateway.reloadCurrentUser()
                requirePinnedSession()
                if (!verified) {
                    val accountType = gateway.pendingAccountType()
                        .takeIf {
                            it in setOf("personal", "patient", "doctor", "solo_doctor")
                        }
                        ?: "patient"
                    requirePinnedSession()
                    _effects.send(
                        SplashUiEffect.NavigateToVerifyEmail(
                            accountType = accountType,
                            firebaseOwner = authenticatedFirebaseOwner,
                        ),
                    )
                    return@launch
                }

                val user = try {
                    gateway.authenticateCurrentUser()
                } catch (error: SmartHealthApiException) {
                    requirePinnedSession()
                    val backendRejectedSession = error.statusCode in setOf(401, 403)
                    if (error.twoFactorChallengeOrNull() == null && !backendRejectedSession) {
                        throw error
                    }
                    check(gateway.clearSession()) { STALE_SPLASH_SESSION_MESSAGE }
                    _effects.send(SplashUiEffect.NavigateToLogin)
                    return@launch
                }
                requirePinnedSession()
                val destination = user.toSplashDestination(authenticatedFirebaseOwner)
                if (destination == null) {
                    requirePinnedSession()
                    check(gateway.clearSession()) { STALE_SPLASH_SESSION_MESSAGE }
                    _effects.send(SplashUiEffect.NavigateToLogin)
                    return@launch
                }
                try {
                    gateway.registerPushBestEffort(user)
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Throwable) {
                    requirePinnedSession()
                }
                requirePinnedSession()
                _effects.send(destination)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (!gateway.sessionIsCurrent() && gateway.hasNoCurrentFirebaseOwner()) {
                    _effects.send(SplashUiEffect.NavigateToLogin)
                    return@launch
                }
                _uiState.update {
                    SplashUiState(
                        loadState = SplashLoadState.Error,
                        errorMessage = error.toVietnameseMessage(
                            "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.",
                        ),
                    )
                }
            } finally {
                requestInFlight = false
            }
        }
    }

    private fun requirePinnedSession() {
        check(gateway.sessionIsCurrent()) { STALE_SPLASH_SESSION_MESSAGE }
    }
}

class SplashViewModelFactory(
    private val gateway: SplashBootstrapGateway,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(SplashViewModel::class.java)) {
            "Unsupported ViewModel class: ${modelClass.name}"
        }
        @Suppress("UNCHECKED_CAST")
        return SplashViewModel(gateway) as T
    }
}

private fun AuthUser.toSplashDestination(
    firebaseOwner: FirebaseOwnerBinding,
): SplashUiEffect? {
    val isPendingDoctorApproval =
        requestedRole == "doctor" &&
            roleRequestStatus in setOf("pending", "needs_info")
    val opensClinicalDashboard = role in setOf(
        "doctor",
        "admin",
        "workspace_admin",
        "workspace_owner",
        "nurse",
        "technician",
    )
    return when {
        isPendingDoctorApproval -> SplashUiEffect.NavigateToDoctorApprovalPending(firebaseOwner)
        opensClinicalDashboard -> SplashUiEffect.Authenticated(this, firebaseOwner)
        role == "patient" -> SplashUiEffect.Authenticated(this, firebaseOwner)
        else -> null
    }
}
