package com.example.smart_health_android.security

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.createSavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.CreationExtras
import com.example.smart_health_android.data.AuthResult
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SpecialtyOption
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.normalizePendingRegistrationEmail
import com.example.smart_health_android.data.toVietnameseMessage
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
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

internal data class DoctorApprovalIdentity(
    val firebaseOwner: FirebaseOwnerBinding,
    val backendUserId: String,
    val currentWorkspaceId: String,
    val targetWorkspaceId: String = currentWorkspaceId,
) {
    val firebaseUserId: String
        get() = firebaseOwner.firebaseUserId

    init {
        require(firebaseOwner.firebaseUserId.isNotBlank() && firebaseOwner.firebaseUserId.length <= 160)
        require(firebaseOwner.email.isNotBlank() && firebaseOwner.email.length <= 320)
        require(firebaseOwner.sessionEpoch > 0L)
        require(backendUserId.isNotBlank() && backendUserId.length <= 160)
        require(currentWorkspaceId.isNotBlank() && currentWorkspaceId.length <= 160)
        require(targetWorkspaceId.isNotBlank() && targetWorkspaceId.length <= 160)
    }
}

internal data class DoctorApprovalNeedsInfoRequest(
    val name: String,
    val phone: String,
    val license: String,
    val clinicName: String,
    val specialtyName: String,
    val organizationId: String,
    val reason: String,
    val accountType: String,
    val workspaceType: String,
)

internal data class DoctorApprovalDraft(
    val name: String = "",
    val phone: String = "",
    val license: String = "",
    val selectedClinicId: String = "",
    val clinicName: String = "",
    val selectedAccountType: String = "doctor",
    val selectedSpecialtyId: String = "",
    val reason: String = "",
)

internal data class DoctorApprovalUiState(
    val user: AuthUser? = null,
    val clinics: List<ClinicOption> = emptyList(),
    val specialties: List<SpecialtyOption> = emptyList(),
    val name: String = "",
    val phone: String = "",
    val license: String = "",
    val selectedClinicId: String = "",
    val clinicName: String = "",
    val selectedAccountType: String = "doctor",
    val selectedSpecialtyId: String = "",
    val reason: String = "",
    val baselineDraft: DoctorApprovalDraft? = null,
    val hasRestoredDraft: Boolean = false,
    val roleRequestIntentFingerprint: String = "",
    val roleRequestIdempotencyKey: String = "",
    val isChecking: Boolean = false,
    val isSubmitting: Boolean = false,
    val isLoadingCatalogs: Boolean = false,
    val clinicCatalogError: String = "",
    val specialtyCatalogError: String = "",
    val fieldErrors: Map<String, String> = emptyMap(),
    val showDiscardDialog: Boolean = false,
    val statusMessage: String = DEFAULT_DOCTOR_APPROVAL_STATUS,
    val errorMessage: String = "",
) {
    val needsInfo: Boolean
        get() = user?.roleRequestStatus == "needs_info"

    val isRejected: Boolean
        get() = user?.roleRequestStatus == "rejected"

    val isSoloPractice: Boolean
        get() = selectedAccountType == "solo_doctor"

    val isBusy: Boolean
        get() = isChecking || isSubmitting

    val hasUnsavedChanges: Boolean
        get() = needsInfo && baselineDraft?.let { it != currentDraft() } == true

    fun currentDraft(): DoctorApprovalDraft = DoctorApprovalDraft(
        name = name,
        phone = phone,
        license = license,
        selectedClinicId = selectedClinicId,
        clinicName = clinicName,
        selectedAccountType = selectedAccountType,
        selectedSpecialtyId = selectedSpecialtyId,
        reason = reason,
    )
}

internal sealed interface DoctorApprovalUiAction {
    data object RetryCatalogs : DoctorApprovalUiAction
    data object RefreshStatus : DoctorApprovalUiAction
    data object PollStatus : DoctorApprovalUiAction
    data object SubmitNeedsInfo : DoctorApprovalUiAction
    data object LogoutRequested : DoctorApprovalUiAction
    data object DiscardLogoutConfirmed : DoctorApprovalUiAction
    data object DiscardDismissed : DoctorApprovalUiAction
    data class NameChanged(val value: String) : DoctorApprovalUiAction
    data class PhoneChanged(val value: String) : DoctorApprovalUiAction
    data class LicenseChanged(val value: String) : DoctorApprovalUiAction
    data class ClinicSelected(val clinicId: String) : DoctorApprovalUiAction
    data class ClinicNameChanged(val value: String) : DoctorApprovalUiAction
    data class SpecialtySelected(val specialtyId: String) : DoctorApprovalUiAction
    data class ReasonChanged(val value: String) : DoctorApprovalUiAction
}

internal sealed interface DoctorApprovalUiEffect {
    data class NavigateApproved(
        val firebaseOwner: FirebaseOwnerBinding,
    ) : DoctorApprovalUiEffect

    data class NavigateLogout(
        val firebaseOwner: FirebaseOwnerBinding,
    ) : DoctorApprovalUiEffect
}

internal interface DoctorApprovalRepository {
    suspend fun loadClinics(): List<ClinicOption>

    suspend fun loadSpecialties(): List<SpecialtyOption>

    suspend fun refreshStatus(expectedIdentity: DoctorApprovalIdentity?): AuthUser

