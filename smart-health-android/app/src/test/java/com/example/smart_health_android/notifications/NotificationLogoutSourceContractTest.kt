package com.example.smart_health_android.notifications

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class NotificationLogoutSourceContractTest {
    private val apiSource = projectFile(
        "src/main/java/com/example/smart_health_android/data/SmartHealthApi.kt",
    ).readText()
    private val registrarSource = projectFile(
        "src/main/java/com/example/smart_health_android/data/SmartHealthPushRegistrar.kt",
    ).readText()
    private val navigationSource = projectFile(
        "src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt",
    ).readText()
    private val startupSource = projectFile(
        "src/main/java/com/example/smart_health_android/startup/SplashViewModel.kt",
    ).readText()
    private val terminatorSource = projectFile(
        "src/main/java/com/example/smart_health_android/security/SessionTerminator.kt",
    ).readText()
    private val messagingServiceSource = projectFile(
        "src/main/java/com/example/smart_health_android/data/SmartHealthFirebaseMessagingService.kt",
    ).readText()
    private val notificationCenterSource = projectFile(
        "src/main/java/com/example/smart_health_android/notifications/SmartHealthNotificationCenter.kt",
    ).readText()
    private val verificationSource = projectFile(
        "src/main/java/com/example/smart_health_android/ui/screens/ContactVerificationScreens.kt",
    ).readText()

    @Test
    fun exposesAuthenticatedTokenUnregisterContract() {
        assertTrue(apiSource.contains("suspend fun unregisterNotificationDevice"))
        assertTrue(apiSource.contains("notifications/unregister-device"))
        assertTrue(registrarSource.contains("suspend fun unregisterCurrentToken"))
        assertTrue(registrarSource.contains("suspend fun invalidateLocalToken"))
        assertTrue(registrarSource.contains("deleteToken().await()"))
        assertTrue(registrarSource.contains("markLocalInvalidationPending"))
        assertTrue(registrarSource.contains("retryPendingInvalidation"))
        assertTrue(registrarSource.contains("invalidationRetry.retryIfPending()"))
        assertTrue(registrarSource.contains("notificationProtocolVersion = NOTIFICATION_PROTOCOL_VERSION"))
    }

    @Test
    fun normalAndForcedLogoutUseTheSameSessionTerminator() {
        assertTrue(
            navigationSource.contains(
                "SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(",
            ),
        )
        assertFalse(navigationSource.contains("SmartHealthSessionTerminator.terminate()"))
        assertTrue(
            startupSource.contains(
                "SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(owner)",
            ),
        )
        assertTrue(terminatorSource.contains("SmartHealthPushRegistrar.unregisterCurrentToken(it)"))
        assertTrue(terminatorSource.contains("SmartHealthRepository.api.logout(it)"))
        assertTrue(
            terminatorSource.contains(
                "SmartHealthNotificationSession.deactivateAndClearPostedNotifications",
            ),
        )
        assertTrue(terminatorSource.contains("SmartHealthNotificationCenter.clearAllPostedNotifications()"))
        assertTrue(terminatorSource.contains("SmartHealthPushRegistrar.markLocalInvalidationPending()"))
        assertTrue(terminatorSource.contains("SmartHealthPushRegistrar.scheduleLocalTokenInvalidation()"))
        assertTrue(terminatorSource.contains("SmartHealthRepository.api.clearAuthTokenIfCurrent(it)"))
        assertTrue(terminatorSource.contains("FirebaseAuthService.signOutIfCurrentOwner(it)"))
        assertTrue(terminatorSource.contains("hasReplacementAuthority(authority)"))
    }

    @Test
    fun notificationDisplayIsBoundToTheAuthenticatedAccount() {
        assertTrue(messagingServiceSource.contains("SmartHealthNotificationCenter.showForegroundMessage"))
        assertTrue(notificationCenterSource.contains("SmartHealthNotificationSession.withAuthorizedDelivery"))
        assertTrue(notificationCenterSource.contains("FirebaseAuthService::currentUserIdOrNull"))
        assertTrue(notificationCenterSource.contains("payload[\"userId\"]"))
    }

    @Test
    fun navigationAbandonmentUsesTheSameFailClosedLocalNotificationTeardown() {
        assertTrue(
            navigationSource.contains(
                "SmartHealthSessionTerminator.terminateLocallyForAccountReplacement()",
            ),
        )
        assertTrue(
            terminatorSource.contains(
                "SmartHealthNotificationSession.deactivateAndClearPostedNotifications",
            ),
        )
        assertTrue(terminatorSource.contains("SmartHealthNotificationCenter.clearAllPostedNotifications()"))
        assertTrue(terminatorSource.contains("SmartHealthPushRegistrar.markLocalInvalidationPending()"))
        assertTrue(verificationSource.contains("BackHandler(onBack = onNavigateBack)"))
    }

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
