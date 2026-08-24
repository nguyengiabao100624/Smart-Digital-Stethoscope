package com.example.smart_health_android.notifications

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class NotificationDeliverySourceContractTest {
    private val apiSource = projectFile(
        "src/main/java/com/example/smart_health_android/data/SmartHealthApi.kt",
    ).readText()
    private val modelSource = projectFile(
        "src/main/java/com/example/smart_health_android/data/SmartHealthModels.kt",
    ).readText()
    private val notificationCenterSource = projectFile(
        "src/main/java/com/example/smart_health_android/notifications/SmartHealthNotificationCenter.kt",
    ).readText()
    private val notificationSessionSource = projectFile(
        "src/main/java/com/example/smart_health_android/notifications/SmartHealthNotificationSession.kt",
    ).readText()

    @Test
    fun parsesPerChannelDeliveryStateFromTheSharedBackendContract() {
        for (field in listOf(
            "campaignId",
            "requestedChannels",
            "inAppStatus",
            "emailStatus",
            "pushStatus",
            "readAt",
        )) {
            assertTrue("AppNotification must expose $field", modelSource.contains("val $field"))
            assertTrue("SmartHealthApi must parse $field", apiSource.contains("\"$field\""))
        }
    }

    @Test
    fun mobileClientDoesNotExposePlatformCampaignCreation() {
        assertFalse(apiSource.contains("createNotificationCampaign"))
        assertFalse(apiSource.contains("notifications/options"))
    }

    @Test
    fun notificationLaunchCapabilityIsOneShotAndPersistentlyConsumed() {
        assertTrue(notificationCenterSource.contains("PendingIntent.FLAG_ONE_SHOT"))
        assertTrue(notificationCenterSource.contains("consumeLaunchNonce(nonce, sessionGeneration)"))
        assertTrue(notificationSessionSource.contains("consumeNotificationIntentNonce"))
        assertTrue(notificationSessionSource.contains("MAX_CONSUMED_INTENT_NONCES = 64"))
        assertTrue(notificationSessionSource.contains("digestNonce"))
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
