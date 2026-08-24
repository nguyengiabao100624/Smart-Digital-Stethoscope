package com.example.smart_health_android.notifications

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.example.smart_health_android.MainActivity
import com.example.smart_health_android.R
import com.example.smart_health_android.data.FirebaseAuthService
import com.google.firebase.messaging.RemoteMessage
import java.util.UUID

data class SmartHealthNotificationLaunchRequest(
    val destination: SmartHealthNotificationDestination,
    val ownerUserId: String,
    val workspaceId: String,
    val sessionGeneration: String,
)

object SmartHealthNotificationIntentContract {
    const val EXTRA_DESTINATION_KIND =
        "com.example.smart_health_android.extra.NOTIFICATION_DESTINATION_KIND"
    const val EXTRA_DESTINATION_IDENTIFIER =
        "com.example.smart_health_android.extra.NOTIFICATION_DESTINATION_IDENTIFIER"
    const val EXTRA_OWNER_USER_ID =
        "com.example.smart_health_android.extra.NOTIFICATION_OWNER_USER_ID"
    const val EXTRA_SESSION_GENERATION =
        "com.example.smart_health_android.extra.NOTIFICATION_SESSION_GENERATION"
    const val EXTRA_WORKSPACE_ID =
        "com.example.smart_health_android.extra.NOTIFICATION_WORKSPACE_ID"
    private const val EXTRA_AUTHENTICATOR_VERSION =
        "com.example.smart_health_android.extra.NOTIFICATION_AUTHENTICATOR_VERSION"
    private const val EXTRA_AUTHENTICATOR_NONCE =
        "com.example.smart_health_android.extra.NOTIFICATION_AUTHENTICATOR_NONCE"
    private const val EXTRA_AUTHENTICATOR_SIGNATURE =
        "com.example.smart_health_android.extra.NOTIFICATION_AUTHENTICATOR_SIGNATURE"

    private const val ACTION_OPEN_NOTIFICATION =
        "com.example.smart_health_android.action.OPEN_NOTIFICATION"
    private const val AUTHENTICATOR_VERSION = "2"
    private val authenticator = NotificationIntentAuthenticator()

