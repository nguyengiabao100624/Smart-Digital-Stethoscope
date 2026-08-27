package com.example.smart_health_android.devices

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import com.espressif.iot.esptouch2.provision.EspProvisioner
import com.espressif.iot.esptouch2.provision.EspProvisioningListener
import com.espressif.iot.esptouch2.provision.EspProvisioningRequest
import com.espressif.iot.esptouch2.provision.EspProvisioningResult
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class DeviceWifiProvisioningRequest(
    val deviceId: String,
    val provisioningKey: ByteArray,
    val reservedData: ByteArray,
    val targetSsid: String,
    val targetPassword: String,
) {
    fun clearSensitiveMaterial() {
        provisioningKey.fill(0)
        reservedData.fill(0)
    }
}

sealed interface DeviceWifiProvisioningAvailability {
    data object Available : DeviceWifiProvisioningAvailability
    data class PermissionRequired(val permissions: List<String>) : DeviceWifiProvisioningAvailability
    data object Unsupported : DeviceWifiProvisioningAvailability
}

enum class DeviceProvisioningProgress {
    Idle,
    CheckingTargetNetwork,
    PreparingSecureSession,
    BroadcastingCredentials,
    BroadcastCompletedWithoutDirectResponse,
    DeviceAcknowledged,
    WaitingForDeviceOnline,
    WaitingForDeviceOnlineWithoutDirectResponse,
    CheckingDeviceOnline,
    CheckingDeviceOnlineWithoutDirectResponse,
    TargetNetworkUnavailable,
    SmartConfigFailed,
    DeviceNotOnline,
    DeviceNotOnlineWithoutDirectResponse,
    DeviceOnline,
}

enum class DeviceSmartConfigBroadcastResult {
    DirectAcknowledged,
    BroadcastCompletedWithoutDirectResponse,
}

class DeviceSetupNetworkUnavailableException : IOException(
    "ESP setup network was not selected or is unavailable",
)

open class DeviceSmartConfigUnavailableException(message: String) : IOException(message)

class DeviceSmartConfigNetworkMismatchException : DeviceSmartConfigUnavailableException(
    "The phone must stay connected to the Wi-Fi network being provisioned",
)

sealed interface DeviceCurrentWifiSsid {
    data class Available(val value: String) : DeviceCurrentWifiSsid
    data class PermissionRequired(val permissions: List<String>) : DeviceCurrentWifiSsid
    data object LocationDisabled : DeviceCurrentWifiSsid
    data object Unavailable : DeviceCurrentWifiSsid
}

interface DeviceWifiProvisioner {
    fun availability(): DeviceWifiProvisioningAvailability
    suspend fun currentWifiSsid(): DeviceCurrentWifiSsid
    suspend fun provision(
        request: DeviceWifiProvisioningRequest,
        onProgress: (DeviceProvisioningProgress) -> Unit,
    ): DeviceSmartConfigBroadcastResult
}

object UnsupportedDeviceWifiProvisioner : DeviceWifiProvisioner {
    override fun availability(): DeviceWifiProvisioningAvailability =
        DeviceWifiProvisioningAvailability.Unsupported

    override suspend fun currentWifiSsid(): DeviceCurrentWifiSsid = DeviceCurrentWifiSsid.Unavailable

    override suspend fun provision(
        request: DeviceWifiProvisioningRequest,
        onProgress: (DeviceProvisioningProgress) -> Unit,
    ): DeviceSmartConfigBroadcastResult {
        throw UnsupportedOperationException("In-app Wi-Fi provisioning is unavailable")
    }
}

class AndroidDeviceWifiProvisioner(context: Context) : DeviceWifiProvisioner {
    private val applicationContext = context.applicationContext
    private val connectivityManager = applicationContext.getSystemService(ConnectivityManager::class.java)
    private val wifiManager = applicationContext.getSystemService(WifiManager::class.java)
    private val locationManager = applicationContext.getSystemService(LocationManager::class.java)

    override fun availability(): DeviceWifiProvisioningAvailability {
        if (connectivityManager == null || wifiManager == null) {
            return DeviceWifiProvisioningAvailability.Unsupported
        }
        // ESPTouch broadcasts to the known Wi-Fi network; it does not discover,
        // pair, or connect to nearby devices. Android still protects the current
        // SSID/BSSID as location-sensitive Wi-Fi information, so request only
        // location at the moment it is needed. Android requires the coarse
        // declaration alongside fine location for scan results on modern SDKs.
        val permissions = wifiLocationPermissions()
        return if (hasWifiLocationPermission()) {
            DeviceWifiProvisioningAvailability.Available
        } else {
            DeviceWifiProvisioningAvailability.PermissionRequired(permissions)
        }
    }

