package com.example.smart_health_android.devices

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.MainActivity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CurrentWifiSsidHilTest {
    @Test
    fun attachedPhoneExposesItsCurrentWifiForDeviceProvisioning() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val arguments = InstrumentationRegistry.getArguments()
        assumeTrue(
            "This hardware-in-loop check runs only when explicitly enabled.",
            arguments.getString("shcareWifiHil").equals("true", ignoreCase = true),
        )
        val context = instrumentation.targetContext
        val permission = Manifest.permission.ACCESS_FINE_LOCATION
        assertTrue(
            "Grant location from the App's pairing screen before running this HIL check.",
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED,
        )

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            var currentWifi: DeviceCurrentWifiSsid? = null
            scenario.onActivity { activity ->
                currentWifi = runBlocking {
                    AndroidDeviceWifiProvisioner(activity).currentWifiSsid()
                }
            }
            assertTrue(
                "The attached phone must expose a non-redacted connected Wi-Fi SSID while Shcare is foreground.",
                currentWifi is DeviceCurrentWifiSsid.Available &&
                    (currentWifi as DeviceCurrentWifiSsid.Available).value.isNotBlank(),
            )
        }
    }
}
