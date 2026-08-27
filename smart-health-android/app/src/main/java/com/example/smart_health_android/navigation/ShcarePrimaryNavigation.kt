package com.example.smart_health_android.navigation

/**
 * Stable semantic ids for the native mobile information architecture.
 *
 * An id is not automatically a live navigation destination. The primary-navigation contract
 * only exposes ids whose route is registered, backed by a real screen, and authorized by the
 * current backend-issued authority.
 */
enum class ShcarePrimaryDestinationId {
    Overview,
    Measure,
    Records,
    Account,
    Today,
    Patients,
    Alerts,
}

data class ShcarePrimaryDestination(
    val id: ShcarePrimaryDestinationId,
    val route: ShcareMobileRoute,
)

/**
 * Native Android primary navigation. It deliberately does not mirror the Web shell.
 *
 * Every exposed clinical destination is backed by a typed route, a real native screen, and
 * backend-issued capabilities. Missing capabilities remove the destination instead of creating
 * a disabled or fake tab.
 */
object ShcarePrimaryNavigationContract {
    private val patientCandidates = listOf(
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Overview,
            route = ShcareMobileRoute.PatientDashboard,
        ),
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Measure,
            route = ShcareMobileRoute.NewScan,
        ),
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Records,
            route = ShcareMobileRoute.Records,
        ),
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Account,
            route = ShcareMobileRoute.Settings,
        ),
    )

    private val clinicalCandidates = listOf(
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Today,
            route = ShcareMobileRoute.ClinicalDashboard,
        ),
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Patients,
            route = ShcareMobileRoute.ClinicalPatients,
        ),
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Alerts,
            route = ShcareMobileRoute.ClinicalAlerts,
        ),
        ShcarePrimaryDestination(
            id = ShcarePrimaryDestinationId.Account,
            route = ShcareMobileRoute.Settings,
        ),
    )

    fun destinationsFor(
        context: MobileRouteAccessContext,
        expectedAuthorityEpoch: Long,
    ): List<ShcarePrimaryDestination> =
        candidatesFor(context.experience).filter { destination ->
            ShcareMobileRouteContract.evaluate(
                contract = destination.route,
                context = context,
                expectedAuthorityEpoch = expectedAuthorityEpoch,
            ) is MobileRouteAccessDecision.Allowed
        }

    fun isPrimaryRoute(
        route: String?,
        context: MobileRouteAccessContext,
        expectedAuthorityEpoch: Long,
    ): Boolean {
        val resolved = ShcareMobileRouteContract.resolve(route) ?: return false
        return destinationsFor(
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ).any { destination -> destination.route == resolved }
    }

    private fun candidatesFor(experience: MobileExperience): List<ShcarePrimaryDestination> =
        when (experience) {
            MobileExperience.Patient -> patientCandidates
            MobileExperience.Clinical -> clinicalCandidates
        }
}
