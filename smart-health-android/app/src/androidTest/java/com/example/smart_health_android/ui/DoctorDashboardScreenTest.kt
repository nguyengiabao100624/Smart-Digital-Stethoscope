package com.example.smart_health_android.ui

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.BackendStatus
import com.example.smart_health_android.data.PatientSnapshot
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.doctor.DoctorDashboardLoadState
import com.example.smart_health_android.doctor.DoctorDashboardUiAction
import com.example.smart_health_android.doctor.DoctorDashboardUiState
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.screens.DoctorDashboardContent
import com.example.smart_health_android.ui.screens.DoctorDashboardQuickActions
import com.example.smart_health_android.ui.screens.resolveDoctorDashboardQuickActionColumns
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DoctorDashboardScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun doctorDashboardActionsRemainReadableAtTwoHundredPercentFontScale() {
        renderQuickActions(widthDp = 412f, fontScale = 2f)

        listOf(
            "doctor-dashboard.action.scan",
            "doctor-dashboard.action.records",
            "doctor-dashboard.action.assistant",
            "doctor-dashboard.action.new-scan",
            "doctor-dashboard.action.appointments",
        ).forEach { tag ->
            composeRule.onNodeWithTag(tag, useUnmergedTree = true)
                .assertIsDisplayed()
                .assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun doctorDashboardUsesThreeCompactQuickActionsPerRowOnPhone() {
        renderQuickActions(widthDp = 412f, fontScale = 1f)

        listOf(
            "doctor-dashboard.action.scan",
            "doctor-dashboard.action.records",
            "doctor-dashboard.action.assistant",
            "doctor-dashboard.action.new-scan",
            "doctor-dashboard.action.appointments",
        ).forEach { tag ->
            composeRule.onNodeWithTag(tag, useUnmergedTree = true)
                .assertIsDisplayed()
                .assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun refreshAndDeviceActionsDispatchExactlyOnce() {
        val actions = mutableListOf<DoctorDashboardUiAction>()
        var deviceClicks = 0
        render(
            widthDp = 840f,
            fontScale = 1f,
            onAction = actions::add,
            onNavigateToDeviceManagement = { deviceClicks += 1 },
        )

        composeRule.onNodeWithTag("doctor-dashboard.action.refresh").performClick()
        composeRule.onNodeWithTag("doctor-dashboard.device").performClick()
        composeRule.runOnIdle {
            assertEquals(listOf(DoctorDashboardUiAction.Refresh), actions)
            assertEquals(1, deviceClicks)
        }
    }

    private fun render(
        widthDp: Float,
        fontScale: Float,
        onAction: (DoctorDashboardUiAction) -> Unit = {},
        onNavigateToDeviceManagement: () -> Unit = {},
    ) {
        composeRule.setContent {
            val hostDensity = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val hostWidthPixels = with(hostDensity) { maxWidth.toPx() }
                CompositionLocalProvider(
                    LocalDensity provides Density(
                        density = hostWidthPixels / widthDp,
                        fontScale = fontScale,
                    ),
                ) {
                    ShcareMobileTheme(
                        mode = ShcareThemeMode.Light,
                        useDynamicColor = false,
                    ) {
                        DoctorDashboardContent(
                            state = dashboardState(),
                            snackbarHostState = SnackbarHostState(),
                            onAction = onAction,
                            onNavigateToMonitoring = {},
                            onNavigateToRecords = {},
                            onNavigateToAssistant = {},
                            onNavigateToNewScan = {},
                            onNavigateToNotifications = {},
                            onNavigateToDeviceManagement = onNavigateToDeviceManagement,
                            onNavigateToAppointments = {},
                            onNavigateToRecordDetail = {},
                        )
                    }
                }
            }
        }
    }

    private fun renderQuickActions(widthDp: Float, fontScale: Float) {
        composeRule.setContent {
            val hostDensity = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val hostWidthPixels = with(hostDensity) { maxWidth.toPx() }
                CompositionLocalProvider(
                    LocalDensity provides Density(
                        density = hostWidthPixels / widthDp,
                        fontScale = fontScale,
                    ),
                ) {
                    ShcareMobileTheme(
                        mode = ShcareThemeMode.Dark,
                        useDynamicColor = false,
                    ) {
                        DoctorDashboardQuickActions(
                            columns = resolveDoctorDashboardQuickActionColumns(
                                widthDp = widthDp,
                                fontScale = fontScale,
                            ),
                            canViewAppointments = true,
                            onNavigateToMonitoring = {},
                            onNavigateToRecords = {},
                            onNavigateToAssistant = {},
                            onNavigateToNewScan = {},
                            onNavigateToAppointments = {},
                        )
                    }
                }
            }
        }
    }

    private fun dashboardState() = DoctorDashboardUiState(
        loadState = DoctorDashboardLoadState.Content,
        displayName = "Bác sĩ Minh",
        workspaceName = "Phòng khám CarePlus",
        workspaceMeta = "Bác sĩ",
        canViewAppointments = true,
        backendStatus = BackendStatus(
            espCount = 1,
            sampleRate = 16_000,
            udpPort = 4_212,
        ),
        scans = listOf(
            Scan(
                id = "scan-1",
                patientId = "patient-1",
                patient = PatientSnapshot(
                    id = "patient-1",
                    patientCode = "BN-001",
                    name = "Nguyễn An",
                ),
                status = "completed",
                mode = "heart",
                createdAt = "2026-09-01T08:00:00Z",
                aiSummary = "Nhịp tim ổn định",
            ),
        ),
    )
}
