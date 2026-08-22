package com.example.smart_health_android.account

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.AccountProfileMutationUser
import com.example.smart_health_android.data.AccountProfileUpdateIntent
import com.example.smart_health_android.data.AccountProfileUpdateReceipt
import com.example.smart_health_android.data.AvatarCleanupReceipt
import com.example.smart_health_android.data.AvatarCleanupAction
import com.example.smart_health_android.data.AvatarCleanupStatus
import com.example.smart_health_android.data.AvatarCleanupStatusSnapshot
import com.example.smart_health_android.data.AvatarDeleteIntent
import com.example.smart_health_android.data.AvatarDeleteReceipt
import com.example.smart_health_android.data.AvatarDeletedFileReceipt
import com.example.smart_health_android.data.AvatarDownloadIntent
import com.example.smart_health_android.data.AvatarFileReceipt
import com.example.smart_health_android.data.AvatarUploadIntent
import com.example.smart_health_android.data.AvatarUploadReceipt
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SpecialtyOption
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AccountProfileViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `load keeps profile usable when only avatar refresh fails`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(avatarLoadFailed = true)

        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()

        assertEquals(AccountProfileLoadState.Ready, viewModel.uiState.value.loadState)
        assertEquals("Bác sĩ An", viewModel.uiState.value.draft.name)
        assertEquals(AccountProfileErrorKind.AvatarRefresh, viewModel.uiState.value.errorKind)
    }

    @Test
    fun `network load failure renders offline state instead of fake profile`() = runTest(dispatcher) {
        val viewModel = AccountProfileViewModel(
            FakeAccountProfileRepository(loadFailure = IOException("offline")),
        )
        advanceUntilIdle()

        assertEquals(AccountProfileLoadState.Offline, viewModel.uiState.value.loadState)
        assertEquals(null, viewModel.uiState.value.user)
    }

    @Test
    fun `forbidden load renders permission state`() = runTest(dispatcher) {
        val viewModel = AccountProfileViewModel(
            FakeAccountProfileRepository(
                loadFailure = SmartHealthApiException(
                    statusCode = 403,
                    code = "FORBIDDEN",
                    message = "forbidden",
                )
            ),
        )
        advanceUntilIdle()

        assertEquals(AccountProfileLoadState.PermissionDenied, viewModel.uiState.value.loadState)
        assertEquals(null, viewModel.uiState.value.user)
    }

    @Test
    fun `blank name is rejected before mutation`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository()
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(AccountProfileAction.StartEditing)
        viewModel.onAction(AccountProfileAction.ChangeName("  "))
        viewModel.onAction(AccountProfileAction.Save)

        assertTrue(viewModel.uiState.value.nameInvalid)
        assertEquals(0, repository.updateCalls)
    }

    @Test
    fun `failed profile save reuses idempotency key until backend confirms`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(updateFailuresRemaining = 1)
        val viewModel = AccountProfileViewModel(
            repository = repository,
            createIdempotencyKey = { "stable_profile_key" },
        )
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)
        viewModel.onAction(AccountProfileAction.ChangeAddress("Địa chỉ mới"))

        viewModel.onAction(AccountProfileAction.Save)
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.Save)
        advanceUntilIdle()

        assertEquals(listOf("stable_profile_key", "stable_profile_key"), repository.updateKeys)
        assertEquals("Địa chỉ mới", viewModel.uiState.value.savedDraft.address)
        assertFalse(viewModel.uiState.value.isEditing)
        assertEquals(AccountProfileConfirmation.ProfileSaved, viewModel.uiState.value.confirmation)
    }

    @Test
    fun `unconfirmed profile response does not replace saved state`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(confirmUpdate = false)
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)
        viewModel.onAction(AccountProfileAction.ChangeAddress("Địa chỉ mới"))

        viewModel.onAction(AccountProfileAction.Save)
        advanceUntilIdle()

        assertEquals(AccountProfileErrorKind.ServerUnconfirmed, viewModel.uiState.value.errorKind)
        assertEquals("Địa chỉ cũ", viewModel.uiState.value.savedDraft.address)
        assertEquals("Địa chỉ mới", viewModel.uiState.value.draft.address)
        assertTrue(viewModel.uiState.value.isEditing)
    }

    @Test
    fun `foreign profile receipt never replaces the loaded account`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(profileReceiptUserId = "foreign-user")
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()
        val previouslySavedAddress = viewModel.uiState.value.savedDraft.address
        viewModel.onAction(AccountProfileAction.StartEditing)
        viewModel.onAction(AccountProfileAction.ChangeAddress("New address"))

        viewModel.onAction(AccountProfileAction.Save)
        advanceUntilIdle()

        assertEquals(AccountProfileErrorKind.ServerUnconfirmed, viewModel.uiState.value.errorKind)
        assertEquals("user_1", viewModel.uiState.value.user?.id)
        assertEquals(previouslySavedAddress, viewModel.uiState.value.savedDraft.address)
        assertTrue(viewModel.uiState.value.isEditing)
    }

    @Test
    fun `late profile receipt is discarded after the account session changes`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(authorityCurrentAfterProfileUpdate = false)
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)
        viewModel.onAction(AccountProfileAction.ChangeAddress("New address"))

        viewModel.onAction(AccountProfileAction.Save)
        advanceUntilIdle()

        assertEquals(AccountProfileLoadState.PermissionDenied, viewModel.uiState.value.loadState)
        assertEquals(null, viewModel.uiState.value.user)
        assertEquals(null, viewModel.uiState.value.confirmation)
    }

    @Test
    fun `failed avatar upload keeps backend avatar and displayed bytes`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(uploadFailuresRemaining = 1)
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)

        viewModel.onAction(
            AccountProfileAction.AvatarSelected(
                fileName = "avatar.png",
                contentType = "image/png",
                bytes = byteArrayOf(9, 9),
            )
        )
        advanceUntilIdle()

        assertEquals(AccountProfileErrorKind.AvatarUpload, viewModel.uiState.value.errorKind)
        assertEquals("avatar_old", viewModel.uiState.value.user?.avatarFileId)
        assertArrayEquals(byteArrayOf(1, 2, 3), viewModel.uiState.value.avatarBytes)
    }

    @Test
    fun `ambiguous avatar upload retry keeps the same operation key until exact confirmation`() =
        runTest(dispatcher) {
            val repository = FakeAccountProfileRepository(uploadFailuresRemaining = 1)
            val viewModel = AccountProfileViewModel(
                repository = repository,
                createIdempotencyKey = { "stable-avatar-upload-key" },
            )
            advanceUntilIdle()
            viewModel.onAction(AccountProfileAction.StartEditing)
            val selection = AccountProfileAction.AvatarSelected(
                fileName = "avatar.png",
                contentType = "image/png",
                bytes = byteArrayOf(9, 9),
            )

            viewModel.onAction(selection)
            advanceUntilIdle()
            viewModel.onAction(selection)
            advanceUntilIdle()

            assertEquals(
                listOf("stable-avatar-upload-key", "stable-avatar-upload-key"),
                repository.uploadKeys,
            )
            assertEquals("avatar_new", viewModel.uiState.value.user?.avatarFileId)
            assertArrayEquals(byteArrayOf(9, 9), viewModel.uiState.value.avatarBytes)
            assertEquals(AccountProfileConfirmation.AvatarUpdated, viewModel.uiState.value.confirmation)
        }

    @Test
    fun `active avatar upload stage retry keeps the same operation key`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(
            uploadFailuresRemaining = 1,
            uploadFailure = SmartHealthApiException(
                statusCode = 409,
                code = "AVATAR_UPLOAD_STAGE_IN_PROGRESS",
                message = "The same avatar upload intent is already in progress",
            ),
        )
        var keySequence = 0
        val viewModel = AccountProfileViewModel(
            repository = repository,
            createIdempotencyKey = { "avatar-stage-key-${++keySequence}" },
        )
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)
        val selection = AccountProfileAction.AvatarSelected(
            fileName = "avatar.png",
            contentType = "image/png",
            bytes = byteArrayOf(9, 9),
        )

        viewModel.onAction(selection)
        advanceUntilIdle()
        viewModel.onAction(selection)
        advanceUntilIdle()

        assertEquals(
            listOf("avatar-stage-key-1", "avatar-stage-key-1"),
            repository.uploadKeys,
        )
        assertEquals("avatar_new", viewModel.uiState.value.user?.avatarFileId)
    }

    @Test
    fun `lost avatar upload generation retries with the same operation key`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(
            uploadFailuresRemaining = 1,
            uploadFailure = SmartHealthApiException(
                statusCode = 409,
                code = "AVATAR_UPLOAD_STAGE_FENCE_LOST",
                message = "Avatar upload no longer owns the exact staged provider generation",
            ),
        )
        var keySequence = 0
        val viewModel = AccountProfileViewModel(
            repository = repository,
            createIdempotencyKey = { "avatar-fence-key-${++keySequence}" },
        )
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)
        val selection = AccountProfileAction.AvatarSelected(
            fileName = "avatar.png",
            contentType = "image/png",
            bytes = byteArrayOf(9, 9),
        )

        viewModel.onAction(selection)
        advanceUntilIdle()
        viewModel.onAction(selection)
        advanceUntilIdle()

        assertEquals(
            listOf("avatar-fence-key-1", "avatar-fence-key-1"),
            repository.uploadKeys,
        )
        assertEquals("avatar_new", viewModel.uiState.value.user?.avatarFileId)
    }

    @Test
    fun `foreign avatar receipt never replaces the confirmed owner avatar`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(uploadReceiptOwnerUserId = "foreign-user")
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)

        viewModel.onAction(
            AccountProfileAction.AvatarSelected(
                fileName = "avatar.png",
                contentType = "image/png",
                bytes = byteArrayOf(9, 9),
            ),
        )
        advanceUntilIdle()

        assertEquals(AccountProfileErrorKind.AvatarUnconfirmed, viewModel.uiState.value.errorKind)
        assertEquals("avatar_old", viewModel.uiState.value.user?.avatarFileId)
        assertArrayEquals(byteArrayOf(1, 2, 3), viewModel.uiState.value.avatarBytes)
        assertEquals(null, viewModel.uiState.value.confirmation)
    }

    @Test
    fun `late avatar response is discarded after the account session changes`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(authorityCurrentAfterUpload = false)
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)

        viewModel.onAction(
            AccountProfileAction.AvatarSelected(
                fileName = "avatar.png",
                contentType = "image/png",
                bytes = byteArrayOf(9, 9),
            ),
        )
        advanceUntilIdle()

        assertEquals(AccountProfileLoadState.PermissionDenied, viewModel.uiState.value.loadState)
        assertEquals(null, viewModel.uiState.value.user)
        assertEquals(null, viewModel.uiState.value.avatarBytes)
        assertEquals(null, viewModel.uiState.value.confirmation)
    }

    @Test
    fun `avatar preview changes only after backend confirmation and download`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository()
        val viewModel = AccountProfileViewModel(
            repository = repository,
            createIdempotencyKey = { "avatar_key" },
        )
        advanceUntilIdle()
        viewModel.onAction(AccountProfileAction.StartEditing)

        viewModel.onAction(
            AccountProfileAction.AvatarSelected(
                fileName = "avatar.webp",
                contentType = "image/webp",
                bytes = byteArrayOf(8, 8),
            )
        )
        advanceUntilIdle()

        assertEquals(listOf("avatar_key"), repository.uploadKeys)
        assertEquals("avatar_new", viewModel.uiState.value.user?.avatarFileId)
        assertArrayEquals(byteArrayOf(8, 8), viewModel.uiState.value.avatarBytes)
        assertEquals(AccountProfileConfirmation.AvatarUpdated, viewModel.uiState.value.confirmation)
    }

    @Test
    fun `avatar upload pending cleanup stays visible across message clear and refresh without success`() =
        runTest(dispatcher) {
            val repository = FakeAccountProfileRepository(
                uploadCleanupStatus = AvatarCleanupStatus.Pending,
            )
            val viewModel = AccountProfileViewModel(repository)
            advanceUntilIdle()
            viewModel.onAction(AccountProfileAction.StartEditing)

            viewModel.onAction(
                AccountProfileAction.AvatarSelected(
                    fileName = "avatar.png",
                    contentType = "image/png",
                    bytes = byteArrayOf(9, 9),
                ),
            )
            advanceUntilIdle()

            assertEquals(AccountProfileAvatarCleanup.Upload, viewModel.uiState.value.avatarCleanupNotice?.action)
            assertEquals(AvatarCleanupStatus.Pending, viewModel.uiState.value.avatarCleanupNotice?.status)
            assertEquals(null, viewModel.uiState.value.confirmation)

            viewModel.onAction(AccountProfileAction.ClearMessage)
            assertEquals(AccountProfileAvatarCleanup.Upload, viewModel.uiState.value.avatarCleanupNotice?.action)
            viewModel.onAction(AccountProfileAction.Retry)
            advanceUntilIdle()
            assertEquals(AccountProfileAvatarCleanup.Upload, viewModel.uiState.value.avatarCleanupNotice?.action)
            assertEquals(null, viewModel.uiState.value.confirmation)
        }

    @Test
    fun `avatar delete pending cleanup stays visible without final success semantics`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(
            deleteCleanupStatus = AvatarCleanupStatus.Pending,
        )
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(AccountProfileAction.RequestAvatarDelete)
        viewModel.onAction(AccountProfileAction.ConfirmAvatarDelete)
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.hasAvatar)
        assertEquals(AccountProfileAvatarCleanup.Delete, viewModel.uiState.value.avatarCleanupNotice?.action)
        assertEquals(null, viewModel.uiState.value.confirmation)
        viewModel.onAction(AccountProfileAction.ClearMessage)
        assertEquals(AccountProfileAvatarCleanup.Delete, viewModel.uiState.value.avatarCleanupNotice?.action)
    }

    @Test
    fun `completed avatar delete reports confirmation and has no pending cleanup`() = runTest(dispatcher) {
        val viewModel = AccountProfileViewModel(
            FakeAccountProfileRepository(deleteCleanupStatus = AvatarCleanupStatus.Completed),
        )
        advanceUntilIdle()

        viewModel.onAction(AccountProfileAction.RequestAvatarDelete)
        viewModel.onAction(AccountProfileAction.ConfirmAvatarDelete)
        advanceUntilIdle()

        assertEquals(AccountProfileConfirmation.AvatarDeleted, viewModel.uiState.value.confirmation)
        assertEquals(null, viewModel.uiState.value.avatarCleanupNotice)
    }

    @Test
    fun `cleanup status is hydrated again after a new ViewModel simulates process death`() =
        runTest(dispatcher) {
            val repository = FakeAccountProfileRepository(
                cleanupReadStatus = AvatarCleanupStatus.Pending,
                cleanupReadAction = AvatarCleanupAction.OrphanUpload,
            )

            val firstProcess = AccountProfileViewModel(repository)
            advanceUntilIdle()
            assertEquals(
                AccountProfileAvatarCleanup.OrphanUpload,
                firstProcess.uiState.value.avatarCleanupNotice?.action,
            )

            val restoredProcess = AccountProfileViewModel(repository)
            advanceUntilIdle()
            assertEquals(
                AccountProfileAvatarCleanup.OrphanUpload,
                restoredProcess.uiState.value.avatarCleanupNotice?.action,
            )
            assertEquals(
                AvatarCleanupStatus.Pending,
                restoredProcess.uiState.value.avatarCleanupNotice?.status,
            )
            assertEquals(null, restoredProcess.uiState.value.confirmation)
        }

    @Test
    fun `dead letter cleanup hydrates as manual support and never as success`() = runTest(dispatcher) {
        val viewModel = AccountProfileViewModel(
            FakeAccountProfileRepository(
                cleanupReadStatus = AvatarCleanupStatus.DeadLetter,
                cleanupReadAction = AvatarCleanupAction.Delete,
            ),
        )
        advanceUntilIdle()

        assertEquals(AccountProfileAvatarCleanup.Delete, viewModel.uiState.value.avatarCleanupNotice?.action)
        assertEquals(AvatarCleanupStatus.DeadLetter, viewModel.uiState.value.avatarCleanupNotice?.status)
        assertEquals(null, viewModel.uiState.value.confirmation)
    }

    @Test
    fun `cleanup status from another owner is never hydrated`() = runTest(dispatcher) {
        val viewModel = AccountProfileViewModel(
            FakeAccountProfileRepository(
                cleanupReadStatus = AvatarCleanupStatus.DeadLetter,
                cleanupReadAction = AvatarCleanupAction.Delete,
                cleanupReadOwnerUserId = "foreign-user",
            ),
        )
        advanceUntilIdle()

        assertEquals(null, viewModel.uiState.value.avatarCleanupNotice)
    }

    @Test
    fun `cleanup status from another workspace is never hydrated`() = runTest(dispatcher) {
        val viewModel = AccountProfileViewModel(
            FakeAccountProfileRepository(
                cleanupReadStatus = AvatarCleanupStatus.DeadLetter,
                cleanupReadAction = AvatarCleanupAction.Delete,
                cleanupReadWorkspaceId = "clinic-other",
            ),
        )
        advanceUntilIdle()

        assertEquals(null, viewModel.uiState.value.avatarCleanupNotice)
        assertEquals(null, viewModel.uiState.value.confirmation)
    }

    @Test
    fun `avatar delete requires confirmation and preserves image on unconfirmed response`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(confirmDelete = false)
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(AccountProfileAction.RequestAvatarDelete)
        assertTrue(viewModel.uiState.value.showAvatarDeleteConfirmation)
        assertEquals(0, repository.deleteCalls)

        viewModel.onAction(AccountProfileAction.ConfirmAvatarDelete)
        advanceUntilIdle()

        assertEquals(1, repository.deleteCalls)
        assertEquals(AccountProfileErrorKind.AvatarDeleteUnconfirmed, viewModel.uiState.value.errorKind)
        assertTrue(viewModel.uiState.value.hasAvatar)
        assertArrayEquals(byteArrayOf(1, 2, 3), viewModel.uiState.value.avatarBytes)
    }
}

