package com.example.smart_health_android.devices

import com.espressif.iot.esptouch2.provision.EspProvisioner
import com.espressif.iot.esptouch2.provision.EspProvisioningListener
import com.espressif.iot.esptouch2.provision.EspProvisioningRequest
import com.espressif.iot.esptouch2.provision.EspProvisioningResult
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.MainActivity
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.security.LoginAccountMode
import com.example.smart_health_android.security.LoginResult
import com.example.smart_health_android.security.ProductionLoginRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

/**
 * Physical transport diagnostic only.  It obtains the real short-lived setup
 * material through the normal authenticated endpoint but deliberately sends a
 * non-network password.  The attached handset's SSID and BSSID are supplied
 * only as transient runner arguments because Xiaomi redacts them from a test
 * process that has no user-granted location permission.  The ESP serial log
 * is the evidence that the AES/binding payload reached this exact device;
 * this test proves that Android can emit that authenticated payload without
 * immediate failure.  It never reads or transmits the customer's Wi-Fi
 * password, and the firmware cannot persist the deliberately invalid one.
 */
@RunWith(AndroidJUnit4::class)
class EspTouchV2HardwareNegativeCredentialHilTest {
    @Test
    fun realSetupMaterialReachesTheEspWithoutUsingCustomerWifiPassword() = runBlocking {
        assumeTrue(
            "Run only when explicitly requested for attached-hardware diagnosis.",
            androidx.test.platform.app.InstrumentationRegistry.getArguments()
                .getString("shcareSmartConfigHardwareNegativeHil") == "true",
        )
        assumeTrue(
            "This HIL requires the local Firebase Auth emulator APK.",
            BuildConfig.SHCARE_FIREBASE_AUTH_EMULATOR_HOST.isNotBlank(),
        )
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val arguments = InstrumentationRegistry.getArguments()
        val context = instrumentation.targetContext
        val targetSsid = requireNotNull(arguments.getString("shcareSmartConfigTargetSsid"))
            .trim()
            .takeIf(String::isNotEmpty)
            ?: error("The HIL runner must provide the current Wi-Fi SSID.")
        val targetBssid = parseHilBssid(arguments.getString("shcareSmartConfigTargetBssid"))
            ?: error("The HIL runner must provide the current Wi-Fi BSSID.")
        val diagnosticWindowMillis = arguments
            .getString("shcareSmartConfigDiagnosticWindowMillis")
            ?.toLongOrNull()
            ?.takeIf { it in 5_000L..60_000L }

        val scenario = ActivityScenario.launch(MainActivity::class.java)
        try {
            // Xiaomi redacts current Wi-Fi identity from a backgrounded test
            // process.  The real flow is foreground-only, so make that same
            // condition explicit before querying SSID/BSSID.
            delay(750)
            val login = ProductionLoginRepository(context).signIn(
                mode = LoginAccountMode.Patient,
                email = "patient@example.com",
                password = "12345678",
            )
            check(login is LoginResult.Authenticated) {
                "The local demo patient was not authenticated for the hardware diagnostic."
            }

            val device = SmartHealthRepository.api.listDevices()
                .firstOrNull { it.id == "shcare-g3-hil" }
                ?: error("The HIL device is unavailable to the authenticated demo patient.")
            val session = SmartHealthRepository.api.openDeviceWifiSetup(device.id)
            val request = DeviceWifiProvisioningRequest(
                deviceId = device.id,
                provisioningKey = session.provisioningKey.copyOf(),
                reservedData = session.reservedData.copyOf(),
                targetSsid = targetSsid,
                targetPassword = "diagnostic-password-not-for-the-router",
            )
            try {
                // A short transport-only window is used to read the ESP's
                // safe serial framing diagnosis.  The normal app deliberately
                // treats a missing direct response as expected and verifies
                // authenticated presence instead; the diagnostic does the
                // same, because its fake credential cannot associate.
                val outcome = withTimeoutOrNull(diagnosticWindowMillis ?: 20_000L) {
                    directEspTouchV2DiagnosticBroadcast(
                        context = context,
                        request = request,
                        targetBssid = targetBssid,
                    )
                }
                require(
                    outcome == null || outcome == DeviceSmartConfigBroadcastResult.DirectAcknowledged,
                ) { "Unexpected ESPTouch V2 diagnostic result: $outcome" }
            } finally {
                request.clearSensitiveMaterial()
                session.clearSensitiveMaterial()
            }
        } finally {
            scenario.close()
        }
    }
}

private suspend fun directEspTouchV2DiagnosticBroadcast(
    context: android.content.Context,
    request: DeviceWifiProvisioningRequest,
    targetBssid: ByteArray,
): DeviceSmartConfigBroadcastResult = withTimeout(95_000L) {
    suspendCancellableCoroutine { continuation ->
        val completed = AtomicBoolean(false)
        val provisioner = EspProvisioner(context)
        val ssid = request.targetSsid.toByteArray(Charsets.UTF_8)
        val password = request.targetPassword.toByteArray(Charsets.UTF_8)
        val reservedData = request.reservedData.copyOf()
        val aesKey = request.provisioningKey.copyOf()
        fun clearRequestMaterial() {
            ssid.fill(0)
            password.fill(0)
            reservedData.fill(0)
            aesKey.fill(0)
        }
        fun close() {
            runCatching { provisioner.stopProvisioning() }
            runCatching { provisioner.close() }
            clearRequestMaterial()
        }
        continuation.invokeOnCancellation {
            if (completed.compareAndSet(false, true)) close()
        }
        val listener = object : EspProvisioningListener {
            override fun onStart() = Unit

            override fun onResponse(result: EspProvisioningResult) {
                if (!completed.compareAndSet(false, true)) return
                close()
                if (continuation.isActive) {
                    continuation.resume(DeviceSmartConfigBroadcastResult.DirectAcknowledged)
                }
            }

            override fun onStop() {
                if (!completed.compareAndSet(false, true)) return
                close()
                if (continuation.isActive) {
                    continuation.resume(
                        DeviceSmartConfigBroadcastResult.BroadcastCompletedWithoutDirectResponse,
                    )
                }
            }

            override fun onError(error: Exception) {
                if (!completed.compareAndSet(false, true)) return
                close()
                if (continuation.isActive) continuation.resumeWith(Result.failure(error))
            }
        }
        val espRequest = EspProvisioningRequest.Builder(context)
            .setSSID(ssid)
            .setBSSID(targetBssid)
            .setPassword(password)
            .setReservedData(reservedData)
            .setAESKey(aesKey)
            .build()
        runCatching { provisioner.startProvisioning(espRequest, listener) }
            .onFailure { error ->
                if (completed.compareAndSet(false, true)) {
                    close()
                    if (continuation.isActive) continuation.resumeWith(Result.failure(error))
                }
            }
    }
}

private fun parseHilBssid(raw: String?): ByteArray? = raw
    ?.trim()
    ?.split(':')
    ?.takeIf { it.size == 6 && it.all { part -> part.matches(Regex("[0-9A-Fa-f]{2}")) } }
    ?.map { part -> part.toInt(16).toByte() }
    ?.toByteArray()