    fun createIntent(
        context: Context,
        destination: SmartHealthNotificationDestination,
        ownerUserId: String,
        workspaceId: String,
        sessionGeneration: String,
    ): Intent {
        val canonicalOwnerUserId = ownerUserId.trim()
        require(canonicalOwnerUserId.isNotBlank()) {
            "Notification intents must be bound to a backend user"
        }
        val canonicalWorkspaceId = workspaceId.trim()
        require(canonicalWorkspaceId.isNotBlank()) {
            "Notification intents must be bound to a workspace"
        }
        val canonicalSessionGeneration = sessionGeneration.trim()
        require(canonicalSessionGeneration.isNotBlank()) {
            "Notification intents must be bound to an authenticated session generation"
        }
        val nonce = UUID.randomUUID().toString()
        val identifier = destination.identifier.orEmpty()
        val signature = authenticator.sign(
            authenticationFields(
                destinationKind = destination.wireName,
                destinationIdentifier = identifier,
                ownerUserId = canonicalOwnerUserId,
                workspaceId = canonicalWorkspaceId,
                sessionGeneration = canonicalSessionGeneration,
                nonce = nonce,
            ),
        )
        return Intent(context, MainActivity::class.java).apply {
            action = ACTION_OPEN_NOTIFICATION
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_DESTINATION_KIND, destination.wireName)
            putExtra(EXTRA_OWNER_USER_ID, canonicalOwnerUserId)
            putExtra(EXTRA_WORKSPACE_ID, canonicalWorkspaceId)
            putExtra(EXTRA_SESSION_GENERATION, canonicalSessionGeneration)
            putExtra(EXTRA_AUTHENTICATOR_VERSION, AUTHENTICATOR_VERSION)
            putExtra(EXTRA_AUTHENTICATOR_NONCE, nonce)
            putExtra(EXTRA_AUTHENTICATOR_SIGNATURE, signature)
            destination.identifier?.let { putExtra(EXTRA_DESTINATION_IDENTIFIER, it) }
        }
    }

    fun launchRequestFrom(intent: Intent?): SmartHealthNotificationLaunchRequest? {
        return runCatching {
            intent ?: return null
            if (
                intent.action != ACTION_OPEN_NOTIFICATION ||
                intent.component?.className != MainActivity::class.java.name
            ) {
                return null
            }
            if (intent.getStringExtra(EXTRA_AUTHENTICATOR_VERSION) != AUTHENTICATOR_VERSION) {
                return null
            }

            val destinationKind = intent.getStringExtra(EXTRA_DESTINATION_KIND)
                ?.takeIf(String::isNotBlank)
                ?: return null
            val destinationIdentifier =
                intent.getStringExtra(EXTRA_DESTINATION_IDENTIFIER).orEmpty()
            val ownerUserId = intent.getStringExtra(EXTRA_OWNER_USER_ID)
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: return null
            val workspaceId = intent.getStringExtra(EXTRA_WORKSPACE_ID)
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: return null
            val sessionGeneration = intent.getStringExtra(EXTRA_SESSION_GENERATION)
                ?.trim()
                ?.takeIf(String::isNotBlank)
                ?: return null
            val nonce = intent.getStringExtra(EXTRA_AUTHENTICATOR_NONCE)
                ?.takeIf(String::isNotBlank)
                ?: return null
            val signature = intent.getStringExtra(EXTRA_AUTHENTICATOR_SIGNATURE)
                ?.takeIf(String::isNotBlank)
                ?: return null
            if (
                !authenticator.verify(
                    fields = authenticationFields(
                        destinationKind = destinationKind,
                        destinationIdentifier = destinationIdentifier,
                        ownerUserId = ownerUserId,
                        workspaceId = workspaceId,
                        sessionGeneration = sessionGeneration,
                        nonce = nonce,
                    ),
                    encodedSignature = signature,
                )
            ) {
                return null
            }
            if (!SmartHealthNotificationSession.consumeLaunchNonce(nonce, sessionGeneration)) {
                return null
            }

            SmartHealthNotificationLaunchRequest(
                destination = SmartHealthNotificationDestination.fromWire(
                    wireName = destinationKind,
                    identifier = destinationIdentifier.takeIf(String::isNotBlank),
                ),
                ownerUserId = ownerUserId,
                workspaceId = workspaceId,
                sessionGeneration = sessionGeneration,
            )
        }.getOrNull()
    }

    fun clearFrom(intent: Intent?) {
        intent ?: return
        intent.removeExtra(EXTRA_DESTINATION_KIND)
        intent.removeExtra(EXTRA_DESTINATION_IDENTIFIER)
        intent.removeExtra(EXTRA_OWNER_USER_ID)
        intent.removeExtra(EXTRA_WORKSPACE_ID)
        intent.removeExtra(EXTRA_SESSION_GENERATION)
        intent.removeExtra(EXTRA_AUTHENTICATOR_VERSION)
        intent.removeExtra(EXTRA_AUTHENTICATOR_NONCE)
        intent.removeExtra(EXTRA_AUTHENTICATOR_SIGNATURE)
        if (intent.action == ACTION_OPEN_NOTIFICATION) {
            intent.action = null
        }
    }

    private fun authenticationFields(
        destinationKind: String,
        destinationIdentifier: String,
        ownerUserId: String,
        workspaceId: String,
        sessionGeneration: String,
        nonce: String,
    ): List<String> {
        return listOf(
            AUTHENTICATOR_VERSION,
            ACTION_OPEN_NOTIFICATION,
            MainActivity::class.java.name,
            destinationKind,
            destinationIdentifier,
            ownerUserId,
            workspaceId,
            sessionGeneration,
            nonce,
        )
    }
}

object SmartHealthNotificationCenter {
    @Volatile
    private var applicationContext: Context? = null

    fun ensureChannels(context: Context) {
        applicationContext = context.applicationContext
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        val clinicalAlerts = NotificationChannel(
            SmartHealthNotificationChannel.ClinicalAlerts.channelId,
            context.getString(R.string.notification_channel_clinical_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_clinical_description)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
            setShowBadge(true)
        }
        val generalUpdates = NotificationChannel(
            SmartHealthNotificationChannel.GeneralUpdates.channelId,
            context.getString(R.string.notification_channel_updates_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.notification_channel_updates_description)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
            setShowBadge(true)
        }

        notificationManager.createNotificationChannels(listOf(clinicalAlerts, generalUpdates))
    }

    fun clearAllPostedNotifications(context: Context? = null): Boolean {
        val resolvedContext = context?.applicationContext ?: applicationContext ?: return false
        return runCatching {
            NotificationManagerCompat.from(resolvedContext).cancelAll()
            true
        }.getOrDefault(false)
    }

