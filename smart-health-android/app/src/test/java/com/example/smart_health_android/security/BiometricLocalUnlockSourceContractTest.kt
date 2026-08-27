package com.example.smart_health_android.security

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BiometricLocalUnlockSourceContractTest {
    @Test
    fun `keystore key requires strong biometric and invalidates on enrollment change`() {
        val source = securitySource("AndroidBiometricLocalUnlockRepository.kt")

        assertTrue(source.contains("setUserAuthenticationRequired(true)"))
        assertTrue(source.contains("setInvalidatedByBiometricEnrollment(true)"))
        assertTrue(source.contains("KeyProperties.AUTH_BIOMETRIC_STRONG"))
        assertTrue(source.contains("BiometricManager.Authenticators.BIOMETRIC_STRONG"))
        assertFalse(source.contains("DEVICE_CREDENTIAL"))
    }

    @Test
    fun `preferences persist only ciphertext iv and schema version`() {
        val source = securitySource("AndroidBiometricLocalUnlockRepository.kt")
        val preferenceWrite = source.substringAfter("val persisted = preferences.edit()")
            .substringBefore(".commit()")

        assertTrue(preferenceWrite.contains("KEY_CIPHERTEXT"))
        assertTrue(preferenceWrite.contains("KEY_IV"))
        assertTrue(preferenceWrite.contains("KEY_VERSION"))
        assertFalse(preferenceWrite.contains("JSON_BACKEND_USER_ID"))
        assertFalse(preferenceWrite.contains("JSON_FIREBASE_USER_ID"))
        assertFalse(preferenceWrite.contains("JSON_WORKSPACE_ID"))
    }

    @Test
    fun `decrypted authority binds account workspace and both provider session epochs`() {
        val source = securitySource("AndroidBiometricLocalUnlockRepository.kt")

        assertTrue(source.contains("storedAuthority != pending.authority"))
        assertTrue(source.contains("JSON_AUTHORITY_EPOCH"))
        assertTrue(source.contains("JSON_BACKEND_SESSION_EPOCH"))
        assertTrue(source.contains("JSON_FIREBASE_OWNER_SESSION_EPOCH"))
        assertTrue(source.contains("BiometricLocalUnlockCompletion.AuthorityMismatch"))
    }

    @Test
    fun `protected navigation is gated before NavHost composition`() {
        val source = projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt")
            .readText()
        val gateIndex = source.indexOf("BiometricLocalUnlockGate(")
        val navHostIndex = source.indexOf("NavHost(", startIndex = gateIndex)

        assertTrue(gateIndex >= 0)
        assertTrue(navHostIndex > gateIndex)
        assertTrue(source.contains("!biometricAuthorityIsCurrent"))
        assertTrue(source.contains("BiometricLocalUnlockUiAction.AppBackgrounded"))
    }

    @Test
    fun `compose surfaces do not construct biometric manager prompt or keystore`() {
        val privacy = projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/ui/screens/PrivacyScreen.kt")
            .readText()
        val localUnlockUi = projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/ui/screens/BiometricLocalUnlockUi.kt")
            .readText()
        val uiSource = privacy + localUnlockUi

        assertFalse(uiSource.contains("BiometricManager"))
        assertFalse(uiSource.contains("BiometricPrompt"))
        assertFalse(uiSource.contains("SharedPreferences"))
        assertFalse(uiSource.contains("KeyStore"))
    }

    private fun securitySource(name: String): String = projectDirectory()
        .resolve("src/main/java/com/example/smart_health_android/security/$name")
        .readText()

    private fun projectDirectory(): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory,
            workingDirectory.resolve("app"),
        ).firstOrNull { candidate ->
            candidate.resolve("src/main/java").isDirectory
        } ?: error("Cannot locate Android app module from ${workingDirectory.absolutePath}")
    }
}
