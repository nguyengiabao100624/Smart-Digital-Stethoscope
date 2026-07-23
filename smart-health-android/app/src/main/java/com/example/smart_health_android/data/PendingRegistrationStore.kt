package com.example.smart_health_android.data

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

data class PendingRegistration(
    val accountType: String,
    val name: String,
    val email: String,
    val phone: String,
    val license: String = "",
    val hospital: String = "",
    val department: String = "",
    val organizationId: String = "",
    val reason: String = ""
)

@SuppressLint("ApplySharedPref", "UseKtx")
object PendingRegistrationStore {
    private const val PREFS_NAME = "smart_health_pending_registration"
    private const val LEGACY_PLAINTEXT_KEY = "payload"
    private const val KEY_CIPHERTEXT = "payload_ciphertext"
    private const val KEY_IV = "payload_iv"
    private const val KEY_VERSION = "payload_version"
    private const val CURRENT_VERSION = 1
    private const val KEY_ALIAS = "shcare_pending_registration_aes_v1"
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private val associatedData = "$PREFS_NAME:$KEY_CIPHERTEXT:v$CURRENT_VERSION"
        .toByteArray(StandardCharsets.UTF_8)

    @Volatile
    var current: PendingRegistration? = null
        private set

    @Synchronized
    fun save(context: Context, registration: PendingRegistration) {
        val encrypted = encrypt(registration.toJson().toString())
        // This is one small registration checkpoint. A synchronous commit lets callers fail
        // closed instead of claiming recovery data was persisted when the disk write failed.
        val saved = preferences(context)
            .edit()
            .remove(LEGACY_PLAINTEXT_KEY)
            .putString(KEY_CIPHERTEXT, encrypted.ciphertext)
            .putString(KEY_IV, encrypted.iv)
            .putInt(KEY_VERSION, CURRENT_VERSION)
            .commit()
        check(saved) { "Không thể lưu an toàn thông tin đăng ký tạm." }
        current = registration
    }

    @Synchronized
    fun load(context: Context): PendingRegistration? {
        current?.let { return it }
        val preferences = preferences(context)
        val ciphertext = preferences.getString(KEY_CIPHERTEXT, null)
        val iv = preferences.getString(KEY_IV, null)
        if (ciphertext != null || iv != null) {
            if (
                ciphertext == null ||
                iv == null ||
                preferences.getInt(KEY_VERSION, 0) != CURRENT_VERSION
            ) {
                clearEncrypted(preferences)
                return null
            }
            return runCatching { decrypt(ciphertext, iv).toPendingRegistration() }
                .getOrElse {
                    clearEncrypted(preferences)
                    resetKey()
                    null
                }
                .also { current = it }
        }

        val legacy = preferences.getString(LEGACY_PLAINTEXT_KEY, null) ?: return null
        val registration = runCatching { legacy.toPendingRegistration() }.getOrNull()
        if (registration == null) {
            preferences.edit().remove(LEGACY_PLAINTEXT_KEY).commit()
            return null
        }
        runCatching { save(context, registration) }
            .onFailure {
                preferences.edit().remove(LEGACY_PLAINTEXT_KEY).commit()
                current = registration
            }
        return registration
    }

    @Synchronized
    fun clear(context: Context? = null) {
        current = null
        context?.let(::preferences)
            ?.edit()
            ?.remove(LEGACY_PLAINTEXT_KEY)
            ?.remove(KEY_CIPHERTEXT)
            ?.remove(KEY_IV)
            ?.remove(KEY_VERSION)
            ?.commit()
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
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            generateKey()
        }
    }

    private fun resetKey() {
        runCatching {
            KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
                load(null)
                if (containsAlias(KEY_ALIAS)) deleteEntry(KEY_ALIAS)
            }
        }
    }

    private fun preferences(context: Context) = context.applicationContext
        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun clearEncrypted(preferences: android.content.SharedPreferences) {
        preferences.edit()
            .remove(KEY_CIPHERTEXT)
            .remove(KEY_IV)
            .remove(KEY_VERSION)
            .remove(LEGACY_PLAINTEXT_KEY)
            .commit()
    }

    private fun String.toPendingRegistration(): PendingRegistration {
        val json = JSONObject(this)
        return PendingRegistration(
            accountType = json.optString("accountType"),
            name = json.optString("name"),
            email = json.optString("email"),
            phone = json.optString("phone"),
            license = json.optString("license"),
            hospital = json.optString("hospital"),
            department = json.optString("department"),
            organizationId = json.optString("organizationId"),
            reason = json.optString("reason"),
        )
    }

    private fun PendingRegistration.toJson(): JSONObject {
        return JSONObject()
            .put("accountType", accountType)
            .put("name", name)
            .put("email", email)
            .put("phone", phone)
            .put("license", license)
            .put("hospital", hospital)
            .put("department", department)
            .put("organizationId", organizationId)
            .put("reason", reason)
    }

    private data class EncryptedPayload(
        val ciphertext: String,
        val iv: String,
    )
}
