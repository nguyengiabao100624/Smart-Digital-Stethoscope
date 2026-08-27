package com.example.smart_health_android.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.ActiveProfileResult
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientMutationIntent
import com.example.smart_health_android.data.PatientMutationReceipt
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import java.io.IOException
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class FamilyProfilesLoadState {
    Loading,
    Ready,
    Empty,
    Offline,
    PermissionDenied,
    Error,
}

data class FamilyProfileDraft(
    val name: String = "",
    val relationship: String = "",
    val dateOfBirth: String = "",
    val gender: String = "",
    val phone: String = "",
    val notes: String = "",
    val bloodType: String = "unknown",
    val allergies: String = "",
    val emergencyName: String = "",
    val emergencyPhone: String = "",
    val emergencyRelationship: String = "",
) {
    fun toMutation(): FamilyProfileMutation = FamilyProfileMutation(
        name = name.trim(),
        relationship = relationship.trim(),
        dateOfBirth = dateOfBirth.trim(),
        gender = gender.trim(),
        phone = phone.trim(),
        notes = notes.trim(),
        bloodType = bloodType.trim().ifBlank { "unknown" },
        allergies = allergies
            .split(',', '\n')
            .map(String::trim)
            .filter(String::isNotBlank)
            .distinctBy(String::lowercase),
        emergencyContact = EmergencyContact(
            name = emergencyName.trim(),
            phone = emergencyPhone.trim(),
            relationship = emergencyRelationship.trim(),
        ),
    )
}

data class FamilyProfileMutation(
    val name: String,
    val relationship: String,
    val dateOfBirth: String,
    val gender: String,
    val phone: String,
    val notes: String,
    val bloodType: String,
    val allergies: List<String>,
    val emergencyContact: EmergencyContact,
)

data class FamilyMutationAuthority(
    val accountId: String,
    val workspaceId: String,
    val authSessionId: String,
    val authSessionEpoch: Long,
) {
    val isComplete: Boolean
        get() = accountId.isNotBlank() &&
            workspaceId.isNotBlank() &&
            authSessionId.isNotBlank() &&
            authSessionEpoch >= 0L
}

data class FamilyMutationSessionAuthority(
    val authSessionId: String,
    val authSessionEpoch: Long,
) {
    val isComplete: Boolean
        get() = authSessionId.isNotBlank() && authSessionEpoch >= 0L
}

data class FamilyProfilesUiState(
    val loadState: FamilyProfilesLoadState = FamilyProfilesLoadState.Loading,
    val profiles: List<Patient> = emptyList(),
    val activePatientId: String = "",
    val editingProfileId: String = "",
    val draft: FamilyProfileDraft = FamilyProfileDraft(),
    val isSaving: Boolean = false,
    val switchingProfileId: String = "",
    val pendingDelete: Patient? = null,
    val deletingProfileId: String = "",
    val errorMessage: String = "",
    val fieldErrors: Map<String, String> = emptyMap(),
    val confirmationMessage: String = "",
)

sealed interface FamilyProfilesAction {
    data object Retry : FamilyProfilesAction
    data object CreateNew : FamilyProfilesAction
    data class Edit(val patientId: String) : FamilyProfilesAction
    data class DraftChanged(val field: FamilyProfileField, val value: String) : FamilyProfilesAction
    data object Save : FamilyProfilesAction
    data class SwitchActive(val patientId: String) : FamilyProfilesAction
    data class RequestDelete(val patientId: String) : FamilyProfilesAction
    data object CancelDelete : FamilyProfilesAction
    data object ConfirmDelete : FamilyProfilesAction
}

sealed interface FamilyProfilesEffect {
    data class ActiveProfileConfirmed(
        val result: ActiveProfileResult,
        val expectedPatientId: String,
    ) : FamilyProfilesEffect
}

enum class FamilyProfileField {
    Name,
    Relationship,
    DateOfBirth,
    Gender,
    Phone,
    Notes,
    BloodType,
    Allergies,
    EmergencyName,
    EmergencyPhone,
    EmergencyRelationship,
}

