package com.example.smart_health_android.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.AccountProfileUpdateIntent
import com.example.smart_health_android.data.AccountProfileUpdateReceipt
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.AvatarCleanupAction
import com.example.smart_health_android.data.AvatarCleanupStatus
import com.example.smart_health_android.data.AvatarCleanupStatusSnapshot
import com.example.smart_health_android.data.AvatarDeleteIntent
import com.example.smart_health_android.data.AvatarDeleteReceipt
import com.example.smart_health_android.data.AvatarDownloadIntent
import com.example.smart_health_android.data.AvatarUploadIntent
import com.example.smart_health_android.data.AvatarUploadReceipt
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SpecialtyOption
import java.io.IOException
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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

enum class AccountProfileAvatarCleanup {
    Upload,
    Delete,
    OrphanUpload,
}

data class AccountProfileAvatarCleanupNotice(
    val action: AccountProfileAvatarCleanup,
    val status: AvatarCleanupStatus,
)

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
    val errorKind: AccountProfileErrorKind? = null,
    val requestId: String = "",
    val confirmation: AccountProfileConfirmation? = null,
    val avatarCleanupNotice: AccountProfileAvatarCleanupNotice? = null,
    internal val saveIdempotencyKey: String = "",
    internal val authSessionEpoch: Long = -1L,
    internal val uploadAvatarIdempotencyKey: String = "",
    internal val uploadAvatarFingerprint: String = "",
    internal val deleteAvatarIdempotencyKey: String = "",
    internal val deleteAvatarFileId: String = "",
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

data class AccountProfileSnapshot(
    val user: AuthUser,
    val clinics: List<ClinicOption>,
    val specialties: List<SpecialtyOption>,
    val avatarBytes: ByteArray?,
    val avatarLoadFailed: Boolean,
    val authSessionEpoch: Long,
    val avatarCleanup: AvatarCleanupStatusSnapshot,
)

interface AccountProfileRepository {
    suspend fun load(): AccountProfileSnapshot
    suspend fun updateProfile(intent: AccountProfileUpdateIntent): AccountProfileUpdateReceipt
    suspend fun uploadAvatar(intent: AvatarUploadIntent): AvatarUploadReceipt
    suspend fun deleteAvatar(intent: AvatarDeleteIntent): AvatarDeleteReceipt
    suspend fun downloadAvatar(intent: AvatarDownloadIntent): ByteArray
    fun isAuthorityCurrent(expectedUserId: String, expectedAuthSessionEpoch: Long): Boolean
}

class ApiAccountProfileRepository : AccountProfileRepository {
    override suspend fun load(): AccountProfileSnapshot {
        val authSessionEpoch = SmartHealthRepository.api.currentAuthSessionEpoch()
        val clinics = SmartHealthRepository.api.listClinics()
        val specialties = SmartHealthRepository.api.listSpecialties()
        val user = SmartHealthRepository.api.getMe()
        if (!isAuthorityCurrent(user.id, authSessionEpoch)) {
            throw authorityChangedException()
        }
        val workspaceId = user.canonicalWorkspaceId()
        if (workspaceId.isBlank()) {
            throw authorityChangedException()
        }
        val avatarCleanup = SmartHealthRepository.api.getMyAvatarCleanupStatus(
            expectedUserId = user.id,
            expectedWorkspaceId = workspaceId,
            expectedAuthSessionEpoch = authSessionEpoch,
        )
        val hasAvatar = user.avatarFileId.isNotBlank() || user.avatarUrl.isNotBlank()
        val avatarResult = if (hasAvatar) {
            runCatching { SmartHealthRepository.api.downloadMyAvatarBytes() }
        } else {
            Result.success(null)
        }
        if (!isAuthorityCurrent(user.id, authSessionEpoch)) {
            throw authorityChangedException()
        }
        return AccountProfileSnapshot(
            user = user,
            clinics = clinics,
            specialties = specialties,
            avatarBytes = avatarResult.getOrNull(),
            avatarLoadFailed = hasAvatar && avatarResult.isFailure,
            authSessionEpoch = authSessionEpoch,
            avatarCleanup = avatarCleanup,
        )
    }

    override suspend fun updateProfile(
        intent: AccountProfileUpdateIntent,
    ): AccountProfileUpdateReceipt = SmartHealthRepository.api.updateAccountProfile(intent)

