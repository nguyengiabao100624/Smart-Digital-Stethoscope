package com.example.smart_health_android.notifications

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

internal data class NotificationSessionBinding(
    val backendUserId: String,
    val firebaseUserId: String,
    val workspaceId: String,
    val generation: String,
)

internal data class NotificationActivationLease(
    val epoch: Long,
    val firebaseUserId: String,
    val workspaceId: String,
    val expectedBackendUserId: String?,
)

/**
 * In-memory delivery gate with a consume-on-activation epoch.
 *
 * A registration receives a lease before it starts its network request. Logout, account
 * replacement, restore, and successful activation all advance the epoch, so a late response
 * from an older request cannot reactivate notification delivery.
 */
internal class NotificationSessionGate {
    private var epoch: Long = 0L
    private var activeBinding: NotificationSessionBinding? = null

    @Synchronized
    fun beginReplacement(
        firebaseUserId: String,
        workspaceId: String,
    ): NotificationActivationLease? {
        advanceEpoch()
        activeBinding = null
        val normalizedFirebaseUserId = firebaseUserId.trim().takeIf(String::isNotEmpty)
            ?: return null
        val normalizedWorkspaceId = workspaceId.trim().takeIf(String::isNotEmpty)
            ?: return null
        return NotificationActivationLease(
            epoch = epoch,
            firebaseUserId = normalizedFirebaseUserId,
            workspaceId = normalizedWorkspaceId,
            expectedBackendUserId = null,
        )
    }

    @Synchronized
    fun beginRefresh(): NotificationActivationLease? {
        val binding = activeBinding ?: return null
        return NotificationActivationLease(
            epoch = epoch,
            firebaseUserId = binding.firebaseUserId,
            workspaceId = binding.workspaceId,
            expectedBackendUserId = binding.backendUserId,
        )
    }

    @Synchronized
    fun activateIfCurrent(
        lease: NotificationActivationLease,
        backendUserId: String,
    ): NotificationSessionBinding? {
        val normalizedBackendUserId = backendUserId.trim().takeIf(String::isNotEmpty)
            ?: return null
        if (!isLeaseCurrentLocked(lease)) return null
        if (lease.expectedBackendUserId != null) return null
        if (activeBinding != null) return null

        val binding = NotificationSessionBinding(
            backendUserId = normalizedBackendUserId,
            firebaseUserId = lease.firebaseUserId,
            workspaceId = lease.workspaceId,
            generation = UUID.randomUUID().toString(),
        )
        advanceEpoch()
        activeBinding = binding
        return binding
    }

    @Synchronized
    fun isLeaseCurrent(lease: NotificationActivationLease): Boolean {
        return isLeaseCurrentLocked(lease)
    }

    @Synchronized
    fun restore(
        binding: NotificationSessionBinding,
        currentFirebaseUserId: String?,
    ): Boolean {
        advanceEpoch()
        activeBinding = null
        val normalizedCurrentFirebaseUserId = currentFirebaseUserId
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: return false
        if (
            !binding.isValid() ||
            binding.firebaseUserId != normalizedCurrentFirebaseUserId
        ) {
            return false
        }
        activeBinding = binding
        return true
    }

    @Synchronized
    fun deactivate() {
        deactivateAnd {}
    }

    /**
     * Advances the session epoch and runs notification cancellation while holding the same
     * lifecycle monitor used by authorized delivery. An already-authorized delivery therefore
     * finishes before cancellation; a later delivery observes the inactive binding.
     */
    @Synchronized
    fun <T> deactivateAnd(afterDeactivation: () -> T): T {
        advanceEpoch()
        activeBinding = null
        return afterDeactivation()
    }

    @Synchronized
    fun activeBindingOrNull(): NotificationSessionBinding? = activeBinding

    @Synchronized
    fun canDisplay(
        messageUserId: String,
        messageWorkspaceId: String,
        currentFirebaseUserId: String?,
    ): Boolean {
        val binding = activeBinding ?: return false
        val normalizedMessageUserId = messageUserId.trim().takeIf(String::isNotEmpty)
            ?: return false
        val normalizedFirebaseUserId = currentFirebaseUserId
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: return false
        val normalizedWorkspaceId = messageWorkspaceId.trim().takeIf(String::isNotEmpty)
            ?: return false
        return binding.backendUserId == normalizedMessageUserId &&
            binding.firebaseUserId == normalizedFirebaseUserId &&
            binding.workspaceId == normalizedWorkspaceId
    }

