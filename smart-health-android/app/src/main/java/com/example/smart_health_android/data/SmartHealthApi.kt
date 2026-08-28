package com.example.smart_health_android.data

import android.util.Base64
import com.example.smart_health_android.appointments.Appointment
import com.example.smart_health_android.appointments.AppointmentMutation
import com.example.smart_health_android.appointments.AppointmentPatch
import com.example.smart_health_android.appointments.AppointmentPerson
import com.example.smart_health_android.appointments.AppointmentStatus
import com.example.smart_health_android.appointments.AppointmentType
import com.example.smart_health_android.notifications.NotificationChannelAvailability
import com.example.smart_health_android.notifications.NotificationChannelAvailabilitySet
import com.example.smart_health_android.notifications.NotificationCloudPreferences
import com.example.smart_health_android.notifications.NotificationInboxAction
import com.example.smart_health_android.notifications.NotificationInboxMutationReceipt
import com.example.smart_health_android.notifications.NotificationInboxSnapshot
import com.example.smart_health_android.notifications.NotificationPreferenceField
import com.example.smart_health_android.notifications.NotificationPreferenceMutation
import com.example.smart_health_android.notifications.NotificationPreferenceOwnership
import com.example.smart_health_android.notifications.NotificationPreferencesSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.time.Instant
import java.util.concurrent.TimeUnit

data class NotificationDeviceRegistrationAck(
    val id: String,
    val userId: String,
    val workspaceId: String,
    val fcmToken: String,
    val authSessionId: String,
    val notificationProtocolVersion: Int,
    val appVersion: String,
    val enabled: Boolean,
) {
    fun confirmsPrivacyGatedDelivery(
        minimumProtocolVersion: Int,
        expectedUserId: String,
        expectedWorkspaceId: String,
        expectedFcmToken: String,
        expectedAuthSessionId: String,
        expectedAppVersion: String,
    ): Boolean {
        return id.isNotBlank() &&
            userId.isNotBlank() &&
            userId == expectedUserId &&
            workspaceId.isNotBlank() &&
            workspaceId == expectedWorkspaceId &&
            fcmToken.isNotBlank() &&
            fcmToken == expectedFcmToken &&
            authSessionId.isNotBlank() &&
            authSessionId == expectedAuthSessionId &&
            notificationProtocolVersion >= minimumProtocolVersion &&
            appVersion.isNotBlank() &&
            appVersion == expectedAppVersion &&
            enabled
    }
}

data class PasswordChangeReceipt(
    val confirmed: Boolean,
    val userId: String,
    val provider: String,
    val operationId: String,
    val replayed: Boolean,
)

/** Encrypted ESPTouch V2 material, retained only for the foreground setup session. */
data class DeviceWifiSetupSession(
    val device: SmartDevice,
    val transport: String,
    val security: String,
    val provisioningKey: ByteArray,
    val reservedData: ByteArray,
    val expiresAt: Instant,
) {
    fun clearSensitiveMaterial() {
        provisioningKey.fill(0)
        reservedData.fill(0)
    }
}

private const val ESPTouchV2ProtocolVersion = 2
private const val ESPTouchV2Transport = "esptouch_v2"
private const val ESPTouchV2Security = "aes128"
private const val ESPTouchV2KeyBytes = 16
private const val ESPTouchV2ReservedDataBytes = 35