interface FamilyProfilesRepository {
    val mutationOutbox: FamilyMutationOutbox
    suspend fun currentUser(): AuthUser
    suspend fun listProfiles(): List<Patient>
    fun captureMutationSessionAuthority(): FamilyMutationSessionAuthority?
    fun isMutationSessionAuthorityCurrent(authority: FamilyMutationSessionAuthority): Boolean
    suspend fun create(
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt
    suspend fun update(
        patientId: String,
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt
    suspend fun delete(
        patientId: String,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt
    suspend fun switchActive(patientId: String, idempotencyKey: String): ActiveProfileResult
}

class ApiFamilyProfilesRepository : FamilyProfilesRepository {
    override val mutationOutbox: FamilyMutationOutbox = ShcareFamilyMutationOutbox
    override suspend fun currentUser(): AuthUser = SmartHealthRepository.api.getMe()
    override suspend fun listProfiles(): List<Patient> = SmartHealthRepository.api.listPatients()
    override fun captureMutationSessionAuthority(): FamilyMutationSessionAuthority? {
        val authSessionId = SmartHealthRepository.api.currentAuthSessionId()?.trim().orEmpty()
        return FamilyMutationSessionAuthority(
            authSessionId = authSessionId,
            authSessionEpoch = SmartHealthRepository.api.currentAuthSessionEpoch(),
        ).takeIf { it.isComplete }
    }

    override fun isMutationSessionAuthorityCurrent(
        authority: FamilyMutationSessionAuthority,
    ): Boolean = authority.isComplete &&
        SmartHealthRepository.api.currentAuthSessionId()?.trim() == authority.authSessionId &&
        SmartHealthRepository.api.currentAuthSessionEpoch() == authority.authSessionEpoch

    override suspend fun create(
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt = SmartHealthRepository.api.createPatientWithReceipt(
        patientCode = "",
        name = mutation.name,
        dateOfBirth = mutation.dateOfBirth,
        gender = mutation.gender,
        phone = mutation.phone,
        notes = mutation.notes,
        bloodType = mutation.bloodType,
        allergies = mutation.allergies,
        emergencyContact = mutation.emergencyContact,
        profileType = "dependent",
        relationship = mutation.relationship,
        idempotencyKey = idempotencyKey,
        expectedUserId = authority.accountId,
        expectedWorkspaceId = authority.workspaceId,
        expectedAuthSessionId = authority.authSessionId,
        expectedAuthSessionEpoch = authority.authSessionEpoch,
    )

    override suspend fun update(
        patientId: String,
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt = SmartHealthRepository.api.updatePatientWithReceipt(
        patientId = patientId,
        name = mutation.name,
        dateOfBirth = mutation.dateOfBirth,
        gender = mutation.gender,
        phone = mutation.phone,
        notes = mutation.notes,
        bloodType = mutation.bloodType,
        allergies = mutation.allergies,
        emergencyContact = mutation.emergencyContact,
        relationship = mutation.relationship,
        idempotencyKey = idempotencyKey,
        expectedUserId = authority.accountId,
        expectedWorkspaceId = authority.workspaceId,
        expectedAuthSessionId = authority.authSessionId,
        expectedAuthSessionEpoch = authority.authSessionEpoch,
    )

    override suspend fun delete(
        patientId: String,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt = SmartHealthRepository.api.deletePatientWithReceipt(
        patientId = patientId,
        idempotencyKey = idempotencyKey,
        expectedUserId = authority.accountId,
        expectedWorkspaceId = authority.workspaceId,
        expectedAuthSessionId = authority.authSessionId,
        expectedAuthSessionEpoch = authority.authSessionEpoch,
    )

    override suspend fun switchActive(
        patientId: String,
        idempotencyKey: String,
    ): ActiveProfileResult = SmartHealthRepository.api.switchActiveProfile(patientId, idempotencyKey)
}

class FamilyProfilesViewModel(
    private val repository: FamilyProfilesRepository = ApiFamilyProfilesRepository(),
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val today: () -> LocalDate = LocalDate::now,
    private val mutationOutbox: FamilyMutationOutbox = repository.mutationOutbox,
) : ViewModel() {
    private data class PendingActiveProfileSwitch(
        val patientId: String,
        val idempotencyKey: String,
    )

    private data class PendingDeleteMutation(
        val patientId: String,
        val profile: Patient,
        val idempotencyKey: String,
        val authority: FamilyMutationAuthority,
    )

    private data class PendingSaveMutation(
        val intent: PatientMutationIntent,
        val patientId: String,
        val mutation: FamilyProfileMutation,
        val idempotencyKey: String,
        val authority: FamilyMutationAuthority,
    )

    private val _uiState = MutableStateFlow(FamilyProfilesUiState())
    val uiState = _uiState.asStateFlow()

    private val _effects = Channel<FamilyProfilesEffect>(capacity = Channel.BUFFERED)
    val effects = _effects.receiveAsFlow()

    // The in-memory copy mirrors the encrypted, owner/workspace/session-bound outbox.
    // It is never authoritative by itself and is not dispatched unless persistence succeeds.
    private var pendingSaveMutation: PendingSaveMutation? = null
    private var pendingActiveProfileSwitch: PendingActiveProfileSwitch? = null
    private var pendingDeleteMutation: PendingDeleteMutation? = null
    private var outboxBlocked = false
    private var outboxRecoveryMessage = ""
    private var confirmedAccountId = ""
    private var confirmedWorkspaceId = ""
    private var confirmedMutationAuthority: FamilyMutationAuthority? = null

    init {
        load()
    }

    fun onAction(action: FamilyProfilesAction) {
        when (action) {
            FamilyProfilesAction.Retry -> load()
            FamilyProfilesAction.CreateNew -> edit(null)
            is FamilyProfilesAction.Edit -> edit(_uiState.value.profiles.firstOrNull { it.id == action.patientId })
            is FamilyProfilesAction.DraftChanged -> updateDraft(action.field, action.value)
            FamilyProfilesAction.Save -> save()
            is FamilyProfilesAction.SwitchActive -> switchActive(action.patientId)
            is FamilyProfilesAction.RequestDelete -> requestDelete(action.patientId)
            FamilyProfilesAction.CancelDelete -> _uiState.update { it.copy(pendingDelete = null) }
            FamilyProfilesAction.ConfirmDelete -> deleteConfirmed()
        }
    }

    private fun load() {
        val state = _uiState.value
        if (state.isSaving || state.deletingProfileId.isNotBlank() || state.switchingProfileId.isNotBlank()) return
        _uiState.update {
            it.copy(
                loadState = FamilyProfilesLoadState.Loading,
                errorMessage = "",
                confirmationMessage = "",
            )
        }
        val sessionAuthority = repository.captureMutationSessionAuthority()
        if (sessionAuthority == null || !sessionAuthority.isComplete) {
            confirmedMutationAuthority = null
            confirmedAccountId = ""
            confirmedWorkspaceId = ""
            _uiState.update {
                it.copy(
                    loadState = FamilyProfilesLoadState.PermissionDenied,
                    profiles = emptyList(),
                    errorMessage = "Máy chủ chưa xác nhận phiên đăng nhập hiện tại.",
                )
            }
            return
        }
        viewModelScope.launch {
            val userRequest = async { runCatching { repository.currentUser() } }
            val profilesRequest = async { runCatching { repository.listProfiles() } }
            val user = userRequest.await()
            val profiles = profilesRequest.await()
            val error = user.exceptionOrNull() ?: profiles.exceptionOrNull()
            if (error != null) {
                _uiState.update {
                    it.copy(
                        loadState = when {
                            error is SmartHealthApiException && error.statusCode in setOf(401, 403) -> {
                                FamilyProfilesLoadState.PermissionDenied
                            }
                            error is IOException && error !is SmartHealthApiException -> {
                                FamilyProfilesLoadState.Offline
                            }
                            else -> FamilyProfilesLoadState.Error
                        },
                        errorMessage = error.message.orEmpty(),
                    )
                }
                return@launch
            }
            if (!repository.isMutationSessionAuthorityCurrent(sessionAuthority)) {
                confirmedMutationAuthority = null
                confirmedAccountId = ""
                confirmedWorkspaceId = ""
                _uiState.update {
                    it.copy(
                        loadState = FamilyProfilesLoadState.PermissionDenied,
                        profiles = emptyList(),
                        errorMessage = "Phiên đăng nhập đã thay đổi trong khi tải hồ sơ gia đình.",
                    )
                }
                return@launch
            }
            applyLoaded(user.getOrThrow(), profiles.getOrThrow(), sessionAuthority)
        }
    }

    private fun applyLoaded(
        user: AuthUser,
        loadedProfiles: List<Patient>,
        sessionAuthority: FamilyMutationSessionAuthority,
    ) {
        confirmedAccountId = user.id.trim()
        confirmedWorkspaceId = user.canonicalWorkspaceId().trim()
        confirmedMutationAuthority = FamilyMutationAuthority(
            accountId = confirmedAccountId,
            workspaceId = confirmedWorkspaceId,
            authSessionId = sessionAuthority.authSessionId,
            authSessionEpoch = sessionAuthority.authSessionEpoch,
        ).takeIf { it.isComplete }
        if (confirmedMutationAuthority == null) {
            confirmedAccountId = ""
            confirmedWorkspaceId = ""
            _uiState.update {
                it.copy(
                    loadState = FamilyProfilesLoadState.PermissionDenied,
                    profiles = emptyList(),
                    errorMessage = "Máy chủ chưa xác nhận phiên tài khoản và workspace hiện tại.",
                )
            }
            return
        }
        val profiles = loadedProfiles
            .filter { it.profileType in setOf("self", "dependent") }
            .sortedWith(compareBy<Patient> { if (it.profileType == "self") 0 else 1 }.thenBy { it.name.lowercase() })
        if (profiles.any { it.organizationId.trim() != confirmedWorkspaceId }) {
            confirmedMutationAuthority = null
            confirmedAccountId = ""
            confirmedWorkspaceId = ""
            _uiState.update {
                it.copy(
                    loadState = FamilyProfilesLoadState.PermissionDenied,
                    profiles = emptyList(),
                    errorMessage = "Workspace đã thay đổi trong khi tải hồ sơ gia đình.",
                )
            }
            return
        }
        if (pendingActiveProfileSwitch?.patientId == user.activePatientId) {
            pendingActiveProfileSwitch = null
        }
        val loadedAuthority = checkNotNull(confirmedMutationAuthority)
        outboxRecoveryMessage = when (val checkpoint = mutationOutbox.load(loadedAuthority)) {
            FamilyMutationOutboxLoad.Empty -> {
                outboxBlocked = false
                pendingSaveMutation = null
                pendingDeleteMutation = null
                ""
            }
            FamilyMutationOutboxLoad.Unavailable -> {
                outboxBlocked = true
                pendingSaveMutation = null
                pendingDeleteMutation = null
                "Không thể đọc bản ghi khôi phục được bảo vệ của thay đổi hồ sơ gia đình. " +
                    "Ứng dụng chưa xóa hoặc gửi lại yêu cầu này. Hãy liên hệ bộ phận hỗ trợ trước khi " +
                    "xóa dữ liệu ứng dụng hoặc bắt đầu yêu cầu khác cho tài khoản này."
            }
            is FamilyMutationOutboxLoad.Blocked -> {
                outboxBlocked = true
                pendingSaveMutation = null
                pendingDeleteMutation = null
                "Bản ghi khôi phục được bảo vệ cho yêu cầu ${checkpoint.intent.vietnameseAction} " +
                    "hồ sơ gia đình đã hết hạn hoặc bị chặn khi chưa có kết quả xác nhận. " +
                    "Hãy liên hệ bộ phận hỗ trợ với mã tham chiếu ${checkpoint.idempotencyKey} trước khi thử lại."
            }
            is FamilyMutationOutboxLoad.Pending -> {
                outboxBlocked = false
                restorePendingMutation(checkpoint.entry, profiles)
                "Yêu cầu ${checkpoint.entry.intent.vietnameseAction} hồ sơ gia đình được bảo vệ đang chờ " +
                    "đối soát chính xác với máy chủ. Khi thử lại trong đúng tài khoản ban đầu, ứng dụng sẽ " +
                    "dùng lại chính yêu cầu này."
            }
        }
        val resumableSave = pendingSaveMutation
            ?.takeIf { it.authority.hasSameServerAuthority(loadedAuthority) }
        val resumableDelete = pendingDeleteMutation
            ?.takeIf { it.authority.hasSameServerAuthority(loadedAuthority) }
            ?.let { pending ->
                profiles.firstOrNull { it.id == pending.patientId } ?: pending.profile
            }
        _uiState.update {
            it.copy(
                loadState = if (profiles.isEmpty()) FamilyProfilesLoadState.Empty else FamilyProfilesLoadState.Ready,
                profiles = profiles,
                activePatientId = user.activePatientId,
                editingProfileId = resumableSave?.patientId.orEmpty(),
                draft = resumableSave?.mutation?.toDraft() ?: FamilyProfileDraft(),
                pendingDelete = resumableDelete,
                errorMessage = outboxRecoveryMessage,
                fieldErrors = emptyMap(),
            )
        }
    }

    private fun edit(profile: Patient?) {
        val state = _uiState.value
        if (state.isSaving || state.deletingProfileId.isNotBlank() || state.switchingProfileId.isNotBlank()) return
        if (pendingSaveMutation != null) {
            _uiState.update {
                it.copy(
                    errorMessage =
                        "Thay đổi hồ sơ gia đình trước đó phải được đối soát trong đúng phiên ban đầu trước.",
                )
            }
            return
        }
        _uiState.update {
            it.copy(
                editingProfileId = profile?.id.orEmpty(),
                draft = profile?.toDraft() ?: FamilyProfileDraft(),
                fieldErrors = emptyMap(),
                errorMessage = "",
                confirmationMessage = "",
            )
        }
    }

    private fun updateDraft(field: FamilyProfileField, value: String) {
        val state = _uiState.value
        if (state.isSaving) return
        if (pendingSaveMutation != null) {
            _uiState.update {
                it.copy(
                    errorMessage =
                        "Thay đổi hồ sơ gia đình trước đó phải được đối soát trước khi sửa nội dung yêu cầu.",
                )
            }
            return
        }
        val draft = when (field) {
            FamilyProfileField.Name -> state.draft.copy(name = value)
            FamilyProfileField.Relationship -> state.draft.copy(relationship = value)
            FamilyProfileField.DateOfBirth -> state.draft.copy(dateOfBirth = value.take(10))
            FamilyProfileField.Gender -> state.draft.copy(gender = value)
            FamilyProfileField.Phone -> state.draft.copy(phone = value)
            FamilyProfileField.Notes -> state.draft.copy(notes = value)
            FamilyProfileField.BloodType -> state.draft.copy(bloodType = value)
            FamilyProfileField.Allergies -> state.draft.copy(allergies = value)
            FamilyProfileField.EmergencyName -> state.draft.copy(emergencyName = value)
            FamilyProfileField.EmergencyPhone -> state.draft.copy(emergencyPhone = value)
            FamilyProfileField.EmergencyRelationship -> state.draft.copy(emergencyRelationship = value)
        }
        _uiState.update {
            it.copy(
                draft = draft,
                fieldErrors = it.fieldErrors - field.wireName,
                errorMessage = "",
            )
        }
    }

    private fun save() {
        val state = _uiState.value
        if (state.isSaving || state.deletingProfileId.isNotBlank()) return
        if (outboxBlocked) {
            _uiState.update {
                it.copy(
                    errorMessage = outboxRecoveryMessage.ifBlank {
                        "Một thay đổi hồ sơ gia đình được bảo vệ cần bộ phận hỗ trợ xử lý " +
                            "trước khi có thể gửi yêu cầu khác."
                    },
                )
            }
            return
        }
        val pending = pendingSaveMutation ?: run {
            val authority = confirmedMutationAuthority
            if (authority == null || !authority.isComplete) {
                _uiState.update {
                    it.copy(errorMessage = "Máy chủ chưa xác nhận tài khoản và workspace hiện tại.")
                }
                return
            }
            val validation = validate(state.draft)
            if (validation.isNotEmpty()) {
                _uiState.update { it.copy(fieldErrors = validation, errorMessage = "") }
                return
            }
            PendingSaveMutation(
                intent = if (state.editingProfileId.isBlank()) {
                    PatientMutationIntent.Create
                } else {
                    PatientMutationIntent.Update
                },
                patientId = state.editingProfileId,
                mutation = state.draft.toMutation(),
                idempotencyKey = idempotencyKeyFactory(),
                authority = authority,
            ).also { pendingSaveMutation = it }
        }
        if (mutationOutbox.persist(pending.toOutboxEntry()) == null) {
            outboxBlocked = true
            outboxRecoveryMessage =
                "Không thể lưu an toàn bản ghi khôi phục cho thay đổi hồ sơ gia đình nên yêu cầu chưa được gửi. " +
                    "Hãy liên hệ bộ phận hỗ trợ trước khi thử lại."
            _uiState.update {
                it.copy(errorMessage = outboxRecoveryMessage)
            }
            return
        }
        val dispatchAuthority = reauthorizeFamilyMutation(pending.authority)
        if (dispatchAuthority == null) {
            _uiState.update {
                it.copy(
                    isSaving = false,
                    errorMessage =
                        "Yêu cầu lưu hồ sơ gia đình đang được cách ly cho đến khi tài khoản, workspace và " +
                            "phiên ban đầu hoạt động trở lại.",
                )
            }
            return
        }
        _uiState.update { it.copy(isSaving = true, errorMessage = "", confirmationMessage = "") }
        viewModelScope.launch {
            runCatching {
                if (pending.intent == PatientMutationIntent.Create) {
                    repository.create(
                        mutation = pending.mutation,
                        idempotencyKey = pending.idempotencyKey,
                        authority = dispatchAuthority,
                    )
                } else {
                    repository.update(
                        patientId = pending.patientId,
                        mutation = pending.mutation,
                        idempotencyKey = pending.idempotencyKey,
                        authority = dispatchAuthority,
                    )
                }
            }.onSuccess { receipt ->
                if (!isFamilyMutationAuthorityCurrentForUi(pending.authority, dispatchAuthority)) {
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            errorMessage = "Kết quả lưu hồ sơ gia đình đã được cách ly vì phiên đăng nhập thay đổi.",
                        )
                    }
                    return@onSuccess
                }
                val confirmed = receipt.confirmedPatientOrNull(
                    expectedIntent = pending.intent,
                    expectedPatientId = pending.patientId,
                    authority = pending.authority,
                )
                if (confirmed == null) {
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            errorMessage = "Máy chủ chưa xác nhận chính xác thay đổi hồ sơ gia đình.",
                        )
                    }
                    return@onSuccess
                }
                if (
                    !mutationOutbox.clearExact(
                        authority = pending.authority,
                        intent = pending.intent,
                        idempotencyKey = pending.idempotencyKey,
                    )
                ) {
                    outboxBlocked = true
                    outboxRecoveryMessage =
                        "Máy chủ đã xác nhận thay đổi hồ sơ gia đình nhưng ứng dụng không thể xóa bản ghi " +
                            "khôi phục được bảo vệ. Hãy liên hệ bộ phận hỗ trợ trước khi thử lại."
                    _uiState.update {
                        it.copy(
                            isSaving = false,
                            errorMessage = outboxRecoveryMessage,
                        )
                    }
                    return@onSuccess
                }
                outboxBlocked = false
                outboxRecoveryMessage = ""
                if (pendingSaveMutation == pending) pendingSaveMutation = null
                val profiles = if (pending.intent == PatientMutationIntent.Create) {
                    _uiState.value.profiles + confirmed
                } else {
                    _uiState.value.profiles.map { if (it.id == confirmed.id) confirmed else it }
                }.sortedWith(
                    compareBy<Patient> { if (it.profileType == "self") 0 else 1 }
                        .thenBy { it.name.lowercase() },
                )
                _uiState.update {
                    it.copy(
                        loadState = FamilyProfilesLoadState.Ready,
                        profiles = profiles,
                        editingProfileId = "",
                        draft = FamilyProfileDraft(),
                        isSaving = false,
                        fieldErrors = emptyMap(),
                        errorMessage = "",
                        confirmationMessage = confirmed.name,
                    )
                }
            }.onFailure { error ->
                when {
                    error.isDeterministicIdempotencyCollision() -> {
                        val tombstoned = mutationOutbox.blockExact(
                            authority = pending.authority,
                            intent = pending.intent,
                            idempotencyKey = pending.idempotencyKey,
                        )
                        outboxBlocked = true
                        if (tombstoned) {
                            outboxRecoveryMessage =
                                "Yêu cầu ${pending.intent.vietnameseAction} hồ sơ gia đình được bảo vệ đã bị chặn " +
                                    "sau xung đột khóa chống lặp. Hãy liên hệ bộ phận hỗ trợ với mã tham chiếu " +
                                    "${pending.idempotencyKey}."
                            if (pendingSaveMutation == pending) pendingSaveMutation = null
                        } else {
                            outboxRecoveryMessage =
                                "Không thể ghi dấu chặn hỗ trợ an toàn cho yêu cầu " +
                                    "${pending.intent.vietnameseAction} hồ sơ gia đình sau xung đột khóa chống lặp. " +
                                    "Bản ghi khôi phục gốc chưa bị xóa. Hãy liên hệ bộ phận hỗ trợ với mã tham chiếu " +
                                    "${pending.idempotencyKey}."
                        }
                    }
                    error.isDefinitiveFamilyAuthorityFailure() -> {
                        val cleared = mutationOutbox.clearExact(
                            authority = pending.authority,
                            intent = pending.intent,
                            idempotencyKey = pending.idempotencyKey,
                        )
                        outboxBlocked = !cleared
                        if (cleared) {
                            outboxRecoveryMessage = ""
                            if (pendingSaveMutation == pending) pendingSaveMutation = null
                        } else {
                            outboxRecoveryMessage =
                                "Không thể xóa bản ghi khôi phục được bảo vệ cho yêu cầu " +
                                    "${pending.intent.vietnameseAction} hồ sơ gia đình sau khi quyền gửi bị từ chối. " +
                                    "Yêu cầu gốc vẫn bị chặn. Hãy liên hệ bộ phận hỗ trợ với mã tham chiếu " +
                                    "${pending.idempotencyKey}."
                        }
                    }
                }
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        errorMessage = outboxRecoveryMessage.takeIf {
                            outboxBlocked && outboxRecoveryMessage.isNotBlank()
                        }
                            ?: error.message.orEmpty(),
                    )
                }
            }
        }
    }

