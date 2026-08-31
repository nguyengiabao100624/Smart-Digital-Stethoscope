package com.example.smart_health_android.account

import com.example.smart_health_android.data.ActiveProfileResult
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientMutationIntent
import com.example.smart_health_android.data.PatientMutationReceipt
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import java.io.IOException
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
    fun `post commit create replacement quarantines UI and replays only for original authority`() =
        runTest(dispatcher) {
            val repository = FakeFamilyRepository().apply {
                createFailures += postDispatchFamilyReplacement()
            }
            val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "create_reconcile_key" })
            advanceUntilIdle()
            viewModel.enterValidDraft()
            val originalDraft = viewModel.uiState.value.draft

            viewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("create_reconcile_key"), repository.createKeys)
            assertEquals(originalDraft, viewModel.uiState.value.draft)
            assertFalse(viewModel.uiState.value.profiles.any { it.id == "server_created" })
            assertEquals("", viewModel.uiState.value.confirmationMessage)

            repository.replaceLoadedOwner()
            viewModel.onAction(FamilyProfilesAction.Retry)
            advanceUntilIdle()
            assertEquals(listOf(REPLACEMENT_SELF_ID), viewModel.uiState.value.profiles.map(Patient::id))
            assertEquals(FamilyProfileDraft(), viewModel.uiState.value.draft)

            viewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertEquals(listOf("create_reconcile_key"), repository.createKeys)
            assertFalse(viewModel.uiState.value.profiles.any { it.id == "server_created" })

            repository.restoreOriginalOwner(epoch = 9L)
            repository.createReceiptOverride = canonicalCreateReceipt().copy(replayed = true)
            viewModel.onAction(FamilyProfilesAction.Retry)
            advanceUntilIdle()
            assertEquals(originalDraft, viewModel.uiState.value.draft)

            viewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("create_reconcile_key", "create_reconcile_key"), repository.createKeys)
            assertEquals(originalDraft.toMutation(), repository.createMutations.last())
            assertEquals(9L, repository.createAuthorities.last().authSessionEpoch)
            assertTrue(viewModel.uiState.value.profiles.any { it.id == "server_created" })
        }

    @Test
    fun `process recreation restores encrypted pending create and exact idempotency replay`() =
        runTest(dispatcher) {
            val sharedOutbox = TestFamilyMutationOutbox()
            val firstRepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                createFailures += postDispatchFamilyReplacement()
            }
            val firstViewModel = FamilyProfilesViewModel(
                firstRepository,
                idempotencyKeyFactory = { "process_recreate_key" },
            )
            advanceUntilIdle()
            firstViewModel.enterValidDraft()
            val exactDraft = firstViewModel.uiState.value.draft
            firstViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertEquals(listOf("process_recreate_key"), firstRepository.createKeys)

            val recreatedRepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                currentAuthority = currentAuthority.copy(authSessionEpoch = 21L)
                createReceiptOverride = canonicalCreateReceipt().copy(replayed = true)
            }
            val recreatedViewModel = FamilyProfilesViewModel(
                recreatedRepository,
                idempotencyKeyFactory = { "must-not-generate-a-new-key" },
            )
            advanceUntilIdle()

            assertEquals(exactDraft, recreatedViewModel.uiState.value.draft)
            recreatedViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("process_recreate_key"), recreatedRepository.createKeys)
            assertEquals(exactDraft.toMutation(), recreatedRepository.createMutations.single())
            assertEquals(21L, recreatedRepository.createAuthorities.single().authSessionEpoch)
            assertTrue(recreatedViewModel.uiState.value.profiles.any { it.id == "server_created" })
        }

    @Test
    fun `process recreation restores pending update target payload and exact idempotency replay`() =
        runTest(dispatcher) {
            val sharedOutbox = TestFamilyMutationOutbox()
            val firstRepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                updateFailures += postDispatchFamilyReplacement()
            }
            val firstViewModel = FamilyProfilesViewModel(
                firstRepository,
                idempotencyKeyFactory = { "process-update-key" },
            )
            advanceUntilIdle()
            firstViewModel.onAction(FamilyProfilesAction.Edit("dependent_1"))
            firstViewModel.onAction(
                FamilyProfilesAction.DraftChanged(FamilyProfileField.Name, "Process-restored dependent"),
            )
            val exactDraft = firstViewModel.uiState.value.draft
            firstViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertEquals(listOf("process-update-key"), firstRepository.updateKeys)

            val recreatedRepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                currentAuthority = currentAuthority.copy(authSessionEpoch = 22L)
                updateReceiptOverride = canonicalUpdateReceipt(
                    dependent.copy(name = "Process-restored dependent"),
                ).copy(replayed = true)
            }
            val recreatedViewModel = FamilyProfilesViewModel(
                recreatedRepository,
                idempotencyKeyFactory = { "must-not-replace-update-key" },
            )
            advanceUntilIdle()

            assertEquals("dependent_1", recreatedViewModel.uiState.value.editingProfileId)
            assertEquals(exactDraft, recreatedViewModel.uiState.value.draft)
            recreatedViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("process-update-key"), recreatedRepository.updateKeys)
            assertEquals(exactDraft.toMutation(), recreatedRepository.updateMutations.single())
            assertEquals(22L, recreatedRepository.updateAuthorities.single().authSessionEpoch)
            assertEquals(
                "Process-restored dependent",
                recreatedViewModel.uiState.value.profiles.first { it.id == "dependent_1" }.name,
            )
            assertEquals(FamilyMutationOutboxLoad.Empty, sharedOutbox.load(recreatedRepository.currentAuthority))
        }

    @Test
    fun `process recreation restores pending delete target and exact idempotency replay`() =
        runTest(dispatcher) {
            val sharedOutbox = TestFamilyMutationOutbox()
            val firstRepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                deleteFailures += postDispatchFamilyReplacement()
            }
            val firstViewModel = FamilyProfilesViewModel(
                firstRepository,
                idempotencyKeyFactory = { "process-delete-key" },
            )
            advanceUntilIdle()
            firstViewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            firstViewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()
            assertEquals(listOf("dependent_1" to "process-delete-key"), firstRepository.deleteRequests)

            val recreatedRepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                currentAuthority = currentAuthority.copy(authSessionEpoch = 23L)
                deleteReceiptOverride = canonicalDeleteReceipt("dependent_1").copy(replayed = true)
            }
            val recreatedViewModel = FamilyProfilesViewModel(
                recreatedRepository,
                idempotencyKeyFactory = { "must-not-replace-delete-key" },
            )
            advanceUntilIdle()

            assertEquals("dependent_1", recreatedViewModel.uiState.value.pendingDelete?.id)
            recreatedViewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            assertEquals(
                listOf("dependent_1" to "process-delete-key"),
                recreatedRepository.deleteRequests,
            )
            assertEquals(23L, recreatedRepository.deleteAuthorities.single().authSessionEpoch)
            assertFalse(recreatedViewModel.uiState.value.profiles.any { it.id == "dependent_1" })
            assertEquals(FamilyMutationOutboxLoad.Empty, sharedOutbox.load(recreatedRepository.currentAuthority))
        }

    @Test
    fun `account A pending does not block account B success before A exact reconciliation`() =
        runTest(dispatcher) {
            val sharedOutbox = TestFamilyMutationOutbox()
            val accountARepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                createFailures += postDispatchFamilyReplacement()
            }
            val accountAViewModel = FamilyProfilesViewModel(
                accountARepository,
                idempotencyKeyFactory = { "account-a-reconcile-key" },
            )
            advanceUntilIdle()
            accountAViewModel.enterValidDraft()
            val accountAExactDraft = accountAViewModel.uiState.value.draft
            accountAViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            val accountAPending = sharedOutbox.load(accountARepository.currentAuthority)
                as FamilyMutationOutboxLoad.Pending
            assertEquals(PatientMutationIntent.Create, accountAPending.entry.intent)
            assertEquals("account-a-reconcile-key", accountAPending.entry.idempotencyKey)
            assertEquals(accountAExactDraft.toMutation(), accountAPending.entry.mutation)

            val accountBRepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                replaceLoadedOwner()
                createReceiptOverride = canonicalCreateReceipt(
                    Patient(
                        id = "replacement-created",
                        patientCode = "R002",
                        name = "Replacement dependent",
                        profileType = "dependent",
                        relationship = "Child",
                        ownerUserId = REPLACEMENT_USER_ID,
                        guardianUserId = REPLACEMENT_USER_ID,
                        organizationId = REPLACEMENT_WORKSPACE_ID,
                    ),
                ).copy(
                    userId = REPLACEMENT_USER_ID,
                    workspaceId = REPLACEMENT_WORKSPACE_ID,
                )
            }
            val accountBViewModel = FamilyProfilesViewModel(
                accountBRepository,
                idempotencyKeyFactory = { "account-b-create-key" },
            )
            advanceUntilIdle()
            accountBViewModel.enterValidDraft()
            accountBViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("account-b-create-key"), accountBRepository.createKeys)
            assertTrue(accountBViewModel.uiState.value.profiles.any { it.id == "replacement-created" })
            assertEquals(FamilyMutationOutboxLoad.Empty, sharedOutbox.load(accountBRepository.currentAuthority))
            assertEquals(
                "account-a-reconcile-key",
                (sharedOutbox.load(accountARepository.currentAuthority) as FamilyMutationOutboxLoad.Pending)
                    .entry.idempotencyKey,
            )

            val recreatedAccountARepository = FakeFamilyRepository(mutationOutbox = sharedOutbox).apply {
                currentAuthority = currentAuthority.copy(authSessionEpoch = 31L)
                createReceiptOverride = canonicalCreateReceipt().copy(replayed = true)
            }
            val recreatedAccountAViewModel = FamilyProfilesViewModel(
                recreatedAccountARepository,
                idempotencyKeyFactory = { "must-not-replace-account-a-key" },
            )
            advanceUntilIdle()
            assertEquals(accountAExactDraft, recreatedAccountAViewModel.uiState.value.draft)
            recreatedAccountAViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("account-a-reconcile-key"), recreatedAccountARepository.createKeys)
            assertEquals(31L, recreatedAccountARepository.createAuthorities.single().authSessionEpoch)
            assertTrue(recreatedAccountAViewModel.uiState.value.profiles.any { it.id == "server_created" })
            assertEquals(
                FamilyMutationOutboxLoad.Empty,
                sharedOutbox.load(recreatedAccountARepository.currentAuthority),
            )
        }

    @Test
    fun `unreadable and expired current slots stay fail closed with manual support guidance`() =
        runTest(dispatcher) {
            val unavailableOutbox = TestFamilyMutationOutbox().apply {
                markUnavailable(
                    FamilyMutationAuthority(
                        accountId = TEST_USER_ID,
                        workspaceId = TEST_WORKSPACE_ID,
                        authSessionId = TEST_AUTH_SESSION_ID,
                        authSessionEpoch = 7L,
                    ),
                )
            }
            val unavailableRepository = FakeFamilyRepository(mutationOutbox = unavailableOutbox)
            val unavailableViewModel = FamilyProfilesViewModel(unavailableRepository)
            advanceUntilIdle()

            assertTrue(unavailableViewModel.uiState.value.errorMessage.contains("hỗ trợ", ignoreCase = true))
            unavailableViewModel.enterValidDraft()
            unavailableViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertTrue(unavailableRepository.createKeys.isEmpty())
            assertTrue(unavailableViewModel.uiState.value.errorMessage.contains("hỗ trợ", ignoreCase = true))

            val blockedOutbox = TestFamilyMutationOutbox()
            val blockedAuthority = unavailableRepository.currentAuthority
            val blockedEntry = FamilyMutationOutboxEntry(
                intent = PatientMutationIntent.Delete,
                patientId = "dependent_1",
                mutation = null,
                deleteDisplayName = dependent.name,
                idempotencyKey = "expired-delete-support-key",
                authority = blockedAuthority,
            )
            assertNotNull(blockedOutbox.persist(blockedEntry))
            assertTrue(
                blockedOutbox.blockExact(
                    blockedAuthority,
                    blockedEntry.intent,
                    blockedEntry.idempotencyKey,
                ),
            )
            val blockedRepository = FakeFamilyRepository(mutationOutbox = blockedOutbox)
            val blockedViewModel = FamilyProfilesViewModel(blockedRepository)
            advanceUntilIdle()

            assertTrue(blockedViewModel.uiState.value.errorMessage.contains("hỗ trợ", ignoreCase = true))
            assertTrue(blockedViewModel.uiState.value.errorMessage.contains("expired-delete-support-key"))
            assertEquals(
                FamilyMutationOutboxLoad.Blocked(
                    PatientMutationIntent.Delete,
                    "expired-delete-support-key",
                ),
                blockedOutbox.load(blockedAuthority),
            )
        }

    @Test
    fun `failed exact clear after authority rejection blocks save and delete with original checkpoint`() =
        runTest(dispatcher) {
            val saveOutbox = TestFamilyMutationOutbox().apply { failExactClears() }
            val saveRepository = FakeFamilyRepository(mutationOutbox = saveOutbox).apply {
                createFailures += preDispatchFamilyAuthorityFailure()
            }
            val saveViewModel = FamilyProfilesViewModel(
                saveRepository,
                idempotencyKeyFactory = { "save-clear-support-key" },
            )
            advanceUntilIdle()
            saveViewModel.enterValidDraft()
            val exactSaveMutation = saveViewModel.uiState.value.draft.toMutation()
            saveViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            val pendingSave = saveOutbox.load(saveRepository.currentAuthority)
                as FamilyMutationOutboxLoad.Pending
            assertEquals(PatientMutationIntent.Create, pendingSave.entry.intent)
            assertEquals("save-clear-support-key", pendingSave.entry.idempotencyKey)
            assertEquals(exactSaveMutation, pendingSave.entry.mutation)
            assertTrue(saveViewModel.uiState.value.errorMessage.contains("hỗ trợ", ignoreCase = true))
            assertTrue(saveViewModel.uiState.value.errorMessage.contains("save-clear-support-key"))
            saveViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertEquals(listOf("save-clear-support-key"), saveRepository.createKeys)

            val deleteOutbox = TestFamilyMutationOutbox().apply { failExactClears() }
            val deleteRepository = FakeFamilyRepository(mutationOutbox = deleteOutbox).apply {
                deleteFailures += preDispatchFamilyAuthorityFailure()
            }
            val deleteViewModel = FamilyProfilesViewModel(
                deleteRepository,
                idempotencyKeyFactory = { "delete-clear-support-key" },
            )
            advanceUntilIdle()
            deleteViewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            deleteViewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            val pendingDelete = deleteOutbox.load(deleteRepository.currentAuthority)
                as FamilyMutationOutboxLoad.Pending
            assertEquals(PatientMutationIntent.Delete, pendingDelete.entry.intent)
            assertEquals("dependent_1", pendingDelete.entry.patientId)
            assertEquals("delete-clear-support-key", pendingDelete.entry.idempotencyKey)
            assertTrue(deleteViewModel.uiState.value.errorMessage.contains("hỗ trợ", ignoreCase = true))
            assertTrue(deleteViewModel.uiState.value.errorMessage.contains("delete-clear-support-key"))
            deleteViewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()
            assertEquals(
                listOf("dependent_1" to "delete-clear-support-key"),
                deleteRepository.deleteRequests,
            )
        }

    @Test
    fun `failed collision tombstone blocks save and delete without changing original key`() =
        runTest(dispatcher) {
            val saveOutbox = TestFamilyMutationOutbox().apply { failExactBlocks() }
            val saveRepository = FakeFamilyRepository(mutationOutbox = saveOutbox).apply {
                createFailures += deterministicFamilyCollision()
            }
            val saveViewModel = FamilyProfilesViewModel(
                saveRepository,
                idempotencyKeyFactory = { "save-block-support-key" },
            )
            advanceUntilIdle()
            saveViewModel.enterValidDraft()
            val exactSaveMutation = saveViewModel.uiState.value.draft.toMutation()
            saveViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            val pendingSave = saveOutbox.load(saveRepository.currentAuthority)
                as FamilyMutationOutboxLoad.Pending
            assertEquals(PatientMutationIntent.Create, pendingSave.entry.intent)
            assertEquals("save-block-support-key", pendingSave.entry.idempotencyKey)
            assertEquals(exactSaveMutation, pendingSave.entry.mutation)
            assertTrue(saveViewModel.uiState.value.errorMessage.contains("hỗ trợ", ignoreCase = true))
            assertTrue(saveViewModel.uiState.value.errorMessage.contains("save-block-support-key"))
            saveViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertEquals(listOf("save-block-support-key"), saveRepository.createKeys)

            val deleteOutbox = TestFamilyMutationOutbox().apply { failExactBlocks() }
            val deleteRepository = FakeFamilyRepository(mutationOutbox = deleteOutbox).apply {
                deleteFailures += deterministicFamilyCollision()
            }
            val deleteViewModel = FamilyProfilesViewModel(
                deleteRepository,
                idempotencyKeyFactory = { "delete-block-support-key" },
            )
            advanceUntilIdle()
            deleteViewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            deleteViewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            val pendingDelete = deleteOutbox.load(deleteRepository.currentAuthority)
                as FamilyMutationOutboxLoad.Pending
            assertEquals(PatientMutationIntent.Delete, pendingDelete.entry.intent)
            assertEquals("dependent_1", pendingDelete.entry.patientId)
            assertEquals("delete-block-support-key", pendingDelete.entry.idempotencyKey)
            assertTrue(deleteViewModel.uiState.value.errorMessage.contains("hỗ trợ", ignoreCase = true))
            assertTrue(deleteViewModel.uiState.value.errorMessage.contains("delete-block-support-key"))
            deleteViewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()
            assertEquals(
                listOf("dependent_1" to "delete-block-support-key"),
                deleteRepository.deleteRequests,
            )
        }

    @Test
    fun `post commit update replacement keeps exact intent and never applies stale result to another owner`() =
        runTest(dispatcher) {
            val repository = FakeFamilyRepository().apply {
                updateFailures += postDispatchFamilyReplacement()
            }
            val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "update_reconcile_key" })
            advanceUntilIdle()
            viewModel.onAction(FamilyProfilesAction.Edit("dependent_1"))
            viewModel.onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Name, "Updated dependent"))
            val originalDraft = viewModel.uiState.value.draft

            viewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("update_reconcile_key"), repository.updateKeys)
            assertEquals(dependent.name, viewModel.uiState.value.profiles.first { it.id == dependent.id }.name)
            assertEquals("", viewModel.uiState.value.confirmationMessage)

            repository.replaceLoadedOwner()
            viewModel.onAction(FamilyProfilesAction.Retry)
            advanceUntilIdle()
            viewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertEquals(listOf("update_reconcile_key"), repository.updateKeys)
            assertEquals(listOf(REPLACEMENT_SELF_ID), viewModel.uiState.value.profiles.map(Patient::id))

            repository.restoreOriginalOwner(epoch = 11L)
            repository.updateReceiptOverride = canonicalUpdateReceipt(
                dependent.copy(name = "Updated dependent"),
            ).copy(replayed = true)
            viewModel.onAction(FamilyProfilesAction.Retry)
            advanceUntilIdle()
            assertEquals("dependent_1", viewModel.uiState.value.editingProfileId)
            assertEquals(originalDraft, viewModel.uiState.value.draft)

            viewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()

            assertEquals(listOf("update_reconcile_key", "update_reconcile_key"), repository.updateKeys)
            assertEquals(originalDraft.toMutation(), repository.updateMutations.last())
            assertEquals(11L, repository.updateAuthorities.last().authSessionEpoch)
            assertEquals(
                "Updated dependent",
                viewModel.uiState.value.profiles.first { it.id == dependent.id }.name,
            )
        }

    @Test
    fun `foreign account create receipt keeps editor open and fails closed`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            createReceiptOverride = canonicalCreateReceipt().copy(userId = "foreign_user")
        }
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "create_key" })
        advanceUntilIdle()
        viewModel.enterValidDraft()
        val draftBeforeSave = viewModel.uiState.value.draft

        viewModel.onAction(FamilyProfilesAction.Save)
        advanceUntilIdle()

        assertEquals(draftBeforeSave, viewModel.uiState.value.draft)
        assertFalse(viewModel.uiState.value.profiles.any { it.id == "server_created" })
        assertEquals("", viewModel.uiState.value.confirmationMessage)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }

    @Test
    fun `foreign workspace create receipt keeps editor open and fails closed`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            createReceiptOverride = canonicalCreateReceipt().copy(workspaceId = "foreign_workspace")
        }
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "create_key" })
        advanceUntilIdle()
        viewModel.enterValidDraft()
        val draftBeforeSave = viewModel.uiState.value.draft

        viewModel.onAction(FamilyProfilesAction.Save)
        advanceUntilIdle()

        assertEquals(draftBeforeSave, viewModel.uiState.value.draft)
        assertFalse(viewModel.uiState.value.profiles.any { it.id == "server_created" })
        assertEquals("", viewModel.uiState.value.confirmationMessage)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }

    @Test
    fun `update receipt must match requested patient id before closing editor`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            updateReceiptOverride = canonicalUpdateReceipt().copy(
                patientId = "dependent_other",
                patient = dependent.copy(id = "dependent_other", name = "Không được dùng"),
            )
        }
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "update_key" })
        advanceUntilIdle()
        viewModel.onAction(FamilyProfilesAction.Edit("dependent_1"))
        viewModel.onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Name, "Updated child"))

        viewModel.onAction(FamilyProfilesAction.Save)
        advanceUntilIdle()

        assertEquals("dependent_1", viewModel.uiState.value.editingProfileId)
        assertEquals("Updated child", viewModel.uiState.value.draft.name)
        assertEquals(dependent.name, viewModel.uiState.value.profiles.first { it.id == "dependent_1" }.name)
        assertEquals("", viewModel.uiState.value.confirmationMessage)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }

    @Test
    fun `active profile changes only after matching server confirmation`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository(confirmActiveSwitch = false)
        val generatedKeys = listOf("switch_key_1", "switch_key_2").iterator()
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { generatedKeys.next() })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals("self_1", viewModel.uiState.value.activePatientId)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())

        repository.confirmActiveSwitch = true
        val confirmedEffect = async { viewModel.effects.first() }
        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals("dependent_1", viewModel.uiState.value.activePatientId)
        assertEquals(
            "dependent_1",
            (confirmedEffect.await() as FamilyProfilesEffect.ActiveProfileConfirmed).expectedPatientId,
        )
        assertEquals(
            listOf(
                "dependent_1" to "switch_key_1",
                "dependent_1" to "switch_key_1",
            ),
            repository.switchRequests,
        )
    }

    @Test
    fun `foreign workspace profile confirmation never updates local active subject`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            switchPatientWorkspaceId = "workspace-foreign"
        }
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "switch_key" })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals("self_1", viewModel.uiState.value.activePatientId)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }

    @Test
    fun `network retry keeps active profile target and idempotency key until confirmation`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            switchFailures += IOException("connection reset")
        }
        val generatedKeys = listOf("switch_key_1", "switch_key_2").iterator()
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { generatedKeys.next() })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()
        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals(
            listOf(
                "dependent_1" to "switch_key_1",
                "dependent_1" to "switch_key_1",
            ),
            repository.switchRequests,
        )
        assertEquals("dependent_1", viewModel.uiState.value.activePatientId)

        viewModel.onAction(FamilyProfilesAction.SwitchActive("self_1"))
        advanceUntilIdle()

        assertEquals("self_1" to "switch_key_2", repository.switchRequests.last())
        assertEquals("self_1", viewModel.uiState.value.activePatientId)
    }

    @Test
    fun `server 5xx retry keeps active profile target and idempotency key`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            switchFailures += SmartHealthApiException(
                statusCode = 503,
                code = "SERVICE_UNAVAILABLE",
                message = "try again",
            )
        }
        val generatedKeys = listOf("switch_key_1", "switch_key_2").iterator()
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { generatedKeys.next() })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()
        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals(
            listOf(
                "dependent_1" to "switch_key_1",
                "dependent_1" to "switch_key_1",
            ),
            repository.switchRequests,
        )
    }

    @Test
    fun `definitive 4xx clears active profile retry receipt`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            switchFailures += SmartHealthApiException(
                statusCode = 409,
                code = "ACTIVE_PROFILE_CONFLICT",
                message = "profile cannot be selected",
            )
        }
        val generatedKeys = listOf("switch_key_1", "switch_key_2").iterator()
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { generatedKeys.next() })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()
        viewModel.onAction(FamilyProfilesAction.SwitchActive("dependent_1"))
        advanceUntilIdle()

        assertEquals(
            listOf(
                "dependent_1" to "switch_key_1",
                "dependent_1" to "switch_key_2",
            ),
            repository.switchRequests,
        )
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
    fun `ambiguous delete retry and double submit keep the same target and idempotency key`() =
        runTest(dispatcher) {
            val repository = FakeFamilyRepository().apply {
                deleteFailures += IOException("response lost after commit")
            }
            val keys = listOf("delete_key_1", "delete_key_2").iterator()
            val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { keys.next() })
            advanceUntilIdle()

            viewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            assertEquals(listOf("dependent_1" to "delete_key_1"), repository.deleteRequests)
            assertTrue(viewModel.uiState.value.profiles.any { it.id == "dependent_1" })

            viewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            assertEquals(
                listOf(
                    "dependent_1" to "delete_key_1",
                    "dependent_1" to "delete_key_1",
                ),
                repository.deleteRequests,
            )
            assertFalse(viewModel.uiState.value.profiles.any { it.id == "dependent_1" })
        }

    @Test
    fun `post commit delete replacement retains exact replay without leaking the deleted profile`() =
        runTest(dispatcher) {
            val repository = FakeFamilyRepository().apply {
                deleteFailures += postDispatchFamilyReplacement()
            }
            val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "delete_reconcile_key" })
            advanceUntilIdle()

            viewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            assertEquals(listOf("dependent_1" to "delete_reconcile_key"), repository.deleteRequests)
            assertTrue(viewModel.uiState.value.profiles.any { it.id == "dependent_1" })
            assertEquals("", viewModel.uiState.value.confirmationMessage)

            repository.replaceLoadedOwner()
            viewModel.onAction(FamilyProfilesAction.Retry)
            advanceUntilIdle()
            assertEquals(listOf(REPLACEMENT_SELF_ID), viewModel.uiState.value.profiles.map(Patient::id))
            assertEquals(null, viewModel.uiState.value.pendingDelete)
            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()
            assertEquals(listOf("dependent_1" to "delete_reconcile_key"), repository.deleteRequests)

            repository.restoreOriginalOwner(epoch = 13L)
            repository.deleteReceiptOverride = canonicalDeleteReceipt("dependent_1").copy(replayed = true)
            viewModel.onAction(FamilyProfilesAction.Retry)
            advanceUntilIdle()
            assertEquals("dependent_1", viewModel.uiState.value.pendingDelete?.id)

            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            assertEquals(
                listOf(
                    "dependent_1" to "delete_reconcile_key",
                    "dependent_1" to "delete_reconcile_key",
                ),
                repository.deleteRequests,
            )
            assertEquals(13L, repository.deleteAuthorities.last().authSessionEpoch)
            assertFalse(viewModel.uiState.value.profiles.any { it.id == "dependent_1" })
        }

    @Test
    fun `foreign workspace delete receipt never removes the local profile`() = runTest(dispatcher) {
        val repository = FakeFamilyRepository().apply {
            deleteReceiptOverride = canonicalDeleteReceipt("dependent_1").copy(
                workspaceId = "foreign_workspace",
            )
        }
        val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { "delete_key" })
        advanceUntilIdle()

        viewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
        viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.profiles.any { it.id == "dependent_1" })
        assertEquals("dependent_1", viewModel.uiState.value.pendingDelete?.id)
        assertEquals("", viewModel.uiState.value.confirmationMessage)
        assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
    }

    @Test
    fun `delete key collision becomes a blocked tombstone instead of risking a duplicate`() =
        runTest(dispatcher) {
            val repository = FakeFamilyRepository().apply {
                deleteFailures += SmartHealthApiException(
                    statusCode = 409,
                    code = "IDEMPOTENCY_KEY_REUSED",
                    message = "key collision",
                )
            }
            val keys = listOf("delete_key_1", "delete_key_2").iterator()
            val viewModel = FamilyProfilesViewModel(repository, idempotencyKeyFactory = { keys.next() })
            advanceUntilIdle()

            viewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()
            viewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()

            assertEquals(
                listOf("dependent_1" to "delete_key_1"),
                repository.deleteRequests,
            )
            assertTrue(viewModel.uiState.value.profiles.any { it.id == "dependent_1" })
            assertTrue(viewModel.uiState.value.errorMessage.isNotBlank())
        }

    @Test
    fun `create update and delete never dispatch after the loaded session authority changes`() =
        runTest(dispatcher) {
            val capturedAuthority = FamilyMutationAuthority(
                accountId = TEST_USER_ID,
                workspaceId = TEST_WORKSPACE_ID,
                authSessionId = TEST_AUTH_SESSION_ID,
                authSessionEpoch = 7L,
            )
            val replacementAuthority = capturedAuthority.copy(
                authSessionId = "auth-session-replacement",
                authSessionEpoch = 8L,
            )

            val createRepository = FakeFamilyRepository()
            val createViewModel = FamilyProfilesViewModel(
                createRepository,
                idempotencyKeyFactory = { "create-authority-key" },
            )
            advanceUntilIdle()
            createRepository.currentAuthority = replacementAuthority
            createViewModel.enterValidDraft()
            createViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertTrue(createRepository.createAuthorities.isEmpty())

            val updateRepository = FakeFamilyRepository()
            val updateViewModel = FamilyProfilesViewModel(
                updateRepository,
                idempotencyKeyFactory = { "update-authority-key" },
            )
            advanceUntilIdle()
            updateRepository.currentAuthority = replacementAuthority
            updateViewModel.onAction(FamilyProfilesAction.Edit("dependent_1"))
            updateViewModel.onAction(
                FamilyProfilesAction.DraftChanged(FamilyProfileField.Name, "Updated dependent"),
            )
            updateViewModel.onAction(FamilyProfilesAction.Save)
            advanceUntilIdle()
            assertTrue(updateRepository.updateAuthorities.isEmpty())

            val deleteRepository = FakeFamilyRepository()
            val deleteViewModel = FamilyProfilesViewModel(
                deleteRepository,
                idempotencyKeyFactory = { "delete-authority-key" },
            )
            advanceUntilIdle()
            deleteRepository.currentAuthority = replacementAuthority
            deleteViewModel.onAction(FamilyProfilesAction.RequestDelete("dependent_1"))
            deleteViewModel.onAction(FamilyProfilesAction.ConfirmDelete)
            advanceUntilIdle()
            assertTrue(deleteRepository.deleteAuthorities.isEmpty())
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
    override val mutationOutbox: FamilyMutationOutbox = TestFamilyMutationOutbox(),
) : FamilyProfilesRepository {
    var currentAuthority = FamilyMutationAuthority(
        accountId = TEST_USER_ID,
        workspaceId = TEST_WORKSPACE_ID,
        authSessionId = TEST_AUTH_SESSION_ID,
        authSessionEpoch = 7L,
    )
    var createCalls = 0
    var deleteCalls = 0
    var lastMutation: FamilyProfileMutation? = null
    var lastCreateKey = ""
    val createKeys = mutableListOf<String>()
    val createMutations = mutableListOf<FamilyProfileMutation>()
    val createFailures = ArrayDeque<Throwable>()
    val updateKeys = mutableListOf<String>()
    val updateMutations = mutableListOf<FamilyProfileMutation>()
    val updateFailures = ArrayDeque<Throwable>()
    val switchFailures = ArrayDeque<Throwable>()
    val switchRequests = mutableListOf<Pair<String, String>>()
    val deleteFailures = ArrayDeque<Throwable>()
    val deleteRequests = mutableListOf<Pair<String, String>>()
    var switchPatientWorkspaceId = TEST_WORKSPACE_ID
    var createReceiptOverride: PatientMutationReceipt? = null
    var updateReceiptOverride: PatientMutationReceipt? = null
    var deleteReceiptOverride: PatientMutationReceipt? = null
    val createAuthorities = mutableListOf<FamilyMutationAuthority>()
    val updateAuthorities = mutableListOf<FamilyMutationAuthority>()
    val deleteAuthorities = mutableListOf<FamilyMutationAuthority>()
    var loadedUser: AuthUser = familyUser(activePatientId = self.id)
    var loadedProfiles: List<Patient> = listOf(
        dependent,
        Patient("workspace_patient", "P999", "Other", profileType = "patient"),
        self,
    )

    override suspend fun currentUser(): AuthUser =
        loadFailure?.let { throw it } ?: loadedUser

    override suspend fun listProfiles(): List<Patient> = loadFailure?.let { throw it } ?: loadedProfiles

    override fun captureMutationSessionAuthority(): FamilyMutationSessionAuthority? =
        FamilyMutationSessionAuthority(
            authSessionId = currentAuthority.authSessionId,
            authSessionEpoch = currentAuthority.authSessionEpoch,
        ).takeIf { it.isComplete }

    override fun isMutationSessionAuthorityCurrent(
        authority: FamilyMutationSessionAuthority,
    ): Boolean = authority.authSessionId == currentAuthority.authSessionId &&
        authority.authSessionEpoch == currentAuthority.authSessionEpoch

    override suspend fun create(
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt {
        createCalls += 1
        createKeys += idempotencyKey
        createMutations += mutation
        lastCreateKey = idempotencyKey
        lastMutation = mutation
        createAuthorities += authority
        if (createFailures.isNotEmpty()) throw createFailures.removeFirst()
        if (createFailuresRemaining > 0) {
            createFailuresRemaining -= 1
            error("temporary failure")
        }
        val patient = Patient(
            id = "server_created",
            patientCode = "P003",
            name = mutation.name,
            dateOfBirth = mutation.dateOfBirth,
            bloodType = mutation.bloodType,
            allergies = mutation.allergies,
            emergencyContact = mutation.emergencyContact,
            profileType = "dependent",
            relationship = mutation.relationship,
            ownerUserId = TEST_USER_ID,
            guardianUserId = TEST_USER_ID,
            organizationId = TEST_WORKSPACE_ID,
        )
        return createReceiptOverride ?: canonicalCreateReceipt(patient)
    }

    override suspend fun update(
        patientId: String,
        mutation: FamilyProfileMutation,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt {
        updateKeys += idempotencyKey
        updateMutations += mutation
        updateAuthorities += authority
        if (updateFailures.isNotEmpty()) throw updateFailures.removeFirst()
        return updateReceiptOverride ?: canonicalUpdateReceipt(
            dependent.copy(
                id = patientId,
                name = mutation.name,
                dateOfBirth = mutation.dateOfBirth,
            ),
        )
    }

    override suspend fun delete(
        patientId: String,
        idempotencyKey: String,
        authority: FamilyMutationAuthority,
    ): PatientMutationReceipt {
        deleteCalls += 1
        deleteRequests += patientId to idempotencyKey
        deleteAuthorities += authority
        if (deleteFailures.isNotEmpty()) throw deleteFailures.removeFirst()
        return deleteReceiptOverride ?: canonicalDeleteReceipt(patientId)
    }

    fun replaceLoadedOwner() {
        currentAuthority = FamilyMutationAuthority(
            accountId = REPLACEMENT_USER_ID,
            workspaceId = REPLACEMENT_WORKSPACE_ID,
            authSessionId = REPLACEMENT_AUTH_SESSION_ID,
            authSessionEpoch = currentAuthority.authSessionEpoch + 1L,
        )
        loadedUser = familyUser(
            activePatientId = REPLACEMENT_SELF_ID,
            userId = REPLACEMENT_USER_ID,
            workspaceId = REPLACEMENT_WORKSPACE_ID,
        )
        loadedProfiles = listOf(
            Patient(
                id = REPLACEMENT_SELF_ID,
                patientCode = "R001",
                name = "Replacement owner",
                profileType = "self",
                relationship = "self",
                accountUserId = REPLACEMENT_USER_ID,
                organizationId = REPLACEMENT_WORKSPACE_ID,
            ),
        )
    }

    fun restoreOriginalOwner(epoch: Long) {
        currentAuthority = FamilyMutationAuthority(
            accountId = TEST_USER_ID,
            workspaceId = TEST_WORKSPACE_ID,
            authSessionId = TEST_AUTH_SESSION_ID,
            authSessionEpoch = epoch,
        )
        loadedUser = familyUser(activePatientId = self.id)
        loadedProfiles = listOf(dependent, self)
    }

    override suspend fun switchActive(
        patientId: String,
        idempotencyKey: String,
    ): ActiveProfileResult {
        switchRequests += patientId to idempotencyKey
        if (switchFailures.isNotEmpty()) throw switchFailures.removeFirst()
        val confirmedId = if (confirmActiveSwitch) patientId else "self_1"
        return ActiveProfileResult(
            user = familyUser(activePatientId = confirmedId),
            activePatient = when (confirmedId) {
                dependent.id -> dependent.copy(organizationId = switchPatientWorkspaceId)
                else -> self
            },
        )
    }
}

private fun canonicalCreateReceipt(
    patient: Patient = Patient(
        id = "server_created",
        patientCode = "P003",
        name = "Bé An",
        profileType = "dependent",
        relationship = "Con",
        ownerUserId = TEST_USER_ID,
        guardianUserId = TEST_USER_ID,
        organizationId = TEST_WORKSPACE_ID,
    ),
): PatientMutationReceipt = PatientMutationReceipt(
    userId = TEST_USER_ID,
    workspaceId = TEST_WORKSPACE_ID,
    patientId = patient.id,
    intent = PatientMutationIntent.Create,
    patient = patient,
)

private fun canonicalUpdateReceipt(
    patient: Patient = dependent,
): PatientMutationReceipt = PatientMutationReceipt(
    userId = TEST_USER_ID,
    workspaceId = TEST_WORKSPACE_ID,
    patientId = patient.id,
    intent = PatientMutationIntent.Update,
    patient = patient,
)

private fun canonicalDeleteReceipt(patientId: String): PatientMutationReceipt =
    PatientMutationReceipt(
        userId = TEST_USER_ID,
        workspaceId = TEST_WORKSPACE_ID,
        patientId = patientId,
        intent = PatientMutationIntent.Delete,
        deleted = true,
    )

private fun FamilyProfilesViewModel.enterValidDraft() {
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Name, "Bé An"))
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.Relationship, "Con"))
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.DateOfBirth, "2016-01-02"))
    onAction(FamilyProfilesAction.DraftChanged(FamilyProfileField.BloodType, "O+"))
}

