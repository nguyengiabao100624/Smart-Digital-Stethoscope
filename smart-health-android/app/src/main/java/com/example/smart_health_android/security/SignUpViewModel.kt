package com.example.smart_health_android.security

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseAccountCreationReceipt
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.PendingRegistration
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.data.normalizePendingRegistrationEmail
import com.example.smart_health_android.data.ownerBinding
import com.example.smart_health_android.data.toVietnameseMessage
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class SignUpAccountType(val apiValue: String) {
    Personal("personal"),
    SoloDoctor("solo_doctor"),
    ClinicDoctor("doctor"),
}

enum class SignUpCatalogLoadState {
    Loading,
    Ready,
    Offline,
    Error,
}

data class SignUpCatalog(
    val clinics: List<ClinicOption> = emptyList(),
    val specialties: List<SpecialtyOption> = emptyList(),
)

data class SignUpSubmission(
    val accountType: SignUpAccountType,
    val name: String,
    val phone: String,
    val email: String,
    val password: String,
    val license: String = "",
    val clinicId: String = "",
    val clinicName: String = "",
    val specialtyId: String = "",
    val specialtyName: String = "",
    val reason: String = "",
)

data class SignUpRegistrationAttempt(
    val operationId: String,
    val firebaseOwner: FirebaseOwnerBinding? = null,
) {
    init {
        require(
            operationId == operationId.trim() && operationId.length in 8..160
        ) {
            "Registration operation ID must contain between 8 and 160 characters."
        }
        firebaseOwner?.let { owner ->
            require(
                owner.firebaseUserId.isNotBlank() &&
                    owner.firebaseUserId.length <= 160 &&
                    owner.email.isNotBlank() &&
                    owner.email == normalizePendingRegistrationEmail(owner.email) &&
                    owner.sessionEpoch > 0L
            ) {
                "Firebase owner binding is not canonical."
            }
        }
    }
}

data class SignUpUiState(
    val accountType: SignUpAccountType = SignUpAccountType.Personal,
    val name: String = "",
    val phone: String = "",
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val license: String = "",
    val registrationReason: String = "",
    val clinics: List<ClinicOption> = emptyList(),
    val specialties: List<SpecialtyOption> = emptyList(),
    val selectedClinicId: String = "",
    val selectedSoloClinicId: String = "",
    val selectedSpecialtyId: String = "",
    val requestedClinicName: String = "",
    val soloClinicName: String = "",
    val agreedToTerms: Boolean = false,
    val catalogLoadState: SignUpCatalogLoadState = SignUpCatalogLoadState.Loading,
    val catalogError: String? = null,
    val isSubmitting: Boolean = false,
    val isSubmissionComplete: Boolean = false,
    val errorMessage: String? = null,
    val fieldErrors: Map<String, String> = emptyMap(),
    val showDiscardDialog: Boolean = false,
    val hasStartedSubmission: Boolean = false,
    val hasCapturedFirebaseOwner: Boolean = false,
    val isAbandoningRegistration: Boolean = false,
    val abandonmentErrorMessage: String? = null,
) {
    val isDoctorRegistration: Boolean
        get() = accountType != SignUpAccountType.Personal

    val requiresClinicSelection: Boolean
        get() = accountType == SignUpAccountType.ClinicDoctor

    val selectedClinic: ClinicOption?
        get() = clinics.firstOrNull { it.id == selectedClinicId }

    val privateClinicOptions: List<ClinicOption>
        get() = clinics.filter { it.type != "hospital" }

    val selectedSoloClinic: ClinicOption?
        get() = privateClinicOptions.firstOrNull { it.id == selectedSoloClinicId }

    val selectedSpecialty: SpecialtyOption?
        get() = specialties.firstOrNull { it.id == selectedSpecialtyId }

    val clinicDisplayName: String
        get() = selectedClinic?.name ?: requestedClinicName

    val soloClinicDisplayName: String
        get() = selectedSoloClinic?.name ?: soloClinicName

    val isCatalogLoading: Boolean
        get() = catalogLoadState == SignUpCatalogLoadState.Loading

    val hasUnsavedChanges: Boolean
        get() = accountType != SignUpAccountType.Personal ||
            listOf(
                name,
                phone,
                email,
                password,
                confirmPassword,
                license,
                registrationReason,
                selectedClinicId,
                selectedSoloClinicId,
                selectedSpecialtyId,
                requestedClinicName,
                soloClinicName,
            ).any(String::isNotBlank) || agreedToTerms
}

