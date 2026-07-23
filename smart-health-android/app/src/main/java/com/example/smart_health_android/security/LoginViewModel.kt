package com.example.smart_health_android.security

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.TwoFactorChallenge
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.data.twoFactorChallengeOrNull
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.Dispatchers
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
    data class Authenticated(val isDoctorAccount: Boolean) : LoginEffect
    data object DoctorApprovalPending : LoginEffect
    data class VerifyEmail(val accountType: String) : LoginEffect
}

sealed interface LoginResult {
    data class Authenticated(val isDoctorAccount: Boolean) : LoginResult
    data object DoctorApprovalPending : LoginResult
    data class VerifyEmail(val accountType: String) : LoginResult
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

private data class PendingLogin(
    val mode: LoginAccountMode,
    val idToken: String,
    val registration: PendingRegistration?,
)

class ProductionLoginRepository(
    context: Context,
) : LoginRepository {
    private val applicationContext = context.applicationContext
    private var pendingLogin: PendingLogin? = null

    override suspend fun signIn(
        mode: LoginAccountMode,
        email: String,
        password: String,
    ): LoginResult {
        cancelAuthentication()
        val registration = withContext(Dispatchers.IO) {
            PendingRegistrationStore.load(applicationContext)
        }
            ?.takeIf { it.matchesLoginEmail(email) }
        FirebaseAuthService.signIn(email, password)
        if (!FirebaseAuthService.reloadCurrentUser()) {
            val accountType = registration?.accountType ?: mode.accountType
            if (registration == null) {
                withContext(Dispatchers.IO) {
                    PendingRegistrationStore.save(
                        applicationContext,
                        PendingRegistration(
                            accountType = accountType,
                            name = "",
                            email = email,
                            phone = "",
                        ),
                    )
                }
            }
            SmartHealthRepository.api.setAuthToken(null)
            return LoginResult.VerifyEmail(accountType)
        }

        val idToken = FirebaseAuthService.getFreshIdToken(forceRefresh = true)
        val pending = PendingLogin(mode, idToken, registration)
        val user = try {
            SmartHealthRepository.api.authenticateFirebase(idToken).user
        } catch (error: SmartHealthApiException) {
            val challenge = error.twoFactorChallengeOrNull() ?: throw error
            pendingLogin = pending
            return LoginResult.TwoFactorRequired(challenge)
        }

        return finishOrCancel(pending, user)
    }

    override suspend fun completeTwoFactor(
        challengeId: String,
        code: String,
    ): LoginResult {
        val pending = pendingLogin
            ?: error("Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.")
        val confirmation = SmartHealthRepository.api.completeTwoFactorChallenge(challengeId, code)
        val user = confirmation.user
            ?: SmartHealthRepository.api.authenticateFirebase(pending.idToken).user
        pendingLogin = null
        return finishOrCancel(pending, user)
    }

    override fun cancelAuthentication() {
        pendingLogin = null
        SmartHealthRepository.api.setAuthToken(null)
        FirebaseAuthService.signOut()
    }

    private suspend fun finishOrCancel(
        pending: PendingLogin,
        initialUser: AuthUser,
    ): LoginResult {
        return try {
            finishAuthentication(pending, initialUser)
        } catch (error: Exception) {
            cancelAuthentication()
            throw error
        }
    }

    private suspend fun finishAuthentication(
        pending: PendingLogin,
        initialUser: AuthUser,
    ): LoginResult {
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
                SmartHealthRepository.api.requestRole(
                    requestedRole = "doctor",
                    name = doctorRegistration.name,
                    phone = doctorRegistration.phone,
                    license = doctorRegistration.license,
                    hospital = doctorRegistration.hospital,
                    department = doctorRegistration.department,
                    organizationId = doctorRegistration.organizationId,
                    reason = doctorRegistration.reason,
                    accountType = doctorRegistration.accountType,
                    workspaceType = doctorRegistration.workspaceTypeForRoleRequest(),
                )
            } catch (error: Exception) {
                val refreshedUser = runCatching {
                    SmartHealthRepository.api.authenticateFirebase(pending.idToken).user
                }.getOrNull()
                if (refreshedUser?.isPendingDoctorApproval() == true) {
                    PendingRegistrationStore.clear(applicationContext)
                    return LoginResult.DoctorApprovalPending
                }
                throw IllegalStateException(
                    error.toVietnameseMessage(
                        "Chưa gửi được hồ sơ bác sĩ lên máy chủ. Vui lòng thử lại.",
                    ),
                    error,
                )
            }
            if (user.isPendingDoctorApproval() || user.isClinicalAccount()) {
                PendingRegistrationStore.clear(applicationContext)
            }
        }

        val isDoctorAccount = user.isClinicalAccount()
        if (pending.mode == LoginAccountMode.Doctor && user.isPendingDoctorApproval()) {
            return LoginResult.DoctorApprovalPending
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

        runCatching { SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated() }
        return LoginResult.Authenticated(isDoctorAccount)
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
            runCatching { repository.signIn(state.mode, email, state.password) }
                .onSuccess(::handleResult)
                .onFailure { error ->
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
            runCatching {
                repository.completeTwoFactor(state.challengeId, state.otp)
            }.onSuccess(::handleResult)
                .onFailure { error ->
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
                LoginEffect.Authenticated(result.isDoctorAccount),
            )
            LoginResult.DoctorApprovalPending -> finishWithEffect(LoginEffect.DoctorApprovalPending)
            is LoginResult.VerifyEmail -> finishWithEffect(LoginEffect.VerifyEmail(result.accountType))
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

private fun PendingRegistration.workspaceTypeForRoleRequest(): String =
    if (accountType == "solo_doctor") "solo_practice" else "clinic"

private fun AuthUser.isClinicalAccount(): Boolean =
    role in setOf("doctor", "admin", "workspace_admin", "workspace_owner", "nurse", "technician")

private fun AuthUser.isPendingDoctorApproval(): Boolean =
    requestedRole == "doctor" && roleRequestStatus in setOf("pending", "needs_info")

private fun AuthUser.isRejectedDoctorRequest(): Boolean =
    requestedRole == "doctor" && roleRequestStatus == "rejected"
