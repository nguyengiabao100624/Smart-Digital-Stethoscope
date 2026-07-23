package com.example.smart_health_android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.example.smart_health_android.navigation.AppNavGraph
import com.example.smart_health_android.notifications.SmartHealthNotificationDestination
import com.example.smart_health_android.notifications.SmartHealthNotificationIntentContract
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    private val pendingNotificationDestination =
        MutableStateFlow<SmartHealthNotificationDestination?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingNotificationDestination.value =
            SmartHealthNotificationIntentContract.destinationFrom(intent)
        enableEdgeToEdge()
        setContent {
            val notificationDestination by pendingNotificationDestination.collectAsState()
            ShcareMobileTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppNavGraph(
                        notificationDestination = notificationDestination,
                        onNotificationDestinationConsumed = {
                            pendingNotificationDestination.value = null
                            SmartHealthNotificationIntentContract.clearFrom(intent)
                        },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingNotificationDestination.value =
            SmartHealthNotificationIntentContract.destinationFrom(intent)
    }
}
