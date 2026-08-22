package com.example.smart_health_android.account

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.PatientMutationIntent
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

enum class FamilyMutationOutboxState(val wireValue: String) {
    Pending("pending"),
    ExpiredBlocked("expired_blocked"),
}

data class FamilyMutationOutboxEntry(
    val intent: PatientMutationIntent,
    val patientId: String,
    val mutation: FamilyProfileMutation?,
    val deleteDisplayName: String,
    val idempotencyKey: String,
    val authority: FamilyMutationAuthority,
    val createdAtEpochMs: Long = 0L,
    val expiresAtEpochMs: Long = 0L,
    val state: FamilyMutationOutboxState = FamilyMutationOutboxState.Pending,
)

sealed interface FamilyMutationOutboxLoad {
    data object Empty : FamilyMutationOutboxLoad
    data object Unavailable : FamilyMutationOutboxLoad
    data class Pending(val entry: FamilyMutationOutboxEntry) : FamilyMutationOutboxLoad
    data class Blocked(
        val intent: PatientMutationIntent,
        val idempotencyKey: String,
    ) : FamilyMutationOutboxLoad
}

interface FamilyMutationOutbox {
    fun persist(entry: FamilyMutationOutboxEntry): FamilyMutationOutboxEntry?
    fun load(authority: FamilyMutationAuthority): FamilyMutationOutboxLoad
    fun clearExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean
    fun blockExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean
    fun clearExpiredBlockedForManualSupport(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean
}

internal data class FamilyMutationEncryptedBlob(
    val ciphertext: String,
    val iv: String,
    val version: Int = 1,
)

internal interface FamilyMutationBlobStore {
    fun read(slotId: String): FamilyMutationEncryptedBlob?
    fun write(slotId: String, blob: FamilyMutationEncryptedBlob): Boolean
    fun clear(slotId: String): Boolean
    fun slotIds(): Set<String>
}

internal interface FamilyMutationCipher {
    fun encrypt(plaintext: ByteArray, associatedData: ByteArray): FamilyMutationEncryptedBlob
    fun decrypt(blob: FamilyMutationEncryptedBlob, associatedData: ByteArray): ByteArray
}

internal class EncryptedFamilyMutationOutbox(
    private val blobStore: FamilyMutationBlobStore,
    private val cipher: FamilyMutationCipher,
    private val nowEpochMs: () -> Long = System::currentTimeMillis,
) : FamilyMutationOutbox {
    @Synchronized
    override fun persist(entry: FamilyMutationOutboxEntry): FamilyMutationOutboxEntry? {
        val normalized = entry.normalizedForPersistence(nowEpochMs()) ?: return null
        val slotId = authoritySlotId(entry.authority)
        val existingBlob = blobStore.read(slotId)
        if (existingBlob != null) {
            val existing = decryptEntry(existingBlob, entry.authority) ?: return null
            return existing.takeIf {
                it.state == FamilyMutationOutboxState.Pending &&
                    it.hasSameOperation(normalized)
            }
        }
        if (blobStore.slotIds().size >= MAX_OUTBOX_SLOTS) return null
        return normalized.takeIf(::writeEntry)
    }

    @Synchronized
    override fun load(authority: FamilyMutationAuthority): FamilyMutationOutboxLoad {
        val blob = blobStore.read(authoritySlotId(authority)) ?: return FamilyMutationOutboxLoad.Empty
        val entry = decryptEntry(blob, authority) ?: return FamilyMutationOutboxLoad.Unavailable
        if (!entry.authority.hasSameServerAuthority(authority)) {
            return FamilyMutationOutboxLoad.Unavailable
        }
        if (entry.state == FamilyMutationOutboxState.ExpiredBlocked) {
            return FamilyMutationOutboxLoad.Blocked(entry.intent, entry.idempotencyKey)
        }
        if (nowEpochMs() >= entry.expiresAtEpochMs) {
            val blocked = entry.copy(
                patientId = "",
                mutation = null,
                deleteDisplayName = "",
                state = FamilyMutationOutboxState.ExpiredBlocked,
            )
            if (!writeEntry(blocked)) return FamilyMutationOutboxLoad.Unavailable
            return FamilyMutationOutboxLoad.Blocked(blocked.intent, blocked.idempotencyKey)
        }
        return FamilyMutationOutboxLoad.Pending(entry)
    }

    @Synchronized
    override fun clearExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean {
        val slotId = authoritySlotId(authority)
        val blob = blobStore.read(slotId) ?: return true
        val entry = decryptEntry(blob, authority) ?: return false
        if (
            !entry.authority.hasSameServerAuthority(authority) ||
            entry.intent != intent ||
            entry.idempotencyKey != idempotencyKey
        ) {
            return false
        }
        return blobStore.clear(slotId)
    }

    @Synchronized
    override fun blockExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean {
        val blob = blobStore.read(authoritySlotId(authority)) ?: return false
        val entry = decryptEntry(blob, authority) ?: return false
        if (
            !entry.authority.hasSameServerAuthority(authority) ||
            entry.intent != intent ||
            entry.idempotencyKey != idempotencyKey
        ) {
            return false
        }
        return writeEntry(
            entry.copy(
                patientId = "",
                mutation = null,
                deleteDisplayName = "",
                state = FamilyMutationOutboxState.ExpiredBlocked,
            ),
        )
    }

    @Synchronized
    override fun clearExpiredBlockedForManualSupport(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean {
        val slotId = authoritySlotId(authority)
        val blob = blobStore.read(slotId) ?: return true
        val entry = decryptEntry(blob, authority) ?: return false
        if (
            entry.state != FamilyMutationOutboxState.ExpiredBlocked ||
            entry.intent != intent ||
            entry.idempotencyKey != idempotencyKey ||
            !entry.authority.hasSameServerAuthority(authority)
        ) {
            return false
        }
        // This is intentionally not called automatically. Support must first
        // reconcile the backend idempotency ledger, then clear this exact tombstone.
        return blobStore.clear(slotId)
    }

    private fun writeEntry(entry: FamilyMutationOutboxEntry): Boolean {
        val plaintext = entry.toJson().toString().toByteArray(StandardCharsets.UTF_8)
        if (plaintext.size > MAX_PLAINTEXT_BYTES) return false
        val encrypted = runCatching {
            cipher.encrypt(plaintext, associatedData(entry.authority))
        }.getOrNull() ?: return false
        if (
            encrypted.version != OUTBOX_VERSION ||
            encrypted.ciphertext.length > MAX_ENCODED_BLOB_CHARS ||
            encrypted.iv.length > MAX_IV_CHARS
        ) {
            return false
        }
        return blobStore.write(authoritySlotId(entry.authority), encrypted)
    }

    private fun decryptEntry(
        blob: FamilyMutationEncryptedBlob,
        authority: FamilyMutationAuthority,
    ): FamilyMutationOutboxEntry? {
        if (
            blob.version != OUTBOX_VERSION ||
            blob.ciphertext.isBlank() ||
            blob.ciphertext.length > MAX_ENCODED_BLOB_CHARS ||
            blob.iv.isBlank() ||
            blob.iv.length > MAX_IV_CHARS
        ) {
            return null
        }
        val plaintext = runCatching {
            cipher.decrypt(blob, associatedData(authority))
        }.getOrNull() ?: return null
        if (plaintext.size > MAX_PLAINTEXT_BYTES) return null
        return runCatching {
            familyMutationOutboxEntryFromJson(JSONObject(String(plaintext, StandardCharsets.UTF_8)))
        }.getOrNull()?.takeIf { it.isStructurallyValid() }
    }

    private fun associatedData(authority: FamilyMutationAuthority): ByteArray {
        val ownerBinding = listOf(
            "shcare-family-mutation-outbox-v$OUTBOX_VERSION",
            authority.accountId,
            authority.workspaceId,
            authority.authSessionId,
        ).joinToString("\u001f")
        return MessageDigest.getInstance("SHA-256")
            .digest(ownerBinding.toByteArray(StandardCharsets.UTF_8))
    }

    private fun authoritySlotId(authority: FamilyMutationAuthority): String =
        MessageDigest.getInstance("SHA-256")
            .digest(
                listOf(
                    "shcare-family-mutation-slot-v$OUTBOX_VERSION",
                    authority.accountId,
                    authority.workspaceId,
                    authority.authSessionId,
                ).joinToString("\u001f").toByteArray(StandardCharsets.UTF_8),
            )
            .joinToString("") { byte -> "%02x".format(byte) }

    private companion object {
        const val OUTBOX_VERSION = 1
        const val MAX_PLAINTEXT_BYTES = 32 * 1024
        const val MAX_ENCODED_BLOB_CHARS = 64 * 1024
        const val MAX_IV_CHARS = 128
        const val MAX_OUTBOX_SLOTS = 8
    }
}

internal object ShcareFamilyMutationOutbox : FamilyMutationOutbox {
    @Volatile
    private var delegate: FamilyMutationOutbox? = null

    fun initialize(context: Context) {
        if (delegate != null) return
        synchronized(this) {
            if (delegate == null) {
                delegate = EncryptedFamilyMutationOutbox(
                    blobStore = AndroidFamilyMutationBlobStore(context.applicationContext),
                    cipher = AndroidKeystoreFamilyMutationCipher(),
                )
            }
        }
    }

    override fun persist(entry: FamilyMutationOutboxEntry): FamilyMutationOutboxEntry? =
        delegate?.persist(entry)

    override fun load(authority: FamilyMutationAuthority): FamilyMutationOutboxLoad =
        delegate?.load(authority) ?: FamilyMutationOutboxLoad.Unavailable

    override fun clearExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean = delegate?.clearExact(authority, intent, idempotencyKey) ?: false

    override fun blockExact(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean = delegate?.blockExact(authority, intent, idempotencyKey) ?: false

    override fun clearExpiredBlockedForManualSupport(
        authority: FamilyMutationAuthority,
        intent: PatientMutationIntent,
        idempotencyKey: String,
    ): Boolean = delegate?.clearExpiredBlockedForManualSupport(
        authority,
        intent,
        idempotencyKey,
    ) ?: false
}

@SuppressLint("ApplySharedPref", "UseKtx")
private class AndroidFamilyMutationBlobStore(context: Context) : FamilyMutationBlobStore {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    override fun read(slotId: String): FamilyMutationEncryptedBlob? {
        if (!SLOT_ID_REGEX.matches(slotId)) return null
        val ciphertextKey = "$KEY_CIPHERTEXT_PREFIX$slotId"
        if (!preferences.contains(ciphertextKey)) return null
        return FamilyMutationEncryptedBlob(
            ciphertext = preferences.getString(ciphertextKey, "").orEmpty(),
            iv = preferences.getString("$KEY_IV_PREFIX$slotId", "").orEmpty(),
            version = preferences.getInt("$KEY_VERSION_PREFIX$slotId", 0),
        )
    }

    override fun write(slotId: String, blob: FamilyMutationEncryptedBlob): Boolean {
        if (!SLOT_ID_REGEX.matches(slotId)) return false
        return preferences.edit()
        .remove(LEGACY_PLAINTEXT_KEY)
        .remove(LEGACY_GLOBAL_CIPHERTEXT_KEY)
        .remove(LEGACY_GLOBAL_IV_KEY)
        .remove(LEGACY_GLOBAL_VERSION_KEY)
        .putString("$KEY_CIPHERTEXT_PREFIX$slotId", blob.ciphertext)
        .putString("$KEY_IV_PREFIX$slotId", blob.iv)
        .putInt("$KEY_VERSION_PREFIX$slotId", blob.version)
        .commit()
    }

    override fun clear(slotId: String): Boolean {
        if (!SLOT_ID_REGEX.matches(slotId)) return false
        return preferences.edit()
        .remove(LEGACY_PLAINTEXT_KEY)
        .remove("$KEY_CIPHERTEXT_PREFIX$slotId")
        .remove("$KEY_IV_PREFIX$slotId")
        .remove("$KEY_VERSION_PREFIX$slotId")
        .commit()
    }

    override fun slotIds(): Set<String> = preferences.all.keys
        .asSequence()
        .filter { it.startsWith(KEY_CIPHERTEXT_PREFIX) }
        .map { it.removePrefix(KEY_CIPHERTEXT_PREFIX) }
        .filter(SLOT_ID_REGEX::matches)
        .toSet()

    private companion object {
        const val PREFS_NAME = "shcare_family_mutation_outbox"
        const val LEGACY_PLAINTEXT_KEY = "payload"
        const val LEGACY_GLOBAL_CIPHERTEXT_KEY = "payload_ciphertext"
        const val LEGACY_GLOBAL_IV_KEY = "payload_iv"
        const val LEGACY_GLOBAL_VERSION_KEY = "payload_version"
        const val KEY_CIPHERTEXT_PREFIX = "slot_ciphertext_"
        const val KEY_IV_PREFIX = "slot_iv_"
        const val KEY_VERSION_PREFIX = "slot_version_"
        val SLOT_ID_REGEX = Regex("^[a-f0-9]{64}$")
    }
}

private class AndroidKeystoreFamilyMutationCipher : FamilyMutationCipher {
    override fun encrypt(
        plaintext: ByteArray,
        associatedData: ByteArray,
    ): FamilyMutationEncryptedBlob {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        cipher.updateAAD(associatedData)
        return FamilyMutationEncryptedBlob(
            ciphertext = Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP),
            iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
        )
    }

    override fun decrypt(
        blob: FamilyMutationEncryptedBlob,
        associatedData: ByteArray,
    ): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateKey(),
            GCMParameterSpec(GCM_TAG_BITS, Base64.decode(blob.iv, Base64.NO_WRAP)),
        )
        cipher.updateAAD(associatedData)
        return cipher.doFinal(Base64.decode(blob.ciphertext, Base64.NO_WRAP))
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val KEY_ALIAS = "shcare_family_mutation_outbox_aes_v1"
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_BITS = 128
    }
}

