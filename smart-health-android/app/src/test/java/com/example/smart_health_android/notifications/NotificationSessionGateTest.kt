package com.example.smart_health_android.notifications

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationSessionGateTest {
    @Test
    fun `inactive or mismatched account can never display a notification`() {
        val gate = NotificationSessionGate()
        val lease = requireNotNull(
            gate.beginReplacement(
                firebaseUserId = "firebase-a",
                workspaceId = "workspace-a",
            ),
        )

        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
        assertTrue(gate.activateIfCurrent(lease, "user-a") != null)
        assertFalse(gate.canDisplay("", "workspace-a", "firebase-a"))
        assertFalse(gate.canDisplay("user-b", "workspace-a", "firebase-a"))
        assertFalse(gate.canDisplay("user-a", "workspace-b", "firebase-a"))
        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-b"))
        assertTrue(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
        assertEquals("user-a", gate.activeBindingOrNull()?.backendUserId)
        assertEquals("workspace-a", gate.activeBindingOrNull()?.workspaceId)
    }

    @Test
    fun `logout deactivates delivery immediately`() {
        val gate = NotificationSessionGate()
        val lease = requireNotNull(gate.beginReplacement("firebase-a", "workspace-a"))
        gate.activateIfCurrent(lease, "user-a")

        gate.deactivate()

        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
        assertEquals(null, gate.activeBindingOrNull())
    }

    @Test
    fun `logout epoch prevents an in flight initial registration from reactivating delivery`() {
        val gate = NotificationSessionGate()
        val staleLease = requireNotNull(gate.beginReplacement("firebase-a", "workspace-a"))

        gate.deactivate()

        assertEquals(null, gate.activateIfCurrent(staleLease, "user-a"))
        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
    }

    @Test
    fun `logout epoch prevents an in flight refreshed token from reactivating delivery`() {
        val gate = NotificationSessionGate()
        val initialLease = requireNotNull(gate.beginReplacement("firebase-a", "workspace-a"))
        gate.activateIfCurrent(initialLease, "user-a")
        val refreshLease = requireNotNull(gate.beginRefresh())

        gate.deactivate()

        assertFalse(gate.isLeaseCurrent(refreshLease))
        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
    }

    @Test
    fun `encrypted binding can be restored only for the same persisted Firebase user`() {
        val original = NotificationSessionBinding(
            backendUserId = "user-a",
            firebaseUserId = "firebase-a",
            workspaceId = "workspace-a",
            generation = "generation-a",
        )
        val matchingGate = NotificationSessionGate()
        val mismatchedGate = NotificationSessionGate()

        assertTrue(matchingGate.restore(original, "firebase-a"))
        assertTrue(matchingGate.canDisplay("user-a", "workspace-a", "firebase-a"))
        assertFalse(mismatchedGate.restore(original, "firebase-b"))
        assertFalse(mismatchedGate.canDisplay("user-a", "workspace-a", "firebase-b"))
    }

    @Test
    fun `same account registration for another workspace replaces the active binding`() {
        val gate = NotificationSessionGate()
        val workspaceALease = requireNotNull(
            gate.beginReplacement("firebase-a", "workspace-a"),
        )
        assertTrue(gate.activateIfCurrent(workspaceALease, "user-a") != null)
        val workspaceARefreshLease = requireNotNull(gate.beginRefresh())

        val workspaceBLease = requireNotNull(
            gate.beginReplacement("firebase-a", "workspace-b"),
        )

        assertEquals(null, gate.activeBindingOrNull())
        assertFalse(gate.isLeaseCurrent(workspaceALease))
        assertFalse(gate.isLeaseCurrent(workspaceARefreshLease))
        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))

        val workspaceBBinding = gate.activateIfCurrent(workspaceBLease, "user-a")
        assertEquals("workspace-b", workspaceBBinding?.workspaceId)
        assertEquals("workspace-b", gate.activeBindingOrNull()?.workspaceId)
        assertTrue(gate.canDisplay("user-a", "workspace-b", "firebase-a"))
    }

    @Test
    fun `logout serializes cancellation after an already authorized delivery`() {
        val gate = NotificationSessionGate()
        val lease = requireNotNull(gate.beginReplacement("firebase-a", "workspace-a"))
        assertTrue(gate.activateIfCurrent(lease, "user-a") != null)
        val notificationVisible = AtomicBoolean(false)
        val deliveryAuthorized = CountDownLatch(1)
        val allowNotificationPost = CountDownLatch(1)
        val cancellationEntered = CountDownLatch(1)
        val deliveryFailure = AtomicReference<Throwable?>(null)
        val logoutFailure = AtomicReference<Throwable?>(null)

        val deliveryThread = thread(name = "notification-delivery") {
            try {
                val delivered = gate.withAuthorizedDelivery(
                    messageUserId = "user-a",
                    messageWorkspaceId = "workspace-a",
                    currentFirebaseUserId = { "firebase-a" },
                ) { binding ->
                    assertEquals("user-a", binding.backendUserId)
                    deliveryAuthorized.countDown()
                    assertTrue(allowNotificationPost.await(5, TimeUnit.SECONDS))
                    notificationVisible.set(true)
                    true
                }
                assertEquals(true, delivered)
            } catch (error: Throwable) {
                deliveryFailure.set(error)
            }
        }

        assertTrue(deliveryAuthorized.await(5, TimeUnit.SECONDS))
        val logoutThread = thread(name = "notification-logout") {
            try {
                gate.deactivateAnd {
                    cancellationEntered.countDown()
                    notificationVisible.set(false)
                }
            } catch (error: Throwable) {
                logoutFailure.set(error)
            }
        }

        val cancellationRanBeforePost = cancellationEntered.await(1, TimeUnit.SECONDS)
        allowNotificationPost.countDown()
        deliveryThread.join(5_000)
        logoutThread.join(5_000)

        deliveryFailure.get()?.let { throw AssertionError("Delivery thread failed", it) }
        logoutFailure.get()?.let { throw AssertionError("Logout thread failed", it) }
        assertFalse("Delivery thread must finish", deliveryThread.isAlive)
        assertFalse("Logout thread must finish", logoutThread.isAlive)
        assertFalse(
            "Cancellation must wait for the authorized post and run last",
            cancellationRanBeforePost,
        )
        assertFalse(
            "No account-A notification may remain after logout",
            notificationVisible.get(),
        )
        assertFalse(gate.canDisplay("user-a", "workspace-a", "firebase-a"))
    }
}
