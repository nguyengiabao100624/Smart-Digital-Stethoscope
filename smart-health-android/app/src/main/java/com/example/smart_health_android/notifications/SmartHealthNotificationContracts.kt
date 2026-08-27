package com.example.smart_health_android.notifications

import com.example.smart_health_android.navigation.MobileRouteAccessContext
import com.example.smart_health_android.navigation.MobileRouteAccessDecision
import com.example.smart_health_android.navigation.MobileRouteSessionRequirement
import com.example.smart_health_android.navigation.ShcareMobileRouteContract
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

sealed interface SmartHealthNotificationDestination {
    val route: String
    val wireName: String
    val identifier: String?
        get() = null

    data object Inbox : SmartHealthNotificationDestination {
        override val route = "notifications"
        override val wireName = "inbox"
    }

    data object Records : SmartHealthNotificationDestination {
        override val route = "records"
        override val wireName = "records"
    }

    data object Appointments : SmartHealthNotificationDestination {
        override val route = "appointments"
        override val wireName = "appointments"
    }

    data class AppointmentDetail(
        override val identifier: String,
    ) : SmartHealthNotificationDestination {
        override val route = "appointments?appointmentId=${identifier.encodeRouteValue()}"
        override val wireName = "appointment_detail"
    }

    data class RecordDetail(
        override val identifier: String,
    ) : SmartHealthNotificationDestination {
        override val route = "record-detail/${identifier.encodeRouteValue()}"
        override val wireName = "record_detail"
    }

    data class Monitoring(
        override val identifier: String? = null,
    ) : SmartHealthNotificationDestination {
        override val route = identifier
            ?.takeIf(String::isNotBlank)
            ?.let { "monitoring?scanId=${it.encodeRouteValue()}" }
            ?: "monitoring"
        override val wireName = "monitoring"
    }

    data object DeviceManagement : SmartHealthNotificationDestination {
        override val route = "device-management"
        override val wireName = "device_management"
    }

    data object DoctorApproval : SmartHealthNotificationDestination {
        override val route = "doctor-approval-pending"
        override val wireName = "doctor_approval"
    }

    data object AiAssistant : SmartHealthNotificationDestination {
        override val route = "ai-assistant"
        override val wireName = "ai_assistant"
    }

    companion object {
        fun fromPayload(payload: Map<String, String>): SmartHealthNotificationDestination {
            val identifier = payload.firstValue("recordId", "scanId", "notificationTargetId")
            val scanId = payload.firstValue("scanId", "recordId", "notificationTargetId")
            val appointmentId = payload.firstValue("appointmentId", "notificationTargetId")
            val explicitDestination = payload
                .firstValue("destination", "screen", "route")
                ?.normalizedToken()

            explicitDestination?.let { destination ->
                when (destination) {
                    "notifications", "notification", "inbox" -> return Inbox
                    "records", "medical_records" -> return Records
                    "appointments", "appointment_list" -> return Appointments
                    "appointment_detail", "appointment" -> {
                        return appointmentId?.let(::AppointmentDetail) ?: Appointments
                    }
                    "record_detail", "scan_detail", "result_detail" -> {
                        return identifier?.let(::RecordDetail) ?: Inbox
                    }
                    "monitoring", "live_monitoring", "active_scan" -> return Monitoring(scanId)
                    "device_management", "device_detail", "device_pairing", "devices",
                    "bluetooth_settings" -> return DeviceManagement
                    "doctor_approval", "doctor_approval_pending", "role_request" -> return DoctorApproval
                    "ai_assistant", "assistant" -> return AiAssistant
                }
            }

            return when (payload["type"].orEmpty().normalizedToken()) {
                "abnormal_result", "abnormal_results", "critical_result", "scan_result", "scan_completed" -> {
                    identifier?.let(::RecordDetail) ?: Records
                }
                "scan_started", "live_monitoring", "active_scan" -> Monitoring(scanId)
                "appointment_reminder", "appointment_created", "appointment_updated",
                "appointment_cancelled", "appointment_status" -> {
                    appointmentId?.let(::AppointmentDetail) ?: Appointments
                }
                "device_offline", "device_disconnected", "device_connected", "device_status" -> DeviceManagement
                "doctor_info_requested", "doctor_request", "role_info_requested" -> DoctorApproval
                else -> Inbox
            }
        }

        fun fromWire(
            wireName: String?,
            identifier: String?,
        ): SmartHealthNotificationDestination {
            return when (wireName.orEmpty().normalizedToken()) {
                "inbox", "notifications" -> Inbox
                "records" -> Records
                "appointments" -> Appointments
                "appointment_detail" -> identifier
                    ?.takeIf(String::isNotBlank)
                    ?.let(::AppointmentDetail)
                    ?: Appointments
                "record_detail" -> identifier?.takeIf(String::isNotBlank)?.let(::RecordDetail) ?: Inbox
                "monitoring" -> Monitoring(identifier?.takeIf(String::isNotBlank))
                "device_management", "device_detail", "device_pairing" -> DeviceManagement
                "doctor_approval" -> DoctorApproval
                "ai_assistant" -> AiAssistant
                else -> Inbox
            }
        }
    }
}

