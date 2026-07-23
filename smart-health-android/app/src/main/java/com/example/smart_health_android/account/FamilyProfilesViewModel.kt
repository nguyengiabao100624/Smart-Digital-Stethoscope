package com.example.smart_health_android.account

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smart_health_android.data.ActiveProfileResult
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SmartHealthRepository
import java.io.IOException
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    suspend fun currentUser(): AuthUser
    suspend fun listProfiles(): List<Patient>
    suspend fun create(mutation: FamilyProfileMutation, idempotencyKey: String): Patient
    suspend fun update(patientId: String, mutation: FamilyProfileMutation, idempotencyKey: String): Patient
    suspend fun delete(patientId: String, idempotencyKey: String)
    suspend fun switchActive(patientId: String, idempotencyKey: String): ActiveProfileResult
}

class ApiFamilyProfilesRepository : FamilyProfilesRepository {
    override suspend fun currentUser(): AuthUser = SmartHealthRepository.api.getMe()
    override suspend fun listProfiles(): List<Patient> = SmartHealthRepository.api.listPatients()
    override suspend fun create(
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
    ): Patient = SmartHealthRepository.api.createPatient(
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
    )

    override suspend fun update(
        patientId: String,
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
    ): Patient = SmartHealthRepository.api.updatePatient(
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
    )

    override suspend fun delete(patientId: String, idempotencyKey: String) {
        SmartHealthRepository.api.deletePatient(patientId, idempotencyKey)
    }

    override suspend fun switchActive(
        patientId: String,
        idempotencyKey: String,
    ): ActiveProfileResult = SmartHealthRepository.api.switchActiveProfile(patientId, idempotencyKey)
}

class FamilyProfilesViewModel(
    private val repository: FamilyProfilesRepository = ApiFamilyProfilesRepository(),
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val today: () -> LocalDate = LocalDate::now,
) : ViewModel() {
    private val _uiState = MutableStateFlow(FamilyProfilesUiState())
    val uiState = _uiState.asStateFlow()

    private var saveKey = ""

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
            applyLoaded(user.getOrThrow(), profiles.getOrThrow())
        }
    }

    private fun applyLoaded(user: AuthUser, loadedProfiles: List<Patient>) {
        val profiles = loadedProfiles
            .filter { it.profileType in setOf("self", "dependent") }
            .sortedWith(compareBy<Patient> { if (it.profileType == "self") 0 else 1 }.thenBy { it.name.lowercase() })
        _uiState.update {
            it.copy(
                loadState = if (profiles.isEmpty()) FamilyProfilesLoadState.Empty else FamilyProfilesLoadState.Ready,
                profiles = profiles,
                activePatientId = user.activePatientId,
                editingProfileId = "",
                draft = FamilyProfileDraft(),
                errorMessage = "",
                fieldErrors = emptyMap(),
            )
        }
        saveKey = ""
    }

    private fun edit(profile: Patient?) {
        val state = _uiState.value
        if (state.isSaving || state.deletingProfileId.isNotBlank() || state.switchingProfileId.isNotBlank()) return
        _uiState.update {
            it.copy(
                editingProfileId = profile?.id.orEmpty(),
                draft = profile?.toDraft() ?: FamilyProfileDraft(),
                fieldErrors = emptyMap(),
                errorMessage = "",
                confirmationMessage = "",
            )
        }
        saveKey = ""
    }

    private fun updateDraft(field: FamilyProfileField, value: String) {
        val state = _uiState.value
        if (state.isSaving) return
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
        saveKey = ""
    }

    private fun save() {
        val state = _uiState.value
        if (state.isSaving || state.deletingProfileId.isNotBlank()) return
        val validation = validate(state.draft)
        if (validation.isNotEmpty()) {
            _uiState.update { it.copy(fieldErrors = validation, errorMessage = "") }
            return
        }
        val mutation = state.draft.toMutation()
        if (saveKey.isBlank()) saveKey = idempotencyKeyFactory()
        val key = saveKey
        _uiState.update { it.copy(isSaving = true, errorMessage = "", confirmationMessage = "") }
        viewModelScope.launch {
            val result = runCatching {
                if (state.editingProfileId.isBlank()) {
                    repository.create(mutation, key)
                } else {
                    repository.update(state.editingProfileId, mutation, key)
                }
            }
            result.onSuccess { confirmed ->
                val profiles = if (state.editingProfileId.isBlank()) {
                    (_uiState.value.profiles + confirmed)
                } else {
                    _uiState.value.profiles.map { if (it.id == confirmed.id) confirmed else it }
                }.sortedWith(compareBy<Patient> { if (it.profileType == "self") 0 else 1 }.thenBy { it.name.lowercase() })
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
                saveKey = ""
            }.onFailure { error ->
                _uiState.update { it.copy(isSaving = false, errorMessage = error.message.orEmpty()) }
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
        val key = idempotencyKeyFactory()
        _uiState.update { it.copy(switchingProfileId = patientId, errorMessage = "", confirmationMessage = "") }
        viewModelScope.launch {
            runCatching { repository.switchActive(patientId, key) }
                .onSuccess { result ->
                    if (result.user.activePatientId != patientId || result.activePatient.id != patientId) {
                        _uiState.update {
                            it.copy(
                                switchingProfileId = "",
                                errorMessage = "Máy chủ chưa xác nhận hồ sơ đang hoạt động.",
                            )
                        }
                        return@onSuccess
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
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(switchingProfileId = "", errorMessage = error.message.orEmpty())
                    }
                }
        }
    }

    private fun requestDelete(patientId: String) {
        val state = _uiState.value
        val profile = state.profiles.firstOrNull { it.id == patientId } ?: return
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
        val key = idempotencyKeyFactory()
        _uiState.update {
            it.copy(
                pendingDelete = null,
                deletingProfileId = profile.id,
                errorMessage = "",
            )
        }
        viewModelScope.launch {
            runCatching { repository.delete(profile.id, key) }
                .onSuccess {
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
                    _uiState.update {
                        it.copy(deletingProfileId = "", errorMessage = error.message.orEmpty())
                    }
                }
        }
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
