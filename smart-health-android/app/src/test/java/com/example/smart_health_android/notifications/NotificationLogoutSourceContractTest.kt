package com.example.smart_health_android.notifications

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class NotificationLogoutSourceContractTest {
    private val apiSource = projectFile(
        "src/main/java/com/example/smart_health_android/data/SmartHealthApi.kt",
    ).readText()
    private val registrarSource = projectFile(
        "src/main/java/com/example/smart_health_android/data/SmartHealthPushRegistrar.kt",
    ).readText()
    private val navigationSource = projectFile(
        "src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt",
    ).readText()

    @Test
    fun exposesAuthenticatedTokenUnregisterContract() {
        assertTrue(apiSource.contains("suspend fun unregisterNotificationDevice"))
        assertTrue(apiSource.contains("notifications/unregister-device"))
        assertTrue(registrarSource.contains("suspend fun unregisterCurrentToken"))
    }

    @Test
    fun logoutUnregistersPushBeforeClearingAuthentication() {
        val logoutStart = navigationSource.indexOf("val performLogout")
        val unregister = navigationSource.indexOf(
            "SmartHealthPushRegistrar.unregisterCurrentToken()",
            startIndex = logoutStart,
        )
        val firebaseSignOut = navigationSource.indexOf("FirebaseAuthService.signOut()", unregister)
        val clearBackendToken = navigationSource.indexOf("setAuthToken(null)", unregister)

        assertTrue(logoutStart >= 0)
        assertTrue(unregister > logoutStart)
        assertTrue(firebaseSignOut > unregister)
        assertTrue(clearBackendToken > unregister)
    }

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
