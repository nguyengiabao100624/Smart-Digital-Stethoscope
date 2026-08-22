package com.example.smart_health_android.security

import com.example.smart_health_android.data.FirebaseOwnerBinding
import com.example.smart_health_android.data.FirebaseSignInReceipt
import com.example.smart_health_android.data.ownerBinding
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthOwnerRaceSourceContractTest {
    @Test
    fun `Firebase sign in keeps the AuthResult owner across token refresh`() {
        val source = source("data/FirebaseAuthService.kt")

        assertTrue(source.contains("val result = auth.signInWithEmailAndPassword"))
        assertTrue(source.contains("val user = result.user"))
        assertTrue(source.contains("val idToken = user.getIdToken(true).await().token"))
        assertFalse(
            source.contains(
                """
                    auth.signInWithEmailAndPassword(email, password).await()
                    return getFreshIdToken
                """.trimIndent(),
            ),
        )
    }

    @Test
    fun `Firebase sign in receipt exposes the normalized identity and captured session epoch`() {
        val receipt = FirebaseSignInReceipt(
            firebaseUserId = "firebase-a",
            email = " DOCTOR-A@shcare.vn ",
            idToken = "id-token-a",
            ownerSessionEpoch = 41L,
        )

        assertEquals(
            FirebaseOwnerBinding(
                firebaseUserId = "firebase-a",
                email = "doctor-a@shcare.vn",
                sessionEpoch = 41L,
            ),
            receipt.ownerBinding(),
        )
    }

    @Test
    fun `Firebase account creation returns the captured AuthResult owner to signup`() {
        val firebase = source("data/FirebaseAuthService.kt")
        val signup = source("security/SignUpViewModel.kt")

        assertTrue(firebase.contains("data class FirebaseAccountCreationReceipt("))
        assertTrue(firebase.contains("val result = auth.createUserWithEmailAndPassword"))
        assertTrue(firebase.contains("val user = result.user"))
        assertTrue(firebase.contains("return FirebaseAccountCreationReceipt("))
        assertTrue(signup.contains("firebase.createAccount("))
        assertTrue(signup.contains(").ownerBinding()"))
        assertTrue(signup.contains("requireCurrentOwner(owner)"))
        assertTrue(signup.contains("checkpoint.saveDraft(registration)"))
        assertTrue(signup.contains("checkpoint.bindToOwner(registration, owner)"))
        assertFalse(signup.contains("FirebaseAuthService.currentUserIdOrNull()"))
    }

    @Test
    fun `login and backend exchange pin their owner across provider mutations`() {
        val login = source("security/LoginViewModel.kt")
        val screen = source("ui/screens/LoginScreen.kt")
        val api = source("data/SmartHealthApi.kt")

        assertTrue(login.contains("catch (error: CancellationException)"))
        assertTrue(login.contains("requireLoginFirebaseOwner(pending)"))
        assertTrue(login.contains("clearAuthTokenIfCurrent"))
        assertTrue(login.contains("data class Authenticated(\n        val user: AuthUser,\n        val firebaseOwner: FirebaseOwnerBinding,"))
        assertTrue(login.contains("data class DoctorApprovalPending(\n        val firebaseOwner: FirebaseOwnerBinding,"))
        assertTrue(login.contains("data class VerifyEmail(\n        val accountType: String,\n        val firebaseOwner: FirebaseOwnerBinding,"))
        assertTrue(login.contains("LoginResult.VerifyEmail(accountType, pending.firebaseOwner)"))
        assertTrue(login.contains("LoginResult.DoctorApprovalPending(pending.firebaseOwner)"))
        assertTrue(login.contains("LoginResult.Authenticated(user, pending.firebaseOwner)"))
        assertFalse(login.contains("currentOwnerBindingOrNull"))
        assertFalse(login.contains("runCatching { repository.signIn"))
        assertFalse(login.contains("runCatching {\n                repository.completeTwoFactor"))
        assertTrue(screen.contains("onLoginSuccess: (user: AuthUser, firebaseOwner: FirebaseOwnerBinding) -> Unit"))
        assertTrue(screen.contains("onDoctorApprovalPending: (firebaseOwner: FirebaseOwnerBinding) -> Unit"))
        assertTrue(screen.contains("onNavigateToVerifyEmail: (accountType: String, firebaseOwner: FirebaseOwnerBinding) -> Unit"))
        assertTrue(screen.contains("onLoginSuccess(effect.user, effect.firebaseOwner)"))
        assertTrue(screen.contains("onDoctorApprovalPending(effect.firebaseOwner)"))
        assertTrue(screen.contains("onNavigateToVerifyEmail(effect.accountType, effect.firebaseOwner)"))
        assertTrue(api.contains("expectedAuthSessionEpoch: Long"))
        assertTrue(api.contains("pinAuthSessionAtEpoch"))
        assertTrue(api.contains("withAuth(pinnedSession)"))
        assertTrue(api.contains("commitTwoFactorTokensIfCurrent"))
    }

    private fun source(relativePath: String): String =
        projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/$relativePath")
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