    private fun switchActive(patientId: String) {
        val state = _uiState.value
        val profile = state.profiles.firstOrNull { it.id == patientId } ?: return
        if (
            patientId == state.activePatientId ||
            state.switchingProfileId.isNotBlank() ||
            state.isSaving ||
            state.deletingProfileId.isNotBlank()
        ) return
        val pendingSwitch = pendingActiveProfileSwitch
            ?.takeIf { it.patientId == patientId }
            ?: PendingActiveProfileSwitch(
                patientId = patientId,
                idempotencyKey = idempotencyKeyFactory(),
            ).also { pendingActiveProfileSwitch = it }
        _uiState.update { it.copy(switchingProfileId = patientId, errorMessage = "", confirmationMessage = "") }
        viewModelScope.launch {
            runCatching { repository.switchActive(patientId, pendingSwitch.idempotencyKey) }
                .onSuccess { result ->
                    if (!result.matchesConfirmedActiveProfile(patientId)) {
                        _uiState.update {
                            it.copy(
                                switchingProfileId = "",
                                errorMessage = "Máy chủ chưa xác nhận hồ sơ đang hoạt động.",
                            )
                        }
                        return@onSuccess
                    }
                    if (pendingActiveProfileSwitch == pendingSwitch) {
                        pendingActiveProfileSwitch = null
                    }
                    _uiState.update {
                        it.copy(
                            profiles = it.profiles.map { current ->
                                if (current.id == patientId) result.activePatient else current
                            },
                            activePatientId = patientId,
                            switchingProfileId = "",
                            errorMessage = "",
                            confirmationMessage = profile.name,
                        )
                    }
                    _effects.trySend(
                        FamilyProfilesEffect.ActiveProfileConfirmed(
                            result = result,
                            expectedPatientId = patientId,
                        ),
                    )
                }
                .onFailure { error ->
                    if (
                        error is SmartHealthApiException &&
                        error.statusCode in 400..499 &&
                        pendingActiveProfileSwitch == pendingSwitch
                    ) {
                        pendingActiveProfileSwitch = null
                    }
                    _uiState.update {
                        it.copy(switchingProfileId = "", errorMessage = error.message.orEmpty())
                    }
                }
        }
    }