private fun FamilyMutationOutboxEntry.normalizedForPersistence(
    nowEpochMs: Long,
): FamilyMutationOutboxEntry? {
    val normalized = copy(
        patientId = patientId.trim(),
        deleteDisplayName = deleteDisplayName.trim(),
        idempotencyKey = idempotencyKey.trim(),
        authority = authority.copy(
            accountId = authority.accountId.trim(),
            workspaceId = authority.workspaceId.trim(),
            authSessionId = authority.authSessionId.trim(),
        ),
        createdAtEpochMs = nowEpochMs,
        expiresAtEpochMs = nowEpochMs + PENDING_TTL_MS,
        state = FamilyMutationOutboxState.Pending,
    )
    return normalized.takeIf { it.isStructurallyValid() }
}

private fun FamilyMutationOutboxEntry.hasSameOperation(other: FamilyMutationOutboxEntry): Boolean =
    intent == other.intent &&
        patientId == other.patientId &&
        mutation == other.mutation &&
        deleteDisplayName == other.deleteDisplayName &&
        idempotencyKey == other.idempotencyKey &&
        authority.hasSameServerAuthority(other.authority)

private fun FamilyMutationOutboxEntry.isStructurallyValid(): Boolean {
    if (
        idempotencyKey.length !in 1..160 ||
        authority.accountId.length !in 1..160 ||
        authority.workspaceId.length !in 1..160 ||
        authority.authSessionId.length !in 1..160 ||
        authority.authSessionEpoch < 0L ||
        createdAtEpochMs <= 0L ||
        expiresAtEpochMs <= createdAtEpochMs ||
        expiresAtEpochMs - createdAtEpochMs > PENDING_TTL_MS
    ) {
        return false
    }
    if (state == FamilyMutationOutboxState.ExpiredBlocked) {
        return patientId.isBlank() && mutation == null && deleteDisplayName.isBlank()
    }
    return when (intent) {
        PatientMutationIntent.Create -> patientId.isBlank() && mutation?.isBounded() == true
        PatientMutationIntent.Update -> patientId.length in 1..160 && mutation?.isBounded() == true
        PatientMutationIntent.Delete ->
            patientId.length in 1..160 && mutation == null && deleteDisplayName.length <= 512
    }
}

