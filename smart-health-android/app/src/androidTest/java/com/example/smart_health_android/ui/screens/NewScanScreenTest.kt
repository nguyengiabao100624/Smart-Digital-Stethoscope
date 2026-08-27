package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.data.SmartDevice
import com.example.smart_health_android.scan.NewScanLoadState
import com.example.smart_health_android.scan.NewScanReadinessCheck
import com.example.smart_health_android.scan.NewScanType
import com.example.smart_health_android.scan.NewScanUiAction
import com.example.smart_health_android.scan.NewScanUiState
import com.example.smart_health_android.scan.ScanBodySite
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NewScanScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun offlineDeviceCannotBeSelectedOrUsedToStart() {
        composeRule.setContent {
            ShcareMobileTheme(mode = ShcareThemeMode.Light, useDynamicColor = false) {
                NewScanContent(
                    state = contentState(
                        devices = listOf(device("offline", online = false)),
                        selectedDeviceId = "",
                    ),
                    onAction = {},
                    onNavigateBack = {},
                    showBackNavigation = true,
                )
            }
        }

        composeRule.onNodeWithTag("new_scan.device.offline")
            .performScrollTo()
            .assertIsDisplayed()
            .assertIsNotEnabled()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("new_scan.start")
            .assertIsDisplayed()
            .assertIsNotEnabled()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun bodySiteReadinessAndStartExposeNativeActionsWithAccessibleTargets() {
        val actions = mutableListOf<NewScanUiAction>()
        composeRule.setContent {
            ShcareMobileTheme(mode = ShcareThemeMode.Light, useDynamicColor = false) {
                NewScanContent(
                    state = contentState(
                        devices = listOf(device("online", online = true)),
                        selectedDeviceId = "online",
                        selectedBodySite = ScanBodySite.Mitral,
                        readiness = NewScanReadinessCheck.entries.toSet(),
                    ),
                    onAction = { actions += it },
                    onNavigateBack = {},
                    showBackNavigation = true,
                )
            }
        }

        composeRule.onNodeWithTag("new_scan.content")
            .performScrollToNode(hasTestTag("new_scan.body_site.mitral"))
        composeRule.onNodeWithTag("new_scan.body_site.mitral")
            .assertIsDisplayed()
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithTag("new_scan.content")
            .performScrollToNode(hasTestTag("new_scan.readiness.patientready"))
        composeRule.onNodeWithTag("new_scan.readiness.patientready")
            .assertIsDisplayed()
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeRule.onNodeWithTag("new_scan.start")
            .assertIsEnabled()
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
            .performClick()

        composeRule.runOnIdle {
            assertTrue(actions.contains(NewScanUiAction.BodySiteSelected(ScanBodySite.Mitral)))
            assertTrue(
                actions.contains(
                    NewScanUiAction.ReadinessToggled(NewScanReadinessCheck.PatientReady),
                ),
            )
            assertTrue(actions.contains(NewScanUiAction.Submit))
        }
    }

    @Test
    fun guideRemainsReadableInDarkThemeAtTwoHundredPercentFontScale() {
        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(mode = ShcareThemeMode.Dark, useDynamicColor = false) {
                    NewScanContent(
                        state = contentState(
                            devices = listOf(device("online", online = true)),
                            selectedDeviceId = "online",
                        ),
                        onAction = {},
                        onNavigateBack = {},
                        showBackNavigation = true,
                    )
                }
            }
        }

        composeRule.onNodeWithTag("new_scan.screen").assertIsDisplayed()
        composeRule.onNodeWithTag("new_scan.title").assertIsDisplayed()
        composeRule.onNodeWithTag("new_scan.content")
            .performScrollToNode(hasTestTag("new_scan.body_site.mitral"))
        composeRule.onNodeWithTag("new_scan.body_site.mitral")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("new_scan.guide.mitral", useUnmergedTree = true)
            .performScrollTo()
            .assertIsDisplayed()
    }

    private fun contentState(
        devices: List<SmartDevice>,
        selectedDeviceId: String,
        selectedBodySite: ScanBodySite? = null,
        readiness: Set<NewScanReadinessCheck> = emptySet(),
    ) = NewScanUiState(
        loadState = NewScanLoadState.Content,
        profiles = listOf(
            Patient(
                id = "patient-1",
                patientCode = "BN-001",
                name = "Nguyễn An",
            ),
        ),
        selectedProfileId = "patient-1",
        devices = devices,
        selectedDeviceId = selectedDeviceId,
        scanType = NewScanType.Heart,
        selectedBodySite = selectedBodySite,
        readiness = readiness,
    )

    private fun device(id: String, online: Boolean) = SmartDevice(
        id = id,
        name = "Shcare One",
        type = "stethoscope",
        online = online,
    )
}