    private fun ActiveProfileResult.matchesConfirmedActiveProfile(patientId: String): Boolean {
        val expectedPatientId = patientId.trim()
        val patientPrincipalIds = setOf(
            activePatient.ownerUserId.trim(),
            activePatient.accountUserId.trim(),
            activePatient.guardianUserId.trim(),
        ).filter(String::isNotBlank)
        return expectedPatientId.isNotBlank() &&
            confirmedAccountId.isNotBlank() &&
            confirmedWorkspaceId.isNotBlank() &&
            user.id.trim() == confirmedAccountId &&
            user.canonicalWorkspaceId().trim() == confirmedWorkspaceId &&
            user.activePatientId.trim() == expectedPatientId &&
            activePatient.id.trim() == expectedPatientId &&
            activePatient.organizationId.trim() == confirmedWorkspaceId &&
            confirmedAccountId in patientPrincipalIds
    }

    private fun requestDelete(patientId: String) {
        val state = _uiState.value
        val profile = state.profiles.firstOrNull { it.id == patientId } ?: return
        val unresolvedDelete = pendingDeleteMutation
        if (unresolvedDelete != null && unresolvedDelete.patientId != patientId) {
            _uiState.update {
                it.copy(errorMessage = "Cần xác nhận kết quả xóa hồ sơ trước đó trước khi xóa hồ sơ khác.")
            }
            return
        }
        if (
            profile.profileType == "self" ||
            profile.id == state.activePatientId ||
            state.deletingProfileId.isNotBlank() ||
            state.isSaving
        ) return
        _uiState.update { it.copy(pendingDelete = profile, errorMessage = "", confirmationMessage = "") }
    }

