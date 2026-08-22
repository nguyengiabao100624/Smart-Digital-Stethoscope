package com.example.smart_health_android.scan

import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.data.SmartHealthApiException
import com.example.smart_health_android.data.StartScanRequest
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
class NewScanViewModelTest {
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
    fun `load selects only an online compatible stethoscope`() = runTest(dispatcher) {
        val repository = FakeNewScanRepository(
            patients = listOf(patient("patient-1", organizationId = "org-a")),
            deviceSnapshots = ArrayDeque(
                listOf(
                    listOf(
                        device("offline", online = false),
                        device("legacy-connected", online = false, connected = true),
                        device("wrong-kind", online = true, type = "thermometer"),
                        device("other-patient", online = true, assignedPatientId = "patient-2"),
                        device("foreign-workspace", online = true, organizationId = "org-b"),
                        device(
                            "eligible",
                            online = true,
                            assignedPatientId = "patient-1",
                            organizationId = "org-a",
                        ),
                    ),
                ),
            ),
        )

        val viewModel = NewScanViewModel(repository)
        runCurrent()

        assertEquals(NewScanLoadState.Content, viewModel.uiState.value.loadState)
        assertEquals("patient-1", viewModel.uiState.value.selectedProfileId)
        assertEquals("eligible", viewModel.uiState.value.selectedDeviceId)
        assertFalse(viewModel.uiState.value.devices.any { it.id == "wrong-kind" })
        assertFalse(viewModel.uiState.value.devices.any { it.id == "foreign-workspace" })

        viewModel.onAction(NewScanUiAction.DeviceSelected("offline"))
        assertEquals("eligible", viewModel.uiState.value.selectedDeviceId)
        viewModel.onAction(NewScanUiAction.DeviceSelected("legacy-connected"))
        assertEquals("eligible", viewModel.uiState.value.selectedDeviceId)
        viewModel.onAction(NewScanUiAction.DeviceSelected("foreign-workspace"))
        assertEquals("eligible", viewModel.uiState.value.selectedDeviceId)
    }

    @Test
    fun `heart body site is sent independently from any calendar date`() = runTest(dispatcher) {
        val repository = readyRepository()
        val viewModel = NewScanViewModel(repository)
        runCurrent()

        viewModel.onAction(NewScanUiAction.BodySiteSelected(ScanBodySite.Mitral))
        NewScanReadinessCheck.entries.forEach { item ->
            viewModel.onAction(NewScanUiAction.ReadinessToggled(item))
        }
        viewModel.onAction(NewScanUiAction.NotesChanged("Ho nhẹ"))

        assertTrue(viewModel.uiState.value.canStart)
        viewModel.onAction(NewScanUiAction.Submit)
        runCurrent()

        val request = requireNotNull(repository.startedRequests.single())
        assertEquals("patient-1", request.patientId)
        assertEquals("device-1", request.deviceId)
        assertEquals("heart", request.mode)
        assertEquals("mitral", request.bodySite)
        assertFalse(request.bodySite.contains('/'))
        assertEquals("Ho nhẹ", request.doctorNotes)
        assertEquals("scan-1", viewModel.uiState.value.startedScanId)
    }

    @Test
    fun `start remains blocked until body site and every readiness item are confirmed`() =
        runTest(dispatcher) {
            val repository = readyRepository()
            val viewModel = NewScanViewModel(repository)
            runCurrent()

            assertFalse(viewModel.uiState.value.canStart)
            viewModel.onAction(NewScanUiAction.BodySiteSelected(ScanBodySite.Aortic))
            NewScanReadinessCheck.entries.dropLast(1).forEach { item ->
                viewModel.onAction(NewScanUiAction.ReadinessToggled(item))
            }

            assertFalse(viewModel.uiState.value.canStart)
            viewModel.onAction(NewScanUiAction.Submit)
            runCurrent()
            assertTrue(repository.startedRequests.isEmpty())

            viewModel.onAction(
                NewScanUiAction.ReadinessToggled(NewScanReadinessCheck.PatientReady),
            )
            assertTrue(viewModel.uiState.value.canStart)
        }

    @Test
    fun `changing scan type clears an incompatible body site`() = runTest(dispatcher) {
        val viewModel = NewScanViewModel(readyRepository())
        runCurrent()

        viewModel.onAction(NewScanUiAction.BodySiteSelected(ScanBodySite.Tricuspid))
        assertEquals(ScanBodySite.Tricuspid, viewModel.uiState.value.selectedBodySite)

        viewModel.onAction(NewScanUiAction.ScanTypeSelected(NewScanType.Lung))

        assertEquals(NewScanType.Lung, viewModel.uiState.value.scanType)
        assertNull(viewModel.uiState.value.selectedBodySite)
        assertTrue(viewModel.uiState.value.availableBodySites.all { it.scanType == NewScanType.Lung })
    }

