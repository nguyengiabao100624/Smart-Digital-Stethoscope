package com.example.smart_health_android.data

import android.util.Log
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
        Log.d(
            "SmartHealthPush",
            "Received FCM message type=${message.messageType.orEmpty()} dataKeys=${message.data.keys.joinToString(",")}"
        )
    }
}