    private fun deleteConfirmed() {
        val state = _uiState.value
        val profile = state.pendingDelete ?: return
        if (state.deletingProfileId.isNotBlank()) return
        if (outboxBlocked) {
            _uiState.update {
                it.copy(
                    pendingDelete = null,
                    errorMessage = outboxRecoveryMessage.ifBlank {
                        "Một thay đổi hồ sơ gia đình được bảo vệ cần bộ phận hỗ trợ xử lý " +
                            "trước khi có thể gửi yêu cầu khác."
                    },
                )
            }
            return
        }
        val currentAuthority = confirmedMutationAuthority
        if (currentAuthority == null || !currentAuthority.isComplete) {
            _uiState.update {
                it.copy(errorMessage = "Máy chủ chưa xác nhận tài khoản và workspace hiện tại.")
            }
            return
        }
        val pendingMutation = pendingDeleteMutation
            ?.takeIf { it.patientId == profile.id }
            ?: PendingDeleteMutation(
                patientId = profile.id,
                profile = profile,
                idempotencyKey = idempotencyKeyFactory(),
                authority = currentAuthority,
            ).also { pendingDeleteMutation = it }
        if (mutationOutbox.persist(pendingMutation.toOutboxEntry()) == null) {
            outboxBlocked = true
            outboxRecoveryMessage =
                "Không thể lưu an toàn bản ghi khôi phục cho yêu cầu xóa hồ sơ gia đình nên yêu cầu chưa được gửi. " +
                    "Hãy liên hệ bộ phận hỗ trợ trước khi thử lại."
            _uiState.update {
                it.copy(
                    pendingDelete = null,
                    errorMessage = outboxRecoveryMessage,
                )
            }
            return
        }
        val dispatchAuthority = reauthorizeFamilyMutation(pendingMutation.authority)
        if (dispatchAuthority == null) {
            _uiState.update {
                it.copy(
                    pendingDelete = null,
                    deletingProfileId = "",
                    errorMessage =
                        "Yêu cầu xóa hồ sơ gia đình đang được cách ly cho đến khi tài khoản, workspace và " +
                            "phiên ban đầu hoạt động trở lại.",
                )
            }
            return
        }
        _uiState.update {
            it.copy(
                pendingDelete = null,
                deletingProfileId = profile.id,
                errorMessage = "",
            )
        }
        viewModelScope.launch {
            runCatching {
                repository.delete(
                    patientId = pendingMutation.patientId,
                    idempotencyKey = pendingMutation.idempotencyKey,
                    authority = dispatchAuthority,
                )
            }
                .onSuccess { receipt ->
                    if (!isFamilyMutationAuthorityCurrentForUi(pendingMutation.authority, dispatchAuthority)) {
                        _uiState.update {
                            it.copy(
                                pendingDelete = null,
                                deletingProfileId = "",
                                errorMessage =
                                    "Kết quả xóa hồ sơ gia đình đã được cách ly vì phiên đăng nhập thay đổi.",
                            )
                        }
                        return@onSuccess
                    }
                    if (!receipt.confirmsDelete(pendingMutation.patientId, pendingMutation.authority)) {
                        _uiState.update {
                            it.copy(
                                pendingDelete = profile,
                                deletingProfileId = "",
                                errorMessage = "Máy chủ chưa xác nhận đúng hồ sơ đã xóa.",
                            )
                        }
                        return@onSuccess
                    }
                    if (
                        !mutationOutbox.clearExact(
                            authority = pendingMutation.authority,
                            intent = PatientMutationIntent.Delete,
                            idempotencyKey = pendingMutation.idempotencyKey,
                        )
                    ) {
                        outboxBlocked = true
                        outboxRecoveryMessage =
                            "Máy chủ đã xác nhận yêu cầu xóa hồ sơ gia đình nhưng ứng dụng không thể xóa bản ghi " +
                                "khôi phục được bảo vệ. Hãy liên hệ bộ phận hỗ trợ trước khi thử lại."
                        _uiState.update {
                            it.copy(
                                pendingDelete = null,
                                deletingProfileId = "",
                                errorMessage = outboxRecoveryMessage,
                            )
                        }
                        return@onSuccess
                    }
                    outboxBlocked = false
                    outboxRecoveryMessage = ""
                    if (pendingDeleteMutation == pendingMutation) pendingDeleteMutation = null
                    val profiles = _uiState.value.profiles.filterNot { it.id == profile.id }
                    _uiState.update {
                        it.copy(
                            loadState = if (profiles.isEmpty()) FamilyProfilesLoadState.Empty else FamilyProfilesLoadState.Ready,
                            profiles = profiles,
                            deletingProfileId = "",
                            editingProfileId = it.editingProfileId.takeUnless { id -> id == profile.id }.orEmpty(),
                            draft = if (it.editingProfileId == profile.id) FamilyProfileDraft() else it.draft,
                            confirmationMessage = profile.name,
                        )
                    }
                }
                .onFailure { error ->
                    when {
                        error.isDeterministicIdempotencyCollision() -> {
                            val tombstoned = mutationOutbox.blockExact(
                                authority = pendingMutation.authority,
                                intent = PatientMutationIntent.Delete,
                                idempotencyKey = pendingMutation.idempotencyKey,
                            )
                            outboxBlocked = true
                            if (tombstoned) {
                                outboxRecoveryMessage =
                                    "Yêu cầu xóa hồ sơ gia đình được bảo vệ đã bị chặn sau xung đột khóa chống lặp. " +
                                        "Hãy liên hệ bộ phận hỗ trợ với mã tham chiếu " +
                                        "${pendingMutation.idempotencyKey}."
                                if (pendingDeleteMutation == pendingMutation) pendingDeleteMutation = null
                            } else {
                                outboxRecoveryMessage =
                                    "Không thể ghi dấu chặn hỗ trợ an toàn cho yêu cầu xóa hồ sơ gia đình sau xung " +
                                        "đột khóa chống lặp. Bản ghi khôi phục gốc chưa bị xóa. Hãy liên hệ bộ phận " +
                                        "hỗ trợ với mã tham chiếu ${pendingMutation.idempotencyKey}."
                            }
                        }
                        error.isDefinitiveFamilyAuthorityFailure() -> {
                            val cleared = mutationOutbox.clearExact(
                                authority = pendingMutation.authority,
                                intent = PatientMutationIntent.Delete,
                                idempotencyKey = pendingMutation.idempotencyKey,
                            )
                            outboxBlocked = !cleared
                            if (cleared) {
                                outboxRecoveryMessage = ""
                                if (pendingDeleteMutation == pendingMutation) pendingDeleteMutation = null
                            } else {
                                outboxRecoveryMessage =
                                    "Không thể xóa bản ghi khôi phục được bảo vệ cho yêu cầu xóa hồ sơ gia đình sau " +
                                        "khi quyền gửi bị từ chối. Yêu cầu gốc vẫn bị chặn. Hãy liên hệ bộ phận hỗ trợ " +
                                        "với mã tham chiếu ${pendingMutation.idempotencyKey}."
                            }
                        }
                    }
                    _uiState.update {
                        it.copy(
                            pendingDelete = profile.takeUnless {
                                error.isPostDispatchFamilyReconciliationRequired()
                            },
                            deletingProfileId = "",
                            errorMessage = outboxRecoveryMessage.takeIf {
                                outboxBlocked && outboxRecoveryMessage.isNotBlank()
                            }
                                ?: error.message.orEmpty(),
                        )
                    }
                }
        }
    }

