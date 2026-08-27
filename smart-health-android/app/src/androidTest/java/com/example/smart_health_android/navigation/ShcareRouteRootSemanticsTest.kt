package com.example.smart_health_android.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShcareRouteRootSemanticsTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun typedActiveRouteExposesItsCanonicalRootTagToComposeTestsAndTalkBackTooling() {
        composeRule.setContent {
            ShcareMobileTheme {
                Box(
                    modifier = Modifier.shcareRouteRootTestTag(
                        ShcareMobileRoute.PatientDashboard.routePattern,
                    ),
                )
            }
        }

        composeRule
            .onNodeWithTag(ShcareMobileRoute.PatientDashboard.testTag)
            .assertExists()
    }
}
