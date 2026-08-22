package com.example.smart_health_android

import android.app.Application
import com.example.smart_health_android.account.ShcareFamilyMutationOutbox
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.notifications.SmartHealthNotificationCenter
import com.example.smart_health_android.notifications.SmartHealthNotificationSession
import com.example.smart_health_android.records.RecordAudioCache
import com.example.smart_health_android.security.SmartHealthBiometricLocalUnlock

class SmartHealthApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        RecordAudioCache.initialize(this)
        ShcareFamilyMutationOutbox.initialize(this)
        SmartHealthBiometricLocalUnlock.initialize(this)
        SmartHealthPushRegistrar.initialize(this)
        SmartHealthNotificationSession.initialize(
            context = this,
            currentFirebaseUserId = FirebaseAuthService.currentUserIdOrNull(),
            invalidationPending = SmartHealthPushRegistrar.hasPendingInvalidation(),
        )
        if (SmartHealthPushRegistrar.hasPendingInvalidation()) {
            SmartHealthPushRegistrar.scheduleLocalTokenInvalidation()
        }
        SmartHealthNotificationCenter.ensureChannels(this)
    }
}
