package com.example.smart_health_android.ui.motion

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.navigation.NavBackStackEntry

object SmartHealthMotion {
    const val ScreenTransitionMillis = 300
    const val ScreenFadeMillis = 210
    const val ScreenPopMillis = 240

    val StandardEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val EmphasizedEasing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

    fun routeDepth(route: String?): Int {
        return when (route?.substringBefore("?")) {
            "splash" -> 0
            "login", "sign-up", "forgot-password", "phone-login", "verify-email" -> 1
            "doctor-approval-pending", "dashboard", "patient-dashboard" -> 2
            "notifications", "new-scan", "monitoring", "records", "ai-assistant",
            "settings", "bluetooth", "connection-success" -> 3
            "record-detail", "profile", "privacy", "stethoscope-settings", "ai-calibration",
            "data-storage", "notification-settings", "bluetooth-settings" -> 4
            "verify-phone-settings", "re-verify/{type}/{contact}", "change-password",
            "data-access", "access-log", "delete-data", "export-data" -> 5
            else -> 3
        }
    }
}

fun AnimatedContentTransitionScope<NavBackStackEntry>.smartHealthEnterTransition(): EnterTransition {
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
        initialOffset = { it / 5 },
    ) + fadeIn(
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenFadeMillis,
            easing = SmartHealthMotion.StandardEasing,
        ),
    ) + scaleIn(
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenTransitionMillis,
            easing = SmartHealthMotion.EmphasizedEasing,
        ),
        initialScale = 0.985f,
    )
}

fun AnimatedContentTransitionScope<NavBackStackEntry>.smartHealthExitTransition(): ExitTransition {
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
        targetOffset = { it / 10 },
    ) + fadeOut(
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenFadeMillis,
            easing = SmartHealthMotion.StandardEasing,
        ),
    ) + scaleOut(
        animationSpec = tween(
            durationMillis = SmartHealthMotion.ScreenPopMillis,
            easing = SmartHealthMotion.StandardEasing,
        ),
        targetScale = 0.995f,
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
