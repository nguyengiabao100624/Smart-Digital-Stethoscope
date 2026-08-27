package com.example.smart_health_android.security

import android.content.Context
import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.AuthSessionAuthority
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.normalizePendingRegistrationEmail
import com.example.smart_health_android.data.toVietnameseMessage
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.ceil
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class EmailVerificationUiState(
    val email: String = "",
    val isChecking: Boolean = false,
    val isResending: Boolean = false,
    val isVerified: Boolean = false,
    val verifiedAccountType: String = "",
    val infoMessage: String = "",
    val errorMessage: String = "",
    val resendCooldownSeconds: Int = 0,
)

sealed interface EmailVerificationUiAction {
    data object CheckStatus : EmailVerificationUiAction
    data object Resend : EmailVerificationUiAction
    data object BackRequested : EmailVerificationUiAction
}

sealed interface EmailVerificationUiEffect {
    data object NavigateBack : EmailVerificationUiEffect
    data class Verified(
        val accountType: String,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : EmailVerificationUiEffect
}

data class EmailVerificationSession(
    val email: String,
    val fallbackAccountType: String,
)

sealed interface EmailVerificationCheckResult {
    data object Pending : EmailVerificationCheckResult
    data class Verified(
        val accountType: String,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : EmailVerificationCheckResult
}

sealed interface EmailVerificationResendOutcome {
    data object Sent : EmailVerificationResendOutcome
    data class Verified(
        val accountType: String,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : EmailVerificationResendOutcome
}

interface EmailVerificationRepository {
    val session: EmailVerificationSession

    suspend fun checkStatus(): EmailVerificationCheckResult

    suspend fun resend(): EmailVerificationResendOutcome
}

internal interface EmailVerificationFirebaseSession {
    fun currentOwnerBindingOrNull(): FirebaseOwnerBinding?

    suspend fun reloadCurrentUser(expectedOwner: FirebaseOwnerBinding): Boolean

    suspend fun getFreshIdToken(
        expectedOwner: FirebaseOwnerBinding,
        forceRefresh: Boolean,
    ): String

    suspend fun sendEmailVerification(expectedOwner: FirebaseOwnerBinding)
}

internal interface EmailVerificationBackend {
    fun currentAuthSessionEpoch(): Long

    suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthUser

    suspend fun requestRole(
        registration: PendingRegistration,
        idempotencyKey: String,
    ): AuthUser

    fun clearOwnedAuthorization()
}

internal interface EmailVerificationRegistrationStore {
    suspend fun loadForOwner(
        firebaseUserId: String,
        firebaseEmail: String,
    ): PendingRegistration?

    suspend fun clearForOwner(
        firebaseUserId: String,
        firebaseEmail: String,
    ): Boolean
}

internal interface EmailVerificationPushRegistrar {
    suspend fun register(
        backendUserId: String,
        workspaceId: String,
    ): Boolean
}

class EmailVerificationOwnerChangedException(
    cause: Throwable? = null,
) : IllegalStateException(
    "Phiên tài khoản đã thay đổi. Vui lòng mở lại bước xác thực email.",
    cause,
)

class EmailVerificationContractException(
    message: String,
) : IllegalStateException(message)

private object DefaultEmailVerificationFirebaseSession : EmailVerificationFirebaseSession {
    override fun currentOwnerBindingOrNull(): FirebaseOwnerBinding? =
        FirebaseAuthService.currentOwnerBindingOrNull()

    override suspend fun reloadCurrentUser(expectedOwner: FirebaseOwnerBinding): Boolean =
        FirebaseAuthService.reloadCurrentUser(expectedOwner)

    override suspend fun getFreshIdToken(
        expectedOwner: FirebaseOwnerBinding,
        forceRefresh: Boolean,
    ): String = FirebaseAuthService.getFreshIdToken(expectedOwner, forceRefresh)

    override suspend fun sendEmailVerification(expectedOwner: FirebaseOwnerBinding) =
        FirebaseAuthService.sendEmailVerification(expectedOwner)
}

private class ProductionEmailVerificationBackend : EmailVerificationBackend {
    private var ownedAuthority: AuthSessionAuthority? = null

    override fun currentAuthSessionEpoch(): Long =
        SmartHealthRepository.api.currentAuthSessionEpoch()