sealed interface SignUpUiAction {
    data class AccountTypeChanged(val value: SignUpAccountType) : SignUpUiAction
    data class NameChanged(val value: String) : SignUpUiAction
    data class PhoneChanged(val value: String) : SignUpUiAction
    data class EmailChanged(val value: String) : SignUpUiAction
    data class PasswordChanged(val value: String) : SignUpUiAction
    data class ConfirmPasswordChanged(val value: String) : SignUpUiAction
    data class LicenseChanged(val value: String) : SignUpUiAction
    data class ReasonChanged(val value: String) : SignUpUiAction
    data class ClinicSelected(val id: String) : SignUpUiAction
    data class SoloClinicSelected(val id: String) : SignUpUiAction
    data class SpecialtySelected(val id: String) : SignUpUiAction
    data class MissingClinicRequested(val name: String) : SignUpUiAction
    data class SoloClinicNamed(val name: String) : SignUpUiAction
    data class TermsChanged(val value: Boolean) : SignUpUiAction
    data object RetryCatalog : SignUpUiAction
    data object Submit : SignUpUiAction
    data object BackRequested : SignUpUiAction
    data object ConfirmDiscard : SignUpUiAction
    data object DismissDiscard : SignUpUiAction
}

sealed interface SignUpUiEffect {
    data object NavigateLogin : SignUpUiEffect
    data class NavigateVerifyEmail(
        val accountType: String,
        val firebaseOwner: FirebaseOwnerBinding,
    ) : SignUpUiEffect
}

interface SignUpRepository {
    suspend fun loadCatalog(): SignUpCatalog
    suspend fun submit(
        submission: SignUpSubmission,
        resumeAttempt: SignUpRegistrationAttempt? = null,
        onAttemptBound: (SignUpRegistrationAttempt) -> Unit = {},
    ): FirebaseOwnerBinding
    fun isCurrentOwner(owner: FirebaseOwnerBinding): Boolean
}

interface SignUpAbandonmentCoordinator {
    suspend fun terminateIfCurrentOwner(owner: FirebaseOwnerBinding): Boolean

    suspend fun clearRegistrationAttempt(attempt: SignUpRegistrationAttempt): Boolean

    fun abandonLocally(attempt: SignUpRegistrationAttempt)
}

private object UnavailableSignUpAbandonmentCoordinator : SignUpAbandonmentCoordinator {
    override suspend fun terminateIfCurrentOwner(owner: FirebaseOwnerBinding): Boolean = false

    override suspend fun clearRegistrationAttempt(attempt: SignUpRegistrationAttempt): Boolean =
        false

    override fun abandonLocally(attempt: SignUpRegistrationAttempt) = Unit
}

internal interface SignUpFirebaseGateway {
    fun currentOwnerBindingOrNull(): FirebaseOwnerBinding?
    fun isCurrentOwner(owner: FirebaseOwnerBinding): Boolean

    suspend fun createAccount(
        email: String,
        password: String,
        displayName: String,
    ): FirebaseAccountCreationReceipt

    suspend fun resendEmailVerification(owner: FirebaseOwnerBinding)
}

internal interface SignUpRegistrationCheckpoint {
    suspend fun saveDraft(registration: PendingRegistration)

    suspend fun bindToOwner(
        registration: PendingRegistration,
        owner: FirebaseOwnerBinding,
    )
}

