package com.example.smart_health_android.security

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.PasswordChangeReceipt
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.notifications.SmartHealthNotificationCenter
import com.example.smart_health_android.notifications.SmartHealthNotificationSession
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ChangePasswordLoadState {
    Ready,
    PermissionDenied,
}

enum class ChangePasswordFieldError {
    Required,
    TooShort,
    MissingUppercase,
    MissingLowercase,
    MissingDigit,
    MatchesCurrent,
    ConfirmationMismatch,
}

enum class ChangePasswordFailure {
    None,
    Unconfirmed,
    Generic,
}

data class ChangePasswordFieldErrors(
    val currentPassword: ChangePasswordFieldError? = null,
    val newPassword: ChangePasswordFieldError? = null,
    val confirmPassword: ChangePasswordFieldError? = null,
) {
    val any: Boolean
        get() = currentPassword != null || newPassword != null || confirmPassword != null
}

data class ChangePasswordUiState(
    val loadState: ChangePasswordLoadState = ChangePasswordLoadState.Ready,
    val currentPassword: String = "",
    val newPassword: String = "",
    val confirmPassword: String = "",
    val showCurrentPassword: Boolean = false,
    val showNewPassword: Boolean = false,
    val showConfirmPassword: Boolean = false,
    val fieldErrors: ChangePasswordFieldErrors = ChangePasswordFieldErrors(),
    val isSubmitting: Boolean = false,
    val completed: Boolean = false,
    val failure: ChangePasswordFailure = ChangePasswordFailure.None,
    val errorMessage: String = "",
    val requestId: String = "",
    val canRetry: Boolean = false,
    val showDiscardConfirmation: Boolean = false,
    internal val idempotencyKey: String = "",
) {
    val hasUnsavedChanges: Boolean
        get() = currentPassword.isNotEmpty() ||
            newPassword.isNotEmpty() ||
            confirmPassword.isNotEmpty()
}

sealed interface ChangePasswordUiAction {
    data class CurrentPasswordChanged(val value: String) : ChangePasswordUiAction
    data class NewPasswordChanged(val value: String) : ChangePasswordUiAction
    data class ConfirmPasswordChanged(val value: String) : ChangePasswordUiAction
    data object ToggleCurrentPasswordVisibility : ChangePasswordUiAction
    data object ToggleNewPasswordVisibility : ChangePasswordUiAction
    data object ToggleConfirmPasswordVisibility : ChangePasswordUiAction
    data object Submit : ChangePasswordUiAction
    data object BackRequested : ChangePasswordUiAction
    data object DiscardConfirmed : ChangePasswordUiAction
    data object DiscardDismissed : ChangePasswordUiAction
    data object ForgotPasswordRequested : ChangePasswordUiAction
}

sealed interface ChangePasswordUiEffect {
    data object NavigateBack : ChangePasswordUiEffect
    data object OpenPasswordRecovery : ChangePasswordUiEffect
}

interface ChangePasswordRepository {
    suspend fun prepare(
        currentPassword: String,
        expectedFirebaseUserId: String,
        idempotencyKey: String,
    )

    suspend fun commit(
        expectedUserId: String,
        expectedFirebaseUserId: String,
        currentPassword: String,
        newPassword: String,
        idempotencyKey: String,
    ): PasswordChangeReceipt

    fun invalidateLocalSessionBinding()
}

internal interface PasswordChangeFirebaseSession {
    fun currentUserIdOrNull(): String?

    suspend fun reauthenticateWithPassword(password: String)

    suspend fun getFreshIdToken(forceRefresh: Boolean): String
}

private object DefaultPasswordChangeFirebaseSession : PasswordChangeFirebaseSession {
    override fun currentUserIdOrNull(): String? = FirebaseAuthService.currentUserIdOrNull()

    override suspend fun reauthenticateWithPassword(password: String) {
        FirebaseAuthService.reauthenticateWithPassword(password)
    }

    override suspend fun getFreshIdToken(forceRefresh: Boolean): String =
        FirebaseAuthService.getFreshIdToken(forceRefresh)
}

