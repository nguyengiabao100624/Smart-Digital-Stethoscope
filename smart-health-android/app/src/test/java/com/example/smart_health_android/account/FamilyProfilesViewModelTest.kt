package com.example.smart_health_android.account

import com.example.smart_health_android.data.ActiveProfileResult
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FamilyProfilesViewModelTest {
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
    fun `load keeps only self and dependent profiles from backend`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository()
        val viewModel = FamilyProfilesViewModel(repository)
        advanceUntilIdle()

        assertEquals(FamilyProfilesLoadState.Ready, viewModel.uiState.value.loadState)
        assertEquals(listOf("self_1", "dependent_1"), viewModel.uiState.value.profiles.map { it.id })
        assertEquals("self_1", viewModel.uiState.value.activePatientId)
    }

    @Test
    fun `offline load has explicit retry state`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository(loadFailure = IOException("offline"))
        val viewModel = FamilyProfilesViewModel(repository)
        advanceUntilIdle()

        assertEquals(FamilyProfilesLoadState.Offline, viewModel.uiState.value.loadState)

        repository.loadFailure = null
        viewModel.onAction(FamilyProfilesAction.Retry)
        advanceUntilIdle()

        assertEquals(FamilyProfilesLoadState.Ready, viewModel.uiState.value.loadState)
    }

    @Test
    fun `permission failure is distinct from connectivity error`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository(
            loadFailure = SmartHealthApiException(
                statusCode = 401,
                code = "UNAUTHORIZED",
                message = "unauthorized",
            ),
        )
        val viewModel = FamilyProfilesViewModel(repository)
        advanceUntilIdle()

        assertEquals(FamilyProfilesLoadState.PermissionDenied, viewModel.uiState.value.loadState)
    }

    @Test
    fun `invalid draft never reaches mutation repository`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository()
        val viewModel = FamilyProfilesViewModel(repository)
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.Save)

        assertEquals(0, repository.createCalls)
        assertTrue(viewModel.uiState.value.fieldErrors.containsKey("name"))
        assertTrue(viewModel.uiState.value.fieldErrors.containsKey("relationship"))
    }

    @Test
    fun `create sends canonical DOB clinical fields and uses server patient`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository()
        val viewModel = FamilyProfilesViewModel(
            repository = repository,
            idempotencyKeyFactory = { "create_key" },
            today = { LocalDate.of(2026, 7, 14) },
        )
        advanceUntilIdle()
        viewModel.enterValidDraft()
        viewModel.onAction(
            FamilyProfilesAction.DraftChanged(FamilyProfileField.Allergies, "Phấn hoa, Hải sản"),
        )
        viewModel.onAction(
            FamilyProfilesAction.DraftChanged(FamilyProfileField.EmergencyName, "Nguyễn An"),
        )
        viewModel.onAction(
            FamilyProfilesAction.DraftChanged(FamilyProfileField.EmergencyPhone, "0901000000"),
        )
        viewModel.onAction(
            FamilyProfilesAction.DraftChanged(FamilyProfileField.EmergencyRelationship, "Mẹ"),
        )

        viewModel.onAction(FamilyProfilesAction.Save)
        advanceUntilIdle()

        assertEquals(1, repository.createCalls)
        assertEquals("2016-01-02", repository.lastMutation?.dateOfBirth)
        assertEquals(listOf("Phấn hoa", "Hải sản"), repository.lastMutation?.allergies)
        assertEquals(EmergencyContact("Nguyễn An", "0901000000", "Mẹ"), repository.lastMutation?.emergencyContact)
        assertEquals("create_key", repository.lastCreateKey)
        assertTrue(viewModel.uiState.value.profiles.any { it.id == "server_created" })
    }

    @Test
    fun `save retry reuses idempotency key until server confirms`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository(createFailuresRemaining = 1)
        val viewModel = FamilyProfilesViewModel(
            repository = repository,
            idempotencyKeyFactory = { "stable_key" },
        )
        advanceUntilIdle()
        viewModel.enterValidDraft()

        viewModel.onAction(FamilyProfilesAction.Save)
        advanceUntilIdle()
        viewModel.onAction(FamilyProfilesAction.Save)
        advanceUntilIdle()

        assertEquals(listOf("stable_key", "stable_key"), repository.createKeys)
        assertTrue(viewModel.uiState.value.profiles.any { it.id == "server_created" })
    }

    @Test
    fun `active profile changes only after matching server confirmation`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository(confirmActiveSwitch = false)
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "switch_key" })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals("self_1", viewModel.uiState.value.activePatientId)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())

        repository.confirmActiveSwitch = true
        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals("dependent_1", viewModel.uiState.value.activePatientId)
    }

    @Test
    fun `delete requires confirmation and cannot target self or active profile`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository()
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "delete_key" })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.RequestDelete("self_1"))
        viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
        assertEquals(0, repository.deleteCalls)

        viewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
        assertEquals("dependent_1", viewModel.uiState.value.pendingDelete?.id)
        assertEquals(0, repository.deleteCalls)

        viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
        advanceUntilIdle()

        assertEquals(1, repository.deleteCalls)
        assertFalse(viewModel.uiState.value.profiles.any { it.id == "dependent_1" })
    }

    @Test
    fun `age is derived from canonical date of birth before compatibility age`() {
        val patient = dependent.copy(dateOfBirth = "2016-07-15", age = 99)

        assertEquals(9, patient.resolvedAge(LocalDate.of(2026, 7, 14)))
    }
}

