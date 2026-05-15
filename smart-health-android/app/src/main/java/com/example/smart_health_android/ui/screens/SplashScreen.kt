package com.example.smart_health_android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smart_health_android.ui.theme.PrimaryBlue
import com.example.smart_health_android.ui.theme.PrimaryTeal
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(onNavigateToLogin: () -> Unit) {
    LaunchedEffect(key1 = true) {
        delay(2000)
        onNavigateToLogin()
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
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
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
        }
    }
}