    override suspend fun currentWifiSsid(): DeviceCurrentWifiSsid {
        val permissions = wifiLocationPermissions()
        if (!hasWifiLocationPermission()) {
            return DeviceCurrentWifiSsid.PermissionRequired(permissions)
        }
        if (!isLocationEnabled()) {
            return DeviceCurrentWifiSsid.LocationDisabled
        }

        val rawSsid = runCatching { currentWifiInfo()?.ssid }.getOrNull()
        return normalizeCurrentWifiSsid(rawSsid)
            ?.let(DeviceCurrentWifiSsid::Available)
            ?: DeviceCurrentWifiSsid.Unavailable
    }

    @Suppress("DEPRECATION")
    private suspend fun currentWifiInfo(): WifiInfo? {
        val activeWifiInfo = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> currentWifiInfoApi31()
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> currentWifiInfoApi29()
            else -> null
        }
        return activeWifiInfo ?: wifiManager?.connectionInfo
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private suspend fun currentWifiInfoApi31(): WifiInfo? {
        val manager = connectivityManager ?: return null
        return withTimeoutOrNull(CurrentWifiInfoTimeoutMillis) {
            suspendCancellableCoroutine { continuation ->
                val completed = AtomicBoolean(false)
                lateinit var callback: ConnectivityManager.NetworkCallback

                fun finish(info: WifiInfo?) {
                    if (!completed.compareAndSet(false, true)) return
                    runCatching { manager.unregisterNetworkCallback(callback) }
                    if (continuation.isActive) continuation.resume(info)
                }

                callback = object : ConnectivityManager.NetworkCallback(
                    ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO,
                ) {
                    override fun onCapabilitiesChanged(
                        network: Network,
                        networkCapabilities: NetworkCapabilities,
                    ) {
                        if (!networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return
                        finish(networkCapabilities.transportInfo as? WifiInfo)
                    }

                    override fun onUnavailable() = finish(null)
                }

                continuation.invokeOnCancellation {
                    if (completed.compareAndSet(false, true)) {
                        runCatching { manager.unregisterNetworkCallback(callback) }
                    }
                }
                runCatching { manager.registerDefaultNetworkCallback(callback) }
                    .onFailure { error ->
                        if (completed.compareAndSet(false, true) && continuation.isActive) {
                            continuation.resumeWithException(error)
                        }
                    }
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun currentWifiInfoApi29(): WifiInfo? = connectivityManager
            ?.activeNetwork
            ?.let(connectivityManager::getNetworkCapabilities)
            ?.takeIf { capabilities ->
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
            }
            ?.transportInfo as? WifiInfo

    @Suppress("DEPRECATION")
    private fun isLocationEnabled(): Boolean = locationManager?.let { manager ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            manager.isLocationEnabled
        } else {
            runCatching {
                manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                    manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            }.getOrDefault(false)
        }
    } ?: false

    override suspend fun provision(
        request: DeviceWifiProvisioningRequest,
        onProgress: (DeviceProvisioningProgress) -> Unit,
    ): DeviceSmartConfigBroadcastResult {
        if (availability() != DeviceWifiProvisioningAvailability.Available) {
            throw SecurityException("Wi-Fi access permission is unavailable")
        }
        val targetErrors = validateTargetWifiCredentials(request.targetSsid, request.targetPassword)
        if (targetErrors.isNotEmpty()) throw IOException("Target Wi-Fi credentials are invalid")
        val wifiInfo = currentWifiInfo()
            ?: throw DeviceSmartConfigUnavailableException("Current Wi-Fi information is unavailable")
        val currentSsid = normalizeCurrentWifiSsid(wifiInfo.ssid)
            ?: throw DeviceSmartConfigUnavailableException("Current Wi-Fi name is unavailable")
        if (currentSsid != request.targetSsid.trim()) {
            throw DeviceSmartConfigNetworkMismatchException()
        }
        if (!isValidSmartConfigV2Material(request.deviceId, request.provisioningKey, request.reservedData)) {
            throw DeviceSmartConfigUnavailableException("Device setup authorization is invalid")
        }
        val aesKey = request.provisioningKey.copyOf()
        val deviceBinding = request.reservedData.copyOf()
        val ssidBytes = request.targetSsid.trim().toByteArray(Charsets.UTF_8)
        val passwordBytes = request.targetPassword.toByteArray(Charsets.UTF_8)

        return try {
            // ESPTouch V2 encodes the BSSID of the access point that the phone
            // is actually using to transmit its broadcast.  On a dual-band
            // router this can be the 5 GHz BSSID while the ESP later associates
            // to the 2.4 GHz radio under the same SSID.  Substituting a scanned
            // 2.4 GHz BSSID makes the V2 payload fail its integrity check, so
            // do not switch networks or rewrite this identity.
            val bssid = currentRouterBssid(wifiInfo)
            onProgress(DeviceProvisioningProgress.PreparingSecureSession)
            val espRequest = EspProvisioningRequest.Builder(applicationContext)
                .setSSID(ssidBytes)
                .setBSSID(bssid)
                .setPassword(passwordBytes)
                .setReservedData(deviceBinding)
                .setAESKey(aesKey)
                .build()
            val broadcastResult = broadcastSmartConfig(
                request = espRequest,
                onStarted = { onProgress(DeviceProvisioningProgress.BroadcastingCredentials) },
            )
            when (broadcastResult) {
                DeviceSmartConfigBroadcastResult.DirectAcknowledged ->
                    onProgress(DeviceProvisioningProgress.DeviceAcknowledged)

                DeviceSmartConfigBroadcastResult.BroadcastCompletedWithoutDirectResponse ->
                    onProgress(
                        DeviceProvisioningProgress.BroadcastCompletedWithoutDirectResponse,
                    )
            }
            broadcastResult
        } finally {
            aesKey.fill(0)
            deviceBinding.fill(0)
            ssidBytes.fill(0)
            passwordBytes.fill(0)
        }
    }

    private fun currentRouterBssid(currentWifiInfo: WifiInfo): ByteArray =
        parseWifiBssid(currentWifiInfo.bssid)
            ?: throw DeviceSmartConfigUnavailableException(
                "Current Wi-Fi access point identity is unavailable",
            )

    private fun wifiLocationPermissions(): List<String> = listOf(
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.ACCESS_FINE_LOCATION,
    )

    private fun hasWifiLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(
            applicationContext,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED

    private suspend fun broadcastSmartConfig(
        request: EspProvisioningRequest,
        onStarted: () -> Unit,
    ): DeviceSmartConfigBroadcastResult = withTimeout(SmartConfigTimeoutMillis) {
        suspendCancellableCoroutine { continuation ->
            val completed = AtomicBoolean(false)
            val provisioner = try {
                EspProvisioner(applicationContext)
            } catch (error: Throwable) {
                Log.w(
                    SmartConfigLogTag,
                    "ESPTouch V2 provisioner could not start: ${error::class.java.simpleName}",
                )
                continuation.resumeWithException(
                    DeviceSmartConfigUnavailableException("ESPTouch V2 broadcast could not start"),
                )
                return@suspendCancellableCoroutine
            }
            fun closeProvisioner() {
                runCatching { provisioner.stopProvisioning() }
                runCatching { provisioner.close() }
            }
            continuation.invokeOnCancellation {
                if (completed.compareAndSet(false, true)) closeProvisioner()
            }
            val listener = object : EspProvisioningListener {
                override fun onStart() = onStarted()

                override fun onResponse(result: EspProvisioningResult) {
                    if (!completed.compareAndSet(false, true)) return
                    closeProvisioner()
                    if (continuation.isActive) {
                        continuation.resume(DeviceSmartConfigBroadcastResult.DirectAcknowledged)
                    }
                }

                override fun onStop() {
                    if (!completed.compareAndSet(false, true)) return
                    closeProvisioner()
                    // Espressif ends the 90-second UDP broadcast with onStop
                    // when no direct response reaches the phone. AP isolation or
                    // the ESP switching networks can suppress that response even
                    // after it received the credentials. Presence is the source
                    // of truth, so continue with authenticated online polling.
                    Log.i(
                        SmartConfigLogTag,
                        "ESPTouch V2 broadcast completed without a direct response; checking presence",
                    )
                    if (continuation.isActive) {
                        continuation.resume(
                            DeviceSmartConfigBroadcastResult
                                .BroadcastCompletedWithoutDirectResponse,
                        )
                    }
                }

                override fun onError(error: Exception) {
                    if (!completed.compareAndSet(false, true)) return
                    closeProvisioner()
                    Log.w(
                        SmartConfigLogTag,
                        "ESPTouch V2 broadcast failed: ${error::class.java.simpleName}",
                    )
                    if (continuation.isActive) continuation.resumeWithException(
                        DeviceSmartConfigUnavailableException("ESPTouch V2 broadcast could not start"),
                    )
                }
            }
            try {
                provisioner.startProvisioning(request, listener)
            } catch (error: Throwable) {
                if (completed.compareAndSet(false, true)) {
                    closeProvisioner()
                    Log.w(
                        SmartConfigLogTag,
                        "ESPTouch V2 broadcast start failed: ${error::class.java.simpleName}",
                    )
                    if (continuation.isActive) continuation.resumeWithException(
                        DeviceSmartConfigUnavailableException("ESPTouch V2 broadcast could not start"),
                    )
                }
            }
        }
    }

    private companion object {
        const val CurrentWifiInfoTimeoutMillis = 2_000L
        const val SmartConfigTimeoutMillis = 95_000L
        const val SmartConfigLogTag = "ShcareSmartConfig"
    }
}

private val CanonicalSmartConfigDeviceId = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$")

fun isValidSmartConfigV2Material(
    deviceId: String,
    provisioningKey: ByteArray,
    reservedData: ByteArray,
): Boolean {
    val canonicalDeviceId = deviceId.trim()
    return CanonicalSmartConfigDeviceId.matches(canonicalDeviceId) &&
        provisioningKey.size == SmartConfigV2KeyBytes &&
        reservedData.size == SmartConfigV2ReservedDataBytes &&
        reservedData[0] == SmartConfigV2ReservedPrefix[0] &&
        reservedData[1] == SmartConfigV2ReservedPrefix[1] &&
        reservedData[2] == SmartConfigV2ReservedPrefix[2] &&
        reservedData.drop(3).all { byte ->
            (byte in '0'.code.toByte()..'9'.code.toByte()) ||
                (byte in 'a'.code.toByte()..'f'.code.toByte())
        }
}

private const val SmartConfigV2KeyBytes = 16
private const val SmartConfigV2ReservedDataBytes = 35
private val SmartConfigV2ReservedPrefix = byteArrayOf('v'.code.toByte(), '2'.code.toByte(), ':'.code.toByte())

private fun parseWifiBssid(raw: String?): ByteArray? {
    val segments = raw?.trim()?.split(':') ?: return null
    if (segments.size != 6) return null
    val bytes = ByteArray(6)
    for (index in segments.indices) {
        val segment = segments[index]
        if (segment.length != 2) return null
        bytes[index] = segment.toIntOrNull(16)?.toByte() ?: return null
    }
    return bytes.takeUnless { parsed -> parsed.all { it == 0.toByte() } || parsed.contentEquals(byteArrayOf(2, 0, 0, 0, 0, 0)) }
}

enum class DeviceTargetWifiField {
    Ssid,
    Password,
}

fun validateTargetWifiCredentials(ssid: String, password: String): Set<DeviceTargetWifiField> =
    buildSet {
        val canonicalSsid = ssid.trim()
        val ssidBytes = canonicalSsid.toByteArray(Charsets.UTF_8).size
        if (ssidBytes !in 1..32 || canonicalSsid.any { it == '\n' || it == '\r' || it.code == 0 }) {
            add(DeviceTargetWifiField.Ssid)
        }
        val passwordBytes = password.toByteArray(Charsets.UTF_8).size
        if (password.isNotEmpty() && passwordBytes !in 8..63) {
            add(DeviceTargetWifiField.Password)
        }
    }

fun normalizeCurrentWifiSsid(rawSsid: String?): String? {
    val trimmed = rawSsid?.trim().orEmpty()
    val unquoted = if (trimmed.length >= 2 && trimmed.first() == '"' && trimmed.last() == '"') {
        trimmed.substring(1, trimmed.lastIndex)
    } else {
        trimmed
    }
    if (
        unquoted.isBlank() ||
        unquoted.equals(WifiManager.UNKNOWN_SSID, ignoreCase = true) ||
        unquoted.equals("<unknown ssid>", ignoreCase = true)
    ) {
        return null
    }
    val byteLength = unquoted.toByteArray(Charsets.UTF_8).size
    return unquoted.takeIf { ssid ->
        byteLength in 1..32 && ssid.none { it == '\n' || it == '\r' || it.code == 0 }
    }
}
