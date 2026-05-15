package com.example.smart_health_android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.example.smart_health_android.navigation.AppNavGraph
import com.example.smart_health_android.ui.theme.Background
import com.example.smart_health_android.ui.theme.SmarthealthandroidTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SmarthealthandroidTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Background
                ) {
                    AppNavGraph()
                }
            }
        }
    }
}