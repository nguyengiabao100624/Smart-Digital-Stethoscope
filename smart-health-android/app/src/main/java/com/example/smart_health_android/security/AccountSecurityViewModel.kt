package com.example.smart_health_android.security

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthSession
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.TwoFactorEnrollment
import com.example.smart_health_android.data.TwoFactorEnrollmentResult
import com.example.smart_health_android.data.TwoFactorState
import com.example.smart_health_android.data.TwoFactorStatusResult
import com.example.smart_health_android.data.TwoFactorVerifiedResult
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AccountSecurityLoadState {
    Loading,
    Ready,
    Unavailable,
    Offline,
    PermissionDenied,
    Error,
}

enum class TwoFactorSetupStep {
    Status,
    Verify,
    Recovery,
    Disable,
}

data class AccountSecurityUiState(
    val loadState: AccountSecurityLoadState = AccountSecurityLoadState.Loading,
    val twoFactor: TwoFactorState = TwoFactorState(enabled = false),
    val step: TwoFactorSetupStep = TwoFactorSetupStep.Status,
    val enrollment: TwoFactorEnrollment? = null,
    val otp: String = "",
    val recoveryCodes: List<String> = emptyList(),
    val recoveryAcknowledged: Boolean = false,
    val sessions: List<AuthSession> = emptyList(),
    val sessionsLoading: Boolean = true,
    val revokingSessionId: String = "",
    val isMutating: Boolean = false,
    val errorMessage: String = "",
    val sessionsError: String = "",
    val sessionRevokeUnconfirmed: Boolean = false,
    internal val revokeTargetId: String = "",
    internal val revokeIdempotencyKey: String = "",
)

sealed interface AccountSecurityAction {
    data object Retry : AccountSecurityAction
    data object StartEnrollment : AccountSecurityAction
    data class OtpChanged(val value: String) : AccountSecurityAction
    data object VerifyEnrollment : AccountSecurityAction
    data object RequestDisable : AccountSecurityAction
    data object ConfirmDisable : AccountSecurityAction
    data object CancelStep : AccountSecurityAction
    data class RecoveryAcknowledged(val acknowledged: Boolean) : AccountSecurityAction
    data object CompleteRecovery : AccountSecurityAction
    data class RevokeSession(val sessionId: String) : AccountSecurityAction
}

interface AccountSecurityRepository {
    suspend fun status(): TwoFactorStatusResult
    suspend fun sessions(): List<AuthSession>
    suspend fun startEnrollment(): TwoFactorEnrollmentResult
    suspend fun verifyEnrollment(enrollmentId: String, code: String): TwoFactorVerifiedResult
    suspend fun disable(code: String): TwoFactorState
    suspend fun revokeSession(sessionId: String, idempotencyKey: String): AuthSession
}

class ApiAccountSecurityRepository : AccountSecurityRepository {
    override suspend fun status(): TwoFactorStatusResult = SmartHealthRepository.api.getTwoFactorStatus()
    override suspend fun sessions(): List<AuthSession> = SmartHealthRepository.api.listAuthSessions()
    override suspend fun startEnrollment(): TwoFactorEnrollmentResult =
        SmartHealthRepository.api.startTwoFactorEnrollment()
    override suspend fun verifyEnrollment(enrollmentId: String, code: String): TwoFactorVerifiedResult =
        SmartHealthRepository.api.verifyTwoFactorEnrollment(enrollmentId, code)
    override suspend fun disable(code: String): TwoFactorState =
        SmartHealthRepository.api.disableTwoFactor(code)
    override suspend fun revokeSession(sessionId: String, idempotencyKey: String): AuthSession =
        SmartHealthRepository.api.revokeAuthSession(sessionId, idempotencyKey)
}

