package com.example.smart_health_android.devices

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
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
        assumeTrue(
            "Grant location from the App's pairing screen before running this HIL check.",
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED,
        )

        val currentWifi = AndroidDeviceWifiProvisioner(context).currentWifiSsid()
        assertTrue(
            "The attached phone must expose a non-redacted connected Wi-Fi SSID.",
            currentWifi is DeviceCurrentWifiSsid.Available && currentWifi.value.isNotBlank(),
        )
    }
}