    /**
     * Keeps identity revalidation and the delivery side effect in one atomic lifecycle boundary.
     * The Firebase identity supplier is deliberately invoked after acquiring this monitor.
     */
    @Synchronized
    fun <T> withAuthorizedDelivery(
        messageUserId: String,
        messageWorkspaceId: String,
        currentFirebaseUserId: () -> String?,
        deliver: (NotificationSessionBinding) -> T,
    ): T? {
        val binding = activeBinding ?: return null
        val normalizedMessageUserId = messageUserId.trim().takeIf(String::isNotEmpty)
            ?: return null
        val normalizedFirebaseUserId = currentFirebaseUserId()
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: return null
        val normalizedWorkspaceId = messageWorkspaceId.trim().takeIf(String::isNotEmpty)
            ?: return null
        if (
            binding.backendUserId != normalizedMessageUserId ||
            binding.firebaseUserId != normalizedFirebaseUserId ||
            binding.workspaceId != normalizedWorkspaceId
        ) {
            return null
        }
        return deliver(binding)
    }

    private fun isLeaseCurrentLocked(lease: NotificationActivationLease): Boolean {
        if (
            lease.epoch != epoch ||
            lease.firebaseUserId.isBlank() ||
            lease.workspaceId.isBlank()
        ) {
            return false
        }
        val expectedBackendUserId = lease.expectedBackendUserId ?: return activeBinding == null
        val binding = activeBinding ?: return false
        return binding.firebaseUserId == lease.firebaseUserId &&
            binding.workspaceId == lease.workspaceId &&
            binding.backendUserId == expectedBackendUserId
    }

    private fun advanceEpoch() {
        epoch = if (epoch == Long.MAX_VALUE) 0L else epoch + 1L
    }

    private fun NotificationSessionBinding.isValid(): Boolean {
        return backendUserId.isNotBlank() &&
            firebaseUserId.isNotBlank() &&
            workspaceId.isNotBlank() &&
            generation.isNotBlank()
    }
}

/**
 * Persists only AES-GCM ciphertext. The key is non-exportable and remains in Android Keystore.
 */
