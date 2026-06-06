package com.example.smart_health_android.data

import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

data class BackendStatus(
    val espCount: Int = 0,
    val listeners: Int = 0,
    val recording: Boolean = false,
    val activeScanId: String? = null,
    val sampleRate: Int = 16000,
    val udpPort: Int = 3001,
    val updatedAt: String? = null
)

data class Patient(
    val id: String,
    val patientCode: String,
    val name: String,
    val age: Int? = null,
    val gender: String = "",
    val phone: String = "",
    val notes: String = "",
    val profileType: String = "",
    val relationship: String = "",
    val scanCount: Int = 0,
    val lastScanAt: String? = null,
    val lastAiLabel: String? = null
)

data class PatientSnapshot(
    val id: String = "",
    val patientCode: String = "",
    val name: String = "",
    val age: Int? = null,
    val gender: String = ""
)

data class Scan(
    val id: String,
    val patientId: String = "",
    val patient: PatientSnapshot? = null,
    val status: String = "",
    val mode: String = "heart",
    val bodySite: String = "",
    val deviceId: String = "",
    val startedAt: String? = null,
    val endedAt: String? = null,
    val sampleRate: Int = 16000,
    val sampleCount: Int = 0,
    val durationSeconds: Double = 0.0,
    val peak: Int = 0,
    val rms: Int = 0,
    val levelPercent: Int = 0,
    val bpm: Int = 0,
    val aiLabel: String = "",
    val aiConfidence: Double? = null,
    val aiSummary: String = "",
    val doctorNotes: String = "",
    val audioUrl: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null
) {
    val isCompleted: Boolean get() = status == "completed"
    val isRecording: Boolean get() = status == "recording"
    val isHeart: Boolean get() = mode == "heart"
    val patientName: String get() = localizePatientName(patient?.name?.ifBlank { null } ?: "Bệnh nhân vãng lai")
    val patientCode: String get() = patient?.patientCode?.ifBlank { null } ?: patientId.ifBlank { "N/A" }

    fun formattedDate(): String = formatIso(startedAt ?: createdAt, "dd/MM/yyyy")
    fun formattedTime(): String = formatIso(startedAt ?: createdAt, "HH:mm")
    fun formattedDuration(): String {
        val total = durationSeconds.roundToInt().coerceAtLeast(0)
        return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
    }
}

data class StartScanRequest(
    val patientId: String? = null,
    val patientName: String? = null,
    val patientCode: String? = null,
    val mode: String = "heart",
    val bodySite: String = "",
    val deviceId: String = "android-app",
    val doctorNotes: String = ""
)

data class PatientShare(
    val id: String,
    val patientId: String,
    val doctorUserId: String = "",
    val organizationId: String = "",
    val scope: String = "",
    val scanIds: List<String> = emptyList(),
    val expiresAt: String? = null,
    val active: Boolean = true
)

data class LiveMetrics(
    val peak: Int = 0,
    val rms: Int = 0,
    val levelPercent: Int = 0,
    val bpm: Int = 0,
    val recording: Boolean = false,
    val activeScanId: String? = null,
    val updatedAt: String? = null
)