class ApiChangePasswordRepository internal constructor(
    private val api: SmartHealthApi,
    private val firebaseSession: PasswordChangeFirebaseSession,
    private val clearNotificationBinding: () -> Unit = {
        SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
            SmartHealthNotificationCenter.clearAllPostedNotifications()
        }
    },
) : ChangePasswordRepository {
    constructor(
        api: SmartHealthApi = SmartHealthRepository.api,
    ) : this(
        api = api,
        firebaseSession = DefaultPasswordChangeFirebaseSession,
    )

    private var preparedIdempotencyKey = ""
    private var ambiguousIntent: AmbiguousPasswordChangeIntent? = null

    override suspend fun prepare(
        currentPassword: String,
        expectedFirebaseUserId: String,
        idempotencyKey: String,
    ) {
        requireExpectedFirebaseUser(expectedFirebaseUserId)
        if (preparedIdempotencyKey == idempotencyKey) return
        try {
            firebaseSession.reauthenticateWithPassword(currentPassword)
            requireExpectedFirebaseUser(expectedFirebaseUserId)
            val refreshedToken = firebaseSession.getFreshIdToken(forceRefresh = true)
            requireExpectedFirebaseUser(expectedFirebaseUserId)
            api.setAuthToken(refreshedToken)
            requireExpectedFirebaseUser(expectedFirebaseUserId)
        } catch (error: Throwable) {
            if (error is ChangePasswordSessionInvalidatedException) throw error
            if (firebaseSession.currentUserIdOrNull() != expectedFirebaseUserId.trim()) {
                throw invalidateBoundSession(error)
            }
            throw error
        }
        preparedIdempotencyKey = idempotencyKey
    }

    override suspend fun commit(
        expectedUserId: String,
        expectedFirebaseUserId: String,
        currentPassword: String,
        newPassword: String,
        idempotencyKey: String,
    ): PasswordChangeReceipt {
        val intent = AmbiguousPasswordChangeIntent(
            idempotencyKey = idempotencyKey,
            fingerprint = passwordChangeIntentFingerprint(
                expectedUserId = expectedUserId,
                expectedFirebaseUserId = expectedFirebaseUserId,
                currentPassword = currentPassword,
                newPassword = newPassword,
                idempotencyKey = idempotencyKey,
            ),
        )
        requireExpectedFirebaseUser(expectedFirebaseUserId)
        val canRecoverRevokedToken =
            preparedIdempotencyKey == idempotencyKey &&
                ambiguousIntent == intent
        val receipt = try {
            commitOnce(
                expectedUserId = expectedUserId,
                currentPassword = currentPassword,
                newPassword = newPassword,
                idempotencyKey = idempotencyKey,
                deferRevokedAuthorizationInvalidation = canRecoverRevokedToken,
            )
        } catch (error: Throwable) {
            if (
                error !is SmartHealthApiException ||
                error.statusCode != 401 ||
                error.code != FIREBASE_ID_TOKEN_REVOKED ||
                !canRecoverRevokedToken
            ) {
                updateAmbiguousIntent(intent, error)
                throw error
            }
            try {
                recoverRevokedFirebaseSession(
                    expectedFirebaseUserId = expectedFirebaseUserId,
                    newPassword = newPassword,
                )
            } catch (recoveryError: Throwable) {
                clearIntentState()
                if (recoveryError is ChangePasswordSessionInvalidatedException) {
                    throw recoveryError
                }
                throw invalidateBoundSession(recoveryError)
            }
            try {
                commitOnce(
                    expectedUserId = expectedUserId,
                    currentPassword = currentPassword,
                    newPassword = newPassword,
                    idempotencyKey = idempotencyKey,
                    deferRevokedAuthorizationInvalidation = false,
                )
            } catch (replayError: Throwable) {
                updateAmbiguousIntent(intent, replayError)
                throw replayError
            }
        }
        if (receipt.confirmed) {
            try {
                requireExpectedFirebaseUser(expectedFirebaseUserId)
            } catch (error: ChangePasswordAuthorityMismatchException) {
                clearIntentState()
                throw error
            }
            clearIntentState()
        }
        return receipt
    }

    private suspend fun recoverRevokedFirebaseSession(
        expectedFirebaseUserId: String,
        newPassword: String,
    ) {
        requireExpectedFirebaseUser(expectedFirebaseUserId)
        firebaseSession.reauthenticateWithPassword(newPassword)
        requireExpectedFirebaseUser(expectedFirebaseUserId)
        val refreshedToken = firebaseSession.getFreshIdToken(forceRefresh = true)
        requireExpectedFirebaseUser(expectedFirebaseUserId)
        api.setAuthToken(refreshedToken)
        requireExpectedFirebaseUser(expectedFirebaseUserId)
    }

    private fun requireExpectedFirebaseUser(expectedFirebaseUserId: String) {
        if (firebaseSession.currentUserIdOrNull() != expectedFirebaseUserId.trim()) {
            throw invalidateBoundSession(ChangePasswordAuthorityMismatchException())
        }
    }

    override fun invalidateLocalSessionBinding() {
        clearIntentState()
        clearLocalSessionBinding()
    }

    private fun invalidateBoundSession(
        cause: Throwable,
    ): ChangePasswordSessionInvalidatedException {
        return ChangePasswordSessionInvalidatedException(cause).also { invalidation ->
            clearIntentState()
            clearLocalSessionBinding()?.let(invalidation::addSuppressed)
        }
    }

    private fun clearLocalSessionBinding(): Throwable? {
        api.setAuthToken(null)
        return runCatching(clearNotificationBinding).exceptionOrNull()
    }

    private fun updateAmbiguousIntent(
        intent: AmbiguousPasswordChangeIntent,
        error: Throwable,
    ) {
        ambiguousIntent = if (error.isAmbiguousPasswordChangeOutcome()) {
            intent
        } else {
            null
        }
    }

    private fun clearIntentState() {
        preparedIdempotencyKey = ""
        ambiguousIntent = null
    }

    private suspend fun commitOnce(
        expectedUserId: String,
        currentPassword: String,
        newPassword: String,
        idempotencyKey: String,
        deferRevokedAuthorizationInvalidation: Boolean,
    ): PasswordChangeReceipt = api.changePassword(
        expectedUserId = expectedUserId,
        currentPassword = currentPassword,
        newPassword = newPassword,
        idempotencyKey = idempotencyKey,
        deferRevokedAuthorizationInvalidation = deferRevokedAuthorizationInvalidation,
    )
}