// Security-sensitive session binding must observe commit() success. The KTX
// edit helper returns Unit and would erase that fail-closed persistence signal.
@SuppressLint("ApplySharedPref", "UseKtx")
internal class EncryptedNotificationSessionStore(
    context: Context,
    private val preferencesName: String = DEFAULT_PREFERENCES_NAME,
    private val keyAlias: String = DEFAULT_KEY_ALIAS,
) {
    private val applicationContext = context.applicationContext
    private val preferences: SharedPreferences = applicationContext.getSharedPreferences(
        preferencesName,
        Context.MODE_PRIVATE,
    )
    private val associatedData = "$preferencesName:$KEY_CIPHERTEXT:v$CURRENT_VERSION"
        .toByteArray(StandardCharsets.UTF_8)

    @Synchronized
    fun save(binding: NotificationSessionBinding): Boolean {
        if (
            binding.backendUserId.isBlank() ||
            binding.firebaseUserId.isBlank() ||
            binding.workspaceId.isBlank() ||
            binding.generation.isBlank()
        ) {
            return false
        }
        return runCatching {
            val encrypted = encrypt(binding.toJson().toString())
            preferences.edit()
                .putString(KEY_CIPHERTEXT, encrypted.ciphertext)
                .putString(KEY_IV, encrypted.iv)
                .putInt(KEY_VERSION, CURRENT_VERSION)
                .commit()
        }.getOrDefault(false)
    }

    @Synchronized
    fun load(): NotificationSessionBinding? {
        val ciphertext = preferences.getString(KEY_CIPHERTEXT, null)
        val iv = preferences.getString(KEY_IV, null)
        if (ciphertext == null && iv == null) return null
        if (
            ciphertext == null ||
            iv == null ||
            preferences.getInt(KEY_VERSION, 0) != CURRENT_VERSION
        ) {
            clear()
            return null
        }
        return runCatching {
            decrypt(ciphertext, iv).toNotificationSessionBinding()
                .takeIf {
                    it.backendUserId.isNotBlank() &&
                        it.firebaseUserId.isNotBlank() &&
                        it.workspaceId.isNotBlank() &&
                        it.generation.isNotBlank()
                }
                ?: error("Invalid encrypted notification session")
        }.getOrElse {
            clear()
            resetKey()
            null
        }
    }

    @Synchronized
    fun clear(): Boolean {
        return preferences.edit()
            .remove(KEY_CIPHERTEXT)
            .remove(KEY_IV)
            .remove(KEY_VERSION)
            .commit()
    }

    @Synchronized
    fun destroyForTest() {
        clear()
        applicationContext.deleteSharedPreferences(preferencesName)
        resetKey()
    }

    private fun encrypt(plaintext: String): EncryptedPayload {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(associatedData)
        val ciphertext = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))
        return EncryptedPayload(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
        )
    }

    private fun decrypt(ciphertext: String, iv: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(),
            GCMParameterSpec(GCM_TAG_BITS, Base64.decode(iv, Base64.NO_WRAP)),
        )
        cipher.updateAAD(associatedData)
        val plaintext = cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP))
        return String(plaintext, StandardCharsets.UTF_8)
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER).run {
            init(
                KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(KEY_SIZE_BITS)
                    .build(),
            )
            generateKey()
        }
    }

    private fun resetKey() {
        runCatching {
            KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
                load(null)
                if (containsAlias(keyAlias)) deleteEntry(keyAlias)
            }
        }
    }

    private fun NotificationSessionBinding.toJson(): JSONObject {
        return JSONObject()
            .put(JSON_BACKEND_USER_ID, backendUserId)
            .put(JSON_FIREBASE_USER_ID, firebaseUserId)
            .put(JSON_WORKSPACE_ID, workspaceId)
            .put(JSON_GENERATION, generation)
    }

    private fun String.toNotificationSessionBinding(): NotificationSessionBinding {
        val json = JSONObject(this)
        return NotificationSessionBinding(
            backendUserId = json.optString(JSON_BACKEND_USER_ID),
            firebaseUserId = json.optString(JSON_FIREBASE_USER_ID),
            workspaceId = json.optString(JSON_WORKSPACE_ID),
            generation = json.optString(JSON_GENERATION),
        )
    }

    private data class EncryptedPayload(
        val ciphertext: String,
        val iv: String,
    )

    private companion object {
        const val DEFAULT_PREFERENCES_NAME = "shcare_notification_session_v1"
        const val DEFAULT_KEY_ALIAS = "shcare_notification_session_aes_v1"
        const val KEY_CIPHERTEXT = "binding_ciphertext"
        const val KEY_IV = "binding_iv"
        const val KEY_VERSION = "binding_version"
        const val CURRENT_VERSION = 2
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
        const val KEY_SIZE_BITS = 256
        const val JSON_BACKEND_USER_ID = "backendUserId"
        const val JSON_FIREBASE_USER_ID = "firebaseUserId"
        const val JSON_WORKSPACE_ID = "workspaceId"
        const val JSON_GENERATION = "generation"
    }
}

/**
 * Rebuilds the in-memory delivery gate from encrypted process-persistent state.
 *
 * A pending provider-token invalidation or a different Firebase owner always clears the
 * ciphertext and leaves delivery disabled. Keeping this coordinator free of global state makes
 * the process-restart boundary executable in instrumentation tests.
 */
internal fun restoreNotificationSessionBinding(
    gate: NotificationSessionGate,
    store: EncryptedNotificationSessionStore,
    currentFirebaseUserId: String?,
    invalidationPending: Boolean,
): Boolean {
    if (invalidationPending || currentFirebaseUserId.isNullOrBlank()) {
        gate.deactivate()
        store.clear()
        return false
    }
    val binding = store.load()
    if (binding == null) {
        gate.deactivate()
        return false
    }
    val restored = gate.restore(binding, currentFirebaseUserId)
    if (!restored) store.clear()
    return restored
}