    suspend fun submitNeedsInfo(
        expectedIdentity: DoctorApprovalIdentity,
        request: DoctorApprovalNeedsInfoRequest,
        idempotencyKey: String,
    ): AuthUser
}

internal interface DoctorApprovalFirebaseSession {
    suspend fun getFreshIdToken(expectedOwner: FirebaseOwnerBinding): String
}

internal interface DoctorApprovalBackend {
    suspend fun listClinics(): List<ClinicOption>

    suspend fun listSpecialties(): List<SpecialtyOption>

    suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult

    suspend fun requestRole(
        expectedIdentity: DoctorApprovalIdentity,
        request: DoctorApprovalNeedsInfoRequest,
        idempotencyKey: String,
        expectedAuthSessionEpoch: Long,
    ): AuthUser
}

internal interface DoctorApprovalPushRegistrar {
    suspend fun register(backendUserId: String, workspaceId: String): Boolean
}

private object ProductionDoctorApprovalFirebaseSession : DoctorApprovalFirebaseSession {
    override suspend fun getFreshIdToken(expectedOwner: FirebaseOwnerBinding): String =
        FirebaseAuthService.getFreshIdToken(
            expectedOwner = expectedOwner,
            forceRefresh = true,
        )
}

private object ProductionDoctorApprovalBackend : DoctorApprovalBackend {
    override suspend fun listClinics(): List<ClinicOption> =
        SmartHealthRepository.api.listClinics()

    override suspend fun listSpecialties(): List<SpecialtyOption> =
        SmartHealthRepository.api.listSpecialties()

    override suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult = SmartHealthRepository.api.authenticateFirebase(
        idToken = idToken,
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
    )

    override suspend fun requestRole(
        expectedIdentity: DoctorApprovalIdentity,
        request: DoctorApprovalNeedsInfoRequest,
        idempotencyKey: String,
        expectedAuthSessionEpoch: Long,
    ): AuthUser = SmartHealthRepository.api.requestRole(
        requestedRole = "doctor",
        name = request.name,
        phone = request.phone,
        license = request.license,
        hospital = request.clinicName,
        department = request.specialtyName,
        organizationId = request.organizationId,
        reason = request.reason,
        accountType = request.accountType,
        workspaceType = request.workspaceType,
        idempotencyKey = idempotencyKey,
        expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        expectedUserId = expectedIdentity.backendUserId,
        expectedWorkspaceId = expectedIdentity.currentWorkspaceId,
    )
}

private object ProductionDoctorApprovalPushRegistrar : DoctorApprovalPushRegistrar {
    override suspend fun register(
        backendUserId: String,
        workspaceId: String,
    ): Boolean = SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated(
        userId = backendUserId,
        workspaceId = workspaceId,
    )
}

