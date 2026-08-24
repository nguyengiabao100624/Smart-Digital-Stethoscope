package com.example.smart_health_android.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.firebase.messaging.RemoteMessage
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.UUID
import kotlin.concurrent.thread
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SmartHealthNotificationDeliveryLifecycleTest {
    @Test
    fun postedNotificationIsCancelledAndItsAccountABoundLaunchCannotOpenForAccountB() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        val permissionWasGranted = hasNotificationPermission(context)
        if (!permissionWasGranted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                instrumentation.uiAutomation.grantRuntimePermission(
                    context.packageName,
                    Manifest.permission.POST_NOTIFICATIONS,
                )
            } catch (_: SecurityException) {
                assumeTrue(
                    "Device policy blocks instrumentation notification permission; " +
                        "run this proof on an emulator or enable USB debugging security settings.",
                    false,
                )
            }
        }

        SmartHealthNotificationCenter.ensureChannels(context)
        SmartHealthNotificationCenter.clearAllPostedNotifications(context)
        val accountALease = SmartHealthNotificationSession.beginAuthentication(
            firebaseUserId = "firebase-a",
            workspaceId = "workspace-a",
        )
        assertTrue(SmartHealthNotificationSession.activate(accountALease, "backend-a"))
        val accountABinding = requireNotNull(
            SmartHealthNotificationSession.activeBindingOrNull(),
        )
        val staleLaunchIntent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.RecordDetail("record-a"),
            ownerUserId = accountABinding.backendUserId,
            workspaceId = accountABinding.workspaceId,
            sessionGeneration = accountABinding.generation,
        )
        val message = RemoteMessage.Builder("shcare-test-${UUID.randomUUID()}")
            .setMessageId("message-${UUID.randomUUID()}")
            .addData("userId", "backend-a")
            .addData("workspaceId", "workspace-a")
            .addData("notificationProtocolVersion", "2")
            .addData("notificationId", "notification-a")
            .addData("destination", "record_detail")
            .addData("recordId", "record-a")
            .addData("title", "Test notification")
            .addData("body", "Lifecycle evidence")
            .build()

        try {
            assertFalse(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = message,
                    currentFirebaseUserId = { "firebase-b" },
                ),
            )
            instrumentation.waitForIdleSync()
            assertTrue(notificationManager.activeNotifications.isEmpty())

            val wrongWorkspaceMessage = RemoteMessage.Builder(
                "shcare-test-wrong-workspace-${UUID.randomUUID()}",
            )
                .setMessageId("message-wrong-workspace-${UUID.randomUUID()}")
                .addData("userId", "backend-a")
                .addData("workspaceId", "workspace-b")
                .addData("notificationProtocolVersion", "2")
                .addData("notificationId", "notification-wrong-workspace")
                .build()
            assertFalse(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = wrongWorkspaceMessage,
                    currentFirebaseUserId = { "firebase-a" },
                ),
            )
            assertTrue(notificationManager.activeNotifications.isEmpty())

            val firebaseIdentityRevalidated = CountDownLatch(1)
            val allowNotificationPost = CountDownLatch(1)
            val cancellationEntered = CountDownLatch(1)
            val deliveryResult = AtomicReference<Boolean?>(null)
            val cancellationResult = AtomicReference<Boolean?>(null)
            val deliveryFailure = AtomicReference<Throwable?>(null)
            val cancellationFailure = AtomicReference<Throwable?>(null)
            val deliveryThread = thread(name = "api35-notification-delivery") {
                try {
                    deliveryResult.set(
                        SmartHealthNotificationCenter.showForegroundMessage(
                            context = context,
                            message = message,
                            currentFirebaseUserId = {
                                firebaseIdentityRevalidated.countDown()
                                check(allowNotificationPost.await(5, TimeUnit.SECONDS))
                                "firebase-a"
                            },
                        ),
                    )
                } catch (error: Throwable) {
                    deliveryFailure.set(error)
                }
            }

            assertTrue(firebaseIdentityRevalidated.await(5, TimeUnit.SECONDS))
            val cancellationThread = thread(name = "api35-notification-logout") {
                try {
                    cancellationResult.set(
                        SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                            cancellationEntered.countDown()
                            SmartHealthNotificationCenter.clearAllPostedNotifications(context)
                        },
                    )
                } catch (error: Throwable) {
                    cancellationFailure.set(error)
                }
            }

            val cancellationRanBeforePost = cancellationEntered.await(1, TimeUnit.SECONDS)
            allowNotificationPost.countDown()
            deliveryThread.join(5_000)
            cancellationThread.join(5_000)
            deliveryFailure.get()?.let { throw AssertionError("Delivery thread failed", it) }
            cancellationFailure.get()?.let { throw AssertionError("Logout thread failed", it) }
            assertFalse("Delivery thread must finish", deliveryThread.isAlive)
            assertFalse("Logout thread must finish", cancellationThread.isAlive)
            assertTrue(deliveryResult.get() == true)
            assertTrue(cancellationResult.get() == true)
            assertFalse(
                "Logout cancellation must run after the authorized post",
                cancellationRanBeforePost,
            )
            instrumentation.waitForIdleSync()
            assertTrue(notificationManager.activeNotifications.isEmpty())

            val accountBLease = SmartHealthNotificationSession.beginAuthentication(
                firebaseUserId = "firebase-b",
                workspaceId = "workspace-b",
            )
            assertTrue(SmartHealthNotificationSession.activate(accountBLease, "backend-b"))
            assertNull(
                SmartHealthNotificationIntentContract.launchRequestFrom(staleLaunchIntent),
            )
        } finally {
            SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                SmartHealthNotificationCenter.clearAllPostedNotifications(context)
            }
            // Runtime permission revocation force-stops the target process on modern Android and
            // would terminate the instrumentation runner itself. The test APK is reinstalled for
            // each connected run, so leaving the test-only grant in place is the isolated cleanup.
        }
    }

    @Test
    fun providerSignalUsesLocalGenericCopyInboxAndNotificationIdDedupe() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        if (!hasNotificationPermission(context) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            try {
                instrumentation.uiAutomation.grantRuntimePermission(
                    context.packageName,
                    Manifest.permission.POST_NOTIFICATIONS,
                )
            } catch (_: SecurityException) {
                assumeTrue(
                    "Device policy blocks instrumentation notification permission; " +
                        "run this proof on an emulator or enable USB debugging security settings.",
                    false,
                )
            }
        }
        SmartHealthNotificationCenter.ensureChannels(context)
        SmartHealthNotificationCenter.clearAllPostedNotifications(context)
        val lease = SmartHealthNotificationSession.beginAuthentication(
            firebaseUserId = "firebase-generic",
            workspaceId = "workspace-generic",
        )
        assertTrue(SmartHealthNotificationSession.activate(lease, "backend-generic"))

        fun providerMessage(messageId: String): RemoteMessage {
            return RemoteMessage.Builder("shcare-generic-${UUID.randomUUID()}")
                .setMessageId(messageId)
                .addData("notificationId", "notification-generic-1")
                .addData("userId", "backend-generic")
                .addData("workspaceId", "workspace-generic")
                .addData("notificationProtocolVersion", "2")
                .addData("destination", "record_detail")
                .addData("recordId", "record-secret")
                .addData("type", "clinical_alert")
                .addData("severity", "critical")
                .addData("title", "Sensitive remote title")
                .addData("body", "Sensitive remote body")
                .build()
        }

        try {
            assertTrue(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = providerMessage("provider-message-a"),
                    currentFirebaseUserId = { "firebase-generic" },
                ),
            )
            assertTrue(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = providerMessage("provider-message-b"),
                    currentFirebaseUserId = { "firebase-generic" },
                ),
            )
            instrumentation.waitForIdleSync()

            val posted = notificationManager.activeNotifications
            assertEquals("notificationId must deduplicate provider retries", 1, posted.size)
            val notification = posted.single().notification
            assertEquals(
                context.getString(com.example.smart_health_android.R.string.notification_default_title),
                notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            )
            assertEquals(
                context.getString(com.example.smart_health_android.R.string.notification_default_body),
                notification.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            )
            assertEquals(
                SmartHealthNotificationChannel.GeneralUpdates.channelId,
                notification.channelId,
            )

            assertTrue(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = providerMessage("provider-message-silent"),
                    currentFirebaseUserId = { "firebase-generic" },
                ),
            )
            instrumentation.waitForIdleSync()
            assertEquals(
                SmartHealthNotificationChannel.GeneralUpdates.channelId,
                notificationManager.activeNotifications.single().notification.channelId,
            )

            val missingId = RemoteMessage.Builder("shcare-generic-missing-id")
                .setMessageId("provider-message-without-notification-id")
                .addData("userId", "backend-generic")
                .addData("workspaceId", "workspace-generic")
                .addData("notificationProtocolVersion", "2")
                .addData("title", "Must never display")
                .build()
            assertFalse(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = missingId,
                    currentFirebaseUserId = { "firebase-generic" },
                ),
            )
            assertEquals(1, notificationManager.activeNotifications.size)

            val missingProtocol = RemoteMessage.Builder("shcare-generic-missing-protocol")
                .setMessageId("provider-message-missing-protocol")
                .addData("notificationId", "notification-missing-protocol")
                .addData("userId", "backend-generic")
                .addData("workspaceId", "workspace-generic")
                .build()
            assertFalse(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = missingProtocol,
                    currentFirebaseUserId = { "firebase-generic" },
                ),
            )

            val unsupportedProtocol = RemoteMessage.Builder("shcare-generic-protocol-v3")
                .setMessageId("provider-message-protocol-v3")
                .addData("notificationId", "notification-protocol-v3")
                .addData("userId", "backend-generic")
                .addData("workspaceId", "workspace-generic")
                .addData("notificationProtocolVersion", "3")
                .build()
            assertFalse(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = unsupportedProtocol,
                    currentFirebaseUserId = { "firebase-generic" },
                ),
            )

            val mismatchedWorkspaceAlias = RemoteMessage.Builder("shcare-generic-alias-mismatch")
                .setMessageId("provider-message-alias-mismatch")
                .addData("notificationId", "notification-alias-mismatch")
                .addData("userId", "backend-generic")
                .addData("workspaceId", "workspace-generic")
                .addData("organizationId", "workspace-other")
                .addData("notificationProtocolVersion", "2")
                .build()
            assertFalse(
                SmartHealthNotificationCenter.showForegroundMessage(
                    context = context,
                    message = mismatchedWorkspaceAlias,
                    currentFirebaseUserId = { "firebase-generic" },
                ),
            )
        } finally {
            SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                SmartHealthNotificationCenter.clearAllPostedNotifications(context)
            }
        }
    }

    @Test
    fun sameAccountNotificationFromWorkspaceAIsSuppressedAfterSwitchingToWorkspaceB() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val workspaceALease = SmartHealthNotificationSession.beginAuthentication(
            firebaseUserId = "firebase-same-account",
            workspaceId = "workspace-a",
        )
        assertTrue(
            SmartHealthNotificationSession.activate(
                workspaceALease,
                "backend-same-account",
            ),
        )
        val workspaceABinding = requireNotNull(
            SmartHealthNotificationSession.activeBindingOrNull(),
        )
        val staleWorkspaceAIntent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.Inbox,
            ownerUserId = workspaceABinding.backendUserId,
            workspaceId = workspaceABinding.workspaceId,
            sessionGeneration = workspaceABinding.generation,
        )
        val staleWorkspaceARequest = requireNotNull(
            SmartHealthNotificationIntentContract.launchRequestFrom(staleWorkspaceAIntent),
        )

        try {
            assertTrue(
                SmartHealthNotificationSession.canOpen(
                    request = staleWorkspaceARequest,
                    currentFirebaseUserId = "firebase-same-account",
                    currentWorkspaceId = "workspace-a",
                ),
            )
            assertFalse(
                SmartHealthNotificationSession.canOpen(
                    request = staleWorkspaceARequest,
                    currentFirebaseUserId = "firebase-same-account",
                    currentWorkspaceId = "workspace-b",
                ),
            )

            val workspaceBLease = SmartHealthNotificationSession.beginAuthentication(
                firebaseUserId = "firebase-same-account",
                workspaceId = "workspace-b",
            )
            assertTrue(
                SmartHealthNotificationSession.activate(
                    workspaceBLease,
                    "backend-same-account",
                ),
            )

            assertFalse(
                SmartHealthNotificationSession.canOpen(
                    request = staleWorkspaceARequest,
                    currentFirebaseUserId = "firebase-same-account",
                    currentWorkspaceId = "workspace-b",
                ),
            )
            assertEquals(
                "workspace-b",
                SmartHealthNotificationSession.activeBindingOrNull()?.workspaceId,
            )
        } finally {
            SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                SmartHealthNotificationCenter.clearAllPostedNotifications(context)
            }
        }
    }

    private fun hasNotificationPermission(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
    }
}