    private fun PatientMutationReceipt.confirmedPatientOrNull(
        expectedIntent: PatientMutationIntent,
        expectedPatientId: String,
        authority: FamilyMutationAuthority,
    ): Patient? {
        val confirmedPatient = patient ?: return null
        val requestedPatientId = expectedPatientId.trim()
        val canonicalPatientId = patientId.trim()
        val principals = setOf(
            confirmedPatient.ownerUserId.trim(),
            confirmedPatient.accountUserId.trim(),
            confirmedPatient.guardianUserId.trim(),
        ).filter(String::isNotBlank)
        val patientIdMatches = if (expectedIntent == PatientMutationIntent.Create) {
            canonicalPatientId.isNotBlank() && canonicalPatientId == confirmedPatient.id.trim()
        } else {
            requestedPatientId.isNotBlank() &&
                canonicalPatientId == requestedPatientId &&
                confirmedPatient.id.trim() == requestedPatientId
        }
        return confirmedPatient.takeIf {
            intent == expectedIntent &&
                userId.trim() == authority.accountId &&
                workspaceId.trim() == authority.workspaceId &&
                patientIdMatches &&
                confirmedPatient.organizationId.trim() == authority.workspaceId &&
                authority.accountId in principals
        }
    }

    private fun PatientMutationReceipt.confirmsDelete(
        expectedPatientId: String,
        authority: FamilyMutationAuthority,
    ): Boolean =
        intent == PatientMutationIntent.Delete &&
            deleted &&
            userId.trim() == authority.accountId &&
            workspaceId.trim() == authority.workspaceId &&
            patientId.trim() == expectedPatientId.trim() &&
            expectedPatientId.isNotBlank()

