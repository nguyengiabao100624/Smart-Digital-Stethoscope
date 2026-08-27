package com.example.smart_health_android.ui.motion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartHealthMotionTest {
    @Test
    fun `native route motion stays inside the accepted duration window`() {
        assertTrue(SmartHealthMotion.ScreenTransitionMillis in 180..260)
        assertTrue(SmartHealthMotion.ScreenFadeMillis in 180..260)
        assertTrue(SmartHealthMotion.ScreenPopMillis in 180..260)
    }

    @Test
    fun `primary destinations share a depth while detail routes remain deeper`() {
        val primaryDepths = listOf(
            "clinical-patients",
            "clinical-alerts",
            "patient-dashboard",
            "new-scan",
            "records",
            "settings",
        ).map(SmartHealthMotion::routeDepth)

        assertEquals(listOf(2, 2, 2, 2, 2, 2), primaryDepths)
        assertTrue(
            SmartHealthMotion.routeDepth("record-detail") >
                SmartHealthMotion.routeDepth("records"),
        )
        assertTrue(
            SmartHealthMotion.routeDepth("change-password") >
                SmartHealthMotion.routeDepth("settings"),
        )
    }
}
