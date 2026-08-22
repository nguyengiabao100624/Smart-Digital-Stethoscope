package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthRecoveryUiContractTest {
    private val forgotPassword = source("ui/screens/ForgotPasswordScreen.kt")
    private val forgotPasswordViewModel = source("security/ForgotPasswordViewModel.kt")
    private val changePassword = source("ui/screens/ChangePasswordScreen.kt")
    private val signUp = source("ui/screens/SignUpScreen.kt")
    private val signUpViewModel = source("security/SignUpViewModel.kt")
    private val phase2Strings =
        projectFile("src/main/res/values/phase2_foundation_strings.xml").readText()
    private val contactVerification = source("ui/screens/ContactVerificationScreens.kt")
    private val doctorApproval = source("ui/screens/DoctorApprovalPendingScreen.kt")
    private val privacy = source("ui/screens/PrivacyScreen.kt")
    private val settingsHeader = source("ui/components/ShcareSettingsHeader.kt")
    private val appNavGraph = source("navigation/AppNavGraph.kt")

    @Test
    fun recoveryAndSecurityScreensUseNativeSemanticThemeRoles() {
        listOf(forgotPassword, changePassword).forEach { screen ->
            assertTrue(screen.contains("MaterialTheme.colorScheme"))
            assertFalse(screen.contains("Color.White"))
            assertFalse(screen.contains("Color(0x"))
            assertFalse(screen.contains("import com.example.smart_health_android.ui.theme.*"))
        }

        assertTrue(settingsHeader.contains("MaterialTheme.colorScheme.surface"))
        assertTrue(settingsHeader.contains("MaterialTheme.colorScheme.outlineVariant"))
        assertTrue(settingsHeader.contains("Icons.AutoMirrored.Filled.ArrowBack"))
        assertTrue(settingsHeader.contains("defaultMinSize(minHeight = 56.dp)"))
        assertTrue(settingsHeader.contains("heading()"))
    }

    @Test
    fun forgotPasswordKeepsThePrimaryActionReachableAndDoesNotForceNavigation() {
        assertTrue(forgotPassword.contains("LazyColumn("))
        assertTrue(forgotPassword.contains(".imePadding()"))
        assertTrue(forgotPassword.contains(".navigationBarsPadding()"))
        assertTrue(forgotPassword.contains("collectAsStateWithLifecycle"))
        assertTrue(forgotPassword.contains("repeatOnLifecycle"))
        assertTrue(forgotPassword.contains("ForgotPasswordUiAction"))
        assertTrue(forgotPassword.contains("isError = state.emailError != null"))
        assertTrue(forgotPassword.contains("forgot_password_sending"))
        assertTrue(forgotPassword.contains("LiveRegionMode.Assertive"))
        assertFalse(forgotPassword.contains("delay(3000)"))
        assertFalse(forgotPassword.contains("FirebaseAuthService"))
        assertFalse(forgotPassword.contains("rememberCoroutineScope"))
        assertFalse(forgotPassword.contains("mutableStateOf"))

        assertTrue(forgotPasswordViewModel.contains("interface ForgotPasswordRepository"))
        assertTrue(forgotPasswordViewModel.contains("FirebaseForgotPasswordRepository"))
        assertTrue(forgotPasswordViewModel.contains("FirebaseAuthService::sendPasswordResetEmail"))
        assertTrue(forgotPasswordViewModel.contains("currentAuthSessionEpoch"))
        assertTrue(forgotPasswordViewModel.contains("CancellationException"))
        assertTrue(forgotPasswordViewModel.contains("Channel<ForgotPasswordUiEffect>"))
    }

    @Test
    fun phoneLoginPlaceholderIsAbsentUntilARealProviderFlowExists() {
        assertFalse(
            projectPath(
                "src/main/java/com/example/smart_health_android/ui/screens/PhoneLoginScreen.kt",
            ).exists(),
        )
        assertFalse(appNavGraph.contains("PhoneLogin"))
        assertFalse(appNavGraph.contains("SMART_HEALTH_PHONE_AUTH_ENABLED"))
        assertFalse(
            source("navigation/ShcareMobileRouteContract.kt").contains("phone-login"),
        )
        assertFalse(
            projectFile("build.gradle.kts")
                .readText()
                .contains("SMART_HEALTH_PHONE_AUTH_ENABLED"),
        )
    }

    @Test
    fun recoveryCodesCannotLeaveBeforeTheExactBackendAcknowledgement() {
        assertTrue(privacy.contains("BackHandler(enabled = recoveryDeliveryPending)"))
        assertTrue(privacy.contains("AccountSecurityAction.RecoveryExitAttempted"))
        assertTrue(privacy.contains("R.string.security_recovery_exit_blocked"))
        assertTrue(privacy.contains("state.recoveryAcknowledged && !state.isMutating"))
        assertTrue(privacy.contains("enabled = !state.isMutating"))
        assertTrue(privacy.contains("LiveRegionMode.Assertive"))
        assertTrue(privacy.contains("state.twoFactor.enrollmentPending"))
        assertTrue(privacy.contains("security_two_factor_pending_description"))
        assertTrue(privacy.contains("security_two_factor_restart_action"))
        assertTrue(privacy.contains("SensitiveWindowProtection"))
        assertTrue(privacy.contains("WindowManager.LayoutParams.FLAG_SECURE"))
    }

    @Test
    fun passwordChangeDoesNotNormalizeSecretsAndMatchesItsStrengthCopy() {
        assertTrue(changePassword.contains("collectAsStateWithLifecycle"))
        assertTrue(changePassword.contains("ChangePasswordUiAction"))
        assertTrue(changePassword.contains("BackHandler("))
        assertTrue(changePassword.contains("LazyColumn("))
        assertTrue(changePassword.contains(".imePadding()"))
        assertTrue(changePassword.contains(".navigationBarsPadding()"))
        assertTrue(changePassword.contains("defaultMinSize(minHeight = 48.dp)"))
        assertTrue(changePassword.contains("LiveRegionMode.Assertive"))
        assertTrue(changePassword.contains("stringResource("))
        assertFalse(changePassword.contains("currentPassword.trim()"))
        assertFalse(changePassword.contains("newPassword.trim()"))
        assertFalse(changePassword.contains("SmartHealthRepository.api"))
        assertFalse(changePassword.contains("FirebaseAuthService"))
        assertTrue(changePassword.contains("ShcareSettingsHeader"))
        assertTrue(appNavGraph.contains("bindChangePasswordRouteAccess("))
        assertTrue(appNavGraph.contains("expectedAuthority = changePasswordRouteBinding.authority"))
        assertTrue(appNavGraph.contains("currentAuthority = currentChangePasswordAuthority"))
        assertTrue(
            appNavGraph.contains(
                "authorityStore.invalidateIfCurrent(changePasswordAuthorityOwner)",
            ),
        )
        assertTrue(appNavGraph.contains("settingsLogoutCoordinator.logout()"))
        assertTrue(
            appNavGraph.contains(
                "val logoutFirebaseOwner = remember(currentBackStackEntry)",
            ),
        )
        assertTrue(
            appNavGraph.contains(
                "FirebaseAuthService.currentOwnerBindingOrNull()",
            ),
        )
        assertTrue(
            appNavGraph.contains(
                "SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(",
            ),
        )
        assertFalse(appNavGraph.contains("terminateIfCurrentFirebaseUser("))
        assertTrue(
            appNavGraph.contains(
                "navController.navigate(ShcareMobileRoute.ForgotPassword.routePattern)",
            ),
        )
    }

    @Test
    fun signUpUsesNativeThemeInsetsFieldErrorsAndExactPasswordInput() {
        assertTrue(signUp.contains("MaterialTheme.colorScheme"))
        assertFalse(signUp.contains("Color.White"))
        assertFalse(signUp.contains("Color(0x"))
        listOf(
            "PrimaryBlue",
            "TextPrimary",
            "TextSecondary",
        ).forEach { legacyToken ->
            assertFalse("Legacy token $legacyToken remains", signUp.contains(legacyToken))
        }
        assertFalse(
            signUp.contains("import com.example.smart_health_android.ui.theme."),
        )

        assertTrue(signUp.contains(".statusBarsPadding()"))
        assertTrue(signUp.contains(".navigationBarsPadding()"))
        assertTrue(signUp.contains(".imePadding()"))
        assertTrue(
            signUp.contains(
                "enabled = uiState.hasUnsavedChanges || hasStartedSubmission || isBackLocked",
            ),
        )
        assertTrue(signUp.contains("LiveRegionMode.Assertive"))
        assertTrue(signUp.contains("defaultMinSize(minHeight = 48.dp)"))
        assertTrue(signUp.contains("isError = errorMessage != null"))
        assertTrue(signUp.contains("supportingText = errorMessage?.let"))
        assertTrue(signUp.contains("collectAsStateWithLifecycle"))
        assertTrue(signUp.contains("SignUpUiAction"))
        assertTrue(signUp.contains("SignUpUiEffect"))
        assertTrue(signUp.split("enabled = !isFieldInteractionLocked").size - 1 >= 12)
        assertTrue(signUp.contains("enabled = !isPrimaryActionLocked"))
        assertTrue(signUp.contains("abandonmentErrorMessage"))
        assertTrue(signUp.contains("R.string.signup_discard_owner_confirm"))
        assertTrue(
            phase2Strings.contains(
                "<string name=\"signup_discard_owner_confirm\">Kết thúc và quay lại</string>",
            ),
        )
        assertFalse(signUp.contains("SmartHealthRepository.api"))
        assertFalse(signUp.contains("FirebaseAuthService"))
        assertFalse(signUp.contains("PendingRegistrationStore"))
        assertFalse(signUp.contains("rememberCoroutineScope"))
        assertTrue(signUpViewModel.contains("SignUpRegistrationAttempt"))
        assertTrue(
            signUpViewModel.contains(
                "abandonmentCoordinator.terminateIfCurrentOwner(owner)",
            ),
        )
        assertTrue(
            signUpViewModel.contains(
                "abandonmentCoordinator.clearRegistrationAttempt(attempt)",
            ),
        )
        assertTrue(signUpViewModel.contains("override fun onCleared()"))
        assertTrue(signUpViewModel.contains("abandonmentCoordinator::abandonLocally"))
        assertTrue(signUpViewModel.contains("state.password != state.confirmPassword"))
        assertTrue(signUpViewModel.contains("password = password,"))
        assertFalse(signUpViewModel.contains("password = password.trim()"))
        assertFalse(signUpViewModel.contains("confirmPassword.trim()"))
        assertTrue(signUp.contains("BuildConfig.VERSION_NAME"))
        assertTrue(
            appNavGraph.contains(
                "pendingVerifyEmailOwner = firebaseOwner",
            ),
        )
        assertTrue(appNavGraph.contains("replaceNavigationStack("))
    }

    @Test
    fun contactVerificationKeepsOnlyRealEmailLinkAndTruthfulUnavailableFlows() {
        assertTrue(contactVerification.contains("fun FirebaseVerifyEmailScreen("))
        assertTrue(
            contactVerification.contains(
                "onVerified: (accountType: String, owner: FirebaseOwnerBinding) -> Unit",
            ),
        )
        assertTrue(
            contactVerification.contains(
                "onVerified(effect.accountType, effect.firebaseOwner)",
            ),
        )
        assertTrue(contactVerification.contains("collectAsStateWithLifecycle"))
        assertTrue(contactVerification.contains("EmailVerificationUiAction"))
        assertFalse(contactVerification.contains("fun VerifyEmailScreen("))
        assertFalse(contactVerification.contains("VerificationOtpInput"))
        assertFalse(contactVerification.contains("BasicTextField"))
        assertFalse(contactVerification.contains("SmartHealthRepository.api"))
        assertFalse(contactVerification.contains("FirebaseAuthService"))
        assertFalse(contactVerification.contains("PendingRegistrationStore"))
        assertFalse(contactVerification.contains("rememberCoroutineScope"))
        assertFalse(contactVerification.contains("Color.White"))
        assertFalse(contactVerification.contains("Color(0x"))
        assertFalse(
            contactVerification.contains(
                "import com.example.smart_health_android.ui.theme.*",
            ),
        )
        assertTrue(contactVerification.contains("VerificationUnavailableScreen"))
        assertTrue(contactVerification.contains("MaterialTheme.colorScheme"))
        assertTrue(contactVerification.contains(".statusBarsPadding()"))
        assertTrue(contactVerification.contains(".navigationBarsPadding()"))
        assertTrue(contactVerification.contains(".imePadding()"))
        assertTrue(contactVerification.contains("LiveRegionMode.Assertive"))
        assertTrue(contactVerification.contains("BuildConfig.VERSION_NAME"))
        assertFalse(appNavGraph.contains("Uri.encode(contact)"))
        assertFalse(appNavGraph.contains("re-verify/{type}/{contact}"))
        assertTrue(appNavGraph.contains("ShcareMobileRouteContract.verifyEmailRoute(accountType)"))
        assertTrue(appNavGraph.contains("ShcareMobileRoute.VerifyEmail.routePattern"))
        assertTrue(
            appNavGraph.contains(
                "replaceNavigationStack(ShcareMobileRoute.Splash.routePattern)",
            ),
        )
        assertTrue(
            appNavGraph.contains(
                "popUpTo(navController.graph.id) { inclusive = true }",
            ),
        )
        assertFalse(appNavGraph.contains("navigate(\"verify-email?accountType="))
        assertFalse(appNavGraph.contains("navController.navigate(\"splash\")"))
    }

    @Test
    fun authenticatedRootConsumesThePinnedFirebaseOwnerInsteadOfReadingANewAccount() {
        val authenticatedRoot = appNavGraph
            .substringAfter(
                "val openAuthenticatedRoot: (AuthUser, FirebaseOwnerBinding) -> Unit =",
            )
            .substringBefore("val logoutFirebaseOwner")

        assertTrue(authenticatedRoot.contains("expectedFirebaseOwner"))
        assertTrue(
            authenticatedRoot.contains(
                "FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner)",
            ),
        )
        assertTrue(
            authenticatedRoot.contains(
                "firebaseUserId = expectedFirebaseOwner.firebaseUserId",
            ),
        )
        assertTrue(
            authenticatedRoot.contains(
                "terminateIfCurrentFirebaseOwner(",
            ),
        )
        assertTrue(
            authenticatedRoot.contains(
                "authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)",
            ),
        )
        assertFalse(authenticatedRoot.contains("currentUserIdOrNull()"))
        assertFalse(authenticatedRoot.contains("SmartHealthSessionTerminator.terminate()"))
        assertFalse(authenticatedRoot.contains("authorityStore.clear()"))
    }

    @Test
    fun navigationNeverUsesGlobalTeardownForAStaleOwnerCallback() {
        assertFalse(appNavGraph.contains("authorityStore.clear()"))
        assertFalse(appNavGraph.contains("SmartHealthSessionTerminator.terminate()"))
        assertTrue(
            appNavGraph.contains(
                "replaceNavigationStackWithSplashWithoutAuthorityMutation()",
            ),
        )
    }

    @Test
    fun workspaceAndProfileSwitchesPinTheirRouteOwnerBeforeReconcilingReceipts() {
        val workspaceRoute = appNavGraph
            .substringAfter("authorizedMobileComposable(navController, \"workspace-switcher\")")
            .substringBefore("authorizedMobileComposable(navController, \"profile\")")
        val familyRoute = appNavGraph
            .substringAfter("authorizedMobileComposable(navController, \"family-profiles\")")
            .substringBefore("authorizedMobileComposable(navController, \"verify-phone-settings\")")

        listOf(workspaceRoute, familyRoute).forEach { route ->
            assertTrue(route.contains("remember(backStackEntry)"))
            assertTrue(route.contains("FirebaseAuthService.currentOwnerBindingOrNull()"))
            assertTrue(route.contains("val expectedAuthority = routeAuthority"))
            assertTrue(route.contains("expectedAuthority = expectedAuthority"))
            assertTrue(route.contains("replaceProtectedStackWithSplash(expectedAuthority)"))
            assertFalse(route.contains("authorityStore.clear()"))
            assertFalse(route.contains("SmartHealthSessionTerminator.terminate()"))
            assertFalse(route.contains("FirebaseAuthService.currentUserIdOrNull()"))
        }
    }

    @Test
    fun verifyEmailPinsItsOwnerAndAlwaysReplacesTheOrphanableAuthStack() {
        val verifyEmailRoute = appNavGraph
            .substringAfter("route = ShcareMobileRoute.VerifyEmail.routePattern")
            .substringBefore(
                "composable(ShcareMobileRoute.DoctorApprovalPending.routePattern)",
            )

        assertTrue(verifyEmailRoute.contains("val verifyEmailOwner = remember(backStackEntry)"))
        assertTrue(verifyEmailRoute.contains("firebaseOwner = verifyEmailOwner"))
        assertTrue(verifyEmailRoute.contains("terminateIfCurrentFirebaseOwner(owner)"))
        assertTrue(
            verifyEmailRoute.contains(
                "authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)",
            ),
        )
        assertTrue(verifyEmailRoute.contains("verifyEmailOwner != firebaseOwner"))
        assertTrue(verifyEmailRoute.contains("FirebaseAuthService.isCurrentOwner(firebaseOwner)"))
        assertTrue(verifyEmailRoute.contains("replaceNavigationStack("))
        assertTrue(verifyEmailRoute.contains("replaceNavigationStackWithSplashWithoutAuthorityMutation()"))
        assertFalse(
            verifyEmailRoute.contains(
                "terminateLocallyForAccountReplacement()",
            ),
        )
        assertFalse(verifyEmailRoute.contains("navController.popBackStack()"))
        assertFalse(verifyEmailRoute.contains("authorityStore.clear()"))
    }

    @Test
    fun doctorApprovalPinsItsRouteOwnerAndRejectsReplacementEffects() {
        val doctorApprovalRoute = appNavGraph
            .substringAfter(
                "composable(ShcareMobileRoute.DoctorApprovalPending.routePattern)",
            )
            .substringBefore(
                "composable(ShcareMobileRoute.ForgotPassword.routePattern)",
            )

        assertTrue(
            doctorApprovalRoute.contains(
                "val doctorApprovalOwner = remember(backStackEntry)",
            ),
        )
        assertTrue(doctorApprovalRoute.contains("firebaseOwner = doctorApprovalOwner"))
        assertTrue(doctorApprovalRoute.contains("effectOwner != doctorApprovalOwner"))
        assertTrue(
            doctorApprovalRoute.contains(
                "FirebaseAuthService.isCurrentOwner(effectOwner)",
            ),
        )
        assertTrue(doctorApprovalRoute.contains("terminateIfCurrentFirebaseOwner(owner)"))
        assertTrue(
            doctorApprovalRoute.contains(
                "authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)",
            ),
        )
        assertFalse(doctorApprovalRoute.contains("authorityStore.clear()"))
    }

    @Test
    fun doctorApprovalUsesNativeSemanticThemeAndAccessiblePendingStates() {
        assertTrue(doctorApproval.contains("MaterialTheme.colorScheme"))
        assertTrue(doctorApproval.contains("ShcareTheme.colors.warningContainer"))
        assertTrue(doctorApproval.contains("ShcareTheme.colors.success"))
        assertFalse(doctorApproval.contains("Color.White"))
        assertFalse(doctorApproval.contains("Color(0x"))
        listOf(
            "PrimaryBlue",
            "PrimaryTeal",
            "TextPrimary",
            "TextSecondary",
        ).forEach { legacyToken ->
            assertFalse("Legacy token $legacyToken remains", doctorApproval.contains(legacyToken))
        }
        assertFalse(
            doctorApproval.contains("import com.example.smart_health_android.ui.theme.*"),
        )

        assertTrue(doctorApproval.contains("LazyColumn("))
        assertTrue(doctorApproval.contains(".statusBarsPadding()"))
        assertTrue(doctorApproval.contains(".navigationBarsPadding()"))
        assertTrue(doctorApproval.contains(".imePadding()"))
        assertTrue(doctorApproval.contains("LiveRegionMode.Assertive"))
        assertTrue(doctorApproval.contains("LiveRegionMode.Polite"))
        assertTrue(doctorApproval.contains("heading()"))
        assertTrue(doctorApproval.contains("defaultMinSize(minHeight = 48.dp)"))
        assertTrue(doctorApproval.contains("Icons.AutoMirrored.Filled.Send"))
        assertTrue(doctorApproval.contains("Icons.AutoMirrored.Filled.Logout"))
        assertTrue(doctorApproval.contains("BuildConfig.VERSION_NAME"))
        assertTrue(doctorApproval.contains("collectAsStateWithLifecycle"))
        assertTrue(doctorApproval.contains("DoctorApprovalUiAction"))
        assertTrue(doctorApproval.contains("DoctorApprovalUiEffect"))
        assertTrue(doctorApproval.split("enabled = !uiState.isBusy").size - 1 >= 7)
        assertTrue(signUp.contains("enabled: Boolean = true"))
        assertFalse(doctorApproval.contains("xác thực Firebase"))
        assertFalse(doctorApproval.contains("SmartHealthRepository.api"))
        assertFalse(doctorApproval.contains("FirebaseAuthService"))
        assertFalse(doctorApproval.contains("SmartHealthPushRegistrar"))
        assertFalse(doctorApproval.contains("rememberCoroutineScope"))
    }

    private fun source(relativePath: String): String {
        return projectFile(
            "src/main/java/com/example/smart_health_android/$relativePath",
        ).readText()
    }

    private fun projectFile(relativePath: String): File {
        val file = projectPath(relativePath)
        return file.takeIf(File::isFile)
            ?: error("Cannot locate $relativePath from ${file.absolutePath}")
    }

    private fun projectPath(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull { it.parentFile?.isDirectory == true }
            ?: workingDirectory.resolve(relativePath)
    }
}
