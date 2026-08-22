package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.PatientSnapshot
import com.example.smart_health_android.data.Scan
import com.example.smart_health_android.data.ScanWaveform
import com.example.smart_health_android.records.RecordDetailLoadState
import com.example.smart_health_android.records.RecordDetailUiState
import com.example.smart_health_android.records.RecordPlaybackState
import com.example.smart_health_android.records.RecordWaveformLoadState
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecordDetailScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun permissionStateIsReadableAtTwoHundredPercentFontScale() {
        composeRule.setContent {
            val hostDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(hostDensity.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(
                    mode = ShcareThemeMode.Dark,
                    useDynamicColor = false,
                ) {
                    RecordDetailContent(
                        state = RecordDetailUiState(
                            loadState = RecordDetailLoadState.PermissionDenied,
                        ),
                        playbackState = RecordPlaybackState(),
                        onNavigateBack = {},
                        onAction = {},
                        onTogglePlayback = {},
                        onSeekBy = {},
                    )
                }
            }
        }

        composeRule.onNodeWithText("Không có quyền xem lượt đo").assertIsDisplayed()
        composeRule.onNodeWithText("Quay lại")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun readyStateUsesRealWaveformSemanticsAndFortyEightDpAudioActions() {
        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                RecordDetailContent(
                    state = readyState(),
                    playbackState = RecordPlaybackState(),
                    onNavigateBack = {},
                    onAction = {},
                    onTogglePlayback = {},
                    onSeekBy = {},
                )
            }
        }

        composeRule.onNodeWithText("Nguyễn An").assertIsDisplayed()
        composeRule.onNodeWithContentDescription(
            "Dạng sóng gồm 3 điểm, biên độ đỉnh 50 phần trăm, " +
                "biên độ trung bình 26 phần trăm, tần số lấy mẫu 16000 héc.",
        ).performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Phát bản ghi")
            .performScrollTo()
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithText("Lưu bản ghi")
            .performScrollTo()
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithText("Chia sẻ bản ghi")
            .performScrollTo()
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun viewOnlyRecordingNeverShowsStopMutation() {
        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                RecordDetailContent(
                    state = readyState().copy(
                        scan = completedScan().copy(status = "recording"),
                        canManageScan = false,
                        waveformLoadState = RecordWaveformLoadState.Unavailable,
                        waveform = null,
                    ),
                    playbackState = RecordPlaybackState(),
                    onNavigateBack = {},
                    onAction = {},
                    onTogglePlayback = {},
                    onSeekBy = {},
                )
            }
        }

        composeRule.onNodeWithText("Dừng ghi và lưu").assertDoesNotExist()
    }

    private fun readyState() = RecordDetailUiState(
        loadState = RecordDetailLoadState.Ready,
        scan = completedScan(),
        waveformLoadState = RecordWaveformLoadState.Ready,
        waveform = ScanWaveform(
            scanId = "scan_1",
            sampleRate = 16_000,
            points = listOf(0.1f, 0.5f, 0.2f),
            generatedAt = "2026-07-27T00:00:00.000Z",
        ),
        canManageScan = true,
    )

    private fun completedScan() = Scan(
        id = "scan_1",
        patientId = "patient_1",
        patient = PatientSnapshot(
            id = "patient_1",
            patientCode = "BN-001",
            name = "Nguyễn An",
        ),
        status = "completed",
        mode = "heart",
        deviceId = "shcare-device-1",
        durationSeconds = 62.0,
        sampleRate = 16_000,
        sampleCount = 32_000,
        rms = 120,
        levelPercent = 82,
        aiLabel = "captured",
        aiConfidence = 0.91,
        aiSummary = "Tín hiệu đủ điều kiện để bác sĩ xem lại.",
        audioUrl = "/api/scans/scan_1/audio",
        startedAt = "2026-07-27T08:30:00.000Z",
    )
}
