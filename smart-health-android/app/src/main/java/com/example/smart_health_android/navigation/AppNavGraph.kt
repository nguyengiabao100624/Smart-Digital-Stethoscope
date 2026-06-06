package com.example.smart_health_android.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.ui.motion.smartHealthEnterTransition
import com.example.smart_health_android.ui.motion.smartHealthExitTransition
import com.example.smart_health_android.ui.motion.smartHealthPopEnterTransition
import com.example.smart_health_android.ui.motion.smartHealthPopExitTransition
import com.example.smart_health_android.ui.screens.*

@Composable
fun AppNavGraph(
    navController: NavHostController = rememberNavController(),
    startDestination: String = "splash"
) {
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
                onNavigateToPhoneLogin = { navController.navigate("phone-login") }
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
                    FirebaseAuthService.signOut()
                    SmartHealthRepository.api.setAuthToken(null)
                    navController.navigate("login") {
                        popUpTo("doctor-approval-pending") { inclusive = true }
                    }
                }
            )
        }

        composable("forgot-password") {
            ForgotPasswordScreen(
                onNavigateToLogin = { navController.popBackStack() }
            )
        }

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
        
        composable("dashboard") {
            DashboardScreen(
                onNavigateToSettings = { navController.navigate("settings") },
                onNavigateToMonitoring = { navController.navigate("monitoring") },
                onNavigateToRecords = { navController.navigate("records") },
                onNavigateToAssistant = { navController.navigate("ai-assistant") },
                onNavigateToNewScan = { navController.navigate("new-scan") },
                onNavigateToNotifications = { navController.navigate("notifications") },
                onNavigateToBluetooth = { navController.navigate("bluetooth?returnRoute=dashboard") },
                onNavigateToRecordDetail = { recordId ->
                    navController.navigate("record-detail/${Uri.encode(recordId)}")
                }
            )
        }

        composable("patient-dashboard") {
            PatientDashboardScreen(
                onNavigateToSettings = { navController.navigate("settings") },
                onNavigateToNotifications = { navController.navigate("notifications") },
                onNavigateToBluetooth = { navController.navigate("bluetooth?returnRoute=patient-dashboard") },
                onNavigateToMonitoring = { navController.navigate("monitoring") },
                onNavigateToRecords = { navController.navigate("records") },
                onNavigateToAssistant = { navController.navigate("ai-assistant") },
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
                onNavigateBack = { navController.popBackStack() }
            )
        }

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
            BluetoothPairingScreen(
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
                onNavigateToPrivacy = { navController.navigate("privacy") },
                onNavigateToStethoscopeSettings = { navController.navigate("stethoscope-settings") },
                onNavigateToAICalibration = { navController.navigate("ai-calibration") },
                onNavigateToDataStorage = { navController.navigate("data-storage") },
                onNavigateToNotificationSettings = { navController.navigate("notification-settings") },
                onLogout = {
                    FirebaseAuthService.signOut()
                    SmartHealthRepository.api.setAuthToken(null)
                    navController.navigate("login") {
                        popUpTo("dashboard") { inclusive = true }
                    }
                }
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
                onNavigateToBluetoothPairing = { navController.navigate("bluetooth?returnRoute=dashboard") },
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
                onAddDevice = { navController.navigate("bluetooth?returnRoute=dashboard") }
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
