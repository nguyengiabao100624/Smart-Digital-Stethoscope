package com.example.smart_health_android.devices

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class DeviceWifiProvisioningRequest(
    val deviceId: String,
    val setupSsid: String,
    val setupPassphrase: String,
    val targetSsid: String,
    val targetPassword: String,
)

sealed interface DeviceWifiProvisioningAvailability {
    data object Available : DeviceWifiProvisioningAvailability
    data class PermissionRequired(val permissions: List<String>) : DeviceWifiProvisioningAvailability
    data object Unsupported : DeviceWifiProvisioningAvailability
}

sealed interface DeviceCurrentWifiSsid {
    data class Available(val value: String) : DeviceCurrentWifiSsid
    data class PermissionRequired(val permissions: List<String>) : DeviceCurrentWifiSsid
    data object LocationDisabled : DeviceCurrentWifiSsid
    data object Unavailable : DeviceCurrentWifiSsid
}

interface DeviceWifiProvisioner {
    fun availability(): DeviceWifiProvisioningAvailability
    fun currentWifiSsid(): DeviceCurrentWifiSsid
    suspend fun provision(request: DeviceWifiProvisioningRequest)
}

object UnsupportedDeviceWifiProvisioner : DeviceWifiProvisioner {
    override fun availability(): DeviceWifiProvisioningAvailability =
        DeviceWifiProvisioningAvailability.Unsupported

    override fun currentWifiSsid(): DeviceCurrentWifiSsid = DeviceCurrentWifiSsid.Unavailable

    override suspend fun provision(request: DeviceWifiProvisioningRequest) {
        throw UnsupportedOperationException("In-app Wi-Fi provisioning is unavailable")
    }
}

class AndroidDeviceWifiProvisioner(context: Context) : DeviceWifiProvisioner {
    private val applicationContext = context.applicationContext
    private val connectivityManager = applicationContext.getSystemService(ConnectivityManager::class.java)
    private val wifiManager = applicationContext.getSystemService(WifiManager::class.java)
    private val locationManager = applicationContext.getSystemService(LocationManager::class.java)

    override fun availability(): DeviceWifiProvisioningAvailability {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || connectivityManager == null) {
            return DeviceWifiProvisioningAvailability.Unsupported
        }
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            listOf(Manifest.permission.NEARBY_WIFI_DEVICES)
        } else {
            listOf(
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION,
            )
        }
        return if (
            permissions.all { permission ->
                ContextCompat.checkSelfPermission(applicationContext, permission) ==
                    PackageManager.PERMISSION_GRANTED
            }
        ) {
            DeviceWifiProvisioningAvailability.Available
        } else {
            DeviceWifiProvisioningAvailability.PermissionRequired(permissions)
        }
    }

    override fun currentWifiSsid(): DeviceCurrentWifiSsid {
        val permissions = listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        if (
            permissions.any { permission ->
                ContextCompat.checkSelfPermission(applicationContext, permission) !=
                    PackageManager.PERMISSION_GRANTED
            }
        ) {
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
    private fun currentWifiInfo(): WifiInfo? {
        val activeWifiInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            currentWifiInfoApi29()
        } else {
            null
        }
        return activeWifiInfo ?: wifiManager?.connectionInfo
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

    override suspend fun provision(request: DeviceWifiProvisioningRequest) {
        if (availability() != DeviceWifiProvisioningAvailability.Available) {
            throw SecurityException("Nearby Wi-Fi permission is unavailable")
        }
        val targetErrors = validateTargetWifiCredentials(request.targetSsid, request.targetPassword)
        if (targetErrors.isNotEmpty()) throw IOException("Target Wi-Fi credentials are invalid")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            throw UnsupportedOperationException("In-app provisioning requires Android 10 or newer")
        }
        provisionApi29(request)
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private suspend fun provisionApi29(request: DeviceWifiProvisioningRequest) = withContext(Dispatchers.IO) {
        val specifier = WifiNetworkSpecifier.Builder()
            .setSsid(request.setupSsid)
            .setWpa2Passphrase(request.setupPassphrase)
            .build()
        val networkRequest = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .setNetworkSpecifier(specifier)
            .build()
        val lease = withTimeout(NetworkRequestTimeoutMillis) {
            requestNetwork(networkRequest)
        }
        try {
            val sessionResponse = exchange(lease.network, LocalDeviceSetupHttpCodec.buildSessionRequest())
            val session = LocalDeviceSetupHttpCodec.parseSessionResponse(
                response = sessionResponse,
                expectedDeviceId = request.deviceId,
            )
            val provisionResponse = exchange(
                lease.network,
                LocalDeviceSetupHttpCodec.buildProvisionRequest(
                    session = session,
                    targetSsid = request.targetSsid,
                    targetPassword = request.targetPassword,
                ),
            )
            LocalDeviceSetupHttpCodec.requireProvisionAccepted(
                response = provisionResponse,
                expectedDeviceId = request.deviceId,
            )
        } finally {
            lease.release()
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private suspend fun requestNetwork(request: NetworkRequest): NetworkLease =
        suspendCancellableCoroutine { continuation ->
            lateinit var callback: ConnectivityManager.NetworkCallback
            val released = AtomicBoolean(false)
            val release = {
                if (released.compareAndSet(false, true)) {
                    runCatching { connectivityManager?.unregisterNetworkCallback(callback) }
                }
            }
            callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    if (continuation.isActive) {
                        continuation.resume(NetworkLease(network, release))
                    } else {
                        release()
                    }
                }

                override fun onUnavailable() {
                    release()
                    if (continuation.isActive) {
                        continuation.resumeWithException(
                            IOException("ESP setup network was not selected or is unavailable"),
                        )
                    }
                }
            }
            continuation.invokeOnCancellation { release() }
            try {
                connectivityManager?.requestNetwork(
                    request,
                    callback,
                    NetworkRequestTimeoutMillis.toInt(),
                ) ?: throw IOException("Connectivity service is unavailable")
            } catch (error: Throwable) {
                release()
                if (continuation.isActive) continuation.resumeWithException(error)
            }
        }

    private fun exchange(network: Network, request: ByteArray): ByteArray {
        val socket = network.socketFactory.createSocket()
        socket.use {
            it.soTimeout = SocketTimeoutMillis
            it.connect(InetSocketAddress(SetupHost, SetupPort), SocketTimeoutMillis)
            val output = it.getOutputStream()
            output.write(request)
            output.flush()
            val response = ByteArrayOutputStream()
            val buffer = ByteArray(4_096)
            val input = it.getInputStream()
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                response.write(buffer, 0, count)
                if (response.size() > MaxResponseBytes) {
                    throw IOException("ESP setup response exceeded the allowed size")
                }
            }
            return response.toByteArray()
        }
    }

    private data class NetworkLease(
        val network: Network,
        val releaseCallback: () -> Unit,
    ) {
        fun release() = releaseCallback()
    }

    private companion object {
        const val SetupHost = "192.168.4.1"
        const val SetupPort = 80
        const val NetworkRequestTimeoutMillis = 30_000L
        const val SocketTimeoutMillis = 10_000
        const val MaxResponseBytes = 64 * 1024
    }
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
