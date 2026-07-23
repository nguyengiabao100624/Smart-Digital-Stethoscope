package com.example.smart_health_android.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SpecialtyOption
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject

enum class AccountProfileLoadState {
    Loading,
    Ready,
    Offline,
    PermissionDenied,
    Error,
}

enum class AccountProfileErrorKind {
    Load,
    Save,
    ServerUnconfirmed,
    AvatarRead,
    AvatarType,
    AvatarSize,
    AvatarUpload,
    AvatarUnconfirmed,
    AvatarRefresh,
    AvatarDelete,
    AvatarDeleteUnconfirmed,
}

enum class AccountProfileConfirmation {
    ProfileSaved,
    AvatarUpdated,
    AvatarDeleted,
}

data class AccountProfileDraft(
    val name: String = "",
    val phone: String = "",
    val license: String = "",
    val organizationId: String = "",
    val hospital: String = "",
    val specialtyId: String = "",
    val department: String = "",
    val address: String = "",
) {
    fun normalized(): AccountProfileDraft = copy(
        name = name.trim(),
        phone = phone.trim(),
        license = license.trim(),
        organizationId = organizationId.trim(),
        hospital = hospital.trim(),
        specialtyId = specialtyId.trim(),
        department = department.trim(),
        address = address.trim(),
    )
}

data class AccountProfileUiState(
    val loadState: AccountProfileLoadState = AccountProfileLoadState.Loading,
    val user: AuthUser? = null,
    val clinics: List<ClinicOption> = emptyList(),
    val specialties: List<SpecialtyOption> = emptyList(),
    val savedDraft: AccountProfileDraft = AccountProfileDraft(),
    val draft: AccountProfileDraft = AccountProfileDraft(),
    val avatarBytes: ByteArray? = null,
    val isEditing: Boolean = false,
    val isSaving: Boolean = false,
    val isAvatarBusy: Boolean = false,
    val showDiscardConfirmation: Boolean = false,
    val showAvatarDeleteConfirmation: Boolean = false,
    val nameInvalid: Boolean = false,
    val phoneInvalid: Boolean = false,
    val errorKind: AccountProfileErrorKind? = null,
    val requestId: String = "",
    val confirmation: AccountProfileConfirmation? = null,
    internal val saveIdempotencyKey: String = "",
    internal val deleteAvatarIdempotencyKey: String = "",
) {
    val hasUnsavedChanges: Boolean
        get() = draft.normalized() != savedDraft.normalized()

    val hasAvatar: Boolean
        get() = user?.let { it.avatarFileId.isNotBlank() || it.avatarUrl.isNotBlank() } == true

    val isProfessionalProfile: Boolean
        get() = user?.role in setOf("doctor", "admin")
}

sealed interface AccountProfileAction {
    data object Retry : AccountProfileAction
    data object StartEditing : AccountProfileAction
    data object Save : AccountProfileAction
    data object RequestDiscard : AccountProfileAction
    data object KeepEditing : AccountProfileAction
    data object ConfirmDiscard : AccountProfileAction
    data object RequestAvatarDelete : AccountProfileAction
    data object DismissAvatarDelete : AccountProfileAction
    data object ConfirmAvatarDelete : AccountProfileAction
    data object ClearMessage : AccountProfileAction
    data class ChangeName(val value: String) : AccountProfileAction
    data class ChangePhone(val value: String) : AccountProfileAction
    data class ChangeLicense(val value: String) : AccountProfileAction
    data class ChangeHospital(val value: String) : AccountProfileAction
    data class SelectClinic(val id: String) : AccountProfileAction
    data class ChangeDepartment(val value: String) : AccountProfileAction
    data class SelectSpecialty(val id: String) : AccountProfileAction
    data class ChangeAddress(val value: String) : AccountProfileAction
    data class AvatarSelected(
        val fileName: String,
        val contentType: String,
        val bytes: ByteArray,
    ) : AccountProfileAction
}

sealed interface AccountProfileEffect {
    data object StartPhoneEnrollment : AccountProfileEffect
    data class ReverifyPhone(val phone: String) : AccountProfileEffect
}