    private fun Throwable.isDeterministicIdempotencyCollision(): Boolean =
        this is SmartHealthApiException &&
            statusCode == 409 &&
            code in setOf(
                "IDEMPOTENCY_KEY_REUSED",
                "IDEMPOTENT_PATIENT_DELETE_MISMATCH",
            )

    private fun Throwable.isDefinitiveFamilyAuthorityFailure(): Boolean =
        this is SmartHealthApiException &&
            statusCode == 409 &&
            (
                code == "PATIENT_MUTATION_AUTHORITY_MISMATCH" ||
                    (
                        code == "AUTH_SESSION_REPLACED" &&
                            details["patientMutationStage"] == "pre_dispatch"
                    )
            )

    private fun Throwable.isPostDispatchFamilyReconciliationRequired(): Boolean =
        this is SmartHealthApiException &&
            code == "PATIENT_MUTATION_RECONCILIATION_REQUIRED" &&
            details["patientMutationStage"] == "post_dispatch" &&
            details["mutationDisposition"] == "unknown"

    private fun PendingSaveMutation.toOutboxEntry(): FamilyMutationOutboxEntry =
        FamilyMutationOutboxEntry(
            intent = intent,
            patientId = patientId,
            mutation = mutation,
            deleteDisplayName = "",
            idempotencyKey = idempotencyKey,
            authority = authority,
        )

