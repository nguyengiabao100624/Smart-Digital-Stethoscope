package com.example.smart_health_android.appointments

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppointmentWorkflowTest {
    @Test
    fun doctorActionsFollowTheAcceptedAppointmentStateMachine() {
        assertEquals(
            setOf(
                AppointmentAction.Confirm,
                AppointmentAction.Cancel,
                AppointmentAction.MarkNoShow,
                AppointmentAction.Reschedule,
            ),
            AppointmentWorkflow.availableActions(
                status = AppointmentStatus.Scheduled,
                actor = AppointmentActor.Doctor,
                canManage = true,
            ),
        )
        assertEquals(
            setOf(
                AppointmentAction.Complete,
                AppointmentAction.Cancel,
                AppointmentAction.MarkNoShow,
                AppointmentAction.Reschedule,
            ),
            AppointmentWorkflow.availableActions(
                status = AppointmentStatus.Confirmed,
                actor = AppointmentActor.Doctor,
                canManage = true,
            ),
        )
        assertTrue(
            AppointmentWorkflow.availableActions(
                status = AppointmentStatus.Completed,
                actor = AppointmentActor.Doctor,
                canManage = true,
            ).isEmpty(),
        )
    }

    @Test
    fun patientCanOnlyChangeAnOpenAppointmentWhenBackendGrantsManageCapability() {
        val allowed = AppointmentWorkflow.availableActions(
            status = AppointmentStatus.Scheduled,
            actor = AppointmentActor.Patient,
            canManage = true,
        )

        assertEquals(setOf(AppointmentAction.Cancel, AppointmentAction.Reschedule), allowed)
        assertFalse(AppointmentAction.Confirm in allowed)
        assertTrue(
            AppointmentWorkflow.availableActions(
                status = AppointmentStatus.Scheduled,
                actor = AppointmentActor.Patient,
                canManage = false,
            ).isEmpty(),
        )
    }

    @Test
    fun unknownBackendLifecycleNeverEnablesAClientSideMutation() {
        val status = AppointmentStatus.fromWire("awaiting_external_confirmation")

        assertEquals(AppointmentStatus.Unknown, status)
        assertTrue(
            AppointmentWorkflow.availableActions(
                status = status,
                actor = AppointmentActor.Doctor,
                canManage = true,
            ).isEmpty(),
        )
    }
}
