package com.example.smart_health_android.appointments

import com.example.smart_health_android.R
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartHealthApiException
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
import java.net.UnknownHostException
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class AppointmentViewModelTest {
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
    fun loadPublishesOnlyBackendAppointmentsAndBackendCapabilities() = runTest(dispatcher) {
        val backendAppointment = appointment(id = "server-appointment-1")
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf(
                    "personal.appointments.view",
                    "personal.appointments.manage",
                ),
            ),
            appointments = listOf(backendAppointment),
        )
        val viewModel = AppointmentViewModel(repository)

        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        assertEquals(AppointmentLoadState.Content, viewModel.uiState.value.loadState)
        assertEquals(listOf(backendAppointment), viewModel.uiState.value.appointments)
        assertEquals(AppointmentActor.Patient, viewModel.uiState.value.actor)
        assertTrue(viewModel.uiState.value.canManage)
        assertFalse(viewModel.uiState.value.isMutating)
    }

    @Test
    fun loadMapsBackendPermissionAndNetworkFailuresToDistinctRecoveryStates() = runTest(dispatcher) {
        val session = AppointmentSession(
            actor = AppointmentActor.Doctor,
            userId = "doctor-1",
            capabilities = setOf("workspace.appointments.view"),
        )
        val permissionViewModel = AppointmentViewModel(
            FakeAppointmentRepository(
                session = session,
                appointments = emptyList(),
                listFailure = SmartHealthApiException(
                    statusCode = 403,
                    code = "FORBIDDEN",
                    requestId = "req-permission",
                    message = "Không có quyền xem lịch hẹn",
                ),
            )
        )
        permissionViewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        assertEquals(AppointmentLoadState.Permission, permissionViewModel.uiState.value.loadState)
        assertEquals("req-permission", permissionViewModel.uiState.value.requestId)

        val offlineViewModel = AppointmentViewModel(
            FakeAppointmentRepository(
                session = session,
                appointments = emptyList(),
                listFailure = UnknownHostException("api.shcare.invalid"),
            )
        )
        offlineViewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        assertEquals(AppointmentLoadState.Offline, offlineViewModel.uiState.value.loadState)
    }

    @Test
    fun createKeepsTheIdempotencyKeyAndPublishesOnlyTheBackendResponse() = runTest(dispatcher) {
        val serverAppointment = appointment(id = "server-created-7").copy(
            reason = "Tái khám sau điều trị",
            updatedAt = "2026-07-14T08:00:00.000Z",
        )
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf(
                    "personal.appointments.view",
                    "personal.appointments.manage",
                ),
            ),
            appointments = emptyList(),
            patients = listOf(
                Patient(
                    id = "patient-1",
                    patientCode = "BN-01",
                    name = "Nguyễn An",
                )
            ),
            createResult = serverAppointment,
        )
        val viewModel = AppointmentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "create-key-7" },
            nowProvider = { Instant.parse("2026-07-14T00:00:00.000Z") },
        )
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(AppointmentUiAction.StartCreate)
        viewModel.onAction(AppointmentUiAction.PatientChanged("patient-1"))
        viewModel.onAction(AppointmentUiAction.TypeChanged(AppointmentType.ClinicVisit))
        viewModel.onAction(
            AppointmentUiAction.ScheduleChanged(
                startsAt = "2026-07-20T02:00:00.000Z",
                endsAt = "2026-07-20T02:30:00.000Z",
            )
        )
        viewModel.onAction(AppointmentUiAction.ReasonChanged("Tái khám sau điều trị"))
        viewModel.onAction(AppointmentUiAction.SubmitEditor)
        viewModel.onAction(AppointmentUiAction.SubmitEditor)
        advanceUntilIdle()

        assertEquals(1, repository.createCallCount)
        assertEquals("create-key-7", repository.lastCreateIdempotencyKey)
        assertEquals("patient-1", repository.lastCreateMutation?.patientId)
        assertEquals(listOf(serverAppointment), viewModel.uiState.value.appointments)
        assertEquals("server-created-7", viewModel.uiState.value.selectedAppointmentId)
        assertEquals(null, viewModel.uiState.value.editor)
    }

    @Test
    fun createRejectsAPastStartTimeBeforeCallingTheBackend() = runTest(dispatcher) {
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf(
                    "personal.appointments.view",
                    "personal.appointments.manage",
                ),
            ),
            appointments = emptyList(),
            patients = listOf(Patient(id = "patient-1", patientCode = "BN-01", name = "Nguyễn An")),
        )
        val viewModel = AppointmentViewModel(
            repository = repository,
            nowProvider = { Instant.parse("2026-07-14T12:00:00.000Z") },
        )
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(AppointmentUiAction.StartCreate)
        viewModel.onAction(AppointmentUiAction.PatientChanged("patient-1"))
        viewModel.onAction(
            AppointmentUiAction.ScheduleChanged(
                startsAt = "2026-07-14T11:00:00.000Z",
                endsAt = "2026-07-14T11:30:00.000Z",
            )
        )
        viewModel.onAction(AppointmentUiAction.ReasonChanged("Tái khám"))
        viewModel.onAction(AppointmentUiAction.SubmitEditor)
        advanceUntilIdle()

        assertEquals(0, repository.createCallCount)
        assertEquals(
            R.string.appointment_error_start_future,
            viewModel.uiState.value.editor?.fieldErrors?.get("startsAt"),
        )
    }

    @Test
    fun editorCannotBeDiscardedWhileTheBackendMutationIsInFlight() = runTest(dispatcher) {
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf(
                    "personal.appointments.view",
                    "personal.appointments.manage",
                ),
            ),
            appointments = emptyList(),
            patients = listOf(Patient(id = "patient-1", patientCode = "BN-01", name = "Nguyễn An")),
            createResult = appointment("server-created-in-flight"),
        )
        val viewModel = AppointmentViewModel(
            repository = repository,
            nowProvider = { Instant.parse("2026-07-14T00:00:00.000Z") },
        )
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()
        viewModel.onAction(AppointmentUiAction.StartCreate)
        viewModel.onAction(
            AppointmentUiAction.ScheduleChanged(
                startsAt = "2026-07-20T02:00:00.000Z",
                endsAt = "2026-07-20T02:30:00.000Z",
            )
        )
        viewModel.onAction(AppointmentUiAction.ReasonChanged("Tái khám"))

        viewModel.onAction(AppointmentUiAction.SubmitEditor)
        viewModel.onAction(AppointmentUiAction.DismissEditor)
        viewModel.onAction(AppointmentUiAction.DiscardEditor)

        assertTrue(viewModel.uiState.value.isMutating)
        assertTrue(viewModel.uiState.value.editor != null)
        assertFalse(viewModel.uiState.value.confirmEditorDismiss)
    }

    @Test
    fun cancellationRequiresAReasonAndUsesTheBackendReturnedState() = runTest(dispatcher) {
        val scheduled = appointment("appt-cancel")
        val serverCancelled = scheduled.copy(
            status = AppointmentStatus.Cancelled,
            cancellationReason = "Không thể đến khám",
            updatedAt = "2026-07-14T09:00:00.000Z",
        )
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf(
                    "personal.appointments.view",
                    "personal.appointments.manage",
                ),
            ),
            appointments = listOf(scheduled),
            updateResult = serverCancelled,
        )
        val viewModel = AppointmentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "cancel-key-1" },
        )
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(AppointmentUiAction.RequestCancellation("appt-cancel"))
        viewModel.onAction(AppointmentUiAction.ConfirmCancellation)

        assertEquals(
            R.string.appointment_error_cancellation_reason_required,
            viewModel.uiState.value.cancellationReasonError,
        )
        assertEquals(AppointmentStatus.Scheduled, viewModel.uiState.value.appointments.single().status)

        viewModel.onAction(AppointmentUiAction.CancellationReasonChanged("Không thể đến khám"))
        viewModel.onAction(AppointmentUiAction.ConfirmCancellation)
        advanceUntilIdle()

        assertEquals("cancel-key-1", repository.lastUpdateIdempotencyKey)
        assertEquals(AppointmentStatus.Cancelled, repository.lastUpdatePatch?.status)
        assertEquals("Không thể đến khám", repository.lastUpdatePatch?.cancellationReason)
        assertEquals(serverCancelled, viewModel.uiState.value.appointments.single())
        assertEquals(null, viewModel.uiState.value.pendingCancellationId)
    }

    @Test
    fun dismissingAFailedCancellationClearsItsScopedError() = runTest(dispatcher) {
        val scheduled = appointment("appt-cancel-failure")
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf(
                    "personal.appointments.view",
                    "personal.appointments.manage",
                ),
            ),
            appointments = listOf(scheduled),
            updateFailure = SmartHealthApiException(
                statusCode = 409,
                code = "APPOINTMENT_CONFLICT",
                requestId = "req-conflict",
                message = "Lịch hẹn đã được cập nhật ở thiết bị khác",
            ),
        )
        val viewModel = AppointmentViewModel(repository)
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(AppointmentUiAction.RequestCancellation(scheduled.id))
        viewModel.onAction(AppointmentUiAction.CancellationReasonChanged("Không thể đến khám"))
        viewModel.onAction(AppointmentUiAction.ConfirmCancellation)
        advanceUntilIdle()
        assertEquals("req-conflict", viewModel.uiState.value.requestId)

        viewModel.onAction(AppointmentUiAction.DismissCancellation)

        assertEquals("", viewModel.uiState.value.errorMessage)
        assertEquals("", viewModel.uiState.value.requestId)
    }

    @Test
    fun reschedulePatchesTheExistingAppointmentAndWaitsForBackendConfirmation() = runTest(dispatcher) {
        val scheduled = appointment("appt-reschedule")
        val serverRescheduled = scheduled.copy(
            startsAt = "2026-07-21T03:00:00.000Z",
            endsAt = "2026-07-21T03:45:00.000Z",
            updatedAt = "2026-07-14T10:00:00.000Z",
        )
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf(
                    "personal.appointments.view",
                    "personal.appointments.manage",
                ),
            ),
            appointments = listOf(scheduled),
            updateResult = serverRescheduled,
        )
        val viewModel = AppointmentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "reschedule-key-1" },
            nowProvider = { Instant.parse("2026-07-14T00:00:00.000Z") },
        )
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(AppointmentUiAction.StartReschedule("appt-reschedule"))
        viewModel.onAction(
            AppointmentUiAction.ScheduleChanged(
                startsAt = serverRescheduled.startsAt,
                endsAt = serverRescheduled.endsAt,
            )
        )
        viewModel.onAction(AppointmentUiAction.SubmitEditor)
        advanceUntilIdle()

        assertEquals("reschedule-key-1", repository.lastUpdateIdempotencyKey)
        assertEquals(serverRescheduled.startsAt, repository.lastUpdatePatch?.startsAt)
        assertEquals(serverRescheduled.endsAt, repository.lastUpdatePatch?.endsAt)
        assertEquals(null, repository.lastUpdatePatch?.status)
        assertEquals(serverRescheduled, viewModel.uiState.value.appointments.single())
    }

    @Test
    fun doctorStatusActionUsesTheLifecyclePatchAndBackendResponse() = runTest(dispatcher) {
        val scheduled = appointment("appt-confirm")
        val serverConfirmed = scheduled.copy(
            status = AppointmentStatus.Confirmed,
            updatedAt = "2026-07-14T11:00:00.000Z",
        )
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Doctor,
                userId = "doctor-1",
                capabilities = setOf(
                    "workspace.appointments.view",
                    "workspace.appointments.manage",
                ),
            ),
            appointments = listOf(scheduled),
            updateResult = serverConfirmed,
        )
        val viewModel = AppointmentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "status-key-1" },
        )
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(
            AppointmentUiAction.ApplyWorkflowAction(
                appointmentId = "appt-confirm",
                action = AppointmentAction.Confirm,
            )
        )
        advanceUntilIdle()

        assertEquals("status-key-1", repository.lastUpdateIdempotencyKey)
        assertEquals(AppointmentStatus.Confirmed, repository.lastUpdatePatch?.status)
        assertEquals(serverConfirmed, viewModel.uiState.value.appointments.single())
    }

    @Test
    fun terminalDoctorStatusRequiresExplicitConfirmationBeforeCallingTheBackend() = runTest(dispatcher) {
        val scheduled = appointment("appt-no-show")
        val serverNoShow = scheduled.copy(status = AppointmentStatus.NoShow)
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Doctor,
                userId = "doctor-1",
                capabilities = setOf(
                    "workspace.appointments.view",
                    "workspace.appointments.manage",
                ),
            ),
            appointments = listOf(scheduled),
            updateResult = serverNoShow,
        )
        val viewModel = AppointmentViewModel(
            repository = repository,
            idempotencyKeyFactory = { "no-show-key-1" },
        )
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(
            AppointmentUiAction.ApplyWorkflowAction(
                appointmentId = scheduled.id,
                action = AppointmentAction.MarkNoShow,
            )
        )
        advanceUntilIdle()

        assertEquals(null, repository.lastUpdatePatch)
        assertEquals(
            AppointmentAction.MarkNoShow,
            viewModel.uiState.value.pendingStatusConfirmation?.action,
        )

        viewModel.onAction(AppointmentUiAction.ConfirmStatusChange)
        advanceUntilIdle()

        assertEquals(AppointmentStatus.NoShow, repository.lastUpdatePatch?.status)
        assertEquals("no-show-key-1", repository.lastUpdateIdempotencyKey)
        assertEquals(serverNoShow, viewModel.uiState.value.appointments.single())
    }

    @Test
    fun missingViewCapabilityShowsPermissionStateWithoutSendingAnUnauthorizedListRequest() =
        runTest(dispatcher) {
            val repository = FakeAppointmentRepository(
                session = AppointmentSession(
                    actor = AppointmentActor.Staff,
                    userId = "viewer-1",
                    capabilities = setOf("workspace.patients.view"),
                ),
                appointments = emptyList(),
            )
            val viewModel = AppointmentViewModel(repository)

            viewModel.onAction(AppointmentUiAction.Load)
            advanceUntilIdle()

            assertEquals(AppointmentLoadState.Permission, viewModel.uiState.value.loadState)
            assertEquals(0, repository.listCallCount)
        }

    @Test
    fun deepLinkedDetailFailureHasItsOwnOfflineRetryState() = runTest(dispatcher) {
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf("personal.appointments.view"),
            ),
            appointments = emptyList(),
            detailFailure = UnknownHostException("api.shcare.invalid"),
        )
        val viewModel = AppointmentViewModel(repository)
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(AppointmentUiAction.OpenAppointment("appointment-from-notification"))

        assertEquals(AppointmentLoadState.Loading, viewModel.uiState.value.detailLoadState)
        advanceUntilIdle()
        assertEquals(AppointmentLoadState.Empty, viewModel.uiState.value.loadState)
        assertEquals(AppointmentLoadState.Offline, viewModel.uiState.value.detailLoadState)
        assertEquals("appointment-from-notification", viewModel.uiState.value.detailAppointmentId)
        assertEquals(1, repository.detailCallCount)
    }

    @Test
    fun closingADeepLinkedDetailIgnoresItsLateBackendResponse() = runTest(dispatcher) {
        val backendDetail = appointment("appointment-from-notification")
        val repository = FakeAppointmentRepository(
            session = AppointmentSession(
                actor = AppointmentActor.Patient,
                userId = "patient-owner-1",
                capabilities = setOf("personal.appointments.view"),
            ),
            appointments = emptyList(),
            detailResult = backendDetail,
        )
        val viewModel = AppointmentViewModel(repository)
        viewModel.onAction(AppointmentUiAction.Load)
        advanceUntilIdle()

        viewModel.onAction(AppointmentUiAction.OpenAppointment(backendDetail.id))
        viewModel.onAction(AppointmentUiAction.CloseAppointment)
        advanceUntilIdle()

        assertEquals(null, viewModel.uiState.value.selectedAppointmentId)
        assertEquals(null, viewModel.uiState.value.detailAppointmentId)
        assertTrue(viewModel.uiState.value.appointments.isEmpty())
    }

    private fun appointment(id: String) = Appointment(
        id = id,
        patientId = "patient-1",
        doctorUserId = "doctor-1",
        type = AppointmentType.ClinicVisit,
        status = AppointmentStatus.Scheduled,
        startsAt = "2026-07-20T02:00:00.000Z",
        endsAt = "2026-07-20T02:30:00.000Z",
    )
}