    @Test
    fun `fresh device authority blocks start when selected device went offline`() =
        runTest(dispatcher) {
            val repository = FakeNewScanRepository(
                patients = listOf(patient("patient-1")),
                deviceSnapshots = ArrayDeque(
                    listOf(
                        listOf(device("device-1", online = true)),
                        listOf(device("device-1", online = false)),
                    ),
                ),
            )
            val viewModel = NewScanViewModel(repository)
            runCurrent()
            makeReady(viewModel, ScanBodySite.Pulmonic)

            viewModel.onAction(NewScanUiAction.Submit)
            runCurrent()

            assertTrue(repository.startedRequests.isEmpty())
            assertEquals(NewScanFailure.DeviceOffline, viewModel.uiState.value.failure)
            assertFalse(viewModel.uiState.value.canStart)
            assertEquals("", viewModel.uiState.value.startedScanId)
        }

    @Test
    fun `mismatched backend receipt never becomes a successful scan effect`() = runTest(dispatcher) {
        val repository = readyRepository(
            startResult = Scan(
                id = "scan-cross-source",
                patientId = "patient-1",
                status = "created",
                mode = "heart",
                bodySite = "mitral",
                deviceId = "device-other",
            ),
        )
        val viewModel = NewScanViewModel(repository)
        runCurrent()
        makeReady(viewModel, ScanBodySite.Mitral)

        viewModel.onAction(NewScanUiAction.Submit)
        runCurrent()

        assertEquals("", viewModel.uiState.value.startedScanId)
        assertEquals(NewScanFailure.InvalidReceipt, viewModel.uiState.value.failure)
    }

    @Test
    fun `start retry reuses exact idempotency key for the same intent`() = runTest(dispatcher) {
        val repository = readyRepository(
            startResults = ArrayDeque(
                listOf(
                    Result.failure(java.io.IOException("timeout")),
                    Result.success(validScan()),
                ),
            ),
        )
        val viewModel = NewScanViewModel(repository) { "stable-start-key" }
        runCurrent()
        makeReady(viewModel, ScanBodySite.Mitral)

        viewModel.onAction(NewScanUiAction.Submit)
        runCurrent()
        assertEquals("", viewModel.uiState.value.startedScanId)

        viewModel.onAction(NewScanUiAction.Submit)
        runCurrent()

        assertEquals(listOf("stable-start-key", "stable-start-key"), repository.startIdempotencyKeys)
        assertTrue(repository.startIdempotencyKeys.all(String::isNotBlank))
        assertEquals("scan-1", viewModel.uiState.value.startedScanId)
    }

    @Test
    fun `dependent profile requires relationship and selects backend-created identity`() =
        runTest(dispatcher) {
            val repository = readyRepository()
            val viewModel = NewScanViewModel(repository)
            runCurrent()

            viewModel.onAction(NewScanUiAction.ProfileNameChanged("Bé An"))
            viewModel.onAction(NewScanUiAction.CreateProfile)
            runCurrent()

            assertTrue(repository.createdProfiles.isEmpty())
            assertTrue(viewModel.uiState.value.relationshipInvalid)

            viewModel.onAction(NewScanUiAction.RelationshipChanged("Con"))
            viewModel.onAction(NewScanUiAction.CreateProfile)
            runCurrent()

            assertEquals(listOf("Bé An" to "Con"), repository.createdProfiles)
            assertEquals("patient-created", viewModel.uiState.value.selectedProfileId)
            assertTrue(viewModel.uiState.value.profiles.any { it.id == "patient-created" })
        }

    @Test
    fun `forbidden initial load exposes permission state without patient or device data`() =
        runTest(dispatcher) {
            val repository = FakeNewScanRepository(
                patients = emptyList(),
                deviceSnapshots = ArrayDeque(listOf(listOf(device("device-1", online = true)))),
                profilesFailure = SmartHealthApiException(
                    statusCode = 403,
                    code = "WORKSPACE_MEMBERSHIP_REQUIRED",
                    requestId = "request-scan-403",
                    message = "forbidden",
                ),
            )

            val viewModel = NewScanViewModel(repository)
            runCurrent()

            assertEquals(NewScanLoadState.Permission, viewModel.uiState.value.loadState)
            assertTrue(viewModel.uiState.value.profiles.isEmpty())
            assertTrue(viewModel.uiState.value.devices.isEmpty())
            assertEquals("request-scan-403", viewModel.uiState.value.requestId)
        }

