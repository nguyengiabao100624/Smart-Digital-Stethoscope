package com.example.smart_health_android.data

import com.google.android.gms.tasks.Task
import com.google.firebase.auth.EmailAuthProvider
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.UserProfileChangeRequest
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class EmailVerificationResendResult {
    Sent,
    AlreadyVerified
}

object FirebaseAuthService {
    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }

    suspend fun signIn(email: String, password: String): String {
        auth.signInWithEmailAndPassword(email, password).await()
        return getFreshIdToken(forceRefresh = true)
    }

    suspend fun createAccount(email: String, password: String, displayName: String): String {
        val result = auth.createUserWithEmailAndPassword(email, password).await()
        val user = result.user ?: error("Không thể tạo tài khoản")
        if (displayName.isNotBlank()) {
            val profileUpdate = UserProfileChangeRequest.Builder()
                .setDisplayName(displayName)
                .build()
            user.updateProfile(profileUpdate).await()
        }
        user.sendEmailVerification().await()
        return getFreshIdToken(forceRefresh = true)
    }

    suspend fun resendEmailVerification(): EmailVerificationResendResult {
        val user = auth.currentUser ?: error("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại để gửi email xác thực.")
        user.reload().await()
        val refreshedUser = auth.currentUser ?: error("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại để gửi email xác thực.")
        if (refreshedUser.isEmailVerified) {
            return EmailVerificationResendResult.AlreadyVerified
        }
        refreshedUser.sendEmailVerification().await()
        return EmailVerificationResendResult.Sent
    }

    suspend fun sendPasswordResetEmail(email: String) {
        auth.sendPasswordResetEmail(email).await()
    }

    suspend fun reloadCurrentUser(): Boolean {
        val user = auth.currentUser ?: error("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại để kiểm tra xác thực email.")
        user.reload().await()
        return auth.currentUser?.isEmailVerified == true
    }

    fun currentEmail(): String {
        return auth.currentUser?.email.orEmpty()
    }

    fun isCurrentUserEmailVerified(): Boolean {
        return auth.currentUser?.isEmailVerified == true
    }

    suspend fun changePassword(currentPassword: String, newPassword: String) {
        val user = auth.currentUser ?: error("Chưa đăng nhập")
        val email = user.email ?: error("Tài khoản hiện tại chưa có email đăng nhập")
        val credential = EmailAuthProvider.getCredential(email, currentPassword)
        user.reauthenticate(credential).await()
        user.updatePassword(newPassword).await()
    }

    suspend fun getFreshIdToken(forceRefresh: Boolean = false): String {
        val user = auth.currentUser ?: error("Chưa đăng nhập")
        val token = user.getIdToken(forceRefresh).await().token
        return token?.takeIf { it.isNotBlank() } ?: error("Không lấy được mã xác thực đăng nhập")
    }

    fun signOut() {
        auth.signOut()
    }

    private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
        addOnSuccessListener { result ->
            continuation.resume(result)
        }
        addOnFailureListener { error ->
            continuation.resumeWithException(error)
        }
        addOnCanceledListener {
            continuation.cancel()
        }
    }
}
