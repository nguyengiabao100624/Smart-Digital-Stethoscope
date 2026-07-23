package com.example.smart_health_android.appointments

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

private val appointmentViewCapabilities = setOf(
    "platform.appointments.view",
    "platform.appointments.manage",
    "workspace.appointments.view",
    "workspace.appointments.manage",
    "personal.appointments.view",
    "personal.appointments.manage",
)

private val appointmentManageCapabilities = setOf(
    "platform.appointments.manage",
    "workspace.appointments.manage",
    "personal.appointments.manage",
)

sealed interface AppointmentRoute {
    val route: String
    val testTag: String

    fun canOpen(capabilities: Set<String>): Boolean = capabilities.any(appointmentViewCapabilities::contains)

    fun canManage(capabilities: Set<String>): Boolean = capabilities.any(appointmentManageCapabilities::contains)

    data object List : AppointmentRoute {
        override val route = "appointments"
        override val testTag = "appointment-list"
    }

    data class Detail(val appointmentId: String) : AppointmentRoute {
        override val route = "appointments?appointmentId=${appointmentId.encodeAppointmentRouteValue()}"
        override val testTag = "appointment-detail"
    }

    companion object {
        const val NAVIGATION_PATTERN = "appointments?appointmentId={appointmentId}"
    }
}

private fun String.encodeAppointmentRouteValue(): String = URLEncoder
    .encode(this, StandardCharsets.UTF_8.name())
    .replace("+", "%20")

enum class AppointmentStatus(val wireValue: String) {
    Scheduled("scheduled"),
    Confirmed("confirmed"),
    Completed("completed"),
    Cancelled("cancelled"),
    NoShow("no_show"),
    Unknown("unknown");

    companion object {
        fun fromWire(value: String): AppointmentStatus = entries.firstOrNull {
            it.wireValue == value.trim().lowercase()
        } ?: Unknown
    }
}

enum class AppointmentType(val wireValue: String) {
    RemoteConsultation("remote_consultation"),
    ClinicVisit("clinic_visit"),
    Measurement("measurement"),
    FollowUp("follow_up"),
    Unknown("unknown");

    companion object {
        fun fromWire(value: String): AppointmentType = entries.firstOrNull {
            it.wireValue == value.trim().lowercase()
        } ?: Unknown
    }
}

data class AppointmentPerson(
    val id: String,
    val name: String,
    val patientCode: String = "",
    val email: String = "",
    val specialty: String = "",
)

data class Appointment(
    val id: String,
    val organizationId: String = "",
    val patientId: String,
    val doctorUserId: String = "",
    val type: AppointmentType,
    val status: AppointmentStatus,
    val startsAt: String,
    val endsAt: String,
    val location: String = "",
    val channel: String = "",
    val reason: String = "",
    val notes: String = "",
    val cancellationReason: String = "",
    val patient: AppointmentPerson? = null,
    val doctor: AppointmentPerson? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

data class AppointmentMutation(
    val patientId: String,
    val doctorUserId: String = "",
    val type: AppointmentType,
    val startsAt: String,
    val endsAt: String,
    val location: String = "",
    val channel: String = "",
    val reason: String = "",
    val notes: String = "",
)

data class AppointmentPatch(
    val startsAt: String? = null,
    val endsAt: String? = null,
    val status: AppointmentStatus? = null,
    val cancellationReason: String? = null,
    val location: String? = null,
    val reason: String? = null,
    val notes: String? = null,
)

enum class AppointmentActor {
    Patient,
    Doctor,
    Staff,
}

enum class AppointmentAction {
    Confirm,
    Complete,
    Cancel,
    MarkNoShow,
    Reschedule,
}

object AppointmentWorkflow {
    fun availableActions(
        status: AppointmentStatus,
        actor: AppointmentActor,
        canManage: Boolean,
    ): Set<AppointmentAction> {
        if (!canManage) return emptySet()
        if (status in setOf(
                AppointmentStatus.Completed,
                AppointmentStatus.Cancelled,
                AppointmentStatus.NoShow,
                AppointmentStatus.Unknown,
            )
        ) {
            return emptySet()
        }

        if (actor == AppointmentActor.Patient) {
            return setOf(AppointmentAction.Cancel, AppointmentAction.Reschedule)
        }

        return when (status) {
            AppointmentStatus.Scheduled -> setOf(
                AppointmentAction.Confirm,
                AppointmentAction.Cancel,
                AppointmentAction.MarkNoShow,
                AppointmentAction.Reschedule,
            )
            AppointmentStatus.Confirmed -> setOf(
                AppointmentAction.Complete,
                AppointmentAction.Cancel,
                AppointmentAction.MarkNoShow,
                AppointmentAction.Reschedule,
            )
            AppointmentStatus.Completed,
            AppointmentStatus.Cancelled,
            AppointmentStatus.NoShow,
            AppointmentStatus.Unknown,
            -> emptySet()
        }
    }
}
