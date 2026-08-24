package com.example.smart_health_android.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import com.example.smart_health_android.R
import com.example.smart_health_android.ui.components.ShcareErrorState
import com.example.smart_health_android.ui.components.ShcareLoadingState
import com.example.smart_health_android.ui.components.ShcarePermissionState

/**
 * Prevents a protected destination from composing, and therefore from loading data, until the
 * current backend-confirmed account/workspace authority can open its typed route contract.
 */
fun NavGraphBuilder.authorizedMobileComposable(
    navController: NavHostController,
    route: String,
    arguments: List<NamedNavArgument> = emptyList(),
    content: @Composable (NavBackStackEntry) -> Unit,
) {
    composable(
        route = route,
        arguments = arguments,
    ) { backStackEntry ->
        AuthorizedMobileRoute(
            navController = navController,
            routePattern = route,
            backStackEntry = backStackEntry,
            content = content,
        )
    }
}

@Composable
private fun AuthorizedMobileRoute(
    navController: NavHostController,
    routePattern: String,
    backStackEntry: NavBackStackEntry,
    content: @Composable (NavBackStackEntry) -> Unit,
) {
    val authorityStore = ShcareMobileSessionAuthority.store
    val authorityState by authorityStore.state.collectAsStateWithLifecycle()
    val reauthorizationRuntime = LocalMobileAuthorityReauthorizationRuntime.current
    if (reauthorizationRuntime == null) {
        LaunchedEffect(backStackEntry) {
            navController.replaceBackStackWith(ShcareMobileRoute.Splash.routePattern)
        }
        ShcareLoadingState(
            message = stringResource(R.string.mobile_route_reauth_loading),
            modifier = Modifier.fillMaxSize(),
        )
        return
    }
    val reauthorizationTicket = remember(
        backStackEntry,
        authorityState.authority,
        authorityState.reauthorizing,
        authorityState.verifiedAtElapsedRealtimeMillis,
        reauthorizationRuntime,
    ) {
        if (authorityState.authority == null) {
            null
        } else if (authorityState.reauthorizing) {
            reauthorizationRuntime.coordinator.resumeOrBeginForegroundReauthorization()
        } else if (
            reauthorizationRuntime.coordinator.needsReauthorizationNow()
        ) {
            reauthorizationRuntime.coordinator.beginForegroundReauthorization()
        } else {
            null
        }
    }
    LaunchedEffect(reauthorizationTicket, reauthorizationRuntime) {
        if (reauthorizationTicket != null) {
            reauthorizationRuntime.onResult(
                reauthorizationRuntime.coordinator.completeForegroundReauthorization(
                    reauthorizationTicket,
                ),
            )
        }
    }
    val authorityStillStale = authorityState.authority != null &&
        reauthorizationRuntime.coordinator.needsReauthorizationNow()
    if (
        reauthorizationTicket != null ||
        authorityState.reauthorizing ||
        authorityStillStale
    ) {
        ShcareLoadingState(
            message = stringResource(R.string.mobile_route_reauth_loading),
            modifier = Modifier.fillMaxSize(),
        )
        return
    }

    val expectedAuthorityEpoch = remember(backStackEntry) {
        authorityState.authority?.epoch ?: authorityState.epoch
    }
    val context = authorityState.authority?.toRouteAccessContext()
    val contract = remember(routePattern) {
        ShcareMobileRoute.entries.firstOrNull { it.routePattern == routePattern }
    }
    val decision = contract?.let {
        ShcareMobileRouteContract.evaluate(
            contract = it,
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        )
    } ?: MobileRouteAccessDecision.Denied(MobileRouteDenialReason.UnknownRoute)

    when (decision) {
        is MobileRouteAccessDecision.Allowed -> content(backStackEntry)

        is MobileRouteAccessDecision.Denied -> when (decision.reason) {
            MobileRouteDenialReason.AuthenticationRequired -> {
                LaunchedEffect(backStackEntry) {
                    navController.replaceBackStackWith(ShcareMobileRoute.Splash.routePattern)
                }
                ShcareLoadingState(
                    message = stringResource(R.string.mobile_route_reauth_loading),
                    modifier = Modifier.fillMaxSize(),
                )
            }

            MobileRouteDenialReason.StaleAuthority -> {
                LaunchedEffect(backStackEntry, authorityState.epoch) {
                    navController.replaceBackStackWith(safeRouteFor(context))
                }
                ShcareLoadingState(
                    message = stringResource(R.string.mobile_route_reauth_loading),
                    modifier = Modifier.fillMaxSize(),
                )
            }

            MobileRouteDenialReason.CapabilityMissing,
            MobileRouteDenialReason.ExperienceMismatch,
            -> ShcarePermissionState(
                onRequestPermission = {
                    navController.replaceBackStackWith(safeRouteFor(context))
                },
                title = stringResource(R.string.mobile_route_permission_title),
                message = stringResource(R.string.mobile_route_permission_message),
                actionLabel = stringResource(R.string.mobile_route_permission_action),
                modifier = Modifier.fillMaxSize(),
            )

            MobileRouteDenialReason.UnknownRoute -> ShcareErrorState(
                onRetry = {
                    navController.replaceBackStackWith(ShcareMobileRoute.Splash.routePattern)
                },
                title = stringResource(R.string.mobile_route_invalid_title),
                message = stringResource(R.string.mobile_route_invalid_message),
                retryLabel = stringResource(R.string.mobile_route_invalid_action),
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

private fun safeRouteFor(context: MobileRouteAccessContext?): String {
    if (context == null) return ShcareMobileRoute.Splash.routePattern

    val root = ShcareMobileRouteContract.rootFor(context.experience)
    if (
        ShcareMobileRouteContract.evaluate(
            contract = root,
            context = context,
            expectedAuthorityEpoch = context.authorityEpoch,
        ) is MobileRouteAccessDecision.Allowed
    ) {
        return root.routePattern
    }

    return ShcareMobileRoute.Settings.routePattern
}

private fun NavHostController.replaceBackStackWith(route: String) {
    navigate(route) {
        popUpTo(graph.id) { inclusive = true }
        launchSingleTop = true
    }
}
