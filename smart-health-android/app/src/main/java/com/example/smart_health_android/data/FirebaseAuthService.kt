package com.example.smart_health_android.data

import com.google.android.gms.tasks.Task
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.UserProfileChangeRequest
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

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

    suspend fun resendEmailVerification() {
        val user = auth.currentUser ?: error("Chưa đăng nhập")
        if (user.isEmailVerified) {
            return
        }
        user.sendEmailVerification().await()
    }

    suspend fun reloadCurrentUser(): Boolean {
        val user = auth.currentUser ?: error("Chưa đăng nhập")
        user.reload().await()
        return auth.currentUser?.isEmailVerified == true
    }

    fun currentEmail(): String {
        return auth.currentUser?.email.orEmpty()
    }

    fun isCurrentUserEmailVerified(): Boolean {
        return auth.currentUser?.isEmailVerified == true
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
