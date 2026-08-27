package com.example.smart_health_android.notifications

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

/**
 * Authenticates explicit notification intents before the exported launcher activity consumes them.
 *
 * A custom action is not an authorization boundary: another application can copy it into an
 * explicit intent. The HMAC key is non-exportable and remains in Android Keystore, so only this
 * application can create a launch request accepted by [SmartHealthNotificationIntentContract].
 */
internal class NotificationIntentAuthenticator(
    private val keyAlias: String = DEFAULT_KEY_ALIAS,
) {
    @Synchronized
    fun sign(fields: List<String>): String {
        return Base64.encodeToString(
            calculateMac(fields),
            Base64.NO_WRAP or Base64.NO_PADDING,
        )
    }

    @Synchronized
    fun verify(
        fields: List<String>,
        encodedSignature: String,
    ): Boolean {
        if (encodedSignature.isBlank()) return false
        val suppliedSignature = runCatching {
            Base64.decode(
                encodedSignature,
                Base64.NO_WRAP or Base64.NO_PADDING,
            )
        }.getOrNull() ?: return false
        return MessageDigest.isEqual(calculateMac(fields), suppliedSignature)
    }

    private fun calculateMac(fields: List<String>): ByteArray {
        val canonicalPayload = fields.joinToString(separator = "") { field ->
            val bytes = field.toByteArray(StandardCharsets.UTF_8)
            "${bytes.size}:$field"
        }
        return Mac.getInstance(MAC_ALGORITHM).run {
            init(getOrCreateKey())
            doFinal(canonicalPayload.toByteArray(StandardCharsets.UTF_8))
        }
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
            KEYSTORE_PROVIDER,
        ).run {
            init(
                KeyGenParameterSpec.Builder(
                    keyAlias,
                    KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
                )
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build(),
            )
            generateKey()
        }
    }

    private companion object {
        const val DEFAULT_KEY_ALIAS = "shcare_notification_intent_hmac_v1"
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val MAC_ALGORITHM = "HmacSHA256"
    }
}
