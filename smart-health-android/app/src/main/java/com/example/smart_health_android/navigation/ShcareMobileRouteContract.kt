package com.example.smart_health_android.navigation

/**
 * The mobile navigation contract intentionally contains no Compose or Web dependencies.
 *
 * Backend capabilities remain the source of truth. Role names are not promoted into
 * capabilities here, and callers must never manufacture a successful access decision.
 */
data class MobileRouteAccessContext(
    val userId: String,
    val workspaceId: String,
    val role: String,
    val capabilities: Set<String>,
    val experience: MobileExperience,
    val authorityEpoch: Long,
) {
    init {
        require(userId.isNotBlank()) { "A route authority must have a backend user id." }
        require(authorityEpoch >= 0L) { "The authority epoch cannot be negative." }
    }
}

fun MobileSessionAuthority.toRouteAccessContext(): MobileRouteAccessContext =
    MobileRouteAccessContext(
        userId = userId,
        workspaceId = workspaceId,
        role = role,
        capabilities = capabilities,
        experience = experience,
        authorityEpoch = epoch,
    )

enum class MobileRouteSessionRequirement {
    PublicAuth,
    Authenticated,
}

enum class MobileRouteDenialReason {
    UnknownRoute,
    AuthenticationRequired,
    StaleAuthority,
    CapabilityMissing,
    ExperienceMismatch,
}

sealed interface MobileRouteAccessDecision {
    data class Allowed(
        val contract: ShcareMobileRoute,
    ) : MobileRouteAccessDecision

    data class Denied(
        val reason: MobileRouteDenialReason,
        val contract: ShcareMobileRoute? = null,
    ) : MobileRouteAccessDecision
}

/**
 * Typed registry for every route currently registered by AppNavGraph.
 *
 * [anyOfCapabilities] is intentionally an any-of set, matching the backend capability
 * contract. An empty set means that an authenticated backend identity is sufficient.
 */