private fun postDispatchFamilyReplacement(): SmartHealthApiException = SmartHealthApiException(
    statusCode = 409,
    code = "PATIENT_MUTATION_RECONCILIATION_REQUIRED",
    details = mapOf(
        "patientMutationStage" to "post_dispatch",
        "mutationDisposition" to "unknown",
    ),
    message = "Authentication session changed after patient mutation dispatch",
)

private fun preDispatchFamilyAuthorityFailure(): SmartHealthApiException = SmartHealthApiException(
    statusCode = 409,
    code = "PATIENT_MUTATION_AUTHORITY_MISMATCH",
    details = mapOf(
        "patientMutationStage" to "pre_dispatch",
        "mutationDisposition" to "not_dispatched",
    ),
    message = "Patient mutation authority changed before dispatch",
)

private fun deterministicFamilyCollision(): SmartHealthApiException = SmartHealthApiException(
    statusCode = 409,
    code = "IDEMPOTENCY_KEY_REUSED",
    message = "Idempotency key collision",
)

private val self = Patient(
    id = "self_1",
    patientCode = "P001",
    name = "Nguyễn Minh",
    dateOfBirth = "1990-01-01",
    profileType = "self",
    relationship = "self",
    accountUserId = TEST_USER_ID,
    organizationId = TEST_WORKSPACE_ID,
)

