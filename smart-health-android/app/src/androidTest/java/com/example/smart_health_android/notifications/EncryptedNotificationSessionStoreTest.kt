package com.example.smart_health_android.notifications

import android.content.Context
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EncryptedNotificationSessionStoreTest {
    @Test
    fun encryptedBindingSurvivesProcessStyleRecreationAndClearsWithoutPlaintext() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val suffix = UUID.randomUUID().toString()
        val preferencesName = "notification-session-test-$suffix"
        val store = EncryptedNotificationSessionStore(
            context = context,
            preferencesName = preferencesName,
            keyAlias = "notification-session-test-key-$suffix",
        )
        val binding = NotificationSessionBinding(
            backendUserId = "backend-user-secret",
            firebaseUserId = "firebase-user-secret",
            workspaceId = "workspace-secret",
            generation = "generation-secret",
        )

        try {
            assertTrue(store.save(binding))
            assertEquals(binding, store.load())
            assertEquals("workspace-secret", store.load()?.workspaceId)

            val persistedValues = context
                .getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
                .all
                .values
                .joinToString("|")
            assertFalse(persistedValues.contains(binding.backendUserId))
            assertFalse(persistedValues.contains(binding.firebaseUserId))
            assertFalse(persistedValues.contains(binding.workspaceId))
            assertFalse(persistedValues.contains(binding.generation))

            assertTrue(store.clear())
            assertEquals(null, store.load())
        } finally {
            store.destroyForTest()
        }
    }

    @Test
    fun processRestartRestoresOnlyTheSameFirebaseOwnerAndFailsClosedDuringInvalidation() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val suffix = UUID.randomUUID().toString()
        val preferencesName = "notification-session-restart-test-$suffix"
        val keyAlias = "notification-session-restart-test-key-$suffix"
        val persistedBinding = NotificationSessionBinding(
            backendUserId = "backend-user-a",
            firebaseUserId = "firebase-user-a",
            workspaceId = "workspace-a",
            generation = "generation-a",
        )
        val writer = EncryptedNotificationSessionStore(
            context = context,
            preferencesName = preferencesName,
            keyAlias = keyAlias,
        )

        try {
            assertTrue(writer.save(persistedBinding))
            val matchingGate = NotificationSessionGate()
            assertTrue(
                restoreNotificationSessionBinding(
                    gate = matchingGate,
                    store = EncryptedNotificationSessionStore(
                        context = context,
                        preferencesName = preferencesName,
                        keyAlias = keyAlias,
                    ),
                    currentFirebaseUserId = "firebase-user-a",
                    invalidationPending = false,
                ),
            )
            assertTrue(
                matchingGate.canDisplay(
                    "backend-user-a",
                    "workspace-a",
                    "firebase-user-a",
                ),
            )
            assertEquals(
                "workspace-a",
                matchingGate.activeBindingOrNull()?.workspaceId,
            )

            val mismatchedGate = NotificationSessionGate()
            assertFalse(
                restoreNotificationSessionBinding(
                    gate = mismatchedGate,
                    store = EncryptedNotificationSessionStore(
                        context = context,
                        preferencesName = preferencesName,
                        keyAlias = keyAlias,
                    ),
                    currentFirebaseUserId = "firebase-user-b",
                    invalidationPending = false,
                ),
            )
            assertFalse(
                mismatchedGate.canDisplay(
                    "backend-user-a",
                    "workspace-a",
                    "firebase-user-b",
                ),
            )
            assertEquals(null, writer.load())

            assertTrue(writer.save(persistedBinding))
            val invalidationGate = NotificationSessionGate()
            assertFalse(
                restoreNotificationSessionBinding(
                    gate = invalidationGate,
                    store = EncryptedNotificationSessionStore(
                        context = context,
                        preferencesName = preferencesName,
                        keyAlias = keyAlias,
                    ),
                    currentFirebaseUserId = "firebase-user-a",
                    invalidationPending = true,
                ),
            )
            assertFalse(
                invalidationGate.canDisplay(
                    "backend-user-a",
                    "workspace-a",
                    "firebase-user-a",
                ),
            )
            assertEquals(null, writer.load())
        } finally {
            writer.destroyForTest()
        }
    }

    @Test
    fun legacyVersionOrEncryptedBindingWithoutWorkspaceFailsClosed() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val suffix = UUID.randomUUID().toString()
        val preferencesName = "notification-session-workspace-test-$suffix"
        val keyAlias = "notification-session-workspace-test-key-$suffix"
        val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        val store = EncryptedNotificationSessionStore(
            context = context,
            preferencesName = preferencesName,
            keyAlias = keyAlias,
        )
        val binding = NotificationSessionBinding(
            backendUserId = "backend-user-a",
            firebaseUserId = "firebase-user-a",
            workspaceId = "workspace-a",
            generation = "generation-a",
        )

        try {
            assertTrue(store.save(binding))
            assertTrue(
                preferences.edit()
                    .putInt(KEY_VERSION, LEGACY_VERSION)
                    .commit(),
            )
            assertNull(store.load())
            assertFalse(preferences.contains(KEY_CIPHERTEXT))
            assertFalse(preferences.contains(KEY_IV))

            assertTrue(store.save(binding))
            rewriteEncryptedBindingWithoutWorkspace(
                preferencesName = preferencesName,
                keyAlias = keyAlias,
                context = context,
            )
            assertNull(store.load())
            assertFalse(preferences.contains(KEY_CIPHERTEXT))
            assertFalse(preferences.contains(KEY_IV))
        } finally {
            store.destroyForTest()
        }
    }

    private fun rewriteEncryptedBindingWithoutWorkspace(
        preferencesName: String,
        keyAlias: String,
        context: Context,
    ) {
        val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        val ciphertext = requireNotNull(preferences.getString(KEY_CIPHERTEXT, null))
        val iv = requireNotNull(preferences.getString(KEY_IV, null))
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val key = requireNotNull(keyStore.getKey(keyAlias, null) as? SecretKey)
        val associatedData = "$preferencesName:$KEY_CIPHERTEXT:v$CURRENT_VERSION"
            .toByteArray(StandardCharsets.UTF_8)
        val decryptCipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(
                Cipher.DECRYPT_MODE,
                key,
                GCMParameterSpec(
                    GCM_TAG_BITS,
                    Base64.decode(iv, Base64.NO_WRAP),
                ),
            )
            updateAAD(associatedData)
        }
        val decrypted = decryptCipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP))
        val legacyJson = JSONObject(String(decrypted, StandardCharsets.UTF_8)).apply {
            remove(JSON_WORKSPACE_ID)
        }
        val encryptCipher = Cipher.getInstance(TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, key)
            updateAAD(associatedData)
        }
        val rewrittenCiphertext = encryptCipher.doFinal(
            legacyJson.toString().toByteArray(StandardCharsets.UTF_8),
        )

        assertTrue(
            preferences.edit()
                .putString(
                    KEY_CIPHERTEXT,
                    Base64.encodeToString(rewrittenCiphertext, Base64.NO_WRAP),
                )
                .putString(
                    KEY_IV,
                    Base64.encodeToString(encryptCipher.iv, Base64.NO_WRAP),
                )
                .putInt(KEY_VERSION, CURRENT_VERSION)
                .commit(),
        )
    }

    private companion object {
        const val KEY_CIPHERTEXT = "binding_ciphertext"
        const val KEY_IV = "binding_iv"
        const val KEY_VERSION = "binding_version"
        const val LEGACY_VERSION = 1
        const val CURRENT_VERSION = 2
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
        const val JSON_WORKSPACE_ID = "workspaceId"
    }
}
