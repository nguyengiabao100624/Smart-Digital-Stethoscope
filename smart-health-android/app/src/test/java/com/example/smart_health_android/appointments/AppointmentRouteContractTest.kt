package com.example.smart_health_android.appointments

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppointmentRouteContractTest {
    @Test
    fun appointmentRouteBuildsAWhitelistedEncodedDeepLink() {
        assertEquals("appointments", AppointmentRoute.List.route)
        assertEquals(
            "appointments?appointmentId=appt%2F42%20west",
            AppointmentRoute.Detail("appt/42 west").route,
        )
        assertEquals("appointment-list", AppointmentRoute.List.testTag)
        assertEquals("appointment-detail", AppointmentRoute.Detail("appt-1").testTag)
    }

    @Test
    fun routeAccessUsesBackendCapabilitiesInsteadOfRoleGuessing() {
        assertTrue(
            AppointmentRoute.List.canOpen(
                setOf("personal.appointments.view"),
            ),
        )
        assertTrue(
            AppointmentRoute.List.canManage(
                setOf("workspace.appointments.manage"),
            ),
        )
        assertFalse(
            AppointmentRoute.List.canOpen(
                setOf("workspace.patients.view"),
            ),
        )
    }

    @Test
    fun unsupportedBackendAppointmentTypeIsNotMislabelledAsRemoteCare() {
        assertEquals(
            AppointmentType.Unknown,
            AppointmentType.fromWire("home_visit"),
        )
    }
}