internal class ProductionDoctorApprovalRepository(
    private val expectedFirebaseOwner: FirebaseOwnerBinding,
    private val ownerGuard: DoctorApprovalOwnerGuard = DoctorApprovalOwnerGuard(
        ProductionDoctorApprovalOwnerEnvironment,
    ),
    private val firebaseSession: DoctorApprovalFirebaseSession =
        ProductionDoctorApprovalFirebaseSession,
    private val backend: DoctorApprovalBackend = ProductionDoctorApprovalBackend,
    private val pushRegistrar: DoctorApprovalPushRegistrar =
        ProductionDoctorApprovalPushRegistrar,
) : DoctorApprovalRepository {
    override suspend fun loadClinics(): List<ClinicOption> = backend.listClinics()

    override suspend fun loadSpecialties(): List<SpecialtyOption> = backend.listSpecialties()

    override suspend fun refreshStatus(
        expectedIdentity: DoctorApprovalIdentity?,
    ): AuthUser {
        requireExpectedIdentityOwner(expectedIdentity)
        val capturedOwner = captureExpectedRouteOwner()
        return protectOwner(capturedOwner) {
            val idToken = firebaseSession.getFreshIdToken(capturedOwner.firebaseOwner)
            ownerGuard.requireCurrent(capturedOwner)
            require(idToken.isNotBlank()) {
                "Firebase không trả về token xác thực hợp lệ."
            }

            val result = backend.authenticateFirebase(
                idToken = idToken,
                expectedAuthSessionEpoch = capturedOwner.backendEpoch,
            )
            val refreshedAuthority = requireNotNull(result.authority) {
                "Backend không trả về authority xác thực đã làm mới."
            }
            require(
                refreshedAuthority.bearerToken.isNotBlank() &&
                    refreshedAuthority.bearerToken == result.token,
            ) {
                "Backend trả về authority không khớp token xác thực."
            }
            val repinnedOwner = capturedOwner.copy(
                backendEpoch = refreshedAuthority.epoch,
                backendAuthority = refreshedAuthority,
            )
            ownerGuard.requireCurrent(repinnedOwner)
            requireExactReceipt(
                user = result.user,
                expectedOwner = repinnedOwner,
                expectedIdentity = expectedIdentity,
                expectedTargetWorkspaceId = expectedIdentity?.targetWorkspaceId,
            )

            try {
                pushRegistrar.register(
                    backendUserId = result.user.id,
                    workspaceId = result.user.canonicalWorkspaceId(),
                )
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                // Push registration retries independently. It cannot manufacture
                // approval success or change the authenticated owner projection.
            }
            ownerGuard.requireCurrent(repinnedOwner)
            result.user
        }
    }

    override suspend fun submitNeedsInfo(
        expectedIdentity: DoctorApprovalIdentity,
        request: DoctorApprovalNeedsInfoRequest,
        idempotencyKey: String,
    ): AuthUser {
        validateRequest(request)
        val stableKey = idempotencyKey.takeIf {
            it == it.trim() && it.length in 8..160
        } ?: error("Idempotency-Key phải chứa từ 8 đến 160 ký tự.")
        requireExpectedIdentityOwner(expectedIdentity)
        val capturedOwner = captureExpectedRouteOwner()
        if (capturedOwner.firebaseOwner != expectedFirebaseOwner) {
            error("Phiên tài khoản hiện tại không còn thuộc hồ sơ đang hiển thị.")
        }
        ownerGuard.requireCurrent(capturedOwner)
        return protectOwner(capturedOwner) {
            val result = backend.requestRole(
                expectedIdentity = expectedIdentity,
                request = request,
                idempotencyKey = stableKey,
                expectedAuthSessionEpoch = capturedOwner.backendEpoch,
            )
            ownerGuard.requireCurrent(capturedOwner)
            requireExactReceipt(
                user = result,
                expectedOwner = capturedOwner,
                expectedIdentity = expectedIdentity,
                expectedTargetWorkspaceId = request.organizationId
                    .trim()
                    .ifBlank { expectedIdentity.targetWorkspaceId },
            )
            result
        }
    }

    private fun requireExactReceipt(
        user: AuthUser,
        expectedOwner: DoctorApprovalOwner,
        expectedIdentity: DoctorApprovalIdentity?,
        expectedTargetWorkspaceId: String?,
    ) {
        ownerGuard.requireReceiptOwner(
            user = user,
            expected = expectedOwner,
            expectedBackendUserId = expectedIdentity?.backendUserId,
        )
        val currentWorkspaceId = user.canonicalWorkspaceId()
        val targetWorkspaceId = user.roleRequestOrganizationId.trim()
            .ifBlank { user.organizationId.trim() }
        val expectedTarget = expectedTargetWorkspaceId?.trim().orEmpty()
        val normalizedUserRole = user.role.trim().lowercase()
        if (
            user.requestedRole != "doctor" ||
            user.roleRequestStatus !in DOCTOR_REQUEST_STATUSES ||
            when (user.roleRequestStatus) {
                "approved" -> normalizedUserRole !in APPROVED_DOCTOR_ROLES
                else -> normalizedUserRole != "patient"
            }
        ) {
            error("Backend chưa xác nhận vòng đời yêu cầu quyền bác sĩ hợp lệ.")
        }
        if (
            currentWorkspaceId.isBlank() ||
            targetWorkspaceId.isBlank() ||
            (expectedTarget.isNotBlank() && targetWorkspaceId != expectedTarget) ||
            when (user.roleRequestStatus) {
                "approved" -> currentWorkspaceId != targetWorkspaceId
                else -> expectedIdentity != null &&
                    currentWorkspaceId != expectedIdentity.currentWorkspaceId
            }
        ) {
            error("Backend trả về workspace không thuộc vòng đời hồ sơ hiện tại.")
        }
        val membership = requireNotNull(user.currentMembership) {
            "Backend không trả về membership vận hành của hồ sơ bác sĩ."
        }
        val membershipWorkspace = membership.workspaceId
            .ifBlank { membership.organizationId }
            .trim()
        val normalizedMembershipRole = membership.role.trim().lowercase()
        if (
            membershipWorkspace != currentWorkspaceId ||
            !membership.operational ||
            !membership.status.equals("active", ignoreCase = true) ||
            normalizedMembershipRole != normalizedUserRole
        ) {
            error("Membership bác sĩ không hoạt động hoặc không khớp workspace hiện tại.")
        }
        if (
            user.roleRequestStatus != "approved" &&
            user.memberships.any { candidate ->
                candidate.workspaceId
                    .ifBlank { candidate.organizationId }
                    .trim() == targetWorkspaceId &&
                    candidate.status.equals("active", ignoreCase = true) &&
                    candidate.operational &&
                    candidate.suspendedAt.isBlank() &&
                    candidate.role.trim().lowercase() in APPROVED_DOCTOR_ROLES
            }
        ) {
            error("Backend cấp quyền bác sĩ trước khi yêu cầu được duyệt.")
        }
    }

    private fun validateRequest(request: DoctorApprovalNeedsInfoRequest) {
        require(request.name.isNotBlank()) { "Họ và tên là bắt buộc." }
        require(request.phone.isNotBlank()) { "Số điện thoại là bắt buộc." }
        require(request.license.isNotBlank()) { "Chứng chỉ hành nghề là bắt buộc." }
        require(request.clinicName.isNotBlank()) { "Cơ sở y tế là bắt buộc." }
        require(request.specialtyName.isNotBlank()) { "Chuyên khoa là bắt buộc." }
        require(request.accountType in setOf("doctor", "solo_doctor")) {
            "Loại tài khoản bác sĩ không hợp lệ."
        }
        require(request.workspaceType in setOf("clinic", "solo_practice")) {
            "Loại workspace bác sĩ không hợp lệ."
        }
        if (request.workspaceType == "clinic") {
            require(request.organizationId.isNotBlank()) {
                "Workspace cơ sở y tế là bắt buộc."
            }
        } else {
            require(request.organizationId.isBlank()) {
                "Bác sĩ phòng khám tư không được gửi organizationId cơ sở khác."
            }
        }
    }

    private fun captureExpectedRouteOwner(): DoctorApprovalOwner {
        val capturedOwner = ownerGuard.capture()
        if (capturedOwner.firebaseOwner != expectedFirebaseOwner) {
            error("Phiên tài khoản hiện tại không còn sở hữu màn hình chờ duyệt.")
        }
        return capturedOwner
    }

    private fun requireExpectedIdentityOwner(expectedIdentity: DoctorApprovalIdentity?) {
        if (expectedIdentity != null && expectedIdentity.firebaseOwner != expectedFirebaseOwner) {
            error("Hồ sơ duyệt không còn thuộc phiên tài khoản của màn hình hiện tại.")
        }
    }

    private suspend inline fun <T> protectOwner(
        capturedOwner: DoctorApprovalOwner,
        block: () -> T,
    ): T {
        return try {
            block()
        } catch (error: CancellationException) {
            runCatching { ownerGuard.requireCurrent(capturedOwner) }
            throw error
        } catch (error: Throwable) {
            runCatching { ownerGuard.requireCurrent(capturedOwner) }
            throw error
        }
    }
}

