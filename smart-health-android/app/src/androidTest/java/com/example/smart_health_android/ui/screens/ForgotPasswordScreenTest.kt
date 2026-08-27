package com.example.smart_health_android.ui.screens

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.security.ForgotPasswordAuthoritySnapshot
import com.example.smart_health_android.security.ForgotPasswordRepository
import com.example.smart_health_android.security.ForgotPasswordResetReceipt
import com.example.smart_health_android.security.ForgotPasswordViewModel
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ForgotPasswordScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun invalidEmailIsFieldAssociatedAndDoesNotDispatch() {
        val repository = ComposeForgotPasswordRepository()
        val viewModel = ForgotPasswordViewModel(repository)
        setContent(viewModel)

        composeRule.onNodeWithTag("forgot-password.email").performTextInput("invalid")
        composeRule.onNodeWithTag("forgot-password.submit").performClick()

        composeRule.onNodeWithText("Địa chỉ email không hợp lệ.").assertIsDisplayed()
        composeRule.onNodeWithTag("forgot-password.email").assertIsEnabled()
        assertEquals(0, repository.calls)
    }

    @Test
    fun pendingRequestDisablesBothFieldAndFortyEightDpPrimaryAction() {
        val gate = CompletableDeferred<Unit>()
        val repository = ComposeForgotPasswordRepository(
            gate = gate,
        )
        val viewModel = ForgotPasswordViewModel(repository)
        setContent(viewModel)

        composeRule.onNodeWithTag("forgot-password.email")
            .performTextInput("patient@example.com")
        composeRule.onNodeWithTag("forgot-password.submit").performClick()

        composeRule.waitUntil(timeoutMillis = 5_000L) { repository.calls == 1 }
        composeRule.onNodeWithTag("forgot-password.email").assertIsNotEnabled()
        composeRule.onNodeWithText("Đang gửi…").assertIsDisplayed()
        composeRule.onNodeWithTag("forgot-password.submit")
            .assertIsNotEnabled()
            .assertHeightIsAtLeast(48.dp)
        gate.complete(Unit)
    }

    private fun setContent(viewModel: ForgotPasswordViewModel) {
        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                ForgotPasswordScreen(
                    onNavigateToLogin = {},
                    providedViewModel = viewModel,
                )
            }
        }
    }
}

private class ComposeForgotPasswordRepository(
    private val gate: CompletableDeferred<Unit>? = null,
) : ForgotPasswordRepository {
    private val authority = ForgotPasswordAuthoritySnapshot(
        firebaseOwner = null,
        backendSessionEpoch = 0L,
    )
    var calls = 0

    override fun captureAuthority(): ForgotPasswordAuthoritySnapshot = authority

    override fun isCurrentAuthority(expected: ForgotPasswordAuthoritySnapshot): Boolean =
        expected == authority

    override suspend fun requestPasswordReset(
        email: String,
        expectedAuthority: ForgotPasswordAuthoritySnapshot,
    ): ForgotPasswordResetReceipt {
        calls += 1
        gate?.await()
        return ForgotPasswordResetReceipt(email, expectedAuthority)
    }
}
