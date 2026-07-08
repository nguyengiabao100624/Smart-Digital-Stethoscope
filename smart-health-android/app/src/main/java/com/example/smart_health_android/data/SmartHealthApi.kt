package com.example.smart_health_android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class SmartHealthApi(
    private val baseUrl: String = BackendConfig.API_BASE_URL,
    private val client: OkHttpClient = sharedClient
) {
    @Volatile
    private var bearerToken: String? = null

    fun setAuthToken(token: String?) {
        bearerToken = token?.takeIf { it.isNotBlank() }
    }

    fun currentAuthToken(): String? = bearerToken

    suspend fun getHealth(): BackendHealth = withContext(Dispatchers.IO) {
        parseHealth(getJson("$baseUrl/health"))
    }

    suspend fun authenticateFirebase(idToken: String): AuthResult = withContext(Dispatchers.IO) {
        setAuthToken(idToken)
        val json = getJson("$baseUrl/auth/firebase")
        val result = AuthResult(
            token = idToken,
            user = parseAuthUser(json.getJSONObject("user"))
        )
        setAuthToken(result.token)
        result
    }

    suspend fun requestRole(
        requestedRole: String,
        name: String = "",
        phone: String = "",
        license: String = "",
        hospital: String = "",
        department: String = "",
        organizationId: String = "",
        reason: String = "",
        accountType: String = "",
        workspaceType: String = ""
    ): AuthUser = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("requestedRole", requestedRole)
            .put("name", name)
            .put("phone", phone)
            .put("license", license)
            .put("hospital", hospital)
            .put("department", department)
            .put("specialty", department)
            .put("organizationId", organizationId)
            .put("reason", reason)
            .put("accountType", accountType)
            .put("workspaceType", workspaceType)
        parseAuthUser(postJson("$baseUrl/auth/role-request", body).getJSONObject("user"))
    }

    suspend fun listClinics(): List<ClinicOption> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/catalog/clinics")
            .optJSONArray("clinics")
            .orEmpty()
            .map(::parseClinicOption)
    }

    suspend fun listSpecialties(): List<SpecialtyOption> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/catalog/specialties")
            .optJSONArray("specialties")
            .orEmpty()
            .map(::parseSpecialtyOption)
    }

    suspend fun login(emailOrPhone: String, password: String, role: String): AuthResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("login", emailOrPhone)
            .put("email", emailOrPhone)
            .put("password", password)
            .put("role", role)
        val json = postJson("$baseUrl/auth/login", body)
        val result = AuthResult(
            token = json.optString("token"),
            user = parseAuthUser(json.getJSONObject("user"))
        )
        setAuthToken(result.token)
        result
    }

    suspend fun register(
        role: String,
        name: String,
        email: String,
        phone: String,
        password: String,
        license: String = "",
        hospital: String = ""
    ): AuthResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("role", role)
            .put("name", name)
            .put("email", email)
            .put("phone", phone)
            .put("password", password)
            .put("license", license)
            .put("hospital", hospital)
        val json = postJson("$baseUrl/auth/register", body)
        val result = AuthResult(
            token = json.optString("token"),
            user = parseAuthUser(json.getJSONObject("user"))
        )
        setAuthToken(result.token)
        result
    }

    suspend fun requestPasswordReset(emailOrPhone: String): Boolean = withContext(Dispatchers.IO) {
        postJson("$baseUrl/auth/password-reset", JSONObject().put("login", emailOrPhone))
        true
    }

    suspend fun logout(): Boolean = withContext(Dispatchers.IO) {
        postJson("$baseUrl/auth/logout", JSONObject())
        setAuthToken(null)
        true
    }

    suspend fun getMe(): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(getJson("$baseUrl/me").getJSONObject("user"))
    }

    suspend fun updateMe(fields: JSONObject): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(patchJson("$baseUrl/me", fields).getJSONObject("user"))
    }

    suspend fun changePassword(currentPassword: String, newPassword: String): Boolean = withContext(Dispatchers.IO) {
        postJson(
            "$baseUrl/me/password",
            JSONObject()
                .put("currentPassword", currentPassword)
                .put("newPassword", newPassword)
        )
        true
    }

    suspend fun uploadMyAvatar(fileName: String, contentType: String, bytes: ByteArray): AuthUser = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/me/avatar")
            .post(bytes.toRequestBody(contentType.toMediaType()))
            .header("X-File-Name", fileName)
            .withAuth()
            .build()
        parseAuthUser(executeJson(request).getJSONObject("user"))
    }

    suspend fun deleteMyAvatar(): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(deleteJson("$baseUrl/me/avatar").getJSONObject("user"))
    }

    suspend fun downloadMyAvatarBytes(): ByteArray = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/me/avatar")
            .get()
            .withAuth()
            .build()
        executeBytes(request)
    }

    suspend fun getSettings(): AppSettings = withContext(Dispatchers.IO) {
        parseSettings(getJson("$baseUrl/settings").getJSONObject("settings"))
    }

    suspend fun updateSettings(patch: JSONObject): AppSettings = withContext(Dispatchers.IO) {
        parseSettings(patchJson("$baseUrl/settings", patch).getJSONObject("settings"))
    }

    suspend fun listNotifications(): List<AppNotification> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/notifications")
            .optJSONArray("notifications")
            .orEmpty()
            .map(::parseNotification)
    }

    suspend fun markNotificationRead(id: String): AppNotification = withContext(Dispatchers.IO) {
        parseNotification(postJson("$baseUrl/notifications/${id.urlEncode()}/read", JSONObject()).getJSONObject("notification"))
    }

    suspend fun markAllNotificationsRead(): List<AppNotification> = withContext(Dispatchers.IO) {
        postJson("$baseUrl/notifications/read-all", JSONObject())
            .optJSONArray("notifications")
            .orEmpty()
            .map(::parseNotification)
    }

    suspend fun deleteNotification(id: String): Boolean = withContext(Dispatchers.IO) {
        deleteJson("$baseUrl/notifications/${id.urlEncode()}")
        true
    }

    suspend fun registerNotificationDevice(
        fcmToken: String,
        platform: String = "android",
        enabled: Boolean = true
    ): JSONObject = withContext(Dispatchers.IO) {
        postJson(
            "$baseUrl/notifications/register-device",
            JSONObject()
                .put("fcmToken", fcmToken)
                .put("platform", platform)
                .put("enabled", enabled)
        ).getJSONObject("device")
    }

    suspend fun listAccessLogs(): List<AccessLog> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/access-logs")
            .optJSONArray("logs")
            .orEmpty()
            .map(::parseAccessLog)
    }

    suspend fun listDevices(): List<SmartDevice> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/devices")
            .optJSONArray("devices")
            .orEmpty()
            .map(::parseSmartDevice)
    }

    suspend fun scanDevices(): List<SmartDevice> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/devices/scan")
            .optJSONArray("devices")
            .orEmpty()
            .map(::parseSmartDevice)
    }

    suspend fun pairDevice(
        deviceId: String,
        name: String = "",
        claimCode: String = "",
        connectionMethod: String = ""
    ): SmartDevice = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("name", name)
            .put("claimCode", claimCode)
            .put("connectionMethod", connectionMethod)
        parseSmartDevice(postJson("$baseUrl/devices/pair", body).getJSONObject("device"))
    }

    suspend fun connectDevice(id: String): SmartDevice = withContext(Dispatchers.IO) {
        parseSmartDevice(postJson("$baseUrl/devices/${id.urlEncode()}/connect", JSONObject()).getJSONObject("device"))
    }

    suspend fun disconnectDevice(id: String): SmartDevice = withContext(Dispatchers.IO) {
        parseSmartDevice(postJson("$baseUrl/devices/${id.urlEncode()}/disconnect", JSONObject()).getJSONObject("device"))
    }

    suspend fun deleteDevice(id: String): Boolean = withContext(Dispatchers.IO) {
        deleteJson("$baseUrl/devices/${id.urlEncode()}")
        true
    }

    suspend fun updateDevice(id: String, patch: JSONObject): SmartDevice = withContext(Dispatchers.IO) {
        parseSmartDevice(patchJson("$baseUrl/devices/${id.urlEncode()}", patch).getJSONObject("device"))
    }

    suspend fun calibrateDevice(id: String): JSONObject = withContext(Dispatchers.IO) {
        postJson("$baseUrl/devices/${id.urlEncode()}/calibrate", JSONObject())
    }

    suspend fun listAiMessages(): List<AiChatMessage> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/ai/chat")
            .optJSONArray("messages")
            .orEmpty()
            .map(::parseAiChatMessage)
    }

    suspend fun sendAiMessage(message: String): AiChatMessage = withContext(Dispatchers.IO) {
        parseAiChatMessage(postJson("$baseUrl/ai/chat", JSONObject().put("message", message)).getJSONObject("message"))
    }

    suspend fun updateAiSettings(settings: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        patchJson("$baseUrl/ai/settings", settings).getJSONObject("settings")
    }

    suspend fun updateAiModel(): JSONObject = withContext(Dispatchers.IO) {
        postJson("$baseUrl/ai/update", JSONObject()).getJSONObject("settings")
    }

    suspend fun listExports(): List<ExportJob> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/exports")
            .optJSONArray("exports")
            .orEmpty()
            .map(::parseExportJob)
    }

    suspend fun createExport(
        format: String = "pdf",
        includeAudio: Boolean = true,
        includeReports: Boolean = true,
        includeHistory: Boolean = true,
        startDate: String = "",
        endDate: String = ""
    ): ExportJob = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("format", format)
            .put("includeAudio", includeAudio)
            .put("includeReports", includeReports)
            .put("includeHistory", includeHistory)
            .put("startDate", startDate)
            .put("endDate", endDate)
        parseExportJob(postJson("$baseUrl/exports", body).getJSONObject("export"))
    }

    suspend fun getDataSummary(): StorageSummary = withContext(Dispatchers.IO) {
        parseStorageSummary(getJson("$baseUrl/data/summary").getJSONObject("storage"))
    }

    suspend fun clearCache(): StorageSummary = withContext(Dispatchers.IO) {
        parseStorageSummary(deleteJson("$baseUrl/data/cache").getJSONObject("storage"))
    }

    suspend fun deleteAllData(confirm: String): StorageSummary = withContext(Dispatchers.IO) {
        parseStorageSummary(deleteJson("$baseUrl/data/all", JSONObject().put("confirm", confirm)).getJSONObject("storage"))
    }

    suspend fun getStatus(): BackendStatus = withContext(Dispatchers.IO) {
        val json = getJson("$baseUrl/status")
        parseStatus(json)
    }

    suspend fun listPatients(query: String = ""): List<Patient> = withContext(Dispatchers.IO) {
        val url = if (query.isBlank()) {
            "$baseUrl/patients"
        } else {
            "$baseUrl/patients?q=${query.urlEncode()}"
        }
        val json = getJson(url)
        json.optJSONArray("patients").orEmpty().map(::parsePatient)
    }

    suspend fun createPatient(
        patientCode: String,
        name: String,
        age: Int? = null,
        gender: String = "",
        phone: String = "",
        notes: String = "",
        profileType: String = "",
        relationship: String = ""
    ): Patient = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("patientCode", patientCode)
            .put("name", name)
            .put("gender", gender)
            .put("phone", phone)
            .put("notes", notes)
            .put("profileType", profileType)
            .put("relationship", relationship)
        if (age != null) body.put("age", age)

        parsePatient(postJson("$baseUrl/patients", body).getJSONObject("patient"))
    }

    suspend fun listPatientShares(patientId: String): List<PatientShare> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/patients/${patientId.urlEncode()}/shares")
            .optJSONArray("shares")
            .orEmpty()
            .map(::parsePatientShare)
    }

    suspend fun revokePatientShare(patientId: String, shareId: String): Boolean = withContext(Dispatchers.IO) {
        deleteJson("$baseUrl/patients/${patientId.urlEncode()}/shares/${shareId.urlEncode()}")
        true
    }

    suspend fun sharePatientRecord(
        patientId: String,
        targetDoctorUserId: String = "",
        targetWorkspaceId: String = "",
        scanId: String = "",
        expiresAt: String = ""
    ): PatientShare = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("targetDoctorUserId", targetDoctorUserId)
            .put("targetWorkspaceId", targetWorkspaceId)
            .put("scope", if (scanId.isBlank()) "patient_profile" else "selected_scans")
            .put("expiresAt", expiresAt)
        if (scanId.isNotBlank()) body.put("scanId", scanId)
        parsePatientShare(postJson("$baseUrl/patients/${patientId.urlEncode()}/shares", body).getJSONObject("share"))
    }

    suspend fun listShareTargets(query: String = ""): ShareTargets = withContext(Dispatchers.IO) {
        val url = if (query.isBlank()) {
            "$baseUrl/share-targets"
        } else {
            "$baseUrl/share-targets?q=${query.urlEncode()}"
        }
        parseShareTargets(getJson(url))
    }

    suspend fun listScans(
        patientId: String? = null,
        status: String? = null,
        limit: Int = 50
    ): List<Scan> = withContext(Dispatchers.IO) {
        val params = buildList {
            add("limit=$limit")
            if (!patientId.isNullOrBlank()) add("patientId=${patientId.urlEncode()}")
            if (!status.isNullOrBlank()) add("status=${status.urlEncode()}")
        }.joinToString("&")
        val json = getJson("$baseUrl/scans?$params")
        json.optJSONArray("scans").orEmpty().map(::parseScan)
    }

    suspend fun listPatientScans(
        status: String? = null,
        limit: Int = 50
    ): List<Scan> = withContext(Dispatchers.IO) {
        val params = buildList {
            add("limit=$limit")
            if (!status.isNullOrBlank()) add("status=${status.urlEncode()}")
        }.joinToString("&")
        val json = getJson("$baseUrl/patient/scans?$params")
        json.optJSONArray("scans").orEmpty().map(::parseScan)
    }

    suspend fun getScan(scanId: String): Scan = withContext(Dispatchers.IO) {
        parseScan(getJson("$baseUrl/scans/${scanId.urlEncode()}").getJSONObject("scan"))
    }

    suspend fun startScan(request: StartScanRequest): Scan = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("mode", request.mode)
            .put("bodySite", request.bodySite)
            .put("deviceId", request.deviceId)
            .put("doctorNotes", request.doctorNotes)

        if (!request.patientId.isNullOrBlank()) body.put("patientId", request.patientId)
        if (!request.patientName.isNullOrBlank()) body.put("patientName", request.patientName)
        if (!request.patientCode.isNullOrBlank()) body.put("patientCode", request.patientCode)

        parseScan(postJson("$baseUrl/scans/start", body).getJSONObject("scan"))
    }

    suspend fun stopScan(scanId: String): Scan = withContext(Dispatchers.IO) {
        parseScan(postJson("$baseUrl/scans/${scanId.urlEncode()}/stop", JSONObject()).getJSONObject("scan"))
    }

    suspend fun stopActiveScan(): Scan = withContext(Dispatchers.IO) {
        parseScan(postJson("$baseUrl/scans/active/stop", JSONObject()).getJSONObject("scan"))
    }

    suspend fun updateScan(scanId: String, doctorNotes: String): Scan = withContext(Dispatchers.IO) {
        val body = JSONObject().put("doctorNotes", doctorNotes)
        parseScan(patchJson("$baseUrl/scans/${scanId.urlEncode()}", body).getJSONObject("scan"))
    }

    private fun getJson(url: String): JSONObject {
        val request = Request.Builder().url(url).get().withAuth().build()
        return executeJson(request)
    }

    private fun postJson(url: String, json: JSONObject): JSONObject {
        val request = Request.Builder()
            .url(url)
            .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
            .withAuth()
            .build()
        return executeJson(request)
    }

    private fun patchJson(url: String, json: JSONObject): JSONObject {
        val request = Request.Builder()
            .url(url)
            .patch(json.toString().toRequestBody(JSON_MEDIA_TYPE))
            .withAuth()
            .build()
        return executeJson(request)
    }

    private fun deleteJson(url: String, json: JSONObject? = null): JSONObject {
        val requestBuilder = Request.Builder().url(url).withAuth()
        val request = if (json == null) {
            requestBuilder.delete().build()
        } else {
            requestBuilder.delete(json.toString().toRequestBody(JSON_MEDIA_TYPE)).build()
        }
        return executeJson(request)
    }

    private fun Request.Builder.withAuth(): Request.Builder {
        val token = bearerToken
        if (!token.isNullOrBlank()) {
            header("Authorization", "Bearer $token")
        }
        return this
    }

    private fun parseAuthUser(json: JSONObject): AuthUser {
        return AuthUser(
            id = json.optString("id"),
            role = json.optString("role", "doctor"),
            name = json.optString("name"),
            email = json.optString("email"),
            avatarFileId = json.optString("avatarFileId"),
            avatarUrl = json.optString("avatarUrl"),
            phone = json.optString("phone"),
            license = json.optString("license"),
            hospital = json.optString("hospital"),
            department = json.optString("department"),
            organizationId = json.optString("organizationId"),
            clinicName = json.optString("clinicName"),
            specialty = json.optString("specialty"),
            address = json.optString("address"),
            verifiedEmail = json.optBoolean("verifiedEmail"),
            verifiedPhone = json.optBoolean("verifiedPhone"),
            roleRequestStatus = json.optString("roleRequestStatus"),
            requestedRole = json.optString("requestedRole"),
            roleInfoRequiredFields = json.optJSONArray("roleInfoRequiredFields").toStringList(),
            roleInfoRequestMessage = json.optString("roleInfoRequestMessage"),
            registrationReason = json.optString("registrationReason"),
            workspaceType = json.optString("workspaceType"),
            accountType = json.optString("accountType"),
            clinicSuggestion = json.optString("clinicSuggestion"),
            notificationPreferences = json.optJSONObject("notificationPreferences") ?: JSONObject(),
            createdAt = json.stringOrNull("createdAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseHealth(json: JSONObject): BackendHealth {
        return BackendHealth(
            ok = json.optBoolean("ok"),
            service = json.optString("service"),
            status = parseStatus(json.optJSONObject("status") ?: JSONObject()),
            now = json.stringOrNull("now")
        )
    }

    private fun parseClinicOption(json: JSONObject): ClinicOption {
        return ClinicOption(
            id = json.optString("id"),
            name = json.optString("name"),
            type = json.optString("type"),
            address = json.optString("address"),
            status = json.optString("status", "active")
        )
    }

    private fun parseSpecialtyOption(json: JSONObject): SpecialtyOption {
        return SpecialtyOption(
            id = json.optString("id"),
            name = json.optString("name")
        )
    }

    private fun parseSettings(json: JSONObject): AppSettings {
        return AppSettings(
            notifications = json.optJSONObject("notifications") ?: JSONObject(),
            privacy = json.optJSONObject("privacy") ?: JSONObject(),
            dataAccess = json.optJSONObject("dataAccess") ?: JSONObject(),
            storage = json.optJSONObject("storage") ?: JSONObject(),
            stethoscope = json.optJSONObject("stethoscope") ?: JSONObject(),
            ai = json.optJSONObject("ai") ?: JSONObject()
        )
    }

    private fun parseNotification(json: JSONObject): AppNotification {
        return AppNotification(
            id = json.optString("id"),
            type = json.optString("type", "info"),
            title = json.optString("title"),
            message = json.optString("message"),
            read = json.optBoolean("read"),
            createdAt = json.stringOrNull("createdAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseAccessLog(json: JSONObject): AccessLog {
        return AccessLog(
            id = json.optString("id"),
            action = json.optString("action"),
            device = json.optString("device"),
            location = json.optString("location"),
            ip = json.optString("ip"),
            severity = json.optString("severity", "info"),
            createdAt = json.stringOrNull("createdAt")
        )
    }

    private fun parseSmartDevice(json: JSONObject): SmartDevice {
        return SmartDevice(
            id = json.optString("id"),
            name = json.optString("name"),
            type = json.optString("type", "stethoscope"),
            status = json.optString("status", "available"),
            signal = json.optInt("signal", -60),
            wifiRssi = if (json.has("wifiRssi") && !json.isNull("wifiRssi")) json.optInt("wifiRssi") else null,
            wifiSsid = json.optString("wifiSsid"),
            ipAddress = json.optString("ipAddress"),
            battery = json.optInt("battery"),
            connected = json.optBoolean("connected"),
            online = json.optBoolean("online", json.optBoolean("connected")),
            connectionMethod = json.optString("connectionMethod"),
            pairedUserId = json.stringOrNull("pairedUserId"),
            firmwareVersion = json.optString("firmwareVersion"),
            otaStatus = json.optString("otaStatus"),
            audioStatus = json.optString("audioStatus"),
            backendHost = json.optString("backendHost"),
            backendPort = if (json.has("backendPort") && !json.isNull("backendPort")) json.optInt("backendPort") else null,
            lastSeenAt = json.stringOrNull("lastSeenAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseAiChatMessage(json: JSONObject): AiChatMessage {
        return AiChatMessage(
            id = json.optString("id"),
            role = json.optString("role"),
            content = json.optString("content"),
            createdAt = json.stringOrNull("createdAt")
        )
    }

    private fun parseExportJob(json: JSONObject): ExportJob {
        return ExportJob(
            id = json.optString("id"),
            format = json.optString("format", "pdf"),
            includeAudio = json.optBoolean("includeAudio", true),
            includeReports = json.optBoolean("includeReports", true),
            includeHistory = json.optBoolean("includeHistory", true),
            startDate = json.optString("startDate"),
            endDate = json.optString("endDate"),
            status = json.optString("status", "ready"),
            recordCount = json.optInt("recordCount"),
            downloadUrl = json.optString("downloadUrl"),
            createdAt = json.stringOrNull("createdAt")
        )
    }

    private fun parseStorageSummary(json: JSONObject): StorageSummary {
        return StorageSummary(
            autoSync = json.optBoolean("autoSync", true),
            cloudBackup = json.optBoolean("cloudBackup", true),
            localUsedMb = json.optInt("localUsedMb"),
            localTotalMb = json.optInt("localTotalMb"),
            cloudUsedMb = json.optInt("cloudUsedMb"),
            cloudTotalMb = json.optInt("cloudTotalMb"),
            cacheMb = json.optInt("cacheMb"),
            scanCount = json.optInt("scanCount"),
            patientCount = json.optInt("patientCount"),
            audioFileCount = json.optInt("audioFileCount"),
            audioUsedMb = json.optInt("audioUsedMb"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun executeJson(request: Request): JSONObject {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val message = parseApiErrorMessage(text)
                throw IOException(message?.ifBlank { null } ?: "HTTP ${response.code}")
            }
            return if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }

    private fun executeBytes(request: Request): ByteArray {
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val text = response.body?.string().orEmpty()
                val message = parseApiErrorMessage(text)
                throw IOException(message?.ifBlank { null } ?: "HTTP ${response.code}")
            }
            return response.body?.bytes() ?: ByteArray(0)
        }
    }

    private fun parseStatus(json: JSONObject): BackendStatus {
        return BackendStatus(
            espCount = json.optInt("esp"),
            listeners = json.optInt("listeners"),
            recording = json.optBoolean("recording"),
            activeScanId = json.stringOrNull("activeScanId"),
            sampleRate = json.optInt("sampleRate", 16000),
            udpPort = json.optInt("udpPort", 3001),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseApiErrorMessage(text: String): String? {
        return runCatching {
            val json = JSONObject(text)
            val error = json.opt("error")
            when (error) {
                is JSONObject -> error.optString("message")
                    .ifBlank { error.optString("code") }
                is String -> error
                else -> json.optString("message")
            }.ifBlank { null }
        }.getOrNull()
    }

    private fun parsePatient(json: JSONObject): Patient {
        return Patient(
            id = json.optString("id"),
            patientCode = json.optString("patientCode"),
            name = json.optString("name"),
            age = json.intOrNull("age"),
            gender = json.optString("gender"),
            phone = json.optString("phone"),
            notes = json.optString("notes"),
            profileType = json.optString("profileType"),
            relationship = json.optString("relationship"),
            scanCount = json.optInt("scanCount"),
            lastScanAt = json.stringOrNull("lastScanAt"),
            lastAiLabel = json.stringOrNull("lastAiLabel")
        )
    }

    private fun parsePatientShare(json: JSONObject): PatientShare {
        return PatientShare(
            id = json.optString("id"),
            patientId = json.optString("patientId"),
            doctorUserId = json.optString("doctorUserId"),
            doctorId = json.optString("doctorId"),
            organizationId = json.optString("organizationId"),
            scope = json.optString("scope"),
            scanIds = json.optJSONArray("scanIds").toStringList(),
            expiresAt = json.stringOrNull("expiresAt"),
            active = json.optBoolean("active", true),
            revokedAt = json.stringOrNull("revokedAt"),
            createdAt = json.stringOrNull("createdAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseShareTargets(json: JSONObject): ShareTargets {
        return ShareTargets(
            doctors = json.optJSONArray("doctors").orEmpty().map(::parseShareTargetDoctor),
            workspaces = json.optJSONArray("workspaces").orEmpty().map(::parseShareTargetWorkspace)
        )
    }

    private fun parseShareTargetDoctor(json: JSONObject): ShareTargetDoctor {
        return ShareTargetDoctor(
            id = json.optString("id"),
            name = json.optString("name"),
            specialty = json.optString("specialty"),
            organizationId = json.optString("organizationId"),
            clinicName = json.optString("clinicName")
        )
    }

    private fun parseShareTargetWorkspace(json: JSONObject): ShareTargetWorkspace {
        return ShareTargetWorkspace(
            id = json.optString("id"),
            name = json.optString("name"),
            type = json.optString("type"),
            address = json.optString("address")
        )
    }

    private fun parsePatientSnapshot(json: JSONObject?): PatientSnapshot? {
        if (json == null) return null
        return PatientSnapshot(
            id = json.optString("id"),
            patientCode = json.optString("patientCode"),
            name = json.optString("name"),
            age = json.intOrNull("age"),
            gender = json.optString("gender")
        )
    }

    private fun parseScan(json: JSONObject): Scan {
        return Scan(
            id = json.optString("id"),
            patientId = json.optString("patientId"),
            patient = parsePatientSnapshot(json.optJSONObject("patient")),
            status = json.optString("status"),
            mode = json.optString("mode", "heart"),
            bodySite = json.optString("bodySite"),
            deviceId = json.optString("deviceId"),
            startedAt = json.stringOrNull("startedAt"),
            endedAt = json.stringOrNull("endedAt"),
            sampleRate = json.optInt("sampleRate", 16000),
            sampleCount = json.optInt("sampleCount"),
            durationSeconds = json.optDouble("durationSeconds", 0.0),
            peak = json.optInt("peak"),
            rms = json.optInt("rms"),
            levelPercent = json.optInt("levelPercent"),
            bpm = json.optInt("bpm"),
            aiLabel = json.optString("aiLabel"),
            aiConfidence = json.doubleOrNull("aiConfidence"),
            aiSummary = json.optString("aiSummary"),
            doctorNotes = json.optString("doctorNotes"),
            audioUrl = json.stringOrNull("audioUrl"),
            createdAt = json.stringOrNull("createdAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun JSONArray?.orEmpty(): List<JSONObject> {
        if (this == null) return emptyList()
        return List(length()) { index -> getJSONObject(index) }
    }

    private fun JSONArray?.toStringList(): List<String> {
        if (this == null) return emptyList()
        return List(length()) { index -> optString(index) }.filter { it.isNotBlank() }
    }

    private fun String.urlEncode(): String = java.net.URLEncoder.encode(this, "UTF-8")

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        val sharedClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
    }
}

object SmartHealthRepository {
    val api = SmartHealthApi()
}
