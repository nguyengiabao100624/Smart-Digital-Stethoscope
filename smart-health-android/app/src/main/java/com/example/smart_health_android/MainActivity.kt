package com.example.smart_health_android

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import com.example.smart_health_android.navigation.AppNavGraph
import com.example.smart_health_android.navigation.ShcareExternalDeepLinkContract
import com.example.smart_health_android.navigation.ShcareExternalDeepLinkLaunchRequest
import com.example.smart_health_android.navigation.ShcareMobileSessionAuthority
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.notifications.SmartHealthNotificationIntentContract
import com.example.smart_health_android.notifications.SmartHealthNotificationLaunchRequest
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : FragmentActivity() {
    private val pendingNotificationLaunchRequest =
        MutableStateFlow<SmartHealthNotificationLaunchRequest?>(null)
    private val pendingExternalDeepLinkLaunchRequest =
        MutableStateFlow<ShcareExternalDeepLinkLaunchRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingNotificationLaunchRequest.value =
            SmartHealthNotificationIntentContract.launchRequestFrom(intent)
        pendingExternalDeepLinkLaunchRequest.value = bindExternalDeepLink(intent)
        enableEdgeToEdge()
        setContent {
            val notificationLaunchRequest by pendingNotificationLaunchRequest.collectAsState()
            val externalDeepLinkLaunchRequest by
                pendingExternalDeepLinkLaunchRequest.collectAsState()
            ShcareMobileTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppNavGraph(
                        notificationLaunchRequest = notificationLaunchRequest,
                        onNotificationLaunchRequestConsumed = {
                            pendingNotificationLaunchRequest.value = null
                            SmartHealthNotificationIntentContract.clearFrom(intent)
                        },
                        externalDeepLinkLaunchRequest = externalDeepLinkLaunchRequest,
                        onExternalDeepLinkLaunchRequestConsumed = {
                            pendingExternalDeepLinkLaunchRequest.value = null
                            intent.data = null
                        },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingNotificationLaunchRequest.value =
            SmartHealthNotificationIntentContract.launchRequestFrom(intent)
        pendingExternalDeepLinkLaunchRequest.value = bindExternalDeepLink(intent)
    }

    private fun bindExternalDeepLink(intent: Intent): ShcareExternalDeepLinkLaunchRequest? {
        if (intent.action != Intent.ACTION_VIEW) return null
        return ShcareExternalDeepLinkContract.bind(
            rawUri = intent.dataString,
            currentAuthority = ShcareMobileSessionAuthority.store.state.value.authority,
            currentFirebaseOwner = FirebaseAuthService.currentOwnerBindingOrNull(),
        )
    }
}