data class AccountProfileSnapshot(
    val user: AuthUser,
    val clinics: List<ClinicOption>,
    val specialties: List<SpecialtyOption>,
    val avatarBytes: ByteArray?,
    val avatarLoadFailed: Boolean,
)

interface AccountProfileRepository {
    suspend fun load(): AccountProfileSnapshot
    suspend fun updateProfile(draft: AccountProfileDraft, idempotencyKey: String): AuthUser
    suspend fun uploadAvatar(
        fileName: String,
        contentType: String,
        bytes: ByteArray,
        idempotencyKey: String,
    ): AuthUser
    suspend fun deleteAvatar(idempotencyKey: String): AuthUser
    suspend fun downloadAvatar(): ByteArray
}

class ApiAccountProfileRepository : AccountProfileRepository {
    override suspend fun load(): AccountProfileSnapshot {
        val clinics = SmartHealthRepository.api.listClinics()
        val specialties = SmartHealthRepository.api.listSpecialties()
        val user = SmartHealthRepository.api.getMe()
        val hasAvatar = user.avatarFileId.isNotBlank() || user.avatarUrl.isNotBlank()
        val avatarResult = if (hasAvatar) {
            runCatching { SmartHealthRepository.api.downloadMyAvatarBytes() }
        } else {
            Result.success(null)
        }
        return AccountProfileSnapshot(
            user = user,
            clinics = clinics,
            specialties = specialties,
            avatarBytes = avatarResult.getOrNull(),
            avatarLoadFailed = hasAvatar && avatarResult.isFailure,
        )
    }

    override suspend fun updateProfile(
        draft: AccountProfileDraft,
        idempotencyKey: String,
    ): AuthUser {
        val normalized = draft.normalized()
        val body = JSONObject()
            .put("name", normalized.name)
            .put("license", normalized.license)
            .put("organizationId", normalized.organizationId)
            .put("hospital", normalized.hospital)
            .put("department", normalized.department)
            .put("specialty", normalized.department)
            .put("address", normalized.address)
        return SmartHealthRepository.api.updateMe(body, idempotencyKey)
    }

    override suspend fun uploadAvatar(
        fileName: String,
        contentType: String,
        bytes: ByteArray,
        idempotencyKey: String,
    ): AuthUser = SmartHealthRepository.api.uploadMyAvatar(
        fileName = fileName,
        contentType = contentType,
        bytes = bytes,
        idempotencyKey = idempotencyKey,
    )

    override suspend fun deleteAvatar(idempotencyKey: String): AuthUser =
        SmartHealthRepository.api.deleteMyAvatar(idempotencyKey)

    override suspend fun downloadAvatar(): ByteArray =
        SmartHealthRepository.api.downloadMyAvatarBytes()
}

