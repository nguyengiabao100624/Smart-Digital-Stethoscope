package com.example.smart_health_android.consent

import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.PatientShare
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthRepository

enum class ConsentRecipientKind(val wireValue: String) {
    Doctor("doctor"),
    Workspace("workspace"),
}

enum class ConsentScope(val wireValue: String) {
    PatientProfile("patient_profile"),
    SelectedScans("selected_scans"),
}

data class CreateConsentGrantCommand(
    val patientId: String,
    val recipientKind: ConsentRecipientKind,
    val recipientId: String,
    val scope: ConsentScope,
    val scanIds: List<String> = emptyList(),
    val expiresAt: String = "",
)

interface ConsentRepository {
    suspend fun listPatients(): List<Patient>
    suspend fun listTargets(): ShareTargets
    suspend fun listShares(patientId: String): List<PatientShare>
    suspend fun listScans(patientId: String): List<Scan>
    suspend fun createGrant(
        command: CreateConsentGrantCommand,
        idempotencyKey: String,
    ): PatientShare

    suspend fun revokeGrant(
        patientId: String,
        shareId: String,
        idempotencyKey: String,
    ): PatientShare
}

class ApiConsentRepository(
    private val api: SmartHealthApi = SmartHealthRepository.api,
) : ConsentRepository {
    override suspend fun listPatients(): List<Patient> = api.listPatients()

    override suspend fun listTargets(): ShareTargets = api.listShareTargets()

    override suspend fun listShares(patientId: String): List<PatientShare> =
        api.listPatientShares(patientId)

    override suspend fun listScans(patientId: String): List<Scan> =
        api.listScans(patientId = patientId, limit = 100)

    override suspend fun createGrant(
        command: CreateConsentGrantCommand,
        idempotencyKey: String,
    ): PatientShare {
        return api.sharePatientRecord(
            patientId = command.patientId,
            targetDoctorUserId = command.recipientId.takeIf {
                command.recipientKind == ConsentRecipientKind.Doctor
            }.orEmpty(),
            targetWorkspaceId = command.recipientId.takeIf {
                command.recipientKind == ConsentRecipientKind.Workspace
            }.orEmpty(),
            scope = command.scope.wireValue,
            scanIds = command.scanIds,
            expiresAt = command.expiresAt,
            idempotencyKey = idempotencyKey,
        )
    }

    override suspend fun revokeGrant(
        patientId: String,
        shareId: String,
        idempotencyKey: String,
    ): PatientShare = api.revokePatientShare(
        patientId = patientId,
        shareId = shareId,
        idempotencyKey = idempotencyKey,
    )
}
