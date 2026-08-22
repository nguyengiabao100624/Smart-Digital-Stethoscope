package com.example.smart_health_android.navigation

import com.example.smart_health_android.data.FirebaseOwnerBinding
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Transient, owner-bound input captured from the exported launcher activity.
 *
 * The URI remains untrusted until [ShcareExternalDeepLinkContract.evaluate] maps it to a typed
 * route and re-checks the current backend-confirmed authority. The request is never persisted.
 */
data class ShcareExternalDeepLinkLaunchRequest(
    val rawUri: String,
    val expectedFirebaseOwner: FirebaseOwnerBinding,
    val expectedUserId: String,
    val expectedWorkspaceId: String,
    val expectedAuthorityEpoch: Long?,
)

enum class ExternalMobileDeepLinkDenialReason {
    InvalidUri,
    UnsupportedOrigin,
    UnsupportedDestination,
    AuthenticationRequired,
    AuthorityReauthorizing,
    OwnerMismatch,
    UserMismatch,
    WorkspaceMismatch,
    StaleAuthority,
    InvalidAuthority,
    RoleExperienceMismatch,
    CapabilityMissing,
    ExperienceMismatch,
}

sealed interface ExternalMobileDeepLinkDecision {
    data class Allowed(
        val contract: ShcareMobileRoute,
        val destinationRoute: String,
    ) : ExternalMobileDeepLinkDecision

    data class Denied(
        val reason: ExternalMobileDeepLinkDenialReason,
    ) : ExternalMobileDeepLinkDecision
}

/**
 * Canonical external-link boundary for Android.
 *
 * Only explicitly registered Shcare origins and path shapes can become navigation commands.
 * Role, experience, capability, Firebase owner, workspace and authority epoch are verified again
 * immediately before navigation; URI query parameters can never grant access.
 */
object ShcareExternalDeepLinkContract {
    fun bind(
        rawUri: String?,
        currentAuthority: MobileSessionAuthority?,
        currentFirebaseOwner: FirebaseOwnerBinding?,
    ): ShcareExternalDeepLinkLaunchRequest? {
        val normalizedUri = rawUri?.trim().orEmpty()
        val normalizedFirebaseOwner = currentFirebaseOwner?.normalized() ?: return null
        if (normalizedUri.isEmpty() || normalizedUri.length > MAX_URI_LENGTH) return null
        if (
            currentAuthority != null &&
            currentAuthority.firebaseUserId.trim() != normalizedFirebaseOwner.firebaseUserId
        ) {
            return null
        }

        return ShcareExternalDeepLinkLaunchRequest(
            rawUri = normalizedUri,
            expectedFirebaseOwner = normalizedFirebaseOwner,
            expectedUserId = currentAuthority?.userId?.trim().orEmpty(),
            expectedWorkspaceId = currentAuthority?.workspaceId?.trim().orEmpty(),
            expectedAuthorityEpoch = currentAuthority?.epoch,
        )
    }