internal object SmartHealthNotificationSession {
    private val gate = NotificationSessionGate()
    @Volatile
    private var store: EncryptedNotificationSessionStore? = null

    @Synchronized
    fun initialize(
        context: Context,
        currentFirebaseUserId: String?,
        invalidationPending: Boolean,
    ): Boolean {
        val initializedStore = EncryptedNotificationSessionStore(context)
        store = initializedStore
        return restoreNotificationSessionBinding(
            gate = gate,
            store = initializedStore,
            currentFirebaseUserId = currentFirebaseUserId,
            invalidationPending = invalidationPending,
        )
    }

    @Synchronized
    fun beginAuthentication(
        firebaseUserId: String,
        workspaceId: String,
    ): NotificationActivationLease {
        val lease = requireNotNull(gate.beginReplacement(firebaseUserId, workspaceId)) {
            "Firebase user id and workspace id are required to start notification registration"
        }
        val initializedStore = store
        if (initializedStore == null) {
            gate.deactivate()
            error("Notification session must be initialized before registration")
        }
        if (!initializedStore.clear()) {
            gate.deactivate()
            error("Cannot securely replace the persisted notification session")
        }
        return lease
    }

    @Synchronized
    fun beginRefresh(): NotificationActivationLease? = gate.beginRefresh()

    @Synchronized
    fun activate(
        lease: NotificationActivationLease,
        backendUserId: String,
    ): Boolean {
        val binding = gate.activateIfCurrent(lease, backendUserId) ?: return false
        val persisted = store?.save(binding) == true
        if (!persisted) gate.deactivate()
        return persisted
    }

    @Synchronized
    fun confirmRefresh(lease: NotificationActivationLease): Boolean {
        return gate.isLeaseCurrent(lease)
    }

    @Synchronized
    fun isLeaseCurrent(lease: NotificationActivationLease): Boolean {
        return gate.isLeaseCurrent(lease)
    }

    @Synchronized
    fun deactivate(): Boolean {
        gate.deactivate()
        return store?.clear() == true
    }

    /**
     * Closes the delivery gate and clears the Android notification shade under the same gate
     * monitor used by [withAuthorizedDelivery]. This prevents a previously authorized FCM
     * callback from posting after logout cancellation has completed.
     */
    @Synchronized
    fun deactivateAndClearPostedNotifications(
        clearPostedNotifications: () -> Boolean,
    ): Boolean {
        return gate.deactivateAnd {
            val persistedSessionCleared = store?.clear() == true
            val postedNotificationsCleared = clearPostedNotifications()
            persistedSessionCleared && postedNotificationsCleared
        }
    }

    @Synchronized
    fun activeBindingOrNull(): NotificationSessionBinding? = gate.activeBindingOrNull()

    @Synchronized
    fun canDisplay(
        messageUserId: String,
        messageWorkspaceId: String,
        currentFirebaseUserId: String?,
    ): Boolean = gate.canDisplay(
        messageUserId = messageUserId,
        messageWorkspaceId = messageWorkspaceId,
        currentFirebaseUserId = currentFirebaseUserId,
    )

    fun <T> withAuthorizedDelivery(
        messageUserId: String,
        messageWorkspaceId: String,
        currentFirebaseUserId: () -> String?,
        deliver: (NotificationSessionBinding) -> T,
    ): T? = gate.withAuthorizedDelivery(
        messageUserId = messageUserId,
        messageWorkspaceId = messageWorkspaceId,
        currentFirebaseUserId = currentFirebaseUserId,
        deliver = deliver,
    )

    @Synchronized
    fun canOpen(
        request: SmartHealthNotificationLaunchRequest,
        currentFirebaseUserId: String?,
        currentWorkspaceId: String?,
    ): Boolean {
        val binding = gate.activeBindingOrNull() ?: return false
        val normalizedCurrentWorkspaceId = currentWorkspaceId
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: return false
        return gate.canDisplay(
            messageUserId = request.ownerUserId,
            messageWorkspaceId = request.workspaceId,
            currentFirebaseUserId = currentFirebaseUserId,
        ) &&
            binding.workspaceId == normalizedCurrentWorkspaceId &&
            binding.generation == request.sessionGeneration
    }
}
