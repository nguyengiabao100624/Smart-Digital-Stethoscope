package com.example.smart_health_android.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.smart_health_android.BuildConfig
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.notifications.NotificationNavigationPolicy
import com.example.smart_health_android.notifications.SmartHealthNotificationDestination
import com.example.smart_health_android.appointments.AppointmentRoute
import com.example.smart_health_android.ui.motion.smartHealthEnterTransition
import com.example.smart_health_android.ui.motion.smartHealthExitTransition
import com.example.smart_health_android.ui.motion.smartHealthPopEnterTransition
import com.example.smart_health_android.ui.motion.smartHealthPopExitTransition
import com.example.smart_health_android.ui.screens.*
import kotlinx.coroutines.launch

@Composable
fun AppNavGraph(
    navController: NavHostController = rememberNavController(),
    startDestination: String = "splash",
    notificationDestination: SmartHealthNotificationDestination? = null,
    onNotificationDestinationConsumed: () -> Unit = {},
) {
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val coroutineScope = rememberCoroutineScope()
    val performLogout: (String) -> Unit = { popUpRoute ->
        coroutineScope.launch {
            runCatching { SmartHealthPushRegistrar.unregisterCurrentToken() }
            runCatching { SmartHealthRepository.api.logout() }
            FirebaseAuthService.signOut()
            SmartHealthRepository.api.setAuthToken(null)
            navController.navigate("login") {
                popUpTo(popUpRoute) { inclusive = true }
            }
        }
    }
    LaunchedEffect(notificationDestination, currentBackStackEntry?.destination?.route) {
        val destination = notificationDestination ?: return@LaunchedEffect
        val currentRoute = currentBackStackEntry?.destination?.route
        if (currentRoute == destination.route) {
            onNotificationDestinationConsumed()
            return@LaunchedEffect
        }
        if (
            NotificationNavigationPolicy.canNavigate(
                currentRoute = currentRoute,
                hasAuthenticatedSession = SmartHealthRepository.api.currentAuthToken() != null,
            )
        ) {
            navController.navigate(destination.route) {
                launchSingleTop = true
            }
            onNotificationDestinationConsumed()
        }
    }

    NavHost(
        navController = navController,
        startDestination = startDestination,
        enterTransition = { smartHealthEnterTransition() },
        exitTransition = { smartHealthExitTransition() },
        popEnterTransition = { smartHealthPopEnterTransition() },
        popExitTransition = { smartHealthPopExitTransition() },
    ) {
        composable("splash") {
            SplashScreen(
                onNavigateToLogin = {
                    navController.navigate("login") {
                        popUpTo("splash") { inclusive = true }
                    }
                },
                onNavigateToDoctorDashboard = {
                    navController.navigate("dashboard") {
                        popUpTo("splash") { inclusive = true }
                    }
                },
                onNavigateToPatientDashboard = {
                    navController.navigate("patient-dashboard") {
                        popUpTo("splash") { inclusive = true }
                    }
                },
                onDoctorApprovalPending = {
                    navController.navigate("doctor-approval-pending") {
                        popUpTo("splash") { inclusive = true }
                    }
                },
                onNavigateToVerifyEmail = { accountType ->
                    navController.navigate("verify-email?accountType=${Uri.encode(accountType)}") {
                        popUpTo("splash") { inclusive = true }
                    }
                }
            )
        }
        
        composable("login") {
            LoginScreen(
                onLoginSuccess = { isDoctorMode ->
                    val route = if (isDoctorMode) "dashboard" else "patient-dashboard"
                    navController.navigate(route) {
                        popUpTo("login") { inclusive = true }
                    }
                },
                onDoctorApprovalPending = {
                    navController.navigate("doctor-approval-pending") {
                        popUpTo("login") { inclusive = true }
                    }
                },
                onNavigateToVerifyEmail = { accountType ->
                    navController.navigate("verify-email?accountType=$accountType")
                },
                onNavigateToSignUp = { navController.navigate("sign-up") },
                onNavigateToForgotPassword = { navController.navigate("forgot-password") },
            )
        }

        composable("sign-up") {
            SignUpScreen(
                onNavigateToLogin = { navController.popBackStack() },
                onNavigateToVerifyEmail = { accountType ->
                    navController.navigate("verify-email?accountType=$accountType")
                }
            )
        }

        composable(
            route = "verify-email?accountType={accountType}",
            arguments = listOf(
                navArgument("accountType") {
                    type = NavType.StringType
                    defaultValue = "patient"
                }
            )
        ) { backStackEntry ->
            FirebaseVerifyEmailScreen(
                onNavigateBack = { navController.popBackStack() },
                fallbackAccountType = backStackEntry.arguments?.getString("accountType") ?: "patient",
                onVerified = { accountType ->
                    val nextRoute = if (accountType == "doctor" || accountType == "solo_doctor") "doctor-approval-pending" else "patient-dashboard"
                    navController.navigate(nextRoute) {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }

        composable("doctor-approval-pending") {
            DoctorApprovalPendingScreen(
                onApproved = {
                    navController.navigate("dashboard") {
                        popUpTo("doctor-approval-pending") { inclusive = true }
                    }
                },
                onLogout = {
                    performLogout("doctor-approval-pending")
                }
            )
        }

        composable("forgot-password") {
            ForgotPasswordScreen(
                onNavigateToLogin = { navController.popBackStack() }
            )
        }

        if (BuildConfig.SMART_HEALTH_PHONE_AUTH_ENABLED) {
            composable("phone-login") {
                PhoneLoginScreen(
                    onNavigateToLogin = { navController.popBackStack() },
                    onLoginSuccess = {
                        navController.navigate("dashboard") {
                            popUpTo("login") { inclusive = true }
                        }
                    }
                )
            }
        }
        
        composable("dashboard") {
            DashboardScreen(
                onNavigateToSettings = { navController.navigate("settings") },
                onNavigateToMonitoring = { navController.navigate("monitoring") },
                onNavigateToRecords = { navController.navigate("records") },
                onNavigateToAssistant = { navController.navigate("ai-assistant") },
                onNavigateToNewScan = { navController.navigate("new-scan") },
                onNavigateToNotifications = { navController.navigate("notifications") },
                onNavigateToBluetooth = { navController.navigate("device-pairing?returnRoute=dashboard") },
                onNavigateToAppointments = { navController.navigate(AppointmentRoute.List.route) },
                onNavigateToRecordDetail = { recordId ->
                    navController.navigate("record-detail/${Uri.encode(recordId)}")
                }
            )
        }

        composable("patient-dashboard") {
            PatientDashboardScreen(
                onNavigateToSettings = { navController.navigate("settings") },
                onNavigateToNotifications = { navController.navigate("notifications") },
                onNavigateToBluetooth = { navController.navigate("device-pairing?returnRoute=patient-dashboard") },
                onNavigateToMonitoring = { navController.navigate("monitoring") },
                onNavigateToRecords = { navController.navigate("records") },
                onNavigateToAssistant = { navController.navigate("ai-assistant") },
                onNavigateToAppointments = { navController.navigate(AppointmentRoute.List.route) },
                onNavigateToRecordDetail = { recordId ->
                    navController.navigate("record-detail/${Uri.encode(recordId)}")
                }
            )
        }

        composable("notifications") {
            NotificationsScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(
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

        composable("new-scan") {
            NewScanScreen(
                onNavigateBack = { navController.popBackStack() },
                onScanStarted = { scanId ->
                    navController.navigate("monitoring?scanId=${Uri.encode(scanId)}")
                }
            )
        }

        composable(
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

        composable(
            route = "device-pairing?returnRoute={returnRoute}",
            arguments = listOf(
                navArgument("returnRoute") {
                    type = NavType.StringType
                    defaultValue = "dashboard"
                }
            )
        ) { backStackEntry ->
            val returnRoute = backStackEntry.arguments?.getString("returnRoute") ?: "dashboard"
            DevicePairingScreen(
                onNavigateBack = { navController.popBackStack() },
                onConnectionSuccess = { deviceName ->
                    navController.navigate(
                        "connection-success/${Uri.encode(deviceName)}?returnRoute=${Uri.encode(returnRoute)}"
                    ) {
                        popUpTo("device-pairing?returnRoute={returnRoute}") { inclusive = true }
                    }
                }
            )
        }

        // Compatibility alias for notification/deep-link payloads issued before the QR claim flow.
        composable(
            route = "bluetooth?returnRoute={returnRoute}",
            arguments = listOf(
                navArgument("returnRoute") {
                    type = NavType.StringType
                    defaultValue = "dashboard"
                }
            )
        ) { backStackEntry ->
            val returnRoute = backStackEntry.arguments?.getString("returnRoute") ?: "dashboard"
            DevicePairingScreen(
                onNavigateBack = { navController.popBackStack() },
                onConnectionSuccess = { deviceName ->
                    navController.navigate(
                        "connection-success/${Uri.encode(deviceName)}?returnRoute=${Uri.encode(returnRoute)}"
                    ) {
                        popUpTo("bluetooth?returnRoute={returnRoute}") { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = "connection-success/{deviceName}?returnRoute={returnRoute}",
            arguments = listOf(
                navArgument("deviceName") { type = NavType.StringType },
                navArgument("returnRoute") {
                    type = NavType.StringType
                    defaultValue = "dashboard"
                }
            )
        ) { backStackEntry ->
            val deviceName = Uri.decode(backStackEntry.arguments?.getString("deviceName").orEmpty())
            val returnRoute = Uri.decode(backStackEntry.arguments?.getString("returnRoute") ?: "dashboard")
            ConnectionSuccessScreen(
                deviceName = deviceName,
                onFinish = {
                    navController.navigate(returnRoute) {
                        popUpTo(returnRoute) { inclusive = false }
                        launchSingleTop = true
                    }
                }
            )
        }

        composable("records") {
            MedicalRecordsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDetail = { recordId ->
                    navController.navigate("record-detail/${Uri.encode(recordId)}")
                }
            )
        }

        composable(
            route = "record-detail/{recordId}",
            arguments = listOf(navArgument("recordId") { type = NavType.StringType })
        ) { backStackEntry ->
            RecordDetailScreen(
                recordId = Uri.decode(backStackEntry.arguments?.getString("recordId").orEmpty()),
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("ai-assistant") {
            AIAssistantScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("settings") {
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
                onLogout = {
                    performLogout("dashboard")
                }
            )
        }

        composable("workspace-switcher") {
            WorkspaceSwitcherScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("profile") {
            ProfileScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToVerifyPhoneSettings = { navController.navigate("verify-phone-settings") },
                onNavigateToReVerifyContact = { type, contact ->
                    navController.navigate("re-verify/$type/${Uri.encode(contact)}")
                }
            )
        }

        composable("family-profiles") {
            FamilyProfilesScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("verify-phone-settings") {
            VerifyPhoneSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onVerified = {
                    navController.navigate("profile") {
                        popUpTo("profile") { inclusive = false }
                        launchSingleTop = true
                    }
                }
            )
        }

        composable("re-verify/{type}/{contact}") { backStackEntry ->
            ReVerifyContactScreen(
                verificationType = backStackEntry.arguments?.getString("type") ?: "email",
                contact = Uri.decode(backStackEntry.arguments?.getString("contact").orEmpty()),
                onNavigateBack = { navController.popBackStack() },
                onVerified = {
                    navController.navigate("profile") {
                        popUpTo("profile") { inclusive = false }
                        launchSingleTop = true
                    }
                }
            )
        }

        composable("privacy") {
            PrivacyScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToChangePassword = { navController.navigate("change-password") },
                onNavigateToDataAccess = { navController.navigate("data-access") },
                onNavigateToAccessLog = { navController.navigate("access-log") }
            )
        }

        composable("stethoscope-settings") {
            StethoscopeSettingsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToBluetoothPairing = { navController.navigate("device-pairing?returnRoute=dashboard") },
                onNavigateToBluetoothSettings = { navController.navigate("bluetooth-settings") }
            )
        }

        composable("ai-calibration") {
            AICalibrationScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("data-storage") {
            DataStorageScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToExportData = { navController.navigate("export-data") },
                onNavigateToDeleteData = { navController.navigate("delete-data") }
            )
        }

        composable("notification-settings") {
            NotificationSettingsScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("change-password") {
            ChangePasswordScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("data-access") {
            DataAccessScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("access-log") {
            AccessLogScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("bluetooth-settings") {
            DeviceManagementScreen(
                onNavigateBack = { navController.popBackStack() },
                onAddDevice = { navController.navigate("device-pairing?returnRoute=dashboard") }
            )
        }

        composable("delete-data") {
            DeleteDataScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("export-data") {
            ExportDataScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }
    }
}
