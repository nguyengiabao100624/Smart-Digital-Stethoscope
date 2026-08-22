package com.example.smart_health_android.navigation

import android.os.SystemClock
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AuthorizedMobileRouteTest {
    @get:Rule
    val composeRule = createComposeRule()

    private val authorityStore = ShcareMobileSessionAuthority.store
    private val user = clinicalUser()

    @Before
    fun setUp() {
        authorityStore.clear()
        val result = authorityStore.establish(
            user = user,
            firebaseUserId = "firebase-uid-1",
            verifiedAtElapsedRealtimeMillis = 1_000L,
        )
        assertTrue(result is MobileAuthorityUpdate.Accepted)
    }

    @After
    fun tearDown() {
        authorityStore.clear()
    }

    @Test
    fun foregroundReauthorizationUncomposesProtectedContentUntilConfirmed() {
        setProtectedRouteContent()
        composeRule.onNodeWithTag(ProtectedContentTag).assertExists()

        lateinit var expectedAuthority: MobileSessionAuthority
        composeRule.runOnIdle {
            expectedAuthority = checkNotNull(authorityStore.beginReauthorization())
        }
        composeRule.onNodeWithTag(ProtectedContentTag).assertDoesNotExist()

        composeRule.runOnIdle {
            val result = authorityStore.completeReauthorization(
                user = user,
                expectedAuthority = expectedAuthority,
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = 2_000L,
            )
            assertTrue(result is MobileAuthorityUpdate.Accepted)
        }
        composeRule.onNodeWithTag(ProtectedContentTag).assertExists()
    }

    @Test
    fun clearedAuthorityEvictsProtectedBackStackToStartup() {
        setProtectedRouteContent()
        composeRule.onNodeWithTag(ProtectedContentTag).assertExists()

        composeRule.runOnIdle {
            authorityStore.clear()
        }

        composeRule.onNodeWithTag(ProtectedContentTag).assertDoesNotExist()
        composeRule.onNodeWithTag(StartupContentTag).assertExists()
    }

    @Test
    fun staleAuthorityNeverComposesProtectedContentBeforeBackendConfirmation() {
        val staleVerifiedAt =
            SystemClock.elapsedRealtime() - MOBILE_AUTHORITY_MAX_AGE_MILLIS - 1L
        authorityStore.clear()
        assertTrue(
            authorityStore.establish(
                user = user,
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = staleVerifiedAt,
            ) is MobileAuthorityUpdate.Accepted,
        )
        val backendResponse = CompletableDeferred<AuthUser>()
        val coordinator = MobileAuthorityReauthorizationCoordinator(
            authorityStore = authorityStore,
            loadCurrentUser = { backendResponse.await() },
            currentFirebaseUserId = { "firebase-uid-1" },
            currentAuthSessionEpoch = { 1L },
            elapsedRealtimeMillis = SystemClock::elapsedRealtime,
        )
        val runtime = MobileAuthorityReauthorizationRuntime(
            coordinator = coordinator,
            onResult = {},
        )
        val protectedCompositionCount = AtomicInteger(0)

        setProtectedRouteContent(
            runtime = runtime,
            onProtectedComposed = protectedCompositionCount::incrementAndGet,
        )

        composeRule.onNodeWithTag(ProtectedContentTag).assertDoesNotExist()
        composeRule.runOnIdle {
            assertTrue(authorityStore.state.value.reauthorizing)
            assertTrue(protectedCompositionCount.get() == 0)
        }

        backendResponse.complete(user)
        composeRule.waitUntil(timeoutMillis = 5_000) {
            !authorityStore.state.value.reauthorizing
        }

        composeRule.onNodeWithTag(ProtectedContentTag).assertExists()
        assertTrue(protectedCompositionCount.get() > 0)
    }

    @Test
    fun retainedProtectedDestinationIsHiddenWhenFreshAuthorityCrossesTtl() {
        val clock = AtomicLong(10_000L)
        authorityStore.clear()
        assertTrue(
            authorityStore.establish(
                user = user,
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = clock.get(),
            ) is MobileAuthorityUpdate.Accepted,
        )
        val backendResponse = CompletableDeferred<AuthUser>()
        val coordinator = MobileAuthorityReauthorizationCoordinator(
            authorityStore = authorityStore,
            loadCurrentUser = { backendResponse.await() },
            currentFirebaseUserId = { "firebase-uid-1" },
            currentAuthSessionEpoch = { 1L },
            elapsedRealtimeMillis = clock::get,
            maxAgeMillis = 1_000L,
        )
        val runtime = MobileAuthorityReauthorizationRuntime(
            coordinator = coordinator,
            onResult = {},
        )

        setProtectedRouteContent(runtime = runtime)
        composeRule.onNodeWithTag(ProtectedContentTag).assertExists()

        composeRule.waitUntil(timeoutMillis = 3_000) {
            authorityStore.state.value.reauthorizing
        }
        composeRule.onNodeWithTag(ProtectedContentTag).assertDoesNotExist()

        clock.set(11_000L)
        backendResponse.complete(user)
        composeRule.waitUntil(timeoutMillis = 5_000) {
            !authorityStore.state.value.reauthorizing
        }
        composeRule.onNodeWithTag(ProtectedContentTag).assertExists()
    }

    @Test
    fun missingReauthorizationRuntimeFailsClosedToStartup() {
        composeRule.setContent {
            ShcareMobileTheme {
                ProtectedRouteHost()
            }
        }

        composeRule.onNodeWithTag(ProtectedContentTag).assertDoesNotExist()
        composeRule.onNodeWithTag(StartupContentTag).assertExists()
    }

    private fun setProtectedRouteContent(
        runtime: MobileAuthorityReauthorizationRuntime? = null,
        onProtectedComposed: () -> Unit = {},
    ) {
        val resolvedRuntime = runtime ?: defaultTestRuntime()
        composeRule.setContent {
            ShcareMobileTheme {
                CompositionLocalProvider(
                    LocalMobileAuthorityReauthorizationRuntime provides resolvedRuntime,
                ) {
                    ProtectedRouteHost(onProtectedComposed)
                }
            }
        }
    }

    @Composable
    private fun ProtectedRouteHost(
        onProtectedComposed: () -> Unit = {},
    ) {
        val navController = rememberNavController()
        NavHost(
            navController = navController,
            startDestination = ShcareMobileRoute.ClinicalDashboard.routePattern,
        ) {
            authorizedMobileComposable(
                navController = navController,
                route = ShcareMobileRoute.ClinicalDashboard.routePattern,
            ) {
                onProtectedComposed()
                Text(
                    text = "Protected",
                    modifier = Modifier.testTag(ProtectedContentTag),
                )
            }
            composable(ShcareMobileRoute.Splash.routePattern) {
                Text(
                    text = "Startup",
                    modifier = Modifier.testTag(StartupContentTag),
                )
            }
        }
    }

    private fun defaultTestRuntime(): MobileAuthorityReauthorizationRuntime {
        val neverCompletes = CompletableDeferred<AuthUser>()
        val coordinator = MobileAuthorityReauthorizationCoordinator(
            authorityStore = authorityStore,
            loadCurrentUser = { neverCompletes.await() },
            currentFirebaseUserId = { "firebase-uid-1" },
            currentAuthSessionEpoch = { 1L },
            elapsedRealtimeMillis = SystemClock::elapsedRealtime,
            maxAgeMillis = Long.MAX_VALUE,
        )
        return MobileAuthorityReauthorizationRuntime(
            coordinator = coordinator,
            onResult = {},
        )
    }

    private fun clinicalUser(): AuthUser {
        val membership = WorkspaceMembership(
            workspaceId = "workspace-1",
            role = "doctor",
        )
        return AuthUser(
            id = "usr-internal-1",
            firebaseUid = "firebase-uid-1",
            role = "doctor",
            organizationId = "workspace-1",
            currentWorkspaceId = "workspace-1",
            currentMembership = membership,
            memberships = listOf(membership),
            currentWorkspace = WorkspaceSummary(
                id = "workspace-1",
                role = "doctor",
            ),
            capabilities = listOf("workspace.dashboard.view"),
        )
    }

    private companion object {
        const val ProtectedContentTag = "protected-content"
        const val StartupContentTag = "startup-content"
    }
}
