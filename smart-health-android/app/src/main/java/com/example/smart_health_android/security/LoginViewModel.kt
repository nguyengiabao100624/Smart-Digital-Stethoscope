package com.example.smart_health_android.security

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.normalizePendingRegistrationEmail
import com.example.smart_health_android.data.ownerBinding
import com.example.smart_health_android.data.TwoFactorChallenge
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.data.twoFactorChallengeOrNull
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class LoginAccountMode {
    Doctor,
    Patient,
}

enum class LoginStep {
    Credentials,
    TwoFactor,
}

data class LoginUiState(
    val step: LoginStep = LoginStep.Credentials,
    val mode: LoginAccountMode = LoginAccountMode.Doctor,
    val email: String = "",
    val password: String = "",
    val showPassword: Boolean = false,
    val otp: String = "",
    val challengeExpiresAt: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String = "",
)

sealed interface LoginAction {
    data class ModeChanged(val mode: LoginAccountMode) : LoginAction
    data class EmailChanged(val value: String) : LoginAction
    data class PasswordChanged(val value: String) : LoginAction
    data object TogglePasswordVisibility : LoginAction
    data object SubmitCredentials : LoginAction
    data class OtpChanged(val value: String) : LoginAction
    data object SubmitTwoFactor : LoginAction
    data object CancelTwoFactor : LoginAction
}

