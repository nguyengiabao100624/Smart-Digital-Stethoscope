package com.example.smart_health_android.devices

import android.content.Context
import android.provider.OpenableColumns
import androidx.core.net.toUri
import com.google.android.gms.tasks.Task
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

sealed interface DeviceQrImageDecodeResult {
    data class Decoded(val rawValue: String) : DeviceQrImageDecodeResult
    data object NoQrCode : DeviceQrImageDecodeResult
    data object UnreadableImage : DeviceQrImageDecodeResult
    data object ImageTooLarge : DeviceQrImageDecodeResult
}

interface DeviceQrImageDecoder {
    suspend fun decode(contentUri: String): DeviceQrImageDecodeResult
}

object UnsupportedDeviceQrImageDecoder : DeviceQrImageDecoder {
    override suspend fun decode(contentUri: String): DeviceQrImageDecodeResult =
        DeviceQrImageDecodeResult.UnreadableImage
}

/**
 * Decodes a user-selected QR image on device. The image URI and decoded QR payload
 * are never uploaded or persisted; the ViewModel forwards only a valid QR payload
 * through the canonical pairing contract.
 */
class AndroidDeviceQrImageDecoder(context: Context) : DeviceQrImageDecoder {
    private val applicationContext = context.applicationContext

    override suspend fun decode(contentUri: String): DeviceQrImageDecodeResult =
        withContext(Dispatchers.IO) {
            val uri = runCatching { contentUri.toUri() }.getOrNull()
                ?: return@withContext DeviceQrImageDecodeResult.UnreadableImage
            if (uri.scheme != "content") {
                return@withContext DeviceQrImageDecodeResult.UnreadableImage
            }
            val resolver = applicationContext.contentResolver
            val mimeType = runCatching { resolver.getType(uri) }.getOrNull()
            if (mimeType != null && !mimeType.startsWith("image/", ignoreCase = true)) {
                return@withContext DeviceQrImageDecodeResult.UnreadableImage
            }
            val byteCount = resolver.contentByteCount(uri)
                ?: return@withContext DeviceQrImageDecodeResult.UnreadableImage
            if (byteCount > MaxQrImageBytes) {
                return@withContext DeviceQrImageDecodeResult.ImageTooLarge
            }
            val image = runCatching { InputImage.fromFilePath(applicationContext, uri) }
                .getOrElse { return@withContext DeviceQrImageDecodeResult.UnreadableImage }
            val scanner = BarcodeScanning.getClient(QrOnlyOptions)
            try {
                scanner.process(image)
                    .awaitResult()
                    .firstNotNullOfOrNull(Barcode::getRawValue)
                    ?.let(DeviceQrImageDecodeResult::Decoded)
                    ?: DeviceQrImageDecodeResult.NoQrCode
            } catch (error: CancellationException) {
                throw error
            } catch (_: Throwable) {
                DeviceQrImageDecodeResult.UnreadableImage
            } finally {
                scanner.close()
            }
        }

    private companion object {
        const val MaxQrImageBytes = 10L * 1024L * 1024L
        val QrOnlyOptions = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
    }
}

private fun android.content.ContentResolver.contentByteCount(uri: android.net.Uri): Long? {
    val descriptorLength = runCatching {
        openAssetFileDescriptor(uri, "r")?.use { descriptor ->
            descriptor.length.takeIf { it >= 0L }
        }
    }.getOrNull()
    if (descriptorLength != null) return descriptorLength
    return runCatching {
        query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
            val column = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (column >= 0 && cursor.moveToFirst() && !cursor.isNull(column)) {
                cursor.getLong(column).takeIf { it >= 0L }
            } else {
                null
            }
        }
    }.getOrNull()
}

private suspend fun <T> Task<T>.awaitResult(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { result ->
        if (continuation.isActive) continuation.resume(result)
    }
    addOnFailureListener { error ->
        if (continuation.isActive) continuation.resumeWithException(error)
    }
    addOnCanceledListener {
        continuation.cancel()
    }
}
