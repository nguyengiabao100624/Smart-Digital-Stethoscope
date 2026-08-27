package com.example.smart_health_android.ui.motion

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.navigation.NavBackStackEntry

object SmartHealthMotion {
    const val ScreenTransitionMillis = 220
    const val ScreenFadeMillis = 180
    const val ScreenPopMillis = 200

    val StandardEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val EmphasizedEasing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

    fun routeDepth(route: String?): Int {
        return when (route?.substringBefore("?")) {
            "splash" -> 0
            "login", "sign-up", "forgot-password", "verify-email" -> 1
            "doctor-approval-pending" -> 2
            "dashboard", "clinical-patients", "clinical-alerts", "patient-dashboard",
            "new-scan", "records", "settings" -> 2
            "notifications", "monitoring", "ai-assistant", "bluetooth",
            "connection-success" -> 3
            "record-detail", "profile", "privacy", "stethoscope-settings", "ai-calibration",
            "data-storage", "notification-settings", "device-management", "bluetooth-settings" -> 4
            "verify-phone-settings", "re-verify/{type}", "change-password",
            "data-access", "access-log", "export-data" -> 5
            else -> 3
        }
    }
}

fun AnimatedContentTransitionScope<NavBackStackEntry>.smartHealthEnterTransition(): EnterTransition {
    if (targetDepth() == initialDepth()) {
        return fadeIn(
            animationSpec = tween(
                durationMillis = SmartHealthMotion.ScreenFadeMillis,
                easing = SmartHealthMotion.StandardEasing,
            ),
        )
    }
    val direction = if (targetDepth() >= initialDepth()) {
        AnimatedContentTransitionScope.SlideDirection.Left
    } else {
        AnimatedContentTransitionScope.SlideDirection.Right
    }

    return slideIntoContainer(
        towards = direction,
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenTransitionMillis,
            easing = SmartHealthMotion.EmphasizedEasing,
        ),
        initialOffset = { it / 8 },
    ) + fadeIn(
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenFadeMillis,
            easing = SmartHealthMotion.StandardEasing,
        ),
    )
}

fun AnimatedContentTransitionScope<NavBackStackEntry>.smartHealthExitTransition(): ExitTransition {
    if (targetDepth() == initialDepth()) {
        return fadeOut(
            animationSpec = tween(
                durationMillis = SmartHealthMotion.ScreenFadeMillis,
                easing = SmartHealthMotion.StandardEasing,
            ),
        )
    }
    val direction = if (targetDepth() >= initialDepth()) {
        AnimatedContentTransitionScope.SlideDirection.Left
    } else {
        AnimatedContentTransitionScope.SlideDirection.Right
    }

    return slideOutOfContainer(
        towards = direction,
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenPopMillis,
            easing = SmartHealthMotion.StandardEasing,
        ),
        targetOffset = { it / 12 },
    ) + fadeOut(
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenFadeMillis,
            easing = SmartHealthMotion.StandardEasing,
        ),
    )
}

fun AnimatedContentTransitionScope<NavBackStackEntry>.smartHealthPopEnterTransition(): EnterTransition =
    smartHealthEnterTransition()

fun AnimatedContentTransitionScope<NavBackStackEntry>.smartHealthPopExitTransition(): ExitTransition =
    smartHealthExitTransition()

private fun AnimatedContentTransitionScope<NavBackStackEntry>.initialDepth(): Int =
    SmartHealthMotion.routeDepth(initialState.destination.route)

private fun AnimatedContentTransitionScope<NavBackStackEntry>.targetDepth(): Int =
    SmartHealthMotion.routeDepth(targetState.destination.route)
