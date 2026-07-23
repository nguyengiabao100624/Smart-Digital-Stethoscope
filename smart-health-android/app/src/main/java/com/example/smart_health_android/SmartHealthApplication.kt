package com.example.smart_health_android

import android.app.Application
import com.example.smart_health_android.notifications.SmartHealthNotificationCenter

class SmartHealthApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SmartHealthNotificationCenter.ensureChannels(this)
    }
}