class SmartHealthApi(
    private val baseUrl: String = BackendConfig.API_BASE_URL,
    private val client: OkHttpClient = sharedClient
) {
    private fun decodeSetupMaterial(value: String, expectedLength: Int): ByteArray {
        val decoded = runCatching {
            Base64.decode(
                value,
                Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP,
            )
        }.getOrElse { invalidDeviceWifiSetupContract() }
        if (decoded.size != expectedLength) {
            decoded.fill(0)
            invalidDeviceWifiSetupContract()
        }
        return decoded
    }

    private fun invalidDeviceWifiSetupContract(): Nothing = throw SmartHealthApiException(
        statusCode = 502,
        code = "DEVICE_WIFI_SETUP_CONTRACT_INVALID",
        message = "Backend returned an invalid encrypted Wi-Fi setup session",
    )

    @Volatile
    private var authSessionSnapshot = AuthSessionSnapshot()

    @Volatile
    private var twoFactorToken: String? = null

    @Synchronized
    fun setAuthToken(token: String?) {
        val normalized = token?.takeIf { it.isNotBlank() }
        val current = authSessionSnapshot
        if (normalized != current.bearerToken) {
            authSessionSnapshot = AuthSessionSnapshot(
                bearerToken = normalized,
                epoch = nextEpoch(current.epoch),
            )
            twoFactorToken = null
        }
    }

    fun currentAuthToken(): String? = authSessionSnapshot.bearerToken

    fun currentAuthSessionEpoch(): Long = authSessionSnapshot.epoch

    fun currentAuthSessionId(): String? = authSessionSnapshot.authSessionId

    fun currentTwoFactorToken(): String? = twoFactorToken

    @Synchronized
    fun currentAuthSessionAuthorityFor(
        expectedBearerToken: String,
    ): AuthSessionAuthority? {
        val expected = expectedBearerToken.takeIf(String::isNotBlank) ?: return null
        val current = authSessionSnapshot
        if (current.bearerToken != expected) return null
        return AuthSessionAuthority(
            bearerToken = expected,
            epoch = current.epoch,
        )
    }

    @Synchronized
    fun clearAuthTokenIfCurrent(expectedAuthority: AuthSessionAuthority): Boolean {
        val current = authSessionSnapshot
        if (
            current.bearerToken != expectedAuthority.bearerToken ||
            current.epoch != expectedAuthority.epoch
        ) {
            return false
        }
        authSessionSnapshot = AuthSessionSnapshot(epoch = nextEpoch(current.epoch))
        twoFactorToken = null
        return true
    }

    @Synchronized
    private fun adoptAuthTokenIfEpoch(
        expectedEpoch: Long,
        token: String,
    ): AuthSessionAuthority? {
        val normalized = token.takeIf(String::isNotBlank) ?: return null
        val current = authSessionSnapshot
        if (current.epoch != expectedEpoch) return null
        val next = if (current.bearerToken == normalized) {
            current
        } else {
            twoFactorToken = null
            AuthSessionSnapshot(
                bearerToken = normalized,
                epoch = nextEpoch(current.epoch),
            )
        }
        authSessionSnapshot = next
        return AuthSessionAuthority(
            bearerToken = normalized,
            epoch = next.epoch,
        )
    }

    @Synchronized
    private fun commitTwoFactorTokensIfCurrent(
        expected: AuthSessionSnapshot,
        primaryToken: String,
        secondFactorToken: String,
    ): Boolean {
        val current = authSessionSnapshot
        if (current != expected) return false
        val normalizedPrimary = primaryToken.takeIf(String::isNotBlank)
            ?: current.bearerToken
        val next = if (current.bearerToken == normalizedPrimary) {
            current
        } else {
            AuthSessionSnapshot(
                bearerToken = normalizedPrimary,
                epoch = nextEpoch(current.epoch),
            )
        }
        authSessionSnapshot = next
        twoFactorToken = secondFactorToken.takeIf(String::isNotBlank)
        return true
    }

    @Synchronized
    private fun setTwoFactorToken(token: String?) {
        twoFactorToken = token?.takeIf { it.isNotBlank() }
    }

    @Synchronized
    private fun pinAuthSessionAtEpoch(
        expectedEpoch: Long,
        requireBearer: Boolean,
    ): PinnedAuthSession {
        val current = authSessionSnapshot
        if (
            current.epoch != expectedEpoch ||
            (requireBearer && current.bearerToken.isNullOrBlank())
        ) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Phiên đăng nhập đã thay đổi trước khi gửi yêu cầu",
            )
        }
        return PinnedAuthSession(
            session = current,
            twoFactorToken = twoFactorToken,
        )
    }

    @Synchronized
    private fun isPinnedAuthSessionCurrent(expected: AuthSessionSnapshot): Boolean =
        authSessionSnapshot == expected

    private fun authSessionReplacedDuringTwoFactorEnrollment() = SmartHealthApiException(
        statusCode = 409,
        code = "AUTH_SESSION_REPLACED",
        message = "Phiên đăng nhập đã thay đổi trong khi thiết lập xác thực hai lớp",
    )

    private fun pinCapturedAuthSession(
        expectedAuthority: AuthSessionAuthority,
    ): PinnedAuthSession {
        val bearerToken = expectedAuthority.bearerToken.trim()
        if (bearerToken.isBlank() || expectedAuthority.epoch < 0L) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Captured authentication authority is invalid",
            )
        }
        return PinnedAuthSession(
            session = AuthSessionSnapshot(
                bearerToken = bearerToken,
                epoch = expectedAuthority.epoch,
            ),
            twoFactorToken = null,
        )
    }

    suspend fun getHealth(): BackendHealth = withContext(Dispatchers.IO) {
        parseHealth(getJson("$baseUrl/health"))
    }

    suspend fun authenticateFirebase(
        idToken: String,
        expectedAuthSessionEpoch: Long,
    ): AuthResult = withContext(Dispatchers.IO) {
        val expectedAuthority = adoptAuthTokenIfEpoch(
            expectedEpoch = expectedAuthSessionEpoch,
            token = idToken,
        )
            ?: throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Authentication session was replaced before Firebase exchange",
            )
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = expectedAuthority.epoch,
            requireBearer = true,
        )
        val json = getJson("$baseUrl/auth/firebase", pinnedSession)
        try {
            requireCurrentAuthSessionAuthority(expectedAuthority)
            val user = parseFirebaseAuthUser(json.getJSONObject("user"))
            requireCurrentAuthSessionAuthority(expectedAuthority)
            bindAuthSession(
                expectedAuthority = expectedAuthority,
                authSessionId = json.optJSONObject("session")?.optString("id").orEmpty(),
            )
            AuthResult(
                token = idToken,
                user = user,
                authority = expectedAuthority,
            ).also {
                requireCurrentAuthSessionAuthority(expectedAuthority)
            }
        } catch (error: Throwable) {
            clearAuthTokenIfCurrent(expectedAuthority)
            throw error
        }
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
        workspaceType: String = "",
        idempotencyKey: String,
        expectedAuthSessionEpoch: Long,
        expectedUserId: String = "",
        expectedWorkspaceId: String = "",
    ): AuthUser = withContext(Dispatchers.IO) {
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val body = JSONObject()
            .put("requestedRole", requestedRole)
            .put("name", name)
            .put("phone", phone)
            .put("license", license)
            .put("hospital", hospital)
            .put("department", department)
            .put("specialty", department)
            .put("reason", reason)
            .put("accountType", accountType)
            .put("workspaceType", workspaceType)
        organizationId.trim().takeIf(String::isNotEmpty)?.let { selectedWorkspaceId ->
            body.put("organizationId", selectedWorkspaceId)
        }
        val normalizedExpectedUserId = expectedUserId.trim()
        val normalizedExpectedWorkspaceId = expectedWorkspaceId.trim()
        require(
            (
                normalizedExpectedUserId.isEmpty() &&
                    normalizedExpectedWorkspaceId.isEmpty()
                ) ||
                (
                    normalizedExpectedUserId == expectedUserId &&
                        normalizedExpectedWorkspaceId == expectedWorkspaceId &&
                        normalizedExpectedUserId.length in 1..120 &&
                        normalizedExpectedWorkspaceId.length in 1..120
                    ),
        ) {
            "Expected role-request user and workspace must be supplied together as canonical IDs."
        }
        if (normalizedExpectedUserId.isNotEmpty()) {
            body
                .put("expectedUserId", normalizedExpectedUserId)
                .put("expectedWorkspaceId", normalizedExpectedWorkspaceId)
        }
        val stableIdempotencyKey = idempotencyKey.trim()
        require(
            stableIdempotencyKey.length in 8..160 &&
                stableIdempotencyKey == idempotencyKey,
        ) {
            "A stable Idempotency-Key containing 8 to 160 characters is required."
        }
        val response = postJson(
            "$baseUrl/auth/role-request",
            body,
            stableIdempotencyKey,
            pinnedSession = pinnedSession,
        )
        requireCurrentAuthSessionAuthority(
            AuthSessionAuthority(
                bearerToken = checkNotNull(pinnedSession.session.bearerToken),
                epoch = pinnedSession.session.epoch,
            ),
        )
        parseRoleRequestReceipt(
            json = response,
            expectedRequestedRole = requestedRole,
            expectedOrganizationId = organizationId,
            expectedCurrentWorkspaceId = normalizedExpectedWorkspaceId,
            expectedAccountType = accountType,
            expectedWorkspaceType = workspaceType,
        )
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

    suspend fun logout(): Boolean {
        val token = currentAuthToken() ?: return false
        val authority = currentAuthSessionAuthorityFor(token) ?: return false
        return logout(authority)
    }

    suspend fun logout(
        expectedAuthority: AuthSessionAuthority,
    ): Boolean = withContext(Dispatchers.IO) {
        val pinnedSession = pinCapturedAuthSession(expectedAuthority)
        try {
            postJson(
                url = "$baseUrl/auth/logout",
                json = JSONObject(),
                pinnedSession = pinnedSession,
            )
            true
        } finally {
            clearAuthTokenIfCurrent(expectedAuthority)
        }
    }

    suspend fun getMe(): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(getJson("$baseUrl/me").getJSONObject("user"))
    }

    suspend fun getPatientDashboard(
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): PatientDashboardSnapshot = withContext(Dispatchers.IO) {
        val userId = expectedUserId.trim()
        val workspaceId = expectedWorkspaceId.trim()
        if (userId.isBlank() || workspaceId.isBlank()) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_AUTHORITY_MISMATCH",
                reason = "Patient dashboard requires an exact user and workspace authority.",
            )
        }
        val dashboard = getJson("$baseUrl/patient/dashboard").optJSONObject("dashboard")
            ?: invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard response is missing its versioned envelope.",
            )
        parsePatientDashboard(
            json = dashboard,
            expectedUserId = userId,
            expectedWorkspaceId = workspaceId,
        )
    }

    suspend fun getNotificationPreferences(): NotificationPreferencesSnapshot =
        withContext(Dispatchers.IO) {
            parseNotificationPreferences(
                getJson("$baseUrl/me/notification-preferences"),
            )
        }

    suspend fun patchNotificationPreference(
        field: NotificationPreferenceField,
        enabled: Boolean,
        idempotencyKey: String,
    ): NotificationPreferencesSnapshot = withContext(Dispatchers.IO) {
        val mutation = NotificationPreferenceMutation(field, enabled).requestFields()
        val body = JSONObject()
            .put("key", mutation.getValue("key"))
            .put("enabled", mutation.getValue("enabled"))
        parseNotificationPreferences(
            patchJson(
                "$baseUrl/me/notification-preferences",
                body,
                idempotencyKey,
            ),
        )
    }

    suspend fun listAuthSessions(): List<AuthSession> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/auth/sessions")
            .optJSONArray("sessions")
            .orEmpty()
            .map(::parseAuthSession)
    }

    suspend fun revokeAuthSession(
        sessionId: String,
        idempotencyKey: String,
    ): AuthSessionRevocationReceipt = withContext(Dispatchers.IO) {
        val targetSessionId = sessionId.trim()
        require(
            targetSessionId == sessionId &&
                targetSessionId.length in 1..160,
        ) {
            "A canonical auth session id is required"
        }
        val stableIdempotencyKey = idempotencyKey.trim()
        require(
            stableIdempotencyKey == idempotencyKey &&
                stableIdempotencyKey.length in 8..160,
        ) {
            "A stable Idempotency-Key containing 8 to 160 characters is required"
        }
        val bearerToken = currentAuthToken()
            ?: throw SmartHealthApiException(
                statusCode = 401,
                code = "AUTH_REQUIRED",
                message = "Authentication is required to revoke an auth session",
            )
        val expectedAuthority = currentAuthSessionAuthorityFor(bearerToken)
            ?: throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Authentication session changed before revocation dispatch",
            )
        val response = postJson(
            url = "$baseUrl/auth/sessions/${targetSessionId.urlEncode()}/revoke",
            json = JSONObject(),
            idempotencyKey = stableIdempotencyKey,
            pinnedSession = pinCapturedAuthSession(expectedAuthority),
        )
        requireCurrentAuthSessionAuthority(expectedAuthority)
        parseAuthSessionRevocationReceipt(response, targetSessionId).also {
            requireCurrentAuthSessionAuthority(expectedAuthority)
        }
    }

    suspend fun updateMe(fields: JSONObject, idempotencyKey: String? = null): AuthUser = withContext(Dispatchers.IO) {
        parseAuthUser(patchJson("$baseUrl/me", fields, idempotencyKey).getJSONObject("user"))
    }

    suspend fun updateAccountProfile(
        intent: AccountProfileUpdateIntent,
    ): AccountProfileUpdateReceipt = withContext(Dispatchers.IO) {
        validateAccountProfileUpdateIntent(intent)
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = intent.expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val body = JSONObject()
        intent.expectedChangedFields.forEach { field ->
            when (field) {
                "name" -> body.put(field, intent.name)
                "license" -> body.put(field, intent.license)
                "hospital" -> body.put(field, intent.hospital)
                "department" -> body.put(field, intent.department)
                "specialty" -> body.put(field, intent.specialty)
                "address" -> body.put(field, intent.address)
            }
        }
        val request = Request.Builder()
            .url("$baseUrl/me")
            .patch(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .withIdempotencyKey(intent.idempotencyKey)
            .withAuth(pinnedSession)
            .build()
        val response = executeJson(request)
        requireAccountProfileSessionCurrent(pinnedSession)
        parseAccountProfileUpdateReceipt(response, intent).also {
            requireAccountProfileSessionCurrent(pinnedSession)
        }
    }

    suspend fun switchWorkspace(
        workspaceId: String,
        idempotencyKey: String? = null,
    ): AuthUser = withContext(Dispatchers.IO) {
        val body = JSONObject().put("organizationId", workspaceId)
        parseAuthUser(patchJson("$baseUrl/me", body, idempotencyKey).getJSONObject("user"))
    }

    suspend fun changePassword(
        expectedUserId: String,
        currentPassword: String,
        newPassword: String,
        idempotencyKey: String,
        deferRevokedAuthorizationInvalidation: Boolean = false,
    ): PasswordChangeReceipt = withContext(Dispatchers.IO) {
        val normalizedExpectedUserId = expectedUserId.trim()
        require(normalizedExpectedUserId.isNotBlank()) {
            "Expected backend user id is required to change a password"
        }
        require(idempotencyKey.isNotBlank()) {
            "Idempotency-Key is required to change a password"
        }
        val response = postJson(
            "$baseUrl/me/password",
            JSONObject()
                .put("currentPassword", currentPassword)
                .put("newPassword", newPassword),
            idempotencyKey,
            terminalAuthorizationEventExemptCodes = if (
                deferRevokedAuthorizationInvalidation
            ) {
                setOf("FIREBASE_ID_TOKEN_REVOKED")
            } else {
                emptySet()
            },
        )
        parsePasswordChangeReceipt(response, normalizedExpectedUserId)
    }

    suspend fun getTwoFactorStatus(): TwoFactorStatusResult = withContext(Dispatchers.IO) {
        val response = getJson("$baseUrl/me/2fa")
        TwoFactorStatusResult(
            availability = parseTwoFactorAvailability(response.getJSONObject("availability")),
            twoFactor = parseTwoFactorState(response.getJSONObject("twoFactor")),
        )
    }

    suspend fun startTwoFactorEnrollment(
        intent: TwoFactorEnrollmentStartIntent,
    ): TwoFactorEnrollmentResult = withContext(Dispatchers.IO) {
        validateTwoFactorEnrollmentStartIntent(intent)
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = intent.expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val response = postJson(
            "$baseUrl/me/2fa/enroll",
            JSONObject().put("method", "app"),
            idempotencyKey = intent.idempotencyKey,
            pinnedSession = pinnedSession,
        )
        val result = parseTwoFactorEnrollmentStartReceipt(response, intent)
        if (!isPinnedAuthSessionCurrent(pinnedSession.session)) {
            throw authSessionReplacedDuringTwoFactorEnrollment()
        }
        result
    }

    suspend fun verifyTwoFactorEnrollment(
        intent: TwoFactorEnrollmentIntent,
    ): TwoFactorVerifiedResult = withContext(Dispatchers.IO) {
        validateTwoFactorEnrollmentIntent(intent)
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = intent.expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val response = postJson(
            "$baseUrl/me/2fa/verify",
            JSONObject()
                .put("enrollmentId", intent.enrollmentId)
                .put("otp", intent.code),
            idempotencyKey = intent.idempotencyKey,
            pinnedSession = pinnedSession,
        )
        val result = parseTwoFactorEnrollmentReceipt(
            json = response,
            intent = intent,
        )
        if (!isPinnedAuthSessionCurrent(pinnedSession.session)) {
            throw authSessionReplacedDuringTwoFactorEnrollment()
        }
        result
    }

    suspend fun acknowledgeTwoFactorRecoveryCodes(
        intent: TwoFactorRecoveryAcknowledgementIntent,
    ): TwoFactorRecoveryAcknowledgementReceipt = withContext(Dispatchers.IO) {
        validateTwoFactorRecoveryAcknowledgementIntent(intent)
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = intent.expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val response = postJson(
            "$baseUrl/me/2fa/recovery-codes/ack",
            JSONObject()
                .put("deliveryId", intent.deliveryId)
                .put("recoveryAckToken", intent.recoveryAckToken),
            idempotencyKey = intent.idempotencyKey,
            pinnedSession = pinnedSession,
        )
        val result = parseTwoFactorRecoveryAcknowledgementReceipt(
            json = response,
            intent = intent,
        )
        if (
            !commitTwoFactorTokensIfCurrent(
                expected = pinnedSession.session,
                primaryToken = "",
                secondFactorToken = result.twoFactorToken,
            )
        ) {
            throw authSessionReplacedDuringTwoFactorEnrollment()
        }
        result
    }

    suspend fun completeTwoFactorChallenge(
        challengeId: String,
        code: String,
        expectedAuthSessionEpoch: Long,
    ): TwoFactorChallengeResult = withContext(Dispatchers.IO) {
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = expectedAuthSessionEpoch,
            requireBearer = false,
        )
        val response = postJson(
            "$baseUrl/auth/2fa/challenge",
            JSONObject().put("challengeId", challengeId).put("code", code),
            pinnedSession = pinnedSession,
        )
        val result = TwoFactorChallengeResult(
            twoFactorToken = response.getString("twoFactorToken"),
            expiresAt = response.getString("expiresAt"),
            token = response.optString("token"),
            user = response.optJSONObject("user")?.let(::parseAuthUser),
        )
        if (
            !commitTwoFactorTokensIfCurrent(
                expected = pinnedSession.session,
                primaryToken = result.token,
                secondFactorToken = result.twoFactorToken,
            )
        ) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Phiên đăng nhập đã thay đổi trong khi xác nhận xác thực hai lớp",
            )
        }
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

    suspend fun uploadMyAvatar(
        intent: AvatarUploadIntent,
    ): AvatarUploadReceipt = withContext(Dispatchers.IO) {
        validateAvatarUploadIntent(intent)
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = intent.expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val request = Request.Builder()
            .url("$baseUrl/me/avatar")
            .post(intent.bytes.toRequestBody(intent.contentType.toMediaType()))
            .header("X-File-Name", intent.fileName)
            .withIdempotencyKey(intent.idempotencyKey)
            .withAuth(pinnedSession)
            .build()
        val response = executeJson(request)
        requireAvatarSessionCurrent(pinnedSession)
        parseAvatarUploadReceipt(response, intent).also {
            requireAvatarSessionCurrent(pinnedSession)
        }
    }

    suspend fun deleteMyAvatar(
        intent: AvatarDeleteIntent,
    ): AvatarDeleteReceipt = withContext(Dispatchers.IO) {
        validateAvatarDeleteIntent(intent)
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = intent.expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val request = Request.Builder()
            .url("$baseUrl/me/avatar")
            .delete(
                JSONObject()
                    .put("expectedAvatarFileId", intent.expectedAvatarFileId)
                    .toString()
                    .toRequestBody(JSON_MEDIA_TYPE),
            )
            .withIdempotencyKey(intent.idempotencyKey)
            .withAuth(pinnedSession)
            .build()
        val response = executeJson(request)
        requireAvatarSessionCurrent(pinnedSession)
        parseAvatarDeleteReceipt(response, intent).also {
            requireAvatarSessionCurrent(pinnedSession)
        }
    }

    suspend fun getMyAvatarCleanupStatus(
        expectedUserId: String,
        expectedWorkspaceId: String,
        expectedAuthSessionEpoch: Long,
    ): AvatarCleanupStatusSnapshot = withContext(Dispatchers.IO) {
        if (
            !expectedUserId.isBoundedCanonicalValue(160) ||
            !expectedWorkspaceId.isBoundedCanonicalValue(160) ||
            expectedAuthSessionEpoch < 0L
        ) {
            invalidAvatarReceipt(
                statusCode = 400,
                code = "AVATAR_CLEANUP_STATUS_INTENT_INVALID",
                message = "Avatar cleanup status requires an exact account, workspace and session",
            )
        }
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val response = getJson("$baseUrl/me/avatar/cleanup", pinnedSession)
        requireAvatarSessionCurrent(pinnedSession)
        parseAvatarCleanupStatus(
            response,
            expectedUserId,
            expectedWorkspaceId,
        ).also {
            requireAvatarSessionCurrent(pinnedSession)
        }
    }

    suspend fun downloadMyAvatarBytes(): ByteArray = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/me/avatar")
            .get()
            .withAuth()
            .build()
        executeBytes(request)
    }

    suspend fun downloadMyAvatarBytes(
        intent: AvatarDownloadIntent,
    ): ByteArray = withContext(Dispatchers.IO) {
        validateAvatarDownloadIntent(intent)
        val pinnedSession = pinAuthSessionAtEpoch(
            expectedEpoch = intent.expectedAuthSessionEpoch,
            requireBearer = true,
        )
        val request = Request.Builder()
            .url("$baseUrl/me/avatar")
            .get()
            .withAuth(pinnedSession)
            .build()
        val bytes = executeBytes(request)
        requireAvatarSessionCurrent(pinnedSession)
        val actualSha256 = MessageDigest.getInstance("SHA-256").digest(bytes).toHex()
        if (actualSha256 != intent.sha256) {
            invalidAvatarReceipt(
                code = "AVATAR_DOWNLOAD_INTEGRITY_MISMATCH",
                message = "Downloaded avatar bytes do not match the confirmed upload receipt",
            )
        }
        bytes
    }

    suspend fun getSettings(): AppSettings = withContext(Dispatchers.IO) {
        parseSettings(getJson("$baseUrl/settings").getJSONObject("settings"))
    }

    suspend fun updateSettings(patch: JSONObject): AppSettings = withContext(Dispatchers.IO) {
        parseSettings(patchJson("$baseUrl/settings", patch).getJSONObject("settings"))
    }

    suspend fun getNotificationInbox(): NotificationInboxSnapshot =
        withContext(Dispatchers.IO) {
            parseNotificationInbox(
                getJson("$baseUrl/notifications/inbox"),
            )
        }

    suspend fun markNotificationInboxRead(
        id: String,
        idempotencyKey: String,
    ): NotificationInboxMutationReceipt = withContext(Dispatchers.IO) {
        parseNotificationInboxMutation(
            postJson(
                "$baseUrl/notifications/inbox/${id.urlEncode()}/read",
                JSONObject(),
                idempotencyKey,
            ),
        )
    }

    suspend fun markAllNotificationInboxRead(
        idempotencyKey: String,
    ): NotificationInboxMutationReceipt = withContext(Dispatchers.IO) {
        parseNotificationInboxMutation(
            postJson(
                "$baseUrl/notifications/inbox/read-all",
                JSONObject(),
                idempotencyKey,
            ),
        )
    }

    suspend fun deleteNotificationInboxItem(
        id: String,
        idempotencyKey: String,
    ): NotificationInboxMutationReceipt = withContext(Dispatchers.IO) {
        parseNotificationInboxMutation(
            deleteJson(
                "$baseUrl/notifications/inbox/${id.urlEncode()}",
                idempotencyKey = idempotencyKey,
            ),
        )
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
        enabled: Boolean = true,
        notificationProtocolVersion: Int = 2,
        appVersion: String = "",
    ): NotificationDeviceRegistrationAck = withContext(Dispatchers.IO) {
        val response = postJson(
            "$baseUrl/notifications/register-device",
            JSONObject()
                .put("fcmToken", fcmToken)
                .put("platform", platform)
                .put("enabled", enabled)
                .put("notificationProtocolVersion", notificationProtocolVersion)
                .put("appVersion", appVersion)
        )
        val device = response.opt("device") as? JSONObject
            ?: invalidNotificationDeviceRegistrationContract()
        parseNotificationDeviceRegistrationAck(device)
    }

    private fun parseNotificationDeviceRegistrationAck(
        device: JSONObject,
    ): NotificationDeviceRegistrationAck {
        fun requiredString(name: String): String {
            val value = device.opt(name)
            if (value !is String || value.isBlank() || value != value.trim()) {
                invalidNotificationDeviceRegistrationContract()
            }
            return value
        }

        fun requiredProtocolVersion(name: String): Int {
            val value = device.opt(name)
            if (value !is Number) invalidNotificationDeviceRegistrationContract()
            val asDouble = value.toDouble()
            val asLong = value.toLong()
            if (
                !asDouble.isFinite() ||
                asDouble != asLong.toDouble() ||
                asLong !in 1..Int.MAX_VALUE.toLong()
            ) {
                invalidNotificationDeviceRegistrationContract()
            }
            return asLong.toInt()
        }

        val workspaceId = when {
            device.has("workspaceId") -> requiredString("workspaceId")
            device.has("organizationId") -> requiredString("organizationId")
            else -> invalidNotificationDeviceRegistrationContract()
        }
        if (
            device.has("workspaceId") &&
            device.has("organizationId") &&
            requiredString("organizationId") != workspaceId
        ) {
            invalidNotificationDeviceRegistrationContract()
        }

        val protocolVersion = when {
            device.has("notificationProtocolVersion") ->
                requiredProtocolVersion("notificationProtocolVersion")
            device.has("protocolVersion") -> requiredProtocolVersion("protocolVersion")
            else -> invalidNotificationDeviceRegistrationContract()
        }
        if (
            device.has("notificationProtocolVersion") &&
            device.has("protocolVersion") &&
            requiredProtocolVersion("protocolVersion") != protocolVersion
        ) {
            invalidNotificationDeviceRegistrationContract()
        }

        val enabled = device.opt("enabled")
        if (enabled !is Boolean) invalidNotificationDeviceRegistrationContract()

        return NotificationDeviceRegistrationAck(
            id = requiredString("id"),
            userId = requiredString("userId"),
            workspaceId = workspaceId,
            fcmToken = requiredString("fcmToken"),
            authSessionId = requiredString("authSessionId"),
            notificationProtocolVersion = protocolVersion,
            appVersion = requiredString("appVersion"),
            enabled = enabled,
        )
    }

    private fun invalidNotificationDeviceRegistrationContract(): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = "NOTIFICATION_DEVICE_REGISTRATION_RESPONSE_INVALID",
            message = "Backend returned an invalid notification-device registration receipt",
        )
    }

    suspend fun unregisterNotificationDevice(fcmToken: String): Boolean {
        val token = currentAuthToken() ?: return false
        val authority = currentAuthSessionAuthorityFor(token) ?: return false
        return unregisterNotificationDevice(fcmToken, authority)
    }

    suspend fun unregisterNotificationDevice(
        fcmToken: String,
        expectedAuthority: AuthSessionAuthority,
    ): Boolean = withContext(Dispatchers.IO) {
        val response = postJson(
            "$baseUrl/notifications/unregister-device",
            JSONObject().put("fcmToken", fcmToken),
            pinnedSession = pinCapturedAuthSession(expectedAuthority),
        )
        response.opt("unregistered") as? Boolean ?: false
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

    suspend fun getDevice(id: String): SmartDevice = withContext(Dispatchers.IO) {
        parseSmartDevice(getJson("$baseUrl/devices/${id.urlEncode()}").getJSONObject("device"))
    }

    suspend fun openDeviceWifiSetup(id: String): DeviceWifiSetupSession = withContext(Dispatchers.IO) {
        val json = postJson(
            "$baseUrl/devices/${id.urlEncode()}/setup-session",
            JSONObject().put("supportedTransports", JSONArray().put(ESPTouchV2Transport)),
        )
        val setup = json.getJSONObject("setup")
        val smartConfig = setup.optJSONObject("smartConfig")
            ?: invalidDeviceWifiSetupContract()
        val protocolVersion = setup.optInt("protocolVersion", -1)
        val transport = setup.optString("transport").trim()
        val security = smartConfig.optString("security").trim()
        if (
            protocolVersion != ESPTouchV2ProtocolVersion ||
            transport != ESPTouchV2Transport ||
            security != ESPTouchV2Security
        ) {
            invalidDeviceWifiSetupContract()
        }
        val provisioningKey = decodeSetupMaterial(
            smartConfig.optString("provisioningKey"),
            ESPTouchV2KeyBytes,
        )
        val reservedData = decodeSetupMaterial(
            smartConfig.optString("reservedData"),
            ESPTouchV2ReservedDataBytes,
        )
        try {
            DeviceWifiSetupSession(
                device = parseSmartDevice(json.getJSONObject("device")),
                transport = transport,
                security = security,
                provisioningKey = provisioningKey,
                reservedData = reservedData,
                expiresAt = Instant.parse(setup.getString("expiresAt")),
            )
        } catch (error: Throwable) {
            provisioningKey.fill(0)
            reservedData.fill(0)
            throw error
        }
    }

    suspend fun scanDevices(): List<SmartDevice> = withContext(Dispatchers.IO) {
        getJson("$baseUrl/devices/scan")
            .optJSONArray("devices")
            .orEmpty()
            .map(::parseSmartDevice)
    }

    suspend fun pairDevice(
        deviceId: String,
        claimCode: String,
        connectionMethod: String,
        organizationId: String,
        idempotencyKey: String,
    ): DevicePairingResponse = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("deviceId", deviceId)
            .put("claimCode", claimCode)
            .put("connectionMethod", connectionMethod)
            .put("organizationId", organizationId)
        parseDevicePairingResponse(
            json = postJson("$baseUrl/devices/pair", body, idempotencyKey),
            expectedDeviceId = deviceId,
            expectedWorkspaceId = organizationId,
        )
    }

    suspend fun connectDevice(id: String): SmartDevice = withContext(Dispatchers.IO) {
        parseSmartDevice(postJson("$baseUrl/devices/${id.urlEncode()}/connect", JSONObject()).getJSONObject("device"))
    }

    suspend fun releaseDevice(
        id: String,
        idempotencyKey: String,
    ): DeviceReleaseReceipt = withContext(Dispatchers.IO) {
        require(id.isNotBlank()) { "Device id is required" }
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required" }
        val json = postJson(
            "$baseUrl/devices/${id.urlEncode()}/release",
            JSONObject(),
            idempotencyKey,
        )
        val release = json.optJSONObject("release")
            ?: throw SmartHealthApiException(
                statusCode = 502,
                code = "DEVICE_RELEASE_CONTRACT_INVALID",
                message = "Backend returned an invalid device release receipt",
            )
        val receipt = DeviceReleaseReceipt(
            deviceId = release.optString("deviceId").trim(),
            released = release.optBoolean("released", false),
            historyRetained = release.optBoolean("historyRetained", false),
            replayed = json.optBoolean("replayed", false),
        )
        if (receipt.deviceId != id || !receipt.released || !receipt.historyRetained) {
            throw SmartHealthApiException(
                statusCode = 502,
                code = "DEVICE_RELEASE_CONTRACT_INVALID",
                message = "Backend did not confirm the canonical device release",
            )
        }
        receipt
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
        endDate: String = "",
        idempotencyKey: String = java.util.UUID.randomUUID().toString(),
    ): ExportJob = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("format", format)
            .put("dataset", "clinical_bundle")
            .put("includeAudio", includeAudio)
            .put("includeReports", includeReports)
            .put("includeHistory", includeHistory)
        if (startDate.isNotBlank() || endDate.isNotBlank()) {
            body.put(
                "filters",
                JSONObject()
                    .put("startDate", startDate)
                    .put("endDate", endDate),
            )
        }
        parseExportJob(
            postJson(
                "$baseUrl/exports",
                body,
                idempotencyKey = idempotencyKey,
            ).getJSONObject("export"),
        )
    }

    suspend fun downloadExport(
        exportJob: ExportJob,
        destination: File,
        onProgress: (ExportDownloadProgress) -> Unit = {},
    ): ExportDownloadResult = withContext(Dispatchers.IO) {
        val apiUrl = runCatching { baseUrl.toHttpUrl() }
            .getOrElse { throw IOException("Backend URL is invalid") }
        val resolvedUrl = apiUrl.resolve(exportJob.downloadUrl)
            ?: throw IOException("Export download URL is invalid")
        if (
            resolvedUrl.scheme != apiUrl.scheme ||
            resolvedUrl.host != apiUrl.host ||
            resolvedUrl.port != apiUrl.port
        ) {
            throw IOException("Export downloads must remain on the authenticated backend origin")
        }
        val request = Request.Builder()
            .url(resolvedUrl)
            .get()
            .withAuth()
            .build()
        val requestEpoch = request
            .tag(SmartHealthAuthorizationRequestContext::class.java)
            ?.authSessionEpoch
            ?: -1L
        val parent = destination.parentFile
            ?: throw IOException("Export destination must have a parent directory")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Cannot create the export destination directory")
        }
        val partFile = File(parent, "${destination.name}.part")
        partFile.delete()
        destination.delete()
        try {
            executeCancellable(request) { response ->
                if (!response.isSuccessful) {
                    val text = response.body?.string().orEmpty()
                    val exception = parseApiException(response.code, text)
                    SmartHealthAuthorizationEvents.publishIfTerminal(
                        exception = exception,
                        authSessionEpoch = requestEpoch,
                    )
                    throw exception
                }
                val finalUrl = response.request.url
                if (
                    finalUrl.scheme != apiUrl.scheme ||
                    finalUrl.host != apiUrl.host ||
                    finalUrl.port != apiUrl.port
                ) {
                    throw IOException("Export download redirected outside the authenticated backend")
                }
                val expectedContentType = exportContentType(exportJob.format)
                val body = response.body ?: throw IOException("Export response body is empty")
                val declaredLength = body.contentLength().takeIf { it >= 0L }
                if (declaredLength != null && declaredLength > MAX_EXPORT_DOWNLOAD_BYTES) {
                    throw IOException("Export artifact exceeds the download limit")
                }
                val responseContentType = body.contentType()
                    ?.toString()
                    ?.substringBefore(';')
                    ?.lowercase()
                    .orEmpty()
                if (responseContentType != expectedContentType) {
                    throw IOException("Export response type does not match the requested format")
                }
                val headerSha256 = response
                    .header("X-Shcare-Artifact-SHA256")
                    .orEmpty()
                    .lowercase()
                val expectedSha256 = exportJob.artifactSha256.lowercase()
                if (
                    !headerSha256.matches(SHA256_HEX_REGEX) ||
                    !expectedSha256.matches(SHA256_HEX_REGEX) ||
                    headerSha256 != expectedSha256
                ) {
                    throw IOException("Export artifact identity does not match the backend job")
                }
                val rendererVersion = response
                    .header("X-Shcare-Renderer-Version")
                    .orEmpty()
                if (
                    exportJob.rendererVersion.isBlank() ||
                    rendererVersion != exportJob.rendererVersion
                ) {
                    throw IOException("Export renderer identity does not match the backend job")
                }
                val digest = MessageDigest.getInstance("SHA-256")
                var downloaded = 0L
                onProgress(ExportDownloadProgress(0L, declaredLength))
                body.byteStream().use { input ->
                    FileOutputStream(partFile).use { output ->
                        val buffer = ByteArray(DEFAULT_DOWNLOAD_BUFFER_BYTES)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            if (count == 0) continue
                            downloaded += count
                            if (downloaded > MAX_EXPORT_DOWNLOAD_BYTES) {
                                throw IOException("Export artifact exceeds the download limit")
                            }
                            digest.update(buffer, 0, count)
                            output.write(buffer, 0, count)
                            onProgress(
                                ExportDownloadProgress(
                                    bytesDownloaded = downloaded,
                                    totalBytes = declaredLength,
                                ),
                            )
                        }
                        output.fd.sync()
                    }
                }
                if (downloaded <= 0L) {
                    throw IOException("Export response body is empty")
                }
                if (declaredLength != null && downloaded != declaredLength) {
                    throw IOException("Export response ended before the declared length")
                }
                if (exportJob.artifactByteSize != null && exportJob.artifactByteSize != downloaded) {
                    throw IOException("Export artifact size does not match the backend job")
                }
                val calculatedSha256 = digest.digest().toHex()
                if (calculatedSha256 != expectedSha256) {
                    throw IOException("Export artifact failed its integrity check")
                }
                if (currentAuthSessionEpoch() != requestEpoch) {
                    throw SmartHealthApiException(
                        statusCode = 401,
                        code = "AUTH_SESSION_CHANGED",
                        message = "Phiên đăng nhập đã thay đổi trước khi hoàn tất bản xuất",
                    )
                }
                moveDownloadedFile(partFile, destination)
                ExportDownloadResult(
                    file = destination,
                    byteCount = downloaded,
                    contentType = responseContentType,
                    fileName = sanitizeExportFileName(
                        response.header("Content-Disposition").orEmpty(),
                        exportJob,
                    ),
                    artifactSha256 = calculatedSha256,
                    rendererVersion = rendererVersion,
                )
            }
        } catch (error: Throwable) {
            partFile.delete()
            destination.delete()
            throw error
        }
    }

    suspend fun getDataSummary(): StorageSummary = withContext(Dispatchers.IO) {
        parseStorageSummary(getJson("$baseUrl/data/summary").getJSONObject("storage"))
    }

    suspend fun getStatus(expectedWorkspaceId: String): BackendStatus = withContext(Dispatchers.IO) {
        val workspaceId = expectedWorkspaceId.trim()
        require(workspaceId.isNotBlank()) {
            "Clinical dashboard status requires the active workspace id."
        }
        val json = getJson("$baseUrl/doctor/status")
        parseClinicalDashboardStatus(json, workspaceId)
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

    suspend fun listClinicalPatients(query: String = ""): ClinicalPatientList =
        withContext(Dispatchers.IO) {
            val url = "$baseUrl/patients".toHttpUrl()
                .newBuilder()
                .apply {
                    query.trim().takeIf(String::isNotEmpty)?.let {
                        addQueryParameter("q", it)
                    }
                }
                .build()
            parseClinicalPatientList(getJson(url.toString()))
        }

    suspend fun listClinicalAlerts(
        status: ClinicalAlertStatus? = null,
        limit: Int = 50,
    ): ClinicalAlertList = withContext(Dispatchers.IO) {
        require(limit in 1..200) { "Clinical alert limit must be between 1 and 200" }
        val url = "$baseUrl/portal/alerts".toHttpUrl()
            .newBuilder()
            .apply {
                status?.let { addQueryParameter("status", it.wireValue) }
                addQueryParameter("limit", limit.toString())
            }
            .build()
        parseClinicalAlertList(getJson(url.toString()))
    }

    suspend fun listClinicalReviews(
        status: ClinicalReviewStatus? = null,
        limit: Int = 50,
    ): ClinicalReviewList = withContext(Dispatchers.IO) {
        require(limit in 1..200) { "Clinical review limit must be between 1 and 200" }
        val url = "$baseUrl/portal/review-queue".toHttpUrl()
            .newBuilder()
            .apply {
                status?.let { addQueryParameter("status", it.wireValue) }
                addQueryParameter("limit", limit.toString())
            }
            .build()
        parseClinicalReviewList(getJson(url.toString()))
    }

    suspend fun decideClinicalReview(
        scanId: String,
        decision: ClinicalReviewDecision,
        note: String,
        expectedVersion: Int,
        idempotencyKey: String,
    ): ClinicalReviewMutation = withContext(Dispatchers.IO) {
        require(scanId.isNotBlank()) { "Clinical review scan id is required" }
        require(expectedVersion >= 1) { "Clinical review version must be positive" }
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required" }
        val trimmedNote = note.trim()
        require(decision == ClinicalReviewDecision.Accepted || trimmedNote.isNotBlank()) {
            "A review note is required for an actionable decision"
        }
        val body = JSONObject()
            .put("decision", decision.wireValue)
            .put("note", trimmedNote)
            .put("expectedVersion", expectedVersion)
        parseClinicalReviewMutation(
            postJson(
                "$baseUrl/portal/review-queue/${scanId.urlEncode()}/decision",
                body,
                idempotencyKey,
            ),
        )
    }

    suspend fun acknowledgeClinicalAlert(
        alertId: String,
        note: String,
        expectedVersion: Int,
        idempotencyKey: String,
    ): ClinicalAlertMutation = transitionClinicalAlert(
        alertId = alertId,
        action = "acknowledge",
        note = note,
        expectedVersion = expectedVersion,
        idempotencyKey = idempotencyKey,
    )

    suspend fun resolveClinicalAlert(
        alertId: String,
        note: String,
        expectedVersion: Int,
        idempotencyKey: String,
    ): ClinicalAlertMutation {
        require(note.isNotBlank()) { "A resolution note is required" }
        return transitionClinicalAlert(
            alertId = alertId,
            action = "resolve",
            note = note,
            expectedVersion = expectedVersion,
            idempotencyKey = idempotencyKey,
        )
    }

    private suspend fun transitionClinicalAlert(
        alertId: String,
        action: String,
        note: String,
        expectedVersion: Int,
        idempotencyKey: String,
    ): ClinicalAlertMutation = withContext(Dispatchers.IO) {
        require(alertId.isNotBlank()) { "Clinical alert id is required" }
        require(action == "acknowledge" || action == "resolve") {
            "Clinical alert action is invalid"
        }
        require(expectedVersion >= 1) { "Clinical alert version must be positive" }
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required" }
        val body = JSONObject()
            .put("note", note.trim())
            .put("expectedVersion", expectedVersion)
        parseClinicalAlertMutation(
            postJson(
                "$baseUrl/portal/alerts/${alertId.urlEncode()}/$action",
                body,
                idempotencyKey,
            ),
        )
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

    suspend fun createPatientWithReceipt(
        patientCode: String,
        name: String,
        dateOfBirth: String,
        gender: String,
        phone: String,
        notes: String,
        bloodType: String,
        allergies: List<String>,
        emergencyContact: EmergencyContact,
        profileType: String,
        relationship: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        expectedAuthSessionId: String,
        expectedAuthSessionEpoch: Long,
    ): PatientMutationReceipt = withContext(Dispatchers.IO) {
        requireCanonicalPatientMutationInputs(
            idempotencyKey = idempotencyKey,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
            expectedAuthSessionId = expectedAuthSessionId,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        val authority = PatientMutationAuthorityHeaders(
            expectedUserId = expectedUserId.trim(),
            expectedWorkspaceId = expectedWorkspaceId.trim(),
            expectedAuthSessionId = expectedAuthSessionId.trim(),
        )
        val pinnedSession = pinPatientMutationSession(authority, expectedAuthSessionEpoch)
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
        val json = postJson(
            url = "$baseUrl/patients",
            json = body,
            idempotencyKey = idempotencyKey,
            pinnedSession = pinnedSession,
            patientMutationAuthority = authority,
        )
        requirePatientMutationSessionCurrent(pinnedSession)
        val receipt = parsePatientMutationReceipt(
            json = json,
            expectedIntent = PatientMutationIntent.Create,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
        )
        requirePatientMutationSessionCurrent(pinnedSession)
        receipt
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

    suspend fun updatePatientWithReceipt(
        patientId: String,
        name: String?,
        dateOfBirth: String?,
        gender: String?,
        phone: String?,
        notes: String?,
        bloodType: String?,
        allergies: List<String>?,
        emergencyContact: EmergencyContact?,
        relationship: String?,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        expectedAuthSessionId: String,
        expectedAuthSessionEpoch: Long,
    ): PatientMutationReceipt = withContext(Dispatchers.IO) {
        require(patientId.isNotBlank()) { "Patient id is required" }
        requireCanonicalPatientMutationInputs(
            idempotencyKey = idempotencyKey,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
            expectedAuthSessionId = expectedAuthSessionId,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        val authority = PatientMutationAuthorityHeaders(
            expectedUserId = expectedUserId.trim(),
            expectedWorkspaceId = expectedWorkspaceId.trim(),
            expectedAuthSessionId = expectedAuthSessionId.trim(),
        )
        val pinnedSession = pinPatientMutationSession(authority, expectedAuthSessionEpoch)
        val body = JSONObject()
        if (name != null) body.put("name", name)
        if (dateOfBirth != null) body.put("dateOfBirth", dateOfBirth)
        if (gender != null) body.put("gender", gender)
        if (phone != null) body.put("phone", phone)
        if (notes != null) body.put("notes", notes)
        if (bloodType != null) body.put("bloodType", bloodType)
        if (allergies != null) body.put("allergies", JSONArray(allergies))
        if (emergencyContact != null) body.put("emergencyContact", emergencyContact.toJson())
        if (relationship != null) body.put("relationship", relationship)
        val json = patchJson(
                "$baseUrl/patients/${patientId.urlEncode()}",
                body,
                idempotencyKey,
                pinnedSession = pinnedSession,
                patientMutationAuthority = authority,
            )
        requirePatientMutationSessionCurrent(pinnedSession)
        val receipt = parsePatientMutationReceipt(
            json = json,
            expectedIntent = PatientMutationIntent.Update,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
            expectedPatientId = patientId,
        )
        requirePatientMutationSessionCurrent(pinnedSession)
        receipt
    }

    suspend fun deletePatient(
        patientId: String,
        idempotencyKey: String = java.util.UUID.randomUUID().toString(),
    ): Boolean = withContext(Dispatchers.IO) {
        deleteJson("$baseUrl/patients/${patientId.urlEncode()}", idempotencyKey = idempotencyKey)
        true
    }

    suspend fun deletePatientWithReceipt(
        patientId: String,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        expectedAuthSessionId: String,
        expectedAuthSessionEpoch: Long,
    ): PatientMutationReceipt = withContext(Dispatchers.IO) {
        require(patientId.isNotBlank()) { "Patient id is required" }
        requireCanonicalPatientMutationInputs(
            idempotencyKey = idempotencyKey,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
            expectedAuthSessionId = expectedAuthSessionId,
            expectedAuthSessionEpoch = expectedAuthSessionEpoch,
        )
        val authority = PatientMutationAuthorityHeaders(
            expectedUserId = expectedUserId.trim(),
            expectedWorkspaceId = expectedWorkspaceId.trim(),
            expectedAuthSessionId = expectedAuthSessionId.trim(),
        )
        val pinnedSession = pinPatientMutationSession(authority, expectedAuthSessionEpoch)
        val json = deleteJson(
                "$baseUrl/patients/${patientId.urlEncode()}",
                idempotencyKey = idempotencyKey,
                pinnedSession = pinnedSession,
                patientMutationAuthority = authority,
            )
        requirePatientMutationSessionCurrent(pinnedSession)
        val receipt = parsePatientMutationReceipt(
            json = json,
            expectedIntent = PatientMutationIntent.Delete,
            expectedUserId = expectedUserId,
            expectedWorkspaceId = expectedWorkspaceId,
            expectedPatientId = patientId,
        )
        requirePatientMutationSessionCurrent(pinnedSession)
        receipt
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

    suspend fun getScanWaveform(scanId: String): ScanWaveform = withContext(Dispatchers.IO) {
        parseScanWaveform(
            json = getJson("$baseUrl/scans/${scanId.urlEncode()}/waveform")
                .getJSONObject("waveform"),
            expectedScanId = scanId,
        )
    }

    suspend fun getScanAudioAccess(scanId: String): ScanAudioAccess = withContext(Dispatchers.IO) {
        parseScanAudioAccess(
            getJson("$baseUrl/scans/${scanId.urlEncode()}/audio-url"),
        )
    }

    suspend fun getScanAudioPlaybackSource(scanId: String): ScanAudioPlaybackSource =
        withContext(Dispatchers.IO) {
            resolveScanAudioPlaybackSource(getScanAudioAccess(scanId))
        }

    suspend fun downloadScanAudio(
        scanId: String,
        destination: File,
        onProgress: (ScanAudioDownloadProgress) -> Unit = {},
    ): ScanAudioDownloadResult = withContext(Dispatchers.IO) {
        val source = getScanAudioPlaybackSource(scanId)
        val requestBuilder = Request.Builder()
            .url(source.url)
            .get()
        if (source.authorizationEpoch != null) {
            if (currentAuthSessionEpoch() != source.authorizationEpoch) {
                throw SmartHealthApiException(
                    statusCode = 401,
                    code = "AUTH_SESSION_CHANGED",
                    message = "Phiên đăng nhập đã thay đổi trước khi tải âm thanh",
                )
            }
            requestBuilder.withAuth()
        }
        val request = requestBuilder.build()
        val parent = destination.parentFile
            ?: throw IOException("Audio destination must have a parent directory")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Cannot create the audio destination directory")
        }
        val partFile = File(parent, "${destination.name}.part")
        partFile.delete()
        destination.delete()
        try {
            val result = executeCancellable(request) { response ->
                if (!response.isSuccessful) {
                    val text = response.body?.string().orEmpty()
                    val exception = parseApiException(response.code, text)
                    SmartHealthAuthorizationEvents.publishIfTerminal(
                        exception = exception,
                        authSessionEpoch = request
                            .tag(SmartHealthAuthorizationRequestContext::class.java)
                            ?.authSessionEpoch
                            ?: -1L,
                    )
                    throw exception
                }
                val finalUrl = response.request.url
                val apiUrl = baseUrl.toHttpUrl()
                val finalIsSameOrigin = finalUrl.scheme == apiUrl.scheme &&
                    finalUrl.host == apiUrl.host &&
                    finalUrl.port == apiUrl.port
                if (!finalIsSameOrigin && finalUrl.scheme != "https") {
                    throw IOException("Cross-origin audio redirect requires HTTPS")
                }
                val body = response.body ?: throw IOException("Audio response body is empty")
                val declaredLength = body.contentLength().takeIf { it >= 0L }
                if (declaredLength != null && declaredLength > MAX_SCAN_AUDIO_DOWNLOAD_BYTES) {
                    throw IOException("Audio file exceeds the download limit")
                }
                val responseContentType = body.contentType()?.toString()
                    ?.substringBefore(';')
                    ?.lowercase()
                    .orEmpty()
                val effectiveContentType = responseContentType.ifBlank {
                    source.contentType.lowercase()
                }
                if (effectiveContentType !in ALLOWED_SCAN_AUDIO_CONTENT_TYPES) {
                    throw IOException("Unsupported audio response type")
                }
                var downloaded = 0L
                onProgress(ScanAudioDownloadProgress(0L, declaredLength))
                body.byteStream().use { input ->
                    FileOutputStream(partFile).use { output ->
                        val buffer = ByteArray(DEFAULT_DOWNLOAD_BUFFER_BYTES)
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            if (count == 0) continue
                            downloaded += count
                            if (downloaded > MAX_SCAN_AUDIO_DOWNLOAD_BYTES) {
                                throw IOException("Audio file exceeds the download limit")
                            }
                            output.write(buffer, 0, count)
                            onProgress(
                                ScanAudioDownloadProgress(
                                    bytesDownloaded = downloaded,
                                    totalBytes = declaredLength,
                                ),
                            )
                        }
                        output.fd.sync()
                    }
                }
                if (downloaded <= 0L) {
                    throw IOException("Audio response body is empty")
                }
                if (declaredLength != null && downloaded != declaredLength) {
                    throw IOException("Audio response ended before the declared length")
                }
                moveDownloadedFile(partFile, destination)
                ScanAudioDownloadResult(
                    file = destination,
                    byteCount = downloaded,
                    contentType = effectiveContentType,
                    fileName = source.fileName,
                )
            }
            result
        } catch (error: Throwable) {
            partFile.delete()
            destination.delete()
            throw error
        }
    }

    suspend fun startScan(
        request: StartScanRequest,
        idempotencyKey: String,
    ): Scan = withContext(Dispatchers.IO) {
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required to start a scan" }
        val body = JSONObject()
            .put("mode", request.mode)
            .put("bodySite", request.bodySite)
            .put("deviceId", request.deviceId)
            .put("doctorNotes", request.doctorNotes)

        if (!request.patientId.isNullOrBlank()) body.put("patientId", request.patientId)
        if (!request.patientName.isNullOrBlank()) body.put("patientName", request.patientName)
        if (!request.patientCode.isNullOrBlank()) body.put("patientCode", request.patientCode)

        parseScan(postJson("$baseUrl/scans/start", body, idempotencyKey).getJSONObject("scan"))
    }

    suspend fun stopScan(scanId: String, idempotencyKey: String): Scan = withContext(Dispatchers.IO) {
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required to stop a scan" }
        parseScan(
            postJson(
                "$baseUrl/scans/${scanId.urlEncode()}/stop",
                JSONObject(),
                idempotencyKey,
            ).getJSONObject("scan"),
        )
    }

    suspend fun stopActiveScan(idempotencyKey: String): Scan = withContext(Dispatchers.IO) {
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required to stop the active scan" }
        parseScan(
            postJson(
                "$baseUrl/scans/active/stop",
                JSONObject(),
                idempotencyKey,
            ).getJSONObject("scan"),
        )
    }

    suspend fun updateScan(scanId: String, doctorNotes: String): Scan = withContext(Dispatchers.IO) {
        val body = JSONObject().put("doctorNotes", doctorNotes)
        parseScan(patchJson("$baseUrl/scans/${scanId.urlEncode()}", body).getJSONObject("scan"))
    }

    private suspend fun getJson(url: String): JSONObject {
        val request = Request.Builder().url(url).get().withAuth().build()
        return executeJson(request)
    }

    private suspend fun getJson(
        url: String,
        pinnedSession: PinnedAuthSession,
    ): JSONObject {
        val request = Request.Builder()
            .url(url)
            .get()
            .withAuth(pinnedSession)
            .build()
        return executeJson(request)
    }

    private suspend fun postJson(
        url: String,
        json: JSONObject,
        idempotencyKey: String? = null,
        terminalAuthorizationEventExemptCodes: Set<String> = emptySet(),
        pinnedSession: PinnedAuthSession? = null,
        patientMutationAuthority: PatientMutationAuthorityHeaders? = null,
    ): JSONObject {
        val requestBuilder = Request.Builder()
            .url(url)
            .post(json.toString().toRequestBody(JSON_MEDIA_TYPE))
            .withIdempotencyKey(idempotencyKey)
            .withPatientMutationAuthority(patientMutationAuthority)
        if (pinnedSession == null) {
            requestBuilder.withAuth()
        } else {
            requestBuilder.withAuth(pinnedSession)
        }
        val request = requestBuilder.build()
        return executeJson(
            request = request,
            terminalAuthorizationEventExemptCodes = terminalAuthorizationEventExemptCodes,
        )
    }

    private suspend fun patchJson(
        url: String,
        json: JSONObject,
        idempotencyKey: String? = null,
        pinnedSession: PinnedAuthSession? = null,
        patientMutationAuthority: PatientMutationAuthorityHeaders? = null,
    ): JSONObject {
        val requestBuilder = Request.Builder()
            .url(url)
            .patch(json.toString().toRequestBody(JSON_MEDIA_TYPE))
            .withIdempotencyKey(idempotencyKey)
            .withPatientMutationAuthority(patientMutationAuthority)
        if (pinnedSession == null) {
            requestBuilder.withAuth()
        } else {
            requestBuilder.withAuth(pinnedSession)
        }
        val request = requestBuilder.build()
        return executeJson(request)
    }

    private suspend fun deleteJson(
        url: String,
        json: JSONObject? = null,
        idempotencyKey: String? = null,
        pinnedSession: PinnedAuthSession? = null,
        patientMutationAuthority: PatientMutationAuthorityHeaders? = null,
    ): JSONObject {
        val requestBuilder = Request.Builder()
            .url(url)
            .withIdempotencyKey(idempotencyKey)
            .withPatientMutationAuthority(patientMutationAuthority)
        if (pinnedSession == null) {
            requestBuilder.withAuth()
        } else {
            requestBuilder.withAuth(pinnedSession)
        }
        val request = if (json == null) {
            requestBuilder.delete().build()
        } else {
            requestBuilder.delete(json.toString().toRequestBody(JSON_MEDIA_TYPE)).build()
        }
        return executeJson(request)
    }

    private fun Request.Builder.withAuth(): Request.Builder {
        val session = authSessionSnapshot
        tag(
            SmartHealthAuthorizationRequestContext::class.java,
            SmartHealthAuthorizationRequestContext(session.epoch),
        )
        if (!session.bearerToken.isNullOrBlank()) {
            header("Authorization", "Bearer ${session.bearerToken}")
        }
        val secondFactor = twoFactorToken
        if (!secondFactor.isNullOrBlank()) {
            header("X-Shcare-2FA-Token", secondFactor)
        }
        return this
    }

    private fun Request.Builder.withAuth(
        pinnedSession: PinnedAuthSession,
    ): Request.Builder {
        val session = pinnedSession.session
        tag(
            SmartHealthAuthorizationRequestContext::class.java,
            SmartHealthAuthorizationRequestContext(session.epoch),
        )
        if (!session.bearerToken.isNullOrBlank()) {
            header("Authorization", "Bearer ${session.bearerToken}")
        }
        if (!pinnedSession.twoFactorToken.isNullOrBlank()) {
            header("X-Shcare-2FA-Token", pinnedSession.twoFactorToken)
        }
        return this
    }

    private fun nextEpoch(current: Long): Long =
        if (current == Long.MAX_VALUE) 0L else current + 1L

    @Synchronized
    private fun requireCurrentAuthSessionAuthority(
        expectedAuthority: AuthSessionAuthority,
    ) {
        val current = authSessionSnapshot
        if (
            current.bearerToken != expectedAuthority.bearerToken ||
            current.epoch != expectedAuthority.epoch
        ) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Authentication session changed while the request was running",
            )
        }
    }

    @Synchronized
    private fun bindAuthSession(
        expectedAuthority: AuthSessionAuthority,
        authSessionId: String,
    ) {
        val normalizedSessionId = authSessionId.trim().takeIf(String::isNotEmpty) ?: return
        val current = authSessionSnapshot
        if (
            current.bearerToken != expectedAuthority.bearerToken ||
            current.epoch != expectedAuthority.epoch
        ) {
            return
        }
        authSessionSnapshot = current.copy(authSessionId = normalizedSessionId)
    }

    private fun Request.Builder.withIdempotencyKey(idempotencyKey: String?): Request.Builder {
        if (!idempotencyKey.isNullOrBlank()) {
            header("Idempotency-Key", idempotencyKey)
        }
        return this
    }

    private fun Request.Builder.withPatientMutationAuthority(
        authority: PatientMutationAuthorityHeaders?,
    ): Request.Builder {
        if (authority == null) return this
        header("X-Shcare-Expected-User-Id", authority.expectedUserId)
        header("X-Shcare-Expected-Workspace-Id", authority.expectedWorkspaceId)
        header("X-Shcare-Expected-Auth-Session-Id", authority.expectedAuthSessionId)
        return this
    }

    private fun parsePasswordChangeReceipt(
        json: JSONObject,
        expectedUserId: String,
    ): PasswordChangeReceipt {
        val allowedKeys = setOf(
            "ok",
            "provider",
            "operationId",
            "replayed",
            "user",
        )
        val actualKeys = json.keys().asSequence().toSet()
        val rawConfirmed = json.opt("ok")
        val rawProvider = json.opt("provider")
        val rawOperationId = json.opt("operationId")
        val rawReplayed = json.opt("replayed")
        val rawUser = json.opt("user")
        if (
            actualKeys != allowedKeys ||
            rawConfirmed !is Boolean ||
            rawConfirmed != true ||
            rawProvider !is String ||
            rawProvider !in setOf("firebase", "demo") ||
            rawOperationId !is String ||
            rawOperationId.length !in 1..160 ||
            rawOperationId != rawOperationId.trim() ||
            rawReplayed !is Boolean ||
            rawUser !is JSONObject ||
            rawUser.keys().asSequence().toSet() != setOf("id")
        ) {
            throw SmartHealthApiException(
                statusCode = 502,
                code = "PASSWORD_CHANGE_RESPONSE_INVALID",
                message = "Backend returned an invalid password-change receipt",
            )
        }
        val rawUserId = rawUser.opt("id")
        if (
            rawUserId !is String ||
            rawUserId.length !in 1..120 ||
            rawUserId != expectedUserId
        ) {
            throw SmartHealthApiException(
                statusCode = 502,
                code = "PASSWORD_CHANGE_RESPONSE_OWNER_MISMATCH",
                message = "Backend returned a password-change receipt for another account",
            )
        }
        return PasswordChangeReceipt(
            confirmed = true,
            userId = rawUserId,
            provider = rawProvider,
            operationId = rawOperationId,
            replayed = rawReplayed,
        )
    }

    private fun parseRoleRequestReceipt(
        json: JSONObject,
        expectedRequestedRole: String,
        expectedOrganizationId: String,
        expectedCurrentWorkspaceId: String,
        expectedAccountType: String,
        expectedWorkspaceType: String,
    ): AuthUser {
        val normalizedExpectedRole = expectedRequestedRole.trim()
        val normalizedExpectedOrganizationId = expectedOrganizationId.trim()
        val normalizedExpectedCurrentWorkspaceId = expectedCurrentWorkspaceId.trim()
        val normalizedExpectedAccountType = expectedAccountType.trim()
        val normalizedExpectedWorkspaceType = expectedWorkspaceType.trim()
        val userJson = json.optJSONObject("user")
        val roleRequest = json.optJSONObject("roleRequest")
        val operationId = json.opt("operationId")
        val replayed = json.opt("replayed")
        if (
            normalizedExpectedRole !in setOf("doctor", "patient") ||
            normalizedExpectedAccountType.isBlank() ||
            normalizedExpectedWorkspaceType.isBlank() ||
            json.keys().asSequence().toSet() !=
            setOf("user", "roleRequest", "operationId", "replayed") ||
            userJson == null ||
            roleRequest == null ||
            operationId !is String ||
            operationId.length !in 1..160 ||
            operationId != operationId.trim() ||
            replayed !is Boolean ||
            roleRequest.keys().asSequence().toSet() !=
            setOf("requestedRole", "status", "requestedAt")
        ) {
            invalidRoleRequestContract()
        }
        val receiptRole = roleRequest.opt("requestedRole")
        val receiptStatus = roleRequest.opt("status")
        val receiptRequestedAt = roleRequest.opt("requestedAt")
        val rawUserId = userJson.opt("id")
        val rawFirebaseUid = userJson.opt("firebaseUid")
        val rawEmail = userJson.opt("email")
        val rawVerifiedEmail = userJson.opt("verifiedEmail")
        val rawAccountStatus = userJson.opt("accountStatus")
        val rawDeletedAt = userJson.opt("deletedAt")
        val rawRole = userJson.opt("role")
        val rawRequestedRole = userJson.opt("requestedRole")
        val rawRoleRequestStatus = userJson.opt("roleRequestStatus")
        val rawAccountType = userJson.opt("accountType")
        val rawWorkspaceType = userJson.opt("workspaceType")
        val rawOrganizationId = userJson.opt("organizationId")
        val rawRoleRequestOrganizationId = userJson.opt("roleRequestOrganizationId")
        val validStatuses = setOf("pending", "approved")
        if (
            rawUserId !is String ||
            rawUserId.length !in 1..160 ||
            rawUserId != rawUserId.trim() ||
            rawFirebaseUid !is String ||
            rawFirebaseUid.length !in 1..160 ||
            rawFirebaseUid != rawFirebaseUid.trim() ||
            rawEmail !is String ||
            rawEmail.isBlank() ||
            rawVerifiedEmail != true ||
            rawAccountStatus !is String ||
            !rawAccountStatus.equals("active", ignoreCase = true) ||
            !userJson.has("deletedAt") ||
            !(
                rawDeletedAt == JSONObject.NULL ||
                    (rawDeletedAt is String && rawDeletedAt.isBlank())
                ) ||
            rawRole !is String ||
            rawRole.isBlank() ||
            rawRequestedRole !is String ||
            rawRequestedRole != normalizedExpectedRole ||
            rawRoleRequestStatus !is String ||
            rawAccountType !is String ||
            rawAccountType != normalizedExpectedAccountType ||
            rawWorkspaceType !is String ||
            rawWorkspaceType != normalizedExpectedWorkspaceType ||
            rawOrganizationId !is String ||
            rawOrganizationId.isBlank() ||
            rawRoleRequestOrganizationId !is String ||
            rawRoleRequestOrganizationId.isBlank() ||
            (
                normalizedExpectedOrganizationId.isNotBlank() &&
                    rawRoleRequestOrganizationId != normalizedExpectedOrganizationId
                ) ||
            receiptRole !is String ||
            receiptRole != normalizedExpectedRole ||
            receiptStatus !is String ||
            receiptStatus !in validStatuses ||
            rawRoleRequestStatus != receiptStatus ||
            receiptRequestedAt !is String ||
            receiptRequestedAt.isBlank() ||
            receiptRequestedAt != receiptRequestedAt.trim() ||
            runCatching { java.time.Instant.parse(receiptRequestedAt) }.isFailure
        ) {
            invalidRoleRequestContract()
        }
        val user = parseAuthUser(userJson)
        val returnedTargetWorkspaceId = rawRoleRequestOrganizationId
        val currentWorkspaceId = user.canonicalWorkspaceId()
        val currentMembership = user.currentMembership
        val currentMembershipWorkspaceId = currentMembership
            ?.let { membership ->
                membership.workspaceId.ifBlank { membership.organizationId }.trim()
            }
            .orEmpty()
        val currentWorkspaceObjectId = user.currentWorkspace?.id?.trim().orEmpty()
        val normalizedUserRole = user.role.trim().lowercase()
        val normalizedMembershipRole = currentMembership?.role?.trim()?.lowercase().orEmpty()
        val currentMembershipCoherent = currentMembership == null ||
            (
                currentMembership.id.isNotBlank() &&
                    currentMembershipWorkspaceId == currentWorkspaceId &&
                    currentMembership.status.equals("active", ignoreCase = true) &&
                    currentMembership.operational &&
                    currentMembership.suspendedAt.isBlank() &&
                    normalizedMembershipRole == normalizedUserRole
                )
        val currentMembershipIsProjected = user.memberships.isEmpty() ||
            (
                currentMembership != null &&
                    user.memberships.any { membership ->
                        membership.id == currentMembership.id &&
                            membership.workspaceId
                                .ifBlank { membership.organizationId }
                                .trim() == currentWorkspaceId &&
                            membership.status.equals("active", ignoreCase = true) &&
                            membership.operational &&
                            membership.suspendedAt.isBlank()
                    }
                )
        val targetHasPrematureDoctorAuthority = user.memberships.any { membership ->
            membership.workspaceId
                .ifBlank { membership.organizationId }
                .trim() == returnedTargetWorkspaceId &&
                membership.status.equals("active", ignoreCase = true) &&
                membership.operational &&
                membership.suspendedAt.isBlank() &&
                membership.role.trim().lowercase() == "doctor"
        }
        if (
            (
                normalizedExpectedRole == "patient" &&
                    (
                        receiptStatus != "approved" ||
                            rawRole != "patient" ||
                            normalizedUserRole != "patient" ||
                            currentWorkspaceId != returnedTargetWorkspaceId
                        )
                ) ||
            (
                normalizedExpectedRole == "doctor" &&
                    receiptStatus == "approved" &&
                    (rawRole != "doctor" ||
                        normalizedUserRole != "doctor" ||
                        currentWorkspaceId != returnedTargetWorkspaceId)
                ) ||
            (
                normalizedExpectedRole == "doctor" &&
                    receiptStatus != "approved" &&
                    (
                        rawRole != "patient" ||
                            normalizedUserRole != "patient" ||
                            targetHasPrematureDoctorAuthority ||
                            (
                                normalizedExpectedCurrentWorkspaceId.isNotBlank() &&
                                    currentWorkspaceId != normalizedExpectedCurrentWorkspaceId
                                )
                        )
                ) ||
            user.accountType != normalizedExpectedAccountType ||
            user.workspaceType != normalizedExpectedWorkspaceType ||
            user.roleRequestOrganizationId.trim() != returnedTargetWorkspaceId ||
            (
                receiptStatus != "approved" &&
                    user.organizationId.trim() != currentWorkspaceId
                ) ||
            (
                receiptStatus == "approved" &&
                    user.organizationId.trim() != returnedTargetWorkspaceId
                ) ||
            currentWorkspaceId.isBlank() ||
            (
                user.currentWorkspaceId.isNotBlank() &&
                    user.currentWorkspaceId.trim() != currentWorkspaceId
                ) ||
            (
                currentWorkspaceObjectId.isNotBlank() &&
                    currentWorkspaceObjectId != currentWorkspaceId
                ) ||
            !currentMembershipCoherent ||
            !currentMembershipIsProjected
        ) {
            invalidRoleRequestContract()
        }
        return user
    }

    private fun invalidRoleRequestContract(): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = "ROLE_REQUEST_RESPONSE_INVALID",
            message = "Backend returned an invalid role-request receipt",
        )
    }

    private fun parseFirebaseAuthUser(json: JSONObject): AuthUser {
        val rawId = json.opt("id")
        val rawFirebaseUid = json.opt("firebaseUid")
        val rawEmail = json.opt("email")
        val rawVerifiedEmail = json.opt("verifiedEmail")
        val rawAccountStatus = json.opt("accountStatus")
        val rawDeletedAt = json.opt("deletedAt")
        val rawRole = json.opt("role")
        if (
            rawId !is String ||
            rawId.isBlank() ||
            rawId != rawId.trim() ||
            rawFirebaseUid !is String ||
            rawFirebaseUid.isBlank() ||
            rawFirebaseUid != rawFirebaseUid.trim() ||
            rawEmail !is String ||
            rawEmail.isBlank() ||
            rawVerifiedEmail != true ||
            rawAccountStatus !is String ||
            !rawAccountStatus.equals("active", ignoreCase = true) ||
            !json.has("deletedAt") ||
            !(
            rawDeletedAt == JSONObject.NULL ||
                    (rawDeletedAt is String && rawDeletedAt.isBlank())
                ) ||
            rawRole !is String ||
            rawRole !in AUTHORITY_ROLES
        ) {
            throw SmartHealthApiException(
                statusCode = 502,
                code = "FIREBASE_AUTH_RESPONSE_INVALID",
                message = "Backend returned an invalid Firebase authentication receipt",
            )
        }
        return parseAuthUser(json).also { user ->
            if (user.role !in AUTHORITY_ROLES) {
                throw SmartHealthApiException(
                    statusCode = 502,
                    code = "FIREBASE_AUTH_RESPONSE_INVALID",
                    message = "Backend returned an invalid Firebase authentication receipt",
                )
            }
        }
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
            firebaseUid = json.optString("firebaseUid"),
            accountStatus = json.optString("accountStatus", "active"),
            deletedAt = json.stringOrNull("deletedAt"),
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
            roleRequestOrganizationId = json.optString("roleRequestOrganizationId"),
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

    private fun parseNotificationPreferences(json: JSONObject): NotificationPreferencesSnapshot {
        val ownership = json.getJSONObject("ownership")
        val preferences = json.getJSONObject("preferences")
        val channels = json.getJSONObject("channels")
        return NotificationPreferencesSnapshot(
            userId = json.getString("userId"),
            workspaceId = json.getString("workspaceId"),
            ownership = NotificationPreferenceOwnership(
                kind = ownership.getString("kind"),
                userId = ownership.getString("userId"),
            ),
            preferences = NotificationCloudPreferences(
                enabled = preferences.getBoolean("enabled"),
                doctorRequests = preferences.getBoolean("doctorRequests"),
                abnormalResults = preferences.getBoolean("abnormalResults"),
                deviceOffline = preferences.getBoolean("deviceOffline"),
                appointments = preferences.getBoolean("appointments"),
                messages = preferences.getBoolean("messages"),
                aiUpdates = preferences.getBoolean("aiUpdates"),
                newLogin = preferences.getBoolean("newLogin"),
            ),
            channels = NotificationChannelAvailabilitySet(
                inApp = parseNotificationChannelAvailability(channels.getJSONObject("inApp")),
                email = parseNotificationChannelAvailability(channels.getJSONObject("email")),
                push = parseNotificationChannelAvailability(channels.getJSONObject("push")),
            ),
            updatedAt = json.getString("updatedAt"),
            replayed = json.optBoolean("replayed", false),
        )
    }

    private fun parseNotificationChannelAvailability(
        json: JSONObject,
    ): NotificationChannelAvailability {
        return NotificationChannelAvailability(
            available = json.getBoolean("available"),
            status = json.getString("status"),
            reasonCode = json.optString("reasonCode"),
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
            status = json.optString("status", "active"),
            operational = json.optBoolean("operational", true),
            suspendedAt = json.optString("suspendedAt"),
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

    private fun parseAuthSessionRevocationReceipt(
        json: JSONObject,
        expectedSessionId: String,
    ): AuthSessionRevocationReceipt {
        if (
            json.keys().asSequence().toSet() !=
            setOf("session", "revoked", "replayed")
        ) {
            invalidAuthSessionRevocationReceipt()
        }
        val sessionJson = json.opt("session") as? JSONObject
            ?: invalidAuthSessionRevocationReceipt()
        if (
            sessionJson.keys().asSequence().toSet() !=
            setOf(
                "id",
                "provider",
                "device",
                "userAgent",
                "ip",
                "createdAt",
                "lastSeenAt",
                "revokedAt",
                "current",
            )
        ) {
            invalidAuthSessionRevocationReceipt()
        }
        val sessionId = sessionJson.opt("id") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val provider = sessionJson.opt("provider") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val device = sessionJson.opt("device") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val userAgent = sessionJson.opt("userAgent") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val ip = sessionJson.opt("ip") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val createdAt = sessionJson.opt("createdAt") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val lastSeenAt = sessionJson.opt("lastSeenAt") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val revokedAt = sessionJson.opt("revokedAt") as? String
            ?: invalidAuthSessionRevocationReceipt()
        val current = sessionJson.opt("current") as? Boolean
            ?: invalidAuthSessionRevocationReceipt()
        val revoked = json.opt("revoked") as? Boolean
            ?: invalidAuthSessionRevocationReceipt()
        val replayed = json.opt("replayed") as? Boolean
            ?: invalidAuthSessionRevocationReceipt()
        if (
            sessionId != expectedSessionId ||
            sessionId.length !in 1..160 ||
            sessionId != sessionId.trim() ||
            provider.length !in 1..80 ||
            provider != provider.trim() ||
            !isAuthSessionDateTime(createdAt) ||
            !isAuthSessionDateTime(lastSeenAt) ||
            !isAuthSessionDateTime(revokedAt) ||
            current ||
            !revoked
        ) {
            invalidAuthSessionRevocationReceipt()
        }
        return AuthSessionRevocationReceipt(
            session = AuthSession(
                id = sessionId,
                provider = provider,
                device = device,
                userAgent = userAgent,
                ip = ip,
                current = false,
                createdAt = createdAt,
                lastSeenAt = lastSeenAt,
                revokedAt = revokedAt,
            ),
            revoked = true,
            replayed = replayed,
        )
    }

    private fun isAuthSessionDateTime(value: String): Boolean =
        value.isNotBlank() &&
            value == value.trim() &&
            runCatching { Instant.parse(value) }.isSuccess

    private fun invalidAuthSessionRevocationReceipt(): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = "AUTH_SESSION_REVOCATION_RESPONSE_INVALID",
            message = "Backend returned an invalid auth-session revocation receipt",
        )
    }

    private fun validateAccountProfileUpdateIntent(intent: AccountProfileUpdateIntent) {
        val changedFields = intent.expectedChangedFields
        if (
            !intent.userId.isBoundedCanonicalValue(120) ||
            !intent.name.isBoundedCanonicalProfileValue(160) ||
            !intent.expectedPhone.isBoundedCanonicalProfileValue(160) ||
            !intent.license.isBoundedCanonicalProfileValue(160) ||
            !intent.hospital.isBoundedCanonicalProfileValue(160) ||
            !intent.department.isBoundedCanonicalProfileValue(160) ||
            !intent.specialty.isBoundedCanonicalProfileValue(160) ||
            !intent.address.isBoundedCanonicalProfileValue(1000) ||
            !intent.expectedOrganizationId.isBoundedCanonicalProfileValue(120) ||
            changedFields != changedFields.sorted() ||
            changedFields.toSet().size != changedFields.size ||
            changedFields.size > ACCOUNT_PROFILE_MUTATION_FIELDS.size ||
            changedFields.any { it !in ACCOUNT_PROFILE_MUTATION_FIELDS } ||
            !intent.idempotencyKey.isBoundedCanonicalValue(160) ||
            intent.idempotencyKey.length < 8 ||
            intent.expectedAuthSessionEpoch < 0L
        ) {
            invalidAccountProfileReceipt(
                statusCode = 400,
                code = "ACCOUNT_PROFILE_INTENT_INVALID",
                message = "Account profile mutation intent is incomplete or malformed",
            )
        }
    }

    private fun parseAccountProfileUpdateReceipt(
        json: JSONObject,
        intent: AccountProfileUpdateIntent,
    ): AccountProfileUpdateReceipt {
        if (
            json.keys().asSequence().toSet() != ACCOUNT_PROFILE_RECEIPT_KEYS ||
            json.opt("userId") !is String ||
            json.opt("intent") != "profile_update" ||
            json.opt("changedFields") !is JSONArray ||
            json.opt("user") !is JSONObject ||
            json.opt("replayed") !is Boolean
        ) {
            invalidAccountProfileReceipt()
        }
        val changedJson = json.getJSONArray("changedFields")
        val changedFields = buildList(changedJson.length()) {
            repeat(changedJson.length()) { index ->
                val value = changedJson.opt(index) as? String
                    ?: invalidAccountProfileReceipt()
                add(value)
            }
        }
        val userJson = json.getJSONObject("user")
        val userId = json.getString("userId")
        val returnedUserId = userJson.opt("id") as? String
        val name = userJson.opt("name") as? String
        val title = userJson.opt("title") as? String
        val phone = userJson.opt("phone") as? String
        val license = userJson.opt("license") as? String
        val hospital = userJson.opt("hospital") as? String
        val department = userJson.opt("department") as? String
        val specialty = userJson.opt("specialty") as? String
        val address = userJson.opt("address") as? String
        val organizationId = userJson.opt("organizationId") as? String
        val updatedAt = userJson.opt("updatedAt") as? String
        if (
            userId != intent.userId ||
            changedFields != intent.expectedChangedFields ||
            userJson.keys().asSequence().toSet() != ACCOUNT_PROFILE_USER_RECEIPT_KEYS ||
            returnedUserId != intent.userId ||
            name != intent.name ||
            title == null ||
            !title.isBoundedCanonicalProfileValue(160) ||
            phone != intent.expectedPhone ||
            license != intent.license ||
            hospital != intent.hospital ||
            department != intent.department ||
            specialty != intent.specialty ||
            address != intent.address ||
            organizationId != intent.expectedOrganizationId ||
            updatedAt == null ||
            !updatedAt.isCanonicalInstant()
        ) {
            invalidAccountProfileReceipt()
        }
        return AccountProfileUpdateReceipt(
            userId = userId,
            intent = "profile_update",
            changedFields = changedFields,
            user = AccountProfileMutationUser(
                id = returnedUserId,
                name = name,
                title = title,
                phone = phone,
                license = license,
                hospital = hospital,
                department = department,
                specialty = specialty,
                address = address,
                organizationId = organizationId,
                updatedAt = updatedAt,
            ),
            replayed = json.getBoolean("replayed"),
        )
    }

    private fun String.isBoundedCanonicalProfileValue(maxLength: Int): Boolean =
        length <= maxLength && this == trim()

    private fun requireAccountProfileSessionCurrent(pinnedSession: PinnedAuthSession) {
        if (!isPinnedAuthSessionCurrent(pinnedSession.session)) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Authentication session changed while the profile request was running",
            )
        }
    }

    private fun invalidAccountProfileReceipt(
        statusCode: Int = 502,
        code: String = "ACCOUNT_PROFILE_RESPONSE_INVALID",
        message: String = "Backend returned an invalid account profile mutation receipt",
    ): Nothing {
        throw SmartHealthApiException(
            statusCode = statusCode,
            code = code,
            message = message,
        )
    }

    private fun validateAvatarUploadIntent(intent: AvatarUploadIntent) {
        val calculatedSha256 = MessageDigest.getInstance("SHA-256")
            .digest(intent.bytes)
            .toHex()
        if (
            !intent.userId.isBoundedCanonicalValue(160) ||
            !intent.fileName.isSafeAvatarFileName() ||
            intent.contentType !in AVATAR_CONTENT_TYPES ||
            intent.bytes.isEmpty() ||
            intent.bytes.size > MAX_AVATAR_BYTES ||
            !AVATAR_SHA256_REGEX.matches(intent.sha256) ||
            calculatedSha256 != intent.sha256 ||
            !intent.idempotencyKey.isBoundedCanonicalValue(160) ||
            intent.idempotencyKey.length < 8 ||
            intent.expectedAuthSessionEpoch < 0L
        ) {
            invalidAvatarReceipt(
                statusCode = 400,
                code = "AVATAR_UPLOAD_INTENT_INVALID",
                message = "Avatar upload intent is incomplete or does not match its bytes",
            )
        }
    }

    private fun validateAvatarDeleteIntent(intent: AvatarDeleteIntent) {
        if (
            !intent.userId.isBoundedCanonicalValue(160) ||
            !intent.expectedAvatarFileId.isBoundedCanonicalValue(160) ||
            !intent.idempotencyKey.isBoundedCanonicalValue(160) ||
            intent.idempotencyKey.length < 8 ||
            intent.expectedAuthSessionEpoch < 0L
        ) {
            invalidAvatarReceipt(
                statusCode = 400,
                code = "AVATAR_DELETE_INTENT_INVALID",
                message = "Avatar deletion requires an exact owner, file and operation identity",
            )
        }
    }

    private fun validateAvatarDownloadIntent(intent: AvatarDownloadIntent) {
        if (
            !intent.userId.isBoundedCanonicalValue(160) ||
            !intent.fileId.isBoundedCanonicalValue(160) ||
            !AVATAR_SHA256_REGEX.matches(intent.sha256) ||
            intent.expectedAuthSessionEpoch < 0L
        ) {
            invalidAvatarReceipt(
                statusCode = 400,
                code = "AVATAR_DOWNLOAD_INTENT_INVALID",
                message = "Avatar download requires an exact owner, file and digest identity",
            )
        }
    }

    private fun parseAvatarUploadReceipt(
        json: JSONObject,
        intent: AvatarUploadIntent,
    ): AvatarUploadReceipt {
        if (
            json.keys().asSequence().toSet() != AVATAR_UPLOAD_RECEIPT_KEYS ||
            json.opt("avatar") !is JSONObject ||
            json.opt("cleanup") !is JSONObject ||
            json.opt("operationId") !is String ||
            json.opt("replayed") !is Boolean
        ) {
            invalidAvatarReceipt(code = "AVATAR_UPLOAD_RESPONSE_INVALID")
        }
        val avatarJson = json.getJSONObject("avatar")
        val fileId = avatarJson.opt("fileId") as? String
        val ownerUserId = avatarJson.opt("ownerUserId") as? String
        val name = avatarJson.opt("name") as? String
        val contentType = avatarJson.opt("contentType") as? String
        val byteSize = avatarJson.canonicalInteger("byteSize")
        val sha256 = avatarJson.opt("sha256") as? String
        val downloadUrl = avatarJson.opt("downloadUrl") as? String
        val uploadedAt = avatarJson.opt("uploadedAt") as? String
        if (
            avatarJson.keys().asSequence().toSet() != AVATAR_FILE_RECEIPT_KEYS ||
            fileId == null ||
            !fileId.isBoundedCanonicalValue(160) ||
            ownerUserId != intent.userId ||
            name != intent.fileName ||
            contentType != intent.contentType ||
            byteSize != intent.bytes.size ||
            sha256 != intent.sha256 ||
            downloadUrl != "/api/v1/me/avatar" ||
            uploadedAt == null ||
            !uploadedAt.isCanonicalInstant()
        ) {
            invalidAvatarReceipt(code = "AVATAR_UPLOAD_RESPONSE_INVALID")
        }
        val cleanup = parseAvatarCleanupReceipt(
            json = json.getJSONObject("cleanup"),
            requirePreviousFileId = false,
            responseCode = "AVATAR_UPLOAD_RESPONSE_INVALID",
        )
        val operationId = json.getString("operationId")
        if (!operationId.isBoundedCanonicalValue(160)) {
            invalidAvatarReceipt(code = "AVATAR_UPLOAD_RESPONSE_INVALID")
        }
        return AvatarUploadReceipt(
            avatar = AvatarFileReceipt(
                fileId = fileId,
                ownerUserId = ownerUserId,
                name = name,
                contentType = contentType,
                byteSize = byteSize,
                sha256 = sha256,
                downloadUrl = downloadUrl,
                uploadedAt = uploadedAt,
            ),
            cleanup = cleanup,
            operationId = operationId,
            replayed = json.getBoolean("replayed"),
        )
    }

    private fun parseAvatarDeleteReceipt(
        json: JSONObject,
        intent: AvatarDeleteIntent,
    ): AvatarDeleteReceipt {
        if (
            json.keys().asSequence().toSet() != AVATAR_DELETE_RECEIPT_KEYS ||
            json.opt("deleted") != true ||
            json.opt("avatar") !is JSONObject ||
            json.opt("cleanup") !is JSONObject ||
            json.opt("operationId") !is String ||
            json.opt("replayed") !is Boolean
        ) {
            invalidAvatarReceipt(code = "AVATAR_DELETE_RESPONSE_INVALID")
        }
        val avatarJson = json.getJSONObject("avatar")
        val fileId = avatarJson.opt("fileId") as? String
        val ownerUserId = avatarJson.opt("ownerUserId") as? String
        val deletedAt = avatarJson.opt("deletedAt") as? String
        if (
            avatarJson.keys().asSequence().toSet() != AVATAR_DELETED_FILE_RECEIPT_KEYS ||
            fileId != intent.expectedAvatarFileId ||
            ownerUserId != intent.userId ||
            deletedAt == null ||
            !deletedAt.isCanonicalInstant()
        ) {
            invalidAvatarReceipt(code = "AVATAR_DELETE_RESPONSE_INVALID")
        }
        val cleanup = parseAvatarCleanupReceipt(
            json = json.getJSONObject("cleanup"),
            requirePreviousFileId = true,
            responseCode = "AVATAR_DELETE_RESPONSE_INVALID",
        )
        val operationId = json.getString("operationId")
        if (
            cleanup.previousFileId != intent.expectedAvatarFileId ||
            !operationId.isBoundedCanonicalValue(160)
        ) {
            invalidAvatarReceipt(code = "AVATAR_DELETE_RESPONSE_INVALID")
        }
        return AvatarDeleteReceipt(
            deleted = true,
            avatar = AvatarDeletedFileReceipt(
                fileId = fileId,
                ownerUserId = ownerUserId,
                deletedAt = deletedAt,
            ),
            cleanup = cleanup,
            operationId = operationId,
            replayed = json.getBoolean("replayed"),
        )
    }

    private fun parseAvatarCleanupReceipt(
        json: JSONObject,
        requirePreviousFileId: Boolean,
        responseCode: String,
    ): AvatarCleanupReceipt {
        val status = when (json.opt("status")) {
            "not_required" -> AvatarCleanupStatus.NotRequired
            "pending" -> AvatarCleanupStatus.Pending
            "completed" -> AvatarCleanupStatus.Completed
            "dead_letter" -> AvatarCleanupStatus.DeadLetter
            else -> null
        }
        val previousFileId = json.opt("previousFileId") as? String
        if (
            json.keys().asSequence().toSet() != AVATAR_CLEANUP_RECEIPT_KEYS ||
            status == null ||
            previousFileId == null ||
            previousFileId.length > 160 ||
            previousFileId != previousFileId.trim() ||
            (requirePreviousFileId && previousFileId.isBlank())
        ) {
            invalidAvatarReceipt(code = responseCode)
        }
        return AvatarCleanupReceipt(status = status, previousFileId = previousFileId)
    }

    private fun parseAvatarCleanupStatus(
        json: JSONObject,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): AvatarCleanupStatusSnapshot {
        val status = when (json.opt("status")) {
            "not_required" -> AvatarCleanupStatus.NotRequired
            "pending" -> AvatarCleanupStatus.Pending
            "completed" -> AvatarCleanupStatus.Completed
            "dead_letter" -> AvatarCleanupStatus.DeadLetter
            else -> null
        }
        val action = when (json.opt("action")) {
            "none" -> AvatarCleanupAction.None
            "upload" -> AvatarCleanupAction.Upload
            "delete" -> AvatarCleanupAction.Delete
            "orphan_upload" -> AvatarCleanupAction.OrphanUpload
            else -> null
        }
        val userId = json.opt("userId") as? String
        val workspaceId = json.opt("workspaceId") as? String
        val operationId = json.opt("operationId") as? String
        val previousFileId = json.opt("previousFileId") as? String
        val attempts = json.canonicalInteger("attempts")
        val lastErrorCode = json.opt("lastErrorCode") as? String
        val updatedAt = json.opt("updatedAt") as? String
        val manualSupportRequired = json.opt("manualSupportRequired") as? Boolean
        val unresolved = status in setOf(
            AvatarCleanupStatus.Pending,
            AvatarCleanupStatus.DeadLetter,
        )
        if (
            json.keys().asSequence().toSet() != AVATAR_CLEANUP_STATUS_KEYS ||
            userId != expectedUserId ||
            workspaceId != expectedWorkspaceId ||
            status == null ||
            action == null ||
            operationId == null ||
            operationId.length > 160 ||
            (unresolved && (operationId.isBlank() || action == AvatarCleanupAction.None)) ||
            previousFileId == null ||
            previousFileId.length > 160 ||
            attempts == null ||
            attempts !in 0..50 ||
            lastErrorCode == null ||
            lastErrorCode.length > 120 ||
            !AVATAR_CLEANUP_ERROR_CODE_REGEX.matches(lastErrorCode) ||
            updatedAt == null ||
            (operationId.isNotBlank() && !updatedAt.isCanonicalInstant()) ||
            (operationId.isBlank() && updatedAt.isNotBlank()) ||
            manualSupportRequired != (status == AvatarCleanupStatus.DeadLetter) ||
            (status == AvatarCleanupStatus.DeadLetter && lastErrorCode.isBlank())
        ) {
            invalidAvatarReceipt(code = "AVATAR_CLEANUP_STATUS_INVALID")
        }
        return AvatarCleanupStatusSnapshot(
            userId = userId,
            workspaceId = workspaceId,
            status = status,
            operationId = operationId,
            action = action,
            previousFileId = previousFileId,
            attempts = attempts,
            lastErrorCode = lastErrorCode,
            updatedAt = updatedAt,
            manualSupportRequired = manualSupportRequired,
        )
    }

    private fun JSONObject.canonicalInteger(name: String): Int? {
        val value = opt(name) as? Number ?: return null
        val longValue = value.toLong()
        if (value.toDouble() != longValue.toDouble() || longValue !in Int.MIN_VALUE..Int.MAX_VALUE) {
            return null
        }
        return longValue.toInt()
    }

    private fun String.isSafeAvatarFileName(): Boolean =
        isBoundedCanonicalValue(240) &&
            none { it == '/' || it == '\\' || it.code < 0x20 || it.code == 0x7f }

    private fun requireAvatarSessionCurrent(pinnedSession: PinnedAuthSession) {
        if (!isPinnedAuthSessionCurrent(pinnedSession.session)) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "AUTH_SESSION_REPLACED",
                message = "Authentication session changed while the avatar request was running",
            )
        }
    }

    private fun invalidAvatarReceipt(
        statusCode: Int = 502,
        code: String,
        message: String = "Backend returned an invalid avatar mutation receipt",
    ): Nothing {
        throw SmartHealthApiException(
            statusCode = statusCode,
            code = code,
            message = message,
        )
    }

    private fun validateTwoFactorEnrollmentIntent(intent: TwoFactorEnrollmentIntent) {
        if (
            !intent.userId.isBoundedCanonicalValue(160) ||
            !intent.enrollmentId.isBoundedCanonicalValue(200) ||
            !TWO_FACTOR_OTP_REGEX.matches(intent.code) ||
            !intent.idempotencyKey.isBoundedCanonicalValue(160) ||
            intent.expectedAuthSessionEpoch < 0L
        ) {
            invalidTwoFactorEnrollmentReceipt(
                code = "TWO_FACTOR_ENROLLMENT_INTENT_INVALID",
                message = "Yêu cầu xác minh thiết lập xác thực hai lớp chưa đầy đủ hoặc không hợp lệ",
            )
        }
    }

    private fun validateTwoFactorEnrollmentStartIntent(
        intent: TwoFactorEnrollmentStartIntent,
    ) {
        if (
            !intent.userId.isBoundedCanonicalValue(160) ||
            !intent.idempotencyKey.isBoundedCanonicalValue(160) ||
            intent.expectedAuthSessionEpoch < 0L
        ) {
            invalidTwoFactorEnrollmentReceipt(
                code = "TWO_FACTOR_ENROLLMENT_START_INTENT_INVALID",
                message = "Yêu cầu bắt đầu thiết lập xác thực hai lớp chưa đầy đủ hoặc không hợp lệ",
            )
        }
    }

    private fun parseTwoFactorEnrollmentStartReceipt(
        json: JSONObject,
        intent: TwoFactorEnrollmentStartIntent,
    ): TwoFactorEnrollmentResult {
        if (
            json.keys().asSequence().toSet() != TWO_FACTOR_ENROLLMENT_START_RECEIPT_KEYS ||
            json.opt("userId") !is String ||
            json.opt("twoFactor") !is JSONObject ||
            json.opt("enrollment") !is JSONObject ||
            json.opt("replayed") !is Boolean ||
            json.opt("superseded") !is Boolean
        ) {
            invalidTwoFactorEnrollmentReceipt(
                message = "Máy chủ trả về biên nhận bắt đầu thiết lập xác thực hai lớp không hợp lệ",
            )
        }
        val userId = json.getString("userId")
        val enrollmentJson = json.getJSONObject("enrollment")
        val id = enrollmentJson.opt("id") as? String
        val method = enrollmentJson.opt("method") as? String
        val manualKey = enrollmentJson.opt("manualKey") as? String
        val otpauthUri = enrollmentJson.opt("otpauthUri") as? String
        val expiresAt = enrollmentJson.opt("expiresAt") as? String
        if (
            userId != intent.userId ||
            enrollmentJson.keys().asSequence().toSet() != TWO_FACTOR_ENROLLMENT_KEYS ||
            id == null || !id.isBoundedCanonicalValue(200) ||
            method != "app" ||
            manualKey == null || !TWO_FACTOR_MANUAL_KEY_REGEX.matches(manualKey) ||
            otpauthUri == null || !otpauthUri.startsWith("otpauth://totp/") ||
            expiresAt == null || !expiresAt.isCanonicalInstant()
        ) {
            invalidTwoFactorEnrollmentReceipt(
                code = "TWO_FACTOR_ENROLLMENT_START_RESPONSE_SCOPE_MISMATCH",
                message = "Máy chủ trả về lần thiết lập của tài khoản khác hoặc dữ liệu không hợp lệ",
            )
        }
        return TwoFactorEnrollmentResult(
            userId = userId,
            twoFactor = parseCanonicalPendingTwoFactorState(json.getJSONObject("twoFactor")),
            enrollment = TwoFactorEnrollment(
                id = id,
                method = method,
                manualKey = manualKey,
                otpauthUri = otpauthUri,
                expiresAt = expiresAt,
            ),
            replayed = json.getBoolean("replayed"),
            superseded = json.getBoolean("superseded"),
        )
    }

    private fun validateTwoFactorRecoveryAcknowledgementIntent(
        intent: TwoFactorRecoveryAcknowledgementIntent,
    ) {
        if (
            !intent.userId.isBoundedCanonicalValue(160) ||
            !intent.enrollmentId.isBoundedCanonicalValue(200) ||
            !intent.deliveryId.isBoundedCanonicalValue(200) ||
            !intent.recoveryAckToken.isCanonicalTwoFactorToken() ||
            !intent.idempotencyKey.isBoundedCanonicalValue(160) ||
            intent.expectedAuthSessionEpoch < 0L
        ) {
            invalidTwoFactorEnrollmentReceipt(
                code = "TWO_FACTOR_RECOVERY_ACK_INTENT_INVALID",
                message = "Yêu cầu xác nhận mã khôi phục chưa đầy đủ hoặc không hợp lệ",
            )
        }
    }

    private fun parseTwoFactorEnrollmentReceipt(
        json: JSONObject,
        intent: TwoFactorEnrollmentIntent,
    ): TwoFactorVerifiedResult {
        if (
            json.keys().asSequence().toSet() != TWO_FACTOR_VERIFICATION_RECEIPT_KEYS ||
            json.opt("userId") !is String ||
            json.opt("enrollmentId") !is String ||
            json.opt("twoFactor") !is JSONObject ||
            json.opt("recoveryCodes") !is JSONArray ||
            json.opt("recoveryDelivery") !is JSONObject ||
            json.opt("recoveryAckToken") !is String ||
            json.opt("replayed") !is Boolean
        ) {
            invalidTwoFactorEnrollmentReceipt()
        }
        val userId = json.getString("userId")
        val enrollmentId = json.getString("enrollmentId")
        val recoveryAckToken = json.getString("recoveryAckToken")
        val codesJson = json.getJSONArray("recoveryCodes")
        val codes = buildList(codesJson.length()) {
            repeat(codesJson.length()) { index ->
                val value = codesJson.opt(index)
                if (value !is String) invalidTwoFactorEnrollmentReceipt()
                add(value)
            }
        }
        val twoFactor = parseCanonicalPendingTwoFactorState(
            json.getJSONObject("twoFactor"),
        )
        val delivery = parseCanonicalTwoFactorRecoveryDelivery(
            json = json.getJSONObject("recoveryDelivery"),
            expectedId = null,
            expectedAcknowledged = false,
        )
        if (
            userId != intent.userId ||
            enrollmentId != intent.enrollmentId ||
            codes.size != 8 ||
            codes.toSet().size != 8 ||
            codes.any { !TWO_FACTOR_RECOVERY_CODE_REGEX.matches(it) } ||
            !recoveryAckToken.isCanonicalTwoFactorToken()
        ) {
            invalidTwoFactorEnrollmentReceipt(
                code = "TWO_FACTOR_ENROLLMENT_RESPONSE_SCOPE_MISMATCH",
                message = "Máy chủ trả về biên nhận xác thực hai lớp của tài khoản hoặc lần thiết lập khác",
            )
        }
        return TwoFactorVerifiedResult(
            userId = userId,
            enrollmentId = enrollmentId,
            twoFactor = twoFactor,
            recoveryCodes = codes,
            recoveryDelivery = delivery,
            recoveryAckToken = recoveryAckToken,
            replayed = json.getBoolean("replayed"),
        )
    }

    private fun parseTwoFactorRecoveryAcknowledgementReceipt(
        json: JSONObject,
        intent: TwoFactorRecoveryAcknowledgementIntent,
    ): TwoFactorRecoveryAcknowledgementReceipt {
        if (
            json.keys().asSequence().toSet() != TWO_FACTOR_ACK_RECEIPT_KEYS ||
            json.opt("userId") !is String ||
            json.opt("enrollmentId") !is String ||
            json.opt("twoFactor") !is JSONObject ||
            json.opt("recoveryDelivery") !is JSONObject ||
            json.opt("twoFactorToken") !is String ||
            json.opt("tokenExpiresAt") !is String ||
            json.opt("replayed") !is Boolean
        ) {
            invalidTwoFactorRecoveryAcknowledgementReceipt()
        }
        val userId = json.getString("userId")
        val enrollmentId = json.getString("enrollmentId")
        val twoFactorToken = json.getString("twoFactorToken")
        val tokenExpiresAt = json.getString("tokenExpiresAt")
        val twoFactor = parseCanonicalEnabledTwoFactorState(
            json.getJSONObject("twoFactor"),
        )
        val delivery = parseCanonicalTwoFactorRecoveryDelivery(
            json = json.getJSONObject("recoveryDelivery"),
            expectedId = intent.deliveryId,
            expectedAcknowledged = true,
        )
        if (
            userId != intent.userId ||
            enrollmentId != intent.enrollmentId ||
            !twoFactorToken.isCanonicalTwoFactorToken() ||
            !tokenExpiresAt.isCanonicalInstant()
        ) {
            invalidTwoFactorRecoveryAcknowledgementReceipt(
                code = "TWO_FACTOR_RECOVERY_ACK_RESPONSE_SCOPE_MISMATCH",
                message = "Máy chủ xác nhận mã khôi phục cho tài khoản khác",
            )
        }
        return TwoFactorRecoveryAcknowledgementReceipt(
            userId = userId,
            enrollmentId = enrollmentId,
            twoFactor = twoFactor,
            recoveryDelivery = delivery,
            twoFactorToken = twoFactorToken,
            tokenExpiresAt = tokenExpiresAt,
            replayed = json.getBoolean("replayed"),
        )
    }

    private fun parseCanonicalPendingTwoFactorState(json: JSONObject): TwoFactorState {
        if (
            json.keys().asSequence().toSet() != TWO_FACTOR_STATE_KEYS ||
            json.opt("enabled") != false ||
            json.opt("method") != "" ||
            json.opt("enrollmentPending") != true
        ) {
            invalidTwoFactorEnrollmentReceipt(
                message = "Máy chủ đã bật xác thực hai lớp trước khi mã khôi phục được xác nhận",
            )
        }
        return TwoFactorState(
            enabled = false,
            method = "",
            enrollmentPending = true,
        )
    }

    private fun parseCanonicalEnabledTwoFactorState(json: JSONObject): TwoFactorState {
        if (
            json.keys().asSequence().toSet() != TWO_FACTOR_STATE_KEYS ||
            json.opt("enabled") != true ||
            json.opt("method") != "app" ||
            json.opt("enrollmentPending") != false
        ) {
            invalidTwoFactorEnrollmentReceipt(
                message = "Máy chủ chưa xác nhận đúng trạng thái đã bật của ứng dụng xác thực",
            )
        }
        return TwoFactorState(
            enabled = true,
            method = "app",
            enrollmentPending = false,
        )
    }

    private fun parseCanonicalTwoFactorRecoveryDelivery(
        json: JSONObject,
        expectedId: String?,
        expectedAcknowledged: Boolean,
    ): TwoFactorRecoveryDelivery {
        val expectedKeys = if (expectedAcknowledged) {
            TWO_FACTOR_ACKNOWLEDGED_DELIVERY_KEYS
        } else {
            TWO_FACTOR_PENDING_DELIVERY_KEYS
        }
        val id = json.opt("id") as? String
        val expiresAt = json.opt("expiresAt") as? String
        val acknowledged = json.opt("acknowledged") as? Boolean
        val acknowledgedAt = if (expectedAcknowledged) {
            json.opt("acknowledgedAt") as? String
        } else {
            null
        }
        if (
            json.keys().asSequence().toSet() != expectedKeys ||
            id == null ||
            !id.isBoundedCanonicalValue(200) ||
            (expectedId != null && id != expectedId) ||
            expiresAt == null ||
            !expiresAt.isCanonicalInstant() ||
            acknowledged != expectedAcknowledged ||
            (
                expectedAcknowledged &&
                    (acknowledgedAt == null || !acknowledgedAt.isCanonicalInstant())
                )
        ) {
            if (expectedAcknowledged) {
                invalidTwoFactorRecoveryAcknowledgementReceipt()
            }
            invalidTwoFactorEnrollmentReceipt()
        }
        return TwoFactorRecoveryDelivery(
            id = id,
            expiresAt = expiresAt,
            acknowledged = expectedAcknowledged,
            acknowledgedAt = acknowledgedAt,
        )
    }

    private fun String.isBoundedCanonicalValue(maxLength: Int): Boolean =
        length in 1..maxLength && this == trim()

    private fun String.isCanonicalInstant(): Boolean =
        isNotBlank() && this == trim() && runCatching { Instant.parse(this) }.isSuccess

    private fun String.isCanonicalTwoFactorToken(): Boolean =
        length in 32..1024 && this == trim() && TWO_FACTOR_TOKEN_REGEX.matches(this)

    private fun invalidTwoFactorEnrollmentReceipt(
        code: String = "TWO_FACTOR_ENROLLMENT_RESPONSE_INVALID",
        message: String = "Máy chủ trả về biên nhận thiết lập xác thực hai lớp không hợp lệ",
    ): Nothing {
        throw SmartHealthApiException(statusCode = 502, code = code, message = message)
    }

    private fun invalidTwoFactorRecoveryAcknowledgementReceipt(
        code: String = "TWO_FACTOR_RECOVERY_ACK_RESPONSE_INVALID",
        message: String = "Máy chủ trả về biên nhận xác nhận mã khôi phục không hợp lệ",
    ): Nothing {
        throw SmartHealthApiException(statusCode = 502, code = code, message = message)
    }

    private fun parseHealth(json: JSONObject): BackendHealth {
        val publicStatus = json.optJSONObject("status")
        return BackendHealth(
            ok = json.optBoolean("ok"),
            service = json.optString("service"),
            status = BackendStatus(
                sampleRate = 0,
                udpPort = 0,
                updatedAt = publicStatus?.stringOrNull("updatedAt"),
            ),
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
            workspaceId = json.optString(
                "workspaceId",
                json.optString("organizationId"),
            ),
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

    private fun parseNotificationInbox(json: JSONObject): NotificationInboxSnapshot {
        return NotificationInboxSnapshot(
            userId = json.getString("userId"),
            workspaceId = json.getString("workspaceId"),
            notifications = json
                .optJSONArray("notifications")
                .orEmpty()
                .map(::parseNotification),
            updatedAt = json.getString("updatedAt"),
        )
    }

    private fun parseNotificationInboxMutation(
        json: JSONObject,
    ): NotificationInboxMutationReceipt {
        val notification = if (
            json.has("notification") &&
            !json.isNull("notification")
        ) {
            parseNotification(json.getJSONObject("notification"))
        } else {
            null
        }
        return NotificationInboxMutationReceipt(
            userId = json.getString("userId"),
            workspaceId = json.getString("workspaceId"),
            action = NotificationInboxAction.fromWire(
                json.getString("action"),
            ),
            notification = notification,
            notifications = json
                .optJSONArray("notifications")
                .orEmpty()
                .map(::parseNotification),
            affectedIds = json
                .optJSONArray("affectedIds")
                .toStringList(),
            deletedId = json.stringOrNull("deletedId"),
            updatedAt = json.getString("updatedAt"),
            replayed = json.optBoolean("replayed", false),
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

    private fun parsePatientDashboard(
        json: JSONObject,
        expectedUserId: String,
        expectedWorkspaceId: String,
    ): PatientDashboardSnapshot {
        requireExactPatientDashboardKeys(
            json = json,
            allowedKeys = PATIENT_DASHBOARD_KEYS,
            sectionName = "snapshot",
        )
        val protocolVersion = json.exactIntOrNull("protocolVersion")
        if (protocolVersion != PATIENT_DASHBOARD_PROTOCOL_VERSION) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard protocol version is unsupported.",
            )
        }
        requireExactPatientDashboardString(
            json = json,
            name = "generatedAt",
            sectionName = "snapshot",
            requiredNonBlank = true,
        )
        listOf("userId", "workspaceId", "activePatientId").forEach { name ->
            requireExactPatientDashboardString(
                json = json,
                name = name,
                sectionName = "snapshot",
                maxLength = 160,
                canonicalId = true,
            )
        }
        val generatedAt = json.exactStringOrNull("generatedAt").orEmpty()
        if (
            generatedAt.isBlank() ||
            runCatching { java.time.Instant.parse(generatedAt) }.isFailure
        ) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard generation time is invalid.",
            )
        }
        val userId = json.exactStringOrNull("userId").orEmpty()
        val workspaceId = json.exactStringOrNull("workspaceId").orEmpty()
        if (userId != expectedUserId || workspaceId != expectedWorkspaceId) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_AUTHORITY_MISMATCH",
                reason = "Patient dashboard authority does not match the active session.",
            )
        }
        val activePatientId = json.exactStringOrNull("activePatientId").orEmpty()
        val patientJson = json.optJSONObject("patient")
        if (activePatientId.isBlank() || patientJson == null) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_PROFILE_MISMATCH",
                reason = "Patient dashboard is missing its active patient profile.",
            )
        }
        requireExactPatientDashboardKeys(
            json = patientJson,
            allowedKeys = PATIENT_DASHBOARD_PATIENT_KEYS,
            requiredKeys = PATIENT_DASHBOARD_PATIENT_REQUIRED_KEYS,
            sectionName = "patient",
        )
        requireExactPatientDashboardString(
            json = patientJson,
            name = "id",
            sectionName = "patient",
            maxLength = 160,
            canonicalId = true,
        )
        requireExactPatientDashboardString(
            json = patientJson,
            name = "name",
            sectionName = "patient",
            maxLength = 200,
            requiredNonBlank = true,
        )
        requireExactPatientDashboardString(
            json = patientJson,
            name = "patientCode",
            sectionName = "patient",
            maxLength = 120,
        )
        requireExactPatientDashboardString(
            json = patientJson,
            name = "profileType",
            sectionName = "patient",
            maxLength = 40,
        )
        requireExactPatientDashboardString(
            json = patientJson,
            name = "relationship",
            sectionName = "patient",
            maxLength = 80,
        )
        listOf(
            "ownerUserId",
            "accountUserId",
            "guardianUserId",
            "organizationId",
        ).forEach { name ->
            requireExactPatientDashboardString(
                json = patientJson,
                name = name,
                sectionName = "patient",
                maxLength = 160,
                canonicalId = true,
            )
        }
        val patientId = patientJson.exactStringOrNull("id").orEmpty()
        val patientWorkspaceId =
            patientJson.exactStringOrNull("organizationId").orEmpty()
        val patientOwnerIds = listOf(
            patientJson.exactStringOrNull("ownerUserId").orEmpty(),
            patientJson.exactStringOrNull("accountUserId").orEmpty(),
            patientJson.exactStringOrNull("guardianUserId").orEmpty(),
        ).filter(String::isNotBlank)
        if (
            patientId != activePatientId ||
            patientWorkspaceId != expectedWorkspaceId ||
            expectedUserId !in patientOwnerIds
        ) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_PROFILE_MISMATCH",
                reason = "Active patient profile identity does not match the dashboard authority.",
            )
        }
        val patient = parsePatient(patientJson)
        if (patient.id != activePatientId || patient.name.isBlank()) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_PROFILE_MISMATCH",
                reason = "Active patient profile content is invalid.",
            )
        }

        val sectionsJson = json.optJSONObject("sections")
            ?: invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard section availability is missing.",
            )
        requireExactPatientDashboardKeys(
            json = sectionsJson,
            allowedKeys = PATIENT_DASHBOARD_SECTION_KEYS,
            sectionName = "sections",
        )
        val sections = PatientDashboardSections(
            scans = parsePatientDashboardSection(sectionsJson, "scans"),
            device = parsePatientDashboardSection(sectionsJson, "device"),
        )

        val scanJson = json.optJSONArray("recentScans")
            ?: invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard recent scans are missing.",
            )
        if (scanJson.length() > PATIENT_DASHBOARD_RECENT_SCAN_LIMIT) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard contains too many recent scans.",
            )
        }
        val recentScans = buildList {
            for (index in 0 until scanJson.length()) {
                val rawScan = scanJson.optJSONObject(index)
                    ?: invalidPatientDashboardContract(
                        code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                        reason = "Patient dashboard scan entry is invalid.",
                    )
                requireExactPatientDashboardKeys(
                    json = rawScan,
                    allowedKeys = PATIENT_DASHBOARD_SCAN_KEYS,
                    requiredKeys = PATIENT_DASHBOARD_SCAN_REQUIRED_KEYS,
                    sectionName = "recent scan",
                )
                listOf("id", "patientId", "organizationId").forEach { name ->
                    requireExactPatientDashboardString(
                        json = rawScan,
                        name = name,
                        sectionName = "recent scan",
                        maxLength = 160,
                        canonicalId = true,
                    )
                }
                listOf("status", "mode").forEach { name ->
                    requireExactPatientDashboardString(
                        json = rawScan,
                        name = name,
                        sectionName = "recent scan",
                        maxLength = 60,
                    )
                }
                listOf("startedAt", "createdAt", "updatedAt").forEach { name ->
                    requireExactPatientDashboardString(
                        json = rawScan,
                        name = name,
                        sectionName = "recent scan",
                        maxLength = 80,
                    )
                }
                val scanId = rawScan.exactStringOrNull("id").orEmpty()
                val scanPatientId = rawScan.exactStringOrNull("patientId").orEmpty()
                val scanWorkspaceId = rawScan.exactStringOrNull("organizationId").orEmpty()
                if (
                    scanId.isBlank() ||
                    scanPatientId != activePatientId ||
                    scanWorkspaceId != workspaceId
                ) {
                    invalidPatientDashboardContract(
                        code = "PATIENT_DASHBOARD_PROFILE_MISMATCH",
                        reason = "Recent scan identity does not match the active patient profile and workspace.",
                    )
                }
                add(parseScan(rawScan))
            }
        }
        if (recentScans.map(Scan::id).distinct().size != recentScans.size) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard contains duplicate recent scans.",
            )
        }
        validatePatientDashboardSectionContent(
            section = sections.scans,
            hasContent = recentScans.isNotEmpty(),
            sectionName = "scans",
        )

        val rawDevice = json.opt("device")
        val deviceJson = when (rawDevice) {
            null, JSONObject.NULL -> null
            is JSONObject -> rawDevice
            else -> invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard device entry is invalid.",
            )
        }
        val device = deviceJson?.let { raw ->
            requireExactPatientDashboardKeys(
                json = raw,
                allowedKeys = PATIENT_DASHBOARD_DEVICE_KEYS,
                requiredKeys = PATIENT_DASHBOARD_DEVICE_REQUIRED_KEYS,
                sectionName = "device",
            )
            listOf("id", "organizationId", "ownerUserId").forEach { name ->
                requireExactPatientDashboardString(
                    json = raw,
                    name = name,
                    sectionName = "device",
                    maxLength = 160,
                    canonicalId = true,
                )
            }
            requireExactPatientDashboardString(
                json = raw,
                name = "assignedPatientId",
                sectionName = "device",
                maxLength = 160,
            )
            requireExactPatientDashboardString(
                json = raw,
                name = "name",
                sectionName = "device",
                maxLength = 200,
            )
            listOf("firmwareVersion", "lastSeenAt").forEach { name ->
                requireExactPatientDashboardString(
                    json = raw,
                    name = name,
                    sectionName = "device",
                    maxLength = 80,
                )
            }
            requireExactPatientDashboardBoolean(
                json = raw,
                name = "online",
                sectionName = "device",
            )
            requireExactPatientDashboardNullableInteger(
                json = raw,
                name = "battery",
                range = 0..100,
                sectionName = "device",
            )
            requireExactPatientDashboardNullableInteger(
                json = raw,
                name = "signal",
                range = -127..0,
                sectionName = "device",
            )
            val deviceId = raw.exactStringOrNull("id").orEmpty()
            val deviceWorkspaceId =
                raw.exactStringOrNull("organizationId").orEmpty()
            val deviceOwnerId = raw.exactStringOrNull("ownerUserId").orEmpty()
            val assignedPatientId =
                raw.exactStringOrNull("assignedPatientId").orEmpty()
            if (
                deviceId.isBlank() ||
                deviceWorkspaceId != expectedWorkspaceId ||
                deviceOwnerId != expectedUserId ||
                (assignedPatientId.isNotBlank() && assignedPatientId != activePatientId)
            ) {
                invalidPatientDashboardContract(
                    code = "PATIENT_DASHBOARD_DEVICE_MISMATCH",
                    reason = "Dashboard device identity does not match the active profile authority.",
                )
            }
            parseSmartDevice(raw)
        }
        validatePatientDashboardSectionContent(
            section = sections.device,
            hasContent = device != null,
            sectionName = "device",
        )

        return PatientDashboardSnapshot(
            protocolVersion = protocolVersion,
            generatedAt = generatedAt,
            userId = userId,
            workspaceId = workspaceId,
            activePatientId = activePatientId,
            patient = patient,
            sections = sections,
            recentScans = recentScans,
            device = device,
        )
    }

    private fun parsePatientDashboardSection(
        json: JSONObject,
        name: String,
    ): PatientDashboardSectionAvailability {
        val wireValue = json.exactStringOrNull(name).orEmpty()
        return PatientDashboardSectionAvailability.fromWireValue(wireValue)
            ?: invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard section '$name' has an unsupported state.",
            )
    }

    private fun requireExactPatientDashboardKeys(
        json: JSONObject,
        allowedKeys: Set<String>,
        requiredKeys: Set<String> = allowedKeys,
        sectionName: String,
    ) {
        val actualKeys = json.keys().asSequence().toSet()
        if (
            !actualKeys.containsAll(requiredKeys) ||
            !allowedKeys.containsAll(actualKeys)
        ) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard $sectionName fields do not match the versioned contract.",
            )
        }
    }

    private fun requireExactPatientDashboardString(
        json: JSONObject,
        name: String,
        sectionName: String,
        maxLength: Int? = null,
        requiredNonBlank: Boolean = false,
        canonicalId: Boolean = false,
    ) {
        if (!json.has(name)) return
        val value = json.opt(name) as? String
        if (
            value == null ||
            (requiredNonBlank && value.isBlank()) ||
            (maxLength != null && value.length > maxLength) ||
            (canonicalId && !PATIENT_DASHBOARD_CANONICAL_ID_REGEX.matches(value))
        ) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard $sectionName field '$name' has an invalid type or value.",
            )
        }
    }

    private fun requireExactPatientDashboardBoolean(
        json: JSONObject,
        name: String,
        sectionName: String,
    ) {
        if (json.opt(name) !is Boolean) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard $sectionName field '$name' must be boolean.",
            )
        }
    }

    private fun requireExactPatientDashboardNullableInteger(
        json: JSONObject,
        name: String,
        range: IntRange,
        sectionName: String,
    ) {
        if (!json.has(name) || json.isNull(name)) return
        val value = json.exactIntOrNull(name)
        if (value == null || value !in range) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard $sectionName field '$name' must be an integer in range.",
            )
        }
    }

    private fun validatePatientDashboardSectionContent(
        section: PatientDashboardSectionAvailability,
        hasContent: Boolean,
        sectionName: String,
    ) {
        val isConsistent = when (section) {
            PatientDashboardSectionAvailability.Ready -> hasContent
            PatientDashboardSectionAvailability.Empty,
            PatientDashboardSectionAvailability.Unavailable,
            -> !hasContent
        }
        if (!isConsistent) {
            invalidPatientDashboardContract(
                code = "PATIENT_DASHBOARD_CONTRACT_INVALID",
                reason = "Patient dashboard section '$sectionName' disagrees with its content.",
            )
        }
    }

    private fun invalidPatientDashboardContract(
        code: String,
        reason: String,
    ): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = code,
            message = reason,
        )
    }

    private fun parseSmartDevice(json: JSONObject): SmartDevice {
        val reportedSignalDbm =
            json.exactIntOrNull("signal")?.takeIf { it in -127..0 }
                ?: json.exactIntOrNull("wifiRssi")?.takeIf { it in -127..0 }
        val reportedBatteryPercent =
            json.exactIntOrNull("battery")?.takeIf { it in 0..100 }
        return SmartDevice(
            id = json.optString("id").trim(),
            name = json.optString("name"),
            type = json.optString("type", "stethoscope"),
            status = json.optString("status", "available"),
            signal = json.optInt("signal", -60),
            reportedSignalDbm = reportedSignalDbm,
            wifiRssi = if (json.has("wifiRssi") && !json.isNull("wifiRssi")) json.optInt("wifiRssi") else null,
            wifiSsid = json.optString("wifiSsid"),
            ipAddress = json.optString("ipAddress"),
            battery = json.optInt("battery"),
            reportedBatteryPercent = reportedBatteryPercent,
            connected = json.optBoolean("connected"),
            online = json.optBoolean("online"),
            connectionMethod = json.optString("connectionMethod"),
            pairedUserId = json.exactStringOrNull("pairedUserId"),
            organizationId = json.exactStringOrNull("organizationId").orEmpty(),
            ownerUserId = json.exactStringOrNull("ownerUserId").orEmpty(),
            assignedPatientId = json.exactStringOrNull("assignedPatientId").orEmpty(),
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
        expectedWorkspaceId: String,
    ): DevicePairingResponse {
        val deviceJson = json.optJSONObject("device")
            ?: invalidDevicePairingContract("Missing device")
        val pairingJson = json.optJSONObject("pairing")
            ?: invalidDevicePairingContract("Missing pairing")
        val device = parseSmartDevice(deviceJson)
        if (device.id != expectedDeviceId) {
            invalidDevicePairingContract("Device identity mismatch")
        }
        if (
            expectedWorkspaceId.isBlank() ||
            device.organizationId != expectedWorkspaceId
        ) {
            invalidDevicePairingContract("Workspace identity mismatch")
        }
        if (deviceJson.opt("connected") !is Boolean || deviceJson.opt("online") !is Boolean) {
            invalidDevicePairingContract("Missing canonical device presence")
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
            organizationId = json.optString("organizationId"),
            workspaceId = json.optStringFirst("workspaceId", "organizationId"),
            createdByUserId = json.optString("createdByUserId"),
            format = json.optString("format", "pdf"),
            dataset = json.optString("dataset", "clinical_bundle"),
            scopeKind = json.optString("scopeKind"),
            rendererVersion = json.optString("rendererVersion"),
            includeAudio = json.optBoolean("includeAudio", true),
            includeReports = json.optBoolean("includeReports", true),
            includeHistory = json.optBoolean("includeHistory", true),
            startDate = json.optString("startDate"),
            endDate = json.optString("endDate"),
            status = json.optString("status", "ready"),
            recordCount = json.optInt("recordCount"),
            downloadUrl = json.optString("downloadUrl"),
            artifactByteSize = json.optLong("artifactByteSize")
                .takeIf { json.has("artifactByteSize") && !json.isNull("artifactByteSize") },
            artifactSha256 = json.optString("artifactSha256"),
            createdAt = json.stringOrNull("createdAt")
        )
    }

    private fun parseStorageSummary(json: JSONObject): StorageSummary {
        return StorageSummary(
            autoSync = json.optBoolean("autoSync", false),
            cloudBackup = json.optBoolean("cloudBackup", false),
            localUsedMb = json.optInt("localUsedMb"),
            localTotalMb = json.optInt("localTotalMb"),
            cloudUsedMb = json.optInt("cloudUsedMb"),
            cloudTotalMb = json.optInt("cloudTotalMb"),
            cacheMb = json.optInt("cacheMb"),
            scanCount = json.optInt("scanCount"),
            patientCount = json.optInt("patientCount"),
            audioFileCount = json.optInt("audioFileCount"),
            audioUsedMb = json.optInt("audioUsedMb"),
            cloudUsedBytes = json.optLong("cloudUsedBytes"),
            audioUsedBytes = json.optLong("audioUsedBytes"),
            storageFileCount = json.optInt("storageFileCount"),
            updatedAt = json.stringOrNull("updatedAt")
        )
    }

    private suspend fun executeJson(
        request: Request,
        terminalAuthorizationEventExemptCodes: Set<String> = emptySet(),
    ): JSONObject {
        return executeCancellable(request) { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val exception = parseApiException(response.code, text)
                if (exception.code !in terminalAuthorizationEventExemptCodes) {
                    SmartHealthAuthorizationEvents.publishIfTerminal(
                        exception = exception,
                        authSessionEpoch = request
                            .tag(SmartHealthAuthorizationRequestContext::class.java)
                            ?.authSessionEpoch
                            ?: -1L,
                    )
                }
                throw exception
            }
            if (text.isBlank()) JSONObject() else JSONObject(text)
        }
    }

    private suspend fun executeBytes(request: Request): ByteArray {
        return executeCancellable(request) { response ->
            if (!response.isSuccessful) {
                val text = response.body?.string().orEmpty()
                val exception = parseApiException(response.code, text)
                SmartHealthAuthorizationEvents.publishIfTerminal(
                    exception = exception,
                    authSessionEpoch = request
                        .tag(SmartHealthAuthorizationRequestContext::class.java)
                        ?.authSessionEpoch
                        ?: -1L,
                )
                throw exception
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

    private fun parseClinicalDashboardStatus(
        json: JSONObject,
        expectedWorkspaceId: String,
    ): BackendStatus {
        val allowedKeys = setOf(
            "workspaceId",
            "devicesCount",
            "devicesOnline",
            "recording",
            "activeScanId",
            "updatedAt",
        )
        val actualKeys = json.keys().asSequence().toSet()
        val workspaceId = json.optString("workspaceId").trim()
        if (actualKeys != allowedKeys || workspaceId != expectedWorkspaceId) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "CLINICAL_DASHBOARD_WORKSPACE_MISMATCH",
                message = "Clinical dashboard status does not match the active workspace.",
            )
        }
        return BackendStatus(
            espCount = json.optInt("devicesOnline").coerceAtLeast(0),
            listeners = 0,
            recording = json.optBoolean("recording"),
            activeScanId = json.stringOrNull("activeScanId"),
            sampleRate = 0,
            udpPort = 0,
            updatedAt = json.stringOrNull("updatedAt"),
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
            accountUserId = json.optString("accountUserId"),
            guardianUserId = json.optString("guardianUserId"),
            organizationId = json.optString("organizationId"),
            scanCount = json.optInt("scanCount"),
            lastScanAt = json.stringOrNull("lastScanAt"),
            lastAiLabel = json.stringOrNull("lastAiLabel")
        )
    }

    private fun requireCanonicalPatientMutationInputs(
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        expectedAuthSessionId: String,
        expectedAuthSessionEpoch: Long,
    ) {
        require(idempotencyKey.isNotBlank()) { "Idempotency-Key is required" }
        require(expectedUserId.isNotBlank()) { "Expected account id is required" }
        require(expectedWorkspaceId.isNotBlank()) { "Expected workspace id is required" }
        require(expectedAuthSessionId.isNotBlank()) { "Expected auth session id is required" }
        require(expectedAuthSessionEpoch >= 0L) { "Expected auth session epoch is invalid" }
    }

    private fun pinPatientMutationSession(
        authority: PatientMutationAuthorityHeaders,
        expectedAuthSessionEpoch: Long,
    ): PinnedAuthSession {
        val pinnedSession = try {
            pinAuthSessionAtEpoch(
                expectedEpoch = expectedAuthSessionEpoch,
                requireBearer = true,
            )
        } catch (error: SmartHealthApiException) {
            if (error.code != "AUTH_SESSION_REPLACED") throw error
            throw SmartHealthApiException(
                statusCode = error.statusCode,
                code = error.code,
                details = mapOf(
                    "patientMutationStage" to "pre_dispatch",
                    "mutationDisposition" to "not_dispatched",
                ),
                message = error.message.orEmpty(),
            )
        }
        if (pinnedSession.session.authSessionId?.trim() != authority.expectedAuthSessionId) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "PATIENT_MUTATION_AUTHORITY_MISMATCH",
                details = mapOf(
                    "patientMutationStage" to "pre_dispatch",
                    "mutationDisposition" to "not_dispatched",
                ),
                message = "Patient mutation authentication session changed before request dispatch",
            )
        }
        return pinnedSession
    }

    private fun requirePatientMutationSessionCurrent(pinnedSession: PinnedAuthSession) {
        if (!isPinnedAuthSessionCurrent(pinnedSession.session)) {
            throw SmartHealthApiException(
                statusCode = 409,
                code = "PATIENT_MUTATION_RECONCILIATION_REQUIRED",
                details = mapOf(
                    "patientMutationStage" to "post_dispatch",
                    "mutationDisposition" to "unknown",
                    "replayPolicy" to "original_authority_exact_idempotency",
                ),
                message = "Patient mutation outcome requires reconciliation under the original session",
            )
        }
    }

    private fun parsePatientMutationReceipt(
        json: JSONObject,
        expectedIntent: PatientMutationIntent,
        expectedUserId: String,
        expectedWorkspaceId: String,
        expectedPatientId: String = "",
    ): PatientMutationReceipt {
        val userId = json.optString("userId").trim()
        val workspaceId = json.optString("workspaceId").trim()
        val patientId = json.optString("patientId").trim()
        val intent = PatientMutationIntent.fromWireValue(json.optString("intent"))
            ?: invalidPatientMutationReceipt("Missing or unsupported intent")
        val replayed = json.opt("replayed") as? Boolean
            ?: invalidPatientMutationReceipt("Missing replayed confirmation")
        val patient = json.optJSONObject("patient")?.let(::parsePatient)
        val deleted = when (expectedIntent) {
            PatientMutationIntent.Delete -> json.opt("deleted") as? Boolean
                ?: invalidPatientMutationReceipt("Missing delete confirmation")
            else -> false
        }
        val canonicalExpectedPatientId = expectedPatientId.trim()
        val confirmedPatientId = patient?.id?.trim().orEmpty()
        val patientPrincipals = patient?.let {
            setOf(
                it.ownerUserId.trim(),
                it.accountUserId.trim(),
                it.guardianUserId.trim(),
            ).filter(String::isNotBlank)
        }.orEmpty()
        val patientMatches = when (expectedIntent) {
            PatientMutationIntent.Create ->
                patient != null &&
                    patientId.isNotBlank() &&
                    patientId == confirmedPatientId
            PatientMutationIntent.Update ->
                patient != null &&
                    canonicalExpectedPatientId.isNotBlank() &&
                    patientId == canonicalExpectedPatientId &&
                    confirmedPatientId == canonicalExpectedPatientId
            PatientMutationIntent.Delete ->
                canonicalExpectedPatientId.isNotBlank() &&
                    patientId == canonicalExpectedPatientId &&
                    deleted
        }
        val ownerMatches = when (expectedIntent) {
            PatientMutationIntent.Delete -> true
            else ->
                patient?.organizationId?.trim() == expectedWorkspaceId.trim() &&
                    expectedUserId.trim() in patientPrincipals
        }
        if (
            intent != expectedIntent ||
            userId != expectedUserId.trim() ||
            workspaceId != expectedWorkspaceId.trim() ||
            !patientMatches ||
            !ownerMatches
        ) {
            invalidPatientMutationReceipt("Receipt identity does not match the requested mutation")
        }
        return PatientMutationReceipt(
            userId = userId,
            workspaceId = workspaceId,
            patientId = patientId,
            intent = intent,
            patient = patient,
            deleted = deleted,
            replayed = replayed,
        )
    }

    private fun invalidPatientMutationReceipt(reason: String): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = "PATIENT_MUTATION_RESPONSE_INVALID",
            details = mapOf("reason" to reason),
            message = "Patient mutation response could not be verified",
        )
    }

    private fun parseClinicalPatientList(json: JSONObject): ClinicalPatientList {
        val workspaceId = json.optString("workspaceId").trim()
        val patientJson = json.optJSONArray("patients")
            ?: invalidClinicalContract("PATIENT_LIST_RESPONSE_INVALID", "Missing patients")
        if (workspaceId.isBlank() || patientJson.length() > 5_000) {
            invalidClinicalContract(
                "PATIENT_LIST_RESPONSE_INVALID",
                "Patient list workspace or size is invalid",
            )
        }
        val patients = patientJson.orEmpty().map(::parsePatient)
        if (patients.any { it.id.isBlank() || it.name.isBlank() || it.scanCount < 0 }) {
            invalidClinicalContract(
                "PATIENT_LIST_RESPONSE_INVALID",
                "Patient list contains an invalid identity or count",
            )
        }
        return ClinicalPatientList(
            workspaceId = workspaceId,
            patients = patients,
        )
    }

    private fun parseClinicalAlertList(json: JSONObject): ClinicalAlertList {
        val workspaceId = json.optString("workspaceId").trim()
        val alertJson = json.optJSONArray("alerts")
            ?: invalidClinicalContract("ALERT_LIST_RESPONSE_INVALID", "Missing alerts")
        if (workspaceId.isBlank() || alertJson.length() > 200) {
            invalidClinicalContract(
                "ALERT_LIST_RESPONSE_INVALID",
                "Alert list workspace or size is invalid",
            )
        }
        val alerts = alertJson.orEmpty().map(::parseClinicalAlert)
        if (alerts.any { it.organizationId != workspaceId }) {
            invalidClinicalContract(
                "ALERT_LIST_RESPONSE_INVALID",
                "Alert list contains another workspace",
            )
        }
        return ClinicalAlertList(
            workspaceId = workspaceId,
            alerts = alerts,
        )
    }

    private fun parseClinicalReviewList(json: JSONObject): ClinicalReviewList {
        val workspaceId = json.optString("workspaceId").trim()
        val reviewJson = json.optJSONArray("reviews")
            ?: invalidClinicalContract("REVIEW_LIST_RESPONSE_INVALID", "Missing reviews")
        if (workspaceId.isBlank() || reviewJson.length() > 200) {
            invalidClinicalContract(
                "REVIEW_LIST_RESPONSE_INVALID",
                "Review list workspace or size is invalid",
            )
        }
        val reviews = reviewJson.orEmpty().map(::parseClinicalReview)
        if (
            reviews.any { it.organizationId != workspaceId } ||
            reviews.map(ClinicalReview::id).toSet().size != reviews.size ||
            reviews.map(ClinicalReview::scanId).toSet().size != reviews.size
        ) {
            invalidClinicalContract(
                "REVIEW_LIST_RESPONSE_INVALID",
                "Review list contains another workspace or duplicate identity",
            )
        }
        return ClinicalReviewList(workspaceId = workspaceId, reviews = reviews)
    }

    private fun parseClinicalReviewMutation(json: JSONObject): ClinicalReviewMutation {
        val workspaceId = json.optString("workspaceId").trim()
        val review = json.optJSONObject("review")?.let(::parseClinicalReview)
            ?: invalidClinicalContract("REVIEW_MUTATION_RESPONSE_INVALID", "Missing review")
        if (workspaceId.isBlank() || review.organizationId != workspaceId) {
            invalidClinicalContract(
                "REVIEW_MUTATION_RESPONSE_INVALID",
                "Review mutation workspace is invalid",
            )
        }
        return ClinicalReviewMutation(workspaceId = workspaceId, review = review)
    }

    private fun parseClinicalReview(json: JSONObject): ClinicalReview {
        val id = json.optString("id").trim()
        val scanId = json.optString("scanId").trim()
        val organizationId = json.optString("organizationId").trim()
        val status = ClinicalReviewStatus.fromWireValue(json.optString("status"))
        val decisionText = json.optString("decision").trim()
        val decision = decisionText.takeIf(String::isNotBlank)
            ?.let(ClinicalReviewDecision::fromWireValue)
        val note = json.optString("note").trim()
        val reviewerUserId = json.optString("reviewerUserId").trim()
        val reviewedAt = json.optString("reviewedAt").trim()
        val version = json.optInt("version")
        val scanStatus = json.optString("scanStatus").trim()
        val scanCreatedAt = json.optString("scanCreatedAt").trim()
        val pendingInvalid = status == ClinicalReviewStatus.Pending &&
            (decisionText.isNotBlank() || reviewerUserId.isNotBlank() || reviewedAt.isNotBlank())
        val reviewedInvalid = status == ClinicalReviewStatus.Reviewed &&
            (decision == null || reviewerUserId.isBlank() || reviewedAt.isBlank() ||
                (decision != ClinicalReviewDecision.Accepted && note.isBlank()))
        if (
            id.isBlank() || scanId.isBlank() || organizationId.isBlank() || status == null ||
            decisionText.isNotBlank() && decision == null || version < 1 ||
            scanStatus !in setOf("completed", "needs_review") || scanCreatedAt.isBlank() ||
            pendingInvalid || reviewedInvalid
        ) {
            invalidClinicalContract(
                "REVIEW_RESPONSE_INVALID",
                "Clinical review identity, state, or decision is invalid",
            )
        }
        return ClinicalReview(
            id = id,
            scanId = scanId,
            organizationId = organizationId,
            patientId = json.optString("patientId"),
            deviceId = json.optString("deviceId"),
            status = status,
            decision = decision,
            note = note,
            reviewerUserId = reviewerUserId,
            reviewedAt = reviewedAt,
            version = version,
            scanStatus = scanStatus,
            scanCreatedAt = scanCreatedAt,
            createdAt = json.optString("createdAt"),
            updatedAt = json.optString("updatedAt"),
        )
    }

    private fun parseClinicalAlertMutation(json: JSONObject): ClinicalAlertMutation {
        val workspaceId = json.optString("workspaceId").trim()
        val alert = json.optJSONObject("alert")?.let(::parseClinicalAlert)
            ?: invalidClinicalContract("ALERT_MUTATION_RESPONSE_INVALID", "Missing alert")
        if (workspaceId.isBlank() || alert.organizationId != workspaceId) {
            invalidClinicalContract(
                "ALERT_MUTATION_RESPONSE_INVALID",
                "Alert mutation workspace is invalid",
            )
        }
        return ClinicalAlertMutation(
            workspaceId = workspaceId,
            alert = alert,
        )
    }

    private fun parseClinicalAlert(json: JSONObject): ClinicalAlert {
        val id = json.optString("id").trim()
        val organizationId = json.optString("organizationId").trim()
        val sourceType = json.optString("sourceType").trim().lowercase()
        val sourceId = json.optString("sourceId").trim()
        val status = ClinicalAlertStatus.fromWireValue(json.optString("status"))
        val severity = json.optString("severity").trim()
        val title = json.optString("title").trim()
        val message = json.optString("message").trim()
        val version = json.optInt("version")
        if (
            id.isBlank() ||
            organizationId.isBlank() ||
            sourceType !in setOf("device", "scan") ||
            sourceId.isBlank() ||
            status == null ||
            severity.isBlank() ||
            title.isBlank() ||
            message.isBlank() ||
            version < 1
        ) {
            invalidClinicalContract(
                "ALERT_RESPONSE_INVALID",
                "Clinical alert identity, state, or content is invalid",
            )
        }
        return ClinicalAlert(
            id = id,
            organizationId = organizationId,
            sourceType = sourceType,
            sourceId = sourceId,
            dedupeKey = json.optString("dedupeKey"),
            occurrenceNumber = json.optInt("occurrenceNumber", 1).coerceAtLeast(1),
            previousAlertId = json.optString("previousAlertId"),
            occurredAt = json.optString("occurredAt"),
            status = status,
            severity = severity,
            title = title,
            message = message,
            patientId = json.optString("patientId"),
            deviceId = json.optString("deviceId"),
            scanId = json.optString("scanId"),
            acknowledgedByUserId = json.optString("acknowledgedByUserId"),
            acknowledgedAt = json.optString("acknowledgedAt"),
            acknowledgementNote = json.optString("acknowledgementNote"),
            resolvedByUserId = json.optString("resolvedByUserId"),
            resolvedAt = json.optString("resolvedAt"),
            resolutionNote = json.optString("resolutionNote"),
            version = version,
            createdAt = json.optString("createdAt"),
            updatedAt = json.optString("updatedAt"),
        )
    }

    private fun invalidClinicalContract(code: String, reason: String): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = code,
            message = reason,
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
            organizationId = json.optString("organizationId"),
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

    private fun parseScanWaveform(
        json: JSONObject,
        expectedScanId: String,
    ): ScanWaveform {
        val scanId = json.optString("scanId")
        val sampleRate = json.optInt("sampleRate")
        val generatedAt = json.optString("generatedAt")
        val pointJson = json.optJSONArray("points")
            ?: invalidScanArtifactContract("Missing waveform points")
        val points = buildList {
            for (index in 0 until pointJson.length()) {
                val raw = pointJson.opt(index)
                val value = (raw as? Number)?.toFloat()
                    ?: invalidScanArtifactContract("Waveform point is not numeric")
                if (!value.isFinite() || value !in 0f..1f) {
                    invalidScanArtifactContract("Waveform point is outside the supported range")
                }
                add(value)
            }
        }
        if (
            scanId != expectedScanId ||
            sampleRate !in 1..192_000 ||
            points.size !in 1..MAX_SCAN_WAVEFORM_POINTS ||
            generatedAt.isBlank()
        ) {
            invalidScanArtifactContract("Waveform identity or metadata is invalid")
        }
        return ScanWaveform(
            scanId = scanId,
            sampleRate = sampleRate,
            points = points,
            generatedAt = generatedAt,
        )
    }

    private fun parseScanAudioAccess(json: JSONObject): ScanAudioAccess {
        val url = json.optString("url").trim()
        val expiresInSeconds = json.optInt("expiresInSeconds")
        val contentType = json.optString("contentType", "audio/wav")
            .substringBefore(';')
            .lowercase()
        val fileName = sanitizeAudioFileName(json.optString("fileName"))
        if (
            url.isBlank() ||
            expiresInSeconds !in 1..3_600 ||
            contentType !in ALLOWED_SCAN_AUDIO_CONTENT_TYPES
        ) {
            invalidScanArtifactContract("Audio access response is invalid")
        }
        return ScanAudioAccess(
            url = url,
            expiresInSeconds = expiresInSeconds,
            contentType = contentType,
            fileName = fileName,
        )
    }

    private fun resolveScanAudioPlaybackSource(
        access: ScanAudioAccess,
    ): ScanAudioPlaybackSource {
        val apiUrl = runCatching { baseUrl.toHttpUrl() }
            .getOrElse { invalidScanArtifactContract("Backend URL is invalid") }
        val resolved = apiUrl.resolve(access.url)
            ?: invalidScanArtifactContract("Audio access URL is invalid")
        val sameOrigin = resolved.scheme == apiUrl.scheme &&
            resolved.host == apiUrl.host &&
            resolved.port == apiUrl.port
        if (!sameOrigin && resolved.scheme != "https") {
            throw IOException("Cross-origin audio access requires HTTPS")
        }
        val session = authSessionSnapshot
        val headers = if (sameOrigin) {
            buildMap {
                session.bearerToken?.takeIf(String::isNotBlank)?.let {
                    put("Authorization", "Bearer $it")
                }
                twoFactorToken?.takeIf(String::isNotBlank)?.let {
                    put("X-Shcare-2FA-Token", it)
                }
            }
        } else {
            emptyMap()
        }
        return ScanAudioPlaybackSource(
            url = resolved.toString(),
            headers = headers,
            expiresInSeconds = access.expiresInSeconds,
            contentType = access.contentType,
            fileName = access.fileName,
            authorizationEpoch = session.epoch.takeIf { sameOrigin },
        )
    }

    private fun invalidScanArtifactContract(reason: String): Nothing {
        throw SmartHealthApiException(
            statusCode = 502,
            code = "SCAN_ARTIFACT_CONTRACT_INVALID",
            message = reason,
        )
    }

    private fun sanitizeAudioFileName(raw: String): String {
        val normalized = raw
            .trim()
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .trim('.', '_')
            .take(120)
        val withExtension = when {
            normalized.isBlank() -> "shcare-record.wav"
            normalized.endsWith(".wav", ignoreCase = true) -> normalized
            else -> "$normalized.wav"
        }
        return withExtension
    }

    private fun exportContentType(format: String): String = when (format.lowercase()) {
        "json" -> "application/json"
        "csv" -> "text/csv"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "pdf" -> "application/pdf"
        else -> throw IOException("Unsupported export format")
    }

    private fun sanitizeExportFileName(
        contentDisposition: String,
        exportJob: ExportJob,
    ): String {
        val headerName = Regex("""filename="?([^";]+)"?""", RegexOption.IGNORE_CASE)
            .find(contentDisposition)
            ?.groupValues
            ?.getOrNull(1)
            .orEmpty()
        val extension = exportJob.format.lowercase()
            .takeIf { it in setOf("json", "csv", "xlsx", "pdf") }
            ?: "bin"
        val normalized = headerName
            .trim()
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .trim('.', '_')
            .take(160)
        return when {
            normalized.isBlank() -> "shcare-export-${exportJob.id}.$extension"
            normalized.endsWith(".$extension", ignoreCase = true) -> normalized
            else -> "$normalized.$extension"
        }
    }

    private fun ByteArray.toHex(): String =
        joinToString(separator = "") { byte -> "%02x".format(byte) }

    private fun moveDownloadedFile(partFile: File, destination: File) {
        runCatching {
            Files.move(
                partFile.toPath(),
                destination.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING,
            )
        }.getOrElse {
            Files.move(
                partFile.toPath(),
                destination.toPath(),
                StandardCopyOption.REPLACE_EXISTING,
            )
        }
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

    private fun JSONObject.exactStringOrNull(name: String): String? =
        (opt(name) as? String)?.trim()

    private fun JSONObject.exactIntOrNull(name: String): Int? {
        val number = opt(name) as? Number ?: return null
        val value = number.toDouble()
        if (
            !value.isFinite() ||
            value % 1.0 != 0.0 ||
            value < Int.MIN_VALUE.toDouble() ||
            value > Int.MAX_VALUE.toDouble()
        ) {
            return null
        }
        return value.toInt()
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
        private val ACCOUNT_PROFILE_MUTATION_FIELDS = setOf(
            "address",
            "department",
            "hospital",
            "license",
            "name",
            "specialty",
        )
        private val ACCOUNT_PROFILE_RECEIPT_KEYS = setOf(
            "userId",
            "intent",
            "changedFields",
            "user",
            "replayed",
        )
        private val ACCOUNT_PROFILE_USER_RECEIPT_KEYS = setOf(
            "id",
            "name",
            "title",
            "phone",
            "license",
            "hospital",
            "department",
            "specialty",
            "address",
            "organizationId",
            "updatedAt",
        )
        private val AVATAR_CONTENT_TYPES = setOf("image/jpeg", "image/png", "image/webp")
        private val AVATAR_SHA256_REGEX = Regex("^[a-f0-9]{64}$")
        private val AVATAR_UPLOAD_RECEIPT_KEYS = setOf(
            "avatar",
            "cleanup",
            "operationId",
            "replayed",
        )
        private val AVATAR_FILE_RECEIPT_KEYS = setOf(
            "fileId",
            "ownerUserId",
            "name",
            "contentType",
            "byteSize",
            "sha256",
            "downloadUrl",
            "uploadedAt",
        )
        private val AVATAR_DELETE_RECEIPT_KEYS = setOf(
            "deleted",
            "avatar",
            "cleanup",
            "operationId",
            "replayed",
        )
        private val AVATAR_DELETED_FILE_RECEIPT_KEYS = setOf(
            "fileId",
            "ownerUserId",
            "deletedAt",
        )
        private val AVATAR_CLEANUP_RECEIPT_KEYS = setOf("status", "previousFileId")
        private val AVATAR_CLEANUP_STATUS_KEYS = setOf(
            "userId",
            "workspaceId",
            "status",
            "operationId",
            "action",
            "previousFileId",
            "attempts",
            "lastErrorCode",
            "updatedAt",
            "manualSupportRequired",
        )
        private val AVATAR_CLEANUP_ERROR_CODE_REGEX = Regex("^[A-Z0-9_]*$")
        private val TWO_FACTOR_OTP_REGEX = Regex("^\\d{6}$")
        private val TWO_FACTOR_RECOVERY_CODE_REGEX = Regex("^[A-F0-9]{6}-[A-F0-9]{6}$")
        private val TWO_FACTOR_TOKEN_REGEX = Regex("^[A-Za-z0-9_-]+$")
        private val TWO_FACTOR_MANUAL_KEY_REGEX = Regex("^[A-Z2-7]{16,128}$")
        private val TWO_FACTOR_STATE_KEYS = setOf(
            "enabled",
            "method",
            "enrollmentPending",
        )
        private val TWO_FACTOR_ENROLLMENT_START_RECEIPT_KEYS = setOf(
            "userId",
            "twoFactor",
            "enrollment",
            "replayed",
            "superseded",
        )
        private val TWO_FACTOR_ENROLLMENT_KEYS = setOf(
            "id",
            "method",
            "manualKey",
            "otpauthUri",
            "expiresAt",
        )
        private val TWO_FACTOR_VERIFICATION_RECEIPT_KEYS = setOf(
            "userId",
            "enrollmentId",
            "twoFactor",
            "recoveryCodes",
            "recoveryDelivery",
            "recoveryAckToken",
            "replayed",
        )
        private val TWO_FACTOR_ACK_RECEIPT_KEYS = setOf(
            "userId",
            "enrollmentId",
            "twoFactor",
            "recoveryDelivery",
            "twoFactorToken",
            "tokenExpiresAt",
            "replayed",
        )
        private val TWO_FACTOR_PENDING_DELIVERY_KEYS = setOf(
            "id",
            "expiresAt",
            "acknowledged",
        )
        private val TWO_FACTOR_ACKNOWLEDGED_DELIVERY_KEYS = setOf(
            "id",
            "expiresAt",
            "acknowledged",
            "acknowledgedAt",
        )
        private val AUTHORITY_ROLES = setOf(
            "admin",
            "platform_admin",
            "workspace_owner",
            "workspace_admin",
            "doctor",
            "patient",
            "nurse",
            "technician",
            "billing",
            "viewer",
        )
        private const val MAX_AVATAR_BYTES = 2 * 1024 * 1024
        private const val PATIENT_DASHBOARD_PROTOCOL_VERSION = 1
        private const val PATIENT_DASHBOARD_RECENT_SCAN_LIMIT = 5
        private val PATIENT_DASHBOARD_CANONICAL_ID_REGEX =
            Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$")
        private val PATIENT_DASHBOARD_KEYS = setOf(
            "protocolVersion",
            "generatedAt",
            "userId",
            "workspaceId",
            "activePatientId",
            "patient",
            "sections",
            "recentScans",
            "device",
        )
        private val PATIENT_DASHBOARD_PATIENT_KEYS = setOf(
            "id",
            "patientCode",
            "name",
            "profileType",
            "relationship",
            "ownerUserId",
            "accountUserId",
            "guardianUserId",
            "organizationId",
        )
        private val PATIENT_DASHBOARD_PATIENT_REQUIRED_KEYS = setOf(
            "id",
            "name",
            "organizationId",
        )
        private val PATIENT_DASHBOARD_SECTION_KEYS = setOf("scans", "device")
        private val PATIENT_DASHBOARD_SCAN_KEYS = setOf(
            "id",
            "patientId",
            "organizationId",
            "status",
            "mode",
            "startedAt",
            "createdAt",
            "updatedAt",
        )
        private val PATIENT_DASHBOARD_SCAN_REQUIRED_KEYS = setOf(
            "id",
            "patientId",
            "organizationId",
        )
        private val PATIENT_DASHBOARD_DEVICE_KEYS = setOf(
            "id",
            "name",
            "organizationId",
            "ownerUserId",
            "assignedPatientId",
            "battery",
            "signal",
            "online",
            "firmwareVersion",
            "lastSeenAt",
        )
        private val PATIENT_DASHBOARD_DEVICE_REQUIRED_KEYS = setOf(
            "id",
            "organizationId",
            "ownerUserId",
            "assignedPatientId",
            "online",
        )
        private const val MAX_SCAN_WAVEFORM_POINTS = 512
        const val MAX_SCAN_AUDIO_DOWNLOAD_BYTES = 40L * 1024L * 1024L
        const val MAX_EXPORT_DOWNLOAD_BYTES = 100L * 1024L * 1024L
        private const val DEFAULT_DOWNLOAD_BUFFER_BYTES = 16 * 1024
        private val SHA256_HEX_REGEX = Regex("^[0-9a-f]{64}$")
        private val ALLOWED_SCAN_AUDIO_CONTENT_TYPES = setOf(
            "audio/wav",
            "audio/x-wav",
            "application/octet-stream",
        )
        val sharedClient: OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}

private data class AuthSessionSnapshot(
    val bearerToken: String? = null,
    val authSessionId: String? = null,
    val epoch: Long = 0L,
)

private data class PatientMutationAuthorityHeaders(
    val expectedUserId: String,
    val expectedWorkspaceId: String,
    val expectedAuthSessionId: String,
)

private data class PinnedAuthSession(
    val session: AuthSessionSnapshot,
    val twoFactorToken: String?,
)

object SmartHealthRepository {
    val api = SmartHealthApi()
}
