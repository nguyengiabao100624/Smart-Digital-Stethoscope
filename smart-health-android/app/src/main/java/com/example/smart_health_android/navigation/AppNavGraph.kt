package com.example.smart_health_android.navigation

import android.net.Uri
import android.os.SystemClock
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.SmartHealthAuthorizationEvents
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.canonicalWorkspaceId
import com.example.smart_health_android.data.requiresFullLocalTermination
import com.example.smart_health_android.notifications.NotificationNavigationPolicy
import com.example.smart_health_android.notifications.SmartHealthNotificationCenter
import com.example.smart_health_android.notifications.SmartHealthNotificationLaunchRequest
import com.example.smart_health_android.notifications.SmartHealthNotificationSession
import com.example.smart_health_android.appointments.AppointmentRoute
import com.example.smart_health_android.clinical.alerts.ClinicalAlertsScreen
import com.example.smart_health_android.clinical.patients.ClinicalPatientsScreen
import com.example.smart_health_android.clinical.reviews.ClinicalReviewsScreen
import com.example.smart_health_android.devices.DevicePairingAuthoritySnapshot
import com.example.smart_health_android.patientdashboard.PatientDashboardAuthoritySnapshot
import com.example.smart_health_android.patientdashboard.bindPatientDashboardRouteAccess
import com.example.smart_health_android.security.ChangePasswordAuthoritySnapshot
import com.example.smart_health_android.security.AndroidBiometricPromptLauncher
import com.example.smart_health_android.security.BiometricLocalUnlockAuthority
import com.example.smart_health_android.security.BiometricLocalUnlockError
import com.example.smart_health_android.security.BiometricLocalUnlockUiAction
import com.example.smart_health_android.security.BiometricLocalUnlockUiEffect
import com.example.smart_health_android.security.BiometricLocalUnlockViewModel
import com.example.smart_health_android.security.BiometricLocalUnlockViewModelFactory
import com.example.smart_health_android.security.SmartHealthBiometricLocalUnlock
import com.example.smart_health_android.security.bindChangePasswordRouteAccess
import com.example.smart_health_android.security.SmartHealthSessionTerminator
import com.example.smart_health_android.settings.SettingsAuthoritySnapshot
import com.example.smart_health_android.settings.SettingsLogoutCoordinator
import com.example.smart_health_android.settings.SettingsLogoutResult
import com.example.smart_health_android.settings.bindSettingsRouteAccess
import com.example.smart_health_android.ui.motion.smartHealthEnterTransition
import com.example.smart_health_android.ui.motion.smartHealthExitTransition
import com.example.smart_health_android.ui.motion.smartHealthPopEnterTransition
import com.example.smart_health_android.ui.motion.smartHealthPopExitTransition
import com.example.smart_health_android.ui.components.ShcareScaffold
import com.example.smart_health_android.ui.components.toShcareNavigationItem
import com.example.smart_health_android.ui.screens.*
import kotlinx.coroutines.launch

