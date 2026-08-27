package com.example.smart_health_android.account

import com.example.smart_health_android.data.EmergencyContact
import com.example.smart_health_android.data.PatientMutationIntent
import java.io.File
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FamilyMutationOutboxTest {
    @Test
    fun `production outbox uses Android Keystore GCM opaque slots and no plaintext PHI preference`() {
        val source = projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/account/FamilyMutationOutbox.kt")
            .readText()
        val applicationSource = projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/SmartHealthApplication.kt")
            .readText()

        assertTrue(source.contains("AndroidKeyStore"))
        assertTrue(source.contains("AES/GCM/NoPadding"))
        assertTrue(source.contains("cipher.updateAAD(associatedData)"))
        assertTrue(source.contains("MAX_OUTBOX_SLOTS = 8"))
        assertTrue(source.contains("KEY_CIPHERTEXT_PREFIX"))
        assertTrue(source.contains("clearExpiredBlockedForManualSupport"))
        val preferenceStore = source.substringAfter("private class AndroidFamilyMutationBlobStore")
            .substringBefore("private class AndroidKeystoreFamilyMutationCipher")
        assertFalse(preferenceStore.contains("putString(\"accountId\""))
        assertFalse(preferenceStore.contains("putString(\"workspaceId\""))
        assertFalse(preferenceStore.contains("putString(\"authSessionId\""))
        assertFalse(preferenceStore.contains("putString(LEGACY_PLAINTEXT_KEY"))
        assertTrue(applicationSource.contains("ShcareFamilyMutationOutbox.initialize(this)"))
    }

    @Test
    fun `encrypted outbox round trips every intent across process recreation without plaintext`() {
        val store = MemoryFamilyBlobStore()
        val cipher = JvmAesGcmFamilyCipher()
        var now = 1_000L
        val firstProcess = EncryptedFamilyMutationOutbox(store, cipher) { now }
        val entries = listOf(
            entry(PatientMutationIntent.Create, ownerSuffix = "create"),
            entry(PatientMutationIntent.Update, ownerSuffix = "update", patientId = "patient-update"),
            entry(PatientMutationIntent.Delete, ownerSuffix = "delete", patientId = "patient-delete"),
        )

        entries.forEach { assertNotNull(firstProcess.persist(it)) }
        assertEquals(3, store.slotIds().size)
        store.slotIds().forEach { slotId ->
            assertTrue(Regex("^[a-f0-9]{64}$").matches(slotId))
            assertFalse(slotId.contains("owner-"))
            assertFalse(slotId.contains("workspace-"))
            assertFalse(slotId.contains("session-"))
        }
        store.blobs.values.forEach { blob ->
            assertFalse(blob.ciphertext.contains("Dependent"))
            assertFalse(blob.ciphertext.contains("family-key"))
            assertFalse(blob.ciphertext.contains("owner-"))
        }

        val recreatedProcess = EncryptedFamilyMutationOutbox(store, cipher) { now }
        entries.forEach { expected ->
            val loaded = recreatedProcess.load(expected.authority) as FamilyMutationOutboxLoad.Pending
            assertEquals(expected.intent, loaded.entry.intent)
            assertEquals(expected.patientId, loaded.entry.patientId)
            assertEquals(expected.mutation, loaded.entry.mutation)
            assertEquals(expected.idempotencyKey, loaded.entry.idempotencyKey)
        }
    }

    @Test
    fun `account slots are isolated and corrupted owner never blocks another owner`() {
        val store = MemoryFamilyBlobStore()
        val cipher = JvmAesGcmFamilyCipher()
        val outbox = EncryptedFamilyMutationOutbox(store, cipher) { 2_000L }
        val ownerA = entry(PatientMutationIntent.Create, ownerSuffix = "a")
        val ownerB = entry(PatientMutationIntent.Update, ownerSuffix = "b", patientId = "patient-b")

        assertNotNull(outbox.persist(ownerA))
        val ownerASlot = store.slotIds().single()
        store.blobs[ownerASlot] = checkNotNull(store.blobs[ownerASlot]).copy(ciphertext = "corrupted")
        assertEquals(FamilyMutationOutboxLoad.Unavailable, outbox.load(ownerA.authority))

        assertEquals(FamilyMutationOutboxLoad.Empty, outbox.load(ownerB.authority))
        assertNotNull(outbox.persist(ownerB))
        assertEquals(2, store.slotIds().size)
        val ownerBLoad = outbox.load(ownerB.authority) as FamilyMutationOutboxLoad.Pending
        assertEquals(ownerB.idempotencyKey, ownerBLoad.entry.idempotencyKey)
        assertTrue(outbox.clearExact(ownerB.authority, ownerB.intent, ownerB.idempotencyKey))
        assertEquals(FamilyMutationOutboxLoad.Empty, outbox.load(ownerB.authority))
        assertEquals(FamilyMutationOutboxLoad.Unavailable, outbox.load(ownerA.authority))
    }

    @Test
    fun `expired payload becomes bounded support tombstone and is never silently replaced`() {
        val store = MemoryFamilyBlobStore()
        val cipher = JvmAesGcmFamilyCipher()
        var now = 3_000L
        val outbox = EncryptedFamilyMutationOutbox(store, cipher) { now }
        val pending = entry(PatientMutationIntent.Create, ownerSuffix = "expired")
        assertNotNull(outbox.persist(pending))

        now += 25L * 60L * 60L * 1_000L
        val blocked = outbox.load(pending.authority) as FamilyMutationOutboxLoad.Blocked
        assertEquals(pending.intent, blocked.intent)
        assertEquals(pending.idempotencyKey, blocked.idempotencyKey)
        assertNull(outbox.persist(pending.copy(idempotencyKey = "new-key")))
        assertFalse(
            outbox.clearExpiredBlockedForManualSupport(
                pending.authority,
                pending.intent,
                "wrong-key",
            ),
        )
        assertTrue(
            outbox.clearExpiredBlockedForManualSupport(
                pending.authority,
                pending.intent,
                pending.idempotencyKey,
            ),
        )
        assertEquals(FamilyMutationOutboxLoad.Empty, outbox.load(pending.authority))
    }

    @Test
    fun `bounded slot ledger refuses a ninth unresolved authority without deleting earlier entries`() {
        val store = MemoryFamilyBlobStore()
        val outbox = EncryptedFamilyMutationOutbox(store, JvmAesGcmFamilyCipher()) { 4_000L }
        repeat(8) { index ->
            assertNotNull(outbox.persist(entry(PatientMutationIntent.Create, ownerSuffix = "$index")))
        }
        assertNull(outbox.persist(entry(PatientMutationIntent.Create, ownerSuffix = "overflow")))
        assertEquals(8, store.slotIds().size)
    }

    private fun entry(
        intent: PatientMutationIntent,
        ownerSuffix: String,
        patientId: String = "",
    ): FamilyMutationOutboxEntry {
        val mutation = if (intent == PatientMutationIntent.Delete) null else FamilyProfileMutation(
            name = "Dependent $ownerSuffix",
            relationship = "Child",
            dateOfBirth = "2016-01-02",
            gender = "female",
            phone = "0901000000",
            notes = "",
            bloodType = "O+",
            allergies = listOf("Pollen"),
            emergencyContact = EmergencyContact("Guardian", "0902000000", "Parent"),
        )
        return FamilyMutationOutboxEntry(
            intent = intent,
            patientId = patientId,
            mutation = mutation,
            deleteDisplayName = if (intent == PatientMutationIntent.Delete) "Dependent $ownerSuffix" else "",
            idempotencyKey = "family-key-$ownerSuffix",
            authority = FamilyMutationAuthority(
                accountId = "owner-$ownerSuffix",
                workspaceId = "workspace-$ownerSuffix",
                authSessionId = "session-$ownerSuffix",
                authSessionEpoch = 1L,
            ),
        )
    }

    private fun projectDirectory(): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(workingDirectory, workingDirectory.resolve("app"))
            .firstOrNull { it.resolve("src/main/java").isDirectory }
            ?: error("Cannot locate Android app module")
    }
}

