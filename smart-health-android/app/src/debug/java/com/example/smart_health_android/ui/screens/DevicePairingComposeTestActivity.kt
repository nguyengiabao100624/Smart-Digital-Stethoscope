package com.example.smart_health_android.ui.screens

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity

/** Test-only host that remains visible during long physical-device suites. */
class DevicePairingComposeTestActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setShowWhenLocked(true)
        setTurnScreenOn(true)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
}
