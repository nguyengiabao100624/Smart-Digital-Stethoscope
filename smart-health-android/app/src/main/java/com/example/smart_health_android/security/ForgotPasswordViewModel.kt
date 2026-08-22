package com.example.smart_health_android.security

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.normalizePendingRegistrationEmail
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuthException
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ForgotPasswordError {
    InvalidEmail,
    Offline,
    RateLimited,
    SessionChanged,
    ServiceUnavailable,
    Unconfirmed,
    Unknown,
}

data class ForgotPasswordUiState(
    val email: String = "",
    val sentEmail: String = "",
    val isSubmitting: Boolean = false,
    val emailError: ForgotPasswordError? = null,
    val requestError: ForgotPasswordError? = null,
)

sealed interface ForgotPasswordUiAction {
    data class EmailChanged(val value: String) : ForgotPasswordUiAction
    data object Submit : ForgotPasswordUiAction
    data object NavigateToLogin : ForgotPasswordUiAction
}

sealed interface ForgotPasswordUiEffect {
    data object NavigateToLogin : ForgotPasswordUiEffect
}

data class ForgotPasswordAuthoritySnapshot(
    val firebaseOwner: FirebaseOwnerBinding?,
    val backendSessionEpoch: Long,
)

data class ForgotPasswordResetReceipt(
    val email: String,
    val authority: ForgotPasswordAuthoritySnapshot,
) {
    fun confirms(
        expectedEmail: String,
        expectedAuthority: ForgotPasswordAuthoritySnapshot,
    ): Boolean = normalizePendingRegistrationEmail(email) == expectedEmail &&
        authority == expectedAuthority
}

class ForgotPasswordRequestException(
    val error: ForgotPasswordError,
    cause: Throwable? = null,
) : Exception(error.name, cause)

interface ForgotPasswordRepository {
    fun captureAuthority(): ForgotPasswordAuthoritySnapshot

    fun isCurrentAuthority(expected: ForgotPasswordAuthoritySnapshot): Boolean

    suspend fun requestPasswordReset(
        email: String,
        expectedAuthority: ForgotPasswordAuthoritySnapshot,
    ): ForgotPasswordResetReceipt
}

class FirebaseForgotPasswordRepository internal constructor(
    private val sendResetEmail: suspend (String) -> Unit =
        FirebaseAuthService::sendPasswordResetEmail,
    private val currentAuthority: () -> ForgotPasswordAuthoritySnapshot = {
        ForgotPasswordAuthoritySnapshot(
            firebaseOwner = FirebaseAuthService.currentOwnerBindingOrNull(),
            backendSessionEpoch = SmartHealthRepository.api.currentAuthSessionEpoch(),
        )
    },
) : ForgotPasswordRepository {
    override fun captureAuthority(): ForgotPasswordAuthoritySnapshot = currentAuthority()

    override fun isCurrentAuthority(expected: ForgotPasswordAuthoritySnapshot): Boolean =
        currentAuthority() == expected

    override suspend fun requestPasswordReset(
        email: String,
        expectedAuthority: ForgotPasswordAuthoritySnapshot,
    ): ForgotPasswordResetReceipt {
        requireCurrent(expectedAuthority)
        try {
            sendResetEmail(email)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Throwable) {
            // Older Firebase projects can still return USER_NOT_FOUND. Treat it like an accepted
            // request so this surface never becomes an account-enumeration oracle.
            if ((error as? FirebaseAuthException)?.errorCode != ERROR_USER_NOT_FOUND) {
                throw ForgotPasswordRequestException(error.toForgotPasswordError(), error)
            }
        }
        requireCurrent(expectedAuthority)
        return ForgotPasswordResetReceipt(
            email = email,
            authority = expectedAuthority,
        )
    }

    private fun requireCurrent(expected: ForgotPasswordAuthoritySnapshot) {
        if (!isCurrentAuthority(expected)) {
            throw ForgotPasswordRequestException(ForgotPasswordError.SessionChanged)
        }
    }

    private companion object {
        const val ERROR_USER_NOT_FOUND = "ERROR_USER_NOT_FOUND"
    }
}