data class AuthUser(
    val id: String = "",
    val role: String = "doctor",
    val name: String = "",
    val email: String = "",
    val phone: String = "",
    val license: String = "",
    val hospital: String = "",
    val department: String = "",
    val organizationId: String = "",
    val clinicName: String = "",
    val specialty: String = "",
    val address: String = "",
    val verifiedEmail: Boolean = false,
    val verifiedPhone: Boolean = false,
    val roleRequestStatus: String = "",
    val requestedRole: String = "",
    val roleInfoRequiredFields: List<String> = emptyList(),
    val roleInfoRequestMessage: String = "",
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class AuthResult(
    val token: String,
    val user: AuthUser
)

data class ClinicOption(
    val id: String,
    val name: String,
    val type: String = "",
    val address: String = "",
    val status: String = "active"
)

data class SpecialtyOption(
    val id: String,
    val name: String
)

data class AppNotification(
    val id: String,
    val type: String = "info",
    val title: String = "",
    val message: String = "",
    val read: Boolean = false,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class AccessLog(
    val id: String,
    val action: String = "",
    val device: String = "",
    val location: String = "",
    val ip: String = "",
    val severity: String = "info",
    val createdAt: String? = null
)

data class SmartDevice(
    val id: String,
    val name: String = "",
    val type: String = "stethoscope",
    val status: String = "available",
    val signal: Int = -60,
    val wifiRssi: Int? = null,
    val wifiSsid: String = "",
    val ipAddress: String = "",
    val battery: Int = 0,
    val connected: Boolean = false,
    val online: Boolean = false,
    val connectionMethod: String = "",
    val pairedUserId: String? = null,
    val firmwareVersion: String = "",
    val otaStatus: String = "",
    val audioStatus: String = "",
    val backendHost: String = "",
    val backendPort: Int? = null,
    val lastSeenAt: String? = null,
    val updatedAt: String? = null
)

data class AiChatMessage(
    val id: String,
    val role: String,
    val content: String,
    val createdAt: String? = null
)

data class ExportJob(
    val id: String,
    val format: String = "pdf",
    val includeAudio: Boolean = true,
    val includeReports: Boolean = true,
    val includeHistory: Boolean = true,
    val startDate: String = "",
    val endDate: String = "",
    val status: String = "ready",
    val recordCount: Int = 0,
    val downloadUrl: String = "",
    val createdAt: String? = null
)

data class StorageSummary(
    val autoSync: Boolean = true,
    val cloudBackup: Boolean = true,
    val localUsedMb: Int = 0,
    val localTotalMb: Int = 0,
    val cloudUsedMb: Int = 0,
    val cloudTotalMb: Int = 0,
    val cacheMb: Int = 0,
    val scanCount: Int = 0,
    val patientCount: Int = 0,
    val audioFileCount: Int = 0,
    val audioUsedMb: Int = 0,
    val updatedAt: String? = null
)

data class AppSettings(
    val notifications: JSONObject = JSONObject(),
    val privacy: JSONObject = JSONObject(),
    val dataAccess: JSONObject = JSONObject(),
    val storage: JSONObject = JSONObject(),
    val stethoscope: JSONObject = JSONObject(),
    val ai: JSONObject = JSONObject()
)

fun scanLabel(scan: Scan): String {
    return when (scan.aiLabel) {
        "captured" -> "Đã lưu"
        "low_signal" -> "Tín hiệu yếu"
        "clipping_risk" -> "Quá mức"
        "too_short" -> "Quá ngắn"
        "recording" -> "Đang ghi"
        "interrupted" -> "Gián đoạn"
        else -> scan.aiLabel.ifBlank { scan.status.ifBlank { "Không rõ" } }
    }
}

fun scanSummary(scan: Scan): String {
    return localizeAiSummary(scan.aiSummary).ifBlank { scanLabel(scan) }
}

fun scanIsNormal(scan: Scan): Boolean {
    return scan.aiLabel == "captured" || scan.aiLabel.isBlank()
}

private fun localizePatientName(value: String): String {
    return when (value.trim()) {
        "Walk-in patient" -> "Bệnh nhân vãng lai"
        "Unknown patient" -> "Bệnh nhân chưa xác định"
        else -> value
    }
}

private fun localizeAiSummary(value: String): String {
    val text = value.trim()
    return when {
        text.isBlank() -> ""
        text.contains("Signal level is very low", ignoreCase = true) ->
            "Mức tín hiệu rất thấp. Kiểm tra tiếp xúc cảm biến và đo lại nếu dạng sóng gần như phẳng."
        text.contains("Scan audio was captured and stored", ignoreCase = true) ->
            "Âm thanh đã được ghi và lưu. Hệ thống hiện chỉ kiểm tra chất lượng tín hiệu; phần chẩn đoán lâm sàng có thể bổ sung sau."
        text.contains("Recording is shorter than 1 second", ignoreCase = true) ->
            "Thời lượng ghi dưới 1 giây. Hãy ghi lâu hơn trước khi xem xét kết quả."
        text.contains("Signal contains peaks close to clipping", ignoreCase = true) ->
            "Tín hiệu có đỉnh quá cao, gần bị méo. Giảm gain hoặc đặt lại cảm biến trước khi đánh giá."
        text.contains("Recording was still active when the backend started", ignoreCase = true) ->
            "Lượt ghi còn mở khi máy chủ khởi động lại. Hãy tạo lượt đo mới để có file WAV hoàn chỉnh."
        text.contains("Recording was stopped without an active audio stream", ignoreCase = true) ->
            "Lượt ghi đã dừng nhưng không còn luồng âm thanh hoạt động. Không tạo được file WAV hoàn chỉnh."
        text.contains("Recording was stopped after the active audio stream was already closed", ignoreCase = true) ->
            "Lượt ghi được dừng sau khi luồng âm thanh đã đóng. Hãy tạo lượt đo mới để có file WAV đầy đủ."
        else -> text
    }
}

fun formatIso(value: String?, pattern: String): String {
    if (value.isNullOrBlank()) return "--"
    return try {
        DateTimeFormatter.ofPattern(pattern)
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(value))
    } catch (_: Exception) {
        value
    }
}

internal fun JSONObject.stringOrNull(name: String): String? {
    return if (isNull(name)) null else optString(name).takeIf { it.isNotBlank() }
}

internal fun JSONObject.intOrNull(name: String): Int? {
    return if (isNull(name)) null else optInt(name)
}

internal fun JSONObject.doubleOrNull(name: String): Double? {
    return if (isNull(name)) null else optDouble(name)
}
