package com.example.smart_health_android.security

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update

@ConsistentCopyVisibility
data class BiometricLocalUnlockAuthority private constructor(
    val backendUserId: String,
    val firebaseUserId: String,
    val workspaceId: String,
    val authorityEpoch: Long,
    val backendSessionEpoch: Long,
    val firebaseOwnerSessionEpoch: Long,
) {
    companion object {
        fun create(
            backendUserId: String,
            firebaseUserId: String,
            workspaceId: String,
            authorityEpoch: Long,
            backendSessionEpoch: Long,
            firebaseOwnerSessionEpoch: Long,
        ): BiometricLocalUnlockAuthority {
            val normalizedBackendUserId = backendUserId.trim()
            val normalizedFirebaseUserId = firebaseUserId.trim()
            val normalizedWorkspaceId = workspaceId.trim()
            require(normalizedBackendUserId.isNotBlank()) {
                "Biometric local unlock requires a backend user id."
            }
            require(normalizedFirebaseUserId.isNotBlank()) {
                "Biometric local unlock requires a Firebase owner id."
            }
            require(normalizedWorkspaceId.isNotBlank()) {
                "Biometric local unlock requires an active workspace id."
            }
            require(authorityEpoch > 0L) {
                "Biometric local unlock requires a positive authority epoch."
            }
            require(backendSessionEpoch > 0L) {
                "Biometric local unlock requires a positive backend session epoch."
            }
            require(firebaseOwnerSessionEpoch > 0L) {
                "Biometric local unlock requires a positive Firebase owner session epoch."
            }
            return BiometricLocalUnlockAuthority(
                backendUserId = normalizedBackendUserId,
                firebaseUserId = normalizedFirebaseUserId,
                workspaceId = normalizedWorkspaceId,
                authorityEpoch = authorityEpoch,
                backendSessionEpoch = backendSessionEpoch,
                firebaseOwnerSessionEpoch = firebaseOwnerSessionEpoch,
            )
        }
    }
}

enum class BiometricLocalUnlockAvailability {
    Available,
    NoHardware,
    NoneEnrolled,
    TemporarilyUnavailable,
    SecurityUpdateRequired,
    Unsupported,
    Unknown,
}

enum class BiometricLocalUnlockOperation {
    Enable,
    Unlock,
    Disable,
}

enum class BiometricLocalUnlockError {
    AuthorityChanged,
    AuthenticationCancelled,
    AuthenticationFailed,
    KeyInvalidated,
    StorageFailure,
    RuntimeUnavailable,
}

data class BiometricLocalUnlockPromptRequest(
    val requestId: String,
    val operation: BiometricLocalUnlockOperation,
)

sealed interface BiometricLocalUnlockPreparation {
    data class Ready(
        val request: BiometricLocalUnlockPromptRequest,
    ) : BiometricLocalUnlockPreparation

    data class Failed(
        val error: BiometricLocalUnlockError,
    ) : BiometricLocalUnlockPreparation
}

enum class BiometricLocalUnlockCompletion {
    Success,
    AuthorityMismatch,
    KeyInvalidated,
    StorageFailure,
}

interface BiometricLocalUnlockRepository {
    fun availability(): BiometricLocalUnlockAvailability

    fun hasConfiguration(): Boolean

    fun prepare(
        operation: BiometricLocalUnlockOperation,
        authority: BiometricLocalUnlockAuthority,
    ): BiometricLocalUnlockPreparation

    fun complete(requestId: String): BiometricLocalUnlockCompletion

    fun cancel(requestId: String)

    fun clear(): Boolean
}

data class BiometricLocalUnlockUiState(
    val availability: BiometricLocalUnlockAvailability,
    val configured: Boolean,
    val locked: Boolean,
    val hasBoundAuthority: Boolean = false,
    val promptInFlight: Boolean = false,
    val activeOperation: BiometricLocalUnlockOperation? = null,
    val error: BiometricLocalUnlockError? = null,
    val terminationRequired: Boolean = false,
) {
    val protectedContentAllowed: Boolean
        get() = !hasBoundAuthority || !locked

    val showSettingsControl: Boolean
        get() = hasBoundAuthority &&
            availability == BiometricLocalUnlockAvailability.Available &&
            !terminationRequired
}

sealed interface BiometricLocalUnlockUiAction {
    data class AuthorityObserved(
        val authority: BiometricLocalUnlockAuthority?,
    ) : BiometricLocalUnlockUiAction

    data object EnableRequested : BiometricLocalUnlockUiAction
    data object DisableRequested : BiometricLocalUnlockUiAction
    data object UnlockRequested : BiometricLocalUnlockUiAction
    data object AppBackgrounded : BiometricLocalUnlockUiAction
    data object AppForegrounded : BiometricLocalUnlockUiAction
    data object SignOutRequested : BiometricLocalUnlockUiAction

    data class PromptAuthenticated(
        val requestId: String,
    ) : BiometricLocalUnlockUiAction

    data class PromptFailed(
        val requestId: String,
        val error: BiometricLocalUnlockError,
    ) : BiometricLocalUnlockUiAction
}

