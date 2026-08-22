package com.example.smart_health_android.security

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthSession
import com.example.smart_health_android.data.AuthSessionRevocationReceipt
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.TwoFactorEnrollment
import com.example.smart_health_android.data.TwoFactorEnrollmentIntent
import com.example.smart_health_android.data.TwoFactorEnrollmentResult
import com.example.smart_health_android.data.TwoFactorEnrollmentStartIntent
import com.example.smart_health_android.data.TwoFactorRecoveryAcknowledgementIntent
import com.example.smart_health_android.data.TwoFactorRecoveryAcknowledgementReceipt
import com.example.smart_health_android.data.TwoFactorRecoveryDelivery
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
    val recoveryDelivery: TwoFactorRecoveryDelivery? = null,
    val recoveryAcknowledged: Boolean = false,
    val recoveryExitBlocked: Boolean = false,
    val sessions: List<AuthSession> = emptyList(),
    val sessionsLoading: Boolean = true,
    val revokingSessionId: String = "",
    val isMutating: Boolean = false,
    val errorMessage: String = "",
    val sessionsError: String = "",
    val sessionRevokeUnconfirmed: Boolean = false,
    internal val revokeTargetId: String = "",
    internal val revokeIdempotencyKey: String = "",
    internal val enrollmentIntent: TwoFactorEnrollmentIntent? = null,
    internal val enrollmentStartIntent: TwoFactorEnrollmentStartIntent? = null,
    internal val recoveryIdempotencyKey: String = "",
    internal val recoveryAckToken: String = "",
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
    data object RecoveryExitAttempted : AccountSecurityAction
    data object CompleteRecovery : AccountSecurityAction
    data class RevokeSession(val sessionId: String) : AccountSecurityAction
}

interface AccountSecurityRepository {
    suspend fun status(): TwoFactorStatusResult
    suspend fun sessions(): List<AuthSession>
    suspend fun startEnrollment(intent: TwoFactorEnrollmentStartIntent): TwoFactorEnrollmentResult
    suspend fun verifyEnrollment(intent: TwoFactorEnrollmentIntent): TwoFactorVerifiedResult
    suspend fun acknowledgeRecoveryCodes(
        intent: TwoFactorRecoveryAcknowledgementIntent,
    ): TwoFactorRecoveryAcknowledgementReceipt
    suspend fun disable(code: String): TwoFactorState
    suspend fun revokeSession(
        sessionId: String,
        idempotencyKey: String,
    ): AuthSessionRevocationReceipt
}

class ApiAccountSecurityRepository : AccountSecurityRepository {
    override suspend fun status(): TwoFactorStatusResult = SmartHealthRepository.api.getTwoFactorStatus()
    override suspend fun sessions(): List<AuthSession> = SmartHealthRepository.api.listAuthSessions()
    override suspend fun startEnrollment(
        intent: TwoFactorEnrollmentStartIntent,
    ): TwoFactorEnrollmentResult = SmartHealthRepository.api.startTwoFactorEnrollment(intent)
    override suspend fun verifyEnrollment(intent: TwoFactorEnrollmentIntent): TwoFactorVerifiedResult =
        SmartHealthRepository.api.verifyTwoFactorEnrollment(intent)
    override suspend fun acknowledgeRecoveryCodes(
        intent: TwoFactorRecoveryAcknowledgementIntent,
    ): TwoFactorRecoveryAcknowledgementReceipt =
        SmartHealthRepository.api.acknowledgeTwoFactorRecoveryCodes(intent)
    override suspend fun disable(code: String): TwoFactorState =
        SmartHealthRepository.api.disableTwoFactor(code)
    override suspend fun revokeSession(
        sessionId: String,
        idempotencyKey: String,
    ): AuthSessionRevocationReceipt =
        SmartHealthRepository.api.revokeAuthSession(sessionId, idempotencyKey)
}

