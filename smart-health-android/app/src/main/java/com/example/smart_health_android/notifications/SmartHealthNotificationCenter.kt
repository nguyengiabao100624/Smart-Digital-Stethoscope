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
import com.google.firebase.messaging.RemoteMessage

object SmartHealthNotificationIntentContract {
    const val EXTRA_DESTINATION_KIND =
        "com.example.smart_health_android.extra.NOTIFICATION_DESTINATION_KIND"
    const val EXTRA_DESTINATION_IDENTIFIER =
        "com.example.smart_health_android.extra.NOTIFICATION_DESTINATION_IDENTIFIER"

    private const val ACTION_OPEN_NOTIFICATION =
        "com.example.smart_health_android.action.OPEN_NOTIFICATION"

    private val fcmRoutingKeys = setOf(
        "destination",
        "screen",
        "route",
        "type",
        "recordId",
        "scanId",
        "notificationTargetId",
    )

    fun createIntent(
        context: Context,
        destination: SmartHealthNotificationDestination,
    ): Intent {
        return Intent(context, MainActivity::class.java).apply {
            action = ACTION_OPEN_NOTIFICATION
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_DESTINATION_KIND, destination.wireName)
            destination.identifier?.let { putExtra(EXTRA_DESTINATION_IDENTIFIER, it) }
        }
    }

    fun destinationFrom(intent: Intent?): SmartHealthNotificationDestination? {
        intent ?: return null

        if (intent.hasExtra(EXTRA_DESTINATION_KIND)) {
            return SmartHealthNotificationDestination.fromWire(
                wireName = intent.getStringExtra(EXTRA_DESTINATION_KIND),
                identifier = intent.getStringExtra(EXTRA_DESTINATION_IDENTIFIER),
            )
        }

        val extras = intent.extras ?: return null
        val payload = fcmRoutingKeys.mapNotNull { key ->
            extras.getString(key)?.takeIf(String::isNotBlank)?.let { key to it }
        }.toMap()
        return payload.takeIf(Map<String, String>::isNotEmpty)
            ?.let(SmartHealthNotificationDestination::fromPayload)
    }

    fun clearFrom(intent: Intent?) {
        intent ?: return
        intent.removeExtra(EXTRA_DESTINATION_KIND)
        intent.removeExtra(EXTRA_DESTINATION_IDENTIFIER)
        fcmRoutingKeys.forEach(intent::removeExtra)
    }
}

object SmartHealthNotificationCenter {
    fun ensureChannels(context: Context) {
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        val clinicalAlerts = NotificationChannel(
            SmartHealthNotificationChannel.ClinicalAlerts.channelId,
            context.getString(R.string.notification_channel_clinical_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.notification_channel_clinical_description)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
            enableVibration(true)
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

    @SuppressLint("MissingPermission")
    fun showForegroundMessage(
        context: Context,
        message: RemoteMessage,
    ): Boolean {
        if (!canPostNotifications(context)) return false
        ensureChannels(context)

        val payload = message.data
        val destination = SmartHealthNotificationDestination.fromPayload(payload)
        val channel = SmartHealthNotificationChannel.fromPayload(payload)
        val title = message.notification?.title
            ?: payload["title"]
            ?: context.getString(R.string.notification_default_title)
        val body = message.notification?.body
            ?: payload["body"]
            ?: payload["message"]
            ?: context.getString(R.string.notification_default_body)
        val notificationId = stableNotificationId(message, title, body)
        val contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            SmartHealthNotificationIntentContract.createIntent(context, destination),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val priority = if (channel == SmartHealthNotificationChannel.ClinicalAlerts) {
            NotificationCompat.PRIORITY_HIGH
        } else {
            NotificationCompat.PRIORITY_DEFAULT
        }

        val publicVersion = NotificationCompat.Builder(context, channel.channelId)
            .setSmallIcon(R.drawable.ic_notification_shcare)
            .setContentTitle(context.getString(R.string.notification_public_title))
            .setContentText(context.getString(R.string.notification_public_body))
            .setPriority(priority)
            .build()

        val notification = NotificationCompat.Builder(context, channel.channelId)
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

    private fun canPostNotifications(context: Context): Boolean {
        val runtimePermissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        return runtimePermissionGranted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private fun stableNotificationId(
        message: RemoteMessage,
        title: String,
        body: String,
    ): Int {
        val seed = message.messageId ?: "$title|$body|${message.sentTime}"
        return (seed.hashCode() and Int.MAX_VALUE).takeIf { it != 0 } ?: 1
    }
}
