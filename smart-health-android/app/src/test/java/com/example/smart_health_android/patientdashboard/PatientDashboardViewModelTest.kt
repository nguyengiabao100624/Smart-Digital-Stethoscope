package com.example.smart_health_android.patientdashboard

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientDashboardSectionAvailability
import com.example.smart_health_android.data.PatientDashboardSections
import com.example.smart_health_android.data.PatientDashboardSnapshot
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import com.example.smart_health_android.navigation.MobileExperience
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PatientDashboardViewModelTest {
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
    fun `completed scans remain neutral captured data and battery uses exact backend value`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = fakeRepository(
                users = listOf(Result.success(backendUser())),
                dashboards = listOf(
                    Result.success(
                        dashboardSnapshot(
                            scans = listOf(
                                Scan(
                                    id = "scan-blank",
                                    patientId = "patient-active",
                                    status = "completed",
                                ),
                                Scan(
                                    id = "scan-captured",
                                    patientId = "patient-active",
                                    status = "completed",
                                    aiLabel = "captured",
                                ),
                            ),
                            device = SmartDevice(
                                id = "device-1",
                                name = "Ống nghe tại nhà",
                                online = true,
                                organizationId = expected.workspaceId,
                                ownerUserId = expected.userId,
                                assignedPatientId = "patient-active",
                                reportedBatteryPercent = 0,
                            ),
                        ),
                    ),
                ),
            )

            val viewModel = patientDashboardViewModel(repository, expected)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(PatientDashboardLoadState.Content, state.loadState)
            assertEquals(
                PatientDashboardAnalysisState.Captured,
                state.recentScans.first { it.id == "scan-blank" }.analysisState,
            )
            assertEquals(
                PatientDashboardAnalysisState.Captured,
                state.recentScans.first { it.id == "scan-captured" }.analysisState,
            )
            assertEquals(0, state.device?.batteryPercent)
            assertEquals(PatientDashboardDevicePresence.Online, state.device?.presence)
            assertFalse(state.isPartial)
        }

    @Test
    fun `diagnostic AI copy is suppressed and interrupted scans remain typed technical failures`() =
        runTest(dispatcher) {
            val rawDiagnostic = "Chẩn đoán viêm phổi với độ tin cậy cao."
            val repository = fakeRepository(
                users = listOf(Result.success(backendUser())),
                dashboards = listOf(
                    Result.success(
                        dashboardSnapshot(
                            scans = listOf(
                                Scan(
                                    id = "scan-diagnostic-copy",
                                    patientId = "patient-active",
                                    status = "completed",
                                    aiLabel = "abnormal",
                                    aiSummary = rawDiagnostic,
                                ),
                                Scan(
                                    id = "scan-failed",
                                    patientId = "patient-active",
                                    status = "failed",
                                    aiLabel = "abnormal",
                                    aiSummary = rawDiagnostic,
                                ),
                                Scan(
                                    id = "scan-interrupted",
                                    patientId = "patient-active",
                                    status = "interrupted",
                                ),
                            ),
                        ),
                    ),
                ),
            )

            val viewModel = patientDashboardViewModel(repository, authority())
            runCurrent()

            val scans = viewModel.uiState.value.recentScans.associateBy { it.id }
            assertEquals(
                PatientDashboardAnalysisState.Captured,
                scans.getValue("scan-diagnostic-copy").analysisState,
            )
            assertTrue(scans.getValue("scan-diagnostic-copy").summary.isEmpty())
            assertFalse(scans.values.any { scan -> scan.summary.contains(rawDiagnostic) })
            assertEquals(
                PatientDashboardAnalysisState.TechnicalFailure,
                scans.getValue("scan-failed").analysisState,
            )
            assertTrue(scans.getValue("scan-failed").summary.isEmpty())
            assertEquals(
                PatientDashboardAnalysisState.TechnicalFailure,
                scans.getValue("scan-interrupted").analysisState,
            )
            assertTrue(scans.getValue("scan-interrupted").summary.isEmpty())
        }

    @Test
    fun `cross account backend response clears PII and invalidates only expected authority`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = fakeRepository(
                users = listOf(Result.success(backendUser(id = "patient-other"))),
            )
            var invalidations = 0

            val viewModel = patientDashboardViewModel(
                repository = repository,
                expected = expected,
                invalidateExpectedAuthority = { invalidations += 1 },
            )
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(PatientDashboardLoadState.PermissionDenied, state.loadState)
            assertNull(state.profile)
            assertTrue(state.recentScans.isEmpty())
            assertNull(state.device)
            assertEquals(1, invalidations)
            assertEquals(0, repository.dashboardLoads)
        }

    @Test
    fun `locked deleted or inactive membership never renders account data`() =
        runTest(dispatcher) {
            listOf(
                backendUser(accountStatus = "locked"),
                backendUser(deletedAt = "2026-07-29T08:00:00.000Z"),
                backendUser(membershipStatus = "suspended", operational = false),
            ).forEach { rejectedUser ->
                val repository = fakeRepository(
                    users = listOf(Result.success(rejectedUser)),
                )
                val viewModel = patientDashboardViewModel(repository, authority())
                runCurrent()

                assertEquals(
                    PatientDashboardLoadState.PermissionDenied,
                    viewModel.uiState.value.loadState,
                )
                assertNull(viewModel.uiState.value.profile)
                assertEquals(0, repository.dashboardLoads)
            }
        }

    @Test
    fun `unavailable section produces truthful partial content without a protected subrequest`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = fakeRepository(
                users = listOf(Result.success(backendUser())),
                dashboards = listOf(
                    Result.success(
                        dashboardSnapshot(
                            sections = PatientDashboardSections(
                                scans = PatientDashboardSectionAvailability.Unavailable,
                                device = PatientDashboardSectionAvailability.Ready,
                            ),
                            scans = emptyList(),
                            device = SmartDevice(
                                id = "device-1",
                                organizationId = expected.workspaceId,
                                ownerUserId = expected.userId,
                                assignedPatientId = "patient-active",
                            ),
                        ),
                    ),
                ),
            )

            val viewModel = patientDashboardViewModel(repository, expected)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(PatientDashboardLoadState.Content, state.loadState)
            assertEquals(PatientDashboardSectionState.Unavailable, state.scansState)
            assertEquals(PatientDashboardSectionState.Ready, state.deviceState)
            assertTrue(state.isPartial)
            assertFalse(state.isStale)
            assertEquals("patient-active", state.profile?.patientId)
            assertEquals(1, repository.dashboardLoads)
        }

    @Test
    fun `forbidden dashboard response fails closed and removes previously authorized content`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = fakeRepository(
                users = listOf(
                    Result.success(backendUser()),
                    Result.success(backendUser()),
                ),
                dashboards = listOf(
                    Result.success(dashboardSnapshot()),
                    Result.failure(
                        SmartHealthApiException(
                            statusCode = 403,
                            code = "FORBIDDEN",
                            requestId = "request-dashboard-403",
                            message = "forbidden",
                        ),
                    ),
                ),
            )
            var invalidations = 0
            val viewModel = patientDashboardViewModel(
                repository = repository,
                expected = expected,
                invalidateExpectedAuthority = { invalidations += 1 },
            )
            runCurrent()
            assertEquals(PatientDashboardLoadState.Content, viewModel.uiState.value.loadState)

            viewModel.onAction(PatientDashboardUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(PatientDashboardLoadState.PermissionDenied, state.loadState)
            assertEquals("request-dashboard-403", state.requestId)
            assertNull(state.profile)
            assertTrue(state.recentScans.isEmpty())
            assertNull(state.device)
            assertEquals(1, invalidations)
        }

    @Test
    fun `recoverable refresh keeps prior snapshot as stale without inventing success`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = fakeRepository(
                users = listOf(
                    Result.success(backendUser()),
                    Result.success(backendUser()),
                ),
                dashboards = listOf(
                    Result.success(
                        dashboardSnapshot(
                            scans = listOf(
                                Scan(
                                    id = "scan-1",
                                    patientId = "patient-active",
                                    aiLabel = "captured",
                                ),
                            ),
                            device = SmartDevice(
                                id = "device-1",
                                organizationId = expected.workspaceId,
                                ownerUserId = expected.userId,
                            ),
                        ),
                    ),
                    Result.failure(IOException("offline")),
                ),
            )
            val viewModel = patientDashboardViewModel(repository, expected)
            runCurrent()

            viewModel.onAction(PatientDashboardUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(PatientDashboardLoadState.Content, state.loadState)
            assertTrue(state.isStale)
            assertFalse(state.isPartial)
            assertEquals("scan-1", state.recentScans.single().id)
            assertEquals("device-1", state.device?.id)
            assertFalse(state.isRefreshing)
        }

    @Test
    fun `non retryable refresh clears stale PII`() = runTest(dispatcher) {
        val expected = authority()
        val repository = fakeRepository(
            users = listOf(
                Result.success(backendUser()),
                Result.success(backendUser()),
            ),
            dashboards = listOf(
                Result.success(dashboardSnapshot()),
                Result.failure(
                    SmartHealthApiException(
                        statusCode = 400,
                        code = "PATIENT_DASHBOARD_INVALID",
                        message = "invalid",
                    ),
                ),
            ),
        )
        val viewModel = patientDashboardViewModel(repository, expected)
        runCurrent()

        viewModel.onAction(PatientDashboardUiAction.Refresh)
        runCurrent()

        assertEquals(PatientDashboardLoadState.Error, viewModel.uiState.value.loadState)
        assertNull(viewModel.uiState.value.profile)
        assertFalse(viewModel.uiState.value.isStale)
    }

    @Test
    fun `mismatched dashboard contract never survives as stale content`() = runTest(dispatcher) {
        val expected = authority()
        val repository = fakeRepository(
            users = listOf(
                Result.success(backendUser()),
                Result.success(backendUser()),
            ),
            dashboards = listOf(
                Result.success(dashboardSnapshot()),
                Result.failure(
                    SmartHealthApiException(
                        statusCode = 502,
                        code = "PATIENT_DASHBOARD_PROFILE_MISMATCH",
                        message = "foreign active profile",
                    ),
                ),
            ),
        )
        var invalidations = 0
        val viewModel = patientDashboardViewModel(
            repository = repository,
            expected = expected,
            invalidateExpectedAuthority = { invalidations += 1 },
        )
        runCurrent()

        viewModel.onAction(PatientDashboardUiAction.Refresh)
        runCurrent()

        val state = viewModel.uiState.value
        assertEquals(PatientDashboardLoadState.PermissionDenied, state.loadState)
        assertEquals(PatientDashboardError.AuthorityMismatch, state.error)
        assertNull(state.profile)
        assertTrue(state.recentScans.isEmpty())
        assertNull(state.device)
        assertFalse(state.isStale)
        assertEquals(1, invalidations)
    }

    @Test
    fun `profile workspace mismatch 409 invalidates authority and clears cached content`() =
        runTest(dispatcher) {
            val expected = authority()
            val repository = fakeRepository(
                users = listOf(
                    Result.success(backendUser()),
                    Result.success(backendUser()),
                ),
                dashboards = listOf(
                    Result.success(dashboardSnapshot()),
                    Result.failure(
                        SmartHealthApiException(
                            statusCode = 409,
                            code = "PATIENT_DASHBOARD_PROFILE_WORKSPACE_MISMATCH",
                            requestId = "request-profile-workspace",
                            message = "active profile belongs to another workspace",
                        ),
                    ),
                ),
            )
            var invalidations = 0
            val viewModel = patientDashboardViewModel(
                repository = repository,
                expected = expected,
                invalidateExpectedAuthority = { invalidations += 1 },
            )
            runCurrent()

            viewModel.onAction(PatientDashboardUiAction.Refresh)
            runCurrent()

            val state = viewModel.uiState.value
            assertEquals(PatientDashboardLoadState.PermissionDenied, state.loadState)
            assertEquals(PatientDashboardError.AuthorityMismatch, state.error)
            assertEquals("request-profile-workspace", state.requestId)
            assertNull(state.profile)
            assertTrue(state.recentScans.isEmpty())
            assertNull(state.device)
            assertFalse(state.isStale)
            assertEquals(1, invalidations)
        }

    @Test
    fun `active dependent identity drives profile and assigned device`() = runTest(dispatcher) {
        val expected = authority()
        val repository = fakeRepository(
            users = listOf(Result.success(backendUser(name = "Chủ tài khoản"))),
            dashboards = listOf(
                Result.success(
                    dashboardSnapshot(
                        patient = activePatient(
                            id = "patient-child",
                            name = "Bé An",
                            relationship = "child",
                        ),
                        activePatientId = "patient-child",
                        device = SmartDevice(
                            id = "device-child",
                            organizationId = expected.workspaceId,
                            ownerUserId = expected.userId,
                            assignedPatientId = "patient-child",
                        ),
                    ),
                ),
            ),
        )

        val viewModel = patientDashboardViewModel(repository, expected)
        runCurrent()

        assertEquals("Bé An", viewModel.uiState.value.profile?.displayName)
        assertEquals("patient-child", viewModel.uiState.value.profile?.patientId)
        assertEquals("device-child", viewModel.uiState.value.device?.id)
    }

    @Test
    fun `assigned guardian can render the exact dependent profile in the same workspace`() =
        runTest(dispatcher) {
            val expected = authority()
            val guardianProfile = activePatient(
                id = "patient-dependent",
                name = "Hồ sơ được giám hộ",
                relationship = "child",
                ownerUserId = "patient-owner",
                guardianUserId = expected.userId,
            )
            val repository = fakeRepository(
                users = listOf(Result.success(backendUser())),
                dashboards = listOf(
                    Result.success(
                        dashboardSnapshot(
                            activePatientId = guardianProfile.id,
                            patient = guardianProfile,
                            scans = listOf(
                                Scan(
                                    id = "scan-dependent",
                                    patientId = guardianProfile.id,
                                    aiLabel = "captured",
                                ),
                            ),
                        ),
                    ),
                ),
            )

            val viewModel = patientDashboardViewModel(repository, expected)
            runCurrent()

            assertEquals(PatientDashboardLoadState.Content, viewModel.uiState.value.loadState)
            assertEquals(guardianProfile.id, viewModel.uiState.value.profile?.patientId)
            assertEquals("scan-dependent", viewModel.uiState.value.recentScans.single().id)
        }

    @Test
    fun `authority epoch changing in flight drops the old response without invalidating the new session`() =
        runTest(dispatcher) {
            val expected = authority()
            var current = expected
            val response = CompletableDeferred<PatientDashboardSnapshot>()
            val repository = object : PatientDashboardRepository {
                override suspend fun loadCurrentUser(): AuthUser = backendUser()

                override suspend fun loadDashboard(
                    expectedUserId: String,
                    expectedWorkspaceId: String,
                ): PatientDashboardSnapshot = response.await()
            }
            var invalidations = 0
            val viewModel = PatientDashboardViewModel(
                repository = repository,
                expectedAuthority = expected,
                currentAuthority = { current },
                features = fullFeatures(),
                invalidateExpectedAuthority = { invalidations += 1 },
            )
            runCurrent()
            current = authority(epoch = 10L)
            response.complete(dashboardSnapshot())
            runCurrent()

            assertEquals(PatientDashboardLoadState.PermissionDenied, viewModel.uiState.value.loadState)
            assertNull(viewModel.uiState.value.profile)
            assertEquals(0, invalidations)
        }

    @Test
    fun `authority change during recoverable refresh never retains old PHI as stale`() =
        runTest(dispatcher) {
            val expected = authority()
            val changedAuthorities = listOf(
                "user" to authority(userId = "patient-2"),
                "workspace" to authority(workspaceId = "workspace-2"),
                "epoch" to authority(epoch = 10L),
            )
            val recoverableFailures = listOf(
                "offline" to IOException("offline"),
                "http-5xx" to SmartHealthApiException(
                    statusCode = 503,
                    code = "SERVICE_UNAVAILABLE",
                    message = "unavailable",
                ),
            )

            changedAuthorities.forEach { (authorityChange, changedAuthority) ->
                recoverableFailures.forEach { (failureKind, failure) ->
                    var current = expected
                    val refreshResponse = CompletableDeferred<PatientDashboardSnapshot>()
                    var dashboardLoads = 0
                    val repository = object : PatientDashboardRepository {
                        override suspend fun loadCurrentUser(): AuthUser = backendUser()

                        override suspend fun loadDashboard(
                            expectedUserId: String,
                            expectedWorkspaceId: String,
                        ): PatientDashboardSnapshot {
                            dashboardLoads += 1
                            return if (dashboardLoads == 1) {
                                dashboardSnapshot()
                            } else {
                                refreshResponse.await()
                            }
                        }
                    }
                    var invalidations = 0
                    val viewModel = PatientDashboardViewModel(
                        repository = repository,
                        expectedAuthority = expected,
                        currentAuthority = { current },
                        features = fullFeatures(),
                        invalidateExpectedAuthority = { invalidations += 1 },
                    )
                    runCurrent()
                    assertEquals(
                        "precondition for $authorityChange/$failureKind",
                        PatientDashboardLoadState.Content,
                        viewModel.uiState.value.loadState,
                    )

                    viewModel.onAction(PatientDashboardUiAction.Refresh)
                    runCurrent()
                    current = changedAuthority
                    refreshResponse.completeExceptionally(failure)
                    runCurrent()

                    val state = viewModel.uiState.value
                    val case = "$authorityChange/$failureKind"
                    assertEquals(
                        case,
                        PatientDashboardLoadState.PermissionDenied,
                        state.loadState,
                    )
                    assertEquals(case, PatientDashboardError.AuthorityMismatch, state.error)
                    assertNull(case, state.profile)
                    assertTrue(case, state.recentScans.isEmpty())
                    assertNull(case, state.device)
                    assertFalse(case, state.isStale)
                    assertEquals(case, 0, invalidations)
                }
            }
        }

    @Test
    fun `double refresh is single flight`() = runTest(dispatcher) {
        val expected = authority()
        val refreshResponse = CompletableDeferred<PatientDashboardSnapshot>()
        var dashboardLoads = 0
        val repository = object : PatientDashboardRepository {
            override suspend fun loadCurrentUser(): AuthUser = backendUser()

            override suspend fun loadDashboard(
                expectedUserId: String,
                expectedWorkspaceId: String,
            ): PatientDashboardSnapshot {
                dashboardLoads += 1
                return if (dashboardLoads == 1) {
                    dashboardSnapshot()
                } else {
                    refreshResponse.await()
                }
            }
        }
        val viewModel = PatientDashboardViewModel(
            repository = repository,
            expectedAuthority = expected,
            currentAuthority = { expected },
            features = fullFeatures(),
            invalidateExpectedAuthority = {},
        )
        runCurrent()

        viewModel.onAction(PatientDashboardUiAction.Refresh)
        viewModel.onAction(PatientDashboardUiAction.Refresh)
        runCurrent()
        assertEquals(2, dashboardLoads)

        refreshResponse.complete(dashboardSnapshot())
        runCurrent()
        assertFalse(viewModel.uiState.value.isRefreshing)
    }

    private fun patientDashboardViewModel(
        repository: PatientDashboardRepository,
        expected: PatientDashboardAuthoritySnapshot,
        features: PatientDashboardFeatureAccess = fullFeatures(),
        invalidateExpectedAuthority: () -> Unit = {},
    ) = PatientDashboardViewModel(
        repository = repository,
        expectedAuthority = expected,
        currentAuthority = { expected },
        features = features,
        invalidateExpectedAuthority = invalidateExpectedAuthority,
    )

    private fun fullFeatures() = PatientDashboardFeatureAccess(
        canStartScan = true,
        canViewRecords = true,
        canManageDevice = true,
        canViewAppointments = true,
        canUseAssistant = false,
    )

    private fun authority(
        userId: String = "patient-1",
        workspaceId: String = "workspace-1",
        capabilities: Set<String> = setOf(
            "personal.dashboard.view",
            "personal.scans.manage",
            "personal.devices.manage",
            "personal.appointments.view",
        ),
        epoch: Long = 9L,
    ) = PatientDashboardAuthoritySnapshot.create(
        userId = userId,
        workspaceId = workspaceId,
        role = "patient",
        capabilities = capabilities,
        experience = MobileExperience.Patient,
        authorityEpoch = epoch,
    )

    private fun backendUser(
        id: String = "patient-1",
        name: String = "Nguyễn An",
        accountStatus: String = "active",
        deletedAt: String? = null,
        membershipStatus: String = "active",
        operational: Boolean = true,
        capabilities: List<String> = listOf(
            "personal.dashboard.view",
            "personal.scans.manage",
            "personal.devices.manage",
            "personal.appointments.view",
        ),
    ): AuthUser {
        val membership = WorkspaceMembership(
            id = "membership-1",
            workspaceId = "workspace-1",
            workspaceName = "Chăm sóc tại nhà",
            role = "patient",
            status = membershipStatus,
            operational = operational,
        )
        return AuthUser(
            id = id,
            firebaseUid = "firebase-patient-1",
            accountStatus = accountStatus,
            deletedAt = deletedAt,
            role = "patient",
            name = name,
            currentWorkspaceId = "workspace-1",
            currentMembership = membership,
            currentWorkspace = WorkspaceSummary(
                id = "workspace-1",
                name = "Chăm sóc tại nhà",
                role = "patient",
            ),
            memberships = listOf(membership),
            capabilities = capabilities,
        )
    }

    private fun activePatient(
        id: String = "patient-active",
        name: String = "Nguyễn An",
        relationship: String = "self",
        ownerUserId: String = "patient-1",
        guardianUserId: String = "",
    ) = Patient(
        id = id,
        patientCode = "SHC-001",
        name = name,
        profileType = if (relationship == "self") "self" else "dependent",
        relationship = relationship,
        ownerUserId = ownerUserId,
        guardianUserId = guardianUserId,
        organizationId = "workspace-1",
    )

    private fun dashboardSnapshot(
        userId: String = "patient-1",
        workspaceId: String = "workspace-1",
        activePatientId: String = "patient-active",
        patient: Patient = activePatient(id = activePatientId),
        sections: PatientDashboardSections = PatientDashboardSections(
            scans = PatientDashboardSectionAvailability.Ready,
            device = PatientDashboardSectionAvailability.Empty,
        ),
        scans: List<Scan> = listOf(
            Scan(
                id = "scan-default",
                patientId = activePatientId,
                aiLabel = "captured",
            ),
        ),
        device: SmartDevice? = null,
    ) = PatientDashboardSnapshot(
        protocolVersion = 1,
        generatedAt = "2026-07-29T12:00:00.000Z",
        userId = userId,
        workspaceId = workspaceId,
        activePatientId = activePatientId,
        patient = patient,
        sections = sections,
        recentScans = scans,
        device = device,
    )

    private fun fakeRepository(
        users: List<Result<AuthUser>>,
        dashboards: List<Result<PatientDashboardSnapshot>> = emptyList(),
    ) = FakePatientDashboardRepository(
        users = ArrayDeque(users),
        dashboards = ArrayDeque(dashboards),
    )

    private class FakePatientDashboardRepository(
        private val users: ArrayDeque<Result<AuthUser>>,
        private val dashboards: ArrayDeque<Result<PatientDashboardSnapshot>>,
    ) : PatientDashboardRepository {
        var userLoads = 0
        var dashboardLoads = 0

        override suspend fun loadCurrentUser(): AuthUser {
            userLoads += 1
            return users.removeFirst().getOrThrow()
        }

        override suspend fun loadDashboard(
            expectedUserId: String,
            expectedWorkspaceId: String,
        ): PatientDashboardSnapshot {
            dashboardLoads += 1
            return dashboards.removeFirst().getOrThrow()
        }
    }
}
