package com.example.smart_health_android.ui.screens

import android.os.Build
import android.view.WindowManager
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.ShareTargetDoctor
import com.example.smart_health_android.data.ShareTargetWorkspace
import com.example.smart_health_android.data.ShareTargets
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MedicalRecordsScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<DevicePairingComposeTestActivity>()

    @Before
    fun preparePhysicalDeviceUi() {
        composeRule.activity.runOnUiThread {
            composeRule.activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                composeRule.activity.setShowWhenLocked(true)
                composeRule.activity.setTurnScreenOn(true)
            } else {
                @Suppress("DEPRECATION")
                composeRule.activity.window.addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
                )
            }
        }
    }

    @Test
    fun shareTargetPickerStartsCompactAndExpandsAtTwoHundredPercentFontScale() {
        composeRule.setContent {
            val hostDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(hostDensity.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(
                    mode = ShcareThemeMode.Dark,
                    useDynamicColor = false,
                ) {
                    ShareTargetPicker(
                        query = "",
                        onQueryChange = {},
                        targets = ShareTargets(
                            doctors = listOf(
                                ShareTargetDoctor(id = "doctor-1", name = "Bác sĩ Minh"),
                            ),
                            workspaces = listOf(
                                ShareTargetWorkspace(id = "workspace-1", name = "Phòng khám CarePlus"),
                            ),
                        ),
                        selectedDoctor = null,
                        selectedWorkspace = null,
                        loading = false,
                        onSelectDoctor = {},
                        onSelectWorkspace = {},
                        onRetry = {},
                        modifier = Modifier.padding(16.dp),
                    )
                }
            }
        }

        composeRule.onNodeWithTag("medical_records.share_target")
            .assertIsDisplayed()
        composeRule.onNodeWithTag("medical_records.share_target.toggle")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("medical_records.share_target.query")
            .assertDoesNotExist()

        composeRule.onNodeWithTag("medical_records.share_target.toggle")
            .performClick()
        composeRule.onNodeWithTag("medical_records.share_target.query")
            .assertIsDisplayed()
    }
}