private fun FamilyProfileMutation.isBounded(): Boolean =
    name.length in 1..512 &&
        relationship.length in 1..160 &&
        dateOfBirth.length <= 32 &&
        gender.length <= 64 &&
        phone.length <= 64 &&
        notes.length <= 4_096 &&
        bloodType.length <= 32 &&
        allergies.size <= 64 &&
        allergies.all { it.length <= 512 } &&
        emergencyContact.name.length <= 512 &&
        emergencyContact.phone.length <= 64 &&
        emergencyContact.relationship.length <= 160

private fun FamilyMutationOutboxEntry.toJson(): JSONObject = JSONObject()
    .put("version", 1)
    .put("intent", intent.wireValue)
    .put("patientId", patientId)
    .put("mutation", mutation?.toJson() ?: JSONObject.NULL)
    .put("deleteDisplayName", deleteDisplayName)
    .put("idempotencyKey", idempotencyKey)
    .put(
        "authority",
        JSONObject()
            .put("accountId", authority.accountId)
            .put("workspaceId", authority.workspaceId)
            .put("authSessionId", authority.authSessionId)
            .put("authSessionEpoch", authority.authSessionEpoch),
    )
    .put("createdAtEpochMs", createdAtEpochMs)
    .put("expiresAtEpochMs", expiresAtEpochMs)
    .put("state", state.wireValue)