    @SuppressLint("MissingPermission")
    fun showForegroundMessage(
        context: Context,
        message: RemoteMessage,
        currentFirebaseUserId: () -> String? = FirebaseAuthService::currentUserIdOrNull,
    ): Boolean {
        applicationContext = context.applicationContext
        ensureChannels(context)
        if (!canPostNotifications(context, SmartHealthNotificationChannel.GeneralUpdates)) {
            return false
        }

        val payload = message.data
        if (payload["notificationProtocolVersion"]?.trim() != NOTIFICATION_PROTOCOL_VERSION) {
            return false
        }
        val ownerUserId = payload["userId"]?.trim()?.takeIf(String::isNotBlank) ?: return false
        val canonicalWorkspaceId = payload["workspaceId"]?.trim()?.takeIf(String::isNotBlank)
        val compatibilityWorkspaceId =
            payload["organizationId"]?.trim()?.takeIf(String::isNotBlank)
        if (
            canonicalWorkspaceId != null &&
            compatibilityWorkspaceId != null &&
            canonicalWorkspaceId != compatibilityWorkspaceId
        ) {
            return false
        }
        val workspaceId = canonicalWorkspaceId ?: compatibilityWorkspaceId ?: return false
        val providerNotificationId = payload["notificationId"]
            ?.trim()
            ?.take(120)
            ?.takeIf(String::isNotBlank)
            ?: return false
        return SmartHealthNotificationSession.withAuthorizedDelivery(
            messageUserId = ownerUserId,
            messageWorkspaceId = workspaceId,
            currentFirebaseUserId = currentFirebaseUserId,
        ) { activeBinding ->
            postAuthorizedMessage(
                context = context,
                providerNotificationId = providerNotificationId,
                ownerUserId = ownerUserId,
                activeBinding = activeBinding,
            )
        } ?: false
    }

    @SuppressLint("MissingPermission")
    private fun postAuthorizedMessage(
        context: Context,
        providerNotificationId: String,
        ownerUserId: String,
        activeBinding: NotificationSessionBinding,
    ): Boolean {
        // FCM is only an owner-bound wake-up signal. Content, severity and clinical routing
        // remain in the authenticated inbox and are never trusted from provider payload data.
        val destination = SmartHealthNotificationDestination.Inbox
        val channel = SmartHealthNotificationChannel.GeneralUpdates
        val channelId = channel.channelId
        val title = context.getString(R.string.notification_default_title)
        val body = context.getString(R.string.notification_default_body)
        val notificationId = stableNotificationId(
            providerNotificationId = providerNotificationId,
            ownerUserId = ownerUserId,
            workspaceId = activeBinding.workspaceId,
        )
        val contentIntent = runCatching {
            PendingIntent.getActivity(
                context,
                ownerBoundRequestCode(
                    notificationId = notificationId,
                    ownerUserId = ownerUserId,
                    workspaceId = activeBinding.workspaceId,
                ),
                SmartHealthNotificationIntentContract.createIntent(
                    context = context,
                    destination = destination,
                    ownerUserId = ownerUserId,
                    workspaceId = activeBinding.workspaceId,
                    sessionGeneration = activeBinding.generation,
                ),
                PendingIntent.FLAG_UPDATE_CURRENT or
                    PendingIntent.FLAG_IMMUTABLE or
                    PendingIntent.FLAG_ONE_SHOT,
            )
        }.getOrNull() ?: return false
        val priority = if (channel == SmartHealthNotificationChannel.ClinicalAlerts) {
            NotificationCompat.PRIORITY_HIGH
        } else {
            NotificationCompat.PRIORITY_DEFAULT
        }

        val publicVersion = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification_shcare)
            .setContentTitle(context.getString(R.string.notification_public_title))
            .setContentText(context.getString(R.string.notification_public_body))
            .setPriority(priority)
            .build()

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification_shcare)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(priority)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .build()

        return runCatching {
            NotificationManagerCompat.from(context).notify(notificationId, notification)
            true
        }.getOrDefault(false)
    }

    private fun ownerBoundRequestCode(
        notificationId: Int,
        ownerUserId: String,
        workspaceId: String,
    ): Int {
        return ("$notificationId|$ownerUserId|$workspaceId".hashCode() and Int.MAX_VALUE)
            .takeIf { it != 0 }
            ?: notificationId
    }

    fun hasRuntimeNotificationPermission(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
    }

    fun areAppNotificationsEnabled(context: Context): Boolean {
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun isChannelEnabled(
        context: Context,
        channel: SmartHealthNotificationChannel,
    ): Boolean {
        val manager = context.getSystemService(NotificationManager::class.java)
        val systemChannel = manager.getNotificationChannel(channel.channelId) ?: return false
        return systemChannel.importance != NotificationManager.IMPORTANCE_NONE
    }

    private fun canPostNotifications(
        context: Context,
        channel: SmartHealthNotificationChannel,
    ): Boolean {
        return hasRuntimeNotificationPermission(context) &&
            areAppNotificationsEnabled(context) &&
            isChannelEnabled(context, channel)
    }

    private fun stableNotificationId(
        providerNotificationId: String,
        ownerUserId: String,
        workspaceId: String,
    ): Int {
        val seed = "$ownerUserId|$workspaceId|$providerNotificationId"
        return (seed.hashCode() and Int.MAX_VALUE).takeIf { it != 0 } ?: 1
    }

    private const val NOTIFICATION_PROTOCOL_VERSION = "2"
}