private class FakeAppointmentRepository(
    private val session: AppointmentSession,
    private val appointments: List<Appointment>,
    private val listFailure: Throwable? = null,
    private val patients: List<Patient> = emptyList(),
    private val createResult: Appointment? = null,
    private val updateResult: Appointment? = null,
    private val updateFailure: Throwable? = null,
    private val detailResult: Appointment? = null,
    private val detailFailure: Throwable? = null,
) : AppointmentRepository {
    var listCallCount: Int = 0
        private set
    var createCallCount: Int = 0
        private set
    var detailCallCount: Int = 0
        private set
    var lastCreateMutation: AppointmentMutation? = null
        private set
    var lastCreateIdempotencyKey: String? = null
        private set
    var lastUpdatePatch: AppointmentPatch? = null
        private set
    var lastUpdateIdempotencyKey: String? = null
        private set

    override suspend fun getSession(): AppointmentSession = session

    override suspend fun listAppointments(): List<Appointment> {
        listCallCount += 1
        return listFailure?.let { throw it } ?: appointments
    }

    override suspend fun getAppointment(appointmentId: String): Appointment {
        detailCallCount += 1
        detailFailure?.let { throw it }
        return detailResult ?: appointments.first { it.id == appointmentId }
    }

    override suspend fun listPatients(): List<Patient> = patients

    override suspend fun createAppointment(
        mutation: AppointmentMutation,
        idempotencyKey: String,
    ): Appointment {
        createCallCount += 1
        lastCreateMutation = mutation
        lastCreateIdempotencyKey = idempotencyKey
        return createResult ?: error("No create result configured")
    }

    override suspend fun updateAppointment(
        appointmentId: String,
        patch: AppointmentPatch,
        idempotencyKey: String,
    ): Appointment {
        lastUpdatePatch = patch
        lastUpdateIdempotencyKey = idempotencyKey
        updateFailure?.let { throw it }
        return updateResult ?: error("No update result configured")
    }
}
