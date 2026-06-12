package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.data.FirebaseAuthService
import com.example.smart_health_android.data.PendingRegistrationStore
import com.example.smart_health_android.data.SmartHealthPushRegistrar
import com.example.smart_health_android.data.SmartHealthRepository
import com.example.smart_health_android.data.AuthUser
import com.example.smart_health_android.data.toVietnameseMessage
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(
    onNavigateToLogin: () -> Unit,
    onNavigateToDoctorDashboard: () -> Unit,
    onNavigateToPatientDashboard: () -> Unit,
    onDoctorApprovalPending: () -> Unit,
    onNavigateToVerifyEmail: (accountType: String) -> Unit
) {
    val context = LocalContext.current
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isChecking by remember { mutableStateOf(true) }
    var retryKey by remember { mutableIntStateOf(0) }

    fun navigateForUser(user: AuthUser) {
        val isPendingDoctorApproval =
            user.requestedRole == "doctor" &&
                (user.roleRequestStatus == "pending" || user.roleRequestStatus == "needs_info")
        val opensClinicalDashboard = user.role in setOf(
            "doctor",
            "admin",
            "workspace_admin",
            "workspace_owner",
            "nurse",
            "technician"
        )
        when {
            isPendingDoctorApproval -> onDoctorApprovalPending()
            opensClinicalDashboard -> onNavigateToDoctorDashboard()
            else -> onNavigateToPatientDashboard()
        }
    }

    LaunchedEffect(retryKey) {
        isChecking = true
        errorMessage = null
        delay(700)
        try {
            val health = SmartHealthRepository.api.getHealth()
            if (!health.ok) {
                error("Máy chủ chưa sẵn sàng. Vui lòng thử lại.")
            }

            val idToken = runCatching { FirebaseAuthService.getFreshIdToken(forceRefresh = true) }.getOrNull()
            if (idToken.isNullOrBlank()) {
                onNavigateToLogin()
                return@LaunchedEffect
            }

            if (!FirebaseAuthService.isCurrentUserEmailVerified()) {
                val pending = PendingRegistrationStore.load(context)
                onNavigateToVerifyEmail(pending?.accountType ?: "patient")
                return@LaunchedEffect
            }

            val result = SmartHealthRepository.api.authenticateFirebase(idToken)
            runCatching { SmartHealthPushRegistrar.registerCurrentTokenIfAuthenticated() }
            navigateForUser(result.user)
        } catch (error: Exception) {
            errorMessage = error.toVietnameseMessage("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.")
        } finally {
            isChecking = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.linearGradient(
                    colors = listOf(PrimaryBlue, PrimaryTeal)
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(horizontal = 28.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Favorite,
                contentDescription = "Logo",
                tint = Color.White,
                modifier = Modifier.size(80.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "SmartHealth",
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Ống nghe điện tử thông minh",
                color = Color.White.copy(alpha = 0.8f),
                fontSize = 16.sp
            )
            Spacer(modifier = Modifier.height(28.dp))
            if (isChecking) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Đang kiểm tra kết nối...",
                    color = Color.White.copy(alpha = 0.86f),
                    fontSize = 14.sp
                )
            }
            errorMessage?.let { message ->
                Spacer(modifier = Modifier.height(24.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White.copy(alpha = 0.14f), androidx.compose.foundation.shape.RoundedCornerShape(18.dp))
                        .padding(18.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = message,
                        color = Color.White,
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    Button(
                        onClick = { retryKey += 1 },
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = PrimaryBlue)
                    ) {
                        Text("Thử lại", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