class ChangePasswordViewModel(
    private val repository: ChangePasswordRepository,
    private val expectedAuthority: ChangePasswordAuthoritySnapshot?,
    private val currentAuthority: () -> ChangePasswordAuthoritySnapshot?,
    private val invalidateExpectedAuthority: () -> Unit,
    private val closeSession: suspend () -> Boolean,
    private val createIdempotencyKey: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(
        ChangePasswordUiState(
            loadState = if (expectedAuthority == null) {
                ChangePasswordLoadState.PermissionDenied
            } else {
                ChangePasswordLoadState.Ready
            },
        ),
    )
    val uiState: StateFlow<ChangePasswordUiState> = _uiState.asStateFlow()

    private val _effects = Channel<ChangePasswordUiEffect>(Channel.BUFFERED)
    val effects: Flow<ChangePasswordUiEffect> = _effects.receiveAsFlow()

    fun onAction(action: ChangePasswordUiAction) {
        when (action) {
            is ChangePasswordUiAction.CurrentPasswordChanged ->
                updateSecret(ChangePasswordSecretField.Current, action.value)
            is ChangePasswordUiAction.NewPasswordChanged ->
                updateSecret(ChangePasswordSecretField.New, action.value)
            is ChangePasswordUiAction.ConfirmPasswordChanged ->
                updateSecret(ChangePasswordSecretField.Confirmation, action.value)
            ChangePasswordUiAction.ToggleCurrentPasswordVisibility ->
                _uiState.update { it.copy(showCurrentPassword = !it.showCurrentPassword) }
            ChangePasswordUiAction.ToggleNewPasswordVisibility ->
                _uiState.update { it.copy(showNewPassword = !it.showNewPassword) }
            ChangePasswordUiAction.ToggleConfirmPasswordVisibility ->
                _uiState.update { it.copy(showConfirmPassword = !it.showConfirmPassword) }
            ChangePasswordUiAction.Submit -> submit()
            ChangePasswordUiAction.BackRequested -> requestBack()
            ChangePasswordUiAction.DiscardConfirmed -> {
                clearSecrets()
                _effects.trySend(ChangePasswordUiEffect.NavigateBack)
            }
            ChangePasswordUiAction.DiscardDismissed ->
                _uiState.update { it.copy(showDiscardConfirmation = false) }
            ChangePasswordUiAction.ForgotPasswordRequested ->
                _effects.trySend(ChangePasswordUiEffect.OpenPasswordRecovery)
        }
    }

    private fun updateSecret(field: ChangePasswordSecretField, value: String) {
        val state = _uiState.value
        if (
            state.loadState != ChangePasswordLoadState.Ready ||
            state.isSubmitting ||
            state.completed
        ) return
        _uiState.update {
            when (field) {
                ChangePasswordSecretField.Current -> it.copy(currentPassword = value)
                ChangePasswordSecretField.New -> it.copy(newPassword = value)
                ChangePasswordSecretField.Confirmation -> it.copy(confirmPassword = value)
            }.copy(
                fieldErrors = ChangePasswordFieldErrors(),
                failure = ChangePasswordFailure.None,
                errorMessage = "",
                requestId = "",
                canRetry = false,
                idempotencyKey = "",
            )
        }
    }

    private fun submit() {
        val state = _uiState.value
        val expected = expectedAuthority
        if (
            state.loadState != ChangePasswordLoadState.Ready ||
            state.isSubmitting ||
            state.completed ||
            expected == null
        ) return

        val errors = validatePasswords(state)
        if (errors.any) {
            _uiState.update {
                it.copy(
                    fieldErrors = errors,
                    failure = ChangePasswordFailure.None,
                    errorMessage = "",
                    requestId = "",
                    canRetry = false,
                )
            }
            return
        }

        val idempotencyKey = state.idempotencyKey.ifBlank(createIdempotencyKey)
        _uiState.update {
            it.copy(
                isSubmitting = true,
                fieldErrors = ChangePasswordFieldErrors(),
                failure = ChangePasswordFailure.None,
                errorMessage = "",
                requestId = "",
                canRetry = false,
                showDiscardConfirmation = false,
                idempotencyKey = idempotencyKey,
            )
        }

        viewModelScope.launch {
            try {
                requireCurrentAuthority(expected)
                repository.prepare(
                    currentPassword = state.currentPassword,
                    expectedFirebaseUserId = expected.firebaseUserId,
                    idempotencyKey = idempotencyKey,
                )
                requireCurrentAuthority(expected)
                val receipt = repository.commit(
                    expectedUserId = expected.userId,
                    expectedFirebaseUserId = expected.firebaseUserId,
                    currentPassword = state.currentPassword,
                    newPassword = state.newPassword,
                    idempotencyKey = idempotencyKey,
                )
                if (!receipt.confirmed || receipt.userId != expected.userId) {
                    throw UnconfirmedPasswordChangeException()
                }
                requireCurrentAuthority(expected)
                if (!closeSession()) {
                    throw ChangePasswordAuthorityMismatchException()
                }
                _uiState.update {
                    it.copy(
                        currentPassword = "",
                        newPassword = "",
                        confirmPassword = "",
                        showCurrentPassword = false,
                        showNewPassword = false,
                        showConfirmPassword = false,
                        isSubmitting = false,
                        completed = true,
                        failure = ChangePasswordFailure.None,
                        errorMessage = "",
                        requestId = "",
                        canRetry = false,
                        idempotencyKey = "",
                    )
                }
            } catch (_: ChangePasswordAuthorityMismatchException) {
                denyStaleAuthority()
            } catch (_: ChangePasswordSessionInvalidatedException) {
                denyStaleAuthority()
            } catch (_: UnconfirmedPasswordChangeException) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        completed = false,
                        failure = ChangePasswordFailure.Unconfirmed,
                        errorMessage = "",
                        requestId = "",
                        canRetry = true,
                    )
                }
            } catch (error: Throwable) {
                val apiError = error as? SmartHealthApiException
                if (apiError?.statusCode in setOf(401, 403)) {
                    denyStaleAuthority()
                } else {
                    _uiState.update {
                        it.copy(
                            isSubmitting = false,
                            completed = false,
                            failure = ChangePasswordFailure.Generic,
                            errorMessage = error.message.orEmpty(),
                            requestId = apiError?.requestId.orEmpty(),
                            canRetry = error is IOException ||
                                apiError?.statusCode?.let { it in 500..599 } == true,
                        )
                    }
                }
            }
        }
    }

    private fun requestBack() {
        val state = _uiState.value
        when {
            state.isSubmitting -> Unit
            state.hasUnsavedChanges ->
                _uiState.update { it.copy(showDiscardConfirmation = true) }
            else -> _effects.trySend(ChangePasswordUiEffect.NavigateBack)
        }
    }

    private fun requireCurrentAuthority(expected: ChangePasswordAuthoritySnapshot) {
        if (currentAuthority() != expected) {
            throw ChangePasswordAuthorityMismatchException()
        }
    }

    private fun denyStaleAuthority() {
        repository.invalidateLocalSessionBinding()
        invalidateExpectedAuthority()
        _uiState.value = ChangePasswordUiState(
            loadState = ChangePasswordLoadState.PermissionDenied,
        )
    }

    private fun clearSecrets() {
        _uiState.value = _uiState.value.copy(
            currentPassword = "",
            newPassword = "",
            confirmPassword = "",
            showCurrentPassword = false,
            showNewPassword = false,
            showConfirmPassword = false,
            fieldErrors = ChangePasswordFieldErrors(),
            failure = ChangePasswordFailure.None,
            errorMessage = "",
            requestId = "",
            canRetry = false,
            showDiscardConfirmation = false,
            idempotencyKey = "",
        )
    }
}