class AccountSecurityViewModel(
    private val repository: AccountSecurityRepository = ApiAccountSecurityRepository(),
    private val createIdempotencyKey: () -> String = { UUID.randomUUID().toString() },
    private val expectedUserId: String = "",
    private val expectedAuthSessionEpoch: Long = SmartHealthRepository.api.currentAuthSessionEpoch(),
    private val authorityIsCurrent: () -> Boolean = {
        SmartHealthRepository.api.currentAuthSessionEpoch() == expectedAuthSessionEpoch
    },
) : ViewModel() {
    private val _uiState = MutableStateFlow(AccountSecurityUiState())
    val uiState = _uiState.asStateFlow()

    init {
        refresh()
    }

    private fun hasCurrentAuthority(): Boolean =
        expectedUserId.isNotBlank() && authorityIsCurrent()

    private fun rejectStaleAuthority() {
        _uiState.update {
            it.copy(
                loadState = AccountSecurityLoadState.PermissionDenied,
                sessionsLoading = false,
                isMutating = false,
                revokingSessionId = "",
                step = TwoFactorSetupStep.Status,
                enrollment = null,
                otp = "",
                recoveryCodes = emptyList(),
                recoveryDelivery = null,
                recoveryAcknowledged = false,
                recoveryExitBlocked = false,
                enrollmentIntent = null,
                enrollmentStartIntent = null,
                recoveryIdempotencyKey = "",
                recoveryAckToken = "",
                errorMessage = "Phiên đăng nhập đã thay đổi. Vui lòng đăng nhập lại.",
            )
        }
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
            AccountSecurityAction.RecoveryExitAttempted -> _uiState.update {
                if (it.step == TwoFactorSetupStep.Recovery && it.recoveryCodes.isNotEmpty()) {
                    it.copy(recoveryExitBlocked = true)
                } else {
                    it
                }
            }
            AccountSecurityAction.CompleteRecovery -> completeRecovery()
            is AccountSecurityAction.RevokeSession -> revokeSession(action.sessionId)
        }
    }

    private fun refresh() {
        if (_uiState.value.isMutating) return
        if (!hasCurrentAuthority()) {
            rejectStaleAuthority()
            return
        }
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
            if (!hasCurrentAuthority()) {
                rejectStaleAuthority()
                return@launch
            }
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
            !hasCurrentAuthority() ||
            state.loadState != AccountSecurityLoadState.Ready ||
            state.twoFactor.enabled ||
            state.isMutating
        ) return
        val intent = state.enrollmentStartIntent
            ?.takeIf {
                it.userId == expectedUserId &&
                    it.expectedAuthSessionEpoch == expectedAuthSessionEpoch
            }
            ?: TwoFactorEnrollmentStartIntent(
                userId = expectedUserId,
                idempotencyKey = createIdempotencyKey(),
                expectedAuthSessionEpoch = expectedAuthSessionEpoch,
            )
        _uiState.update {
            it.copy(
                isMutating = true,
                errorMessage = "",
                enrollmentStartIntent = intent,
            )
        }
        viewModelScope.launch {
            runCatching { repository.startEnrollment(intent) }
                .onSuccess { result ->
                    if (!hasCurrentAuthority()) {
                        rejectStaleAuthority()
                        return@onSuccess
                    }
                    if (
                        result.userId != expectedUserId ||
                        result.twoFactor.enabled ||
                        result.twoFactor.method.isNotEmpty() ||
                        !result.twoFactor.enrollmentPending ||
                        result.enrollment.id.isBlank() ||
                        result.enrollment.method != "app" ||
                        result.enrollment.manualKey.isBlank() ||
                        result.enrollment.otpauthUri.isBlank()
                    ) {
                        mutationFailed(
                            SmartHealthApiException(
                                statusCode = 502,
                                code = "TWO_FACTOR_ENROLLMENT_START_RESPONSE_SCOPE_MISMATCH",
                                message = "Máy chủ chưa xác nhận đúng tài khoản và lần thiết lập.",
                            ),
                        )
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            twoFactor = result.twoFactor,
                            step = TwoFactorSetupStep.Verify,
                            enrollment = result.enrollment,
                            otp = "",
                            recoveryCodes = emptyList(),
                            recoveryDelivery = null,
                            recoveryAcknowledged = false,
                            recoveryExitBlocked = false,
                            enrollmentIntent = null,
                            recoveryIdempotencyKey = "",
                            recoveryAckToken = "",
                            isMutating = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure { error ->
                    if (
                        !hasCurrentAuthority() ||
                        (error is SmartHealthApiException && error.code == "AUTH_SESSION_REPLACED")
                    ) {
                        rejectStaleAuthority()
                        return@onFailure
                    }
                    val retireCollisionKey =
                        error is SmartHealthApiException &&
                            error.code == "IDEMPOTENCY_KEY_REUSED"
                    _uiState.update {
                        it.copy(
                            isMutating = false,
                            errorMessage = terminalEnrollmentMessage(error),
                            enrollmentStartIntent = if (retireCollisionKey) {
                                null
                            } else {
                                it.enrollmentStartIntent
                            },
                        )
                    }
                }
        }
    }

    private fun verifyEnrollment() {
        val state = _uiState.value
        val enrollment = state.enrollment ?: return
        if (
            !hasCurrentAuthority() ||
            state.step != TwoFactorSetupStep.Verify ||
            state.otp.length != 6 ||
            state.isMutating
        ) return
        val intent = state.enrollmentIntent
            ?.takeIf {
                it.userId == expectedUserId &&
                    it.enrollmentId == enrollment.id &&
                    it.code == state.otp &&
                    it.expectedAuthSessionEpoch == expectedAuthSessionEpoch
            }
            ?: TwoFactorEnrollmentIntent(
                userId = expectedUserId,
                enrollmentId = enrollment.id,
                code = state.otp,
                idempotencyKey = createIdempotencyKey(),
                expectedAuthSessionEpoch = expectedAuthSessionEpoch,
            )
        _uiState.update {
            it.copy(
                isMutating = true,
                errorMessage = "",
                enrollmentIntent = intent,
            )
        }
        viewModelScope.launch {
            runCatching { repository.verifyEnrollment(intent) }
                .onSuccess { result ->
                    if (!hasCurrentAuthority()) {
                        rejectStaleAuthority()
                        return@onSuccess
                    }
                    if (
                        result.userId != expectedUserId ||
                        result.enrollmentId != enrollment.id ||
                        result.twoFactor.enabled ||
                        result.twoFactor.method.isNotEmpty() ||
                        !result.twoFactor.enrollmentPending ||
                        result.recoveryDelivery.acknowledged ||
                        result.recoveryCodes.size != 8 ||
                        result.recoveryAckToken.isBlank()
                    ) {
                        mutationFailed(
                            SmartHealthApiException(
                                statusCode = 502,
                                code = "TWO_FACTOR_ENROLLMENT_RESPONSE_SCOPE_MISMATCH",
                                message = "Máy chủ chưa xác nhận đúng tài khoản và lần thiết lập.",
                            ),
                        )
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            twoFactor = result.twoFactor,
                            step = TwoFactorSetupStep.Recovery,
                            recoveryCodes = result.recoveryCodes,
                            recoveryDelivery = result.recoveryDelivery,
                            recoveryAcknowledged = false,
                            recoveryExitBlocked = false,
                            otp = "",
                            enrollmentIntent = null,
                            recoveryIdempotencyKey = intent.idempotencyKey,
                            recoveryAckToken = result.recoveryAckToken,
                            isMutating = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure { error ->
                    if (
                        !hasCurrentAuthority() ||
                        (error is SmartHealthApiException && error.code == "AUTH_SESSION_REPLACED")
                    ) {
                        rejectStaleAuthority()
                        return@onFailure
                    }
                    val retireCollisionKey =
                        error is SmartHealthApiException &&
                            error.code == "IDEMPOTENCY_KEY_REUSED"
                    val retireStartKey =
                        error is SmartHealthApiException &&
                            error.code in setOf(
                                "TWO_FACTOR_ENROLLMENT_EXPIRED",
                                "TWO_FACTOR_ENROLLMENT_CONSUMED",
                                "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
                                "TWO_FACTOR_ATTEMPTS_EXCEEDED",
                                "TWO_FACTOR_DELIVERY_EXPIRED",
                            )
                    _uiState.update {
                        if (retireStartKey) {
                            it.copy(
                                step = TwoFactorSetupStep.Status,
                                enrollment = null,
                                otp = "",
                                recoveryCodes = emptyList(),
                                recoveryDelivery = null,
                                recoveryAcknowledged = false,
                                recoveryExitBlocked = false,
                                isMutating = false,
                                errorMessage = terminalEnrollmentMessage(error),
                                enrollmentIntent = null,
                                enrollmentStartIntent = null,
                                recoveryIdempotencyKey = "",
                                recoveryAckToken = "",
                            )
                        } else {
                            it.copy(
                                isMutating = false,
                                errorMessage = error.message.orEmpty(),
                                enrollmentIntent = if (retireCollisionKey) null else it.enrollmentIntent,
                            )
                        }
                    }
                }
        }
    }

    private fun requestDisable() {
        val state = _uiState.value
        if (!hasCurrentAuthority() || !state.twoFactor.enabled || state.isMutating) return
        _uiState.update {
            it.copy(step = TwoFactorSetupStep.Disable, otp = "", errorMessage = "")
        }
    }

    private fun confirmDisable() {
        val state = _uiState.value
        if (
            !hasCurrentAuthority() ||
            state.step != TwoFactorSetupStep.Disable ||
            state.otp.length != 6 ||
            state.isMutating
        ) return
        _uiState.update { it.copy(isMutating = true, errorMessage = "") }
        viewModelScope.launch {
            runCatching { repository.disable(state.otp) }
                .onSuccess { result ->
                    if (!hasCurrentAuthority()) {
                        rejectStaleAuthority()
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            twoFactor = result,
                            step = TwoFactorSetupStep.Status,
                            enrollment = null,
                            otp = "",
                            recoveryCodes = emptyList(),
                            recoveryDelivery = null,
                            recoveryAcknowledged = false,
                            recoveryExitBlocked = false,
                            enrollmentIntent = null,
                            recoveryIdempotencyKey = "",
                            recoveryAckToken = "",
                            isMutating = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure(::mutationFailed)
        }
    }

    private fun cancelStep() {
        val state = _uiState.value
        if (state.isMutating || state.step == TwoFactorSetupStep.Recovery) return
        _uiState.update {
            it.copy(
                step = TwoFactorSetupStep.Status,
                enrollment = null,
                otp = "",
                recoveryCodes = emptyList(),
                recoveryDelivery = null,
                recoveryAcknowledged = false,
                recoveryExitBlocked = false,
                enrollmentIntent = null,
                recoveryIdempotencyKey = "",
                recoveryAckToken = "",
                errorMessage = "",
            )
        }
    }

    private fun completeRecovery() {
        val state = _uiState.value
        val enrollment = state.enrollment ?: return
        val delivery = state.recoveryDelivery ?: return
        if (
            !hasCurrentAuthority() ||
            state.step != TwoFactorSetupStep.Recovery ||
            !state.recoveryAcknowledged ||
            state.isMutating ||
            state.recoveryIdempotencyKey.isBlank() ||
            state.recoveryAckToken.isBlank() ||
            delivery.acknowledged
        ) return
        val acknowledgementIntent = TwoFactorRecoveryAcknowledgementIntent(
            userId = expectedUserId,
            enrollmentId = enrollment.id,
            deliveryId = delivery.id,
            recoveryAckToken = state.recoveryAckToken,
            idempotencyKey = state.recoveryIdempotencyKey,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        _uiState.update { it.copy(isMutating = true, errorMessage = "") }
        viewModelScope.launch {
            runCatching {
                repository.acknowledgeRecoveryCodes(acknowledgementIntent)
            }.onSuccess { receipt ->
                if (!hasCurrentAuthority()) {
                    rejectStaleAuthority()
                    return@onSuccess
                }
                if (
                    receipt.userId != expectedUserId ||
                    receipt.enrollmentId != enrollment.id ||
                    receipt.recoveryDelivery.id != delivery.id ||
                    !receipt.recoveryDelivery.acknowledged ||
                    receipt.recoveryDelivery.acknowledgedAt.isNullOrBlank() ||
                    !receipt.twoFactor.enabled ||
                    receipt.twoFactor.method != "app" ||
                    receipt.twoFactor.enrollmentPending
                ) {
                    mutationFailed(
                        SmartHealthApiException(
                            statusCode = 502,
                            code = "TWO_FACTOR_RECOVERY_ACK_RESPONSE_SCOPE_MISMATCH",
                            message = "Máy chủ chưa xác nhận đúng lần giao mã khôi phục.",
                        ),
                    )
                    return@onSuccess
                }
                _uiState.update {
                    it.copy(
                        twoFactor = receipt.twoFactor,
                        step = TwoFactorSetupStep.Status,
                        enrollment = null,
                        recoveryCodes = emptyList(),
                        recoveryDelivery = null,
                        recoveryAcknowledged = false,
                        recoveryExitBlocked = false,
                        enrollmentIntent = null,
                        enrollmentStartIntent = null,
                        recoveryIdempotencyKey = "",
                        recoveryAckToken = "",
                        isMutating = false,
                        errorMessage = "",
                    )
                }
            }.onFailure { error ->
                if (
                    !hasCurrentAuthority() ||
                    (error is SmartHealthApiException && error.code == "AUTH_SESSION_REPLACED")
                ) {
                    rejectStaleAuthority()
                    return@onFailure
                }
                val deliveryExpired =
                    error is SmartHealthApiException &&
                        error.code == "TWO_FACTOR_DELIVERY_EXPIRED"
                _uiState.update {
                    if (deliveryExpired) {
                        it.copy(
                            twoFactor = TwoFactorState(
                                enabled = false,
                                method = "",
                                enrollmentPending = false,
                            ),
                            step = TwoFactorSetupStep.Status,
                            enrollment = null,
                            otp = "",
                            recoveryCodes = emptyList(),
                            recoveryDelivery = null,
                            recoveryAcknowledged = false,
                            recoveryExitBlocked = false,
                            enrollmentIntent = null,
                            enrollmentStartIntent = null,
                            recoveryIdempotencyKey = "",
                            recoveryAckToken = "",
                            isMutating = false,
                            errorMessage = terminalEnrollmentMessage(error),
                        )
                    } else {
                        it.copy(
                            isMutating = false,
                            errorMessage = error.message.orEmpty(),
                        )
                    }
                }
            }
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
        if (
            !hasCurrentAuthority() ||
            session.current ||
            session.revokedAt != null ||
            state.revokingSessionId.isNotBlank()
        ) return
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
                .onSuccess { receipt ->
                    if (!hasCurrentAuthority()) {
                        rejectStaleAuthority()
                        return@onSuccess
                    }
                    if (!receipt.confirms(sessionId)) {
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
                                if (current.id == sessionId) receipt.session else current
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
                    val retireCollisionKey =
                        error is SmartHealthApiException &&
                            error.code == "IDEMPOTENCY_KEY_REUSED"
                    _uiState.update {
                        it.copy(
                            revokingSessionId = "",
                            sessionsError = error.message.orEmpty(),
                            sessionRevokeUnconfirmed = false,
                            revokeTargetId = if (retireCollisionKey) "" else it.revokeTargetId,
                            revokeIdempotencyKey = if (retireCollisionKey) "" else it.revokeIdempotencyKey,
                        )
                    }
                }
        }
    }

    private fun mutationFailed(error: Throwable) {
        if (
            !hasCurrentAuthority() ||
            (error is SmartHealthApiException && error.code == "AUTH_SESSION_REPLACED")
        ) {
            rejectStaleAuthority()
            return
        }
        _uiState.update {
            it.copy(isMutating = false, errorMessage = error.message.orEmpty())
        }
    }

    private fun terminalEnrollmentMessage(error: Throwable): String =
        when ((error as? SmartHealthApiException)?.code) {
            "TWO_FACTOR_DELIVERY_EXPIRED" ->
                "Thời hạn xác nhận mã khôi phục đã hết. 2FA chưa được bật; hãy bắt đầu lại."
            "TWO_FACTOR_ATTEMPTS_EXCEEDED" ->
                "Đã vượt quá số lần thử cho lần thiết lập này. Hãy bắt đầu lại để nhận khóa mới."
            "TWO_FACTOR_ENROLLMENT_EXPIRED",
            "TWO_FACTOR_ENROLLMENT_CONSUMED",
            "TWO_FACTOR_ENROLLMENT_ALREADY_USED"
            -> "Lần thiết lập này không còn hiệu lực. Hãy bắt đầu lại để nhận khóa mới."
            else -> error.message.orEmpty()
        }
}

class AccountSecurityViewModelFactory(
    private val expectedUserId: String,
    private val expectedAuthSessionEpoch: Long,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(AccountSecurityViewModel::class.java)) {
            "Unsupported ViewModel class: ${modelClass.name}"
        }
        return AccountSecurityViewModel(
            expectedUserId = expectedUserId,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
            authorityIsCurrent = {
                SmartHealthRepository.api.currentAuthSessionEpoch() == expectedAuthSessionEpoch
            },
        ) as T
    }
}