    override suspend fun uploadAvatar(intent: AvatarUploadIntent): AvatarUploadReceipt =
        SmartHealthRepository.api.uploadMyAvatar(intent)

    override suspend fun deleteAvatar(intent: AvatarDeleteIntent): AvatarDeleteReceipt =
        SmartHealthRepository.api.deleteMyAvatar(intent)

    override suspend fun downloadAvatar(intent: AvatarDownloadIntent): ByteArray =
        SmartHealthRepository.api.downloadMyAvatarBytes(intent)

    override fun isAuthorityCurrent(
        expectedUserId: String,
        expectedAuthSessionEpoch: Long,
    ): Boolean = expectedUserId.isNotBlank() &&
        SmartHealthRepository.api.currentAuthToken() != null &&
        SmartHealthRepository.api.currentAuthSessionEpoch() == expectedAuthSessionEpoch
}

class AccountProfileViewModel(
    private val repository: AccountProfileRepository = ApiAccountProfileRepository(),
    private val createIdempotencyKey: () -> String = { UUID.randomUUID().toString() },
) : ViewModel() {
    private val _uiState = MutableStateFlow(AccountProfileUiState())
    val uiState = _uiState.asStateFlow()

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
            val hydratedCleanup = snapshot.avatarCleanup
                .takeIf { cleanup ->
                    cleanup.userId == snapshot.user.id &&
                        cleanup.workspaceId == snapshot.user.canonicalWorkspaceId()
                }
                ?.toNotice()
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
                errorKind = if (snapshot.avatarLoadFailed) {
                    AccountProfileErrorKind.AvatarRefresh
                } else {
                    null
                },
                requestId = "",
                confirmation = null,
                avatarCleanupNotice = hydratedCleanup,
                saveIdempotencyKey = "",
                authSessionEpoch = snapshot.authSessionEpoch,
                uploadAvatarIdempotencyKey = "",
                uploadAvatarFingerprint = "",
                deleteAvatarIdempotencyKey = "",
                deleteAvatarFileId = "",
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
        if (nameInvalid) {
            _uiState.update {
                it.copy(nameInvalid = true)
            }
            return
        }
        if (!state.hasUnsavedChanges) {
            _uiState.update { it.copy(isEditing = false) }
            return
        }
        val user = state.user ?: run {
            invalidateAuthority()
            return
        }
        if (!repository.isAuthorityCurrent(user.id, state.authSessionEpoch)) {
            invalidateAuthority()
            return
        }
        val key = state.saveIdempotencyKey.ifBlank(createIdempotencyKey)
        val intent = AccountProfileUpdateIntent(
            userId = user.id,
            name = draft.name,
            expectedPhone = state.savedDraft.normalized().phone,
            license = draft.license,
            hospital = draft.hospital,
            department = draft.department,
            specialty = draft.department,
            address = draft.address,
            expectedOrganizationId = user.organizationId.trim(),
            expectedChangedFields = accountProfileChangedFields(
                saved = state.savedDraft,
                updated = draft,
            ),
            idempotencyKey = key,
            expectedAuthSessionEpoch = state.authSessionEpoch,
        )
        _uiState.update {
            it.copy(
                draft = draft,
                isSaving = true,
                nameInvalid = false,
                errorKind = null,
                requestId = "",
                confirmation = null,
                saveIdempotencyKey = key,
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.updateProfile(intent).also { receipt ->
                    if (!receipt.confirms(intent)) {
                        throw ProfileNotConfirmedException()
                    }
                    requireCurrentAuthority(intent.userId, intent.expectedAuthSessionEpoch)
                }
            }
                .onSuccess { receipt ->
                    val confirmedUser = user.copy(
                        name = receipt.user.name,
                        phone = receipt.user.phone,
                        license = receipt.user.license,
                        hospital = receipt.user.hospital,
                        department = receipt.user.department,
                        specialty = receipt.user.specialty,
                        address = receipt.user.address,
                        organizationId = receipt.user.organizationId,
                        updatedAt = receipt.user.updatedAt,
                    )
                    val confirmedDraft = confirmedUser.toDraft(state.clinics, state.specialties)
                    _uiState.update {
                        it.copy(
                            user = confirmedUser,
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
                    if (error.isAuthorityChanged()) {
                        invalidateAuthority()
                        return@onFailure
                    }
                    val retainOperation = error.shouldRetainProfileOperation()
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            errorKind = if (error is ProfileNotConfirmedException) {
                                AccountProfileErrorKind.ServerUnconfirmed
                            } else {
                                AccountProfileErrorKind.Save
                            },
                            requestId = error.requestId(),
                            saveIdempotencyKey = if (retainOperation) key else "",
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
        val userId = state.user?.id.orEmpty()
        if (!repository.isAuthorityCurrent(userId, state.authSessionEpoch)) {
            invalidateAuthority()
            return
        }
        val bytes = action.bytes.copyOf()
        val sha256 = bytes.sha256()
        val fingerprint = listOf(
            action.fileName,
            action.contentType,
            bytes.size.toString(),
            sha256,
        ).joinToString(separator = "\u0000")
        val key = if (
            state.uploadAvatarFingerprint == fingerprint &&
            state.uploadAvatarIdempotencyKey.isNotBlank()
        ) {
            state.uploadAvatarIdempotencyKey
        } else {
            createIdempotencyKey()
        }
        val intent = AvatarUploadIntent(
            userId = userId,
            fileName = action.fileName,
            contentType = action.contentType,
            bytes = bytes,
            sha256 = sha256,
            idempotencyKey = key,
            expectedAuthSessionEpoch = state.authSessionEpoch,
        )
        _uiState.update {
            it.copy(
                isAvatarBusy = true,
                errorKind = null,
                requestId = "",
                confirmation = null,
                uploadAvatarIdempotencyKey = key,
                uploadAvatarFingerprint = fingerprint,
            )
        }
        viewModelScope.launch {
            runCatching {
                val receipt = repository.uploadAvatar(intent)
                if (!receipt.confirms(intent)) {
                    throw AvatarNotConfirmedException()
                }
                requireCurrentAuthority(intent.userId, intent.expectedAuthSessionEpoch)
                val downloadIntent = AvatarDownloadIntent(
                    userId = intent.userId,
                    fileId = receipt.avatar.fileId,
                    sha256 = receipt.avatar.sha256,
                    expectedAuthSessionEpoch = intent.expectedAuthSessionEpoch,
                )
                val downloaded = runCatching { repository.downloadAvatar(downloadIntent) }
                    .getOrElse { throw AvatarDownloadException(it) }
                if (downloaded.sha256() != receipt.avatar.sha256) {
                    throw AvatarDownloadException(
                        IllegalStateException("Downloaded avatar digest mismatch"),
                    )
                }
                requireCurrentAuthority(intent.userId, intent.expectedAuthSessionEpoch)
                receipt to downloaded
            }.onSuccess { (receipt, avatarBytes) ->
                _uiState.update {
                    val user = checkNotNull(it.user).copy(
                        avatarFileId = receipt.avatar.fileId,
                        avatarUrl = receipt.avatar.downloadUrl,
                    )
                    it.copy(
                        user = user,
                        avatarBytes = avatarBytes,
                        isAvatarBusy = false,
                        errorKind = null,
                        requestId = "",
                        confirmation = if (receipt.cleanup.status.isUnresolved()) {
                            null
                        } else {
                            AccountProfileConfirmation.AvatarUpdated
                        },
                        avatarCleanupNotice = receipt.cleanup.status.toNotice(
                            AccountProfileAvatarCleanup.Upload,
                        ),
                        uploadAvatarIdempotencyKey = "",
                        uploadAvatarFingerprint = "",
                    )
                }
            }.onFailure { error ->
                if (error.isAuthorityChanged()) {
                    invalidateAuthority()
                    return@onFailure
                }
                val retainOperation = error.shouldRetainAvatarOperation()
                _uiState.update {
                    it.copy(
                        isAvatarBusy = false,
                        errorKind = when (error) {
                            is AvatarNotConfirmedException -> AccountProfileErrorKind.AvatarUnconfirmed
                            is AvatarDownloadException -> AccountProfileErrorKind.AvatarRefresh
                            else -> AccountProfileErrorKind.AvatarUpload
                        },
                        requestId = error.requestId(),
                        uploadAvatarIdempotencyKey = if (retainOperation) key else "",
                        uploadAvatarFingerprint = if (retainOperation) fingerprint else "",
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
        val userId = state.user?.id.orEmpty()
        val expectedAvatarFileId = state.user?.avatarFileId.orEmpty()
        if (
            expectedAvatarFileId.isBlank() ||
            !repository.isAuthorityCurrent(userId, state.authSessionEpoch)
        ) {
            invalidateAuthority()
            return
        }
        val key = if (
            state.deleteAvatarFileId == expectedAvatarFileId &&
            state.deleteAvatarIdempotencyKey.isNotBlank()
        ) {
            state.deleteAvatarIdempotencyKey
        } else {
            createIdempotencyKey()
        }
        val intent = AvatarDeleteIntent(
            userId = userId,
            expectedAvatarFileId = expectedAvatarFileId,
            idempotencyKey = key,
            expectedAuthSessionEpoch = state.authSessionEpoch,
        )
        _uiState.update {
            it.copy(
                showAvatarDeleteConfirmation = false,
                isAvatarBusy = true,
                errorKind = null,
                requestId = "",
                confirmation = null,
                deleteAvatarIdempotencyKey = key,
                deleteAvatarFileId = expectedAvatarFileId,
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.deleteAvatar(intent).also { receipt ->
                    if (!receipt.confirms(intent)) {
                        throw AvatarNotConfirmedException()
                    }
                    requireCurrentAuthority(intent.userId, intent.expectedAuthSessionEpoch)
                }
            }
                .onSuccess { receipt ->
                    _uiState.update {
                        val user = checkNotNull(it.user).copy(
                            avatarFileId = "",
                            avatarUrl = "",
                        )
                        it.copy(
                            user = user,
                            avatarBytes = null,
                            isAvatarBusy = false,
                            errorKind = null,
                            requestId = "",
                            confirmation = if (receipt.cleanup.status.isUnresolved()) {
                                null
                            } else {
                                AccountProfileConfirmation.AvatarDeleted
                            },
                            avatarCleanupNotice = receipt.cleanup.status.toNotice(
                                AccountProfileAvatarCleanup.Delete,
                            ),
                            deleteAvatarIdempotencyKey = "",
                            deleteAvatarFileId = "",
                        )
                    }
                }
                .onFailure { error ->
                    if (error.isAuthorityChanged()) {
                        invalidateAuthority()
                        return@onFailure
                    }
                    val retainOperation = error.shouldRetainAvatarOperation()
                    _uiState.update {
                        it.copy(
                            isAvatarBusy = false,
                            errorKind = if (error is AvatarNotConfirmedException) {
                                AccountProfileErrorKind.AvatarDeleteUnconfirmed
                            } else {
                                AccountProfileErrorKind.AvatarDelete
                            },
                            requestId = error.requestId(),
                            deleteAvatarIdempotencyKey = if (retainOperation) key else "",
                            deleteAvatarFileId = if (retainOperation) expectedAvatarFileId else "",
                        )
                    }
                }
        }
    }

    private fun requireCurrentAuthority(userId: String, authSessionEpoch: Long) {
        if (!repository.isAuthorityCurrent(userId, authSessionEpoch)) {
            throw authorityChangedException()
        }
    }

    private fun invalidateAuthority() {
        _uiState.update {
            AccountProfileUiState(
                loadState = AccountProfileLoadState.PermissionDenied,
                errorKind = AccountProfileErrorKind.Load,
            )
        }
    }
}

private class ProfileNotConfirmedException : IllegalStateException()
private class AvatarNotConfirmedException : IllegalStateException()
private class AvatarDownloadException(cause: Throwable) : IllegalStateException(cause)

private fun authorityChangedException() = SmartHealthApiException(
    statusCode = 409,
    code = "AUTH_SESSION_REPLACED",
    message = "Authentication session changed while account profile data was in flight",
)

private fun AvatarCleanupStatus.isUnresolved(): Boolean =
    this == AvatarCleanupStatus.Pending || this == AvatarCleanupStatus.DeadLetter

private fun AvatarCleanupStatus.toNotice(
    action: AccountProfileAvatarCleanup,
): AccountProfileAvatarCleanupNotice? = if (isUnresolved()) {
    AccountProfileAvatarCleanupNotice(action = action, status = this)
} else {
    null
}

private fun AvatarCleanupStatusSnapshot.toNotice(): AccountProfileAvatarCleanupNotice? {
    val profileAction = when (action) {
        AvatarCleanupAction.None -> return null
        AvatarCleanupAction.Upload -> AccountProfileAvatarCleanup.Upload
        AvatarCleanupAction.Delete -> AccountProfileAvatarCleanup.Delete
        AvatarCleanupAction.OrphanUpload -> AccountProfileAvatarCleanup.OrphanUpload
    }
    return status.toNotice(profileAction)
}

private fun accountProfileChangedFields(
    saved: AccountProfileDraft,
    updated: AccountProfileDraft,
): List<String> {
    val previous = saved.normalized()
    val next = updated.normalized()
    return buildSet {
        if (previous.name != next.name) add("name")
        if (previous.license != next.license) add("license")
        if (previous.hospital != next.hospital) add("hospital")
        if (previous.department != next.department) {
            add("department")
            add("specialty")
        }
        if (previous.address != next.address) add("address")
    }.sorted()
}

private fun AccountProfileUpdateReceipt.confirms(intent: AccountProfileUpdateIntent): Boolean =
    userId == intent.userId &&
        this.intent == "profile_update" &&
        changedFields == intent.expectedChangedFields &&
        changedFields == changedFields.sorted() &&
        changedFields.toSet().size == changedFields.size &&
        user.id == intent.userId &&
        user.name == intent.name &&
        user.title.length <= 160 &&
        user.title == user.title.trim() &&
        user.phone == intent.expectedPhone &&
        user.license == intent.license &&
        user.hospital == intent.hospital &&
        user.department == intent.department &&
        user.specialty == intent.specialty &&
        user.address == intent.address &&
        user.organizationId == intent.expectedOrganizationId &&
        user.updatedAt.isCanonicalInstant()

private fun AvatarUploadReceipt.confirms(intent: AvatarUploadIntent): Boolean =
    avatar.fileId.isNotBlank() &&
        avatar.ownerUserId == intent.userId &&
        avatar.name == intent.fileName &&
        avatar.contentType == intent.contentType &&
        avatar.byteSize == intent.bytes.size &&
        avatar.sha256 == intent.sha256 &&
        avatar.downloadUrl == "/api/v1/me/avatar" &&
        avatar.uploadedAt.isCanonicalInstant() &&
        cleanup.previousFileId.length <= 160 &&
        operationId.isNotBlank()

private fun AvatarDeleteReceipt.confirms(intent: AvatarDeleteIntent): Boolean =
    deleted &&
        avatar.fileId == intent.expectedAvatarFileId &&
        avatar.ownerUserId == intent.userId &&
        avatar.deletedAt.isCanonicalInstant() &&
        cleanup.previousFileId == intent.expectedAvatarFileId &&
        operationId.isNotBlank()

private fun String.isCanonicalInstant(): Boolean =
    isNotBlank() && this == trim() && runCatching { Instant.parse(this) }.isSuccess

private fun ByteArray.sha256(): String = MessageDigest.getInstance("SHA-256")
    .digest(this)
    .joinToString(separator = "") { byte -> "%02x".format(byte) }

private fun Throwable.isAuthorityChanged(): Boolean = generateSequence(this) { it.cause }
    .filterIsInstance<SmartHealthApiException>()
    .any { it.code == "AUTH_SESSION_REPLACED" }

private fun Throwable.shouldRetainAvatarOperation(): Boolean {
    if (this is AvatarNotConfirmedException || this is AvatarDownloadException) return true
    val apiError = generateSequence(this) { it.cause }
        .filterIsInstance<SmartHealthApiException>()
        .firstOrNull()
    if (apiError != null) {
        if (apiError.code == "AUTH_SESSION_REPLACED") return false
        if (
            apiError.code in setOf(
                "AVATAR_UPLOAD_STAGE_IN_PROGRESS",
                "AVATAR_UPLOAD_STAGE_CLEANUP_IN_PROGRESS",
                "AVATAR_UPLOAD_STAGE_FENCE_LOST",
            )
        ) {
            return true
        }
        return apiError.statusCode >= 500 || apiError.statusCode in setOf(408, 429)
    }
    return this is IOException
}

private fun Throwable.shouldRetainProfileOperation(): Boolean {
    if (this is ProfileNotConfirmedException) return true
    val apiError = generateSequence(this) { it.cause }
        .filterIsInstance<SmartHealthApiException>()
        .firstOrNull()
    if (apiError != null) {
        if (apiError.code == "AUTH_SESSION_REPLACED") return false
        return apiError.statusCode >= 500 || apiError.statusCode in setOf(408, 429)
    }
    return this is IOException
}

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

private fun Throwable.requestId(): String = (this as? SmartHealthApiException)?.requestId.orEmpty()

private val SUPPORTED_AVATAR_TYPES = setOf("image/jpeg", "image/png", "image/webp")
private const val MAX_AVATAR_BYTES = 2 * 1024 * 1024
