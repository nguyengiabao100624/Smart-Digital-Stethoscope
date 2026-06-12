package com.example.smart_health_android.data

import android.util.Log
import com.google.android.gms.tasks.Task
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

object SmartHealthPushRegistrar {
    private const val TAG = "SmartHealthPush"

    suspend fun registerCurrentTokenIfAuthenticated(): Boolean {
        if (SmartHealthRepository.api.currentAuthToken().isNullOrBlank()) {
            return false
        }
        val token = FirebaseMessaging.getInstance().token.await()
            .takeIf { it.isNotBlank() }
            ?: return false
        SmartHealthRepository.api.registerNotificationDevice(token)
        Log.d(TAG, "FCM token registered with Smart Health backend")
        return true
    }

    suspend fun registerRefreshedToken(token: String): Boolean {
        if (token.isBlank() || SmartHealthRepository.api.currentAuthToken().isNullOrBlank()) {
            return false
        }
        SmartHealthRepository.api.registerNotificationDevice(token)
        Log.d(TAG, "Refreshed FCM token registered with Smart Health backend")
        return true
    }

    private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
        addOnSuccessListener { result -> continuation.resume(result) }
        addOnFailureListener { error -> continuation.resumeWithException(error) }
        addOnCanceledListener { continuation.cancel() }
    }
}