sealed interface BiometricLocalUnlockUiEffect {
    data class LaunchPrompt(
        val request: BiometricLocalUnlockPromptRequest,
    ) : BiometricLocalUnlockUiEffect

    data class CancelPrompt(
        val requestId: String,
    ) : BiometricLocalUnlockUiEffect

    data class TerminateSession(
        val authority: BiometricLocalUnlockAuthority,
    ) : BiometricLocalUnlockUiEffect
}

class BiometricLocalUnlockViewModel(
    private val repository: BiometricLocalUnlockRepository,
) : ViewModel() {
    private val configuredAtStart = repository.hasConfiguration()
    private val _uiState = MutableStateFlow(
        BiometricLocalUnlockUiState(
            availability = repository.availability(),
            configured = configuredAtStart,
            locked = configuredAtStart,
        ),
    )
    val uiState: StateFlow<BiometricLocalUnlockUiState> = _uiState.asStateFlow()

    private val _effects = Channel<BiometricLocalUnlockUiEffect>(Channel.BUFFERED)
    val effects: Flow<BiometricLocalUnlockUiEffect> = _effects.receiveAsFlow()

    private var authority: BiometricLocalUnlockAuthority? = null
    private var pendingRequest: BiometricLocalUnlockPromptRequest? = null

    fun onAction(action: BiometricLocalUnlockUiAction) {
        when (action) {
            is BiometricLocalUnlockUiAction.AuthorityObserved -> observeAuthority(action.authority)
            BiometricLocalUnlockUiAction.EnableRequested -> requestEnable()
            BiometricLocalUnlockUiAction.DisableRequested -> requestDisable()
            BiometricLocalUnlockUiAction.UnlockRequested -> requestUnlock()
            BiometricLocalUnlockUiAction.AppBackgrounded -> onBackgrounded()
            BiometricLocalUnlockUiAction.AppForegrounded -> onForegrounded()
            BiometricLocalUnlockUiAction.SignOutRequested -> requireSessionTermination()
            is BiometricLocalUnlockUiAction.PromptAuthenticated ->
                onPromptAuthenticated(action.requestId)
            is BiometricLocalUnlockUiAction.PromptFailed ->
                onPromptFailed(action.requestId, action.error)
        }
    }

    @Synchronized
    fun isBoundTo(observed: BiometricLocalUnlockAuthority?): Boolean =
        observed != null && authority == observed

    private fun observeAuthority(observed: BiometricLocalUnlockAuthority?) {
        val previous = authority
        if (observed == previous) return

        if (observed == null) {
            if (previous != null) {
                cancelPendingPrompt()
                repository.clear()
            }
            authority = null
            _uiState.value = BiometricLocalUnlockUiState(
                availability = repository.availability(),
                configured = false,
                locked = false,
            )
            return
        }

        if (previous != null) {
            cancelPendingPrompt()
            repository.clear()
            authority = observed
            _uiState.value = BiometricLocalUnlockUiState(
                availability = repository.availability(),
                configured = false,
                locked = true,
                hasBoundAuthority = true,
                error = BiometricLocalUnlockError.AuthorityChanged,
                terminationRequired = true,
            )
            _effects.trySend(BiometricLocalUnlockUiEffect.TerminateSession(observed))
            return
        }

        authority = observed
        _uiState.update { current ->
            current.copy(
                availability = repository.availability(),
                hasBoundAuthority = true,
                locked = current.configured,
                error = null,
                terminationRequired = false,
            )
        }
        if (_uiState.value.configured) requestUnlock()
    }

    private fun requestEnable() {
        val current = _uiState.value
        if (
            current.configured ||
            !current.showSettingsControl ||
            current.promptInFlight ||
            current.locked
        ) {
            return
        }
        preparePrompt(BiometricLocalUnlockOperation.Enable)
    }

    private fun requestDisable() {
        val current = _uiState.value
        if (
            !current.configured ||
            !current.showSettingsControl ||
            current.promptInFlight ||
            current.locked
        ) {
            return
        }
        preparePrompt(BiometricLocalUnlockOperation.Disable)
    }

    private fun requestUnlock() {
        val current = _uiState.value
        if (
            !current.configured ||
            !current.hasBoundAuthority ||
            !current.locked ||
            current.promptInFlight ||
            current.terminationRequired
        ) {
            return
        }
        preparePrompt(BiometricLocalUnlockOperation.Unlock)
    }

    private fun preparePrompt(operation: BiometricLocalUnlockOperation) {
        val expectedAuthority = authority ?: return
        if (_uiState.value.availability != BiometricLocalUnlockAvailability.Available) {
            _uiState.update { it.copy(error = BiometricLocalUnlockError.RuntimeUnavailable) }
            return
        }
        when (val preparation = repository.prepare(operation, expectedAuthority)) {
            is BiometricLocalUnlockPreparation.Ready -> {
                pendingRequest = preparation.request
                _uiState.update {
                    it.copy(
                        promptInFlight = true,
                        activeOperation = operation,
                        error = null,
                    )
                }
                _effects.trySend(
                    BiometricLocalUnlockUiEffect.LaunchPrompt(preparation.request),
                )
            }

            is BiometricLocalUnlockPreparation.Failed -> {
                val invalidated = preparation.error == BiometricLocalUnlockError.KeyInvalidated
                if (invalidated) repository.clear()
                _uiState.update {
                    it.copy(
                        configured = if (invalidated) false else it.configured,
                        locked = if (invalidated) true else it.locked,
                        promptInFlight = false,
                        activeOperation = null,
                        error = preparation.error,
                    )
                }
            }
        }
    }

    private fun onPromptAuthenticated(requestId: String) {
        val request = pendingRequest?.takeIf { it.requestId == requestId } ?: return
        pendingRequest = null
        when (repository.complete(requestId)) {
            BiometricLocalUnlockCompletion.Success -> when (request.operation) {
                BiometricLocalUnlockOperation.Enable -> _uiState.update {
                    it.copy(
                        configured = true,
                        locked = false,
                        promptInFlight = false,
                        activeOperation = null,
                        error = null,
                    )
                }

                BiometricLocalUnlockOperation.Unlock -> _uiState.update {
                    it.copy(
                        configured = true,
                        locked = false,
                        promptInFlight = false,
                        activeOperation = null,
                        error = null,
                    )
                }

                BiometricLocalUnlockOperation.Disable -> _uiState.update {
                    it.copy(
                        configured = false,
                        locked = false,
                        promptInFlight = false,
                        activeOperation = null,
                        error = null,
                    )
                }
            }

            BiometricLocalUnlockCompletion.AuthorityMismatch -> {
                repository.clear()
                _uiState.update {
                    it.copy(
                        configured = false,
                        locked = true,
                        promptInFlight = false,
                        activeOperation = null,
                        error = BiometricLocalUnlockError.AuthorityChanged,
                        terminationRequired = true,
                    )
                }
                authority?.let { currentAuthority ->
                    _effects.trySend(
                        BiometricLocalUnlockUiEffect.TerminateSession(currentAuthority),
                    )
                }
            }

            BiometricLocalUnlockCompletion.KeyInvalidated -> {
                repository.clear()
                _uiState.update {
                    it.copy(
                        configured = false,
                        locked = true,
                        promptInFlight = false,
                        activeOperation = null,
                        error = BiometricLocalUnlockError.KeyInvalidated,
                    )
                }
            }

            BiometricLocalUnlockCompletion.StorageFailure -> _uiState.update {
                it.copy(
                    locked = request.operation != BiometricLocalUnlockOperation.Enable,
                    promptInFlight = false,
                    activeOperation = null,
                    error = BiometricLocalUnlockError.StorageFailure,
                )
            }
        }
    }

    private fun onPromptFailed(
        requestId: String,
        error: BiometricLocalUnlockError,
    ) {
        val request = pendingRequest?.takeIf { it.requestId == requestId } ?: return
        repository.cancel(requestId)
        pendingRequest = null
        val keyInvalidated = error == BiometricLocalUnlockError.KeyInvalidated
        if (keyInvalidated) repository.clear()
        _uiState.update {
            it.copy(
                configured = if (keyInvalidated) false else it.configured,
                locked = if (request.operation == BiometricLocalUnlockOperation.Enable) {
                    false
                } else {
                    true
                },
                promptInFlight = false,
                activeOperation = null,
                error = error,
            )
        }
    }

    private fun onBackgrounded() {
        val cancelledInFlight = pendingRequest != null
        cancelPendingPrompt()
        _uiState.update {
            it.copy(
                locked = it.configured && authority != null,
                promptInFlight = false,
                activeOperation = null,
                error = if (cancelledInFlight) {
                    BiometricLocalUnlockError.AuthenticationCancelled
                } else {
                    it.error
                },
            )
        }
    }

    private fun onForegrounded() {
        _uiState.update { it.copy(availability = repository.availability()) }
        if (_uiState.value.configured && _uiState.value.locked) {
            requestUnlock()
        }
    }

    private fun requireSessionTermination() {
        val expectedAuthority = authority ?: return
        cancelPendingPrompt()
        repository.clear()
        _uiState.update {
            it.copy(
                configured = false,
                locked = true,
                promptInFlight = false,
                activeOperation = null,
                terminationRequired = true,
            )
        }
        _effects.trySend(
            BiometricLocalUnlockUiEffect.TerminateSession(expectedAuthority),
        )
    }

    private fun cancelPendingPrompt() {
        val request = pendingRequest ?: return
        repository.cancel(request.requestId)
        pendingRequest = null
        _effects.trySend(BiometricLocalUnlockUiEffect.CancelPrompt(request.requestId))
    }

    override fun onCleared() {
        cancelPendingPrompt()
        super.onCleared()
    }
}

class BiometricLocalUnlockViewModelFactory(
    private val repository: BiometricLocalUnlockRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(BiometricLocalUnlockViewModel::class.java))
        return BiometricLocalUnlockViewModel(repository) as T
    }
}
