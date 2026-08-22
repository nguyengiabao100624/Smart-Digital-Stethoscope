package com.example.smart_health_android.clinical.patients

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.espresso.Espresso.pressBack
import com.example.smart_health_android.data.ClinicalPatientList
import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.Patient
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import java.io.IOException
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ClinicalPatientsScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun patientListAndCompactDetailRemainUsableAtTwoHundredPercentFontScale() {
        val viewModel = ClinicalPatientsViewModel(
            repository = StaticClinicalPatientsRepository(
                Result.success(patientList()),
            ),
            expectedWorkspaceId = "workspace-1",
        )

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val hostWidthPixels = with(hostDensity) { maxWidth.toPx() }
                CompositionLocalProvider(
                    LocalDensity provides Density(
                        density = hostWidthPixels / 840f,
                        fontScale = 2f,
                    ),
                ) {
                    ShcareMobileTheme(
                        mode = ShcareThemeMode.Dark,
                        useDynamicColor = false,
                    ) {
                        ClinicalPatientsScreen(
                            expectedWorkspaceId = "workspace-1",
                            onOpenWorkspaceSwitcher = {},
                            providedViewModel = viewModel,
                        )
                    }
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == ClinicalPatientsLoadState.Content
        }
        composeRule.onNodeWithText("Bệnh nhân").assertIsDisplayed()
        composeRule.onNodeWithText("Nguyễn An").assertIsDisplayed().performClick()
        composeRule.onNodeWithTag("shcare.list-detail.list").assertDoesNotExist()
        composeRule.onNodeWithTag("shcare.list-detail.single-detail").assertIsDisplayed()
        composeRule.onNodeWithTag("clinical-patients-detail").assertIsDisplayed()
        composeRule.onNodeWithText("Quay lại danh sách")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun expandedEightHundredFortyDpUsesReusableSelectedDetailPane() {
        val viewModel = ClinicalPatientsViewModel(
            repository = StaticClinicalPatientsRepository(
                Result.success(patientList()),
            ),
            expectedWorkspaceId = "workspace-1",
        )

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val hostWidthPixels = with(hostDensity) { maxWidth.toPx() }
                CompositionLocalProvider(
                    LocalDensity provides Density(
                        density = hostWidthPixels / 840f,
                        fontScale = 1f,
                    ),
                ) {
                    ShcareMobileTheme(
                        mode = ShcareThemeMode.Light,
                        useDynamicColor = false,
                    ) {
                        ClinicalPatientsScreen(
                            expectedWorkspaceId = "workspace-1",
                            onOpenWorkspaceSwitcher = {},
                            providedViewModel = viewModel,
                        )
                    }
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == ClinicalPatientsLoadState.Content
        }
        composeRule.onNodeWithTag("shcare.list-detail.list").assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.detail").assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.empty-detail").assertDoesNotExist()
        composeRule.onNodeWithTag("clinical-patients-detail").assertIsDisplayed()
        composeRule.onNodeWithTag("clinical-patient-patient-1").assertIsSelected()
    }

    @Test
    fun noSelectionToDetailAndSystemBackReturnsToSelectedList() {
        composeRule.setContent {
            val hostDensity = LocalDensity.current
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val hostWidthPixels = with(hostDensity) { maxWidth.toPx() }
                CompositionLocalProvider(
                    LocalDensity provides Density(
                        density = hostWidthPixels / 840f,
                        fontScale = 2f,
                    ),
                ) {
                    var state by remember {
                        mutableStateOf(
                            ClinicalPatientsUiState(
                                loadState = ClinicalPatientsLoadState.Content,
                                patients = patientList().patients,
                                hasLoaded = true,
                            ),
                        )
                    }
                    ShcareMobileTheme(
                        mode = ShcareThemeMode.Light,
                        useDynamicColor = false,
                    ) {
                        ClinicalPatientsContent(
                            state = state,
                            onAction = { action ->
                                state = when (action) {
                                    is ClinicalPatientsUiAction.SelectPatient -> state.copy(
                                        selectedPatientId = action.patientId,
                                        compactDetailVisible = true,
                                    )
                                    ClinicalPatientsUiAction.CloseDetail -> state.copy(
                                        compactDetailVisible = false,
                                    )
                                    else -> state
                                }
                            },
                            onOpenWorkspaceSwitcher = {},
                        )
                    }
                }
            }
        }

        composeRule.onNodeWithTag("shcare.list-detail.list").assertIsDisplayed()
        composeRule.onNodeWithTag("clinical-patient-patient-1")
            .assertIsNotSelected()
            .performClick()

        composeRule.onNodeWithTag("shcare.list-detail.single-detail").assertIsDisplayed()
        pressBack()

        composeRule.onNodeWithTag("shcare.list-detail.list").assertIsDisplayed()
        composeRule.onNodeWithTag("shcare.list-detail.single-detail").assertDoesNotExist()
        composeRule.onNodeWithTag("clinical-patient-patient-1").assertIsSelected()
    }

    @Test
    fun offlinePatientListExposesAnExplicitFortyEightDpRetryAction() {
        val viewModel = ClinicalPatientsViewModel(
            repository = StaticClinicalPatientsRepository(
                Result.failure(IOException("offline")),
            ),
            expectedWorkspaceId = "workspace-1",
        )

        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                ClinicalPatientsScreen(
                    expectedWorkspaceId = "workspace-1",
                    onOpenWorkspaceSwitcher = {},
                    providedViewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == ClinicalPatientsLoadState.Offline
        }
        composeRule.onNodeWithText("Thử lại")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }
}

private class StaticClinicalPatientsRepository(
    private val result: Result<ClinicalPatientList>,
) : ClinicalPatientsRepository {
    override suspend fun load(
        query: String,
        expectedWorkspaceId: String,
    ): ClinicalPatientList = result.getOrThrow()
}

private fun patientList() = ClinicalPatientList(
    workspaceId = "workspace-1",
    patients = listOf(
        Patient(
            id = "patient-1",
            patientCode = "BN-001",
            name = "Nguyễn An",
            dateOfBirth = "1980-05-12",
            gender = "male",
            phone = "0901234567",
            bloodType = "O+",
            allergies = listOf("Penicillin"),
            emergencyContact = EmergencyContact(
                name = "Nguyễn Bình",
                phone = "0907654321",
                relationship = "Người thân",
            ),
            scanCount = 4,
            lastScanAt = "2026-07-27T08:30:00.000Z",
            lastAiLabel = "captured",
        ),
    ),
)