class AccountProfileViewModel(
    private val repository: AccountProfileRepository = ApiAccountProfileRepository(),
    private val createIdempotencyKey: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(AccountProfileUiState())
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<AccountProfileEffect>(Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    init {
        load()
    }

    fun onAction(action: AccountProfileAction) {
        when (action) {
            AccountProfileAction.Retry -> load()
            AccountProfileAction.StartEditing -> startEditing()
            AccountProfileAction.Save -> save()
            AccountProfileAction.RequestDiscard -> requestDiscard()
            AccountProfileAction.KeepEditing -> _uiState.update { it.copy(showDiscardConfirmation = false) }
            AccountProfileAction.ConfirmDiscard -> discard()
            AccountProfileAction.RequestAvatarDelete -> requestAvatarDelete()
            AccountProfileAction.DismissAvatarDelete -> _uiState.update {
                it.copy(showAvatarDeleteConfirmation = false)
            }
            AccountProfileAction.ConfirmAvatarDelete -> deleteAvatar()
            AccountProfileAction.ClearMessage -> _uiState.update {
                it.copy(errorKind = null, requestId = "", confirmation = null)
            }
            is AccountProfileAction.ChangeName -> updateDraft { copy(name = action.value) }
            is AccountProfileAction.ChangePhone -> updateDraft { copy(phone = action.value) }
            is AccountProfileAction.ChangeLicense -> updateDraft { copy(license = action.value) }
            is AccountProfileAction.ChangeHospital -> updateDraft {
                copy(organizationId = "", hospital = action.value)
            }
            is AccountProfileAction.SelectClinic -> selectClinic(action.id)
            is AccountProfileAction.ChangeDepartment -> updateDraft {
                copy(specialtyId = "", department = action.value)
            }
            is AccountProfileAction.SelectSpecialty -> selectSpecialty(action.id)
            is AccountProfileAction.ChangeAddress -> updateDraft { copy(address = action.value) }
            is AccountProfileAction.AvatarSelected -> uploadAvatar(action)
        }
    }

    private fun load() {
        val state = _uiState.value
        if (state.isSaving || state.isAvatarBusy) return
        _uiState.update {
            it.copy(
                loadState = AccountProfileLoadState.Loading,
                errorKind = null,
                requestId = "",
                confirmation = null,
            )
        }
        viewModelScope.launch {
            runCatching { repository.load() }
                .onSuccess(::applySnapshot)
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            loadState = when {
                                error is SmartHealthApiException && error.statusCode in setOf(401, 403) -> {
                                    AccountProfileLoadState.PermissionDenied
                                }
                                error is IOException && error !is SmartHealthApiException -> {
                                    AccountProfileLoadState.Offline
                                }
                                else -> AccountProfileLoadState.Error
                            },
                            errorKind = AccountProfileErrorKind.Load,
                            requestId = error.requestId(),
                        )
                    }
                }
        }
    }

    private fun applySnapshot(snapshot: AccountProfileSnapshot) {
        val draft = snapshot.user.toDraft(snapshot.clinics, snapshot.specialties)
        _uiState.update {
            it.copy(
                loadState = AccountProfileLoadState.Ready,
                user = snapshot.user,
                clinics = snapshot.clinics,
                specialties = snapshot.specialties,
                savedDraft = draft,
                draft = draft,
                avatarBytes = snapshot.avatarBytes,
                isEditing = false,
                isSaving = false,
                isAvatarBusy = false,
                showDiscardConfirmation = false,
                showAvatarDeleteConfirmation = false,
                nameInvalid = false,
                phoneInvalid = false,
                errorKind = if (snapshot.avatarLoadFailed) {
                    AccountProfileErrorKind.AvatarRefresh
                } else {
                    null
                },
                requestId = "",
                confirmation = null,
                saveIdempotencyKey = "",
                deleteAvatarIdempotencyKey = "",
            )
        }
    }

    private fun startEditing() {
        if (_uiState.value.loadState != AccountProfileLoadState.Ready) return
        _uiState.update {
            it.copy(
                isEditing = true,
                errorKind = null,
                requestId = "",
                confirmation = null,
            )
        }
    }

    private fun updateDraft(transform: AccountProfileDraft.() -> AccountProfileDraft) {
        val state = _uiState.value
        if (!state.isEditing || state.isSaving) return
        _uiState.update {
            it.copy(
                draft = transform(it.draft),
                nameInvalid = false,
                phoneInvalid = false,
                errorKind = null,
                requestId = "",
                confirmation = null,
                saveIdempotencyKey = "",
            )
        }
    }

    private fun selectClinic(id: String) {
        val clinic = _uiState.value.clinics.firstOrNull { it.id == id } ?: return
        updateDraft { copy(organizationId = clinic.id, hospital = clinic.name) }
    }

    private fun selectSpecialty(id: String) {
        val specialty = _uiState.value.specialties.firstOrNull { it.id == id } ?: return
        updateDraft { copy(specialtyId = specialty.id, department = specialty.name) }
    }

    private fun save() {
        val state = _uiState.value
        if (!state.isEditing || state.isSaving || state.isAvatarBusy) return
        val draft = state.draft.normalized()
        val nameInvalid = draft.name.isBlank()
        val phoneChanged = draft.phone != state.savedDraft.normalized().phone
        val phoneInvalid = phoneChanged && !draft.phone.isValidPhone()
        if (nameInvalid || phoneInvalid) {
            _uiState.update {
                it.copy(nameInvalid = nameInvalid, phoneInvalid = phoneInvalid)
            }
            return
        }
        if (phoneChanged) {
            viewModelScope.launch {
                if (state.savedDraft.phone.isBlank()) {
                    _effects.send(AccountProfileEffect.StartPhoneEnrollment)
                } else {
                    _effects.send(AccountProfileEffect.ReverifyPhone(draft.phone))
                }
            }
            return
        }
        if (!state.hasUnsavedChanges) {
            _uiState.update { it.copy(isEditing = false) }
            return
        }

        val key = state.saveIdempotencyKey.ifBlank(createIdempotencyKey)
        _uiState.update {
            it.copy(
                draft = draft,
                isSaving = true,
                nameInvalid = false,
                phoneInvalid = false,
                errorKind = null,
                requestId = "",
                confirmation = null,
                saveIdempotencyKey = key,
            )
        }
        viewModelScope.launch {
            runCatching { repository.updateProfile(draft, key) }
                .onSuccess { user ->
                    if (!user.confirms(draft, state.isProfessionalProfile)) {
                        _uiState.update {
                            it.copy(
                                isSaving = false,
                                errorKind = AccountProfileErrorKind.ServerUnconfirmed,
                            )
                        }
                        return@onSuccess
                    }
                    val confirmedDraft = user.toDraft(state.clinics, state.specialties)
                    _uiState.update {
                        it.copy(
                            user = user,
                            savedDraft = confirmedDraft,
                            draft = confirmedDraft,
                            isEditing = false,
                            isSaving = false,
                            errorKind = null,
                            requestId = "",
                            confirmation = AccountProfileConfirmation.ProfileSaved,
                            saveIdempotencyKey = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            errorKind = AccountProfileErrorKind.Save,
                            requestId = error.requestId(),
                        )
                    }
                }
        }
    }

    private fun requestDiscard() {
        val state = _uiState.value
        if (!state.isEditing || state.isSaving || state.isAvatarBusy) return
        if (state.hasUnsavedChanges) {
            _uiState.update { it.copy(showDiscardConfirmation = true) }
        } else {
            discard()
        }
    }

    private fun discard() {
        _uiState.update {
            it.copy(
                draft = it.savedDraft,
                isEditing = false,
                showDiscardConfirmation = false,
                nameInvalid = false,
                phoneInvalid = false,
                errorKind = null,
                requestId = "",
                confirmation = null,
                saveIdempotencyKey = "",
            )
        }
    }

    private fun uploadAvatar(action: AccountProfileAction.AvatarSelected) {
        val state = _uiState.value
        if (!state.isEditing || state.isAvatarBusy || state.isSaving) return
        if (action.contentType !in SUPPORTED_AVATAR_TYPES) {
            _uiState.update { it.copy(errorKind = AccountProfileErrorKind.AvatarType) }
            return
        }
        if (action.bytes.isEmpty()) {
            _uiState.update { it.copy(errorKind = AccountProfileErrorKind.AvatarRead) }
            return
        }
        if (action.bytes.size > MAX_AVATAR_BYTES) {
            _uiState.update { it.copy(errorKind = AccountProfileErrorKind.AvatarSize) }
            return
        }

        val key = createIdempotencyKey()
        _uiState.update {
            it.copy(
                isAvatarBusy = true,
                errorKind = null,
                requestId = "",
                confirmation = null,
            )
        }
        viewModelScope.launch {
            runCatching {
                val user = repository.uploadAvatar(
                    fileName = action.fileName,
                    contentType = action.contentType,
                    bytes = action.bytes,
                    idempotencyKey = key,
                )
                if (user.avatarFileId.isBlank() && user.avatarUrl.isBlank()) {
                    throw AvatarNotConfirmedException()
                }
                val downloaded = runCatching { repository.downloadAvatar() }
                    .getOrElse { throw AvatarDownloadException(it) }
                user to downloaded
            }.onSuccess { (user, avatarBytes) ->
                _uiState.update {
                    it.copy(
                        user = user,
                        avatarBytes = avatarBytes,
                        isAvatarBusy = false,
                        errorKind = null,
                        requestId = "",
                        confirmation = AccountProfileConfirmation.AvatarUpdated,
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        isAvatarBusy = false,
                        errorKind = when (error) {
                            is AvatarNotConfirmedException -> AccountProfileErrorKind.AvatarUnconfirmed
                            is AvatarDownloadException -> AccountProfileErrorKind.AvatarRefresh
                            else -> AccountProfileErrorKind.AvatarUpload
                        },
                        requestId = error.requestId(),
                    )
                }
            }
        }
    }

    private fun requestAvatarDelete() {
        val state = _uiState.value
        if (!state.hasAvatar || state.isAvatarBusy || state.isSaving) return
        _uiState.update {
            it.copy(
                showAvatarDeleteConfirmation = true,
                errorKind = null,
                requestId = "",
                confirmation = null,
            )
        }
    }

    private fun deleteAvatar() {
        val state = _uiState.value
        if (!state.showAvatarDeleteConfirmation || state.isAvatarBusy || !state.hasAvatar) return
        val key = state.deleteAvatarIdempotencyKey.ifBlank(createIdempotencyKey)
        _uiState.update {
            it.copy(
                showAvatarDeleteConfirmation = false,
                isAvatarBusy = true,
                errorKind = null,
                requestId = "",
                confirmation = null,
                deleteAvatarIdempotencyKey = key,
            )
        }
        viewModelScope.launch {
            runCatching { repository.deleteAvatar(key) }
                .onSuccess { user ->
                    if (user.avatarFileId.isNotBlank() || user.avatarUrl.isNotBlank()) {
                        _uiState.update {
                            it.copy(
                                isAvatarBusy = false,
                                errorKind = AccountProfileErrorKind.AvatarDeleteUnconfirmed,
                            )
                        }
                        return@onSuccess
                    }
                    _uiState.update {
                        it.copy(
                            user = user,
                            avatarBytes = null,
                            isAvatarBusy = false,
                            errorKind = null,
                            requestId = "",
                            confirmation = AccountProfileConfirmation.AvatarDeleted,
                            deleteAvatarIdempotencyKey = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isAvatarBusy = false,
                            errorKind = AccountProfileErrorKind.AvatarDelete,
                            requestId = error.requestId(),
                        )
                    }
                }
        }
    }
}