class AccountSecurityViewModel(
    private val repository: AccountSecurityRepository = ApiAccountSecurityRepository(),
    private val createIdempotencyKey: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(AccountSecurityUiState())
    val uiState = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun onAction(action: AccountSecurityAction) {
        when (action) {
            AccountSecurityAction.Retry -> refresh()
            AccountSecurityAction.StartEnrollment -> startEnrollment()
            is AccountSecurityAction.OtpChanged -> updateOtp(action.value)
            AccountSecurityAction.VerifyEnrollment -> verifyEnrollment()
            AccountSecurityAction.RequestDisable -> requestDisable()
            AccountSecurityAction.ConfirmDisable -> confirmDisable()
            AccountSecurityAction.CancelStep -> cancelStep()
            is AccountSecurityAction.RecoveryAcknowledged -> _uiState.update {
                it.copy(recoveryAcknowledged = action.acknowledged)
            }
            AccountSecurityAction.CompleteRecovery -> completeRecovery()
            is AccountSecurityAction.RevokeSession -> revokeSession(action.sessionId)
        }
    }

    private fun refresh() {
        if (_uiState.value.isMutating) return
        _uiState.update {
            it.copy(
                loadState = AccountSecurityLoadState.Loading,
                sessionsLoading = true,
                errorMessage = "",
                sessionsError = "",
                sessionRevokeUnconfirmed = false,
            )
        }
        viewModelScope.launch {
            val statusRequest = async { runCatching { repository.status() } }
            val sessionsRequest = async { runCatching { repository.sessions() } }
            val status = statusRequest.await()
            val sessions = sessionsRequest.await()
            status.onSuccess { result ->
                _uiState.update {
                    it.copy(
                        loadState = if (result.availability.available) {
                            AccountSecurityLoadState.Ready
                        } else {
                            AccountSecurityLoadState.Unavailable
                        },
                        twoFactor = result.twoFactor,
                        sessions = sessions.getOrDefault(emptyList()),
                        sessionsLoading = false,
                        sessionsError = sessions.exceptionOrNull()?.message.orEmpty(),
                        errorMessage = "",
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        loadState = when {
                            error is SmartHealthApiException && error.statusCode in setOf(401, 403) -> {
                                AccountSecurityLoadState.PermissionDenied
                            }
                            error is IOException && error !is SmartHealthApiException -> {
                                AccountSecurityLoadState.Offline
                            }
                            else -> AccountSecurityLoadState.Error
                        },
                        sessions = sessions.getOrDefault(emptyList()),
                        sessionsLoading = false,
                        sessionsError = sessions.exceptionOrNull()?.message.orEmpty(),
                        errorMessage = error.message.orEmpty(),
                    )
                }
            }
        }
    }

    private fun startEnrollment() {
        val state = _uiState.value
        if (
            state.loadState != AccountSecurityLoadState.Ready ||
            state.twoFactor.enabled ||
            state.isMutating
        ) return
        _uiState.update { it.copy(isMutating = true, errorMessage = "") }
        viewModelScope.launch {
            runCatching { repository.startEnrollment() }
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(
                            twoFactor = result.twoFactor,
                            step = TwoFactorSetupStep.Verify,
                            enrollment = result.enrollment,
                            otp = "",
                            isMutating = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure(::mutationFailed)
        }
    }

    private fun verifyEnrollment() {
        val state = _uiState.value
        val enrollment = state.enrollment ?: return
        if (state.step != TwoFactorSetupStep.Verify || state.otp.length != 6 || state.isMutating) return
        _uiState.update { it.copy(isMutating = true, errorMessage = "") }
        viewModelScope.launch {
            runCatching { repository.verifyEnrollment(enrollment.id, state.otp) }
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(
                            twoFactor = result.twoFactor,
                            step = TwoFactorSetupStep.Recovery,
                            recoveryCodes = result.recoveryCodes,
                            recoveryAcknowledged = false,
                            otp = "",
                            isMutating = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure(::mutationFailed)
        }
    }

    private fun requestDisable() {
        val state = _uiState.value
        if (!state.twoFactor.enabled || state.isMutating) return
        _uiState.update {
            it.copy(step = TwoFactorSetupStep.Disable, otp = "", errorMessage = "")
        }
    }

    private fun confirmDisable() {
        val state = _uiState.value
        if (state.step != TwoFactorSetupStep.Disable || state.otp.length != 6 || state.isMutating) return
        _uiState.update { it.copy(isMutating = true, errorMessage = "") }
        viewModelScope.launch {
            runCatching { repository.disable(state.otp) }
                .onSuccess { result ->
                    _uiState.update {
                        it.copy(
                            twoFactor = result,
                            step = TwoFactorSetupStep.Status,
                            enrollment = null,
                            otp = "",
                            isMutating = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure(::mutationFailed)
        }
    }

    private fun cancelStep() {
        if (_uiState.value.isMutating) return
        _uiState.update {
            it.copy(
                step = TwoFactorSetupStep.Status,
                enrollment = null,
                otp = "",
                recoveryCodes = emptyList(),
                recoveryAcknowledged = false,
                errorMessage = "",
            )
        }
    }

    private fun completeRecovery() {
        val state = _uiState.value
        if (state.step != TwoFactorSetupStep.Recovery || !state.recoveryAcknowledged) return
        _uiState.update {
            it.copy(
                step = TwoFactorSetupStep.Status,
                enrollment = null,
                recoveryCodes = emptyList(),
                recoveryAcknowledged = false,
                errorMessage = "",
            )
        }
    }

    private fun updateOtp(value: String) {
        if (_uiState.value.isMutating) return
        _uiState.update {
            it.copy(
                otp = value.filter(Char::isDigit).take(6),
                errorMessage = "",
            )
        }
    }

    private fun revokeSession(sessionId: String) {
        val state = _uiState.value
        val session = state.sessions.firstOrNull { it.id == sessionId } ?: return
        if (session.current || session.revokedAt != null || state.revokingSessionId.isNotBlank()) return
        val key = state.revokeIdempotencyKey
            .takeIf { state.revokeTargetId == sessionId && it.isNotBlank() }
            ?: createIdempotencyKey()
        _uiState.update {
            it.copy(
                revokingSessionId = sessionId,
                sessionsError = "",
                sessionRevokeUnconfirmed = false,
                revokeTargetId = sessionId,
                revokeIdempotencyKey = key,
            )
        }
        viewModelScope.launch {
            runCatching { repository.revokeSession(sessionId, key) }
                .onSuccess { revoked ->
                    if (revoked.id != sessionId || revoked.revokedAt.isNullOrBlank()) {
                        _uiState.update {
                            it.copy(
                                revokingSessionId = "",
                                sessionsError = "",
                                sessionRevokeUnconfirmed = true,
                            )
                        }
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            sessions = it.sessions.map { current ->
                                if (current.id == sessionId) revoked else current
                            },
                            revokingSessionId = "",
                            sessionsError = "",
                            sessionRevokeUnconfirmed = false,
                            revokeTargetId = "",
                            revokeIdempotencyKey = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            revokingSessionId = "",
                            sessionsError = error.message.orEmpty(),
                            sessionRevokeUnconfirmed = false,
                        )
                    }
                }
        }
    }

    private fun mutationFailed(error: Throwable) {
        _uiState.update {
            it.copy(isMutating = false, errorMessage = error.message.orEmpty())
        }
    }
}