class ForgotPasswordViewModel(
    private val repository: ForgotPasswordRepository = FirebaseForgotPasswordRepository(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(ForgotPasswordUiState())
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<ForgotPasswordUiEffect>(Channel.BUFFERED)
    val effects: Flow<ForgotPasswordUiEffect> = _effects.receiveAsFlow()

    private var requestJob: Job? = null
    private var navigationEmitted = false

    fun onAction(action: ForgotPasswordUiAction) {
        when (action) {
            is ForgotPasswordUiAction.EmailChanged -> changeEmail(action.value)
            ForgotPasswordUiAction.Submit -> submit()
            ForgotPasswordUiAction.NavigateToLogin -> navigateToLogin()
        }
    }

    private fun changeEmail(value: String) {
        val state = _uiState.value
        if (state.isSubmitting || state.sentEmail.isNotBlank()) return
        _uiState.update {
            it.copy(
                email = value,
                emailError = null,
                requestError = null,
            )
        }
    }

    private fun submit() {
        val state = _uiState.value
        if (state.isSubmitting || state.sentEmail.isNotBlank() || navigationEmitted) return

        val email = normalizePendingRegistrationEmail(state.email)
        if (!email.isValidResetEmail()) {
            _uiState.update {
                it.copy(
                    emailError = ForgotPasswordError.InvalidEmail,
                    requestError = null,
                )
            }
            return
        }

        val authority = try {
            repository.captureAuthority()
        } catch (error: Throwable) {
            _uiState.update {
                it.copy(
                    requestError = error.toForgotPasswordError(),
                    emailError = null,
                )
            }
            return
        }

        // This state transition intentionally happens before launch so two taps in the same main
        // thread turn cannot dispatch two provider requests.
        _uiState.update {
            it.copy(
                email = email,
                isSubmitting = true,
                emailError = null,
                requestError = null,
            )
        }
        requestJob = viewModelScope.launch {
            try {
                val receipt = repository.requestPasswordReset(email, authority)
                if (!repository.isCurrentAuthority(authority)) {
                    throw ForgotPasswordRequestException(ForgotPasswordError.SessionChanged)
                }
                if (!receipt.confirms(email, authority)) {
                    throw ForgotPasswordRequestException(ForgotPasswordError.Unconfirmed)
                }
                _uiState.update {
                    it.copy(
                        sentEmail = email,
                        isSubmitting = false,
                        emailError = null,
                        requestError = null,
                    )
                }
            } catch (cancelled: CancellationException) {
                _uiState.update { it.copy(isSubmitting = false) }
                throw cancelled
            } catch (error: Throwable) {
                val mappedError = when (error) {
                    is ForgotPasswordRequestException -> error.error
                    else -> error.toForgotPasswordError()
                }
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        emailError = mappedError.takeIf {
                            failure -> failure == ForgotPasswordError.InvalidEmail
                        },
                        requestError = mappedError.takeUnless {
                            failure -> failure == ForgotPasswordError.InvalidEmail
                        },
                    )
                }
            } finally {
                requestJob = null
            }
        }
    }

    private fun navigateToLogin() {
        if (navigationEmitted) return
        navigationEmitted = true
        requestJob?.cancel()
        _uiState.update { it.copy(isSubmitting = false) }
        _effects.trySend(ForgotPasswordUiEffect.NavigateToLogin)
    }

    private companion object {
        val EMAIL_PATTERN = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
        const val MAX_EMAIL_LENGTH = 254

        fun String.isValidResetEmail(): Boolean =
            length in 3..MAX_EMAIL_LENGTH && EMAIL_PATTERN.matches(this)
    }
}

private fun Throwable.toForgotPasswordError(): ForgotPasswordError = when {
    this is FirebaseTooManyRequestsException -> ForgotPasswordError.RateLimited
    this is FirebaseNetworkException || this is IOException -> ForgotPasswordError.Offline
    this is FirebaseAuthException -> when (errorCode) {
        "ERROR_INVALID_EMAIL",
        "ERROR_MISSING_EMAIL",
        -> ForgotPasswordError.InvalidEmail
        "ERROR_TOO_MANY_REQUESTS" -> ForgotPasswordError.RateLimited
        "ERROR_OPERATION_NOT_ALLOWED" -> ForgotPasswordError.ServiceUnavailable
        else -> ForgotPasswordError.Unknown
    }
    else -> ForgotPasswordError.Unknown
}