    fun evaluate(
        request: ShcareExternalDeepLinkLaunchRequest,
        authorityState: MobileSessionAuthorityState,
        currentFirebaseOwner: FirebaseOwnerBinding?,
    ): ExternalMobileDeepLinkDecision {
        val expectedFirebaseOwner = request.expectedFirebaseOwner.normalized()
        if (currentFirebaseOwner?.normalized() != expectedFirebaseOwner) {
            return denied(ExternalMobileDeepLinkDenialReason.OwnerMismatch)
        }

        val authority = authorityState.authority
            ?: return denied(ExternalMobileDeepLinkDenialReason.AuthenticationRequired)
        if (authorityState.reauthorizing) {
            return denied(ExternalMobileDeepLinkDenialReason.AuthorityReauthorizing)
        }
        if (authority.firebaseUserId.trim() != expectedFirebaseOwner.firebaseUserId) {
            return denied(ExternalMobileDeepLinkDenialReason.OwnerMismatch)
        }
        if (
            request.expectedUserId.isNotBlank() &&
            authority.userId.trim() != request.expectedUserId
        ) {
            return denied(ExternalMobileDeepLinkDenialReason.UserMismatch)
        }
        if (
            request.expectedWorkspaceId.isNotBlank() &&
            authority.workspaceId.trim() != request.expectedWorkspaceId
        ) {
            return denied(ExternalMobileDeepLinkDenialReason.WorkspaceMismatch)
        }
        if (
            authorityState.epoch != authority.epoch ||
            request.expectedAuthorityEpoch?.let { expectedEpoch ->
                expectedEpoch != authority.epoch || expectedEpoch != authorityState.epoch
            } == true
        ) {
            return denied(ExternalMobileDeepLinkDenialReason.StaleAuthority)
        }
        if (
            authority.userId.isBlank() ||
            authority.workspaceId.isBlank() ||
            authority.epoch < 0L
        ) {
            return denied(ExternalMobileDeepLinkDenialReason.InvalidAuthority)
        }
        if (!authority.hasCoherentRoleExperience()) {
            return denied(ExternalMobileDeepLinkDenialReason.RoleExperienceMismatch)
        }

        val parsedDestination = when (val parsed = parse(request.rawUri)) {
            is ParsedExternalDestination.Accepted -> parsed
            is ParsedExternalDestination.Rejected -> return denied(parsed.reason)
        }
        val context = authority.toRouteAccessContext()
        return when (
            val access = ShcareMobileRouteContract.evaluate(
                contract = parsedDestination.contract,
                context = context,
                expectedAuthorityEpoch = authorityState.epoch,
            )
        ) {
            is MobileRouteAccessDecision.Allowed -> ExternalMobileDeepLinkDecision.Allowed(
                contract = access.contract,
                destinationRoute = parsedDestination.destinationRoute,
            )

            is MobileRouteAccessDecision.Denied -> denied(
                when (access.reason) {
                    MobileRouteDenialReason.UnknownRoute ->
                        ExternalMobileDeepLinkDenialReason.UnsupportedDestination
                    MobileRouteDenialReason.AuthenticationRequired ->
                        ExternalMobileDeepLinkDenialReason.AuthenticationRequired
                    MobileRouteDenialReason.StaleAuthority ->
                        ExternalMobileDeepLinkDenialReason.StaleAuthority
                    MobileRouteDenialReason.CapabilityMissing ->
                        ExternalMobileDeepLinkDenialReason.CapabilityMissing
                    MobileRouteDenialReason.ExperienceMismatch ->
                        ExternalMobileDeepLinkDenialReason.ExperienceMismatch
                },
            )
        }
    }

