package com.example.smart_health_android.ui.foundation

enum class ShcareThemeMode {
    System,
    Light,
    Dark;

    fun resolveDarkTheme(systemInDarkTheme: Boolean): Boolean = when (this) {
        System -> systemInDarkTheme
        Light -> false
        Dark -> true
    }
}

enum class ShcareStateAction {
    None,
    Retry,
    RequestPermission,
}

enum class ShcareStateKind {
    Loading,
    Empty,
    Error,
    Offline,
    Permission;

    val defaultAction: ShcareStateAction
        get() = when (this) {
            Loading, Empty -> ShcareStateAction.None
            Error, Offline -> ShcareStateAction.Retry
            Permission -> ShcareStateAction.RequestPermission
        }
}
