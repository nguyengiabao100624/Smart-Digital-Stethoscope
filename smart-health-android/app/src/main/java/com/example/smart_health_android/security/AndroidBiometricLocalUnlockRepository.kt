package com.example.smart_health_android.security

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.example.smart_health_android.R
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.UUID
import javax.crypto.AEADBadTagException
import javax.crypto.BadPaddingException
import javax.crypto.Cipher
import javax.crypto.IllegalBlockSizeException
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

/**
 * Android implementation of the local app-lock repository.
 *
 * The persisted record contains only AES-GCM ciphertext, IV and a schema version. The key never
 * leaves Android Keystore, requires a fresh strong-biometric operation and is invalidated when
 * biometric enrollment changes. A successful prompt is therefore still insufficient unless the
 * decrypted account, workspace and all session epochs exactly match the current authority.
 */
@SuppressLint("ApplySharedPref", "UseKtx")
class AndroidBiometricLocalUnlockRepository(
    context: Context,
    private val preferencesName: String = DEFAULT_PREFERENCES_NAME,
    private val keyAlias: String = DEFAULT_KEY_ALIAS,
) : BiometricLocalUnlockRepository {
    private val applicationContext = context.applicationContext
    private val preferences: SharedPreferences = applicationContext.getSharedPreferences(
        preferencesName,
        Context.MODE_PRIVATE,
    )
    private val associatedData = "$preferencesName:$KEY_CIPHERTEXT:v$CURRENT_VERSION"
        .toByteArray(StandardCharsets.UTF_8)
    private var pendingOperation: PendingOperation? = null

    override fun availability(): BiometricLocalUnlockAvailability {
        return when (
            BiometricManager.from(applicationContext).canAuthenticate(
                BiometricManager.Authenticators.BIOMETRIC_STRONG,
            )
        ) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricLocalUnlockAvailability.Available
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                BiometricLocalUnlockAvailability.NoHardware
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                BiometricLocalUnlockAvailability.NoneEnrolled
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                BiometricLocalUnlockAvailability.TemporarilyUnavailable
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ->
                BiometricLocalUnlockAvailability.SecurityUpdateRequired
            BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED ->
                BiometricLocalUnlockAvailability.Unsupported
            else -> BiometricLocalUnlockAvailability.Unknown
        }
    }

    @Synchronized
    override fun hasConfiguration(): Boolean {
        val ciphertext = preferences.getString(KEY_CIPHERTEXT, null)
        val iv = preferences.getString(KEY_IV, null)
        val version = preferences.getInt(KEY_VERSION, 0)
        val complete = ciphertext != null && iv != null && version == CURRENT_VERSION
        val empty = ciphertext == null && iv == null && version == 0
        if (empty) return false
        if (!complete || !keyExists()) {
            clearStoredRecord(resetKey = true)
            return false
        }
        return true
    }

    @Synchronized
    override fun prepare(
        operation: BiometricLocalUnlockOperation,
        authority: BiometricLocalUnlockAuthority,
    ): BiometricLocalUnlockPreparation {
        if (pendingOperation != null) {
            return BiometricLocalUnlockPreparation.Failed(
                BiometricLocalUnlockError.StorageFailure,
            )
        }
        if (availability() != BiometricLocalUnlockAvailability.Available) {
            return BiometricLocalUnlockPreparation.Failed(
                BiometricLocalUnlockError.RuntimeUnavailable,
            )
        }
        if (operation != BiometricLocalUnlockOperation.Enable && !hasConfiguration()) {
            return BiometricLocalUnlockPreparation.Failed(
                BiometricLocalUnlockError.KeyInvalidated,
            )
        }

        return try {
            if (operation == BiometricLocalUnlockOperation.Enable) {
                check(clearStoredRecord(resetKey = true)) {
                    "Cannot replace biometric local unlock state."
                }
            }
            val cipher = when (operation) {
                BiometricLocalUnlockOperation.Enable -> Cipher.getInstance(TRANSFORMATION).apply {
                    init(Cipher.ENCRYPT_MODE, getOrCreateKey())
                    updateAAD(associatedData)
                }

                BiometricLocalUnlockOperation.Unlock,
                BiometricLocalUnlockOperation.Disable,
                -> {
                    val record = requireStoredRecord()
                    Cipher.getInstance(TRANSFORMATION).apply {
                        init(
                            Cipher.DECRYPT_MODE,
                            getOrCreateKey(),
                            GCMParameterSpec(GCM_TAG_BITS, record.iv),
                        )
                        updateAAD(associatedData)
                    }
                }
            }
            val request = BiometricLocalUnlockPromptRequest(
                requestId = UUID.randomUUID().toString(),
                operation = operation,
            )
            pendingOperation = PendingOperation(
                request = request,
                authority = authority,
                cipher = cipher,
                ciphertext = if (operation == BiometricLocalUnlockOperation.Enable) {
                    null
                } else {
                    requireStoredRecord().ciphertext
                },
            )
            BiometricLocalUnlockPreparation.Ready(request)
        } catch (_: KeyPermanentlyInvalidatedException) {
            clearStoredRecord(resetKey = true)
            BiometricLocalUnlockPreparation.Failed(BiometricLocalUnlockError.KeyInvalidated)
        } catch (_: Throwable) {
            clearStoredRecord(resetKey = true)
            BiometricLocalUnlockPreparation.Failed(BiometricLocalUnlockError.StorageFailure)
        }
    }

    @Synchronized
    override fun complete(requestId: String): BiometricLocalUnlockCompletion {
        val pending = pendingOperation?.takeIf { it.request.requestId == requestId }
            ?: return BiometricLocalUnlockCompletion.StorageFailure
        pendingOperation = null
        return try {
            when (pending.request.operation) {
                BiometricLocalUnlockOperation.Enable -> {
                    val ciphertext = pending.cipher.doFinal(
                        pending.authority.toJson().toString().toByteArray(StandardCharsets.UTF_8),
                    )
                    val persisted = preferences.edit()
                        .putString(
                            KEY_CIPHERTEXT,
                            Base64.encodeToString(ciphertext, Base64.NO_WRAP),
                        )
                        .putString(
                            KEY_IV,
                            Base64.encodeToString(pending.cipher.iv, Base64.NO_WRAP),
                        )
                        .putInt(KEY_VERSION, CURRENT_VERSION)
                        .commit()
                    if (persisted) {
                        BiometricLocalUnlockCompletion.Success
                    } else {
                        clearStoredRecord(resetKey = true)
                        BiometricLocalUnlockCompletion.StorageFailure
                    }
                }

                BiometricLocalUnlockOperation.Unlock,
                BiometricLocalUnlockOperation.Disable,
                -> {
                    val ciphertext = requireNotNull(pending.ciphertext)
                    val storedAuthority = String(
                        pending.cipher.doFinal(ciphertext),
                        StandardCharsets.UTF_8,
                    ).toBiometricAuthority()
                    if (storedAuthority != pending.authority) {
                        clearStoredRecord(resetKey = true)
                        BiometricLocalUnlockCompletion.AuthorityMismatch
                    } else if (pending.request.operation == BiometricLocalUnlockOperation.Disable) {
                        if (clearStoredRecord(resetKey = true)) {
                            BiometricLocalUnlockCompletion.Success
                        } else {
                            BiometricLocalUnlockCompletion.StorageFailure
                        }
                    } else {
                        BiometricLocalUnlockCompletion.Success
                    }
                }
            }
        } catch (_: KeyPermanentlyInvalidatedException) {
            clearStoredRecord(resetKey = true)
            BiometricLocalUnlockCompletion.KeyInvalidated
        } catch (_: AEADBadTagException) {
            clearStoredRecord(resetKey = true)
            BiometricLocalUnlockCompletion.KeyInvalidated
        } catch (_: BadPaddingException) {
            clearStoredRecord(resetKey = true)
            BiometricLocalUnlockCompletion.KeyInvalidated
        } catch (_: IllegalBlockSizeException) {
            clearStoredRecord(resetKey = true)
            BiometricLocalUnlockCompletion.KeyInvalidated
        } catch (_: Throwable) {
            clearStoredRecord(resetKey = true)
            BiometricLocalUnlockCompletion.StorageFailure
        }
    }

    @Synchronized
    override fun cancel(requestId: String) {
        if (pendingOperation?.request?.requestId == requestId) {
            pendingOperation = null
        }
    }

    @Synchronized
    override fun clear(): Boolean {
        pendingOperation = null
        return clearStoredRecord(resetKey = true)
    }

    @Synchronized
    internal fun cryptoObjectFor(requestId: String): BiometricPrompt.CryptoObject? {
        val pending = pendingOperation?.takeIf { it.request.requestId == requestId } ?: return null
        return BiometricPrompt.CryptoObject(pending.cipher)
    }

    @Synchronized
    internal fun destroyForTest() {
        clear()
        applicationContext.deleteSharedPreferences(preferencesName)
    }

    private fun requireStoredRecord(): StoredRecord {
        val ciphertext = requireNotNull(preferences.getString(KEY_CIPHERTEXT, null))
        val iv = requireNotNull(preferences.getString(KEY_IV, null))
        check(preferences.getInt(KEY_VERSION, 0) == CURRENT_VERSION)
        return StoredRecord(
            ciphertext = Base64.decode(ciphertext, Base64.NO_WRAP),
            iv = Base64.decode(iv, Base64.NO_WRAP),
        )
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val builder = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_SIZE_BITS)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
                0,
                KeyProperties.AUTH_BIOMETRIC_STRONG,
            )
        } else {
            @Suppress("DEPRECATION")
            builder.setUserAuthenticationValidityDurationSeconds(-1)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setUnlockedDeviceRequired(true)
        }

        return KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE_PROVIDER,
        ).run {
            init(builder.build())
            generateKey()
        }
    }

    private fun keyExists(): Boolean = runCatching {
        KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }.containsAlias(keyAlias)
    }.getOrDefault(false)

    private fun clearStoredRecord(resetKey: Boolean): Boolean {
        val cleared = preferences.edit()
            .remove(KEY_CIPHERTEXT)
            .remove(KEY_IV)
            .remove(KEY_VERSION)
            .commit()
        if (resetKey) resetKey()
        return cleared
    }

    private fun resetKey() {
        runCatching {
            KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
                load(null)
                if (containsAlias(keyAlias)) deleteEntry(keyAlias)
            }
        }
    }

    private fun BiometricLocalUnlockAuthority.toJson(): JSONObject = JSONObject()
        .put(JSON_BACKEND_USER_ID, backendUserId)
        .put(JSON_FIREBASE_USER_ID, firebaseUserId)
        .put(JSON_WORKSPACE_ID, workspaceId)
        .put(JSON_AUTHORITY_EPOCH, authorityEpoch)
        .put(JSON_BACKEND_SESSION_EPOCH, backendSessionEpoch)
        .put(JSON_FIREBASE_OWNER_SESSION_EPOCH, firebaseOwnerSessionEpoch)

    private fun String.toBiometricAuthority(): BiometricLocalUnlockAuthority {
        val json = JSONObject(this)
        return BiometricLocalUnlockAuthority.create(
            backendUserId = json.getString(JSON_BACKEND_USER_ID),
            firebaseUserId = json.getString(JSON_FIREBASE_USER_ID),
            workspaceId = json.getString(JSON_WORKSPACE_ID),
            authorityEpoch = json.getLong(JSON_AUTHORITY_EPOCH),
            backendSessionEpoch = json.getLong(JSON_BACKEND_SESSION_EPOCH),
            firebaseOwnerSessionEpoch = json.getLong(JSON_FIREBASE_OWNER_SESSION_EPOCH),
        )
    }

    private data class StoredRecord(
        val ciphertext: ByteArray,
        val iv: ByteArray,
    )

    private data class PendingOperation(
        val request: BiometricLocalUnlockPromptRequest,
        val authority: BiometricLocalUnlockAuthority,
        val cipher: Cipher,
        val ciphertext: ByteArray?,
    )

    private companion object {
        const val DEFAULT_PREFERENCES_NAME = "shcare_biometric_local_unlock_v1"
        const val DEFAULT_KEY_ALIAS = "shcare_biometric_local_unlock_aes_v1"
        const val KEY_CIPHERTEXT = "authority_ciphertext"
        const val KEY_IV = "authority_iv"
        const val KEY_VERSION = "authority_version"
        const val CURRENT_VERSION = 1
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
        const val KEY_SIZE_BITS = 256
        const val JSON_BACKEND_USER_ID = "backendUserId"
        const val JSON_FIREBASE_USER_ID = "firebaseUserId"
        const val JSON_WORKSPACE_ID = "workspaceId"
        const val JSON_AUTHORITY_EPOCH = "authorityEpoch"
        const val JSON_BACKEND_SESSION_EPOCH = "backendSessionEpoch"
        const val JSON_FIREBASE_OWNER_SESSION_EPOCH = "firebaseOwnerSessionEpoch"
    }
}

