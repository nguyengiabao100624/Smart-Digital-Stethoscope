package com.example.smart_health_android.devices

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.MainActivity
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Physical-phone smoke test for the Android ESPTouch broadcaster itself.
 *
 * It intentionally uses an invalid test key and an invalid test password. Those values are
 * rejected by a real Shcare device, so this proves only that Android starts emitting ESPTouch
 * packets; it cannot provision, overwrite, or expose any real Wi-Fi credential.
 */
@RunWith(AndroidJUnit4::class)
class EspTouchV2BroadcastStartHilTest {
    @Test
    fun attachedPhoneStartsEsptouchV2BroadcastWithoutImmediateFailure() {
        runBlocking {
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val arguments = InstrumentationRegistry.getArguments()
            assumeTrue(
                "This physical broadcaster smoke test runs only when explicitly enabled.",
                arguments.getString("shcareSmartConfigStartHil").equals("true", ignoreCase = true),
            )
            val context = instrumentation.targetContext
            assertTrue(
                "Grant precise location from Shcare's Wi-Fi setup screen before this hardware check.",
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
                    PackageManager.PERMISSION_GRANTED,
            )

            ActivityScenario.launch(MainActivity::class.java).use { scenario ->
                lateinit var provisioner: AndroidDeviceWifiProvisioner
                scenario.onActivity { activity ->
                    provisioner = AndroidDeviceWifiProvisioner(activity)
                }
                val currentWifi = provisioner.currentWifiSsid()
                assertTrue(
                    "The foreground Shcare App must expose the current Wi-Fi SSID.",
                    currentWifi is DeviceCurrentWifiSsid.Available,
                )
                val targetSsid = (currentWifi as DeviceCurrentWifiSsid.Available).value
                val progress = mutableListOf<DeviceProvisioningProgress>()

                val result = withTimeoutOrNull(8_000L) {
                    provisioner.provision(
                        request = DeviceWifiProvisioningRequest(
                            deviceId = "shcare-hil-broadcast",
                            provisioningKey = ByteArray(16) { index -> (index + 1).toByte() },
                            reservedData = "v2:${"00".repeat(16)}".toByteArray(),
                            targetSsid = targetSsid,
                            targetPassword = "00000000",
                        ),
                        onProgress = { update -> synchronized(progress) { progress += update } },
                    )
                }

                // Normal ESPTouch operation runs for roughly 90 seconds. At eight seconds it
                // should still be broadcasting, not completed; a result or exception here is a
                // regression.
                assertTrue(
                    "ESPTouch V2 failed before starting. Progress: ${synchronized(progress) { progress.toList() }}",
                    result == null && synchronized(progress) {
                        DeviceProvisioningProgress.BroadcastingCredentials in progress
                    },
                )
            }
        }
    }
}