enum class ShcareMobileRoute(
    val routePattern: String,
    val testTag: String,
    val sessionRequirement: MobileRouteSessionRequirement,
    val anyOfCapabilities: Set<String> = emptySet(),
    val allowedExperiences: Set<MobileExperience> = emptySet(),
) {
    Splash(
        routePattern = "splash",
        testTag = "route.splash",
        sessionRequirement = MobileRouteSessionRequirement.PublicAuth,
    ),
    Login(
        routePattern = "login",
        testTag = "route.login",
        sessionRequirement = MobileRouteSessionRequirement.PublicAuth,
    ),
    SignUp(
        routePattern = "sign-up",
        testTag = "route.sign-up",
        sessionRequirement = MobileRouteSessionRequirement.PublicAuth,
    ),
    VerifyEmail(
        routePattern = "verify-email?accountType={accountType}",
        testTag = "route.verify-email",
        sessionRequirement = MobileRouteSessionRequirement.PublicAuth,
    ),
    DoctorApprovalPending(
        routePattern = "doctor-approval-pending",
        testTag = "route.doctor-approval-pending",
        sessionRequirement = MobileRouteSessionRequirement.PublicAuth,
    ),
    ForgotPassword(
        routePattern = "forgot-password",
        testTag = "route.forgot-password",
        sessionRequirement = MobileRouteSessionRequirement.PublicAuth,
    ),
    ClinicalDashboard(
        routePattern = "dashboard",
        testTag = "route.clinical-dashboard",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Dashboard,
        allowedExperiences = setOf(MobileExperience.Clinical),
    ),
    ClinicalPatients(
        routePattern = "clinical-patients",
        testTag = "route.clinical-patients",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Patients,
        allowedExperiences = setOf(MobileExperience.Clinical),
    ),
    ClinicalAlerts(
        routePattern = "clinical-alerts",
        testTag = "route.clinical-alerts",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Alerts,
        allowedExperiences = setOf(MobileExperience.Clinical),
    ),
    ClinicalReviews(
        routePattern = "clinical-alerts/reviews",
        testTag = "route.clinical-reviews",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Reviews,
        allowedExperiences = setOf(MobileExperience.Clinical),
    ),
    PatientDashboard(
        routePattern = "patient-dashboard",
        testTag = "route.patient-dashboard",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Dashboard,
        allowedExperiences = setOf(MobileExperience.Patient),
    ),
    Notifications(
        routePattern = "notifications",
        testTag = "route.notifications",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    Appointments(
        routePattern = "appointments?appointmentId={appointmentId}",
        testTag = "route.appointments",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Appointments,
    ),
    NewScan(
        routePattern = "new-scan",
        testTag = "route.new-scan",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.ScanManage,
    ),
    Monitoring(
        routePattern = "monitoring?scanId={scanId}",
        testTag = "route.monitoring",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Live,
    ),
    DevicePairing(
        routePattern = "device-pairing?returnRoute={returnRoute}",
        testTag = "route.device-pairing",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.DeviceManage,
    ),
    LegacyBluetoothPairing(
        routePattern = "bluetooth?returnRoute={returnRoute}",
        testTag = "route.legacy-bluetooth-pairing",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.DeviceManage,
    ),
    ConnectionSuccess(
        routePattern = "connection-success/{deviceName}?returnRoute={returnRoute}",
        testTag = "route.connection-success",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.DeviceManage,
    ),
    Records(
        routePattern = "records",
        testTag = "route.records",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Scans,
    ),
    RecordDetail(
        routePattern = "record-detail/{recordId}",
        testTag = "route.record-detail",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Scans,
    ),
    AiAssistant(
        routePattern = "ai-assistant",
        testTag = "route.ai-assistant",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    Settings(
        routePattern = "settings",
        testTag = "route.settings",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    WorkspaceSwitcher(
        routePattern = "workspace-switcher",
        testTag = "route.workspace-switcher",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    Profile(
        routePattern = "profile",
        testTag = "route.profile",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    FamilyProfiles(
        routePattern = "family-profiles",
        testTag = "route.family-profiles",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.PersonalProfiles,
        allowedExperiences = setOf(MobileExperience.Patient),
    ),
    VerifyPhoneSettings(
        routePattern = "verify-phone-settings",
        testTag = "route.verify-phone-settings",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    ReVerifyContact(
        routePattern = "re-verify/{type}",
        testTag = "route.re-verify-contact",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    Privacy(
        routePattern = "privacy",
        testTag = "route.privacy",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    StethoscopeSettings(
        routePattern = "stethoscope-settings",
        testTag = "route.stethoscope-settings",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.DeviceManage,
    ),
    AiCalibration(
        routePattern = "ai-calibration",
        testTag = "route.ai-calibration",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        allowedExperiences = setOf(MobileExperience.Clinical),
    ),
    DataStorage(
        routePattern = "data-storage",
        testTag = "route.data-storage",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.StorageRead,
    ),
    NotificationSettings(
        routePattern = "notification-settings",
        testTag = "route.notification-settings",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    ChangePassword(
        routePattern = "change-password",
        testTag = "route.change-password",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    DataAccess(
        routePattern = "data-access",
        testTag = "route.data-access",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.Consent,
    ),
    AccessLog(
        routePattern = "access-log",
        testTag = "route.access-log",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
    ),
    BluetoothSettings(
        routePattern = "bluetooth-settings",
        testTag = "route.bluetooth-settings",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.DeviceManage,
    ),
    ExportData(
        routePattern = "export-data",
        testTag = "route.export-data",
        sessionRequirement = MobileRouteSessionRequirement.Authenticated,
        anyOfCapabilities = MobileRouteCapabilities.DataExport,
    ),
    ;

    val pathPattern: String
        get() = routePattern.substringBefore('?')

    fun canOpen(context: MobileRouteAccessContext?): Boolean =
        ShcareMobileRouteContract.evaluate(this, context) is MobileRouteAccessDecision.Allowed
}

object MobileRouteCapabilities {
    val Dashboard = setOf(
        "workspace.dashboard.view",
        "platform.dashboard.view",
        "personal.dashboard.view",
    )

    val Appointments = setOf(
        "workspace.appointments.view",
        "workspace.appointments.manage",
        "platform.appointments.view",
        "platform.appointments.manage",
        "personal.appointments.view",
        "personal.appointments.manage",
    )

    val Patients = setOf(
        "platform.patients.view",
        "platform.patients.manage",
        "workspace.patients.view",
        "workspace.patients.manage",
    )

    val PatientManage = setOf(
        "platform.patients.manage",
        "workspace.patients.manage",
    )

    val Alerts = setOf(
        "platform.alerts.view",
        "platform.alerts.manage",
        "workspace.alerts.view",
        "workspace.alerts.manage",
    )

    val AlertManage = setOf(
        "platform.alerts.manage",
        "workspace.alerts.manage",
    )

    val Reviews = setOf(
        "platform.review.view",
        "platform.review.manage",
        "workspace.review.view",
        "workspace.review.manage",
    )

    val ReviewManage = setOf(
        "platform.review.manage",
        "workspace.review.manage",
    )

    val Scans = setOf(
        "workspace.scans.view",
        "workspace.scans.manage",
        "platform.scans.view",
        "platform.scans.manage",
        "personal.scans.manage",
    )

    val ScanManage = setOf(
        "workspace.scans.manage",
        "platform.scans.manage",
        "personal.scans.manage",
    )

    val Devices = setOf(
        "workspace.devices.view",
        "workspace.devices.manage",
        "platform.devices.view",
        "platform.devices.manage",
        "personal.devices.manage",
    )

    val DeviceManage = setOf(
        "workspace.devices.manage",
        "platform.devices.manage",
        "personal.devices.manage",
    )

    val Live = setOf(
        "workspace.devices.view",
        "workspace.devices.manage",
        "platform.devices.view",
        "platform.devices.manage",
        "personal.devices.manage",
        "workspace.scans.view",
        "workspace.scans.manage",
        "platform.scans.view",
        "platform.scans.manage",
        "personal.scans.manage",
    )

    val PersonalProfiles = setOf("personal.profiles.manage")

    val Consent = setOf(
        "platform.patients.manage",
        "workspace.patients.manage",
        "personal.sharing.manage",
    )

    val StorageRead = setOf(
        "platform.storage.manage",
        "workspace.storage.manage",
        "workspace.scans.view",
        "workspace.scans.manage",
        "personal.scans.manage",
    )

    val DataExport = setOf(
        "platform.exports.manage",
        "workspace.exports.manage",
        "workspace.assigned_data.export",
        "personal.data.export",
    )
}

object ShcareMobileRouteContract {
    const val UnknownRouteTestTag = "route.unknown"

    fun rootTestTagFor(route: String?): String {
        val normalizedRoute = route?.trim().orEmpty()
        return ShcareMobileRoute.entries
            .firstOrNull { it.routePattern == normalizedRoute }
            ?.testTag
            ?: resolve(normalizedRoute)?.testTag
            ?: UnknownRouteTestTag
    }

    fun verifyEmailRoute(accountType: String): String {
        val canonicalAccountType = when (accountType.trim().lowercase()) {
            "doctor" -> "doctor"
            "solo_doctor" -> "solo_doctor"
            else -> "patient"
        }
        return "verify-email?accountType=$canonicalAccountType"
    }

    fun resolve(route: String?): ShcareMobileRoute? {
        val normalizedPath = normalizePath(route) ?: return null
        return ShcareMobileRoute.entries.firstOrNull { contract ->
            pathMatches(
                pattern = contract.pathPattern,
                candidate = normalizedPath,
            )
        }
    }

    fun evaluate(
        route: String?,
        context: MobileRouteAccessContext?,
        expectedAuthorityEpoch: Long? = null,
    ): MobileRouteAccessDecision {
        val contract = resolve(route)
            ?: return MobileRouteAccessDecision.Denied(MobileRouteDenialReason.UnknownRoute)
        return evaluate(contract, context, expectedAuthorityEpoch)
    }

    fun evaluate(
        contract: ShcareMobileRoute,
        context: MobileRouteAccessContext?,
        expectedAuthorityEpoch: Long? = null,
    ): MobileRouteAccessDecision {
        if (contract.sessionRequirement == MobileRouteSessionRequirement.PublicAuth) {
            return MobileRouteAccessDecision.Allowed(contract)
        }

        if (context == null) {
            return MobileRouteAccessDecision.Denied(
                reason = MobileRouteDenialReason.AuthenticationRequired,
                contract = contract,
            )
        }

        if (
            expectedAuthorityEpoch != null &&
            context.authorityEpoch != expectedAuthorityEpoch
        ) {
            return MobileRouteAccessDecision.Denied(
                reason = MobileRouteDenialReason.StaleAuthority,
                contract = contract,
            )
        }

        if (
            contract.allowedExperiences.isNotEmpty() &&
            context.experience !in contract.allowedExperiences
        ) {
            return MobileRouteAccessDecision.Denied(
                reason = MobileRouteDenialReason.ExperienceMismatch,
                contract = contract,
            )
        }

        if (
            contract.anyOfCapabilities.isNotEmpty() &&
            context.capabilities.none(contract.anyOfCapabilities::contains)
        ) {
            return MobileRouteAccessDecision.Denied(
                reason = MobileRouteDenialReason.CapabilityMissing,
                contract = contract,
            )
        }

        return MobileRouteAccessDecision.Allowed(contract)
    }

    fun rootFor(experience: MobileExperience): ShcareMobileRoute = when (experience) {
        MobileExperience.Patient -> ShcareMobileRoute.PatientDashboard
        MobileExperience.Clinical -> ShcareMobileRoute.ClinicalDashboard
    }

    /**
     * Resolves a real authorized landing route instead of assuming that every membership has
     * dashboard capability. Settings remains the authenticated fail-closed fallback.
     */
    fun initialDestinationFor(
        context: MobileRouteAccessContext,
        expectedAuthorityEpoch: Long,
    ): ShcareMobileRoute {
        if (context.authorityEpoch != expectedAuthorityEpoch) {
            return ShcareMobileRoute.Splash
        }
        val preferredRoot = rootFor(context.experience)
        if (
            evaluate(
                contract = preferredRoot,
                context = context,
                expectedAuthorityEpoch = expectedAuthorityEpoch,
            ) is MobileRouteAccessDecision.Allowed
        ) {
            return preferredRoot
        }
        val authorizedPrimary = ShcarePrimaryNavigationContract.destinationsFor(
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        ).firstOrNull()?.route
        if (authorizedPrimary != null) return authorizedPrimary
        return if (
            evaluate(
                contract = ShcareMobileRoute.Settings,
                context = context,
                expectedAuthorityEpoch = expectedAuthorityEpoch,
            ) is MobileRouteAccessDecision.Allowed
        ) {
            ShcareMobileRoute.Settings
        } else {
            ShcareMobileRoute.Splash
        }
    }

    /**
     * Device provisioning may only return to an authorized primary destination. Query input is
     * never treated as a raw navigation command.
     */
    fun safeReturnDestination(
        candidateRoute: String?,
        context: MobileRouteAccessContext,
        expectedAuthorityEpoch: Long,
    ): ShcareMobileRoute {
        if (context.authorityEpoch != expectedAuthorityEpoch) {
            return ShcareMobileRoute.Splash
        }
        val candidate = resolve(candidateRoute)
        val authorizedPrimary = ShcarePrimaryNavigationContract.destinationsFor(
            context = context,
            expectedAuthorityEpoch = expectedAuthorityEpoch,
        )
        return authorizedPrimary
            .firstOrNull { destination -> destination.route == candidate }
            ?.route
            ?: initialDestinationFor(context, expectedAuthorityEpoch)
    }

    private fun normalizePath(route: String?): String? {
        val normalized = route
            ?.trim()
            ?.substringBefore('#')
            ?.substringBefore('?')
            ?.trim()
            ?.removePrefix("/")
            ?.trimEnd('/')
            .orEmpty()
        return normalized.takeIf { it.isNotBlank() }
    }

    private fun pathMatches(
        pattern: String,
        candidate: String,
    ): Boolean {
        val patternSegments = pattern.split('/')
        val candidateSegments = candidate.split('/')
        if (patternSegments.size != candidateSegments.size) return false

        return patternSegments.zip(candidateSegments).all { (expected, actual) ->
            when {
                expected.isPlaceholder() -> actual.isNotBlank() && !actual.isPlaceholder()
                else -> expected == actual
            }
        }
    }

    private fun String.isPlaceholder(): Boolean =
        length > 2 && startsWith('{') && endsWith('}')
}
