package com.example.smart_health_android.notifications

import com.example.smart_health_android.navigation.MobileExperience
import com.example.smart_health_android.navigation.MobileRouteAccessContext
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
    fun backendDeviceDetailPayloadOpensTheNativeDeviceManagementSurface() {
        assertEquals(
            SmartHealthNotificationDestination.DeviceManagement,
            SmartHealthNotificationDestination.fromPayload(
                mapOf(
                    "destination" to "device_detail",
                    "deviceId" to "device-42",
                    "type" to "success",
                ),
            ),
        )
        assertEquals(
            SmartHealthNotificationDestination.DeviceManagement,
            SmartHealthNotificationDestination.fromWire("device_detail", "device-42"),
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
    fun preferenceMutationSendsExactlyOneCloudField() {
        val request = NotificationPreferenceMutation(
            field = NotificationPreferenceField.Appointments,
            value = false,
        ).requestFields()

        assertEquals(
            mapOf(
                "key" to "appointments",
                "enabled" to false,
            ),
            request,
        )
    }

    @Test
    fun soundAndVibrationAreNotCloudPreferenceFields() {
        assertEquals(
            setOf(
                "enabled",
                "doctorRequests",
                "abnormalResults",
                "deviceOffline",
                "appointments",
                "messages",
                "aiUpdates",
                "newLogin",
            ),
            NotificationPreferenceField.entries.map { it.backendKey }.toSet(),
        )
    }

    @Test
    fun androidDeliveryUsesStableSystemOwnedChannelIds() {
        assertEquals(
            "smart_health_alerts",
            SmartHealthNotificationChannel.ClinicalAlerts.channelId,
        )
        assertEquals(
            "shcare_updates",
            SmartHealthNotificationChannel.GeneralUpdates.channelId,
        )
    }

    @Test
    fun runtimeReadinessRequiresPermissionAppChannelProviderAndSessionTruth() {
        val ready = NotificationRuntimeReadiness(
            firebaseConfigured = true,
            runtimePermissionGranted = true,
            appNotificationsEnabled = true,
            channelEnabled = true,
            encryptedSessionMatches = true,
        )

        assertTrue(ready.ready)
        assertFalse(ready.copy(runtimePermissionGranted = false).ready)
        assertFalse(ready.copy(appNotificationsEnabled = false).ready)
        assertFalse(ready.copy(channelEnabled = false).ready)
    }

    @Test
    fun notificationNavigationWaitsForAnAuthenticatedDestination() {
        val authority = notificationAuthority()
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                "splash",
                destinationRoute = "notifications",
                hasAuthenticatedSession = false,
                hasMatchingNotificationOwner = true,
                authority = authority,
            )
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                "login",
                destinationRoute = "notifications",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = authority,
            )
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                "doctor-approval-pending",
                destinationRoute = "notifications",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = authority,
            )
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                "dashboard",
                destinationRoute = "notifications",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = false,
                authority = authority,
            )
        )
        assertTrue(
            NotificationNavigationPolicy.canNavigate(
                "dashboard",
                destinationRoute = "notifications",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = authority,
            )
        )
        assertTrue(
            NotificationNavigationPolicy.canNavigate(
                "notification-settings",
                destinationRoute = "notifications",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = authority,
            )
        )
    }

    @Test
    fun notificationDestinationIsWhitelistedAndCapabilityChecked() {
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = "dashboard",
                destinationRoute = "records",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = notificationAuthority(),
            ),
        )
        assertTrue(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = "dashboard",
                destinationRoute = "records",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = notificationAuthority(
                    capabilities = setOf("workspace.scans.view"),
                ),
            ),
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = "dashboard",
                destinationRoute = "../../settings",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = notificationAuthority(),
            ),
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = "dashboard",
                destinationRoute = "doctor-approval-pending",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = notificationAuthority(),
            ),
        )
        assertFalse(
            NotificationNavigationPolicy.canNavigate(
                currentRoute = "dashboard",
                destinationRoute = "notifications",
                hasAuthenticatedSession = true,
                hasMatchingNotificationOwner = true,
                authority = notificationAuthority(),
                expectedAuthorityEpoch = 2L,
            ),
        )
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

private fun notificationAuthority(
    capabilities: Set<String> = setOf("workspace.dashboard.view"),
) = MobileRouteAccessContext(
    userId = "doctor-1",
    workspaceId = "workspace-1",
    role = "doctor",
    capabilities = capabilities,
    experience = MobileExperience.Clinical,
    authorityEpoch = 1L,
)
