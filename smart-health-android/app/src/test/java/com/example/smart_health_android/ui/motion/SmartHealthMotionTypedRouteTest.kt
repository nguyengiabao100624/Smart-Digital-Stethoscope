package com.example.smart_health_android.ui.motion

import com.example.smart_health_android.navigation.ShcareMobileRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartHealthMotionTypedRouteTest {
    @Test
    fun clinicalAndPatientPrimaryRoutePatternsShareTheSameNavigationDepth() {
        val primaryRoutes = listOf(
            ShcareMobileRoute.ClinicalDashboard,
            ShcareMobileRoute.ClinicalPatients,
            ShcareMobileRoute.ClinicalAlerts,
            ShcareMobileRoute.PatientDashboard,
            ShcareMobileRoute.NewScan,
            ShcareMobileRoute.Records,
            ShcareMobileRoute.Settings,
        )

        assertEquals(
            setOf(2),
            primaryRoutes
                .map { route -> SmartHealthMotion.routeDepth(route.routePattern) }
                .toSet(),
        )
    }

    @Test
    fun typedContextAndDetailRoutesRemainDeeperThanTheirPrimaryParent() {
        val parentAndDetailRoutes = listOf(
            ShcareMobileRoute.Records to ShcareMobileRoute.RecordDetail,
            ShcareMobileRoute.NewScan to ShcareMobileRoute.Monitoring,
            ShcareMobileRoute.Settings to ShcareMobileRoute.Profile,
            ShcareMobileRoute.Settings to ShcareMobileRoute.ChangePassword,
            ShcareMobileRoute.Privacy to ShcareMobileRoute.DataAccess,
            ShcareMobileRoute.ClinicalAlerts to ShcareMobileRoute.ClinicalReviews,
        )

        parentAndDetailRoutes.forEach { (parent, detail) ->
            assertTrue(
                "${detail.name} must remain deeper than ${parent.name}",
                SmartHealthMotion.routeDepth(detail.routePattern) >
                    SmartHealthMotion.routeDepth(parent.routePattern),
            )
        }
    }
}
