package com.example.smart_health_android.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartHealthNotificationContractsTest {
    @Test
    fun abnormalResultTargetsItsRecordAndEncodesUnsafeRouteCharacters() {
        val destination = SmartHealthNotificationDestination.fromPayload(
            mapOf(
                "type" to "abnormal_result",
                "recordId" to "scan/42 west",
            )
        )

        assertEquals(
            SmartHealthNotificationDestination.RecordDetail("scan/42 west"),
            destination,
        )
        assertEquals("record-detail/scan%2F42%20west", destination.route)
    }

    @Test
    fun typedPayloadsRouteOnlyToWhitelistedNativeScreens() {
        assertEquals(
            SmartHealthNotificationDestination.Monitoring("scan-7"),
            SmartHealthNotificationDestination.fromPayload(
                mapOf("destination" to "monitoring", "scanId" to "scan-7")
            ),
        )
        assertEquals(
            SmartHealthNotificationDestination.DeviceManagement,
            SmartHealthNotificationDestination.fromPayload(mapOf("type" to "device_offline")),
        )
        assertEquals(
            SmartHealthNotificationDestination.DoctorApproval,
            SmartHealthNotificationDestination.fromPayload(mapOf("type" to "doctor_info_requested")),
        )
        assertEquals(
            SmartHealthNotificationDestination.Inbox,
            SmartHealthNotificationDestination.fromPayload(
                mapOf("destination" to "../../settings", "type" to "unknown")
            ),
        )
    }

    @Test
    fun wireDestinationCannotInjectAnArbitraryNavigationRoute() {
        assertEquals(
            SmartHealthNotificationDestination.RecordDetail("record-1"),
            SmartHealthNotificationDestination.fromWire("record_detail", "record-1"),
        )
        assertEquals(
            SmartHealthNotificationDestination.Inbox,
            SmartHealthNotificationDestination.fromWire("record-detail/other", "record-1"),
        )
    }

    @Test
    fun clinicalEventsUseTheAlertChannelWhileRoutineEventsStayGeneral() {
        assertEquals("smart_health_alerts", SmartHealthNotificationChannel.ClinicalAlerts.channelId)
        assertEquals("shcare_updates", SmartHealthNotificationChannel.GeneralUpdates.channelId)
        assertEquals(
            SmartHealthNotificationChannel.ClinicalAlerts,
            SmartHealthNotificationChannel.fromPayload(mapOf("type" to "abnormal_result")),
        )
        assertEquals(
            SmartHealthNotificationChannel.ClinicalAlerts,
            SmartHealthNotificationChannel.fromPayload(mapOf("severity" to "critical")),
        )
        assertEquals(
            SmartHealthNotificationChannel.GeneralUpdates,
            SmartHealthNotificationChannel.fromPayload(mapOf("type" to "appointment_reminder")),
        )
    }

    @Test
    fun preferenceMutationChangesOneFieldAndPreservesPortalManagedFields() {
        val current = linkedMapOf(
            "enabled" to false,
            "messages" to true,
            "doctorRequests" to false,
            "newLogin" to false,
            "portalOnly" to true,
        )

        val request = NotificationPreferenceMutation(
            field = NotificationPreferenceField.Enabled,
            value = true,
        ).requestFields(current)
        val merged = request.getValue("notificationPreferences")

        assertEquals(true, merged["enabled"])
        assertEquals(true, merged["messages"])
        assertEquals(false, merged["doctorRequests"])
        assertEquals(false, merged["newLogin"])
        assertEquals(true, merged["portalOnly"])
        assertEquals(current.keys, merged.keys)
    }

    @Test
    fun enablingWithoutPermissionWaitsForTheSystemResultBeforePersisting() {
        val initialDecision = NotificationPermissionPolicy.onToggle(
            requestedEnabled = true,
            hasSystemPermission = false,
        )

        assertEquals(NotificationPermissionDecision.RequestSystemPermission, initialDecision)
        assertEquals(
            NotificationPermissionDecision.Persist(
                NotificationPreferenceMutation(NotificationPreferenceField.Enabled, true)
            ),
            NotificationPermissionPolicy.onPermissionResult(granted = true),
        )
        assertEquals(
            NotificationPermissionDecision.Persist(
                NotificationPreferenceMutation(NotificationPreferenceField.Enabled, false)
            ),
            NotificationPermissionPolicy.onPermissionResult(granted = false),
        )
    }

    @Test
    fun notificationNavigationWaitsForAnAuthenticatedDestination() {
        assertFalse(NotificationNavigationPolicy.canNavigate("splash", hasAuthenticatedSession = false))
        assertFalse(NotificationNavigationPolicy.canNavigate("login", hasAuthenticatedSession = true))
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                "doctor-approval-pending",
                hasAuthenticatedSession = true,
            )
        )
        assertTrue(NotificationNavigationPolicy.canNavigate("dashboard", hasAuthenticatedSession = true))
        assertTrue(NotificationNavigationPolicy.canNavigate("notification-settings", hasAuthenticatedSession = true))
    }

    @Test
    fun appointmentNotificationsDeepLinkToTheNativeAppointmentDetail() {
        val destination = SmartHealthNotificationDestination.fromPayload(
            mapOf(
                "type" to "appointment_reminder",
                "appointmentId" to "appt/42 west",
            )
        )

        assertEquals(
            SmartHealthNotificationDestination.AppointmentDetail("appt/42 west"),
            destination,
        )
        assertEquals("appointments?appointmentId=appt%2F42%20west", destination.route)
    }
}