    @Test
    fun `locked account start clears previously rendered patient and device data`() =
        runTest(dispatcher) {
            val repository = readyRepository(
                startFailure = SmartHealthApiException(
                    statusCode = 423,
                    code = "ACCOUNT_LOCKED",
                    requestId = "request-start-403",
                    message = "forbidden",
                ),
            )
            val viewModel = NewScanViewModel(repository)
            runCurrent()
            makeReady(viewModel, ScanBodySite.Mitral)
            viewModel.onAction(NewScanUiAction.NotesChanged("Dữ liệu nhạy cảm"))

            viewModel.onAction(NewScanUiAction.Submit)
            runCurrent()

            assertEquals(NewScanLoadState.Permission, viewModel.uiState.value.loadState)
            assertTrue(viewModel.uiState.value.profiles.isEmpty())
            assertTrue(viewModel.uiState.value.devices.isEmpty())
            assertEquals("", viewModel.uiState.value.notes)
            assertEquals("request-start-403", viewModel.uiState.value.requestId)
        }

    private fun makeReady(viewModel: NewScanViewModel, bodySite: ScanBodySite) {
        viewModel.onAction(NewScanUiAction.BodySiteSelected(bodySite))
        NewScanReadinessCheck.entries.forEach { item ->
            viewModel.onAction(NewScanUiAction.ReadinessToggled(item))
        }
    }

    private fun readyRepository(
        startResult: Scan = validScan(),
        startFailure: Throwable? = null,
        startResults: ArrayDeque<Result<Scan>>? = null,
    ): FakeNewScanRepository =
        FakeNewScanRepository(
            patients = listOf(patient("patient-1")),
            deviceSnapshots = ArrayDeque(
                listOf(
                    listOf(device("device-1", online = true)),
                    listOf(device("device-1", online = true)),
                ),
            ),
            startResult = startResult,
            startFailure = startFailure,
            startResults = startResults,
        )

    private fun patient(id: String, organizationId: String = "") = Patient(
        id = id,
        patientCode = "BN-001",
        name = "Nguyễn An",
        organizationId = organizationId,
    )

    private fun device(
        id: String,
        online: Boolean,
        type: String = "stethoscope",
        assignedPatientId: String = "",
        connected: Boolean = false,
        organizationId: String = "",
    ) = SmartDevice(
        id = id,
        name = id,
        type = type,
        online = online,
        connected = connected,
        organizationId = organizationId,
        assignedPatientId = assignedPatientId,
    )

    private fun validScan() = Scan(
        id = "scan-1",
        patientId = "patient-1",
        status = "created",
        mode = "heart",
        bodySite = "mitral",
        deviceId = "device-1",
    )
}

private class FakeNewScanRepository(
    private val patients: List<Patient>,
    private val deviceSnapshots: ArrayDeque<List<SmartDevice>>,
    private val startResult: Scan = Scan(
        id = "scan-1",
        patientId = "patient-1",
        status = "created",
        mode = "heart",
        bodySite = "mitral",
        deviceId = "device-1",
    ),
    private val profilesFailure: Throwable? = null,
    private val startFailure: Throwable? = null,
    private val startResults: ArrayDeque<Result<Scan>>? = null,
) : NewScanRepository {
    val startedRequests = mutableListOf<StartScanRequest>()
    val startIdempotencyKeys = mutableListOf<String>()
    val createdProfiles = mutableListOf<Pair<String, String>>()

    override suspend fun loadProfiles(): List<Patient> =
        profilesFailure?.let { throw it } ?: patients

    override suspend fun loadDevices(): List<SmartDevice> =
        if (deviceSnapshots.size > 1) deviceSnapshots.removeFirst() else deviceSnapshots.first()

    override suspend fun createDependentProfile(name: String, relationship: String): Patient {
        createdProfiles += name to relationship
        return Patient(
            id = "patient-created",
            patientCode = "",
            name = name,
            relationship = relationship,
            profileType = "dependent",
        )
    }

    override suspend fun startScan(request: StartScanRequest, idempotencyKey: String): Scan {
        startedRequests += request
        startIdempotencyKeys += idempotencyKey
        startResults?.let { return it.removeFirst().getOrThrow() }
        startFailure?.let { throw it }
        return startResult
    }
}