class ProductionSignUpRepository internal constructor(
    private val firebase: SignUpFirebaseGateway,
    private val checkpoint: SignUpRegistrationCheckpoint,
    private val catalogLoader: suspend () -> SignUpCatalog,
    private val operationIdFactory: () -> String = { UUID.randomUUID().toString() },
) : SignUpRepository {
    constructor(context: Context) : this(
        firebase = ProductionSignUpFirebaseGateway,
        checkpoint = ProductionSignUpRegistrationCheckpoint(context.applicationContext),
        catalogLoader = {
            SignUpCatalog(
                clinics = SmartHealthRepository.api.listClinics(),
                specialties = SmartHealthRepository.api.listSpecialties(),
            )
        },
    )

    override suspend fun loadCatalog(): SignUpCatalog = catalogLoader()

    override fun isCurrentOwner(owner: FirebaseOwnerBinding): Boolean =
        firebase.isCurrentOwner(owner)

    override suspend fun submit(
        submission: SignUpSubmission,
        resumeAttempt: SignUpRegistrationAttempt?,
        onAttemptBound: (SignUpRegistrationAttempt) -> Unit,
    ): FirebaseOwnerBinding {
        val operationId = resumeAttempt?.operationId?.trim()
            ?: operationIdFactory().trim()
        require(operationId.length in 8..160) {
            "Registration operation ID must contain between 8 and 160 characters."
        }
        val registration = submission.toPendingRegistration(operationId)
        val existingOwner = firebase.currentOwnerBindingOrNull()
        val expectedResumeOwner = resumeAttempt?.firebaseOwner
        if (expectedResumeOwner != null && existingOwner != expectedResumeOwner) {
            error("Phiên Firebase đã thay đổi trước khi thử lại đăng ký.")
        }
        if (
            existingOwner != null &&
            existingOwner.email != normalizePendingRegistrationEmail(submission.email)
        ) {
            error("Phiên Firebase hiện tại thuộc tài khoản khác. Vui lòng đăng xuất trước khi đăng ký.")
        }

        // Persist the encrypted, owner-less checkpoint before Firebase creates an identity.
        // If Firebase completes only part of its workflow or the process stops, the next
        // owner-bound recovery can safely attach this exact-email checkpoint.
        checkpoint.saveDraft(registration)
        val ownerlessAttempt = SignUpRegistrationAttempt(operationId = operationId)
        onAttemptBound(resumeAttempt ?: ownerlessAttempt)

        var resumedExistingOwner = existingOwner != null
        val owner = existingOwner ?: try {
            val createdOwner = firebase.createAccount(
                email = submission.email,
                password = submission.password,
                displayName = submission.name,
            ).ownerBinding()
            onAttemptBound(ownerlessAttempt.copy(firebaseOwner = createdOwner))
            createdOwner
        } catch (error: CancellationException) {
            firebase.currentOwnerBindingOrNull()
                ?.takeIf {
                    it.email == normalizePendingRegistrationEmail(submission.email)
                }
                ?.let { recoveredOwner ->
                    onAttemptBound(ownerlessAttempt.copy(firebaseOwner = recoveredOwner))
                }
            throw error
        } catch (error: Exception) {
            val recoveredOwner = firebase.currentOwnerBindingOrNull()
                ?.takeIf {
                    it.email == normalizePendingRegistrationEmail(submission.email)
                }
                ?: throw error
            resumedExistingOwner = true
            onAttemptBound(ownerlessAttempt.copy(firebaseOwner = recoveredOwner))
            recoveredOwner
        }

        if (existingOwner != null) {
            onAttemptBound(ownerlessAttempt.copy(firebaseOwner = owner))
        }

        requireCurrentOwner(owner)
        checkpoint.bindToOwner(registration, owner)
        requireCurrentOwner(owner)

        if (resumedExistingOwner) {
            firebase.resendEmailVerification(owner)
            requireCurrentOwner(owner)
        }
        requireCurrentOwner(owner)
        return owner
    }

    private fun requireCurrentOwner(owner: FirebaseOwnerBinding) {
        if (!firebase.isCurrentOwner(owner)) {
            error("Phiên Firebase đã thay đổi trong lúc đăng ký.")
        }
    }
}

private object ProductionSignUpFirebaseGateway : SignUpFirebaseGateway {
    override fun currentOwnerBindingOrNull(): FirebaseOwnerBinding? =
        FirebaseAuthService.currentOwnerBindingOrNull()

