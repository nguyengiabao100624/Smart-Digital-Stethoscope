package com.example.smart_health_android.data

import com.example.smart_health_android.BuildConfig
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

data class FirebaseSignInReceipt(
    val firebaseUserId: String,
    val email: String,
    val idToken: String,
    val ownerSessionEpoch: Long,
)

data class FirebaseAccountCreationReceipt(
    val firebaseUserId: String,
    val email: String,
    val idToken: String,
    val ownerSessionEpoch: Long,
)

data class FirebaseOwnerBinding(
    val firebaseUserId: String,
    val email: String,
    val sessionEpoch: Long,
)

fun FirebaseSignInReceipt.ownerBinding(): FirebaseOwnerBinding = FirebaseOwnerBinding(
    firebaseUserId = firebaseUserId,
    email = normalizePendingRegistrationEmail(email),
    sessionEpoch = ownerSessionEpoch,
)

fun FirebaseAccountCreationReceipt.ownerBinding(): FirebaseOwnerBinding = FirebaseOwnerBinding(
    firebaseUserId = firebaseUserId,
    email = normalizePendingRegistrationEmail(email),
    sessionEpoch = ownerSessionEpoch,
)

object FirebaseAuthService {
    private val ownerLock = Any()
    private var observedFirebaseUserId = ""
    private var observedFirebaseEmail = ""
    private var ownerSessionEpoch = 0L
    private val auth: FirebaseAuth by lazy {
        FirebaseAuth.getInstance().also { instance ->
            if (
                BuildConfig.DEBUG &&
                BuildConfig.SHCARE_FIREBASE_AUTH_EMULATOR_HOST.isNotBlank() &&
                BuildConfig.SHCARE_FIREBASE_AUTH_EMULATOR_PORT in 1..65535
            ) {
                instance.useEmulator(
                    BuildConfig.SHCARE_FIREBASE_AUTH_EMULATOR_HOST,
                    BuildConfig.SHCARE_FIREBASE_AUTH_EMULATOR_PORT,
                )
            }
            instance.addAuthStateListener { state ->
                observeOwner(
                    firebaseUserId = state.currentUser?.uid.orEmpty(),
                    email = state.currentUser?.email.orEmpty(),
                )
            }
        }
    }

    suspend fun signIn(email: String, password: String): FirebaseSignInReceipt {
        val result = auth.signInWithEmailAndPassword(email, password).await()
        val user = result.user ?: error("Firebase không trả về tài khoản vừa đăng nhập.")
        val firebaseUserId = user.uid.trim()
        val firebaseEmail = normalizePendingRegistrationEmail(user.email.orEmpty())
        if (firebaseUserId.isBlank() || firebaseEmail.isBlank()) {
            error("Firebase trả về danh tính đăng nhập không hợp lệ.")
        }
        val owner = observeOwner(firebaseUserId, firebaseEmail)
            ?: error("Firebase trả về danh tính đăng nhập không hợp lệ.")
        val idToken = user.getIdToken(true).await().token
            ?.takeIf(String::isNotBlank)
            ?: error("Không lấy được mã xác thực đăng nhập")
        requireCurrentOwner(owner)
        return FirebaseSignInReceipt(
            firebaseUserId = firebaseUserId,
            email = firebaseEmail,
            idToken = idToken,
            ownerSessionEpoch = owner.sessionEpoch,
        )
    }

    suspend fun createAccount(
        email: String,
        password: String,
        displayName: String,
    ): FirebaseAccountCreationReceipt {
        val result = auth.createUserWithEmailAndPassword(email, password).await()
        val user = result.user ?: error("Không thể tạo tài khoản")
        val firebaseUserId = user.uid.trim()
        val firebaseEmail = normalizePendingRegistrationEmail(user.email.orEmpty())
        val owner = observeOwner(firebaseUserId, firebaseEmail)
            ?: error("Firebase trả về danh tính đăng ký không hợp lệ.")
        requireCurrentOwner(owner)
        if (displayName.isNotBlank()) {
            val profileUpdate = UserProfileChangeRequest.Builder()
                .setDisplayName(displayName)
                .build()
            user.updateProfile(profileUpdate).await()
            requireCurrentOwner(owner)
        }
        user.sendEmailVerification().await()
        requireCurrentOwner(owner)
        val token = user.getIdToken(true).await().token
            ?.takeIf(String::isNotBlank)
            ?: error("Không lấy được mã xác thực đăng ký")
        requireCurrentOwner(owner)
        return FirebaseAccountCreationReceipt(
            firebaseUserId = firebaseUserId,
            email = firebaseEmail,
            idToken = token,
            ownerSessionEpoch = owner.sessionEpoch,
        )
    }

    suspend fun resendEmailVerification(): EmailVerificationResendResult {
        val expectedOwner = currentOwnerBindingOrNull()
            ?: error("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại để gửi email xác thực.")
        val verified = reloadCurrentUser(expectedOwner)
        if (verified) {
            return EmailVerificationResendResult.AlreadyVerified
        }
        sendEmailVerification(expectedOwner)
        return EmailVerificationResendResult.Sent
    }

    suspend fun sendEmailVerification(expectedOwner: FirebaseOwnerBinding) {
        requireCurrentOwner(expectedOwner)
        val user = auth.currentUser
            ?: error("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại để gửi email xác thực.")
        if (
            user.uid.trim() != expectedOwner.firebaseUserId ||
            normalizePendingRegistrationEmail(user.email.orEmpty()) != expectedOwner.email
        ) {
            error("Phiên tài khoản đã thay đổi trong lúc gửi email xác thực.")
        }
        requireCurrentOwner(expectedOwner)
        user.sendEmailVerification().await()
        requireCurrentOwner(expectedOwner)
    }