private val dependent = Patient(
    id = "dependent_1",
    patientCode = "P002",
    name = "Bé An",
    dateOfBirth = "2016-07-15",
    profileType = "dependent",
    relationship = "Con",
    guardianUserId = TEST_USER_ID,
    organizationId = TEST_WORKSPACE_ID,
)

private fun familyUser(
    activePatientId: String,
    userId: String = TEST_USER_ID,
    workspaceId: String = TEST_WORKSPACE_ID,
): AuthUser {
    val membership = WorkspaceMembership(
        workspaceId = workspaceId,
        role = "patient",
    )
    return AuthUser(
        id = userId,
        firebaseUid = "firebase-user-1",
        role = "patient",
        organizationId = workspaceId,
        currentWorkspaceId = workspaceId,
        activePatientId = activePatientId,
        currentMembership = membership,
        currentWorkspace = WorkspaceSummary(
            id = workspaceId,
            role = "patient",
        ),
        memberships = listOf(membership),
        capabilities = listOf("personal.dashboard.view"),
    )
}

private const val TEST_USER_ID = "user_1"
private const val TEST_WORKSPACE_ID = "workspace-1"
private const val TEST_AUTH_SESSION_ID = "auth-session-1"
private const val REPLACEMENT_USER_ID = "user-replacement"
private const val REPLACEMENT_WORKSPACE_ID = "workspace-replacement"
private const val REPLACEMENT_AUTH_SESSION_ID = "auth-session-replacement"
private const val REPLACEMENT_SELF_ID = "self-replacement"