private class FakeFamilyRepository(
    var createFailuresRemaining: Int = 0,
    var confirmActiveSwitch: Boolean = true,
    var loadFailure: Throwable? = null,
) : FamilyProfilesRepository {
    var createCalls = 0
    var deleteCalls = 0
    var lastMutation: FamilyProfileMutation? = null
    var lastCreateKey = ""
    val createKeys = mutableListOf<String>()

    override suspend fun currentUser(): AuthUser = loadFailure?.let { throw it } ?: AuthUser(
        id = "user_1",
        role = "patient",
        activePatientId = "self_1",
    )

    override suspend fun listProfiles(): List<Patient> = loadFailure?.let { throw it } ?: listOf(
        dependent,
        Patient("workspace_patient", "P999", "Other", profileType = "patient"),
        self,
    )

    override suspend fun create(
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
    ): Patient {
        createCalls += 1
        createKeys += idempotencyKey
        lastCreateKey = idempotencyKey
        lastMutation = mutation
        if (createFailuresRemaining > 0) {
            createFailuresRemaining -= 1
            error("temporary failure")
        }
        return Patient(
            id = "server_created",
            patientCode = "P003",
            name = mutation.name,
            dateOfBirth = mutation.dateOfBirth,
            bloodType = mutation.bloodType,
            allergies = mutation.allergies,
            emergencyContact = mutation.emergencyContact,
            profileType = "dependent",
            relationship = mutation.relationship,
        )
    }

    override suspend fun update(
        patientId: String,
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
    ): Patient = dependent.copy(
        id = patientId,
        name = mutation.name,
        dateOfBirth = mutation.dateOfBirth,
    )

    override suspend fun delete(patientId: String, idempotencyKey: String) {
        deleteCalls += 1
    }

    override suspend fun switchActive(
        patientId: String,
        idempotencyKey: String,
    ): ActiveProfileResult {
        val confirmedId = if (confirmActiveSwitch) patientId else "self_1"
        return ActiveProfileResult(
            user = AuthUser(id = "user_1", role = "patient", activePatientId = confirmedId),
            activePatient = if (confirmActiveSwitch) dependent else self,
        )
    }
}

private fun FamilyProfilesViewModel.enterValidDraft() {
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Name, "Bé An"))
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Relationship, "Con"))
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.DateOfBirth, "2016-01-02"))
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.BloodType, "O+"))
}

private val self = Patient(
    id = "self_1",
    patientCode = "P001",
    name = "Nguyễn Minh",
    dateOfBirth = "1990-01-01",
    profileType = "self",
    relationship = "self",
)

private val dependent = Patient(
    id = "dependent_1",
    patientCode = "P002",
    name = "Bé An",
    dateOfBirth = "2016-07-15",
    profileType = "dependent",
    relationship = "Con",
)