enum class SmartHealthNotificationChannel(val channelId: String) {
    ClinicalAlerts("smart_health_alerts"),
    GeneralUpdates("shcare_updates");

    companion object {
        fun fromPayload(payload: Map<String, String>): SmartHealthNotificationChannel {
            val severity = payload["severity"].orEmpty().normalizedToken()
            val type = payload["type"].orEmpty().normalizedToken()
            val isClinicalAlert = severity in setOf("critical", "high", "urgent") ||
                type in setOf(
                    "abnormal_result",
                    "abnormal_results",
                    "critical_result",
                    "device_offline",
                    "device_disconnected",
                )
            return if (isClinicalAlert) ClinicalAlerts else GeneralUpdates
        }
    }
}

enum class NotificationPreferenceField(val backendKey: String) {
    Enabled("enabled"),
    DoctorRequests("doctorRequests"),
    AbnormalResults("abnormalResults"),
    DeviceOffline("deviceOffline"),
    Appointments("appointments"),
    Messages("messages"),
    AiUpdates("aiUpdates"),
    NewLogin("newLogin"),
}

data class NotificationPreferenceMutation(
    val field: NotificationPreferenceField,
    val value: Boolean,
) {
    fun requestFields(): Map<String, Any> {
        return linkedMapOf(
            "key" to field.backendKey,
            "enabled" to value,
        )
    }
}

object NotificationNavigationPolicy {
    fun canNavigate(
        currentRoute: String?,
        destinationRoute: String,
        hasAuthenticatedSession: Boolean,
        hasMatchingNotificationOwner: Boolean,
        authority: MobileRouteAccessContext?,
        expectedAuthorityEpoch: Long = authority?.authorityEpoch ?: -1L,
    ): Boolean {
        if (
            !hasAuthenticatedSession ||
            !hasMatchingNotificationOwner ||
            authority == null ||
            currentRoute.isNullOrBlank()
        ) {
            return false
        }
        val currentContract = ShcareMobileRouteContract.resolve(currentRoute) ?: return false
        val destinationContract =
            ShcareMobileRouteContract.resolve(destinationRoute) ?: return false
        if (
            currentContract.sessionRequirement != MobileRouteSessionRequirement.Authenticated ||
            destinationContract.sessionRequirement != MobileRouteSessionRequirement.Authenticated
        ) {
            return false
        }

        return ShcareMobileRouteContract.evaluate(
            contract = destinationContract,
            context = authority,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ) is MobileRouteAccessDecision.Allowed
    }
}

private fun Map<String, String>.firstValue(vararg keys: String): String? {
    return keys.firstNotNullOfOrNull { key -> this[key]?.trim()?.takeIf(String::isNotBlank) }
}

private fun String.normalizedToken(): String {
    return trim()
        .lowercase()
        .replace('-', '_')
        .replace(' ', '_')
}

private fun String.encodeRouteValue(): String {
    return URLEncoder
        .encode(this, StandardCharsets.UTF_8.name())
        .replace("+", "%20")
}