    private fun PendingDeleteMutation.toOutboxEntry(): FamilyMutationOutboxEntry =
        FamilyMutationOutboxEntry(
            intent = PatientMutationIntent.Delete,
            patientId = patientId,
            mutation = null,
            deleteDisplayName = profile.name,
            idempotencyKey = idempotencyKey,
            authority = authority,
        )

    private fun restorePendingMutation(
        entry: FamilyMutationOutboxEntry,
        profiles: List<Patient>,
    ) {
        when (entry.intent) {
            PatientMutationIntent.Create,
            PatientMutationIntent.Update,
            -> {
                val mutation = entry.mutation ?: return
                pendingSaveMutation = PendingSaveMutation(
                    intent = entry.intent,
                    patientId = entry.patientId,
                    mutation = mutation,
                    idempotencyKey = entry.idempotencyKey,
                    authority = entry.authority,
                )
                pendingDeleteMutation = null
            }
            PatientMutationIntent.Delete -> {
                val profile = profiles.firstOrNull { it.id == entry.patientId } ?: Patient(
                    id = entry.patientId,
                    patientCode = "",
                    name = entry.deleteDisplayName,
                    profileType = "dependent",
                    relationship = "",
                    guardianUserId = entry.authority.accountId,
                    organizationId = entry.authority.workspaceId,
                )
                pendingDeleteMutation = PendingDeleteMutation(
                    patientId = entry.patientId,
                    profile = profile,
                    idempotencyKey = entry.idempotencyKey,
                    authority = entry.authority,
                )
                pendingSaveMutation = null
            }
        }
    }

    private fun reauthorizeFamilyMutation(
        original: FamilyMutationAuthority,
    ): FamilyMutationAuthority? {
        val loaded = confirmedMutationAuthority ?: return null
        val session = repository.captureMutationSessionAuthority() ?: return null
        if (
            !original.hasSameServerAuthority(loaded) ||
            session.authSessionId != original.authSessionId ||
            !repository.isMutationSessionAuthorityCurrent(session)
        ) {
            return null
        }
        return original.copy(authSessionEpoch = session.authSessionEpoch)
    }

    private fun isFamilyMutationAuthorityCurrentForUi(
        original: FamilyMutationAuthority,
        dispatched: FamilyMutationAuthority,
    ): Boolean {
        val loaded = confirmedMutationAuthority ?: return false
        val session = repository.captureMutationSessionAuthority() ?: return false
        return original.hasSameServerAuthority(loaded) &&
            session.authSessionId == original.authSessionId &&
            session.authSessionEpoch == dispatched.authSessionEpoch &&
            repository.isMutationSessionAuthorityCurrent(session)
    }

    private fun validate(draft: FamilyProfileDraft): Map<String, String> = buildMap {
        if (draft.name.trim().isBlank()) put("name", "required")
        if (draft.relationship.trim().isBlank()) put("relationship", "required")
        val birthDate = draft.dateOfBirth.trim().takeIf(String::isNotBlank)?.let {
            runCatching { LocalDate.parse(it) }.getOrNull()
        }
        if (draft.dateOfBirth.isNotBlank() && birthDate == null) put("dateOfBirth", "invalid")
        if (birthDate?.isAfter(today()) == true) put("dateOfBirth", "future")
        if (draft.bloodType !in BLOOD_TYPES) put("bloodType", "invalid")
        val emergencyValues = listOf(
            draft.emergencyName,
            draft.emergencyPhone,
            draft.emergencyRelationship,
        )
        if (emergencyValues.any(String::isNotBlank) && emergencyValues.any(String::isBlank)) {
            put("emergencyContact", "incomplete")
        }
    }

    companion object {
        val BLOOD_TYPES = setOf("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown")
    }
}

private val FamilyProfileField.wireName: String
    get() = when (this) {
        FamilyProfileField.Name -> "name"
        FamilyProfileField.Relationship -> "relationship"
        FamilyProfileField.DateOfBirth -> "dateOfBirth"
        FamilyProfileField.Gender -> "gender"
        FamilyProfileField.Phone -> "phone"
        FamilyProfileField.Notes -> "notes"
        FamilyProfileField.BloodType -> "bloodType"
        FamilyProfileField.Allergies -> "allergies"
        FamilyProfileField.EmergencyName,
        FamilyProfileField.EmergencyPhone,
        FamilyProfileField.EmergencyRelationship,
        -> "emergencyContact"
    }

private fun Patient.toDraft(): FamilyProfileDraft = FamilyProfileDraft(
    name = name,
    relationship = relationship,
    dateOfBirth = dateOfBirth,
    gender = gender,
    phone = phone,
    notes = notes,
    bloodType = bloodType,
    allergies = allergies.joinToString(", "),
    emergencyName = emergencyContact.name,
    emergencyPhone = emergencyContact.phone,
    emergencyRelationship = emergencyContact.relationship,
)

private fun FamilyProfileMutation.toDraft(): FamilyProfileDraft = FamilyProfileDraft(
    name = name,
    relationship = relationship,
    dateOfBirth = dateOfBirth,
    gender = gender,
    phone = phone,
    notes = notes,
    bloodType = bloodType,
    allergies = allergies.joinToString(", "),
    emergencyName = emergencyContact.name,
    emergencyPhone = emergencyContact.phone,
    emergencyRelationship = emergencyContact.relationship,
)

private val PatientMutationIntent.vietnameseAction: String
    get() = when (this) {
        PatientMutationIntent.Create -> "tạo"
        PatientMutationIntent.Update -> "cập nhật"
        PatientMutationIntent.Delete -> "xóa"
    }

internal fun FamilyMutationAuthority.hasSameServerAuthority(
    other: FamilyMutationAuthority,
): Boolean = accountId == other.accountId &&
    workspaceId == other.workspaceId &&
    authSessionId == other.authSessionId