sealed interface LoginEffect {
    data class Authenticated(
        val user: AuthUser,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : LoginEffect

    data class DoctorApprovalPending(
        val firebaseOwner: FirebaseOwnerBinding,
    ) : LoginEffect

    data class VerifyEmail(
        val accountType: String,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : LoginEffect
}

sealed interface LoginResult {
    data class Authenticated(
        val user: AuthUser,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : LoginResult

    data class DoctorApprovalPending(
        val firebaseOwner: FirebaseOwnerBinding,
    ) : LoginResult

    data class VerifyEmail(
        val accountType: String,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : LoginResult

    data class TwoFactorRequired(val challenge: TwoFactorChallenge) : LoginResult
}

interface LoginRepository {
    suspend fun signIn(
        mode: LoginAccountMode,
        email: String,
        password: String,
    ): LoginResult

    suspend fun completeTwoFactor(
        challengeId: String,
        code: String,
    ): LoginResult

    fun cancelAuthentication()
}

internal data class PendingLogin(
    val mode: LoginAccountMode,
    val idToken: String,
    val registration: PendingRegistration?,
    val firebaseOwner: FirebaseOwnerBinding,
    val authenticationStartEpoch: Long,
    val backendAuthority: AuthSessionAuthority? = null,
)

class ProductionLoginRepository internal constructor(
    private val firebaseSession: LoginFirebaseSession,
    private val backendSession: LoginBackendSession,
    private val registrationCheckpoint: LoginRegistrationCheckpoint,
    private val pushRegistration: LoginPushRegistration,
    private val intentionalTeardown: IntentionalLoginTeardown,
) : LoginRepository {
    private var pendingLogin: PendingLogin? = null

    constructor(context: Context) : this(
        firebaseSession = ProductionLoginFirebaseSession,
        backendSession = ProductionLoginBackendSession,
        registrationCheckpoint = ProductionLoginRegistrationCheckpoint(context),
        pushRegistration = ProductionLoginPushRegistration,
        intentionalTeardown = ProductionIntentionalLoginTeardown,
    )

    override suspend fun signIn(
        mode: LoginAccountMode,
        email: String,
        password: String,
    ): LoginResult {
        prepareForNewLogin()
        val authenticationStartEpoch = backendSession.currentAuthSessionEpoch()
        val signInReceipt = firebaseSession.signIn(email, password)
        val firebaseOwner = signInReceipt.ownerBinding()
        requireLoginFirebaseOwner(firebaseOwner)
        val registration = registrationCheckpoint.loadForOwner(firebaseOwner)
        requireLoginFirebaseOwner(firebaseOwner)
        val pending = PendingLogin(
            mode = mode,
            idToken = signInReceipt.idToken,
            registration = registration,
            firebaseOwner = firebaseOwner,
            authenticationStartEpoch = authenticationStartEpoch,
        )
        requireLoginFirebaseOwner(pending)
        val verified = firebaseSession.reloadCurrentUser(pending.firebaseOwner)
        requireLoginFirebaseOwner(pending)
        if (!verified) {
            val accountType = registration?.accountType ?: mode.accountType
            if (registration == null) {
                registrationCheckpoint.saveForOwner(
                    registration = PendingRegistration(
                        accountType = accountType,
                        name = "",
                        email = firebaseOwner.email,
                        phone = "",
                    ),
                    owner = pending.firebaseOwner,
                )
                requireLoginFirebaseOwner(pending)
            }
            return LoginResult.VerifyEmail(accountType, pending.firebaseOwner)
        }

        val idToken = pending.idToken.takeIf(String::isNotBlank)
            ?: error("Firebase không trả về token thuộc phiên vừa đăng nhập.")
        requireLoginFirebaseOwner(pending)
        val authResult = try {
            backendSession.authenticateFirebase(
                idToken = idToken,
                expectedAuthSessionEpoch = pending.authenticationStartEpoch,
            )
        } catch (error: SmartHealthApiException) {
            val ownedPending = pending.copy(
                backendAuthority =
                    backendSession.currentAuthSessionAuthorityFor(idToken),
            )
            val challenge = error.twoFactorChallengeOrNull()
            if (challenge == null) {
                cleanupFailedAuthentication(ownedPending)
                throw error
            }
            pendingLogin = ownedPending
            return LoginResult.TwoFactorRequired(challenge)
        } catch (error: CancellationException) {
            val ownedPending = pending.copy(
                backendAuthority =
                    backendSession.currentAuthSessionAuthorityFor(idToken),
            )
            withContext(NonCancellable) {
                cleanupFailedAuthentication(ownedPending)
            }
            throw error
        } catch (error: Exception) {
            val ownedPending = pending.copy(
                backendAuthority =
                    backendSession.currentAuthSessionAuthorityFor(idToken),
            )
            cleanupFailedAuthentication(ownedPending)
            throw error
        }

        val authorizedPending = pending.copy(backendAuthority = authResult.authority)
        requireLoginFirebaseOwner(authorizedPending)
        return finishOrCancel(authorizedPending, authResult.user)
    }

    override suspend fun completeTwoFactor(
        challengeId: String,
        code: String,
    ): LoginResult {
        val pending = pendingLogin
            ?: error("Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.")
        requireLoginFirebaseOwner(pending)
        val confirmation = backendSession.completeTwoFactorChallenge(
            challengeId = challengeId,
            code = code,
            expectedAuthSessionEpoch =
                pending.backendAuthority?.epoch ?: pending.authenticationStartEpoch,
        )
        val confirmationBearer = confirmation.token.ifBlank { pending.idToken }
        var completedPending = pending.copy(
            backendAuthority =
                backendSession.currentAuthSessionAuthorityFor(confirmationBearer)
                    ?: pending.backendAuthority,
        )
        requireLoginFirebaseOwner(completedPending)
        val user = confirmation.user ?: backendSession
            .authenticateFirebase(
                idToken = pending.idToken,
                expectedAuthSessionEpoch =
                    completedPending.backendAuthority?.epoch
                        ?: completedPending.authenticationStartEpoch,
            )
            .also { result ->
                completedPending = completedPending.copy(backendAuthority = result.authority)
            }
            .user
        requireLoginFirebaseOwner(completedPending)
        pendingLogin = null
        return finishOrCancel(completedPending, user)
    }

    override fun cancelAuthentication() {
        val pending = pendingLogin ?: return
        pendingLogin = null
        cleanupFailedAuthentication(pending)
    }

    private fun prepareForNewLogin() {
        pendingLogin = null
        intentionalTeardown.prepareForNewLogin()
    }

    private suspend fun finishOrCancel(
        pending: PendingLogin,
        initialUser: AuthUser,
    ): LoginResult {
        return try {
            finishAuthentication(pending, initialUser)
        } catch (error: CancellationException) {
            withContext(NonCancellable) {
                cleanupFailedAuthentication(pending)
            }
            throw error
        } catch (error: Exception) {
            cleanupFailedAuthentication(pending)
            throw error
        }
    }

    private suspend fun finishAuthentication(
        pending: PendingLogin,
        initialUser: AuthUser,
    ): LoginResult {
        requireLoginFirebaseOwner(pending)
        requireLoginBackendOwner(initialUser, pending)
        var user = initialUser
        val doctorRegistration = pending.registration?.takeIf { it.hasDoctorRequestPayload() }
        if (
            pending.mode == LoginAccountMode.Doctor &&
            !user.isClinicalAccount() &&
            !user.isPendingDoctorApproval() &&
            !user.isRejectedDoctorRequest() &&
            doctorRegistration != null
        ) {
            user = try {
                val updated = backendSession.requestRole(
                    registration = doctorRegistration,
                    expectedAuthSessionEpoch =
                        checkNotNull(pending.backendAuthority).epoch,
                )
                requireLoginFirebaseOwner(pending)
                requireLoginBackendOwner(updated, pending)
                updated
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                val refreshedUser = try {
                    backendSession.authenticateFirebase(
                        idToken = pending.idToken,
                        expectedAuthSessionEpoch =
                            pending.backendAuthority?.epoch
                                ?: pending.authenticationStartEpoch,
                    ).user
                } catch (refreshCancellation: CancellationException) {
                    throw refreshCancellation
                } catch (_: Throwable) {
                    null
                }
                requireLoginFirebaseOwner(pending)
                refreshedUser?.let { requireLoginBackendOwner(it, pending) }
                if (refreshedUser?.isPendingDoctorApproval() == true) {
                    clearPendingRegistration(pending)
                    return LoginResult.DoctorApprovalPending(pending.firebaseOwner)
                }
                throw IllegalStateException(
                    error.toVietnameseMessage(
                        "Chưa gửi được hồ sơ bác sĩ lên máy chủ. Vui lòng thử lại.",
                    ),
                    error,
                )
            }
            if (user.isPendingDoctorApproval() || user.isClinicalAccount()) {
                clearPendingRegistration(pending)
            }
        }

        val isDoctorAccount = user.isClinicalAccount()
        if (pending.mode == LoginAccountMode.Doctor && user.isPendingDoctorApproval()) {
            return LoginResult.DoctorApprovalPending(pending.firebaseOwner)
        }
        if (pending.mode == LoginAccountMode.Doctor && user.isRejectedDoctorRequest()) {
            error("Yêu cầu đăng ký bác sĩ đã bị từ chối. Vui lòng liên hệ quản trị viên hoặc gửi hồ sơ mới.")
        }
        if (pending.mode == LoginAccountMode.Doctor && !isDoctorAccount) {
            if (pending.registration?.isDoctorRegistration() == true) {
                error("Hồ sơ bác sĩ trên thiết bị không còn đủ thông tin. Vui lòng nhập lại hồ sơ.")
            }
            error("Tài khoản chưa có hồ sơ bác sĩ chờ duyệt. Vui lòng đăng ký bác sĩ trước.")
        }
        if (pending.mode == LoginAccountMode.Patient && user.role != "patient") {
            error("Hãy chọn chế độ bác sĩ cho tài khoản này.")
        }

        try {
            pushRegistration.register(
                userId = user.id,
                workspaceId = user.canonicalWorkspaceId(),
            )
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            // Push registration retries independently and cannot manufacture login success.
        }
        requireLoginFirebaseOwner(pending)
        return LoginResult.Authenticated(user, pending.firebaseOwner)
    }

    private fun requireLoginFirebaseOwner(pending: PendingLogin) {
        requireLoginFirebaseOwner(
            expectedOwner = pending.firebaseOwner,
            backendAuthority = pending.backendAuthority,
        )
    }

    private fun requireLoginFirebaseOwner(
        expectedOwner: FirebaseOwnerBinding,
        backendAuthority: AuthSessionAuthority? = null,
    ) {
        if (!firebaseSession.isCurrentOwner(expectedOwner)) {
            backendAuthority?.let(backendSession::clearAuthTokenIfCurrent)
            error("Phiên Firebase đã thay đổi trong lúc đăng nhập.")
        }
    }

    private fun requireLoginBackendOwner(
        user: AuthUser,
        pending: PendingLogin,
    ) {
        if (
            user.firebaseUid != pending.firebaseOwner.firebaseUserId ||
            normalizePendingRegistrationEmail(user.email) !=
            pending.firebaseOwner.email ||
            !user.verifiedEmail ||
            !user.accountStatus.equals("active", ignoreCase = true) ||
            !user.deletedAt.isNullOrBlank()
        ) {
            pending.backendAuthority?.let(backendSession::clearAuthTokenIfCurrent)
            error("Máy chủ trả về phiên không thuộc tài khoản Firebase hiện tại.")
        }
    }

    private fun cleanupFailedAuthentication(pending: PendingLogin) {
        firebaseSession.signOutIfCurrentOwner(pending.firebaseOwner)
        pending.backendAuthority?.let(backendSession::clearAuthTokenIfCurrent)
    }

    private suspend fun clearPendingRegistration(pending: PendingLogin) {
        val cleared = registrationCheckpoint.clearForOwner(pending.firebaseOwner)
        requireLoginFirebaseOwner(pending)
        check(cleared) {
            "Không thể dọn checkpoint đăng ký của tài khoản hiện tại."
        }
    }
}

class LoginViewModel(
    private val repository: LoginRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<LoginEffect>(capacity = Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    fun onAction(action: LoginAction) {
        when (action) {
            is LoginAction.ModeChanged -> updateCredentials { it.copy(mode = action.mode) }
            is LoginAction.EmailChanged -> updateCredentials { it.copy(email = action.value) }
            is LoginAction.PasswordChanged -> updateCredentials { it.copy(password = action.value) }
            LoginAction.TogglePasswordVisibility -> updateCredentials {
                it.copy(showPassword = !it.showPassword)
            }
            LoginAction.SubmitCredentials -> submitCredentials()
            is LoginAction.OtpChanged -> updateOtp(action.value)
            LoginAction.SubmitTwoFactor -> submitTwoFactor()
            LoginAction.CancelTwoFactor -> cancelTwoFactor()
        }
    }

    private fun submitCredentials() {
        val state = _uiState.value
        if (state.isLoading || state.step != LoginStep.Credentials) return
        val email = state.email.trim()
        if (email.isBlank() || state.password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Vui lòng nhập email và mật khẩu.") }
            return
        }
        _uiState.update { it.copy(isLoading = true, errorMessage = "") }
        viewModelScope.launch {
            try {
                handleResult(repository.signIn(state.mode, email, state.password))
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            password = "",
                            errorMessage = error.toVietnameseMessage(
                                "Không thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại.",
                            ),
                        )
                    }
                }
        }
    }

    private fun submitTwoFactor() {
        val state = _uiState.value
        if (
            state.isLoading ||
            state.step != LoginStep.TwoFactor ||
            state.otp.length != 6
        ) return
        _uiState.update { it.copy(isLoading = true, errorMessage = "") }
        viewModelScope.launch {
            try {
                handleResult(repository.completeTwoFactor(state.challengeId, state.otp))
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            otp = "",
                            errorMessage = error.toVietnameseMessage(
                                "Mã OTP chưa được xác nhận. Vui lòng thử lại.",
                            ),
                        )
                    }
                }
        }
    }

    private val LoginUiState.challengeId: String
        get() = activeChallengeId

    private var activeChallengeId: String = ""

    private fun handleResult(result: LoginResult) {
        when (result) {
            is LoginResult.TwoFactorRequired -> {
                activeChallengeId = result.challenge.challengeId
                _uiState.update {
                    it.copy(
                        step = LoginStep.TwoFactor,
                        password = "",
                        otp = "",
                        challengeExpiresAt = result.challenge.expiresAt,
                        isLoading = false,
                        errorMessage = "",
                    )
                }
            }
            is LoginResult.Authenticated -> finishWithEffect(
                LoginEffect.Authenticated(result.user, result.firebaseOwner),
            )
            is LoginResult.DoctorApprovalPending -> finishWithEffect(
                LoginEffect.DoctorApprovalPending(result.firebaseOwner),
            )
            is LoginResult.VerifyEmail -> finishWithEffect(
                LoginEffect.VerifyEmail(result.accountType, result.firebaseOwner),
            )
        }
    }

    private fun finishWithEffect(effect: LoginEffect) {
        activeChallengeId = ""
        _uiState.update { it.copy(isLoading = false, errorMessage = "", otp = "", password = "") }
        viewModelScope.launch { _effects.send(effect) }
    }

    private fun cancelTwoFactor() {
        if (_uiState.value.isLoading) return
        repository.cancelAuthentication()
        activeChallengeId = ""
        _uiState.update {
            it.copy(
                step = LoginStep.Credentials,
                password = "",
                otp = "",
                challengeExpiresAt = "",
                errorMessage = "",
            )
        }
    }

    private fun updateCredentials(transform: (LoginUiState) -> LoginUiState) {
        val state = _uiState.value
        if (state.isLoading || state.step != LoginStep.Credentials) return
        _uiState.update { transform(it).copy(errorMessage = "") }
    }

    private fun updateOtp(value: String) {
        val state = _uiState.value
        if (state.isLoading || state.step != LoginStep.TwoFactor) return
        _uiState.update {
            it.copy(
                otp = value.filter(Char::isDigit).take(6),
                errorMessage = "",
            )
        }
    }

    override fun onCleared() {
        if (_uiState.value.step == LoginStep.TwoFactor) {
            repository.cancelAuthentication()
        }
        super.onCleared()
    }
}

class LoginViewModelFactory(
    context: Context,
) : ViewModelProvider.Factory {
    private val repository = ProductionLoginRepository(context)

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(LoginViewModel::class.java))
        return LoginViewModel(repository) as T
    }
}

private val LoginAccountMode.accountType: String
    get() = if (this == LoginAccountMode.Doctor) "doctor" else "patient"

private fun PendingRegistration.matchesLoginEmail(login: String): Boolean =
    email.trim().equals(login.trim(), ignoreCase = true)

private fun PendingRegistration.isDoctorRegistration(): Boolean =
    accountType == "doctor" || accountType == "solo_doctor"

private fun PendingRegistration.hasDoctorRequestPayload(): Boolean =
    isDoctorRegistration() && name.isNotBlank()

private fun AuthUser.isClinicalAccount(): Boolean =
    role in setOf("doctor", "admin", "workspace_admin", "workspace_owner", "nurse", "technician")

private fun AuthUser.isPendingDoctorApproval(): Boolean =
    requestedRole == "doctor" && roleRequestStatus in setOf("pending", "needs_info")

private fun AuthUser.isRejectedDoctorRequest(): Boolean =
    requestedRole == "doctor" && roleRequestStatus == "rejected"
