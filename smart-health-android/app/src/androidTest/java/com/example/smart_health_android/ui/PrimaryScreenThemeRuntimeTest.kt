package com.example.smart_health_android.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.screens.FilterTab
import com.example.smart_health_android.ui.screens.SettingsGroup
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import com.example.smart_health_android.ui.theme.ShcareTheme
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PrimaryScreenThemeRuntimeTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun lightThemeResolvesNativeSurfaceAndBrandHeaderRoles() {
        val observed = AtomicReference<ThemeSnapshot>()

        composeRule.setContent {
            ShcareMobileTheme(mode = ShcareThemeMode.Light, useDynamicColor = false) {
                val snapshot = ThemeSnapshot(
                    background = MaterialTheme.colorScheme.background,
                    surface = MaterialTheme.colorScheme.surface,
                    onSurface = MaterialTheme.colorScheme.onSurface,
                    brandHeaderStart = ShcareTheme.colors.brandHeaderStart,
                    onBrandHeader = ShcareTheme.colors.onBrandHeader,
                )
                SideEffect { observed.set(snapshot) }
                ThemeContractContent()
            }
        }

        composeRule.onNodeWithText("TÀI KHOẢN").assertIsDisplayed()
        composeRule.onNodeWithText("Gần đây").assertIsDisplayed()
        composeRule.runOnIdle {
            assertEquals(Color(0xFFF5F7FA), observed.get().background)
            assertEquals(Color.White, observed.get().surface)
            assertEquals(Color(0xFF1A202C), observed.get().onSurface)
            assertEquals(Color(0xFF0B5C9A), observed.get().brandHeaderStart)
            assertEquals(Color.White, observed.get().onBrandHeader)
        }
    }

    @Test
    fun darkThemeResolvesDistinctNativeSurfaceAndBrandHeaderRoles() {
        val observed = AtomicReference<ThemeSnapshot>()

        composeRule.setContent {
            ShcareMobileTheme(mode = ShcareThemeMode.Dark, useDynamicColor = false) {
                val snapshot = ThemeSnapshot(
                    background = MaterialTheme.colorScheme.background,
                    surface = MaterialTheme.colorScheme.surface,
                    onSurface = MaterialTheme.colorScheme.onSurface,
                    brandHeaderStart = ShcareTheme.colors.brandHeaderStart,
                    onBrandHeader = ShcareTheme.colors.onBrandHeader,
                )
                SideEffect { observed.set(snapshot) }
                ThemeContractContent()
            }
        }

        composeRule.onNodeWithText("TÀI KHOẢN").assertIsDisplayed()
        composeRule.onNodeWithText("Gần đây").assertIsDisplayed()
        composeRule.runOnIdle {
            assertEquals(Color(0xFF0F1419), observed.get().background)
            assertEquals(Color(0xFF1A202C), observed.get().surface)
            assertEquals(Color(0xFFE2E8F0), observed.get().onSurface)
            assertEquals(Color(0xFF0EA5E9), observed.get().brandHeaderStart)
            assertEquals(Color.White, observed.get().onBrandHeader)
        }
    }

    private data class ThemeSnapshot(
        val background: Color,
        val surface: Color,
        val onSurface: Color,
        val brandHeaderStart: Color,
        val onBrandHeader: Color,
    )
}

@androidx.compose.runtime.Composable
private fun ThemeContractContent() {
    Column {
        SettingsGroup("TÀI KHOẢN") {
            Text("Nội dung")
        }
        FilterTab(
            text = "Gần đây",
            icon = null,
            isSelected = true,
            onClick = {},
        )
    }
}