class ChangePasswordViewModelFactory(
    private val expectedAuthority: ChangePasswordAuthoritySnapshot?,
    private val currentAuthority: () -> ChangePasswordAuthoritySnapshot?,
    private val invalidateExpectedAuthority: () -> Unit,
    private val closeSession: suspend () -> Boolean,
    private val repository: ChangePasswordRepository = ApiChangePasswordRepository(),
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(ChangePasswordViewModel::class.java))
        return ChangePasswordViewModel(
            repository = repository,
            expectedAuthority = expectedAuthority,
            currentAuthority = currentAuthority,
            invalidateExpectedAuthority = invalidateExpectedAuthority,
            closeSession = closeSession,
        ) as T
    }
}

private enum class ChangePasswordSecretField {
    Current,
    New,
    Confirmation,
}

private data class AmbiguousPasswordChangeIntent(
    val idempotencyKey: String,
    val fingerprint: String,
)

private const val FIREBASE_ID_TOKEN_REVOKED = "FIREBASE_ID_TOKEN_REVOKED"
private val AMBIGUOUS_PASSWORD_CHANGE_STATUS_CODES = setOf(408, 425, 429)

internal class ChangePasswordSessionInvalidatedException(
    cause: Throwable,
) : SecurityException(
    "Password-change recovery could not restore the bound Firebase session.",
    cause,
)

