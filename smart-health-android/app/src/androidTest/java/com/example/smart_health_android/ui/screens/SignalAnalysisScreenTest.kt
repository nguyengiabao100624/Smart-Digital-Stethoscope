package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.ai.SignalAnalysisLoadState
import com.example.smart_health_android.ai.SignalAnalysisRepository
import com.example.smart_health_android.ai.SignalAnalysisViewModel
import com.example.smart_health_android.data.SignalAnalysisChatRuntime
import com.example.smart_health_android.data.SignalAnalysisRuntime
import com.example.smart_health_android.data.SignalAnalysisScanRuntime
import com.example.smart_health_android.data.SignalAnalysisSettings
import com.example.smart_health_android.data.SignalAnalysisStatus
import com.example.smart_health_android.data.SignalAnalysisUpdateRuntime
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SignalAnalysisScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun truthfulStatusRemainsReadableInDarkThemeAtTwoHundredPercentFontScale() {
        val viewModel = SignalAnalysisViewModel(StaticSignalAnalysisRepository)

        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(mode = ShcareThemeMode.Dark) {
                    AICalibrationScreen(
                        onNavigateBack = {},
                        viewModel = viewModel,
                    )
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == SignalAnalysisLoadState.Ready
        }

        composeRule.onNodeWithTag("signal_analysis.ready").assertIsDisplayed()
        composeRule.onNodeWithTag("signal_analysis.row.analyzer")
            .assertTextContains("Bộ quy tắc chất lượng tín hiệu v1")
        composeRule.onNodeWithTag("signal_analysis.row.clinical")
            .assertTextContains("Không hỗ trợ")
        composeRule.onNodeWithTag("signal_analysis.row.update")
            .assertTextContains("Không được hỗ trợ")
        composeRule.onAllNodesWithText("Cập nhật mô hình mới").assertCountEquals(0)
        composeRule.onAllNodesWithText("Cân bằng").assertCountEquals(0)
    }

    private object StaticSignalAnalysisRepository : SignalAnalysisRepository {
        override suspend fun loadStatus(): SignalAnalysisStatus = SignalAnalysisStatus(
            settings = SignalAnalysisSettings(
                analysisKind = "signal_quality",
                version = "signal_quality_rules_v1",
                analyzerVersion = "signal_quality_rules_v1",
                status = "local_signal_quality_only",
                updateSupported = false,
                clinicalDecisionSupport = false,
                accuracyMetricsAvailable = false,
                lastUpdateStatus = "unavailable",
            ),
            runtime = SignalAnalysisRuntime(
                scanAnalysis = SignalAnalysisScanRuntime(
                    available = true,
                    analysisKind = "signal_quality",
                    analyzerVersion = "signal_quality_rules_v1",
                    clinicalDecisionSupport = false,
                ),
                chatProvider = SignalAnalysisChatRuntime(
                    available = false,
                    status = "unavailable",
                    reason = "not_configured",
                ),
                modelUpdate = SignalAnalysisUpdateRuntime(
                    available = false,
                    reason = "not_supported",
                ),
            ),
        )
    }
}