private class FakeAccountProfileRepository(
    private val loadFailure: Throwable? = null,
    private val avatarLoadFailed: Boolean = false,
    private var updateFailuresRemaining: Int = 0,
    private val confirmUpdate: Boolean = true,
    private val profileReceiptUserId: String = "user_1",
    private val authorityCurrentAfterProfileUpdate: Boolean = true,
    private var uploadFailuresRemaining: Int = 0,
    private val uploadFailure: Throwable = IOException("response lost after dispatch"),
    private val uploadReceiptOwnerUserId: String = "user_1",
    private val authorityCurrentAfterUpload: Boolean = true,
    private val confirmDelete: Boolean = true,
    private val uploadCleanupStatus: AvatarCleanupStatus = AvatarCleanupStatus.Completed,
    private val deleteCleanupStatus: AvatarCleanupStatus = AvatarCleanupStatus.Completed,
    private val cleanupReadStatus: AvatarCleanupStatus = AvatarCleanupStatus.NotRequired,
    private val cleanupReadAction: AvatarCleanupAction = AvatarCleanupAction.None,
    private val cleanupReadOwnerUserId: String = "user_1",
    private val cleanupReadWorkspaceId: String = "clinic_1",
) : AccountProfileRepository {
    private val initialUser = profileUser()
    var updateCalls = 0
    val updateKeys = mutableListOf<String>()
    val uploadKeys = mutableListOf<String>()
    var deleteCalls = 0
    private var uploadCompleted = false
    private var uploadedBytes = byteArrayOf()
    private var profileUpdateCompleted = false
    private var currentCleanupReadStatus = cleanupReadStatus
    private var currentCleanupReadAction = cleanupReadAction

    override suspend fun load(): AccountProfileSnapshot {
        loadFailure?.let { throw it }
        return AccountProfileSnapshot(
            user = initialUser,
            clinics = listOf(ClinicOption("clinic_1", "Phòng khám Shcare")),
            specialties = listOf(SpecialtyOption("specialty_1", "Tim mạch")),
            avatarBytes = if (avatarLoadFailed) null else byteArrayOf(1, 2, 3),
            avatarLoadFailed = avatarLoadFailed,
            authSessionEpoch = 7L,
            avatarCleanup = AvatarCleanupStatusSnapshot(
                userId = cleanupReadOwnerUserId,
                workspaceId = cleanupReadWorkspaceId,
                status = currentCleanupReadStatus,
                operationId = if (currentCleanupReadStatus == AvatarCleanupStatus.NotRequired) {
                    ""
                } else {
                    "avatar_cleanup_read_1"
                },
                action = currentCleanupReadAction,
                previousFileId = "file-old",
                attempts = if (currentCleanupReadStatus == AvatarCleanupStatus.DeadLetter) 8 else 0,
                lastErrorCode = if (currentCleanupReadStatus == AvatarCleanupStatus.DeadLetter) {
                    "PROVIDER_UNAVAILABLE"
                } else {
                    ""
                },
                updatedAt = if (currentCleanupReadStatus == AvatarCleanupStatus.NotRequired) {
                    ""
                } else {
                    "2026-08-09T09:10:00.000Z"
                },
                manualSupportRequired = currentCleanupReadStatus == AvatarCleanupStatus.DeadLetter,
            ),
        )
    }

    override suspend fun updateProfile(intent: AccountProfileUpdateIntent): AccountProfileUpdateReceipt {
        updateCalls += 1
        updateKeys += intent.idempotencyKey
        if (updateFailuresRemaining > 0) {
            updateFailuresRemaining -= 1
            throw IOException("response lost after dispatch")
        }
        profileUpdateCompleted = true
        val returnedAddress = if (confirmUpdate) intent.address else initialUser.address
        return AccountProfileUpdateReceipt(
            userId = profileReceiptUserId,
            intent = "profile_update",
            changedFields = intent.expectedChangedFields,
            user = AccountProfileMutationUser(
                id = profileReceiptUserId,
                name = intent.name,
                title = "",
                phone = intent.expectedPhone,
                license = intent.license,
                hospital = intent.hospital,
                department = intent.department,
                specialty = intent.specialty,
                address = returnedAddress,
                organizationId = intent.expectedOrganizationId,
                updatedAt = "2026-08-09T10:00:00.000Z",
            ),
            replayed = updateCalls > 1,
        )
    }

    override suspend fun uploadAvatar(intent: AvatarUploadIntent): AvatarUploadReceipt {
        uploadKeys += intent.idempotencyKey
        if (uploadFailuresRemaining > 0) {
            uploadFailuresRemaining -= 1
            throw uploadFailure
        }
        uploadedBytes = intent.bytes.copyOf()
        uploadCompleted = true
        currentCleanupReadStatus = uploadCleanupStatus
        currentCleanupReadAction = AvatarCleanupAction.Upload
        return AvatarUploadReceipt(
            avatar = AvatarFileReceipt(
                fileId = "avatar_new",
                ownerUserId = uploadReceiptOwnerUserId,
                name = intent.fileName,
                contentType = intent.contentType,
                byteSize = intent.bytes.size,
                sha256 = intent.sha256,
                downloadUrl = "/api/v1/me/avatar",
                uploadedAt = "2026-08-09T09:00:00.000Z",
            ),
            cleanup = AvatarCleanupReceipt(
                status = uploadCleanupStatus,
                previousFileId = "avatar_old",
            ),
            operationId = "avatar_upload_operation_1",
            replayed = uploadKeys.size > 1,
        )
    }

    override suspend fun deleteAvatar(intent: AvatarDeleteIntent): AvatarDeleteReceipt {
        deleteCalls += 1
        val deletedFileId = if (confirmDelete) intent.expectedAvatarFileId else "another-avatar"
        if (confirmDelete) {
            currentCleanupReadStatus = deleteCleanupStatus
            currentCleanupReadAction = AvatarCleanupAction.Delete
        }
        return AvatarDeleteReceipt(
            deleted = true,
            avatar = AvatarDeletedFileReceipt(
                fileId = deletedFileId,
                ownerUserId = intent.userId,
                deletedAt = "2026-08-09T09:05:00.000Z",
            ),
            cleanup = AvatarCleanupReceipt(
                status = deleteCleanupStatus,
                previousFileId = deletedFileId,
            ),
            operationId = "avatar_delete_operation_1",
            replayed = false,
        )
    }

    override suspend fun downloadAvatar(intent: AvatarDownloadIntent): ByteArray =
        uploadedBytes.copyOf()

    override fun isAuthorityCurrent(expectedUserId: String, expectedAuthSessionEpoch: Long): Boolean =
        expectedUserId == "user_1" &&
            expectedAuthSessionEpoch == 7L &&
            (!uploadCompleted || authorityCurrentAfterUpload) &&
            (!profileUpdateCompleted || authorityCurrentAfterProfileUpdate)
}

private fun profileUser(): AuthUser = AuthUser(
    id = "user_1",
    role = "doctor",
    name = "Bác sĩ An",
    email = "an@shcare.vn",
    phone = "0912 345 678",
    license = "CCHN-001",
    organizationId = "clinic_1",
    hospital = "Phòng khám Shcare",
    department = "Tim mạch",
    specialty = "Tim mạch",
    address = "Địa chỉ cũ",
    avatarFileId = "avatar_old",
    avatarUrl = "/me/avatar",
)