private class MemoryFamilyBlobStore : FamilyMutationBlobStore {
    val blobs = linkedMapOf<String, FamilyMutationEncryptedBlob>()

    override fun read(slotId: String): FamilyMutationEncryptedBlob? = blobs[slotId]

    override fun write(slotId: String, blob: FamilyMutationEncryptedBlob): Boolean {
        blobs[slotId] = blob
        return true
    }

    override fun clear(slotId: String): Boolean {
        blobs.remove(slotId)
        return true
    }

    override fun slotIds(): Set<String> = blobs.keys
}

private class JvmAesGcmFamilyCipher : FamilyMutationCipher {
    private val key: SecretKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

    override fun encrypt(
        plaintext: ByteArray,
        associatedData: ByteArray,
    ): FamilyMutationEncryptedBlob {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        cipher.updateAAD(associatedData)
        return FamilyMutationEncryptedBlob(
            ciphertext = Base64.getEncoder().encodeToString(cipher.doFinal(plaintext)),
            iv = Base64.getEncoder().encodeToString(cipher.iv),
        )
    }

    override fun decrypt(
        blob: FamilyMutationEncryptedBlob,
        associatedData: ByteArray,
    ): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            GCMParameterSpec(128, Base64.getDecoder().decode(blob.iv)),
        )
        cipher.updateAAD(associatedData)
        return cipher.doFinal(Base64.getDecoder().decode(blob.ciphertext))
    }
}