internal class AndroidBiometricPromptLauncher(
    private val activity: FragmentActivity,
    private val repository: AndroidBiometricLocalUnlockRepository,
    private val onAuthenticated: (String) -> Unit,
    private val onFailed: (String, BiometricLocalUnlockError) -> Unit,
) {
    private var activeRequestId: String? = null
    private val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val requestId = activeRequestId ?: return
                activeRequestId = null
                if (result.cryptoObject?.cipher == null) {
                    onFailed(requestId, BiometricLocalUnlockError.KeyInvalidated)
                } else {
                    onAuthenticated(requestId)
                }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                val requestId = activeRequestId ?: return
                activeRequestId = null
                val error = when (errorCode) {
                    BiometricPrompt.ERROR_CANCELED,
                    BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                    BiometricPrompt.ERROR_USER_CANCELED,
                    -> BiometricLocalUnlockError.AuthenticationCancelled

                    BiometricPrompt.ERROR_HW_NOT_PRESENT,
                    BiometricPrompt.ERROR_HW_UNAVAILABLE,
                    BiometricPrompt.ERROR_NO_BIOMETRICS,
                    -> BiometricLocalUnlockError.RuntimeUnavailable

                    else -> BiometricLocalUnlockError.AuthenticationFailed
                }
                onFailed(requestId, error)
            }
        },
    )

    fun launch(request: BiometricLocalUnlockPromptRequest) {
        if (activeRequestId != null) {
            onFailed(request.requestId, BiometricLocalUnlockError.AuthenticationFailed)
            return
        }
        val cryptoObject = repository.cryptoObjectFor(request.requestId)
        if (cryptoObject == null) {
            onFailed(request.requestId, BiometricLocalUnlockError.KeyInvalidated)
            return
        }
        val title = when (request.operation) {
            BiometricLocalUnlockOperation.Enable ->
                activity.getString(R.string.biometric_local_unlock_prompt_enable_title)
            BiometricLocalUnlockOperation.Unlock ->
                activity.getString(R.string.biometric_local_unlock_prompt_unlock_title)
            BiometricLocalUnlockOperation.Disable ->
                activity.getString(R.string.biometric_local_unlock_prompt_disable_title)
        }
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(activity.getString(R.string.biometric_local_unlock_prompt_subtitle))
            .setNegativeButtonText(
                activity.getString(R.string.biometric_local_unlock_prompt_cancel),
            )
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        activeRequestId = request.requestId
        prompt.authenticate(promptInfo, cryptoObject)
    }

    fun cancel(requestId: String) {
        if (activeRequestId == requestId) {
            activeRequestId = null
            prompt.cancelAuthentication()
        }
    }
}

object SmartHealthBiometricLocalUnlock {
    @Volatile
    private var repository: AndroidBiometricLocalUnlockRepository? = null

    @Synchronized
    fun initialize(context: Context): AndroidBiometricLocalUnlockRepository {
        return repository ?: AndroidBiometricLocalUnlockRepository(context).also {
            repository = it
        }
    }

    fun repository(): AndroidBiometricLocalUnlockRepository = checkNotNull(repository) {
        "Biometric local unlock must be initialized before UI composition."
    }

    @Synchronized
    fun clear(): Boolean = repository?.clear() ?: true
}