private class ChangePasswordAuthorityMismatchException : SecurityException()
private class UnconfirmedPasswordChangeException : IllegalStateException()

private fun Throwable.isAmbiguousPasswordChangeOutcome(): Boolean = when (this) {
    is SmartHealthApiException ->
        statusCode in AMBIGUOUS_PASSWORD_CHANGE_STATUS_CODES || statusCode in 500..599
    is IOException -> true
    else -> false
}

private fun passwordChangeIntentFingerprint(
    expectedUserId: String,
    expectedFirebaseUserId: String,
    currentPassword: String,
    newPassword: String,
    idempotencyKey: String,
): String {
    val digest = MessageDigest.getInstance("SHA-256")
    listOf(
        expectedUserId,
        expectedFirebaseUserId,
        currentPassword,
        newPassword,
        idempotencyKey,
    ).forEach { value ->
        val bytes = value.toByteArray(StandardCharsets.UTF_8)
        digest.update(ByteBuffer.allocate(Int.SIZE_BYTES).putInt(bytes.size).array())
        digest.update(bytes)
    }
    return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }
}

private fun validatePasswords(state: ChangePasswordUiState): ChangePasswordFieldErrors {
    val currentError = when {
        state.currentPassword.isEmpty() -> ChangePasswordFieldError.Required
        else -> null
    }
    val newError = when {
        state.newPassword.length < 8 -> ChangePasswordFieldError.TooShort
        state.newPassword.none(Char::isUpperCase) -> ChangePasswordFieldError.MissingUppercase
        state.newPassword.none(Char::isLowerCase) -> ChangePasswordFieldError.MissingLowercase
        state.newPassword.none(Char::isDigit) -> ChangePasswordFieldError.MissingDigit
        state.newPassword == state.currentPassword -> ChangePasswordFieldError.MatchesCurrent
        else -> null
    }
    val confirmationError = when {
        state.confirmPassword.isEmpty() -> ChangePasswordFieldError.Required
        state.newPassword != state.confirmPassword ->
            ChangePasswordFieldError.ConfirmationMismatch
        else -> null
    }
    return ChangePasswordFieldErrors(
        currentPassword = currentError,
        newPassword = newError,
        confirmPassword = confirmationError,
    )
}
