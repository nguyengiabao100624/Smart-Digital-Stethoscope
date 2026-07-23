package com.example.smart_health_android.appointments

import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartHealthApi
import com.example.smart_health_android.data.SmartHealthRepository

data class AppointmentSession(
    val actor: AppointmentActor,
    val userId: String,
    val capabilities: Set<String>,
)

interface AppointmentRepository {
    suspend fun getSession(): AppointmentSession
    suspend fun listAppointments(): List<Appointment>
    suspend fun getAppointment(appointmentId: String): Appointment
    suspend fun listPatients(): List<Patient>
    suspend fun createAppointment(mutation: AppointmentMutation, idempotencyKey: String): Appointment
    suspend fun updateAppointment(
        appointmentId: String,
        patch: AppointmentPatch,
        idempotencyKey: String,
    ): Appointment
}

class ApiAppointmentRepository(
    private val api: SmartHealthApi = SmartHealthRepository.api,
) : AppointmentRepository {
    override suspend fun getSession(): AppointmentSession {
        val user = api.getMe()
        return AppointmentSession(
            actor = when (user.role.lowercase()) {
                "patient" -> AppointmentActor.Patient
                "doctor" -> AppointmentActor.Doctor
                else -> AppointmentActor.Staff
            },
            userId = user.id,
            capabilities = user.capabilities.toSet(),
        )
    }

    override suspend fun listAppointments(): List<Appointment> = api.listAppointments()

    override suspend fun getAppointment(appointmentId: String): Appointment =
        api.getAppointment(appointmentId)

    override suspend fun listPatients(): List<Patient> = api.listPatients()

    override suspend fun createAppointment(
        mutation: AppointmentMutation,
        idempotencyKey: String,
    ): Appointment = api.createAppointment(mutation, idempotencyKey)

    override suspend fun updateAppointment(
        appointmentId: String,
        patch: AppointmentPatch,
        idempotencyKey: String,
    ): Appointment = api.updateAppointment(appointmentId, patch, idempotencyKey)
}