private class TestFamilyMutationOutbox : FamilyMutationOutbox {
    private val entries = mutableMapOf<String, FamilyMutationOutboxEntry>()
    private val unavailableSlots = mutableSetOf<String>()
    private var exactClearFails = false
    private var exactBlockFails = false

    fun markUnavailable(authority: FamilyMutationAuthority) {
        unavailableSlots += authority.testSlot()
    }

    fun failExactClears() {
        exactClearFails = true
    }

    fun failExactBlocks() {
        exactBlockFails = true
    }

    override fun persist(entry: FamilyMutationOutboxEntry): FamilyMutationOutboxEntry? {
        val slot = entry.authority.testSlot()
        val existing = entries[slot]
        if (existing != null) {
            return existing.takeIf {
                it.intent == entry.intent &&
                    it.patientId == entry.patientId &&
                    it.mutation == entry.mutation &&
                    it.idempotencyKey == entry.idempotencyKey
            }
        }
        return entry.copy(
            createdAtEpochMs = 1L,
            expiresAtEpochMs = Long.MAX_VALUE,
        ).also { entries[slot] = it }
    }

    override fun load(authority: FamilyMutationAuthority): FamilyMutationOutboxLoad {
        val slot = authority.testSlot()
        if (slot in unavailableSlots) return FamilyMutationOutboxLoad.Unavailable
        return entries[slot]?.let { entry ->
            if (entry.state == FamilyMutationOutboxState.ExpiredBlocked) {
                FamilyMutationOutboxLoad.Blocked(entry.intent, entry.idempotencyKey)
            } else {
                FamilyMutationOutboxLoad.Pending(entry)
            }
        } ?: FamilyMutationOutboxLoad.Empty
    }

    override fun clearExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean {
        val slot = authority.testSlot()
        val entry = entries[slot] ?: return true
        if (entry.intent != intent || entry.idempotencyKey != idempotencyKey) return false
        if (exactClearFails) return false
        entries.remove(slot)
        return true
    }

    override fun blockExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean {
        val slot = authority.testSlot()
        val entry = entries[slot] ?: return false
        if (entry.intent != intent || entry.idempotencyKey != idempotencyKey) return false
        if (exactBlockFails) return false
        entries[slot] = entry.copy(
            patientId = "",
            mutation = null,
            deleteDisplayName = "",
            state = FamilyMutationOutboxState.ExpiredBlocked,
        )
        return true
    }

    override fun clearExpiredBlockedForManualSupport(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean {
        val slot = authority.testSlot()
        val entry = entries[slot] ?: return true
        if (
            entry.state != FamilyMutationOutboxState.ExpiredBlocked ||
            entry.intent != intent ||
            entry.idempotencyKey != idempotencyKey
        ) return false
        entries.remove(slot)
        return true
    }
}

private fun FamilyMutationAuthority.testSlot(): String =
    "$accountId\u001f$workspaceId\u001f$authSessionId"
