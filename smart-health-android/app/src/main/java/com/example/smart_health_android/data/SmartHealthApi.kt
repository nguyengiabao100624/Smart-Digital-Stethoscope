package com.example.smart_health_android.data

import com.example.smart_health_android.appointments.Appointment
import com.example.smart_health_android.appointments.AppointmentMutation
import com.example.smart_health_android.appointments.AppointmentPatch
import com.example.smart_health_android.appointments.AppointmentPerson
import com.example.smart_health_android.appointments.AppointmentStatus
import com.example.smart_health_android.appointments.AppointmentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
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

    @Volatile
    private var twoFactorToken: String? = null

    fun setAuthToken(token: String?) {
        bearerToken = token?.takeIf { it.isNotBlank() }
        if (bearerToken == null) twoFactorToken = null
    }

    fun currentAuthToken(): String? = bearerToken

    fun currentTwoFactorToken(): String? = twoFactorToken

    private fun setTwoFactorToken(token: String?) {
        twoFactorToken = token?.takeIf { it.isNotBlank() }
    }

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
        if (json.optBoolean("twoFactorRequired")) {
            val details = json.optJSONObject("details") ?: json
            throw SmartHealthApiException(
                statusCode = 401,
                code = "TWO_FACTOR_REQUIRED",
                details = details.toStringMap(),
                requestId = json.optString("requestId"),
                message = json.optString("message", "Cần mã OTP để hoàn tất đăng nhập"),
            )
        }
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
        try {
            postJson("$baseUrl/auth/logout", JSONObject())
            true
        } finally {
            setAuthToken(null)
        }
    }

    suspend fun getMe(): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(getJson("$baseUrl/me").getJSONObject("user"))
    }

    suspend fun listAuthSessions(): List<AuthSession> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/auth/sessions")
            .optJSONArray("sessions")
            .orEmpty()
            .map(::parseAuthSession)
    }

    suspend fun revokeAuthSession(
        sessionId: String,
        idempotencyKey: String? = null,
    ): AuthSession = withContext(Dispatchers.IO) {
        parseAuthSession(
            postJson(
                "$baseUrl/auth/sessions/${sessionId.urlEncode()}/revoke",
                JSONObject(),
                idempotencyKey,
            )
                .getJSONObject("session")
        )
    }

    suspend fun updateMe(fields: JSONObject, idempotencyKey: String? = null): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(patchJson("$baseUrl/me", fields, idempotencyKey).getJSONObject("user"))
    }

    suspend fun switchWorkspace(
        workspaceId: String,
        idempotencyKey: String? = null,
    ): AuthUser = withContext(Dispatchers.IO) {
        val body = JSONObject().put("organizationId", workspaceId)
        parseAuthUser(patchJson("$baseUrl/me", body, idempotencyKey).getJSONObject("user"))
    }

    suspend fun changePassword(
        currentPassword: String,
        newPassword: String,
        firebaseClientUpdated: Boolean = false
    ): Boolean = withContext(Dispatchers.IO) {
        postJson(
            "$baseUrl/me/password",
            JSONObject()
                .put("currentPassword", currentPassword)
                .put("newPassword", newPassword)
                .put("firebaseClientUpdated", firebaseClientUpdated)
        )
        true
    }

    suspend fun getTwoFactorStatus(): TwoFactorStatusResult = withContext(Dispatchers.IO) {
        val response = getJson("$baseUrl/me/2fa")
        TwoFactorStatusResult(
            availability = parseTwoFactorAvailability(response.getJSONObject("availability")),
            twoFactor = parseTwoFactorState(response.getJSONObject("twoFactor")),
        )
    }

    suspend fun startTwoFactorEnrollment(): TwoFactorEnrollmentResult = withContext(Dispatchers.IO) {
        val response = postJson(
            "$baseUrl/me/2fa/enroll",
            JSONObject().put("method", "app"),
        )
        val enrollment = response.getJSONObject("enrollment")
        TwoFactorEnrollmentResult(
            twoFactor = parseTwoFactorState(response.getJSONObject("twoFactor")),
            enrollment = TwoFactorEnrollment(
                id = enrollment.getString("id"),
                method = enrollment.getString("method"),
                manualKey = enrollment.getString("manualKey"),
                otpauthUri = enrollment.getString("otpauthUri"),
                expiresAt = enrollment.getString("expiresAt"),
            ),
        )
    }

    suspend fun verifyTwoFactorEnrollment(
        enrollmentId: String,
        code: String,
    ): TwoFactorVerifiedResult = withContext(Dispatchers.IO) {
        val response = postJson(
            "$baseUrl/me/2fa/verify",
            JSONObject().put("enrollmentId", enrollmentId).put("code", code),
        )
        val result = TwoFactorVerifiedResult(
            twoFactor = parseTwoFactorState(response.getJSONObject("twoFactor")),
            recoveryCodes = response.optJSONArray("recoveryCodes").toStringList(),
            twoFactorToken = response.getString("twoFactorToken"),
            tokenExpiresAt = response.getString("tokenExpiresAt"),
        )
        setTwoFactorToken(result.twoFactorToken)
        result
    }

    suspend fun completeTwoFactorChallenge(
        challengeId: String,
        code: String,
    ): TwoFactorChallengeResult = withContext(Dispatchers.IO) {
        val response = postJson(
            "$baseUrl/auth/2fa/challenge",
            JSONObject().put("challengeId", challengeId).put("code", code),
        )
        val result = TwoFactorChallengeResult(
            twoFactorToken = response.getString("twoFactorToken"),
            expiresAt = response.getString("expiresAt"),
            token = response.optString("token"),
            user = response.optJSONObject("user")?.let(::parseAuthUser),
        )
        if (result.token.isNotBlank()) setAuthToken(result.token)
        setTwoFactorToken(result.twoFactorToken)
        result
    }

    suspend fun disableTwoFactor(code: String): TwoFactorState = withContext(Dispatchers.IO) {
        val response = postJson(
            "$baseUrl/me/2fa/disable",
            JSONObject().put("code", code),
        )
        val result = parseTwoFactorState(response.getJSONObject("twoFactor"))
        setTwoFactorToken(null)
        result
    }

    @Deprecated("Use get/start/verify/disable two-factor methods")
    suspend fun updateTwoFactor(enable: Boolean, method: String = "app"): TwoFactorUpdateResult {
        throw SmartHealthApiException(
            statusCode = 409,
            code = "TWO_FACTOR_ENROLLMENT_REQUIRED",
            message = if (enable) {
                "Phải xác minh mã OTP trước khi bật 2FA"
            } else {
                "Phải nhập mã OTP hiện tại trước khi tắt 2FA"
            },
        )
    }

    suspend fun uploadMyAvatar(
        fileName: String,
        contentType: String,
        bytes: ByteArray,
        idempotencyKey: String? = null,
    ): AuthUser = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/me/avatar")
            .post(bytes.toRequestBody(contentType.toMediaType()))
            .header("X-File-Name", fileName)
            .withIdempotencyKey(idempotencyKey)
            .withAuth()
            .build()
        parseAuthUser(executeJson(request).getJSONObject("user"))
    }

    suspend fun deleteMyAvatar(idempotencyKey: String? = null): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(deleteJson("$baseUrl/me/avatar", idempotencyKey = idempotencyKey).getJSONObject("user"))
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

    suspend fun unregisterNotificationDevice(fcmToken: String): Boolean = withContext(Dispatchers.IO) {
        postJson(
            "$baseUrl/notifications/unregister-device",
            JSONObject().put("fcmToken", fcmToken),
        ).optBoolean("unregistered", false)
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
        connectionMethod: String = "",
        idempotencyKey: String? = null,
    ): DevicePairingResponse = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("name", name)
            .put("claimCode", claimCode)
            .put("connectionMethod", connectionMethod)
        parseDevicePairingResponse(
            json = postJson("$baseUrl/devices/pair", body, idempotencyKey),
            expectedDeviceId = deviceId,
        )
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

    suspend fun getAiChatSession(): AiChatSession = withContext(Dispatchers.IO) {
        parseAiChatSession(getJson("$baseUrl/ai/chat"))
    }

    suspend fun getSignalAnalysisStatus(): SignalAnalysisStatus = withContext(Dispatchers.IO) {
        parseSignalAnalysisStatus(getJson("$baseUrl/ai/settings"))
    }

    suspend fun listAiMessages(): List<AiChatMessage> = getAiChatSession().messages

    suspend fun sendAiChatMessage(message: String, idempotencyKey: String): AiChatSession =
        withContext(Dispatchers.IO) {
            parseAiChatSession(
                postJson(
                    "$baseUrl/ai/chat",
                    JSONObject().put("message", message),
                    idempotencyKey = idempotencyKey,
                ),
            )
        }

    suspend fun sendAiMessage(message: String): AiChatMessage {
        val session = sendAiChatMessage(message, idempotencyKey = java.util.UUID.randomUUID().toString())
        return session.messages.lastOrNull { it.role == "assistant" }
            ?: error("AI response did not include a backend-confirmed assistant message")
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
        dateOfBirth: String = "",
        gender: String = "",
        phone: String = "",
        notes: String = "",
        bloodType: String = "unknown",
        allergies: List<String> = emptyList(),
        emergencyContact: EmergencyContact = EmergencyContact(),
        profileType: String = "",
        relationship: String = "",
        idempotencyKey: String = java.util.UUID.randomUUID().toString(),
    ): Patient = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("patientCode", patientCode)
            .put("name", name)
            .put("dateOfBirth", dateOfBirth)
            .put("gender", gender)
            .put("phone", phone)
            .put("notes", notes)
            .put("bloodType", bloodType)
            .put("allergies", JSONArray(allergies))
            .put("emergencyContact", emergencyContact.toJson())
            .put("profileType", profileType)
            .put("relationship", relationship)
        if (age != null) body.put("age", age)

        parsePatient(
            postJson("$baseUrl/patients", body, idempotencyKey).getJSONObject("patient"),
        )
    }

    suspend fun updatePatient(
        patientId: String,
        name: String? = null,
        age: Int? = null,
        dateOfBirth: String? = null,
        gender: String? = null,
        phone: String? = null,
        notes: String? = null,
        bloodType: String? = null,
        allergies: List<String>? = null,
        emergencyContact: EmergencyContact? = null,
        relationship: String? = null,
        idempotencyKey: String = java.util.UUID.randomUUID().toString(),
    ): Patient = withContext(Dispatchers.IO) {
        val body = JSONObject()
        if (name != null) body.put("name", name)
        if (age != null) body.put("age", age)
        if (dateOfBirth != null) body.put("dateOfBirth", dateOfBirth)
        if (gender != null) body.put("gender", gender)
        if (phone != null) body.put("phone", phone)
        if (notes != null) body.put("notes", notes)
        if (bloodType != null) body.put("bloodType", bloodType)
        if (allergies != null) body.put("allergies", JSONArray(allergies))
        if (emergencyContact != null) body.put("emergencyContact", emergencyContact.toJson())
        if (relationship != null) body.put("relationship", relationship)
        parsePatient(
            patchJson(
                "$baseUrl/patients/${patientId.urlEncode()}",
                body,
                idempotencyKey,
            ).getJSONObject("patient"),
        )
    }

    suspend fun deletePatient(
        patientId: String,
        idempotencyKey: String = java.util.UUID.randomUUID().toString(),
    ): Boolean = withContext(Dispatchers.IO) {
        deleteJson("$baseUrl/patients/${patientId.urlEncode()}", idempotencyKey = idempotencyKey)
        true
    }

    suspend fun switchActiveProfile(
        patientId: String,
        idempotencyKey: String = java.util.UUID.randomUUID().toString(),
    ): ActiveProfileResult = withContext(Dispatchers.IO) {
        val response = patchJson(
            "$baseUrl/me/active-profile",
            JSONObject().put("patientId", patientId),
            idempotencyKey,
        )
        ActiveProfileResult(
            user = parseAuthUser(response.getJSONObject("user")),
            activePatient = parsePatient(response.getJSONObject("activePatient")),
        )
    }

    suspend fun listAppointments(
        patientId: String? = null,
        doctorUserId: String? = null,
        status: AppointmentStatus? = null,
        from: String? = null,
        to: String? = null,
    ): List<Appointment> = withContext(Dispatchers.IO) {
        val params = buildList {
            if (!patientId.isNullOrBlank()) add("patientId=${patientId.urlEncode()}")
            if (!doctorUserId.isNullOrBlank()) add("doctorUserId=${doctorUserId.urlEncode()}")
            if (status != null) add("status=${status.wireValue.urlEncode()}")
            if (!from.isNullOrBlank()) add("from=${from.urlEncode()}")
            if (!to.isNullOrBlank()) add("to=${to.urlEncode()}")
        }
        val url = "$baseUrl/appointments" + params.takeIf { it.isNotEmpty() }
            ?.joinToString(prefix = "?", separator = "&")
            .orEmpty()
        getJson(url).optJSONArray("appointments").orEmpty().map(::parseAppointment)
    }

    suspend fun getAppointment(appointmentId: String): Appointment = withContext(Dispatchers.IO) {
        parseAppointment(
            getJson("$baseUrl/appointments/${appointmentId.urlEncode()}").getJSONObject("appointment")
        )
    }

    suspend fun createAppointment(
        mutation: AppointmentMutation,
        idempotencyKey: String,
    ): Appointment = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("patientId", mutation.patientId)
            .put("type", mutation.type.wireValue)
            .put("startsAt", mutation.startsAt)
            .put("endsAt", mutation.endsAt)
            .put("reason", mutation.reason)
            .put("notes", mutation.notes)
        if (mutation.doctorUserId.isNotBlank()) body.put("doctorUserId", mutation.doctorUserId)
        if (mutation.location.isNotBlank()) body.put("location", mutation.location)
        if (mutation.channel.isNotBlank()) body.put("channel", mutation.channel)
        parseAppointment(
            postJson("$baseUrl/appointments", body, idempotencyKey).getJSONObject("appointment")
        )
    }

    suspend fun updateAppointment(
        appointmentId: String,
        patch: AppointmentPatch,
        idempotencyKey: String,
    ): Appointment = withContext(Dispatchers.IO) {
        val body = JSONObject()
        patch.startsAt?.let { body.put("startsAt", it) }
        patch.endsAt?.let { body.put("endsAt", it) }
        patch.status?.let { body.put("status", it.wireValue) }
        patch.cancellationReason?.let { body.put("cancellationReason", it) }
        patch.location?.let { body.put("location", it) }
        patch.reason?.let { body.put("reason", it) }
        patch.notes?.let { body.put("notes", it) }
        parseAppointment(
            patchJson(
                "$baseUrl/appointments/${appointmentId.urlEncode()}",
                body,
                idempotencyKey,
            ).getJSONObject("appointment")
        )
    }

    suspend fun listPatientShares(patientId: String): List<PatientShare> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/patients/${patientId.urlEncode()}/shares")
            .optJSONArray("shares")
            .orEmpty()
            .map(::parsePatientShare)
    }

    suspend fun revokePatientShare(
        patientId: String,
        shareId: String,
        idempotencyKey: String,
    ): PatientShare = withContext(Dispatchers.IO) {
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required to revoke patient access" }
        parseConfirmedPatientShare(
            deleteJson(
                "$baseUrl/patients/${patientId.urlEncode()}/shares/${shareId.urlEncode()}",
                idempotencyKey = idempotencyKey,
            ).getJSONObject("share")
        )
    }

    suspend fun sharePatientRecord(
        patientId: String,
        targetDoctorUserId: String = "",
        targetWorkspaceId: String = "",
        scope: String = "patient_profile",
        scanIds: List<String> = emptyList(),
        expiresAt: String = "",
        idempotencyKey: String,
    ): PatientShare = withContext(Dispatchers.IO) {
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required to grant patient access" }
        val body = JSONObject()
            .put("targetDoctorUserId", targetDoctorUserId)
            .put("targetWorkspaceId", targetWorkspaceId)
            .put("scope", scope)
            .put("scanIds", JSONArray(scanIds))
        if (expiresAt.isNotBlank()) body.put("expiresAt", expiresAt)
        parseConfirmedPatientShare(
            postJson(
                "$baseUrl/patients/${patientId.urlEncode()}/shares",
                body,
                idempotencyKey,
            ).getJSONObject("share")
        )
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

    private suspend fun getJson(url: String): JSONObject {
        val request = Request.Builder().url(url).get().withAuth().build()
        return executeJson(request)
    }

    private suspend fun postJson(url: String, json: JSONObject, idempotencyKey: String? = null): JSONObject {
        val request = Request.Builder()
            .url(url)
            .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
            .withIdempotencyKey(idempotencyKey)
            .withAuth()
            .build()
        return executeJson(request)
    }

    private suspend fun patchJson(url: String, json: JSONObject, idempotencyKey: String? = null): JSONObject {
        val request = Request.Builder()
            .url(url)
            .patch(json.toString().toRequestBody(JSON_MEDIA_TYPE))
            .withIdempotencyKey(idempotencyKey)
            .withAuth()
            .build()
        return executeJson(request)
    }

    private suspend fun deleteJson(
        url: String,
        json: JSONObject? = null,
        idempotencyKey: String? = null,
    ): JSONObject {
        val requestBuilder = Request.Builder()
            .url(url)
            .withIdempotencyKey(idempotencyKey)
            .withAuth()
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
        val secondFactor = twoFactorToken
        if (!secondFactor.isNullOrBlank()) {
            header("X-Shcare-2FA-Token", secondFactor)
        }
        return this
    }

    private fun Request.Builder.withIdempotencyKey(idempotencyKey: String?): Request.Builder {
        if (!idempotencyKey.isNullOrBlank()) {
            header("Idempotency-Key", idempotencyKey)
        }
        return this
    }

    private fun parseAuthUser(json: JSONObject): AuthUser {
        val currentWorkspace = parseWorkspaceSummary(json.optJSONObject("currentWorkspace") ?: json.optJSONObject("workspace"))
        val memberships = json.optJSONArray("memberships").orEmpty().map(::parseWorkspaceMembership)
        val currentMembership = json.optJSONObject("currentMembership")?.let(::parseWorkspaceMembership)
        val currentWorkspaceId = json.optStringFirst(
            "currentWorkspaceId",
            "workspaceId",
            "organizationId"
        ).ifBlank { currentWorkspace?.id.orEmpty() }
        val effectiveWorkspaceType = json.optStringFirst("workspaceType").ifBlank {
            currentWorkspace?.workspaceType?.ifBlank { currentWorkspace.type }.orEmpty()
        }
        val effectiveRole = currentMembership?.role
            ?.takeIf { it.isNotBlank() }
            ?: memberships.firstOrNull { it.workspaceId == currentWorkspaceId || it.organizationId == currentWorkspaceId }
                ?.role
                ?.takeIf { it.isNotBlank() }
            ?: json.optString("role", "doctor")
        return AuthUser(
            id = json.optString("id"),
            role = effectiveRole,
            name = json.optString("name"),
            email = json.optString("email"),
            avatarFileId = json.optString("avatarFileId"),
            avatarUrl = json.optString("avatarUrl"),
            phone = json.optString("phone"),
            license = json.optString("license"),
            hospital = json.optString("hospital"),
            department = json.optString("department"),
            organizationId = json.optStringFirst("organizationId").ifBlank { currentWorkspaceId },
            clinicName = json.optString("clinicName").ifBlank { currentWorkspace?.name.orEmpty() },
            specialty = json.optString("specialty"),
            address = json.optString("address"),
            verifiedEmail = json.optBoolean("verifiedEmail"),
            verifiedPhone = json.optBoolean("verifiedPhone"),
            roleRequestStatus = json.optString("roleRequestStatus"),
            requestedRole = json.optString("requestedRole"),
            roleInfoRequiredFields = json.optJSONArray("roleInfoRequiredFields").toStringList(),
            roleInfoRequestMessage = json.optString("roleInfoRequestMessage"),
            registrationReason = json.optString("registrationReason"),
            currentWorkspaceId = currentWorkspaceId,
            activePatientId = json.optString("activePatientId"),
            currentMembership = currentMembership,
            currentWorkspace = currentWorkspace,
            memberships = memberships,
            workspaceType = effectiveWorkspaceType,
            accountType = json.optString("accountType"),
            clinicSuggestion = json.optString("clinicSuggestion"),
            capabilities = json.optJSONArray("capabilities").toStringList(),
            notificationPreferences = json.optJSONObject("notificationPreferences") ?: JSONObject(),
            twoFactorEnabled = json.optBoolean("twoFactorEnabled"),
            twoFactorMethod = json.optString("twoFactorMethod"),
            twoFactorSecretPreview = json.optString("twoFactorSecretPreview"),
            createdAt = json.stringOrNull("createdAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseTwoFactorAvailability(json: JSONObject): TwoFactorAvailability {
        return TwoFactorAvailability(
            available = json.optBoolean("available"),
            status = json.optString("status"),
            methods = json.optJSONArray("methods").toStringList(),
            reason = json.optString("reason"),
        )
    }

    private fun parseTwoFactorState(json: JSONObject): TwoFactorState {
        return TwoFactorState(
            enabled = json.optBoolean("enabled"),
            method = json.optString("method"),
            enrollmentPending = json.optBoolean("enrollmentPending"),
        )
    }

    private fun parseWorkspaceMembership(json: JSONObject): WorkspaceMembership {
        return WorkspaceMembership(
            id = json.optString("id"),
            workspaceId = json.optStringFirst("workspaceId", "organizationId"),
            organizationId = json.optStringFirst("organizationId", "workspaceId"),
            workspaceName = json.optStringFirst("workspaceName", "name"),
            workspaceType = json.optStringFirst("workspaceType", "type"),
            role = json.optString("role"),
            patientCount = json.optIntFirst("patientCount", "patientsCount"),
            deviceCount = json.optIntFirst("deviceCount", "devicesCount"),
            deviceOnline = json.optIntFirst("deviceOnline", "devicesOnline"),
            alertCount = json.optIntFirst("alertCount", "alertsCount"),
            scanCount = json.optIntFirst("scanCount", "scansCount")
        )
    }

    private fun parseWorkspaceSummary(json: JSONObject?): WorkspaceSummary? {
        if (json == null) return null
        val id = json.optStringFirst("id", "workspaceId", "organizationId")
        val name = json.optStringFirst("name", "workspaceName")
        if (id.isBlank() && name.isBlank()) return null
        val workspaceType = json.optStringFirst("workspaceType", "type")
        return WorkspaceSummary(
            id = id,
            name = name.ifBlank { id },
            type = json.optString("type").ifBlank { workspaceType },
            workspaceType = workspaceType,
            role = json.optString("role"),
            patientCount = json.optIntFirst("patientCount", "patientsCount"),
            deviceCount = json.optIntFirst("deviceCount", "devicesCount"),
            deviceOnline = json.optIntFirst("deviceOnline", "devicesOnline"),
            alertCount = json.optIntFirst("alertCount", "alertsCount"),
            scanCount = json.optIntFirst("scanCount", "scansCount")
        )
    }

    private fun parseAuthSession(json: JSONObject): AuthSession {
        return AuthSession(
            id = json.optString("id"),
            provider = json.optString("provider"),
            device = json.optString("device"),
            userAgent = json.optString("userAgent"),
            ip = json.optString("ip"),
            current = json.optBoolean("current"),
            createdAt = json.optString("createdAt"),
            lastSeenAt = json.optString("lastSeenAt"),
            revokedAt = json.stringOrNull("revokedAt")
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
            userId = json.optString("userId"),
            organizationId = json.optString("organizationId"),
            type = json.optString("type", "info"),
            title = json.optString("title"),
            message = json.optString("message"),
            campaignId = json.optString("campaignId"),
            audienceType = json.optString("audienceType", "legacy"),
            audienceRole = json.optString("audienceRole"),
            requestedChannels = json.optJSONArray("requestedChannels")?.let { channels ->
                buildList {
                    for (index in 0 until channels.length()) {
                        channels.optString(index).takeIf(String::isNotBlank)?.let(::add)
                    }
                }
            }.orEmpty(),
            inAppStatus = json.optString("inAppStatus", "ready"),
            emailStatus = json.optString("emailStatus", "skipped"),
            pushStatus = json.optString("pushStatus", "skipped"),
            read = json.optBoolean("read"),
            readAt = json.stringOrNull("readAt"),
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
            online = json.optBoolean("online"),
            connectionMethod = json.optString("connectionMethod"),
            pairedUserId = json.stringOrNull("pairedUserId"),
            firmwareVersion = json.optString("firmwareVersion"),
            otaStatus = json.optString("otaStatus"),
            audioStatus = json.optString("audioStatus"),
            backendHost = json.optString("backendHost"),
            backendPort = if (json.has("backendPort") && !json.isNull("backendPort")) json.optInt("backendPort") else null,
            telemetry = json.optJSONObject("telemetry")?.let(::parseSmartDeviceTelemetry)
                ?: SmartDeviceTelemetry(),
            lastSeenAt = json.stringOrNull("lastSeenAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseDevicePairingResponse(
        json: JSONObject,
        expectedDeviceId: String,
    ): DevicePairingResponse {
        val deviceJson = json.optJSONObject("device")
            ?: invalidDevicePairingContract("Missing device")
        val pairingJson = json.optJSONObject("pairing")
            ?: invalidDevicePairingContract("Missing pairing")
        val device = parseSmartDevice(deviceJson)
        if (device.id != expectedDeviceId) {
            invalidDevicePairingContract("Device identity mismatch")
        }
        val outcome = when (pairingJson.opt("outcome")) {
            "accepted" -> DevicePairingOutcome.Accepted
            "success" -> DevicePairingOutcome.Success
            else -> invalidDevicePairingContract("Unsupported pairing outcome")
        }
        val presence = when (pairingJson.opt("presence")) {
            "awaiting_online" -> DevicePairingPresence.AwaitingOnline
            "online" -> DevicePairingPresence.Online
            else -> invalidDevicePairingContract("Unsupported pairing presence")
        }
        val onlineConfirmed = pairingJson.opt("onlineConfirmed") as? Boolean
            ?: invalidDevicePairingContract("Missing online confirmation")
        val authenticatedTransport = pairingJson.stringOrNull("authenticatedTransport")
        val isAcceptedWaiting = outcome == DevicePairingOutcome.Accepted &&
            presence == DevicePairingPresence.AwaitingOnline &&
            !onlineConfirmed &&
            authenticatedTransport == null
        val isConfirmedOnline = outcome == DevicePairingOutcome.Success &&
            presence == DevicePairingPresence.Online &&
            onlineConfirmed &&
            authenticatedTransport == "wss"
        if (!isAcceptedWaiting && !isConfirmedOnline) {
            invalidDevicePairingContract("Pairing outcome and presence disagree")
        }
        if (device.online != onlineConfirmed || device.connected != onlineConfirmed) {
            invalidDevicePairingContract("Device presence disagrees with pairing confirmation")
        }
        return DevicePairingResponse(
            device = device,
            pairing = DevicePairingState(
                outcome = outcome,
                presence = presence,
                onlineConfirmed = onlineConfirmed,
                authenticatedTransport = authenticatedTransport,
            ),
            idempotent = json.optBoolean("idempotent", false),
        )
    }

    private fun invalidDevicePairingContract(reason: String): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = "DEVICE_PAIRING_CONTRACT_INVALID",
            message = "Invalid device pairing response: $reason",
        )
    }

    private fun parseSmartDeviceTelemetry(json: JSONObject): SmartDeviceTelemetry {
        return SmartDeviceTelemetry(
            uptimeMs = json.longOrNull("uptimeMs"),
            resetReason = json.optString("resetReason"),
            freeHeapBytes = json.longOrNull("freeHeapBytes"),
            i2sStatus = json.optString("i2sStatus"),
            audioPacketsSent = json.longOrNull("audioPacketsSent"),
            audioPacketsDropped = json.longOrNull("audioPacketsDropped"),
            audioSendFailures = json.longOrNull("audioSendFailures"),
            lastCommandId = json.optString("lastCommandId"),
            lastCommandState = json.optString("lastCommandState"),
            lastCommandCode = json.optString("lastCommandCode"),
            lastCommandUptimeMs = json.longOrNull("lastCommandUptimeMs"),
            otaStatus = json.optString("otaStatus"),
            audioStatus = json.optString("audioStatus"),
            connectionMethod = json.optString("connectionMethod"),
        )
    }

    private fun parseAppointment(json: JSONObject): Appointment {
        return Appointment(
            id = json.optString("id"),
            organizationId = json.optString("organizationId"),
            patientId = json.optString("patientId"),
            doctorUserId = json.optString("doctorUserId"),
            type = AppointmentType.fromWire(json.optString("type")),
            status = AppointmentStatus.fromWire(json.optString("status")),
            startsAt = json.optString("startsAt"),
            endsAt = json.optString("endsAt"),
            location = json.optString("location"),
            channel = json.optString("channel"),
            reason = json.optString("reason"),
            notes = json.optString("notes"),
            cancellationReason = json.optString("cancellationReason"),
            patient = json.optJSONObject("patient")?.let(::parseAppointmentPerson),
            doctor = json.optJSONObject("doctor")?.let(::parseAppointmentPerson),
            createdAt = json.stringOrNull("createdAt"),
            updatedAt = json.stringOrNull("updatedAt"),
        )
    }

    private fun parseAppointmentPerson(json: JSONObject): AppointmentPerson {
        return AppointmentPerson(
            id = json.optString("id"),
            name = json.optString("name"),
            patientCode = json.optString("patientCode"),
            email = json.optString("email"),
            specialty = json.optString("specialty"),
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

    private fun parseAiChatSession(json: JSONObject): AiChatSession {
        val availabilityJson = json.optJSONObject("availability")
        val availability = if (availabilityJson == null) {
            AiChatAvailability(
                available = json.optBoolean("available", true),
                provider = json.optString("provider"),
                reason = json.optString("reason"),
            )
        } else {
            AiChatAvailability(
                available = availabilityJson.optBoolean("available", false),
                provider = availabilityJson.optString("provider"),
                reason = availabilityJson.optString("reason"),
            )
        }
        return AiChatSession(
            messages = json.optJSONArray("messages").orEmpty().map(::parseAiChatMessage),
            availability = availability,
        )
    }

    private fun parseSignalAnalysisStatus(json: JSONObject): SignalAnalysisStatus {
        val settingsJson = json.optJSONObject("settings") ?: JSONObject()
        val runtimeJson = json.optJSONObject("runtime") ?: JSONObject()
        val scanAnalysisJson = runtimeJson.optJSONObject("scanAnalysis") ?: JSONObject()
        val chatProviderJson = runtimeJson.optJSONObject("chatProvider") ?: JSONObject()
        val modelUpdateJson = runtimeJson.optJSONObject("modelUpdate") ?: JSONObject()
        return SignalAnalysisStatus(
            settings = SignalAnalysisSettings(
                analysisKind = settingsJson.optString("analysisKind"),
                version = settingsJson.optString("version"),
                analyzerVersion = settingsJson.optString("analyzerVersion"),
                status = settingsJson.optString("status"),
                updateSupported = settingsJson.optBoolean("updateSupported"),
                clinicalDecisionSupport = settingsJson.optBoolean("clinicalDecisionSupport"),
                accuracyMetricsAvailable = settingsJson.optBoolean("accuracyMetricsAvailable"),
                lastUpdateStatus = settingsJson.optString("lastUpdateStatus"),
            ),
            runtime = SignalAnalysisRuntime(
                scanAnalysis = SignalAnalysisScanRuntime(
                    available = scanAnalysisJson.optBoolean("available"),
                    analysisKind = scanAnalysisJson.optString("analysisKind"),
                    analyzerVersion = scanAnalysisJson.optString("analyzerVersion"),
                    clinicalDecisionSupport = scanAnalysisJson.optBoolean("clinicalDecisionSupport"),
                ),
                chatProvider = SignalAnalysisChatRuntime(
                    available = chatProviderJson.optBoolean("available"),
                    status = chatProviderJson.optString("status"),
                    reason = chatProviderJson.optString("reason"),
                ),
                modelUpdate = SignalAnalysisUpdateRuntime(
                    available = modelUpdateJson.optBoolean("available"),
                    reason = modelUpdateJson.optString("reason"),
                ),
            ),
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

    private suspend fun executeJson(request: Request): JSONObject {
        return executeCancellable(request) { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw parseApiException(response.code, text)
            }
            if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }

    private suspend fun executeBytes(request: Request): ByteArray {
        return executeCancellable(request) { response ->
            if (!response.isSuccessful) {
                val text = response.body?.string().orEmpty()
                throw parseApiException(response.code, text)
            }
            response.body?.bytes() ?: ByteArray(0)
        }
    }

    private suspend fun <T> executeCancellable(
        request: Request,
        transform: (Response) -> T,
    ): T = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) {
                    continuation.resumeWith(Result.failure(e))
                }
            }

            override fun onResponse(call: Call, response: Response) {
                if (!continuation.isActive) {
                    response.close()
                    return
                }
                val result = runCatching { response.use(transform) }
                if (continuation.isActive) {
                    continuation.resumeWith(result)
                }
            }
        })
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

    private fun parseApiException(statusCode: Int, text: String): SmartHealthApiException {
        val json = runCatching { JSONObject(text) }.getOrNull()
        val nestedError = json?.optJSONObject("error")
        val stringError = json?.opt("error") as? String
        val code = nestedError?.optString("code")
            ?.ifBlank { null }
            ?: json?.optString("code")?.ifBlank { null }
            ?: "HTTP_$statusCode"
        val message = nestedError?.optString("message")
            ?.ifBlank { null }
            ?: json?.optString("message")?.ifBlank { null }
            ?: stringError?.ifBlank { null }
            ?: "HTTP $statusCode"
        val fieldErrorJson = nestedError?.optJSONObject("fieldErrors") ?: json?.optJSONObject("fieldErrors")
        val fieldErrors = buildMap {
            if (fieldErrorJson != null) {
                fieldErrorJson.keys().forEach { key ->
                    fieldErrorJson.optString(key).takeIf { it.isNotBlank() }?.let { put(key, it) }
                }
            }
        }
        val details = (nestedError?.optJSONObject("details") ?: json?.optJSONObject("details"))
            ?.toStringMap()
            .orEmpty()
        return SmartHealthApiException(
            statusCode = statusCode,
            code = code,
            fieldErrors = fieldErrors,
            details = details,
            requestId = nestedError?.optString("requestId")
                ?.ifBlank { null }
                ?: json?.optString("requestId").orEmpty(),
            message = message,
        )
    }

    private fun parsePatient(json: JSONObject): Patient {
        return Patient(
            id = json.optString("id"),
            patientCode = json.optString("patientCode"),
            name = json.optString("name"),
            age = json.intOrNull("age"),
            dateOfBirth = json.optStringFirst("dateOfBirth", "dob"),
            gender = json.optString("gender"),
            phone = json.optString("phone"),
            notes = json.optString("notes"),
            bloodType = json.optString("bloodType", "unknown"),
            allergies = json.optJSONArray("allergies").toStringList(),
            emergencyContact = json.optJSONObject("emergencyContact")?.let {
                EmergencyContact(
                    name = it.optString("name"),
                    phone = it.optString("phone"),
                    relationship = it.optString("relationship"),
                )
            } ?: EmergencyContact(),
            profileType = json.optString("profileType"),
            relationship = json.optString("relationship"),
            ownerUserId = json.optString("ownerUserId"),
            scanCount = json.optInt("scanCount"),
            lastScanAt = json.stringOrNull("lastScanAt"),
            lastAiLabel = json.stringOrNull("lastAiLabel")
        )
    }

    private fun parsePatientShare(json: JSONObject): PatientShare {
        val status = json.optString("status")
        val doctorUserId = json.optString("doctorUserId")
        val doctorId = json.optString("doctorId")
        val organizationId = json.optString("organizationId")
        val recipient = json.optJSONObject("recipient")?.let(::parseShareRecipient)
            ?: ShareRecipient()
        return PatientShare(
            id = json.optString("id"),
            patientId = json.optString("patientId"),
            authorityType = json.optString("authorityType"),
            status = status,
            recipient = recipient,
            grantedByActor = json.optJSONObject("grantedByActor")?.let(::parseShareAuditActor),
            revokedByActor = json.optJSONObject("revokedByActor")?.let(::parseShareAuditActor),
            doctorUserId = doctorUserId,
            doctorId = doctorId,
            organizationId = organizationId,
            scope = json.optString("scope"),
            scanIds = json.optJSONArray("scanIds").toStringList(),
            expiresAt = json.stringOrNull("expiresAt"),
            active = status == "active",
            grantedByUserId = json.optString("grantedByUserId"),
            revokedAt = json.stringOrNull("revokedAt"),
            revokedByUserId = json.optString("revokedByUserId"),
            createdAt = json.stringOrNull("createdAt"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private fun parseConfirmedPatientShare(json: JSONObject): PatientShare {
        val share = parsePatientShare(json)
        if (!share.hasCanonicalAccessContract) {
            throw SmartHealthApiException(
                statusCode = 502,
                code = "PATIENT_SHARE_CONTRACT_INVALID",
                message = "Máy chủ trả dữ liệu quyền truy cập chưa đầy đủ",
            )
        }
        return share
    }

    private fun parseShareRecipient(json: JSONObject): ShareRecipient {
        return ShareRecipient(
            type = json.optString("type"),
            id = json.optString("id"),
            name = json.optString("name"),
            workspaceId = json.optString("workspaceId"),
        )
    }

    private fun parseShareAuditActor(json: JSONObject): ShareAuditActor {
        return ShareAuditActor(
            id = json.optString("id"),
            name = json.optString("name"),
            role = json.optString("role"),
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

    private fun JSONObject.toStringMap(): Map<String, String> = buildMap {
        keys().forEach { key ->
            optString(key).takeIf { it.isNotBlank() }?.let { put(key, it) }
        }
    }

    private fun JSONObject.optStringFirst(vararg names: String): String {
        for (name in names) {
            val value = optString(name)
            if (value.isNotBlank()) return value
        }
        return ""
    }

    private fun JSONObject.optIntFirst(vararg names: String): Int {
        for (name in names) {
            if (!has(name) || isNull(name)) continue
            val raw = opt(name)
            when (raw) {
                is Number -> return raw.toInt()
                is String -> raw.toIntOrNull()?.let { return it }
            }
        }
        return 0
    }

    private fun EmergencyContact.toJson(): JSONObject = JSONObject()
        .put("name", name)
        .put("phone", phone)
        .put("relationship", relationship)

    private fun String.urlEncode(): String = java.net.URLEncoder.encode(this, "UTF-8")

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()
        val sharedClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}

object SmartHealthRepository {
    val api = SmartHealthApi()
}