private fun FamilyProfileMutation.toJson(): JSONObject = JSONObject()
    .put("name", name)
    .put("relationship", relationship)
    .put("dateOfBirth", dateOfBirth)
    .put("gender", gender)
    .put("phone", phone)
    .put("notes", notes)
    .put("bloodType", bloodType)
    .put("allergies", JSONArray(allergies))
    .put(
        "emergencyContact",
        JSONObject()
            .put("name", emergencyContact.name)
            .put("phone", emergencyContact.phone)
            .put("relationship", emergencyContact.relationship),
    )

private fun familyMutationOutboxEntryFromJson(json: JSONObject): FamilyMutationOutboxEntry {
    require(json.optInt("version") == 1)
    val intent = PatientMutationIntent.fromWireValue(json.optString("intent"))
        ?: error("Unsupported Family mutation intent")
    val authorityJson = json.getJSONObject("authority")
    val mutationJson = json.optJSONObject("mutation")
    return FamilyMutationOutboxEntry(
        intent = intent,
        patientId = json.getString("patientId"),
        mutation = mutationJson?.let(::familyMutationFromJson),
        deleteDisplayName = json.getString("deleteDisplayName"),
        idempotencyKey = json.getString("idempotencyKey"),
        authority = FamilyMutationAuthority(
            accountId = authorityJson.getString("accountId"),
            workspaceId = authorityJson.getString("workspaceId"),
            authSessionId = authorityJson.getString("authSessionId"),
            authSessionEpoch = authorityJson.getLong("authSessionEpoch"),
        ),
        createdAtEpochMs = json.getLong("createdAtEpochMs"),
        expiresAtEpochMs = json.getLong("expiresAtEpochMs"),
        state = FamilyMutationOutboxState.entries.firstOrNull {
            it.wireValue == json.getString("state")
        } ?: error("Unsupported Family mutation outbox state"),
    )
}

private fun familyMutationFromJson(json: JSONObject): FamilyProfileMutation {
    val emergency = json.getJSONObject("emergencyContact")
    val allergiesJson = json.getJSONArray("allergies")
    return FamilyProfileMutation(
        name = json.getString("name"),
        relationship = json.getString("relationship"),
        dateOfBirth = json.getString("dateOfBirth"),
        gender = json.getString("gender"),
        phone = json.getString("phone"),
        notes = json.getString("notes"),
        bloodType = json.getString("bloodType"),
        allergies = List(allergiesJson.length()) { index -> allergiesJson.getString(index) },
        emergencyContact = EmergencyContact(
            name = emergency.getString("name"),
            phone = emergency.getString("phone"),
            relationship = emergency.getString("relationship"),
        ),
    )
}

private const val PENDING_TTL_MS = 24L * 60L * 60L * 1_000L