internal class DoctorApprovalViewModel(
    private val repository: DoctorApprovalRepository,
    private val expectedFirebaseOwner: FirebaseOwnerBinding,
    initialState: DoctorApprovalUiState = DoctorApprovalUiState(),
    private val autoStart: Boolean = true,
    private val idempotencyKeyFactory: () -> String = { UUID.randomUUID().toString() },
    private val savedStateHandle: SavedStateHandle,
    private val pollIntervalMillis: Long = 15_000L,
) : ViewModel() {
    private val operationInFlight = AtomicBoolean(false)
    private val catalogInFlight = AtomicBoolean(false)
    private val _effects = Channel<DoctorApprovalUiEffect>(Channel.BUFFERED)
    private val _uiState = MutableStateFlow(
        restoreDraft(normalizeInitialState(initialState)),
    )
    private var pollingJob: Job? = null

    val uiState: StateFlow<DoctorApprovalUiState> = _uiState.asStateFlow()
    val effects: Flow<DoctorApprovalUiEffect> = _effects.receiveAsFlow()

    init {
        if (autoStart) {
            retryCatalogs()
            refreshStatus(showLoading = true)
            startPolling()
        }
    }

    fun onAction(action: DoctorApprovalUiAction) {
        when (action) {
            DoctorApprovalUiAction.RetryCatalogs -> retryCatalogs()
            DoctorApprovalUiAction.RefreshStatus -> refreshStatus(showLoading = true)
            DoctorApprovalUiAction.PollStatus -> refreshStatus(showLoading = false)
            DoctorApprovalUiAction.SubmitNeedsInfo -> submitNeedsInfo()
            DoctorApprovalUiAction.LogoutRequested -> requestLogout()
            DoctorApprovalUiAction.DiscardLogoutConfirmed -> {
                clearSavedDraft()
                _uiState.update { it.copy(showDiscardDialog = false) }
                _effects.trySend(
                    DoctorApprovalUiEffect.NavigateLogout(expectedFirebaseOwner),
                )
            }
            DoctorApprovalUiAction.DiscardDismissed -> {
                _uiState.update { it.copy(showDiscardDialog = false) }
            }
            is DoctorApprovalUiAction.NameChanged -> updateDraft(
                field = "name",
            ) { it.copy(name = action.value) }
            is DoctorApprovalUiAction.PhoneChanged -> updateDraft(
                field = "phone",
            ) { it.copy(phone = action.value) }
            is DoctorApprovalUiAction.LicenseChanged -> updateDraft(
                field = "license",
            ) { it.copy(license = action.value) }
            is DoctorApprovalUiAction.ClinicSelected -> updateDraft(
                field = "clinic",
            ) { it.copy(selectedClinicId = action.clinicId) }
            is DoctorApprovalUiAction.ClinicNameChanged -> updateDraft(
                field = "clinic",
            ) { it.copy(clinicName = action.value) }
            is DoctorApprovalUiAction.SpecialtySelected -> updateDraft(
                field = "specialty",
            ) { it.copy(selectedSpecialtyId = action.specialtyId) }
            is DoctorApprovalUiAction.ReasonChanged -> updateDraft(
                field = "reason",
            ) { it.copy(reason = action.value) }
        }
    }

    private fun retryCatalogs() {
        if (!catalogInFlight.compareAndSet(false, true)) return
        _uiState.update {
            it.copy(
                isLoadingCatalogs = true,
                clinicCatalogError = "",
                specialtyCatalogError = "",
            )
        }
        viewModelScope.launch {
            var clinicsResult: Result<List<ClinicOption>>? = null
            var specialtiesResult: Result<List<SpecialtyOption>>? = null
            try {
                clinicsResult = runSuspendCatching { repository.loadClinics() }
                specialtiesResult = runSuspendCatching { repository.loadSpecialties() }
                _uiState.update { current ->
                    val withCatalogs = current.copy(
                        clinics = clinicsResult.getOrNull() ?: current.clinics,
                        specialties = specialtiesResult.getOrNull() ?: current.specialties,
                        clinicCatalogError = clinicsResult.exceptionOrNull()?.toVietnameseMessage(
                            "Không thể tải danh mục cơ sở y tế.",
                        ).orEmpty(),
                        specialtyCatalogError =
                            specialtiesResult.exceptionOrNull()?.toVietnameseMessage(
                                "Không thể tải danh mục chuyên khoa.",
                            ).orEmpty(),
                    )
                    withCatalogs.user?.let { user ->
                        reconcileUser(withCatalogs, user, forceReplaceDraft = false)
                    } ?: withCatalogs
                }
            } catch (error: CancellationException) {
                throw error
            } finally {
                catalogInFlight.set(false)
                _uiState.update { it.copy(isLoadingCatalogs = false) }
            }
        }
    }

    private fun refreshStatus(showLoading: Boolean) {
        if (!operationInFlight.compareAndSet(false, true)) return
        if (showLoading) {
            _uiState.update { it.copy(isChecking = true, errorMessage = "") }
        }
        viewModelScope.launch {
            try {
                val result = repository.refreshStatus(_uiState.value.identityOrNull())
                requireExpectedUserOwner(result)
                _uiState.update { current ->
                    val hadIdentity = current.identityOrNull() != null
                    val reconciled = reconcileUser(current, result, forceReplaceDraft = false)
                    if (hadIdentity) reconciled else restoreDraft(reconciled)
                }
                publishApprovedIfConfirmed(result)
                ensurePollingFor(result)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (showLoading) {
                    _uiState.update {
                        it.copy(
                            errorMessage = error.toVietnameseMessage(
                                "Không thể kiểm tra trạng thái duyệt tài khoản.",
                            ),
                        )
                    }
                }
            } finally {
                operationInFlight.set(false)
                if (showLoading) {
                    _uiState.update { it.copy(isChecking = false) }
                }
            }
        }
    }

    private fun submitNeedsInfo() {
        if (!operationInFlight.compareAndSet(false, true)) return
        val state = _uiState.value
        if (!state.needsInfo) {
            operationInFlight.set(false)
            return
        }
        val identity = state.identityOrNull()
        val validation = state.validatedRequest()
        if (identity == null || validation == null) {
            operationInFlight.set(false)
            return
        }
        val fingerprint = doctorRoleRequestFingerprint(
            identity.backendUserId,
            identity.currentWorkspaceId,
            validation.name,
            validation.phone,
            validation.license,
            validation.clinicName,
            validation.specialtyName,
            validation.organizationId,
            validation.reason,
            validation.accountType,
            validation.workspaceType,
        )
        val key = state.roleRequestIdempotencyKey.takeIf {
            state.roleRequestIntentFingerprint == fingerprint && it.length in 8..160
        } ?: idempotencyKeyFactory().also {
            require(it.length in 8..160) {
                "Idempotency-Key phải chứa từ 8 đến 160 ký tự."
            }
        }
        _uiState.update {
            it.copy(
                isSubmitting = true,
                errorMessage = "",
                roleRequestIntentFingerprint = fingerprint,
                roleRequestIdempotencyKey = key,
            )
        }
        persistDraft(_uiState.value)

        viewModelScope.launch {
            try {
                val result = repository.submitNeedsInfo(
                    expectedIdentity = identity,
                    request = validation,
                    idempotencyKey = key,
                )
                requireExpectedUserOwner(result)
                _uiState.update { current ->
                    reconcileUser(
                        current = current.copy(
                            roleRequestIntentFingerprint = "",
                            roleRequestIdempotencyKey = "",
                        ),
                        user = result,
                        forceReplaceDraft = true,
                    )
                }
                clearSavedDraft()
                publishApprovedIfConfirmed(result)
                ensurePollingFor(result)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                _uiState.update {
                    it.copy(
                        errorMessage = error.toVietnameseMessage(
                            "Không thể gửi lại hồ sơ bác sĩ.",
                        ),
                    )
                }
            } finally {
                operationInFlight.set(false)
                _uiState.update { it.copy(isSubmitting = false) }
            }
        }
    }

    private fun requestLogout() {
        val state = _uiState.value
        if (state.isBusy) return
        if (state.hasUnsavedChanges) {
            _uiState.update { it.copy(showDiscardDialog = true) }
        } else {
            clearSavedDraft()
            _effects.trySend(
                DoctorApprovalUiEffect.NavigateLogout(expectedFirebaseOwner),
            )
        }
    }

    private fun updateDraft(
        field: String,
        update: (DoctorApprovalUiState) -> DoctorApprovalUiState,
    ) {
        if (operationInFlight.get()) return
        var changed = false
        _uiState.update { current ->
            if (!current.needsInfo) {
                current
            } else {
                changed = true
                update(current).copy(
                    fieldErrors = current.fieldErrors - field,
                    errorMessage = "",
                )
            }
        }
        if (changed) persistDraft(_uiState.value)
    }

    private fun requireExpectedUserOwner(user: AuthUser) {
        if (
            user.firebaseUid != expectedFirebaseOwner.firebaseUserId ||
            normalizePendingRegistrationEmail(user.email) != expectedFirebaseOwner.email
        ) {
            error("Backend trả về hồ sơ không thuộc phiên màn hình chờ duyệt hiện tại.")
        }
    }

    private suspend fun publishApprovedIfConfirmed(user: AuthUser) {
        if (
            user.roleRequestStatus == "approved" &&
            user.role in APPROVED_DOCTOR_ROLES
        ) {
            pollingJob?.cancel()
            clearSavedDraft()
            _effects.send(
                DoctorApprovalUiEffect.NavigateApproved(expectedFirebaseOwner),
            )
        }
    }

    private fun ensurePollingFor(user: AuthUser) {
        if (
            user.roleRequestStatus !in TERMINAL_DOCTOR_REQUEST_STATUSES &&
            pollingJob?.isActive != true
        ) {
            startPolling()
        }
    }

    private fun startPolling() {
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (true) {
                delay(pollIntervalMillis)
                val status = _uiState.value.user?.roleRequestStatus
                if (status in TERMINAL_DOCTOR_REQUEST_STATUSES) break
                onAction(DoctorApprovalUiAction.PollStatus)
            }
        }
    }

    private fun reconcileUser(
        current: DoctorApprovalUiState,
        user: AuthUser,
        forceReplaceDraft: Boolean,
    ): DoctorApprovalUiState {
        val serverDraft = user.toDraft(current.clinics, current.specialties)
        val preserveDraft = !forceReplaceDraft &&
            (current.hasUnsavedChanges || current.hasRestoredDraft)
        val next = current.copy(
            user = user,
            name = if (preserveDraft) current.name else serverDraft.name,
            phone = if (preserveDraft) current.phone else serverDraft.phone,
            license = if (preserveDraft) current.license else serverDraft.license,
            selectedClinicId = if (preserveDraft) {
                current.selectedClinicId
            } else {
                serverDraft.selectedClinicId
            },
            clinicName = if (preserveDraft) current.clinicName else serverDraft.clinicName,
            selectedAccountType = if (preserveDraft) {
                current.selectedAccountType
            } else {
                serverDraft.selectedAccountType
            },
            selectedSpecialtyId = if (preserveDraft) {
                current.selectedSpecialtyId
            } else {
                serverDraft.selectedSpecialtyId
            },
            reason = if (preserveDraft) current.reason else serverDraft.reason,
            baselineDraft = serverDraft,
            hasRestoredDraft = false,
            fieldErrors = if (forceReplaceDraft) emptyMap() else current.fieldErrors,
            statusMessage = statusMessageFor(user),
        )
        if (preserveDraft) persistDraft(next)
        return next
    }

    private fun normalizeInitialState(state: DoctorApprovalUiState): DoctorApprovalUiState {
        if (state.user == null || state.baselineDraft != null) return state
        return state.copy(baselineDraft = state.currentDraft())
    }

    private fun restoreDraft(state: DoctorApprovalUiState): DoctorApprovalUiState {
        if (savedStateHandle.get<Boolean>(SAVED_HAS_DRAFT) != true) return state
        val savedIdentity = runCatching {
            DoctorApprovalIdentity(
                firebaseOwner = FirebaseOwnerBinding(
                    firebaseUserId = savedStateHandle
                        .get<String>(SAVED_FIREBASE_USER_ID)
                        .orEmpty(),
                    email = savedStateHandle.get<String>(SAVED_FIREBASE_EMAIL).orEmpty(),
                    sessionEpoch = savedStateHandle.get<Long>(SAVED_FIREBASE_SESSION_EPOCH)
                        ?: 0L,
                ),
                backendUserId = savedStateHandle.get<String>(SAVED_BACKEND_USER_ID).orEmpty(),
                currentWorkspaceId = savedStateHandle
                    .get<String>(SAVED_CURRENT_WORKSPACE_ID)
                    .orEmpty(),
                targetWorkspaceId = savedStateHandle
                    .get<String>(SAVED_TARGET_WORKSPACE_ID)
                    .orEmpty()
                    .ifBlank {
                        savedStateHandle.get<String>(SAVED_CURRENT_WORKSPACE_ID).orEmpty()
                    },
            )
        }.getOrNull()
        if (savedIdentity == null) {
            clearSavedDraft()
            return state
        }
        val currentIdentity = state.identityOrNull() ?: return state
        if (currentIdentity != savedIdentity) {
            clearSavedDraft()
            return state
        }
        return state.copy(
            name = savedStateHandle[SAVED_NAME] ?: state.name,
            phone = savedStateHandle[SAVED_PHONE] ?: state.phone,
            license = savedStateHandle[SAVED_LICENSE] ?: state.license,
            selectedClinicId = savedStateHandle[SAVED_CLINIC_ID] ?: state.selectedClinicId,
            clinicName = savedStateHandle[SAVED_CLINIC_NAME] ?: state.clinicName,
            selectedAccountType = savedStateHandle[SAVED_ACCOUNT_TYPE]
                ?: state.selectedAccountType,
            selectedSpecialtyId = savedStateHandle[SAVED_SPECIALTY_ID]
                ?: state.selectedSpecialtyId,
            reason = savedStateHandle[SAVED_REASON] ?: state.reason,
            roleRequestIntentFingerprint = savedStateHandle[SAVED_FINGERPRINT]
                ?: state.roleRequestIntentFingerprint,
            roleRequestIdempotencyKey = savedStateHandle[SAVED_IDEMPOTENCY_KEY]
                ?: state.roleRequestIdempotencyKey,
            hasRestoredDraft = true,
        )
    }

    private fun persistDraft(state: DoctorApprovalUiState) {
        val identity = state.identityOrNull() ?: return
        savedStateHandle[SAVED_HAS_DRAFT] = true
        savedStateHandle[SAVED_FIREBASE_USER_ID] = identity.firebaseUserId
        savedStateHandle[SAVED_FIREBASE_EMAIL] = identity.firebaseOwner.email
        savedStateHandle[SAVED_FIREBASE_SESSION_EPOCH] = identity.firebaseOwner.sessionEpoch
        savedStateHandle[SAVED_BACKEND_USER_ID] = identity.backendUserId
        savedStateHandle[SAVED_CURRENT_WORKSPACE_ID] = identity.currentWorkspaceId
        savedStateHandle[SAVED_TARGET_WORKSPACE_ID] = identity.targetWorkspaceId
        savedStateHandle[SAVED_NAME] = state.name
        savedStateHandle[SAVED_PHONE] = state.phone
        savedStateHandle[SAVED_LICENSE] = state.license
        savedStateHandle[SAVED_CLINIC_ID] = state.selectedClinicId
        savedStateHandle[SAVED_CLINIC_NAME] = state.clinicName
        savedStateHandle[SAVED_ACCOUNT_TYPE] = state.selectedAccountType
        savedStateHandle[SAVED_SPECIALTY_ID] = state.selectedSpecialtyId
        savedStateHandle[SAVED_REASON] = state.reason
        savedStateHandle[SAVED_FINGERPRINT] = state.roleRequestIntentFingerprint
        savedStateHandle[SAVED_IDEMPOTENCY_KEY] = state.roleRequestIdempotencyKey
    }

    private fun clearSavedDraft() {
        listOf(
            SAVED_HAS_DRAFT,
            SAVED_FIREBASE_USER_ID,
            SAVED_FIREBASE_EMAIL,
            SAVED_FIREBASE_SESSION_EPOCH,
            SAVED_BACKEND_USER_ID,
            SAVED_CURRENT_WORKSPACE_ID,
            SAVED_TARGET_WORKSPACE_ID,
            SAVED_NAME,
            SAVED_PHONE,
            SAVED_LICENSE,
            SAVED_CLINIC_ID,
            SAVED_CLINIC_NAME,
            SAVED_ACCOUNT_TYPE,
            SAVED_SPECIALTY_ID,
            SAVED_REASON,
            SAVED_FINGERPRINT,
            SAVED_IDEMPOTENCY_KEY,
        ).forEach { key -> savedStateHandle.remove<Any?>(key) }
    }

    private fun DoctorApprovalUiState.identityOrNull(): DoctorApprovalIdentity? {
        val user = user ?: return null
        val currentWorkspaceId = user.canonicalWorkspaceId()
        val targetWorkspaceId = user.roleRequestOrganizationId.trim()
            .ifBlank { user.organizationId.trim() }
            .ifBlank { currentWorkspaceId }
        if (
            user.firebaseUid != expectedFirebaseOwner.firebaseUserId ||
            normalizePendingRegistrationEmail(user.email) != expectedFirebaseOwner.email ||
            user.id.isBlank() ||
            currentWorkspaceId.isBlank() ||
            targetWorkspaceId.isBlank()
        ) {
            return null
        }
        return DoctorApprovalIdentity(
            firebaseOwner = expectedFirebaseOwner,
            backendUserId = user.id,
            currentWorkspaceId = currentWorkspaceId,
            targetWorkspaceId = targetWorkspaceId,
        )
    }

    private fun DoctorApprovalUiState.validatedRequest(): DoctorApprovalNeedsInfoRequest? {
        val selectedClinic = clinics.firstOrNull { it.id == selectedClinicId }
        val selectedSpecialty = specialties.firstOrNull { it.id == selectedSpecialtyId }
        val soloPractice = isSoloPractice
        val nextClinicName = if (soloPractice) clinicName.trim() else selectedClinic?.name.orEmpty()
        val validationErrors = buildMap {
            if (name.isBlank()) put("name", "Vui lòng nhập họ và tên.")
            if (phone.isBlank()) put("phone", "Vui lòng nhập số điện thoại.")
            if (license.isBlank()) put("license", "Vui lòng nhập chứng chỉ hành nghề.")
            if (selectedSpecialty == null) put("specialty", "Vui lòng chọn chuyên khoa.")
            if (soloPractice && nextClinicName.isBlank()) {
                put("clinic", "Vui lòng nhập tên phòng khám tư.")
            }
            if (!soloPractice && selectedClinic == null) {
                put("clinic", "Vui lòng chọn cơ sở y tế.")
            }
            if ("reason" in user?.roleInfoRequiredFields.orEmpty() && reason.isBlank()) {
                put("reason", "Vui lòng bổ sung lý do đăng ký.")
            }
        }
        if (validationErrors.isNotEmpty()) {
            _uiState.update {
                it.copy(
                    fieldErrors = validationErrors,
                    errorMessage =
                        "Hồ sơ còn thiếu thông tin. Vui lòng kiểm tra các trường được đánh dấu.",
                )
            }
            return null
        }
        return DoctorApprovalNeedsInfoRequest(
            name = name.trim(),
            phone = phone.trim(),
            license = license.trim(),
            clinicName = nextClinicName,
            specialtyName = requireNotNull(selectedSpecialty).name,
            organizationId = if (soloPractice) "" else requireNotNull(selectedClinic).id,
            reason = reason.trim(),
            accountType = if (soloPractice) "solo_doctor" else "doctor",
            workspaceType = if (soloPractice) "solo_practice" else "clinic",
        )
    }

    private fun AuthUser.toDraft(
        clinics: List<ClinicOption>,
        specialties: List<SpecialtyOption>,
    ): DoctorApprovalDraft {
        val soloPractice = workspaceType == "solo_practice" || accountType == "solo_doctor"
        val currentClinicName = hospital.ifBlank { clinicName.ifBlank { clinicSuggestion } }
        return DoctorApprovalDraft(
            name = name,
            phone = phone,
            license = license,
            selectedClinicId = if (soloPractice) "" else organizationId,
            clinicName = currentClinicName,
            selectedAccountType = if (soloPractice) "solo_doctor" else "doctor",
            selectedSpecialtyId = specialties.firstOrNull {
                it.name == department || it.name == specialty
            }?.id.orEmpty(),
            reason = registrationReason,
        )
    }
}