    private fun parse(rawUri: String): ParsedExternalDestination {
        val uri = runCatching { URI(rawUri) }.getOrNull()
            ?: return rejected(ExternalMobileDeepLinkDenialReason.InvalidUri)
        if (
            !uri.isAbsolute ||
            uri.rawUserInfo != null ||
            uri.rawQuery != null ||
            uri.rawFragment != null
        ) {
            return rejected(ExternalMobileDeepLinkDenialReason.InvalidUri)
        }

        val scheme = uri.scheme.orEmpty().lowercase()
        val host = uri.host.orEmpty().lowercase()
        val externalPath = when {
            scheme == HTTPS_SCHEME &&
                host == HTTPS_HOST &&
                (uri.port == -1 || uri.port == HTTPS_PORT) &&
                uri.rawPath.orEmpty().startsWith(HTTPS_PATH_PREFIX) -> {
                uri.rawPath.orEmpty().removePrefix(HTTPS_PATH_PREFIX)
            }

            scheme == APP_SCHEME &&
                host == APP_HOST &&
                uri.port == -1 -> {
                uri.rawPath.orEmpty().removePrefix("/")
            }

            else -> return rejected(ExternalMobileDeepLinkDenialReason.UnsupportedOrigin)
        }

        val segments = externalPath
            .split('/')
            .filter(String::isNotBlank)
            .map { segment -> decodeSegment(segment) ?: return rejected(
                ExternalMobileDeepLinkDenialReason.InvalidUri,
            ) }

        return when {
            segments == listOf("notifications") -> accepted(
                ShcareMobileRoute.Notifications,
                ShcareMobileRoute.Notifications.routePattern,
            )
            segments == listOf("records") -> accepted(
                ShcareMobileRoute.Records,
                ShcareMobileRoute.Records.routePattern,
            )
            segments.size == 2 && segments.first() == "records" -> {
                val identifier = segments[1].canonicalIdentifier()
                    ?: return rejected(ExternalMobileDeepLinkDenialReason.InvalidUri)
                accepted(
                    ShcareMobileRoute.RecordDetail,
                    "record-detail/${identifier.encodeRouteValue()}",
                )
            }
            segments == listOf("appointments") -> accepted(
                ShcareMobileRoute.Appointments,
                "appointments",
            )
            segments.size == 2 && segments.first() == "appointments" -> {
                val identifier = segments[1].canonicalIdentifier()
                    ?: return rejected(ExternalMobileDeepLinkDenialReason.InvalidUri)
                accepted(
                    ShcareMobileRoute.Appointments,
                    "appointments?appointmentId=${identifier.encodeRouteValue()}",
                )
            }
            segments == listOf("monitoring") -> accepted(
                ShcareMobileRoute.Monitoring,
                "monitoring",
            )
            segments.size == 2 && segments.first() == "monitoring" -> {
                val identifier = segments[1].canonicalIdentifier()
                    ?: return rejected(ExternalMobileDeepLinkDenialReason.InvalidUri)
                accepted(
                    ShcareMobileRoute.Monitoring,
                    "monitoring?scanId=${identifier.encodeRouteValue()}",
                )
            }
            segments == listOf("devices") -> accepted(
                ShcareMobileRoute.BluetoothSettings,
                ShcareMobileRoute.BluetoothSettings.routePattern,
            )
            segments == listOf("settings") -> accepted(
                ShcareMobileRoute.Settings,
                ShcareMobileRoute.Settings.routePattern,
            )
            segments == listOf("patients") -> accepted(
                ShcareMobileRoute.ClinicalPatients,
                ShcareMobileRoute.ClinicalPatients.routePattern,
            )
            segments == listOf("alerts") -> accepted(
                ShcareMobileRoute.ClinicalAlerts,
                ShcareMobileRoute.ClinicalAlerts.routePattern,
            )
            else -> rejected(ExternalMobileDeepLinkDenialReason.UnsupportedDestination)
        }
    }

    private fun MobileSessionAuthority.hasCoherentRoleExperience(): Boolean {
        return role.trim().lowercase().toMobileExperienceOrNull() == experience
    }

    private fun FirebaseOwnerBinding.normalized(): FirebaseOwnerBinding = copy(
        firebaseUserId = firebaseUserId.trim(),
        email = email.trim().lowercase(),
    )

    private fun decodeSegment(rawSegment: String): String? = runCatching {
        URLDecoder.decode(rawSegment, StandardCharsets.UTF_8.name())
    }.getOrNull()

    private fun String.canonicalIdentifier(): String? =
        trim().takeIf { IDENTIFIER_PATTERN.matches(it) }

    private fun String.encodeRouteValue(): String = URLEncoder
        .encode(this, StandardCharsets.UTF_8.name())
        .replace("+", "%20")

    private fun accepted(
        contract: ShcareMobileRoute,
        destinationRoute: String,
    ) = ParsedExternalDestination.Accepted(contract, destinationRoute)

    private fun rejected(reason: ExternalMobileDeepLinkDenialReason) =
        ParsedExternalDestination.Rejected(reason)

    private fun denied(reason: ExternalMobileDeepLinkDenialReason) =
        ExternalMobileDeepLinkDecision.Denied(reason)

    private sealed interface ParsedExternalDestination {
        data class Accepted(
            val contract: ShcareMobileRoute,
            val destinationRoute: String,
        ) : ParsedExternalDestination

        data class Rejected(
            val reason: ExternalMobileDeepLinkDenialReason,
        ) : ParsedExternalDestination
    }

    private val IDENTIFIER_PATTERN = Regex("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
    private const val HTTPS_SCHEME = "https"
    private const val HTTPS_HOST = "shcare.web.app"
    private const val HTTPS_PORT = 443
    private const val HTTPS_PATH_PREFIX = "/app/"
    private const val APP_SCHEME = "shcare"
    private const val APP_HOST = "app"
    private const val MAX_URI_LENGTH = 2_048
}
