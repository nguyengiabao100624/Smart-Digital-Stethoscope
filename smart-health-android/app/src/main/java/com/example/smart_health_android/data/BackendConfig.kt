package com.example.smart_health_android.data

import com.example.smart_health_android.BuildConfig

object BackendConfig {
    val HTTP_BASE_URL = BuildConfig.SMART_HEALTH_BASE_URL.trimEnd('/')
    val API_BASE_URL = "$HTTP_BASE_URL/api"
    val APP_WS_URL = HTTP_BASE_URL
        .replace("http://", "ws://")
        .replace("https://", "wss://") + "/app"

    fun audioUrl(path: String?): String? {
        if (path.isNullOrBlank()) return null
        return if (path.startsWith("http")) path else "$HTTP_BASE_URL$path"
    }
}