internal class DoctorApprovalViewModelFactory(
    private val expectedFirebaseOwner: FirebaseOwnerBinding,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(
        modelClass: Class<T>,
        extras: CreationExtras,
    ): T {
        require(modelClass.isAssignableFrom(DoctorApprovalViewModel::class.java)) {
            "Unsupported ViewModel type: ${modelClass.name}"
        }
        return DoctorApprovalViewModel(
            repository = ProductionDoctorApprovalRepository(
                expectedFirebaseOwner = expectedFirebaseOwner,
            ),
            expectedFirebaseOwner = expectedFirebaseOwner,
            savedStateHandle = extras.createSavedStateHandle(),
        ) as T
    }

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(DoctorApprovalViewModel::class.java)) {
            "Unsupported ViewModel type: ${modelClass.name}"
        }
        error("DoctorApprovalViewModel requires CreationExtras with SavedStateHandle support.")
    }
}

private suspend inline fun <T> runSuspendCatching(
    crossinline block: suspend () -> T,
): Result<T> {
    return try {
        Result.success(block())
    } catch (error: CancellationException) {
        throw error
    } catch (error: Throwable) {
        Result.failure(error)
    }
}

private fun doctorRoleRequestFingerprint(vararg values: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(values.joinToString("\u001f").toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { byte ->
            (byte.toInt() and 0xff).toString(16).padStart(2, '0')
        }

private fun statusMessageFor(user: AuthUser): String = when (user.roleRequestStatus) {
    "approved" -> "Tài khoản đã được phê duyệt. Đang mở không gian làm việc bác sĩ…"
    "rejected" -> "Yêu cầu bác sĩ đã bị từ chối. Vui lòng liên hệ quản trị viên."
    "needs_info" -> user.roleInfoRequestMessage.ifBlank {
        "Quản trị viên yêu cầu bổ sung thông tin hồ sơ bác sĩ."
    }
    "pending" -> "Tài khoản vẫn đang chờ quản trị viên phê duyệt."
    else ->
        "Tài khoản chưa có quyền bác sĩ. Vui lòng gửi yêu cầu hoặc liên hệ quản trị viên."
}

private const val DEFAULT_DOCTOR_APPROVAL_STATUS =
    "Yêu cầu của bạn đã được gửi đến quản trị viên. " +
        "Chế độ bác sĩ chỉ được mở sau khi tài khoản được phê duyệt."
private val DOCTOR_REQUEST_STATUSES = setOf("pending", "needs_info", "approved", "rejected")
private val TERMINAL_DOCTOR_REQUEST_STATUSES = setOf("approved", "rejected", "needs_info")
private val APPROVED_DOCTOR_ROLES = setOf("doctor")

private const val SAVED_HAS_DRAFT = "doctor_approval.has_draft"
private const val SAVED_FIREBASE_USER_ID = "doctor_approval.firebase_user_id"
private const val SAVED_FIREBASE_EMAIL = "doctor_approval.firebase_email"
private const val SAVED_FIREBASE_SESSION_EPOCH = "doctor_approval.firebase_session_epoch"
private const val SAVED_BACKEND_USER_ID = "doctor_approval.backend_user_id"
private const val SAVED_CURRENT_WORKSPACE_ID = "doctor_approval.current_workspace_id"
private const val SAVED_TARGET_WORKSPACE_ID = "doctor_approval.target_workspace_id"
private const val SAVED_NAME = "doctor_approval.name"
private const val SAVED_PHONE = "doctor_approval.phone"
private const val SAVED_LICENSE = "doctor_approval.license"
private const val SAVED_CLINIC_ID = "doctor_approval.clinic_id"
private const val SAVED_CLINIC_NAME = "doctor_approval.clinic_name"
private const val SAVED_ACCOUNT_TYPE = "doctor_approval.account_type"
private const val SAVED_SPECIALTY_ID = "doctor_approval.specialty_id"
private const val SAVED_REASON = "doctor_approval.reason"
private const val SAVED_FINGERPRINT = "doctor_approval.intent_fingerprint"
private const val SAVED_IDEMPOTENCY_KEY = "doctor_approval.idempotency_key"