    suspend fun sendPasswordResetEmail(email: String) {
        auth.sendPasswordResetEmail(email).await()
    }

    suspend fun reloadCurrentUser(): Boolean {
        val user = auth.currentUser ?: error("Phiên đăng ký đã hết hạn. Vui lòng đăng nhập lại để kiểm tra xác thực email.")
        user.reload().await()
        return auth.currentUser?.isEmailVerified == true
    }

    suspend fun reloadCurrentUser(expectedOwner: FirebaseOwnerBinding): Boolean {
        requireCurrentOwner(expectedOwner)
        val user = auth.currentUser ?: error("Phiên đăng nhập đã hết hạn.")
        user.reload().await()
        requireCurrentOwner(expectedOwner)
        return user.isEmailVerified
    }

    fun currentEmail(): String {
        return auth.currentUser?.email.orEmpty()
    }

    fun hasCurrentUser(): Boolean {
        return auth.currentUser != null
    }

    fun currentUserIdOrNull(): String? {
        return runCatching {
            auth.currentUser?.uid?.takeIf(String::isNotBlank)
        }.getOrNull()
    }

    fun currentOwnerBindingOrNull(): FirebaseOwnerBinding? {
        val user = auth.currentUser ?: return observeOwner("", "")
        return observeOwner(user.uid, user.email.orEmpty())
    }

    fun isCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean =
        currentOwnerBindingOrNull() == expectedOwner.normalized()

    fun isCurrentUserEmailVerified(): Boolean {
        return auth.currentUser?.isEmailVerified == true
    }

    suspend fun reauthenticateWithPassword(currentPassword: String) {
        val user = auth.currentUser ?: error("Chưa đăng nhập")
        val email = user.email ?: error("Tài khoản hiện tại chưa có email đăng nhập")
        val credential = EmailAuthProvider.getCredential(email, currentPassword)
        user.reauthenticate(credential).await()
    }

    suspend fun getFreshIdToken(forceRefresh: Boolean = false): String {
        val user = auth.currentUser ?: error("Chưa đăng nhập")
        val token = user.getIdToken(forceRefresh).await().token
        return token?.takeIf { it.isNotBlank() } ?: error("Không lấy được mã xác thực đăng nhập")
    }

    suspend fun getFreshIdToken(
        expectedOwner: FirebaseOwnerBinding,
        forceRefresh: Boolean = false,
    ): String {
        requireCurrentOwner(expectedOwner)
        val user = auth.currentUser ?: error("Chưa đăng nhập")
        if (
            user.uid.trim() != expectedOwner.firebaseUserId ||
            normalizePendingRegistrationEmail(user.email.orEmpty()) != expectedOwner.email
        ) {
            error("Phiên tài khoản đã thay đổi trong lúc làm mới mã xác thực.")
        }
        val token = user.getIdToken(forceRefresh).await().token
            ?.takeIf(String::isNotBlank)
            ?: error("Không lấy được mã xác thực đăng nhập")
        requireCurrentOwner(expectedOwner)
        return token
    }

    fun signOut() {
        auth.signOut()
        observeOwner("", "")
    }

    private fun requireCurrentOwner(expectedOwner: FirebaseOwnerBinding) {
        if (!isCurrentOwner(expectedOwner)) {
            error("Phiên tài khoản đã thay đổi trong lúc xác thực Firebase.")
        }
    }

    @Synchronized
    fun signOutIfCurrentUser(expectedUserId: String): Boolean {
        val expected = expectedUserId.trim()
        if (expected.isEmpty() || currentUserIdOrNull() != expected) return false
        auth.signOut()
        observeOwner("", "")
        return true
    }

    fun signOutIfCurrentOwner(expectedOwner: FirebaseOwnerBinding): Boolean =
        synchronized(ownerLock) {
            val user = auth.currentUser ?: run {
                observeOwnerLocked("", "")
                return@synchronized false
            }
            val current = observeOwnerLocked(user.uid, user.email.orEmpty())
            if (current != expectedOwner.normalized()) return@synchronized false
            auth.signOut()
            observeOwnerLocked("", "")
            true
        }

    private fun observeOwner(
        firebaseUserId: String,
        email: String,
    ): FirebaseOwnerBinding? = synchronized(ownerLock) {
        observeOwnerLocked(firebaseUserId, email)
    }

    private fun observeOwnerLocked(
        firebaseUserId: String,
        email: String,
    ): FirebaseOwnerBinding? {
        val normalizedUserId = firebaseUserId.trim()
        val normalizedEmail = normalizePendingRegistrationEmail(email)
        if (
            normalizedUserId != observedFirebaseUserId ||
            normalizedEmail != observedFirebaseEmail
        ) {
            ownerSessionEpoch = if (ownerSessionEpoch == Long.MAX_VALUE) 1L else ownerSessionEpoch + 1L
            observedFirebaseUserId = normalizedUserId
            observedFirebaseEmail = normalizedEmail
        }
        if (normalizedUserId.isBlank() || normalizedEmail.isBlank()) return null
        return FirebaseOwnerBinding(
            firebaseUserId = normalizedUserId,
            email = normalizedEmail,
            sessionEpoch = ownerSessionEpoch,
        )
    }

    private fun FirebaseOwnerBinding.normalized(): FirebaseOwnerBinding = copy(
        firebaseUserId = firebaseUserId.trim(),
        email = normalizePendingRegistrationEmail(email),
    )

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
