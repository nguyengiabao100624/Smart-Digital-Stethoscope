package com.example.smart_health_android.data

import android.util.Log
import com.example.smart_health_android.notifications.SmartHealthNotificationCenter
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class SmartHealthFirebaseMessagingService : FirebaseMessagingService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        serviceScope.launch {
            runCatching {
                SmartHealthPushRegistrar.registerRefreshedToken(token)
            }.onFailure {
                Log.w("SmartHealthPush", "Cannot register refreshed FCM token: ${it.message}")
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val displayed = SmartHealthNotificationCenter.showForegroundMessage(this, message)
        Log.d(
            "SmartHealthPush",
            "Received FCM message type=${message.messageType.orEmpty()} " +
                "dataKeys=${message.data.keys.joinToString(",")} displayed=$displayed"
        )
    }
}
