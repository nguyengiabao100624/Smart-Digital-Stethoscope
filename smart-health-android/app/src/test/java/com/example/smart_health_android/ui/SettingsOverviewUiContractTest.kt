package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsOverviewUiContractTest {
    private val screen = source("ui/screens/SettingsScreen.kt")
    private val appNavGraph = source("navigation/AppNavGraph.kt")
    private val viewModel = source("settings/SettingsOverviewViewModel.kt")
    private val strings = projectFile("src/main/res/values/strings.xml").readText()

    @Test
    fun `settings is state driven and does not call the backend from Compose`() {
        assertTrue(screen.contains("SettingsOverviewViewModelFactory"))
        assertTrue(screen.contains("collectAsStateWithLifecycle()"))
        assertTrue(screen.contains("SettingsOverviewUiAction.Retry"))
        assertTrue(screen.contains("SettingsOverviewUiAction.Refresh"))
        assertTrue(screen.contains("SettingsOverviewUiAction.Logout"))
        assertTrue(screen.contains("state.isLoggingOut"))
        assertTrue(screen.contains("ShcareLoadingState"))
        assertTrue(screen.contains("ShcareOfflineState"))
        assertTrue(screen.contains("ShcarePermissionState"))
        assertTrue(screen.contains("ShcareErrorState"))
        assertTrue(screen.contains("LazyColumn"))
        assertTrue(screen.contains("stateDescription"))
        assertTrue(screen.contains("heading()"))
        assertTrue(screen.contains("heightIn(min = 48.dp)"))

        assertFalse(screen.contains("SmartHealthRepository.api"))
        assertFalse(screen.contains("remember { mutableStateOf"))
        assertFalse(screen.contains("verticalScroll"))
        assertFalse(screen.contains("Brush.linearGradient"))
        assertFalse(screen.contains("Color.White"))
        assertFalse(screen.contains("Color(0x"))
        assertFalse(Regex("""\d+\.sp\b""").containsMatchIn(screen))
    }

    @Test
    fun `settings route binds authority and all feature gates fail closed`() {
        assertTrue(appNavGraph.contains("bindSettingsRouteAccess("))
        assertTrue(appNavGraph.contains("currentSettingsAuthority"))
        assertTrue(appNavGraph.contains("settingsRouteBinding.authority"))
        assertTrue(appNavGraph.contains("invalidateExpectedAuthority"))
        assertTrue(appNavGraph.contains("authorityStore.invalidateIfCurrent(settingsAuthorityOwner)"))
        assertTrue(appNavGraph.contains("canManageFamilyProfiles"))
        assertTrue(appNavGraph.contains("canManageStethoscope"))
        assertTrue(appNavGraph.contains("canViewAiCalibration"))
        assertTrue(appNavGraph.contains("canViewDataStorage"))
        assertTrue(appNavGraph.contains("SettingsLogoutCoordinator("))
        assertTrue(appNavGraph.contains("logoutFirebaseOwner"))
        assertTrue(appNavGraph.contains("logoutAuthority"))
        assertTrue(appNavGraph.contains("logoutAuthority?.let(authorityStore::invalidateIfCurrent)"))
        assertTrue(appNavGraph.contains("var canExitToLogin = false"))
        assertTrue(appNavGraph.contains("ShcareMobileRoute.Splash.routePattern"))
        assertTrue(appNavGraph.contains("SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner("))
        assertFalse(appNavGraph.contains("terminateIfCurrentFirebaseUser("))
        assertTrue(appNavGraph.contains("The Firebase account changed before session termination."))
        assertTrue(viewModel.contains("clearAuthority()"))
        assertTrue(viewModel.contains("terminateSession()"))
        assertTrue(viewModel.contains("finally"))
        assertTrue(viewModel.contains("exitProtectedUi()"))

        assertTrue(screen.contains("expectedAuthority"))
        assertTrue(screen.contains("currentAuthority"))
        assertTrue(screen.contains("logoutCoordinator"))
        assertFalse(screen.contains("canViewDataStorage: Boolean = true"))
        val entryPoint = screen.substringBefore(
            "@Composable\ninternal fun SettingsOverviewContent",
        )
        assertFalse(entryPoint.contains("onLogout: () -> Unit"))
    }

    @Test
    fun `account card exposes one canonical TalkBack summary`() {
        assertTrue(screen.contains("clearAndSetSemantics"))
        assertTrue(
            screen.contains(
                "clearAndSetSemantics {\n                contentDescription = spokenSummary\n                heading()",
            ),
        )
        assertFalse(screen.contains(".semantics(mergeDescendants = true) {\n                stateDescription = spokenSummary"))
        assertFalse(screen.contains("stateDescription = logoutDescription"))
    }

    @Test
    fun `refresh and stale banner expose each TalkBack message once`() {
        assertTrue(screen.contains("val refreshStateDescription = when"))
        assertTrue(
            screen.contains(
                "refreshStateDescription?.let { stateDescription = it }",
            ),
        )
        assertFalse(screen.contains("stateDescription = refreshState"))

        val staleBanner = screen.substringAfter(
            "private fun SettingsOverviewStaleBanner(",
        ).substringBefore("\n@Composable\nfun SettingsGroup")
        assertFalse(staleBanner.contains("stateDescription = message"))
        assertTrue(staleBanner.contains("liveRegion = LiveRegionMode.Polite"))
        assertTrue(staleBanner.contains("settings_overview_retry_refresh"))
    }

    @Test
    fun `settings copy is resource backed`() {
        listOf(
            "settings_overview_title",
            "settings_overview_loading",
            "settings_overview_offline_title",
            "settings_overview_permission_title",
            "settings_overview_error_title",
            "settings_overview_section_account",
            "settings_overview_section_device_analysis",
            "settings_overview_section_options",
            "settings_overview_data_storage",
            "settings_overview_logout",
            "settings_overview_logging_out",
            "settings_overview_refresh_confirmed",
        ).forEach { resourceName ->
            assertTrue("Missing $resourceName", strings.contains("name=\"$resourceName\""))
        }
    }

    private fun source(relativePath: String): String =
        projectFile("src/main/java/com/example/smart_health_android/$relativePath").readText()

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
