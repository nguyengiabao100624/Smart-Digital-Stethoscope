package com.example.smart_health_android.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.smart_health_android.ui.screens.*

@Composable
fun AppNavGraph(
    navController: NavHostController = rememberNavController(),
    startDestination: String = "splash"
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
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
                onNavigateToSignUp = { navController.navigate("sign-up") },
                onNavigateToForgotPassword = { navController.navigate("forgot-password") },
                onNavigateToPhoneLogin = { navController.navigate("phone-login") }
            )
        }

        composable("sign-up") {
            SignUpScreen(
                onNavigateToLogin = { navController.popBackStack() },
                onNavigateToVerifyEmail = { navController.navigate("verify-email") }
            )
        }

        composable("verify-email") {
            VerifyEmailScreen(
                onNavigateBack = { navController.popBackStack() },
                onVerified = {
                    navController.navigate("dashboard") {
                        popUpTo("login") { inclusive = true }
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
                onNavigateToBluetooth = { navController.navigate("bluetooth") },
                onNavigateToRecordDetail = { navController.navigate("record-detail") }
            )
        }

        composable("patient-dashboard") {
            PatientDashboardScreen(
                onNavigateToSettings = { navController.navigate("settings") },
                onNavigateToNotifications = { navController.navigate("notifications") },
                onNavigateToBluetooth = { navController.navigate("bluetooth") },
                onNavigateToMonitoring = { navController.navigate("monitoring") },
                onNavigateToRecords = { navController.navigate("records") },
                onNavigateToAssistant = { navController.navigate("ai-assistant") },
                onNavigateToRecordDetail = { navController.navigate("record-detail") }
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
                onNavigateToMonitoring = { navController.navigate("monitoring") }
            )
        }

        composable("monitoring") {
            LiveMonitoringScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("bluetooth") {
            BluetoothPairingScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable("records") {
            MedicalRecordsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDetail = { navController.navigate("record-detail") }
            )
        }

        composable("record-detail") {
            RecordDetailScreen(
                recordId = "HS-2844",
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
            BluetoothSettingsScreen(
                onNavigateBack = { navController.popBackStack() }
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
