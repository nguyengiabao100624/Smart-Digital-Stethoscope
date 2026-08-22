package com.example.smart_health_android.navigation

import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag

/** Applies the canonical typed-route tag to the active NavHost root. */
fun Modifier.shcareRouteRootTestTag(route: String?): Modifier = testTag(
    ShcareMobileRouteContract.rootTestTagFor(route),
)
