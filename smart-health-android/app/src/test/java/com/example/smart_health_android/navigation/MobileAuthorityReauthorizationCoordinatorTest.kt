package com.example.smart_health_android.navigation

import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.WorkspaceMembership
import com.example.smart_health_android.data.WorkspaceSummary
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class MobileAuthorityReauthorizationCoordinatorTest {
    @Test
    fun `fresh authority does not call backend for route transition`() = runTest {
        val fixture = Fixture(verifiedAt = 1_000L)
        fixture.clock = 1_500L

        val result = fixture.coordinator().reauthorize(force = false)

        assertEquals(MobileReauthorizationResult.NotRequired, result)
        assertEquals(0, fixture.loadCalls)
        assertFalse(fixture.store.state.value.reauthorizing)
    }

    @Test
    fun `forced foreground refresh hides protected content until backend confirms`() = runTest {
        val fixture = Fixture(verifiedAt = 1_000L)
        val response = CompletableDeferred<AuthUser>()
        fixture.loadCurrentUser = { response.await() }
        fixture.clock = 2_000L
        val coordinator = fixture.coordinator()
        val expectedAuthority = coordinator.beginForegroundReauthorization()

        assertTrue(fixture.store.state.value.reauthorizing)
        checkNotNull(expectedAuthority)

        val pending = async {
            coordinator.completeForegroundReauthorization(expectedAuthority)
        }
        runCurrent()

        assertEquals(1, fixture.loadCalls)

        fixture.clock = 2_100L
        response.complete(clinicalUser())
        val result = pending.await()

        assertTrue(result is MobileReauthorizationResult.Accepted)
        result as MobileReauthorizationResult.Accepted
        assertFalse(result.authorityChanged)
        assertFalse(fixture.store.state.value.reauthorizing)
        assertEquals(2_100L, fixture.store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun `replacement coordinator resumes a reauthorization locked before coroutine launch`() =
        runTest {
            val fixture = Fixture(verifiedAt = 1_000L)
            fixture.clock = 2_000L
            val firstCoordinator = fixture.coordinator()
            val expectedAuthority = checkNotNull(
                firstCoordinator.beginForegroundReauthorization(),
            )

            val replacementCoordinator = fixture.coordinator()
            val resumedAuthority =
                replacementCoordinator.resumeOrBeginForegroundReauthorization()
            val result = replacementCoordinator.completeForegroundReauthorization(
                checkNotNull(resumedAuthority),
            )

            assertEquals(expectedAuthority, resumedAuthority)
            assertTrue(result is MobileReauthorizationResult.Accepted)
            assertEquals(1, fixture.loadCalls)
            assertFalse(fixture.store.state.value.reauthorizing)
            assertEquals(2_000L, fixture.store.state.value.verifiedAtElapsedRealtimeMillis)
        }

    @Test
    fun `configuration cancellation mid refresh preserves lock for replacement coordinator`() =
        runTest {
            val fixture = Fixture(verifiedAt = 1_000L)
            val response = CompletableDeferred<AuthUser>()
            fixture.loadCurrentUser = { response.await() }
            fixture.clock = 2_000L
            val firstCoordinator = fixture.coordinator()
            val expectedAuthority = checkNotNull(
                firstCoordinator.beginForegroundReauthorization(),
            )
            val cancelledRefresh = async {
                firstCoordinator.completeForegroundReauthorization(expectedAuthority)
            }
            runCurrent()

            cancelledRefresh.cancelAndJoin()

            assertEquals(expectedAuthority, fixture.store.state.value.authority)
            assertTrue(fixture.store.state.value.reauthorizing)
            fixture.loadCurrentUser = { clinicalUser() }
            fixture.clock = 2_100L
            val replacementCoordinator = fixture.coordinator()
            val resumedAuthority = checkNotNull(
                replacementCoordinator.resumeOrBeginForegroundReauthorization(),
            )
            val result = replacementCoordinator.completeForegroundReauthorization(
                resumedAuthority,
            )

            assertTrue(result is MobileReauthorizationResult.Accepted)
            assertEquals(2, fixture.loadCalls)
            assertFalse(fixture.store.state.value.reauthorizing)
            assertEquals(2_100L, fixture.store.state.value.verifiedAtElapsedRealtimeMillis)
        }

    @Test
    fun `changed backend capability advances epoch for stale back stack eviction`() = runTest {
        val fixture = Fixture(verifiedAt = 1_000L)
        fixture.clock = 2_000L
        fixture.loadCurrentUser = {
            clinicalUser(capabilities = listOf("workspace.alerts.manage"))
        }

        val result = fixture.coordinator().reauthorize(force = true)

        assertTrue(result is MobileReauthorizationResult.Accepted)
        result as MobileReauthorizationResult.Accepted
        assertTrue(result.authorityChanged)
        assertEquals(2L, result.authority.epoch)
        assertEquals(setOf("workspace.alerts.manage"), result.authority.capabilities)
    }

    @Test
    fun `locked account rejection clears authority and reauthorization lock`() = runTest {
        val fixture = Fixture(verifiedAt = 1_000L)
        fixture.clock = 2_000L
        fixture.loadCurrentUser = {
            clinicalUser().copy(accountStatus = "locked")
        }

        val result = fixture.coordinator().reauthorize(force = true)

        assertEquals(
            MobileReauthorizationResult.Rejected(MobileAuthorityRejection.AccountInactive),
            result,
        )
        assertNull(fixture.store.state.value.authority)
        assertFalse(fixture.store.state.value.reauthorizing)
        assertEquals(0L, fixture.store.state.value.verifiedAtElapsedRealtimeMillis)
    }

    @Test
    fun `ambiguous network failure clears cached authority`() = runTest {
        val fixture = Fixture(verifiedAt = 1_000L)
        fixture.clock = 2_000L
        fixture.loadCurrentUser = {
            throw IOException("offline")
        }

        val result = fixture.coordinator().reauthorize(force = true)

        assertTrue(result is MobileReauthorizationResult.Failed)
        assertNull(fixture.store.state.value.authority)
        assertFalse(fixture.store.state.value.reauthorizing)
    }

    @Test
    fun `response from a rotated API authentication session cannot update authority`() = runTest {
        val fixture = Fixture(verifiedAt = 1_000L)
        val response = CompletableDeferred<AuthUser>()
        fixture.loadCurrentUser = { response.await() }
        fixture.clock = 2_000L
        val coordinator = fixture.coordinator()
        val expectedAuthority = checkNotNull(coordinator.beginForegroundReauthorization())
        val pending = async {
            coordinator.completeForegroundReauthorization(expectedAuthority)
        }
        runCurrent()

        fixture.authSessionEpoch = 2L
        response.complete(clinicalUser())
        val result = pending.await()

        assertEquals(MobileReauthorizationResult.AuthenticationSessionChanged, result)
        assertEquals(1, fixture.loadCalls)
        assertNull(fixture.store.state.value.authority)
        assertFalse(fixture.store.state.value.reauthorizing)
    }

    @Test
    fun `auth session rotation at authority commit invalidates the just applied response`() =
        runTest {
            val fixture = Fixture(verifiedAt = 1_000L)
            fixture.clock = 2_000L
            var epochReads = 0
            fixture.authSessionEpochProvider = {
                epochReads += 1
                if (epochReads < 3) 1L else 2L
            }

            val result = fixture.coordinator().reauthorize(force = true)

            assertEquals(MobileReauthorizationResult.AuthenticationSessionChanged, result)
            assertEquals(3, epochReads)
            assertEquals(1, fixture.loadCalls)
            assertNull(fixture.store.state.value.authority)
            assertFalse(fixture.store.state.value.reauthorizing)
        }

    private class Fixture(
        verifiedAt: Long,
    ) {
        val store = MobileSessionAuthorityStore()
        var clock = verifiedAt
        var authSessionEpoch = 1L
        var authSessionEpochProvider: () -> Long = { authSessionEpoch }
        var loadCalls = 0
        var loadCurrentUser: suspend () -> AuthUser = { clinicalUser() }

        init {
            val established = store.establish(
                user = clinicalUser(),
                firebaseUserId = "firebase-uid-1",
                verifiedAtElapsedRealtimeMillis = verifiedAt,
            )
            check(established is MobileAuthorityUpdate.Accepted)
        }

        fun coordinator() = MobileAuthorityReauthorizationCoordinator(
            authorityStore = store,
            loadCurrentUser = {
                loadCalls += 1
                this@Fixture.loadCurrentUser()
            },
            currentFirebaseUserId = { "firebase-uid-1" },
            currentAuthSessionEpoch = { authSessionEpochProvider() },
            elapsedRealtimeMillis = { clock },
            maxAgeMillis = 1_000L,
        )
    }

    private companion object {
        fun clinicalUser(
            capabilities: List<String> = listOf("workspace.dashboard.view"),
        ): AuthUser {
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
                capabilities = capabilities,
            )
        }
    }
}
