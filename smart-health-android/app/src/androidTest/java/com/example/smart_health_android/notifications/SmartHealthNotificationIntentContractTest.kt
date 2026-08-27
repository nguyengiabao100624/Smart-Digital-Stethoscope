package com.example.smart_health_android.notifications

import android.content.Intent
import com.example.smart_health_android.MainActivity
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SmartHealthNotificationIntentContractTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun postedNotificationIntentCarriesItsBackendOwner() {
        val lease = SmartHealthNotificationSession.beginAuthentication(
            firebaseUserId = "firebase-user-a",
            workspaceId = "workspace-a",
        )
        assertTrue(SmartHealthNotificationSession.activate(lease, "backend-user-a"))
        val binding = requireNotNull(SmartHealthNotificationSession.activeBindingOrNull())
        val intent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.RecordDetail("record/42"),
            ownerUserId = " ${binding.backendUserId} ",
            workspaceId = " ${binding.workspaceId} ",
            sessionGeneration = " ${binding.generation} ",
        )

        assertEquals(
            SmartHealthNotificationLaunchRequest(
                destination = SmartHealthNotificationDestination.RecordDetail("record/42"),
                ownerUserId = "backend-user-a",
                workspaceId = "workspace-a",
                sessionGeneration = binding.generation,
            ),
            SmartHealthNotificationIntentContract.launchRequestFrom(intent),
        )
    }

    @Test
    fun signedNotificationIntentCanOnlyBeConsumedOnce() {
        val lease = SmartHealthNotificationSession.beginAuthentication(
            firebaseUserId = "firebase-replay-test",
            workspaceId = "workspace-replay-test",
        )
        assertTrue(SmartHealthNotificationSession.activate(lease, "backend-replay-test"))
        val binding = requireNotNull(SmartHealthNotificationSession.activeBindingOrNull())
        val intent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.Inbox,
            ownerUserId = binding.backendUserId,
            workspaceId = binding.workspaceId,
            sessionGeneration = binding.generation,
        )

        assertTrue(SmartHealthNotificationIntentContract.launchRequestFrom(intent) != null)
        assertNull(SmartHealthNotificationIntentContract.launchRequestFrom(Intent(intent)))
    }

    @Test
    fun ownerlessOrClearedNotificationIntentFailsClosed() {
        assertThrows(IllegalArgumentException::class.java) {
            SmartHealthNotificationIntentContract.createIntent(
                context = context,
                destination = SmartHealthNotificationDestination.Inbox,
                ownerUserId = " ",
                workspaceId = "workspace-a",
                sessionGeneration = "generation-a",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            SmartHealthNotificationIntentContract.createIntent(
                context = context,
                destination = SmartHealthNotificationDestination.Inbox,
                ownerUserId = "backend-user-a",
                workspaceId = " ",
                sessionGeneration = "generation-a",
            )
        }

        val intent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.Inbox,
            ownerUserId = "backend-user-a",
            workspaceId = "workspace-a",
            sessionGeneration = "generation-a",
        )
        SmartHealthNotificationIntentContract.clearFrom(intent)

        assertNull(SmartHealthNotificationIntentContract.launchRequestFrom(intent))
        assertFalse(intent.hasExtra(SmartHealthNotificationIntentContract.EXTRA_OWNER_USER_ID))
        assertFalse(intent.hasExtra(SmartHealthNotificationIntentContract.EXTRA_WORKSPACE_ID))
    }

    @Test
    fun exportedActivityRejectsRawFcmExtrasFromAnExternalIntent() {
        val forgedIntent = Intent(context, MainActivity::class.java).apply {
            action = "external.app.OPEN_SHCARE"
            putExtra("userId", "backend-user-a")
            putExtra("type", "abnormal_result")
            putExtra("recordId", "record-from-attacker")
        }

        assertNull(SmartHealthNotificationIntentContract.launchRequestFrom(forgedIntent))
    }

    @Test
    fun appCreatedIntentFailsClosedAfterItsOwnerIsTampered() {
        val tamperedIntent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.RecordDetail("record-42"),
            ownerUserId = "backend-user-a",
            workspaceId = "workspace-a",
            sessionGeneration = "generation-a",
        ).apply {
            putExtra(
                SmartHealthNotificationIntentContract.EXTRA_OWNER_USER_ID,
                "backend-user-b",
            )
        }

        assertNull(SmartHealthNotificationIntentContract.launchRequestFrom(tamperedIntent))
    }

    @Test
    fun appCreatedIntentFailsClosedAfterItsSessionGenerationIsTampered() {
        val tamperedIntent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.Inbox,
            ownerUserId = "backend-user-a",
            workspaceId = "workspace-a",
            sessionGeneration = "generation-a",
        ).apply {
            putExtra(
                SmartHealthNotificationIntentContract.EXTRA_SESSION_GENERATION,
                "generation-b",
            )
        }

        assertNull(SmartHealthNotificationIntentContract.launchRequestFrom(tamperedIntent))
    }

    @Test
    fun appCreatedIntentFailsClosedAfterItsWorkspaceIsTampered() {
        val tamperedIntent = SmartHealthNotificationIntentContract.createIntent(
            context = context,
            destination = SmartHealthNotificationDestination.Inbox,
            ownerUserId = "backend-user-a",
            workspaceId = "workspace-a",
            sessionGeneration = "generation-a",
        ).apply {
            putExtra(
                SmartHealthNotificationIntentContract.EXTRA_WORKSPACE_ID,
                "workspace-b",
            )
        }

        assertNull(SmartHealthNotificationIntentContract.launchRequestFrom(tamperedIntent))
    }

    @Test
    fun launcherMainIntentRemainsAPlainLauncherIntent() {
        val launcherIntent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LAUNCHER)
        }

        assertNull(SmartHealthNotificationIntentContract.launchRequestFrom(launcherIntent))
        SmartHealthNotificationIntentContract.clearFrom(launcherIntent)
        assertEquals(Intent.ACTION_MAIN, launcherIntent.action)
        assertTrue(launcherIntent.hasCategory(Intent.CATEGORY_LAUNCHER))
    }
}