private class AvatarNotConfirmedException : IllegalStateException()
private class AvatarDownloadException(cause: Throwable) : IllegalStateException(cause)

private fun AuthUser.toDraft(
    clinics: List<ClinicOption>,
    specialties: List<SpecialtyOption>,
): AccountProfileDraft {
    val clinic = clinics.firstOrNull { it.id == organizationId }
        ?: clinics.firstOrNull { it.name.equals(hospital, ignoreCase = true) }
    val resolvedDepartment = department.ifBlank { specialty }
    val specialtyOption = specialties.firstOrNull {
        it.name.equals(resolvedDepartment, ignoreCase = true)
    }
    return AccountProfileDraft(
        name = name,
        phone = phone,
        license = license,
        organizationId = clinic?.id ?: organizationId,
        hospital = clinic?.name ?: hospital,
        specialtyId = specialtyOption?.id.orEmpty(),
        department = specialtyOption?.name ?: resolvedDepartment,
        address = address,
    ).normalized()
}

private fun AuthUser.confirms(draft: AccountProfileDraft, professional: Boolean): Boolean {
    val normalized = draft.normalized()
    if (name.trim() != normalized.name || address.trim() != normalized.address) return false
    if (!professional) return true
    val returnedDepartment = department.ifBlank { specialty }.trim()
    return license.trim() == normalized.license &&
        organizationId.trim() == normalized.organizationId &&
        hospital.trim() == normalized.hospital &&
        returnedDepartment == normalized.department
}

private fun String.isValidPhone(): Boolean {
    if (isBlank()) return false
    val digits = count(Char::isDigit)
    return digits in 8..15 && all { it.isDigit() || it in "+ -()." }
}

private fun Throwable.requestId(): String = (this as? SmartHealthApiException)?.requestId.orEmpty()

private val SUPPORTED_AVATAR_TYPES = setOf("image/jpeg", "image/png", "image/webp")
private const val MAX_AVATAR_BYTES = 5 * 1024 * 1024