    override suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthUser {
        return try {
            SmartHealthRepository.api.authenticateFirebase(
                idToken = idToken,
                expectedAuthSessionEpoch = expectedAuthSessionEpoch,
            ).user
        } finally {
            ownedAuthority =
                SmartHealthRepository.api.currentAuthSessionAuthorityFor(idToken)
        }
    }

    override suspend fun requestRole(
        registration: PendingRegistration,
        idempotencyKey: String,
    ): AuthUser {
        return SmartHealthRepository.api.requestRole(
            requestedRole = registration.requestedRole(),
            name = registration.name,
            phone = registration.phone,
            license = registration.license,
            hospital = registration.hospital,
            department = registration.department,
            organizationId = registration.organizationId,
            reason = registration.reason,
            accountType = registration.accountType,
            workspaceType = registration.workspaceTypeForRoleRequest(),
            idempotencyKey = idempotencyKey,
            expectedAuthSessionEpoch = checkNotNull(ownedAuthority).epoch,
        )
    }

    override fun clearOwnedAuthorization() {
        ownedAuthority?.let(SmartHealthRepository.api::clearAuthTokenIfCurrent)
    }
}

private class ProductionEmailVerificationRegistrationStore(
    context: Context,
) : EmailVerificationRegistrationStore {
    private val applicationContext = context.applicationContext

    override suspend fun loadForOwner(
        firebaseUserId: String,
        firebaseEmail: String,
    ): PendingRegistration? = withContext(Dispatchers.IO) {
        PendingRegistrationStore.loadForFirebaseOwner(
            context = applicationContext,
            firebaseUserId = firebaseUserId,
            firebaseEmail = firebaseEmail,
        )
    }

    override suspend fun clearForOwner(
        firebaseUserId: String,
        firebaseEmail: String,
    ): Boolean = withContext(Dispatchers.IO) {
        PendingRegistrationStore.clearForFirebaseOwner(
            context = applicationContext,
            firebaseUserId = firebaseUserId,
            firebaseEmail = firebaseEmail,
        )
    }
}

private object ProductionEmailVerificationPushRegistrar : EmailVerificationPushRegistrar {
    override suspend fun register(
        backendUserId: String,
        workspaceId: String,
    ): Boolean {
        return SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated(
            userId = backendUserId,
            workspaceId = workspaceId,
        )
    }
}

class ProductionEmailVerificationRepository internal constructor(
    fallbackAccountType: String,
    private val expectedOwner: FirebaseOwnerBinding,
    private val firebaseSession: EmailVerificationFirebaseSession,
    private val backend: EmailVerificationBackend,
    private val registrationStore: EmailVerificationRegistrationStore,
    private val pushRegistrar: EmailVerificationPushRegistrar,
) : EmailVerificationRepository {
    constructor(
        context: Context,
        fallbackAccountType: String,
        expectedOwner: FirebaseOwnerBinding,
    ) : this(
        fallbackAccountType = fallbackAccountType,
        expectedOwner = expectedOwner,
        firebaseSession = DefaultEmailVerificationFirebaseSession,
        backend = ProductionEmailVerificationBackend(),
        registrationStore = ProductionEmailVerificationRegistrationStore(context),
        pushRegistrar = ProductionEmailVerificationPushRegistrar,
    )

    private val expectedFirebaseUserId = expectedOwner.firebaseUserId
    private val expectedEmail = expectedOwner.email
    private val fallbackAccountType = normalizeEmailVerificationAccountType(
        fallbackAccountType,
    )

    override val session = EmailVerificationSession(
        email = expectedEmail,
        fallbackAccountType = this.fallbackAccountType,
    )

    override suspend fun checkStatus(): EmailVerificationCheckResult {
        return protectAuthority {
            requireExpectedOwner()
            val verified = firebaseSession.reloadCurrentUser(expectedOwner)
            requireExpectedOwner()
            if (!verified) {
                EmailVerificationCheckResult.Pending
            } else {
                completeVerifiedAccount()
            }
        }
    }

    override suspend fun resend(): EmailVerificationResendOutcome {
        return protectAuthority {
            requireExpectedOwner()
            val alreadyVerified = firebaseSession.reloadCurrentUser(expectedOwner)
            requireExpectedOwner()
            if (alreadyVerified) {
                val verified = completeVerifiedAccount()
                EmailVerificationResendOutcome.Verified(
                    accountType = verified.accountType,
                    firebaseOwner = verified.firebaseOwner,
                )
            } else {
                firebaseSession.sendEmailVerification(expectedOwner)
                requireExpectedOwner()
                EmailVerificationResendOutcome.Sent
            }
        }
    }

    private suspend fun completeVerifiedAccount(): EmailVerificationCheckResult.Verified {
        val registration = registrationStore.loadForOwner(
            firebaseUserId = expectedFirebaseUserId,
            firebaseEmail = expectedEmail,
        )
        requireExpectedOwner()
        registration?.requireOwnedCheckpoint()

        val expectedAuthSessionEpoch = backend.currentAuthSessionEpoch()
        val idToken = firebaseSession.getFreshIdToken(
            expectedOwner = expectedOwner,
            forceRefresh = true,
        )
        requireExpectedOwner()
        if (idToken.isBlank()) {
            throw EmailVerificationContractException(
                "Firebase không trả về token xác thực hợp lệ.",
            )
        }

        val authenticatedUser = backend.authenticateFirebase(
            idToken = idToken,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        requireExpectedOwner()
        authenticatedUser.requireVerifiedOwner()

        val finalUser = when {
            registration == null -> {
                authenticatedUser.requireExistingRole(fallbackAccountType)
                authenticatedUser
            }

            authenticatedUser.hasConfirmedRoleFor(registration) -> authenticatedUser

            authenticatedUser.role != "patient" -> {
                throw EmailVerificationContractException(
                    "Vai trò hiện tại không thể dùng quy trình tự gửi yêu cầu quyền.",
                )
            }

            else -> {
                val roleReceipt = backend.requestRole(
                    registration = registration,
                    idempotencyKey = registration.roleRequestIdempotencyKey,
                )
                requireExpectedOwner()
                roleReceipt.requireRoleReceipt(
                    authenticatedUser = authenticatedUser,
                    registration = registration,
                )
                roleReceipt
            }
        }

        val expectedWorkspaceId = registration
            ?.organizationId
            ?.trim()
            ?.takeIf(String::isNotBlank)
        val hasCoherentAuthority = if (
            finalUser.requestedRole == "doctor" &&
            finalUser.roleRequestStatus in DOCTOR_REQUEST_AUTHORITY_STATUSES
        ) {
            finalUser.hasActiveCoherentDoctorRequestAuthority(
                expectedTargetWorkspaceId = expectedWorkspaceId
                    ?: finalUser.organizationId,
                expectedCurrentWorkspaceId = authenticatedUser.canonicalWorkspaceId(),
            )
        } else {
            finalUser.hasActiveCoherentWorkspaceAuthority(expectedWorkspaceId)
        }
        if (!hasCoherentAuthority) {
            throw EmailVerificationContractException(
                "Backend trả về workspace hoặc membership không thuộc phiên tài khoản hiện tại.",
            )
        }

        val workspaceId = finalUser.canonicalWorkspaceId()
        if (workspaceId.isNotBlank()) {
            try {
                pushRegistrar.register(
                    backendUserId = finalUser.id,
                    workspaceId = workspaceId,
                )
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                // Push registration has its own bounded retry path and cannot
                // manufacture verification success for this workflow.
            }
            requireExpectedOwner()
        }

        if (registration != null) {
            val cleared = registrationStore.clearForOwner(
                firebaseUserId = expectedFirebaseUserId,
                firebaseEmail = expectedEmail,
            )
            requireExpectedOwner()
            if (!cleared) {
                throw EmailVerificationContractException(
                    "Không thể xác nhận đã dọn checkpoint đăng ký của tài khoản hiện tại.",
                )
            }
        }

        requireExpectedOwner()
        return EmailVerificationCheckResult.Verified(
            accountType = finalUser.resolvedAccountType(
                preferredAccountType = registration?.accountType ?: fallbackAccountType,
            ),
            firebaseOwner = expectedOwner,
        )
    }

    private inline fun <T> protectAuthority(block: () -> T): T {
        return try {
            block()
        } catch (error: Throwable) {
            if (error is CancellationException) {
                if (!hasExpectedOwner()) backend.clearOwnedAuthorization()
                throw error
            }
            if (!hasExpectedOwner()) {
                backend.clearOwnedAuthorization()
                throw EmailVerificationOwnerChangedException(error)
            }
            if (
                error is EmailVerificationOwnerChangedException ||
                error is EmailVerificationContractException
            ) {
                backend.clearOwnedAuthorization()
            }
            throw error
        }
    }

    private fun requireExpectedOwner() {
        if (!hasExpectedOwner()) {
            throw EmailVerificationOwnerChangedException()
        }
    }

    private fun hasExpectedOwner(): Boolean {
        return expectedFirebaseUserId.isNotBlank() &&
            expectedEmail.isNotBlank() &&
            firebaseSession.currentOwnerBindingOrNull() == expectedOwner
    }

    private fun PendingRegistration.requireOwnedCheckpoint() {
        if (
            firebaseUserId.trim() != expectedFirebaseUserId ||
            normalizePendingRegistrationEmail(email) != expectedEmail ||
            roleRequestIdempotencyKey.trim().length !in 8..160
        ) {
            throw EmailVerificationContractException(
                "Checkpoint đăng ký không thuộc phiên Firebase hiện tại.",
            )
        }
    }

    private fun AuthUser.requireVerifiedOwner() {
        if (
            id.isBlank() ||
            id.length > 160 ||
            firebaseUid.trim() != expectedFirebaseUserId ||
            normalizePendingRegistrationEmail(email) != expectedEmail ||
            !verifiedEmail ||
            !accountStatus.equals("active", ignoreCase = true) ||
            !deletedAt.isNullOrBlank()
        ) {
            throw EmailVerificationContractException(
                "Backend trả về tài khoản không khớp phiên Firebase đã xác thực.",
            )
        }
    }

    private fun AuthUser.requireRoleReceipt(
        authenticatedUser: AuthUser,
        registration: PendingRegistration,
    ) {
        requireVerifiedOwner()
        val expectedRole = registration.requestedRole()
        val validLifecycle = when (expectedRole) {
            "patient" ->
                role == "patient" &&
                    requestedRole == "patient" &&
                    roleRequestStatus == "approved"

            "doctor" ->
                requestedRole == "doctor" &&
                    roleRequestStatus in setOf(
                        "pending",
                        "needs_info",
                        "approved",
                        "rejected",
                    ) &&
                    when (roleRequestStatus) {
                        "approved" -> role == "doctor"
                        else -> role == "patient"
                    }

            else -> false
        }
        val hasCoherentAuthority = when (expectedRole) {
            "doctor" -> hasActiveCoherentDoctorRequestAuthority(
                expectedTargetWorkspaceId = registration.organizationId,
                expectedCurrentWorkspaceId = authenticatedUser.canonicalWorkspaceId(),
            )
            else -> hasActiveCoherentWorkspaceAuthority(
                registration.organizationId.trim().takeIf(String::isNotBlank),
            )
        }
        if (
            id != authenticatedUser.id ||
            firebaseUid != authenticatedUser.firebaseUid ||
            normalizePendingRegistrationEmail(email) !=
            normalizePendingRegistrationEmail(authenticatedUser.email) ||
            normalizeEmailVerificationAccountType(accountType) !=
            normalizeEmailVerificationAccountType(registration.accountType) ||
            workspaceType.trim() != registration.workspaceTypeForRoleRequest() ||
            !hasCoherentAuthority ||
            !validLifecycle
        ) {
            throw EmailVerificationContractException(
                "Backend trả về biên nhận vai trò không thuộc tài khoản hiện tại.",
            )
        }
    }

    private fun AuthUser.hasConfirmedRoleFor(
        registration: PendingRegistration,
    ): Boolean {
        val expectedRole = registration.requestedRole()
        val roleMatches = when (expectedRole) {
            "patient" ->
                role == "patient" &&
                    requestedRole == "patient" &&
                    roleRequestStatus == "approved"

            "doctor" ->
                role == "doctor" &&
                    requestedRole == "doctor" &&
                    roleRequestStatus == "approved"

            else -> false
        }
        val hasCoherentAuthority = when (expectedRole) {
            "doctor" -> hasActiveCoherentDoctorRequestAuthority(
                expectedTargetWorkspaceId = registration.organizationId,
                expectedCurrentWorkspaceId = canonicalWorkspaceId(),
            )
            else -> hasActiveCoherentWorkspaceAuthority(
                registration.organizationId.trim().takeIf(String::isNotBlank),
            )
        }
        return roleMatches &&
            normalizeEmailVerificationAccountType(accountType) ==
            normalizeEmailVerificationAccountType(registration.accountType) &&
            workspaceType.trim() == registration.workspaceTypeForRoleRequest() &&
            hasCoherentAuthority
    }

    private fun AuthUser.requireExistingRole(accountType: String) {
        val allowed = when (accountType) {
            "doctor", "solo_doctor" ->
                role in setOf("doctor", "admin") ||
                    (
                        requestedRole == "doctor" &&
                            roleRequestStatus in setOf("pending", "needs_info")
                        )

            else -> role == "patient"
        }
        if (!allowed) {
            throw EmailVerificationContractException(
                "Vai trò backend không khớp loại tài khoản đang xác thực.",
            )
        }
    }
}

internal interface EmailVerificationCooldownClock {
    fun elapsedRealtimeMillis(): Long

    suspend fun delayMillis(durationMillis: Long)
}

private object SystemEmailVerificationCooldownClock : EmailVerificationCooldownClock {
    override fun elapsedRealtimeMillis(): Long = SystemClock.elapsedRealtime()

    override suspend fun delayMillis(durationMillis: Long) {
        delay(durationMillis)
    }
}

class EmailVerificationViewModel internal constructor(
    private val repository: EmailVerificationRepository,
    private val resendCooldownSeconds: Int = 60,
    private val cooldownClock: EmailVerificationCooldownClock =
        SystemEmailVerificationCooldownClock,
) : ViewModel() {
    private val operationInFlight = AtomicBoolean(false)
    private var cooldownJob: Job? = null
    private val _uiState = MutableStateFlow(
        EmailVerificationUiState(email = repository.session.email),
    )
    private val _effects = Channel<EmailVerificationUiEffect>(Channel.BUFFERED)

    val uiState: StateFlow<EmailVerificationUiState> = _uiState.asStateFlow()
    val effects: Flow<EmailVerificationUiEffect> = _effects.receiveAsFlow()

    fun onAction(action: EmailVerificationUiAction) {
        when (action) {
            EmailVerificationUiAction.CheckStatus -> checkStatus()
            EmailVerificationUiAction.Resend -> resend()
            EmailVerificationUiAction.BackRequested -> {
                if (!operationInFlight.get() && !_uiState.value.isVerified) {
                    _effects.trySend(EmailVerificationUiEffect.NavigateBack)
                }
            }
        }
    }

    private fun checkStatus() {
        if (_uiState.value.isVerified || !operationInFlight.compareAndSet(false, true)) {
            return
        }
        _uiState.update {
            it.copy(
                isChecking = true,
                infoMessage = "",
                errorMessage = "",
            )
        }
        viewModelScope.launch {
            try {
                when (val result = repository.checkStatus()) {
                    EmailVerificationCheckResult.Pending -> {
                        _uiState.update {
                            it.copy(
                                infoMessage =
                                    "Email chưa được xác thực. Vui lòng kiểm tra hộp thư rồi thử lại.",
                            )
                        }
                    }

                    is EmailVerificationCheckResult.Verified -> {
                        completeVerification(
                            accountType = result.accountType,
                            firebaseOwner = result.firebaseOwner,
                        )
                    }
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                _uiState.update {
                    it.copy(
                        errorMessage = error.toVietnameseMessage(
                            "Không thể kiểm tra trạng thái xác thực email.",
                        ),
                    )
                }
            } finally {
                operationInFlight.set(false)
                _uiState.update { it.copy(isChecking = false) }
            }
        }
    }

    private fun resend() {
        val state = _uiState.value
        if (
            state.isVerified ||
            state.resendCooldownSeconds > 0 ||
            !operationInFlight.compareAndSet(false, true)
        ) {
            return
        }
        _uiState.update {
            it.copy(
                isResending = true,
                infoMessage = "",
                errorMessage = "",
            )
        }
        viewModelScope.launch {
            try {
                when (val result = repository.resend()) {
                    EmailVerificationResendOutcome.Sent -> {
                        _uiState.update {
                            it.copy(infoMessage = "Email xác thực đã được gửi lại.")
                        }
                        startCooldown()
                    }

                    is EmailVerificationResendOutcome.Verified -> {
                        completeVerification(
                            accountType = result.accountType,
                            firebaseOwner = result.firebaseOwner,
                        )
                    }
                }
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                _uiState.update {
                    it.copy(
                        errorMessage = error.toVietnameseMessage(
                            "Không thể gửi lại email xác thực.",
                        ),
                    )
                }
            } finally {
                operationInFlight.set(false)
                _uiState.update { it.copy(isResending = false) }
            }
        }
    }

    private suspend fun completeVerification(
        accountType: String,
        firebaseOwner: FirebaseOwnerBinding,
    ) {
        val normalizedAccountType = normalizeEmailVerificationAccountType(accountType)
        cooldownJob?.cancel()
        _uiState.update {
            it.copy(
                isVerified = true,
                verifiedAccountType = normalizedAccountType,
                infoMessage = "",
                errorMessage = "",
                resendCooldownSeconds = 0,
            )
        }
        _effects.send(
            EmailVerificationUiEffect.Verified(
                accountType = normalizedAccountType,
                firebaseOwner = firebaseOwner,
            ),
        )
    }

    private fun startCooldown() {
        cooldownJob?.cancel()
        if (resendCooldownSeconds <= 0) {
            _uiState.update { it.copy(resendCooldownSeconds = 0) }
            return
        }
        val deadlineMillis = cooldownClock.elapsedRealtimeMillis() +
            resendCooldownSeconds * 1_000L
        _uiState.update {
            it.copy(resendCooldownSeconds = resendCooldownSeconds)
        }
        cooldownJob = viewModelScope.launch {
            while (true) {
                val remainingMillis =
                    (deadlineMillis - cooldownClock.elapsedRealtimeMillis())
                        .coerceAtLeast(0L)
                val remainingSeconds = ceil(remainingMillis / 1_000.0).toInt()
                _uiState.update {
                    it.copy(resendCooldownSeconds = remainingSeconds)
                }
                if (remainingMillis == 0L) break
                cooldownClock.delayMillis(minOf(1_000L, remainingMillis))
            }
        }
    }
}

class EmailVerificationViewModelFactory(
    context: Context,
    fallbackAccountType: String,
    firebaseOwner: FirebaseOwnerBinding,
) : ViewModelProvider.Factory {
    private val applicationContext = context.applicationContext
    private val fallbackAccountType = fallbackAccountType
    private val firebaseOwner = firebaseOwner

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(EmailVerificationViewModel::class.java)) {
            "Unsupported ViewModel type: ${modelClass.name}"
        }
        return EmailVerificationViewModel(
            repository = ProductionEmailVerificationRepository(
                context = applicationContext,
                fallbackAccountType = fallbackAccountType,
                expectedOwner = firebaseOwner,
            ),
        ) as T
    }
}

private fun PendingRegistration.requestedRole(): String =
    if (accountType in setOf("doctor", "solo_doctor")) "doctor" else "patient"

private fun PendingRegistration.workspaceTypeForRoleRequest(): String =
    when (accountType) {
        "solo_doctor" -> "solo_practice"
        "doctor" -> "clinic"
        else -> "personal"
    }

private fun AuthUser.resolvedAccountType(preferredAccountType: String): String {
    val backendAccountType = normalizeEmailVerificationAccountType(accountType)
    return when {
        accountType in setOf("personal", "doctor", "solo_doctor") -> backendAccountType
        preferredAccountType in setOf("personal", "doctor", "solo_doctor") ->
            preferredAccountType

        role in setOf("doctor", "admin") -> "doctor"
        else -> "personal"
    }
}

private fun normalizeEmailVerificationAccountType(value: String): String =
    when (value.trim().lowercase()) {
        "doctor" -> "doctor"
        "solo_doctor" -> "solo_doctor"
        "personal", "patient" -> "personal"
        else -> "personal"
    }