    override fun isCurrentOwner(owner: FirebaseOwnerBinding): Boolean =
        FirebaseAuthService.isCurrentOwner(owner)

    override suspend fun createAccount(
        email: String,
        password: String,
        displayName: String,
    ): FirebaseAccountCreationReceipt = FirebaseAuthService.createAccount(
        email = email,
        password = password,
        displayName = displayName,
    )

    override suspend fun resendEmailVerification(owner: FirebaseOwnerBinding) {
        FirebaseAuthService.sendEmailVerification(owner)
    }
}

private class ProductionSignUpRegistrationCheckpoint(
    private val context: Context,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : SignUpRegistrationCheckpoint {
    override suspend fun saveDraft(registration: PendingRegistration) {
        withContext(ioDispatcher) {
            PendingRegistrationStore.save(context, registration)
        }
    }

    override suspend fun bindToOwner(
        registration: PendingRegistration,
        owner: FirebaseOwnerBinding,
    ) {
        withContext(ioDispatcher) {
            PendingRegistrationStore.saveForFirebaseOwnerIfCurrentDraft(
                context = context,
                registration = registration,
                firebaseUserId = owner.firebaseUserId,
                firebaseEmail = owner.email,
            )
        }
    }
}

private class ProductionSignUpAbandonmentCoordinator(
    context: Context,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : SignUpAbandonmentCoordinator {
    private val applicationContext = context.applicationContext

    override suspend fun terminateIfCurrentOwner(owner: FirebaseOwnerBinding): Boolean =
        SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(owner)

    override suspend fun clearRegistrationAttempt(
        attempt: SignUpRegistrationAttempt,
    ): Boolean = withContext(ioDispatcher) {
        PendingRegistrationStore.clearRegistrationAttempt(
            context = applicationContext,
            operationId = attempt.operationId,
            firebaseUserId = attempt.firebaseOwner?.firebaseUserId.orEmpty(),
            firebaseEmail = attempt.firebaseOwner?.email.orEmpty(),
        )
    }

    override fun abandonLocally(attempt: SignUpRegistrationAttempt) {
        attempt.firebaseOwner?.let { owner ->
            runCatching {
                SmartHealthSessionTerminator.terminateLocallyIfCurrentFirebaseOwner(owner)
            }
        }
        runCatching {
            PendingRegistrationStore.clearRegistrationAttempt(
                context = applicationContext,
                operationId = attempt.operationId,
                firebaseUserId = attempt.firebaseOwner?.firebaseUserId.orEmpty(),
                firebaseEmail = attempt.firebaseOwner?.email.orEmpty(),
            )
        }
    }
}

class SignUpViewModel(
    private val repository: SignUpRepository,
    private val workDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val abandonmentCoordinator: SignUpAbandonmentCoordinator =
        UnavailableSignUpAbandonmentCoordinator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SignUpUiState())
    val uiState: StateFlow<SignUpUiState> = _uiState.asStateFlow()

    private val effectChannel = Channel<SignUpUiEffect>(Channel.BUFFERED)
    val effects = effectChannel.receiveAsFlow()

    private var catalogGeneration = 0L
    private val attemptLock = Any()
    private var activeAttempt: SignUpRegistrationAttempt? = null
    private var abandonmentSessionTerminationConfirmed = false
    private var exitCommitted = false
    private var localAbandonmentStarted = false

    init {
        loadCatalog()
    }

    fun onAction(action: SignUpUiAction) {
        val state = _uiState.value
        if (exitCommitted || state.isSubmissionComplete) return
        if (state.isAbandoningRegistration) return
        if (state.isSubmitting && action !is SignUpUiAction.BackRequested) return
        if (state.hasStartedSubmission && action.mutatesRegistrationDraft()) return
        when (action) {
            is SignUpUiAction.AccountTypeChanged -> updateAccountType(action.value)
            is SignUpUiAction.NameChanged -> updateField("name") { copy(name = action.value) }
            is SignUpUiAction.PhoneChanged -> updateField("phone") { copy(phone = action.value) }
            is SignUpUiAction.EmailChanged -> updateField("email") { copy(email = action.value) }
            is SignUpUiAction.PasswordChanged -> updateField("password") { copy(password = action.value) }
            is SignUpUiAction.ConfirmPasswordChanged ->
                updateField("confirmPassword") { copy(confirmPassword = action.value) }
            is SignUpUiAction.LicenseChanged -> updateField("license") { copy(license = action.value) }
            is SignUpUiAction.ReasonChanged -> updateField("reason") {
                copy(registrationReason = action.value)
            }
            is SignUpUiAction.ClinicSelected -> updateField("clinic") {
                copy(selectedClinicId = action.id, requestedClinicName = "")
            }
            is SignUpUiAction.SoloClinicSelected -> updateField("soloClinic") {
                copy(selectedSoloClinicId = action.id, soloClinicName = "")
            }
            is SignUpUiAction.SpecialtySelected -> updateField("specialty") {
                copy(selectedSpecialtyId = action.id)
            }
            is SignUpUiAction.MissingClinicRequested -> updateField("clinic") {
                copy(requestedClinicName = action.name.trim(), selectedClinicId = "")
            }
            is SignUpUiAction.SoloClinicNamed -> updateField("soloClinic") {
                copy(soloClinicName = action.name.trim(), selectedSoloClinicId = "")
            }
            is SignUpUiAction.TermsChanged -> updateField("terms") {
                copy(agreedToTerms = action.value)
            }
            SignUpUiAction.RetryCatalog -> loadCatalog()
            SignUpUiAction.Submit -> submit()
            SignUpUiAction.BackRequested -> requestBack()
            SignUpUiAction.ConfirmDiscard -> confirmDiscard()
            SignUpUiAction.DismissDiscard ->
                _uiState.update { it.copy(showDiscardDialog = false) }
        }
    }

    private fun updateAccountType(accountType: SignUpAccountType) {
        _uiState.update { state ->
            when (accountType) {
                SignUpAccountType.Personal -> state.copy(
                    accountType = accountType,
                    license = "",
                    registrationReason = "",
                    selectedClinicId = "",
                    selectedSoloClinicId = "",
                    selectedSpecialtyId = "",
                    requestedClinicName = "",
                    soloClinicName = "",
                    fieldErrors = emptyMap(),
                    errorMessage = null,
                )
                SignUpAccountType.SoloDoctor -> state.copy(
                    accountType = accountType,
                    selectedClinicId = "",
                    requestedClinicName = "",
                    fieldErrors = emptyMap(),
                    errorMessage = null,
                )
                SignUpAccountType.ClinicDoctor -> state.copy(
                    accountType = accountType,
                    selectedSoloClinicId = "",
                    soloClinicName = "",
                    fieldErrors = emptyMap(),
                    errorMessage = null,
                )
            }
        }
    }

    private fun SignUpUiAction.mutatesRegistrationDraft(): Boolean = when (this) {
        is SignUpUiAction.AccountTypeChanged,
        is SignUpUiAction.NameChanged,
        is SignUpUiAction.PhoneChanged,
        is SignUpUiAction.EmailChanged,
        is SignUpUiAction.PasswordChanged,
        is SignUpUiAction.ConfirmPasswordChanged,
        is SignUpUiAction.LicenseChanged,
        is SignUpUiAction.ReasonChanged,
        is SignUpUiAction.ClinicSelected,
        is SignUpUiAction.SoloClinicSelected,
        is SignUpUiAction.SpecialtySelected,
        is SignUpUiAction.MissingClinicRequested,
        is SignUpUiAction.SoloClinicNamed,
        is SignUpUiAction.TermsChanged,
        -> true

        SignUpUiAction.RetryCatalog,
        SignUpUiAction.Submit,
        SignUpUiAction.BackRequested,
        SignUpUiAction.ConfirmDiscard,
        SignUpUiAction.DismissDiscard,
        -> false
    }

    private fun updateField(
        field: String,
        transform: SignUpUiState.() -> SignUpUiState,
    ) {
        _uiState.update { state ->
            state.transform().copy(
                fieldErrors = state.fieldErrors - field,
                errorMessage = null,
            )
        }
    }

    private fun requestBack() {
        val state = _uiState.value
        if (state.isSubmitting || state.isAbandoningRegistration) return
        if (state.hasUnsavedChanges || state.hasStartedSubmission) {
            _uiState.update { it.copy(showDiscardDialog = true) }
        } else {
            exitCommitted = true
            effectChannel.trySend(SignUpUiEffect.NavigateLogin)
        }
    }

    private fun confirmDiscard() {
        val attempt = currentAttempt()
        if (attempt == null) {
            exitCommitted = true
            _uiState.update { it.copy(showDiscardDialog = false) }
            effectChannel.trySend(SignUpUiEffect.NavigateLogin)
            return
        }

        _uiState.update {
            it.copy(
                showDiscardDialog = false,
                isAbandoningRegistration = true,
                abandonmentErrorMessage = null,
                errorMessage = null,
            )
        }
        viewModelScope.launch(
            context = workDispatcher,
            start = CoroutineStart.UNDISPATCHED,
        ) {
            withContext(NonCancellable + workDispatcher) {
                abandonRegistrationAttempt(attempt)
            }
        }
    }

    private suspend fun abandonRegistrationAttempt(attempt: SignUpRegistrationAttempt) {
        if (!isCurrentAttempt(attempt)) {
            publishAbandonmentFailure(
                "Phiên đăng ký đã thay đổi. Shcare không tự động đóng tài khoản khác.",
            )
            return
        }

        val owner = attempt.firebaseOwner
        if (owner != null && !abandonmentSessionTerminationConfirmed) {
            val terminated = try {
                abandonmentCoordinator.terminateIfCurrentOwner(owner)
            } catch (_: CancellationException) {
                false
            } catch (_: Exception) {
                false
            }
            if (!terminated) {
                publishAbandonmentFailure(
                    "Chưa thể xác nhận đã kết thúc đúng phiên tài khoản vừa tạo. " +
                        "Tài khoản thay thế sẽ không bị đăng xuất; vui lòng thử lại.",
                )
                return
            }
            abandonmentSessionTerminationConfirmed = true
        }

        val checkpointCleared = try {
            abandonmentCoordinator.clearRegistrationAttempt(attempt)
        } catch (_: CancellationException) {
            false
        } catch (_: Exception) {
            false
        }
        if (!checkpointCleared) {
            publishAbandonmentFailure(
                "Phiên tài khoản đã được kết thúc nhưng tiến trình đăng ký chưa được dọn an toàn. " +
                    "Vui lòng thử lại trước khi quay về đăng nhập.",
            )
            return
        }

        if (!clearAttemptIfCurrent(attempt)) {
            publishAbandonmentFailure(
                "Phiên đăng ký đã thay đổi trong lúc dọn dữ liệu. Vui lòng thử lại.",
            )
            return
        }
        exitCommitted = true
        _uiState.update {
            it.copy(
                isAbandoningRegistration = false,
                hasStartedSubmission = false,
                hasCapturedFirebaseOwner = false,
                abandonmentErrorMessage = null,
            )
        }
        effectChannel.send(SignUpUiEffect.NavigateLogin)
    }

    private fun publishAbandonmentFailure(message: String) {
        _uiState.update {
            it.copy(
                isAbandoningRegistration = false,
                abandonmentErrorMessage = message,
            )
        }
    }

    private fun loadCatalog() {
        if (_uiState.value.isSubmitting) return
        val generation = ++catalogGeneration
        _uiState.update {
            it.copy(
                catalogLoadState = SignUpCatalogLoadState.Loading,
                catalogError = null,
            )
        }
        viewModelScope.launch(workDispatcher) {
            try {
                val catalog = repository.loadCatalog()
                if (generation != catalogGeneration) return@launch
                _uiState.update { state ->
                    state.copy(
                        clinics = catalog.clinics,
                        specialties = catalog.specialties,
                        selectedClinicId = state.selectedClinicId
                            .takeIf { selected -> catalog.clinics.any { it.id == selected } }
                            .orEmpty(),
                        selectedSoloClinicId = state.selectedSoloClinicId
                            .takeIf { selected -> catalog.clinics.any { it.id == selected } }
                            .orEmpty(),
                        selectedSpecialtyId = state.selectedSpecialtyId
                            .takeIf { selected -> catalog.specialties.any { it.id == selected } }
                            .orEmpty(),
                        catalogLoadState = SignUpCatalogLoadState.Ready,
                        catalogError = null,
                    )
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                if (generation != catalogGeneration) return@launch
                _uiState.update {
                    it.copy(
                        catalogLoadState = if (error is IOException) {
                            SignUpCatalogLoadState.Offline
                        } else {
                            SignUpCatalogLoadState.Error
                        },
                        catalogError = error.toVietnameseMessage(
                            "Không thể tải danh sách cơ sở y tế/chuyên khoa từ backend.",
                        ),
                    )
                }
            }
        }
    }

    private fun submit() {
        val snapshot = _uiState.value
        if (snapshot.isSubmitting) return
        val validationErrors = validate(snapshot)
        if (validationErrors.isNotEmpty()) {
            _uiState.update {
                it.copy(
                    fieldErrors = validationErrors,
                    errorMessage = "Vui lòng kiểm tra các trường được đánh dấu.",
                )
            }
            return
        }

        val submission = snapshot.toSubmission()
        _uiState.update {
            it.copy(
                isSubmitting = true,
                errorMessage = null,
                fieldErrors = emptyMap(),
                showDiscardDialog = false,
            )
        }
        viewModelScope.launch(workDispatcher) {
            try {
                val firebaseOwner = repository.submit(
                    submission = submission,
                    resumeAttempt = currentAttempt(),
                    onAttemptBound = ::bindRegistrationAttempt,
                )
                val completedAttempt = currentAttempt()
                if (completedAttempt?.firebaseOwner != firebaseOwner) {
                    error("Biên nhận đăng ký không khớp phiên Firebase đã chốt.")
                }
                if (!repository.isCurrentOwner(firebaseOwner)) {
                    error("Phiên Firebase đã thay đổi trong lúc đăng ký.")
                }
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        isSubmissionComplete = true,
                    )
                }
                effectChannel.send(
                    SignUpUiEffect.NavigateVerifyEmail(
                        accountType = submission.accountType.apiValue,
                        firebaseOwner = firebaseOwner,
                    ),
                )
            } catch (error: CancellationException) {
                _uiState.update { it.copy(isSubmitting = false) }
                throw error
            } catch (error: Exception) {
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        errorMessage = error.toVietnameseMessage(
                            "Không thể hoàn tất đăng ký. Vui lòng kiểm tra thông tin và thử lại.",
                        ),
                    )
                }
            }
        }
    }

    private fun bindRegistrationAttempt(candidate: SignUpRegistrationAttempt) {
        synchronized(attemptLock) {
            val current = activeAttempt
            if (current != null) {
                check(current.operationId == candidate.operationId) {
                    "Registration attempt changed while the prior attempt was active."
                }
                check(
                    current.firebaseOwner == null ||
                        current.firebaseOwner == candidate.firebaseOwner
                ) {
                    "Firebase owner changed while the registration attempt was active."
                }
                check(
                    candidate.firebaseOwner != null || current.firebaseOwner == null
                ) {
                    "A registration attempt cannot drop its captured Firebase owner."
                }
            }
            activeAttempt = candidate
        }
        _uiState.update {
            it.copy(
                hasStartedSubmission = true,
                hasCapturedFirebaseOwner = candidate.firebaseOwner != null,
                abandonmentErrorMessage = null,
            )
        }
    }

    private fun currentAttempt(): SignUpRegistrationAttempt? = synchronized(attemptLock) {
        activeAttempt
    }

    private fun isCurrentAttempt(expected: SignUpRegistrationAttempt): Boolean =
        synchronized(attemptLock) {
            activeAttempt == expected
        }

    private fun clearAttemptIfCurrent(expected: SignUpRegistrationAttempt): Boolean =
        synchronized(attemptLock) {
            if (activeAttempt != expected) return@synchronized false
            activeAttempt = null
            true
        }

    private fun validate(state: SignUpUiState): Map<String, String> = buildMap {
        val cleanName = state.name.trim()
        val cleanEmail = state.email.trim()
        if (cleanName.isBlank()) put("name", "Vui lòng nhập họ tên")
        if (cleanEmail.isBlank()) {
            put("email", "Vui lòng nhập email để xác thực tài khoản")
        } else if (!EMAIL_PATTERN.matches(cleanEmail)) {
            put("email", "Địa chỉ email chưa đúng định dạng")
        }
        if (state.password.length < 8) {
            put("password", "Mật khẩu cần tối thiểu 8 ký tự")
        }
        if (state.password != state.confirmPassword) {
            put("confirmPassword", "Mật khẩu xác nhận không khớp")
        }
        if (!state.agreedToTerms) put("terms", "Vui lòng đồng ý điều khoản sử dụng")
        if (state.isDoctorRegistration && state.license.isBlank()) {
            put("license", "Vui lòng nhập số chứng chỉ hành nghề")
        }
        if (
            state.accountType == SignUpAccountType.SoloDoctor &&
            state.soloClinicDisplayName.isBlank()
        ) {
            put("soloClinic", "Vui lòng chọn hoặc nhập tên phòng khám tư")
        }
        if (
            state.requiresClinicSelection &&
            state.selectedClinic == null &&
            state.requestedClinicName.isBlank()
        ) {
            put("clinic", "Vui lòng chọn cơ sở y tế hoặc gửi yêu cầu bổ sung")
        }
        if (state.isDoctorRegistration && state.selectedSpecialty == null) {
            put("specialty", "Vui lòng chọn chuyên khoa")
        }
    }

    private fun SignUpUiState.toSubmission(): SignUpSubmission = SignUpSubmission(
        accountType = accountType,
        name = name.trim(),
        phone = phone.trim(),
        email = normalizePendingRegistrationEmail(email),
        password = password,
        license = license.trim().takeIf { isDoctorRegistration }.orEmpty(),
        clinicId = when (accountType) {
            SignUpAccountType.Personal,
            SignUpAccountType.SoloDoctor -> ""
            SignUpAccountType.ClinicDoctor -> selectedClinic?.id.orEmpty()
        },
        clinicName = when (accountType) {
            SignUpAccountType.Personal -> ""
            SignUpAccountType.SoloDoctor -> soloClinicDisplayName.trim()
            SignUpAccountType.ClinicDoctor -> clinicDisplayName.trim()
        },
        specialtyId = selectedSpecialty?.id
            .takeIf { isDoctorRegistration }
            .orEmpty(),
        specialtyName = selectedSpecialty?.name
            .takeIf { isDoctorRegistration }
            .orEmpty(),
        reason = registrationReason.trim().takeIf { isDoctorRegistration }.orEmpty(),
    )

    override fun onCleared() {
        abandonActiveAttemptLocally()
        super.onCleared()
    }

    internal fun abandonActiveAttemptLocally() {
        val attempt = synchronized(attemptLock) {
            if (
                exitCommitted ||
                _uiState.value.isSubmissionComplete ||
                localAbandonmentStarted
            ) {
                return@synchronized null
            }
            activeAttempt?.also { localAbandonmentStarted = true }
        }
        attempt?.let(abandonmentCoordinator::abandonLocally)
    }

    companion object {
        private val EMAIL_PATTERN = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    }
}

class SignUpViewModelFactory(
    context: Context,
) : ViewModelProvider.Factory {
    private val applicationContext = context.applicationContext

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(SignUpViewModel::class.java)) {
            "Unsupported ViewModel type: ${modelClass.name}"
        }
        return SignUpViewModel(
            repository = ProductionSignUpRepository(applicationContext),
            abandonmentCoordinator =
                ProductionSignUpAbandonmentCoordinator(applicationContext),
        ) as T
    }
}

private fun SignUpSubmission.toPendingRegistration(operationId: String): PendingRegistration =
    PendingRegistration(
        accountType = accountType.apiValue,
        name = name,
        email = email,
        phone = phone,
        license = license,
        hospital = clinicName,
        department = specialtyName,
        organizationId = clinicId,
        reason = reason,
        roleRequestIdempotencyKey = operationId,
    )