@Composable
fun AppNavGraph(
    navController: NavHostController = rememberNavController(),
    startDestination: String = "splash",
    notificationLaunchRequest: SmartHealthNotificationLaunchRequest? = null,
    onNotificationLaunchRequestConsumed: () -> Unit = {},
    externalDeepLinkLaunchRequest: ShcareExternalDeepLinkLaunchRequest? = null,
    onExternalDeepLinkLaunchRequestConsumed: () -> Unit = {},
) {
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val coroutineScope = rememberCoroutineScope()
    val authorityStore = ShcareMobileSessionAuthority.store
    val authorityState by authorityStore.state.collectAsStateWithLifecycle()
    val biometricRepository = remember { SmartHealthBiometricLocalUnlock.repository() }
    val biometricLocalUnlockViewModel: BiometricLocalUnlockViewModel = viewModel(
        factory = BiometricLocalUnlockViewModelFactory(biometricRepository),
    )
    val biometricLocalUnlockState by
        biometricLocalUnlockViewModel.uiState.collectAsStateWithLifecycle()
    val activity = LocalActivity.current as? FragmentActivity
    val biometricPromptLauncher = remember(
        activity,
        biometricRepository,
        biometricLocalUnlockViewModel,
    ) {
        activity?.let { fragmentActivity ->
            AndroidBiometricPromptLauncher(
                activity = fragmentActivity,
                repository = biometricRepository,
                onAuthenticated = { requestId ->
                    biometricLocalUnlockViewModel.onAction(
                        BiometricLocalUnlockUiAction.PromptAuthenticated(requestId),
                    )
                },
                onFailed = { requestId, error ->
                    biometricLocalUnlockViewModel.onAction(
                        BiometricLocalUnlockUiAction.PromptFailed(requestId, error),
                    )
                },
            )
        }
    }
    var pendingVerifyEmailOwner by remember {
        mutableStateOf<FirebaseOwnerBinding?>(null)
    }
    var pendingDoctorApprovalOwner by remember {
        mutableStateOf<FirebaseOwnerBinding?>(null)
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    val biometricLocalUnlockAuthority = captureBiometricLocalUnlockAuthority(
        authorityState.authority,
    )
    LaunchedEffect(biometricLocalUnlockAuthority, authorityState.epoch) {
        biometricLocalUnlockViewModel.onAction(
            BiometricLocalUnlockUiAction.AuthorityObserved(biometricLocalUnlockAuthority),
        )
    }
    val routeAccessContext = if (authorityState.reauthorizing) {
        null
    } else {
        authorityState.authority?.toRouteAccessContext()
    }
    val authorityFirebaseUserId = authorityState.authority
        ?.firebaseUserId
        ?.takeIf { it == FirebaseAuthService.currentUserIdOrNull() }
        .orEmpty()
    val settingsRouteBinding = remember(routeAccessContext, authorityState.epoch) {
        bindSettingsRouteAccess(
            context = routeAccessContext,
            expectedAuthorityEpoch = authorityState.epoch,
        )
    }
    val changePasswordRouteBinding = remember(
        routeAccessContext,
        authorityFirebaseUserId,
        authorityState.epoch,
    ) {
        bindChangePasswordRouteAccess(
            context = routeAccessContext,
            firebaseUserId = authorityFirebaseUserId,
            expectedAuthorityEpoch = authorityState.epoch,
        )
    }
    val patientDashboardRouteBinding = remember(
        routeAccessContext,
        authorityState.epoch,
    ) {
        bindPatientDashboardRouteAccess(
            context = routeAccessContext,
            expectedAuthorityEpoch = authorityState.epoch,
        )
    }
    val settingsAuthorityOwner = authorityState.authority
    val changePasswordAuthorityOwner = authorityState.authority
    val patientDashboardAuthorityOwner = authorityState.authority
    val devicePairingAuthority = authorityState.authority?.let { authority ->
        DevicePairingAuthoritySnapshot.create(
            userId = authority.userId,
            workspaceId = authority.workspaceId,
            authorityEpoch = authority.epoch,
        )
    }
    val currentSettingsAuthority: () -> SettingsAuthoritySnapshot? = {
        val latestState = authorityStore.state.value
        bindSettingsRouteAccess(
            context = if (latestState.reauthorizing) {
                null
            } else {
                latestState.authority?.toRouteAccessContext()
            },
            expectedAuthorityEpoch = latestState.epoch,
        ).authority
    }
    val currentChangePasswordAuthority: () -> ChangePasswordAuthoritySnapshot? = {
        val latestState = authorityStore.state.value
        val latestFirebaseUserId = latestState.authority
            ?.firebaseUserId
            ?.takeIf { it == FirebaseAuthService.currentUserIdOrNull() }
            .orEmpty()
        bindChangePasswordRouteAccess(
            context = if (latestState.reauthorizing) {
                null
            } else {
                latestState.authority?.toRouteAccessContext()
            },
            firebaseUserId = latestFirebaseUserId,
            expectedAuthorityEpoch = latestState.epoch,
        ).authority
    }
    val currentPatientDashboardAuthority: () -> PatientDashboardAuthoritySnapshot? = {
        val latestState = authorityStore.state.value
        bindPatientDashboardRouteAccess(
            context = if (latestState.reauthorizing) {
                null
            } else {
                latestState.authority?.toRouteAccessContext()
            },
            expectedAuthorityEpoch = latestState.epoch,
        ).authority
    }
    val currentDevicePairingAuthority: () -> DevicePairingAuthoritySnapshot? = {
        val latestState = authorityStore.state.value
        if (latestState.reauthorizing) {
            null
        } else {
            latestState.authority?.let { authority ->
                DevicePairingAuthoritySnapshot.create(
                    userId = authority.userId,
                    workspaceId = authority.workspaceId,
                    authorityEpoch = authority.epoch,
                )
            }
        }
    }
    val currentRoute = currentBackStackEntry?.destination?.route
    val primaryDestinations = remember(currentRoute, routeAccessContext) {
        if (
            routeAccessContext != null &&
            ShcarePrimaryNavigationContract.isPrimaryRoute(
                route = currentRoute,
                context = routeAccessContext,
                expectedAuthorityEpoch = authorityState.epoch,
            )
        ) {
            ShcarePrimaryNavigationContract.destinationsFor(
                context = routeAccessContext,
                expectedAuthorityEpoch = authorityState.epoch,
            )
        } else {
            emptyList()
        }
    }
    val primaryNavigationItems = remember(primaryDestinations) {
        primaryDestinations.map(ShcarePrimaryDestination::toShcareNavigationItem)
    }
    val selectedPrimaryRoute = remember(currentRoute) {
        ShcareMobileRouteContract.resolve(currentRoute)
    }
    val navigateToPrimaryDestination: (ShcarePrimaryDestination) -> Unit = { destination ->
        val latestState = authorityStore.state.value
        val latestContext = latestState.authority?.toRouteAccessContext()
        if (
            latestContext != null &&
            !latestState.reauthorizing &&
            destination in ShcarePrimaryNavigationContract.destinationsFor(
                context = latestContext,
                expectedAuthorityEpoch = latestState.epoch,
            ) &&
            ShcareMobileRouteContract.evaluate(
                contract = destination.route,
                context = latestContext,
                expectedAuthorityEpoch = latestState.epoch,
            ) is MobileRouteAccessDecision.Allowed
        ) {
            val rootRoute = ShcareMobileRouteContract
                .initialDestinationFor(
                    context = latestContext,
                    expectedAuthorityEpoch = latestState.epoch,
                )
                .routePattern
            navController.navigate(destination.route.routePattern) {
                popUpTo(rootRoute) {
                    inclusive = false
                }
                launchSingleTop = true
            }
        }
    }
    val resolveSafeDeviceReturnRoute: (String?) -> String = { candidateRoute ->
        val latestState = authorityStore.state.value
        val latestContext = latestState.authority?.toRouteAccessContext()
        if (latestContext == null || latestState.reauthorizing) {
            ShcareMobileRoute.Splash.routePattern
        } else {
            ShcareMobileRouteContract.safeReturnDestination(
                candidateRoute = candidateRoute,
                context = latestContext,
                expectedAuthorityEpoch = latestState.epoch,
            ).routePattern
        }
    }
    val reauthorizationCoordinator = remember(authorityStore) {
        MobileAuthorityReauthorizationCoordinator(
            authorityStore = authorityStore,
            loadCurrentUser = { SmartHealthRepository.api.getMe() },
            currentFirebaseUserId = {
                FirebaseAuthService.currentUserIdOrNull().orEmpty()
            },
            currentAuthSessionEpoch = {
                SmartHealthRepository.api.currentAuthSessionEpoch()
            },
            elapsedRealtimeMillis = SystemClock::elapsedRealtime,
        )
    }
    val replaceNavigationStack: (String) -> Unit = { destination ->
        navController.navigate(destination) {
            popUpTo(navController.graph.id) { inclusive = true }
            launchSingleTop = true
        }
    }
    val replaceNavigationStackWithSplashWithoutAuthorityMutation: () -> Unit = {
        replaceNavigationStack(ShcareMobileRoute.Splash.routePattern)
    }
    val captureAuthorityForFirebaseOwner:
        (FirebaseOwnerBinding) -> MobileSessionAuthority? = { owner ->
        authorityStore.state.value.authority?.takeIf { authority ->
            authority.firebaseUserId == owner.firebaseUserId
        }
    }
    val replaceProtectedStackWithSplash: (MobileSessionAuthority?) -> Unit =
        { expectedAuthority ->
            expectedAuthority?.let(authorityStore::invalidateIfCurrent)
            replaceNavigationStackWithSplashWithoutAuthorityMutation()
        }
    val handleReauthorizationResult: (MobileReauthorizationResult) -> Unit = { result ->
        when (result) {
            is MobileReauthorizationResult.Accepted -> {
                if (result.authorityChanged) {
                    val rootRoute = ShcareMobileRouteContract
                        .initialDestinationFor(
                            context = result.authority.toRouteAccessContext(),
                            expectedAuthorityEpoch = result.authority.epoch,
                        )
                        .routePattern
                    navController.navigate(rootRoute) {
                        popUpTo(navController.graph.id) { inclusive = true }
                        launchSingleTop = true
                    }
                }
            }

            is MobileReauthorizationResult.Failed,
            is MobileReauthorizationResult.Rejected,
            MobileReauthorizationResult.AuthenticationSessionChanged,
            -> replaceNavigationStackWithSplashWithoutAuthorityMutation()

            MobileReauthorizationResult.AlreadyInProgress,
            MobileReauthorizationResult.NoActiveAuthority,
            MobileReauthorizationResult.NotRequired,
            -> Unit
        }
    }
    val latestHandleReauthorizationResult = rememberUpdatedState(handleReauthorizationResult)
    val reauthorizationRuntime = remember(reauthorizationCoordinator) {
        MobileAuthorityReauthorizationRuntime(
            coordinator = reauthorizationCoordinator,
            onResult = { result ->
                latestHandleReauthorizationResult.value(result)
            },
        )
    }
    val initialReauthorizationTicket = remember(reauthorizationCoordinator) {
        reauthorizationCoordinator.resumeOrBeginForegroundReauthorization()
    }
    LaunchedEffect(initialReauthorizationTicket, reauthorizationCoordinator) {
        if (initialReauthorizationTicket != null) {
            latestHandleReauthorizationResult.value(
                reauthorizationCoordinator.completeForegroundReauthorization(
                    initialReauthorizationTicket,
                ),
            )
        }
    }
    LaunchedEffect(
        authorityState.authority,
        authorityState.reauthorizing,
        reauthorizationCoordinator,
    ) {
        if (authorityState.reauthorizing) {
            val resumableAuthority =
                reauthorizationCoordinator.resumeOrBeginForegroundReauthorization()
            if (resumableAuthority != null) {
                latestHandleReauthorizationResult.value(
                    reauthorizationCoordinator.completeForegroundReauthorization(
                        resumableAuthority,
                    ),
                )
            }
        }
    }
    DisposableEffect(
        lifecycleOwner,
        reauthorizationCoordinator,
        biometricLocalUnlockViewModel,
    ) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) {
                biometricLocalUnlockViewModel.onAction(
                    BiometricLocalUnlockUiAction.AuthorityObserved(
                        captureBiometricLocalUnlockAuthority(
                            authorityStore.state.value.authority,
                        ),
                    ),
                )
                biometricLocalUnlockViewModel.onAction(
                    BiometricLocalUnlockUiAction.AppForegrounded,
                )
                val expectedAuthority =
                    reauthorizationCoordinator.resumeOrBeginForegroundReauthorization()
                if (expectedAuthority != null) {
                    coroutineScope.launch {
                        latestHandleReauthorizationResult.value(
                            reauthorizationCoordinator.completeForegroundReauthorization(
                                expectedAuthority,
                            ),
                        )
                    }
                }
            } else if (event == Lifecycle.Event.ON_STOP) {
                biometricLocalUnlockViewModel.onAction(
                    BiometricLocalUnlockUiAction.AppBackgrounded,
                )
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }
    LaunchedEffect(authorityStore) {
        SmartHealthAuthorizationEvents.events.collect { event ->
            val currentState = authorityStore.state.value
            val hasAuthenticatedApiSession =
                SmartHealthRepository.api.currentAuthToken() != null
            val belongsToCurrentAuthSession =
                event.authSessionEpoch == SmartHealthRepository.api.currentAuthSessionEpoch()
            val hasSessionToInvalidate =
                hasAuthenticatedApiSession ||
                    currentState.authority != null ||
                    currentState.reauthorizing
            if (!belongsToCurrentAuthSession || !hasSessionToInvalidate) {
                SmartHealthAuthorizationEvents.acknowledge(event)
                return@collect
            }
            if (event.requiresFullLocalTermination()) {
                SmartHealthSessionTerminator.terminateLocallyForAccountReplacement()
            } else {
                SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                    SmartHealthNotificationCenter.clearAllPostedNotifications()
                }
            }
            replaceProtectedStackWithSplash(currentState.authority)
            SmartHealthAuthorizationEvents.acknowledge(event)
        }
    }
    val openAuthenticatedRoot: (AuthUser, FirebaseOwnerBinding) -> Unit =
        openAuthenticatedRoot@{ user, expectedFirebaseOwner ->
            if (!FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner)) {
                replaceNavigationStackWithSplashWithoutAuthorityMutation()
                return@openAuthenticatedRoot
            }
            when (
                val update = authorityStore.establish(
                    user = user,
                    firebaseUserId = expectedFirebaseOwner.firebaseUserId,
                    verifiedAtElapsedRealtimeMillis = SystemClock.elapsedRealtime(),
                )
            ) {
                is MobileAuthorityUpdate.Accepted -> {
                    if (!FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner)) {
                        authorityStore.invalidateIfCurrent(update.authority)
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                        return@openAuthenticatedRoot
                    }
                    val rootRoute = ShcareMobileRouteContract
                        .initialDestinationFor(
                            context = update.authority.toRouteAccessContext(),
                            expectedAuthorityEpoch = update.authority.epoch,
                        )
                        .routePattern
                    replaceNavigationStack(rootRoute)
                }

                is MobileAuthorityUpdate.Rejected -> {
                    val authorityToInvalidate =
                        captureAuthorityForFirebaseOwner(expectedFirebaseOwner)
                    coroutineScope.launch {
                        val terminatedExpectedOwner =
                            SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(
                                expectedFirebaseOwner,
                            )
                        if (terminatedExpectedOwner) {
                            authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)
                            replaceNavigationStack(ShcareMobileRoute.Login.routePattern)
                        } else {
                            replaceNavigationStackWithSplashWithoutAuthorityMutation()
                        }
                    }
                }
            }
        }
    val logoutFirebaseOwner = remember(currentBackStackEntry) {
        FirebaseAuthService.currentOwnerBindingOrNull()
    }
    val logoutAuthority = remember(currentBackStackEntry, authorityState.epoch) {
        authorityStore.state.value.authority
    }
    val settingsLogoutCoordinator =
        remember(
            authorityState.epoch,
            logoutFirebaseOwner,
            logoutAuthority,
            authorityStore,
            navController,
        ) {
            var canExitToLogin = false
            SettingsLogoutCoordinator(
                clearAuthority = {
                    logoutAuthority?.let(authorityStore::invalidateIfCurrent)
                },
                terminateSession = {
                    val expectedOwner = checkNotNull(logoutFirebaseOwner) {
                        "The Firebase owner is missing before session termination."
                    }
                    canExitToLogin =
                        SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(
                            expectedOwner,
                        )
                    check(canExitToLogin) {
                        "The Firebase account changed before session termination."
                    }
                },
                exitProtectedUi = {
                    val destination = if (canExitToLogin) {
                        ShcareMobileRoute.Login.routePattern
                    } else {
                        ShcareMobileRoute.Splash.routePattern
                    }
                    replaceNavigationStack(destination)
                },
            )
        }
    val performLogout: () -> Unit = {
        coroutineScope.launch {
            settingsLogoutCoordinator.logout()
        }
    }
    LaunchedEffect(
        biometricLocalUnlockViewModel,
        biometricPromptLauncher,
        authorityStore,
    ) {
        biometricLocalUnlockViewModel.effects.collect { effect ->
            when (effect) {
                is BiometricLocalUnlockUiEffect.LaunchPrompt -> {
                    val launcher = biometricPromptLauncher
                    if (launcher == null) {
                        biometricLocalUnlockViewModel.onAction(
                            BiometricLocalUnlockUiAction.PromptFailed(
                                requestId = effect.request.requestId,
                                error = BiometricLocalUnlockError.RuntimeUnavailable,
                            ),
                        )
                    } else {
                        launcher.launch(effect.request)
                    }
                }

                is BiometricLocalUnlockUiEffect.CancelPrompt -> {
                    biometricPromptLauncher?.cancel(effect.requestId)
                }

                is BiometricLocalUnlockUiEffect.TerminateSession -> {
                    val expectedMobileAuthority = authorityStore.state.value.authority
                        ?.takeIf { currentAuthority ->
                            captureBiometricLocalUnlockAuthority(currentAuthority) ==
                                effect.authority
                        }
                    val expectedFirebaseOwner = FirebaseAuthService.currentOwnerBindingOrNull()
                        ?.takeIf { owner ->
                            owner.firebaseUserId == effect.authority.firebaseUserId &&
                                owner.sessionEpoch == effect.authority.firebaseOwnerSessionEpoch
                        }
                    if (expectedMobileAuthority == null || expectedFirebaseOwner == null) {
                        return@collect
                    }
                    val canExitToLogin =
                        SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(
                            expectedFirebaseOwner,
                        )
                    if (canExitToLogin) {
                        authorityStore.invalidateIfCurrent(expectedMobileAuthority)
                        replaceNavigationStack(ShcareMobileRoute.Login.routePattern)
                    } else {
                        replaceNavigationStack(ShcareMobileRoute.Splash.routePattern)
                    }
                }
            }
        }
    }
    LaunchedEffect(
        notificationLaunchRequest,
        currentBackStackEntry?.destination?.route,
        authorityState.epoch,
        authorityState.reauthorizing,
    ) {
        val launchRequest = notificationLaunchRequest ?: return@LaunchedEffect
        val destination = launchRequest.destination
        val currentRoute = currentBackStackEntry?.destination?.route
        val hasMatchingNotificationOwner = SmartHealthNotificationSession.canOpen(
            request = launchRequest,
            currentFirebaseUserId = FirebaseAuthService.currentUserIdOrNull(),
            currentWorkspaceId = authorityState.authority?.workspaceId,
        )
        if (!hasMatchingNotificationOwner) {
            onNotificationLaunchRequestConsumed()
            return@LaunchedEffect
        }
        if (currentRoute == destination.route) {
            onNotificationLaunchRequestConsumed()
            return@LaunchedEffect
        }
        if (
            !authorityState.reauthorizing &&
            NotificationNavigationPolicy.canNavigate(
                currentRoute = currentRoute,
                destinationRoute = destination.route,
                hasAuthenticatedSession = SmartHealthRepository.api.currentAuthToken() != null,
                hasMatchingNotificationOwner = hasMatchingNotificationOwner,
                authority = authorityState.authority?.toRouteAccessContext(),
                expectedAuthorityEpoch = authorityState.epoch,
            )
        ) {
            navController.navigate(destination.route) {
                launchSingleTop = true
            }
            onNotificationLaunchRequestConsumed()
        }
    }
    LaunchedEffect(
        externalDeepLinkLaunchRequest,
        notificationLaunchRequest,
        currentBackStackEntry?.destination?.route,
        authorityState.authority,
        authorityState.epoch,
        authorityState.reauthorizing,
    ) {
        if (notificationLaunchRequest != null) return@LaunchedEffect
        val request = externalDeepLinkLaunchRequest ?: return@LaunchedEffect
        when (
            val decision = ShcareExternalDeepLinkContract.evaluate(
                request = request,
                authorityState = authorityState,
                currentFirebaseOwner = FirebaseAuthService.currentOwnerBindingOrNull(),
            )
        ) {
            is ExternalMobileDeepLinkDecision.Allowed -> {
                val currentRoute = currentBackStackEntry?.destination?.route
                if (currentRoute != decision.destinationRoute) {
                    val currentContract = ShcareMobileRouteContract.resolve(currentRoute)
                    if (
                        currentContract?.sessionRequirement ==
                        MobileRouteSessionRequirement.Authenticated
                    ) {
                        navController.navigate(decision.destinationRoute) {
                            launchSingleTop = true
                        }
                    } else {
                        val context = authorityState.authority?.toRouteAccessContext()
                        if (context != null) {
                            val rootRoute = ShcareMobileRouteContract.initialDestinationFor(
                                context = context,
                                expectedAuthorityEpoch = authorityState.epoch,
                            ).routePattern
                            replaceNavigationStack(rootRoute)
                            if (rootRoute != decision.destinationRoute) {
                                navController.navigate(decision.destinationRoute) {
                                    launchSingleTop = true
                                }
                            }
                        }
                    }
                }
                onExternalDeepLinkLaunchRequestConsumed()
            }

            is ExternalMobileDeepLinkDecision.Denied -> when (decision.reason) {
                ExternalMobileDeepLinkDenialReason.AuthenticationRequired,
                ExternalMobileDeepLinkDenialReason.AuthorityReauthorizing,
                -> Unit

                else -> onExternalDeepLinkLaunchRequestConsumed()
            }
        }
    }

    val activeRouteForSemantics = currentBackStackEntry?.destination?.route ?: startDestination

    val protectedAuthorityPresent = authorityState.authority != null
    val biometricAuthorityIsCurrent = biometricLocalUnlockViewModel.isBoundTo(
        biometricLocalUnlockAuthority,
    )
    if (
        protectedAuthorityPresent &&
        (!biometricAuthorityIsCurrent || !biometricLocalUnlockState.protectedContentAllowed)
    ) {
        BiometricLocalUnlockGate(
            state = biometricLocalUnlockState,
            onUnlock = {
                biometricLocalUnlockViewModel.onAction(
                    BiometricLocalUnlockUiAction.UnlockRequested,
                )
            },
            onSignOut = {
                biometricLocalUnlockViewModel.onAction(
                    BiometricLocalUnlockUiAction.SignOutRequested,
                )
            },
        )
        return
    }

    CompositionLocalProvider(
        LocalMobileAuthorityReauthorizationRuntime provides reauthorizationRuntime,
    ) {
        ShcareScaffold(
            items = primaryNavigationItems,
            selectedRoute = selectedPrimaryRoute,
            onDestinationSelected = navigateToPrimaryDestination,
        ) { navHostModifier ->
            NavHost(
                navController = navController,
                startDestination = startDestination,
                modifier = navHostModifier.shcareRouteRootTestTag(activeRouteForSemantics),
                enterTransition = { smartHealthEnterTransition() },
                exitTransition = { smartHealthExitTransition() },
                popEnterTransition = { smartHealthPopEnterTransition() },
                popExitTransition = { smartHealthPopExitTransition() },
            ) {
        composable(ShcareMobileRoute.Splash.routePattern) {
            SplashScreen(
                onNavigateToLogin = {
                    replaceNavigationStack(ShcareMobileRoute.Login.routePattern)
                },
                onAuthenticated = { user, firebaseOwner ->
                    openAuthenticatedRoot(user, firebaseOwner)
                },
                onDoctorApprovalPending = { firebaseOwner ->
                    if (FirebaseAuthService.isCurrentOwner(firebaseOwner)) {
                        pendingDoctorApprovalOwner = firebaseOwner
                        replaceNavigationStack(
                            ShcareMobileRoute.DoctorApprovalPending.routePattern,
                        )
                    } else {
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                    }
                },
                onNavigateToVerifyEmail = { accountType, firebaseOwner ->
                    if (FirebaseAuthService.isCurrentOwner(firebaseOwner)) {
                        pendingVerifyEmailOwner = firebaseOwner
                        replaceNavigationStack(
                            ShcareMobileRouteContract.verifyEmailRoute(accountType),
                        )
                    } else {
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                    }
                }
            )
        }
        
        composable(ShcareMobileRoute.Login.routePattern) {
            LoginScreen(
                onLoginSuccess = { user, firebaseOwner ->
                    openAuthenticatedRoot(user, firebaseOwner)
                },
                onDoctorApprovalPending = { firebaseOwner ->
                    if (FirebaseAuthService.isCurrentOwner(firebaseOwner)) {
                        pendingDoctorApprovalOwner = firebaseOwner
                        replaceNavigationStack(
                            ShcareMobileRoute.DoctorApprovalPending.routePattern,
                        )
                    } else {
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                    }
                },
                onNavigateToVerifyEmail = { accountType, firebaseOwner ->
                    if (FirebaseAuthService.isCurrentOwner(firebaseOwner)) {
                        pendingVerifyEmailOwner = firebaseOwner
                        replaceNavigationStack(
                            ShcareMobileRouteContract.verifyEmailRoute(accountType),
                        )
                    } else {
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                    }
                },
                onNavigateToSignUp = {
                    navController.navigate(ShcareMobileRoute.SignUp.routePattern)
                },
                onNavigateToForgotPassword = {
                    navController.navigate(
                        ShcareMobileRoute.ForgotPassword.routePattern,
                    )
                },
            )
        }

        composable(ShcareMobileRoute.SignUp.routePattern) {
            SignUpScreen(
                onNavigateToLogin = { navController.popBackStack() },
                onNavigateToVerifyEmail = { accountType, firebaseOwner ->
                    if (FirebaseAuthService.isCurrentOwner(firebaseOwner)) {
                        pendingVerifyEmailOwner = firebaseOwner
                        replaceNavigationStack(
                            ShcareMobileRouteContract.verifyEmailRoute(accountType),
                        )
                    } else {
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                    }
                }
            )
        }

        composable(
            route = ShcareMobileRoute.VerifyEmail.routePattern,
            arguments = listOf(
                navArgument("accountType") {
                    type = NavType.StringType
                    defaultValue = "patient"
                }
            )
        ) { backStackEntry ->
            val verifyEmailOwner = remember(backStackEntry) {
                pendingVerifyEmailOwner
                    ?: FirebaseAuthService.currentOwnerBindingOrNull()
            }
            if (verifyEmailOwner == null) {
                LaunchedEffect(backStackEntry) {
                    replaceNavigationStackWithSplashWithoutAuthorityMutation()
                }
            } else {
                FirebaseVerifyEmailScreen(
                    firebaseOwner = verifyEmailOwner,
                    onNavigateBack = {
                        val expectedOwner = verifyEmailOwner
                        val authorityToInvalidate =
                            captureAuthorityForFirebaseOwner(expectedOwner)
                        coroutineScope.launch {
                            val terminatedExpectedOwner = expectedOwner.let { owner ->
                                SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(owner)
                            }
                            pendingVerifyEmailOwner = null
                            if (terminatedExpectedOwner) {
                                authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)
                                replaceNavigationStack(ShcareMobileRoute.Login.routePattern)
                            } else {
                                replaceNavigationStackWithSplashWithoutAuthorityMutation()
                            }
                        }
                    },
                    fallbackAccountType =
                        backStackEntry.arguments?.getString("accountType") ?: "patient",
                    onVerified = verified@{ _, firebaseOwner ->
                        if (
                            verifyEmailOwner != firebaseOwner ||
                            !FirebaseAuthService.isCurrentOwner(firebaseOwner)
                        ) {
                            replaceNavigationStackWithSplashWithoutAuthorityMutation()
                            return@verified
                        }
                        pendingVerifyEmailOwner = null
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                    },
                )
            }
        }

        composable(ShcareMobileRoute.DoctorApprovalPending.routePattern) { backStackEntry ->
            val doctorApprovalOwner = remember(backStackEntry) {
                pendingDoctorApprovalOwner
                    ?: FirebaseAuthService.currentOwnerBindingOrNull()
            }
            if (doctorApprovalOwner == null) {
                LaunchedEffect(backStackEntry) {
                    replaceNavigationStackWithSplashWithoutAuthorityMutation()
                }
            } else {
                DoctorApprovalPendingScreen(
                    firebaseOwner = doctorApprovalOwner,
                    onApproved = approved@{ effectOwner ->
                        if (
                            effectOwner != doctorApprovalOwner ||
                            !FirebaseAuthService.isCurrentOwner(effectOwner)
                        ) {
                            replaceNavigationStackWithSplashWithoutAuthorityMutation()
                            return@approved
                        }
                        pendingDoctorApprovalOwner = null
                        replaceNavigationStackWithSplashWithoutAuthorityMutation()
                    },
                    onLogout = logout@{ effectOwner ->
                        if (
                            effectOwner != doctorApprovalOwner ||
                            !FirebaseAuthService.isCurrentOwner(effectOwner)
                        ) {
                            replaceNavigationStackWithSplashWithoutAuthorityMutation()
                            return@logout
                        }
                        val expectedOwner = doctorApprovalOwner
                        val authorityToInvalidate =
                            captureAuthorityForFirebaseOwner(expectedOwner)
                        coroutineScope.launch {
                            val terminatedExpectedOwner = expectedOwner.let { owner ->
                                SmartHealthSessionTerminator.terminateIfCurrentFirebaseOwner(owner)
                            }
                            pendingDoctorApprovalOwner = null
                            if (terminatedExpectedOwner) {
                                authorityToInvalidate?.let(authorityStore::invalidateIfCurrent)
                                replaceNavigationStack(ShcareMobileRoute.Login.routePattern)
                            } else {
                                replaceNavigationStackWithSplashWithoutAuthorityMutation()
                            }
                        }
                    },
                )
            }
        }

        composable(ShcareMobileRoute.ForgotPassword.routePattern) {
            ForgotPasswordScreen(
                onNavigateToLogin = { navController.popBackStack() }
            )
        }

        authorizedMobileComposable(navController, "dashboard") {
            DashboardScreen(
                onNavigateToMonitoring = { navController.navigate("monitoring") },
                onNavigateToRecords = { navController.navigate("records") },
                onNavigateToAssistant = { navController.navigate("ai-assistant") },
                onNavigateToNewScan = { navController.navigate("new-scan") },
                onNavigateToNotifications = { navController.navigate("notifications") },
                onNavigateToDeviceManagement = { navController.navigate("device-management") },
                onNavigateToAppointments = { navController.navigate(AppointmentRoute.List.route) },
                onNavigateToRecordDetail = { recordId ->
                    navController.navigate("record-detail/${Uri.encode(recordId)}")
                },
                onOpenWorkspaceSwitcher = {
                    navController.navigate(ShcareMobileRoute.WorkspaceSwitcher.routePattern)
                },
            )
        }

        authorizedMobileComposable(
            navController,
            ShcareMobileRoute.PatientDashboard.routePattern,
        ) {
            PatientDashboardScreen(
                expectedAuthority = patientDashboardRouteBinding.authority,
                currentAuthority = currentPatientDashboardAuthority,
                invalidateExpectedAuthority = {
                    if (patientDashboardAuthorityOwner != null) {
                        authorityStore.invalidateIfCurrent(patientDashboardAuthorityOwner)
                    }
                },
                canStartScan = patientDashboardRouteBinding.features.canStartScan,
                canViewRecords = patientDashboardRouteBinding.features.canViewRecords,
                canManageDevice = patientDashboardRouteBinding.features.canManageDevice,
                canViewAppointments =
                    patientDashboardRouteBinding.features.canViewAppointments,
                canUseAssistant =
                    patientDashboardRouteBinding.features.canUseAssistant,
                onNavigateToNotifications = {
                    navController.navigate(ShcareMobileRoute.Notifications.routePattern)
                },
                onNavigateToDeviceManagement = { deviceId ->
                    navController.navigate("device-management?deviceId=${Uri.encode(deviceId)}")
                },
                onNavigateToDevicePairing = {
                    navController.navigate(
                        ShcareMobileRoute.DevicePairing.routePattern.replace(
                            "{returnRoute}",
                            Uri.encode(ShcareMobileRoute.PatientDashboard.routePattern),
                        ),
                    )
                },
                onNavigateToNewScan = {
                    navController.navigate(ShcareMobileRoute.NewScan.routePattern)
                },
                onNavigateToRecords = {
                    navController.navigate(ShcareMobileRoute.Records.routePattern)
                },
                onNavigateToAppointments = { navController.navigate(AppointmentRoute.List.route) },
                onNavigateToRecordDetail = { recordId ->
                    navController.navigate(
                        ShcareMobileRoute.RecordDetail.routePattern.replace(
                            "{recordId}",
                            Uri.encode(recordId),
                        ),
                    )
                },
                onOpenWorkspaceSwitcher = {
                    navController.navigate(ShcareMobileRoute.WorkspaceSwitcher.routePattern)
                },
            )
        }

        authorizedMobileComposable(navController, "clinical-patients") {
            ClinicalPatientsScreen(
                expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty(),
                onOpenWorkspaceSwitcher = {
                    navController.navigate("workspace-switcher")
                },
            )
        }

        authorizedMobileComposable(navController, "clinical-alerts") {
            ClinicalAlertsScreen(
                expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty(),
                canManage = routeAccessContext
                    ?.capabilities
                    ?.any(MobileRouteCapabilities.AlertManage::contains) == true,
                onOpenWorkspaceSwitcher = {
                    navController.navigate("workspace-switcher")
                },
                onNavigateToReviews = {
                    navController.navigate(ShcareMobileRoute.ClinicalReviews.routePattern)
                },
            )
        }

        authorizedMobileComposable(
            navController,
            ShcareMobileRoute.ClinicalReviews.routePattern,
        ) {
            ClinicalReviewsScreen(
                expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty(),
                canManage = routeAccessContext
                    ?.capabilities
                    ?.any(MobileRouteCapabilities.ReviewManage::contains) == true,
                onNavigateBack = { navController.popBackStack() },
                onOpenWorkspaceSwitcher = {
                    navController.navigate(ShcareMobileRoute.WorkspaceSwitcher.routePattern)
                },
            )
        }

        authorizedMobileComposable(navController, "notifications") {
            NotificationsScreen(
                onNavigateBack = { navController.popBackStack() },
                expectedUserId = routeAccessContext?.userId.orEmpty(),
                expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty(),
                onOpenWorkspaceSwitcher = {
                    navController.navigate("workspace-switcher")
                },
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = AppointmentRoute.NAVIGATION_PATTERN,
            arguments = listOf(
                navArgument("appointmentId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            ),
        ) { backStackEntry ->
            AppointmentScreen(
                initialAppointmentId = backStackEntry.arguments
                    ?.getString("appointmentId")
                    ?.let(Uri::decode),
                onNavigateBack = { navController.popBackStack() },
            )
        }

        authorizedMobileComposable(navController, "new-scan") {
            NewScanScreen(
                onNavigateBack = { navController.popBackStack() },
                onScanStarted = { scanId ->
                    navController.navigate("monitoring?scanId=${Uri.encode(scanId)}")
                },
                showBackNavigation = primaryNavigationItems.size !in 3..5,
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = "monitoring?scanId={scanId}",
            arguments = listOf(
                navArgument("scanId") {
                    type = NavType.StringType
                    nullable = true
                    defaultValue = null
                }
            )
        ) { backStackEntry ->
            LiveMonitoringScreen(
                initialScanId = backStackEntry.arguments?.getString("scanId"),
                onNavigateBack = { navController.popBackStack() },
                onCreateScan = { navController.navigate("new-scan") },
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = "device-pairing?returnRoute={returnRoute}",
            arguments = listOf(
                navArgument("returnRoute") {
                    type = NavType.StringType
                    defaultValue = ""
                }
            )
        ) {
            DeviceAccessRedeemScreen(
                expectedAuthority = devicePairingAuthority,
                currentAuthority = currentDevicePairingAuthority,
                onNavigateBack = { navController.popBackStack() },
                onDeviceGranted = { deviceId ->
                    navController.navigate("device-management?deviceId=${Uri.encode(deviceId)}") {
                        popUpTo("device-pairing?returnRoute={returnRoute}") { inclusive = true }
                    }
                },
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = "device-wifi/{deviceId}",
            arguments = listOf(
                navArgument("deviceId") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val deviceId = Uri.decode(backStackEntry.arguments?.getString("deviceId").orEmpty())
            DeviceWifiSetupScreen(
                deviceId = deviceId,
                expectedAuthority = devicePairingAuthority,
                currentAuthority = currentDevicePairingAuthority,
                onNavigateBack = { navController.popBackStack() },
                onWifiConfigured = { deviceName ->
                    val returnRoute = "device-management?deviceId=${Uri.encode(deviceId)}"
                    navController.navigate(
                        "connection-success/${Uri.encode(deviceName)}" +
                            "?returnRoute=${Uri.encode(returnRoute)}",
                    ) {
                        popUpTo("device-wifi/{deviceId}") { inclusive = true }
                    }
                },
            )
        }

        // Compatibility alias for notification/deep-link payloads issued before the QR claim flow.
        authorizedMobileComposable(
            navController = navController,
            route = "bluetooth?returnRoute={returnRoute}",
            arguments = listOf(
                navArgument("returnRoute") {
                    type = NavType.StringType
                    defaultValue = ""
                }
            )
        ) {
            DeviceAccessRedeemScreen(
                expectedAuthority = devicePairingAuthority,
                currentAuthority = currentDevicePairingAuthority,
                onNavigateBack = { navController.popBackStack() },
                onDeviceGranted = { deviceId ->
                    navController.navigate("device-management?deviceId=${Uri.encode(deviceId)}") {
                        popUpTo("bluetooth?returnRoute={returnRoute}") { inclusive = true }
                    }
                },
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = "connection-success/{deviceName}?returnRoute={returnRoute}",
            arguments = listOf(
                navArgument("deviceName") { type = NavType.StringType },
                navArgument("returnRoute") {
                    type = NavType.StringType
                    defaultValue = ""
                }
            )
        ) { backStackEntry ->
            val deviceName = Uri.decode(backStackEntry.arguments?.getString("deviceName").orEmpty())
            val returnRoute = resolveSafeDeviceReturnRoute(
                Uri.decode(backStackEntry.arguments?.getString("returnRoute").orEmpty()),
            )
            ConnectionSuccessScreen(
                deviceName = deviceName,
                onFinish = {
                    val currentSafeReturnRoute = resolveSafeDeviceReturnRoute(returnRoute)
                    navController.navigate(currentSafeReturnRoute) {
                        popUpTo(currentSafeReturnRoute) { inclusive = false }
                        launchSingleTop = true
                    }
                }
            )
        }

        authorizedMobileComposable(navController, "records") {
            MedicalRecordsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDetail = { recordId ->
                    navController.navigate("record-detail/${Uri.encode(recordId)}")
                },
                showBackNavigation = primaryNavigationItems.size !in 3..5,
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = "record-detail/{recordId}",
            arguments = listOf(navArgument("recordId") { type = NavType.StringType })
        ) { backStackEntry ->
            RecordDetailScreen(
                recordId = Uri.decode(backStackEntry.arguments?.getString("recordId").orEmpty()),
                canManageScan = routeAccessContext
                    ?.capabilities
                    ?.any(MobileRouteCapabilities.ScanManage::contains)
                    == true,
                onNavigateBack = { navController.popBackStack() }
            )
        }

        authorizedMobileComposable(navController, "ai-assistant") {
            AIAssistantScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        authorizedMobileComposable(navController, "settings") {
            SettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToProfile = { navController.navigate("profile") },
                onNavigateToWorkspace = { navController.navigate("workspace-switcher") },
                onNavigateToFamilyProfiles = { navController.navigate("family-profiles") },
                onNavigateToPrivacy = { navController.navigate("privacy") },
                onNavigateToStethoscopeSettings = { navController.navigate("stethoscope-settings") },
                onNavigateToAICalibration = { navController.navigate("ai-calibration") },
                onNavigateToDataStorage = { navController.navigate("data-storage") },
                onNavigateToNotificationSettings = { navController.navigate("notification-settings") },
                expectedAuthority = settingsRouteBinding.authority,
                currentAuthority = currentSettingsAuthority,
                invalidateExpectedAuthority = {
                    if (settingsAuthorityOwner != null) {
                        authorityStore.invalidateIfCurrent(settingsAuthorityOwner)
                    }
                },
                logoutCoordinator = settingsLogoutCoordinator,
                canManageFamilyProfiles =
                    settingsRouteBinding.features.canManageFamilyProfiles,
                canAccessStethoscope =
                    settingsRouteBinding.features.canAccessStethoscope,
                canViewAiCalibration =
                    settingsRouteBinding.features.canViewAiCalibration,
                canViewDataStorage =
                    settingsRouteBinding.features.canViewDataStorage,
                showBackNavigation = primaryNavigationItems.size !in 3..5,
            )
        }

        authorizedMobileComposable(navController, "workspace-switcher") { backStackEntry ->
            val routeAuthority = remember(backStackEntry) {
                authorityStore.state.value.authority
            }
            val routeFirebaseOwner = remember(backStackEntry) {
                FirebaseAuthService.currentOwnerBindingOrNull()
            }
            WorkspaceSwitcherScreen(
                onNavigateBack = { navController.popBackStack() },
                onWorkspaceConfirmed = workspaceConfirmed@{ user, workspaceId ->
                    val expectedAuthority = routeAuthority
                    val expectedFirebaseOwner = routeFirebaseOwner
                    if (
                        expectedAuthority == null ||
                        expectedFirebaseOwner == null ||
                        authorityStore.state.value.authority != expectedAuthority ||
                        !FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner)
                    ) {
                        replaceProtectedStackWithSplash(expectedAuthority)
                        return@workspaceConfirmed
                    }
                    SmartHealthNotificationSession.deactivateAndClearPostedNotifications {
                        SmartHealthNotificationCenter.clearAllPostedNotifications()
                    }
                    onNotificationLaunchRequestConsumed()
                    when (
                        val update = authorityStore.confirmWorkspaceSwitch(
                            user = user,
                            expectedWorkspaceId = workspaceId,
                            expectedAuthority = expectedAuthority,
                            firebaseUserId = expectedFirebaseOwner.firebaseUserId,
                            verifiedAtElapsedRealtimeMillis = SystemClock.elapsedRealtime(),
                        )
                    ) {
                        is MobileAuthorityUpdate.Accepted -> {
                            if (
                                !FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner) ||
                                authorityStore.state.value.authority != update.authority
                            ) {
                                authorityStore.invalidateIfCurrent(update.authority)
                                replaceProtectedStackWithSplash(expectedAuthority)
                                return@workspaceConfirmed
                            }
                            coroutineScope.launch {
                                if (
                                    !FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner) ||
                                    authorityStore.state.value.authority != update.authority
                                ) {
                                    return@launch
                                }
                                runCatching {
                                    SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated(
                                        userId = user.id,
                                        workspaceId = user.canonicalWorkspaceId(),
                                    )
                                }
                            }
                            val rootRoute = ShcareMobileRouteContract
                                .initialDestinationFor(
                                    context = update.authority.toRouteAccessContext(),
                                    expectedAuthorityEpoch = update.authority.epoch,
                                )
                                .routePattern
                            navController.navigate(rootRoute) {
                                popUpTo(navController.graph.id) { inclusive = true }
                                launchSingleTop = true
                            }
                        }
                        is MobileAuthorityUpdate.Rejected -> {
                            replaceProtectedStackWithSplash(expectedAuthority)
                        }
                    }
                },
                onReauthorizationRequired = {
                    replaceProtectedStackWithSplash(routeAuthority)
                },
            )
        }

        authorizedMobileComposable(navController, "profile") {
            ProfileScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        authorizedMobileComposable(navController, "family-profiles") { backStackEntry ->
            val routeAuthority = remember(backStackEntry) {
                authorityStore.state.value.authority
            }
            val routeFirebaseOwner = remember(backStackEntry) {
                FirebaseAuthService.currentOwnerBindingOrNull()
            }
            FamilyProfilesScreen(
                onActiveProfileConfirmed = activeProfileConfirmed@{ result, expectedPatientId ->
                    val expectedAuthority = routeAuthority
                    val expectedFirebaseOwner = routeFirebaseOwner
                    if (
                        expectedAuthority == null ||
                        expectedFirebaseOwner == null ||
                        authorityStore.state.value.authority != expectedAuthority ||
                        !FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner)
                    ) {
                        replaceProtectedStackWithSplash(expectedAuthority)
                        return@activeProfileConfirmed
                    }
                    when (
                        val update = authorityStore.confirmActiveProfileSwitch(
                            result = result,
                            expectedPatientId = expectedPatientId,
                            expectedAuthority = expectedAuthority,
                            firebaseUserId = expectedFirebaseOwner.firebaseUserId,
                            verifiedAtElapsedRealtimeMillis = SystemClock.elapsedRealtime(),
                        )
                    ) {
                        is MobileAuthorityUpdate.Accepted -> {
                            if (
                                !FirebaseAuthService.isCurrentOwner(expectedFirebaseOwner) ||
                                authorityStore.state.value.authority != update.authority
                            ) {
                                authorityStore.invalidateIfCurrent(update.authority)
                                replaceProtectedStackWithSplash(expectedAuthority)
                            }
                        }
                        is MobileAuthorityUpdate.Rejected -> {
                            replaceProtectedStackWithSplash(expectedAuthority)
                        }
                    }
                },
                onNavigateBack = { navController.popBackStack() }
            )
        }

        authorizedMobileComposable(navController, "verify-phone-settings") {
            VerifyPhoneSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
            )
        }

        authorizedMobileComposable(navController, "re-verify/{type}") { backStackEntry ->
            ReVerifyContactScreen(
                verificationType = backStackEntry.arguments?.getString("type") ?: "email",
                onNavigateBack = { navController.popBackStack() },
            )
        }

        authorizedMobileComposable(navController, "privacy") { backStackEntry ->
            val privacyExpectedUserId = remember(backStackEntry) {
                routeAccessContext?.userId.orEmpty()
            }
            val privacyExpectedAuthSessionEpoch = remember(backStackEntry) {
                SmartHealthRepository.api.currentAuthSessionEpoch()
            }
            PrivacyScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToChangePassword = { navController.navigate("change-password") },
                onNavigateToDataAccess = { navController.navigate("data-access") },
                onNavigateToAccessLog = { navController.navigate("access-log") },
                biometricLocalUnlockState = biometricLocalUnlockState,
                onBiometricLocalUnlockAction = biometricLocalUnlockViewModel::onAction,
                expectedUserId = privacyExpectedUserId,
                expectedAuthSessionEpoch = privacyExpectedAuthSessionEpoch,
            )
        }

        authorizedMobileComposable(navController, "stethoscope-settings") {
            StethoscopeSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDevicePairing = {
                    navController.navigate("device-pairing?returnRoute=settings")
                },
                onNavigateToDeviceManagement = { navController.navigate("device-management") }
            )
        }

        authorizedMobileComposable(navController, "ai-calibration") {
            AICalibrationScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        authorizedMobileComposable(navController, "data-storage") {
            DataStorageScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToExportData = { navController.navigate("export-data") },
                canExportData = routeAccessContext
                    ?.capabilities
                    ?.any(MobileRouteCapabilities.DataExport::contains)
                    == true,
            )
        }

        authorizedMobileComposable(navController, "notification-settings") {
            NotificationSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                expectedUserId = routeAccessContext?.userId.orEmpty(),
                expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty(),
                role = routeAccessContext?.role.orEmpty(),
            )
        }

        authorizedMobileComposable(navController, "change-password") {
            ChangePasswordScreen(
                onNavigateBack = { navController.popBackStack() },
                onOpenPasswordRecovery = {
                    navController.navigate(ShcareMobileRoute.ForgotPassword.routePattern)
                },
                expectedAuthority = changePasswordRouteBinding.authority,
                currentAuthority = currentChangePasswordAuthority,
                invalidateExpectedAuthority = {
                    if (changePasswordAuthorityOwner != null) {
                        authorityStore.invalidateIfCurrent(changePasswordAuthorityOwner)
                    }
                },
                closeSession = {
                    settingsLogoutCoordinator.logout() == SettingsLogoutResult.Completed
                },
            )
        }

        authorizedMobileComposable(navController, "data-access") {
            DataAccessScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        authorizedMobileComposable(navController, "access-log") {
            AccessLogScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = ShcareMobileRoute.DeviceManagement.routePattern,
            arguments = listOf(
                navArgument("deviceId") {
                    type = NavType.StringType
                    defaultValue = ""
                },
            ),
        ) { backStackEntry ->
            val deviceId = Uri.decode(backStackEntry.arguments?.getString("deviceId").orEmpty())
            val canManageDevice = routeAccessContext
                ?.capabilities
                ?.any(MobileRouteCapabilities.DeviceManage::contains) == true
            DeviceManagementScreen(
                onNavigateBack = { navController.popBackStack() },
                onAddDevice = { navController.navigate("device-pairing?returnRoute=settings") },
                onConfigureWifi = { deviceId ->
                    navController.navigate("device-wifi/${Uri.encode(deviceId)}")
                },
                initialDeviceId = deviceId,
                canManageDevice = canManageDevice,
                currentUserId = routeAccessContext?.userId.orEmpty(),
            )
        }

        authorizedMobileComposable(
            navController = navController,
            route = ShcareMobileRoute.LegacyBluetoothSettings.routePattern,
            arguments = listOf(
                navArgument("deviceId") {
                    type = NavType.StringType
                    defaultValue = ""
                },
            ),
        ) { backStackEntry ->
            val deviceId = Uri.decode(backStackEntry.arguments?.getString("deviceId").orEmpty())
            val canManageDevice = routeAccessContext
                ?.capabilities
                ?.any(MobileRouteCapabilities.DeviceManage::contains) == true
            DeviceManagementScreen(
                onNavigateBack = { navController.popBackStack() },
                onAddDevice = { navController.navigate("device-pairing?returnRoute=settings") },
                onConfigureWifi = { resolvedDeviceId ->
                    navController.navigate("device-wifi/${Uri.encode(resolvedDeviceId)}")
                },
                initialDeviceId = deviceId,
                canManageDevice = canManageDevice,
                currentUserId = routeAccessContext?.userId.orEmpty(),
            )
        }

        authorizedMobileComposable(navController, "export-data") {
            ExportDataScreen(
                onNavigateBack = { navController.popBackStack() },
                expectedUserId = routeAccessContext?.userId.orEmpty(),
                expectedWorkspaceId = routeAccessContext?.workspaceId.orEmpty(),
            )
        }
    }
        }
    }
}

private fun captureBiometricLocalUnlockAuthority(
    authority: MobileSessionAuthority?,
): BiometricLocalUnlockAuthority? {
    val currentAuthority = authority ?: return null
    val firebaseOwner = FirebaseAuthService.currentOwnerBindingOrNull() ?: return null
    val api = SmartHealthRepository.api
    if (
        api.currentAuthToken().isNullOrBlank() ||
        firebaseOwner.firebaseUserId != currentAuthority.firebaseUserId
    ) {
        return null
    }
    return runCatching {
        BiometricLocalUnlockAuthority.create(
            backendUserId = currentAuthority.userId,
            firebaseUserId = currentAuthority.firebaseUserId,
            workspaceId = currentAuthority.workspaceId,
            authorityEpoch = currentAuthority.epoch,
            backendSessionEpoch = api.currentAuthSessionEpoch(),
            firebaseOwnerSessionEpoch = firebaseOwner.sessionEpoch,
        )
    }.getOrNull()
}
