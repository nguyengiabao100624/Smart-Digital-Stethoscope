package com.example.smart_health_android.ui.screens

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ShcareStartupContentTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun loadingUsesShcareBrandAndSemanticStatusInLightTheme() {
        composeRule.setContent {
            ShcareMobileTheme(mode = ShcareThemeMode.Light) {
                ShcareStartupContent(
                    isChecking = true,
                    errorMessage = null,
                    onRetry = {},
                )
            }
        }

        composeRule.onNodeWithTag("splash.brand").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Biểu trưng Shcare")
            .assertIsDisplayed()
            .assertContentDescriptionEquals("Biểu trưng Shcare")
        composeRule.onNodeWithText("Shcare").assertIsDisplayed()
        composeRule.onNodeWithTag("splash.brand.heading")
            .assert(
                SemanticsMatcher("brand name is a heading") { node ->
                    node.config.contains(SemanticsProperties.Heading)
                },
            )
        composeRule.onNodeWithText("Smart Health Care").assertIsDisplayed()
        composeRule.onNodeWithText("Theo dõi tim phổi từ xa").assertIsDisplayed()
        composeRule.onNodeWithText("SmartHealth").assertDoesNotExist()
        composeRule.onNodeWithText("Ống nghe điện tử thông minh").assertDoesNotExist()
        composeRule.onNodeWithTag("splash.loading")
            .assertTextContains("Đang kết nối an toàn", substring = true)
            .assert(
                SemanticsMatcher("loading state has an accessible description") { node ->
                    node.config
                        .getOrElse(SemanticsProperties.StateDescription) { "" }
                        .contains("Đang kết nối an toàn")
                },
            )
        composeRule.onNodeWithTag("splash.retry").assertDoesNotExist()
    }

    @Test
    fun serverFailureAnnouncesMessageAndExposesFortyEightDpRetryAtLargeFontScale() {
        var retryCount = 0
        val errorMessage = "Máy chủ chưa phản hồi đúng. Vui lòng thử lại sau."

        composeRule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(density.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(mode = ShcareThemeMode.Dark) {
                    ShcareStartupContent(
                        isChecking = false,
                        errorMessage = errorMessage,
                        onRetry = { retryCount += 1 },
                    )
                }
            }
        }

        composeRule.onNodeWithTag("splash.error")
            .assertIsDisplayed()
            .assertTextContains(errorMessage, substring = true)
            .assert(
                SemanticsMatcher("error state announces the exact backend failure") { node ->
                    node.config
                        .getOrElse(SemanticsProperties.StateDescription) { "" }
                        .contains(errorMessage)
                },
            )
        composeRule.onNodeWithTag("splash.error.heading", useUnmergedTree = true)
            .assert(
                SemanticsMatcher("error title is a heading") { node ->
                    node.config.contains(SemanticsProperties.Heading)
                },
            )
        composeRule.onNodeWithTag("splash.retry")
            .assertIsDisplayed()
            .assertHasClickAction()
            .assertHeightIsAtLeast(48.dp)
            .performClick()

        composeRule.runOnIdle {
            assertEquals(1, retryCount)
        }
    }
}
