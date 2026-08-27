package com.example.smart_health_android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.navigation.MobileExperience
import com.example.smart_health_android.navigation.MobileRouteAccessContext
import com.example.smart_health_android.navigation.ShcareMobileRoute
import com.example.smart_health_android.navigation.ShcarePrimaryDestination
import com.example.smart_health_android.navigation.ShcarePrimaryNavigationContract
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShcareScaffoldTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun compactThreeHundredSixtyDpWidthUsesBottomNavigation() {
        setPatientScaffold(widthDp = 360)

        composeRule.onNodeWithTag("shcare.navigation.bottom")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.navigation.rail")
            .assertDoesNotExist()
        composeRule.onNodeWithTag("shcare.scaffold.content")
            .assertIsDisplayed()
    }

    @Test
    fun compactFourHundredTwelveDpWidthUsesBottomNavigationInDarkTheme() {
        setPatientScaffold(
            widthDp = 412,
            themeMode = ShcareThemeMode.Dark,
        )

        composeRule.onNodeWithTag("shcare.navigation.bottom")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.navigation.rail")
            .assertDoesNotExist()
        composeRule.onNodeWithTag("shcare.scaffold.content")
            .assertIsDisplayed()
    }

    @Test
    fun mediumSixHundredDpWidthUsesNavigationRail() {
        setPatientScaffold(widthDp = 600)

        composeRule.onNodeWithTag("shcare.navigation.rail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.navigation.bottom")
            .assertDoesNotExist()
        composeRule.onNodeWithTag("shcare.scaffold.content")
            .assertIsDisplayed()
    }

    @Test
    fun expandedEightHundredFortyDpWidthUsesNavigationRail() {
        setPatientScaffold(widthDp = 840)

        composeRule.onNodeWithTag("shcare.navigation.rail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.navigation.bottom")
            .assertDoesNotExist()
    }

    @Test
    fun expandedEightHundredFortyDpWidthShowsListAndEmptyDetailPane() {
        setPatientListDetailScaffold(
            widthDp = 840,
            state = ShcareListDetailState.NoSelection,
        )

        composeRule.onNodeWithTag("shcare.navigation.rail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.list")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.empty-detail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.detail")
            .assertDoesNotExist()
    }

    @Test
    fun expandedEightHundredFortyDpWidthShowsSelectedDetailBesideList() {
        setPatientListDetailScaffold(
            widthDp = 840,
            state = ShcareListDetailState.DetailVisible,
        )

        composeRule.onNodeWithTag("shcare.list-detail.list")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.detail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("test.detail.side-by-side")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.empty-detail")
            .assertDoesNotExist()
    }

    @Test
    fun expandedWidthAtTwoHundredPercentFontScaleFallsBackToSinglePane() {
        setPatientListDetailScaffold(
            widthDp = 840,
            fontScale = 2f,
            state = ShcareListDetailState.DetailVisible,
        )

        composeRule.onNodeWithTag("shcare.navigation.rail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.list")
            .assertDoesNotExist()
        composeRule.onNodeWithTag("shcare.list-detail.detail")
            .assertDoesNotExist()
        composeRule.onNodeWithTag("shcare.list-detail.single-detail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("test.detail.full-screen")
            .assertIsDisplayed()
    }

    @Test
    fun clinicalCompactNavigationUsesDoctorDestinationsAndBackendCapabilities() {
        var selectedDestination: ShcarePrimaryDestination? = null
        setClinicalScaffold(
            widthDp = 412,
            onDestinationSelected = { destination ->
                selectedDestination = destination
            },
        )

        composeRule.onNodeWithTag("shcare.navigation.bottom")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.navigation.item.today")
            .assertIsDisplayed()
            .assertIsSelected()
        composeRule.onNodeWithTag("shcare.navigation.item.patients")
            .assertIsDisplayed()
            .assertIsNotSelected()
            .assertHasClickAction()
        composeRule.onNodeWithTag("shcare.navigation.item.alerts")
            .assertIsDisplayed()
            .assertIsNotSelected()
        composeRule.onNodeWithTag("shcare.navigation.item.account")
            .assertIsDisplayed()
            .assertIsNotSelected()

        composeRule.onNodeWithTag("shcare.navigation.item.patients")
            .performClick()
        composeRule.runOnIdle {
            assertEquals(
                ShcareMobileRoute.ClinicalPatients,
                selectedDestination?.route,
            )
        }
    }

    @Test
    fun clinicalMediumWidthUsesNavigationRail() {
        setClinicalScaffold(widthDp = 600)

        composeRule.onNodeWithTag("shcare.navigation.rail")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.navigation.bottom")
            .assertDoesNotExist()
        composeRule.onNodeWithTag("shcare.navigation.item.alerts")
            .assertIsDisplayed()
    }

    @Test
    fun selectedItemExposesItsVietnameseLabelAndAnotherItemInvokesCallback() {
        var selectedDestination: ShcarePrimaryDestination? = null
        setPatientScaffold(
            widthDp = 360,
            onDestinationSelected = { destination ->
                selectedDestination = destination
            },
        )

        composeRule.onNodeWithTag("shcare.navigation.item.overview")
            .assertIsDisplayed()
            .assertIsSelected()
            .assertTextContains("Tổng quan")
        composeRule.onNodeWithTag(
            "shcare.navigation.label.overview",
            useUnmergedTree = true,
        )
            .assertIsDisplayed()
            .assertHeightIsAtLeast(32.dp)
        composeRule.onNodeWithTag("shcare.navigation.item.measure")
            .assertIsDisplayed()
            .assertIsNotSelected()
            .assertHasClickAction()
            .assertTextContains("Đo")
        composeRule.onNodeWithTag("shcare.navigation.item.records")
            .assertIsNotSelected()
        composeRule.onNodeWithTag("shcare.navigation.item.account")
            .assertIsNotSelected()

        composeRule.runOnIdle {
            assertNull(selectedDestination)
        }
        composeRule.onNodeWithTag("shcare.navigation.item.measure")
            .performClick()
        composeRule.runOnIdle {
            assertEquals(
                ShcareMobileRoute.NewScan,
                selectedDestination?.route,
            )
        }
    }

    @Test
    fun compactNavigationRemainsAccessibleAtTwoHundredPercentFontScale() {
        setPatientScaffold(
            widthDp = 360,
            fontScale = 2f,
        )

        composeRule.onNodeWithTag("shcare.navigation.bottom")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.navigation.item.overview")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .assertTextContains("Tổng quan")
        composeRule.onNodeWithTag("shcare.navigation.item.measure")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .assertTextContains("Đo")
        composeRule.onNodeWithTag("shcare.navigation.item.records")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .assertTextContains("Hồ sơ")
        composeRule.onNodeWithTag("shcare.navigation.item.account")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .assertTextContains("Tài khoản")
        composeRule.onNodeWithTag(
            "shcare.navigation.label.account",
            useUnmergedTree = true,
        )
            .assertIsDisplayed()
            .assertHeightIsAtLeast(32.dp)
    }

    private fun setPatientScaffold(
        widthDp: Int,
        fontScale: Float = 1f,
        themeMode: ShcareThemeMode = ShcareThemeMode.Light,
        onDestinationSelected: (ShcarePrimaryDestination) -> Unit = {},
    ) {
        setScaffold(
            widthDp = widthDp,
            fontScale = fontScale,
            themeMode = themeMode,
            accessContext = patientContext(),
            selectedRoute = ShcareMobileRoute.PatientDashboard,
            onDestinationSelected = onDestinationSelected,
        )
    }

    private fun setClinicalScaffold(
        widthDp: Int,
        fontScale: Float = 1f,
        themeMode: ShcareThemeMode = ShcareThemeMode.Light,
        onDestinationSelected: (ShcarePrimaryDestination) -> Unit = {},
    ) {
        setScaffold(
            widthDp = widthDp,
            fontScale = fontScale,
            themeMode = themeMode,
            accessContext = clinicalContext(),
            selectedRoute = ShcareMobileRoute.ClinicalDashboard,
            onDestinationSelected = onDestinationSelected,
        )
    }

    private fun setPatientListDetailScaffold(
        widthDp: Int,
        fontScale: Float = 1f,
        state: ShcareListDetailState,
    ) {
        val accessContext = patientContext()
        val items = ShcarePrimaryNavigationContract
            .destinationsFor(
                context = accessContext,
                expectedAuthorityEpoch = accessContext.authorityEpoch,
            )
            .map(ShcarePrimaryDestination::toShcareNavigationItem)

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val hostWidthPixels = with(hostDensity) { maxWidth.toPx() }
                val simulatedDensity = hostWidthPixels / widthDp.toFloat()
                CompositionLocalProvider(
                    LocalDensity provides Density(
                        density = simulatedDensity,
                        fontScale = fontScale,
                    ),
                ) {
                    ShcareMobileTheme(
                        mode = ShcareThemeMode.Light,
                        useDynamicColor = false,
                    ) {
                        ShcareScaffold(
                            items = items,
                            selectedRoute = ShcareMobileRoute.PatientDashboard,
                            onDestinationSelected = {},
                            modifier = Modifier.fillMaxSize(),
                        ) { contentModifier ->
                            ShcareListDetailScaffold(
                                state = state,
                                modifier = contentModifier,
                                listPane = { paneModifier ->
                                    Box(
                                        modifier = paneModifier
                                            .testTag("test.list"),
                                    ) {
                                        Text("List")
                                    }
                                },
                                detailPane = { paneModifier, presentation ->
                                    Box(
                                        modifier = paneModifier.testTag(
                                            when (presentation) {
                                                ShcareDetailPanePresentation.FullScreen ->
                                                    "test.detail.full-screen"
                                                ShcareDetailPanePresentation.SideBySide ->
                                                    "test.detail.side-by-side"
                                            },
                                        ),
                                    ) {
                                        Text("Detail")
                                    }
                                },
                                emptyDetailPane = { paneModifier ->
                                    Box(modifier = paneModifier) {
                                        Text("Choose an item")
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }

    private fun setScaffold(
        widthDp: Int,
        fontScale: Float,
        themeMode: ShcareThemeMode,
        accessContext: MobileRouteAccessContext,
        selectedRoute: ShcareMobileRoute,
        onDestinationSelected: (ShcarePrimaryDestination) -> Unit,
    ) {
        val items = ShcarePrimaryNavigationContract
            .destinationsFor(
                context = accessContext,
                expectedAuthorityEpoch = accessContext.authorityEpoch,
            )
            .map(ShcarePrimaryDestination::toShcareNavigationItem)

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val hostWidthPixels = with(hostDensity) { maxWidth.toPx() }
                val simulatedDensity = hostWidthPixels / widthDp.toFloat()
                CompositionLocalProvider(
                    LocalDensity provides Density(
                        density = simulatedDensity,
                        fontScale = fontScale,
                    ),
                ) {
                    ShcareMobileTheme(mode = themeMode) {
                        ShcareScaffold(
                            items = items,
                            selectedRoute = selectedRoute,
                            onDestinationSelected = onDestinationSelected,
                            modifier = Modifier.fillMaxSize(),
                        ) { contentModifier ->
                            Box(
                                modifier = contentModifier
                                    .testTag("shcare.scaffold.content"),
                            )
                        }
                    }
                }
            }
        }
    }

    private fun patientContext() = MobileRouteAccessContext(
        userId = "patient-1",
        workspaceId = "workspace-1",
        role = "patient",
        capabilities = setOf(
            "personal.dashboard.view",
            "personal.scans.manage",
        ),
        experience = MobileExperience.Patient,
        authorityEpoch = 4L,
    )

    private fun clinicalContext() = MobileRouteAccessContext(
        userId = "doctor-1",
        workspaceId = "workspace-1",
        role = "doctor",
        capabilities = setOf(
            "workspace.dashboard.view",
            "workspace.patients.view",
            "workspace.alerts.view",
        ),
        experience = MobileExperience.Clinical,
        authorityEpoch = 5L,
    )
}
