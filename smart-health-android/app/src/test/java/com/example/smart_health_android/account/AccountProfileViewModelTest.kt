package com.example.smart_health_android.account

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.ClinicOption
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.SpecialtyOption
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
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
    fun `phone change routes to verification without profile mutation`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository()
        val viewModel = AccountProfileViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(AccountProfileAction.StartEditing)
        viewModel.onAction(AccountProfileAction.ChangePhone("0912 345 679"))
        viewModel.onAction(AccountProfileAction.Save)
        advanceUntilIdle()

        assertEquals(
            AccountProfileEffect.ReverifyPhone("0912 345 679"),
            viewModel.effects.first(),
        )
        assertEquals(0, repository.updateCalls)
        assertTrue(viewModel.uiState.value.isEditing)
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
    fun `failed avatar upload keeps backend avatar and displayed bytes`() = runTest(dispatcher) {
        val repository = FakeAccountProfileRepository(uploadFailure = true)
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

        assertEquals("avatar_key", repository.uploadKey)
        assertEquals("avatar_new", viewModel.uiState.value.user?.avatarFileId)
        assertArrayEquals(byteArrayOf(4, 5, 6), viewModel.uiState.value.avatarBytes)
        assertEquals(AccountProfileConfirmation.AvatarUpdated, viewModel.uiState.value.confirmation)
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
    private val uploadFailure: Boolean = false,
    private val confirmDelete: Boolean = true,
) : AccountProfileRepository {
    private val initialUser = profileUser()
    var updateCalls = 0
    val updateKeys = mutableListOf<String>()
    var uploadKey = ""
    var deleteCalls = 0

    override suspend fun load(): AccountProfileSnapshot {
        loadFailure?.let { throw it }
        return AccountProfileSnapshot(
            user = initialUser,
            clinics = listOf(ClinicOption("clinic_1", "Phòng khám Shcare")),
            specialties = listOf(SpecialtyOption("specialty_1", "Tim mạch")),
            avatarBytes = if (avatarLoadFailed) null else byteArrayOf(1, 2, 3),
            avatarLoadFailed = avatarLoadFailed,
        )
    }

    override suspend fun updateProfile(
        draft: AccountProfileDraft,
        idempotencyKey: String,
    ): AuthUser {
        updateCalls += 1
        updateKeys += idempotencyKey
        if (updateFailuresRemaining > 0) {
            updateFailuresRemaining -= 1
            error("temporary failure")
        }
        if (!confirmUpdate) return initialUser
        return initialUser.copy(
            name = draft.name,
            license = draft.license,
            organizationId = draft.organizationId,
            hospital = draft.hospital,
            department = draft.department,
            specialty = draft.department,
            address = draft.address,
        )
    }

    override suspend fun uploadAvatar(
        fileName: String,
        contentType: String,
        bytes: ByteArray,
        idempotencyKey: String,
    ): AuthUser {
        uploadKey = idempotencyKey
        if (uploadFailure) error("upload failed")
        return initialUser.copy(avatarFileId = "avatar_new", avatarUrl = "/me/avatar")
    }

    override suspend fun deleteAvatar(idempotencyKey: String): AuthUser {
        deleteCalls += 1
        return if (confirmDelete) {
            initialUser.copy(avatarFileId = "", avatarUrl = "")
        } else {
            initialUser
        }
    }

    override suspend fun downloadAvatar(): ByteArray = byteArrayOf(4, 5, 6)
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
