package com.example.smart_health_android.data

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PendingRegistrationStoreSourceContractTest {
    @Test
    fun `owner cleanup returns the durable SharedPreferences commit acknowledgement`() {
        val source = projectDirectory()
            .resolve(
                "src/main/java/com/example/smart_health_android/data/" +
                    "PendingRegistrationStore.kt",
            )
            .readText()

        assertTrue(source.contains("val cleared = preferences(context)"))
        assertTrue(source.contains("if (cleared) current = null"))
        assertTrue(source.contains("return clear(context)"))
        assertFalse(
            source.contains(
                """
                    clear(context)
                    return true
                """.trimIndent(),
            ),
        )
    }

    @Test
    fun `signup owner binding compares the current operation before replacing the checkpoint`() {
        val source = projectDirectory()
            .resolve(
                "src/main/java/com/example/smart_health_android/data/" +
                    "PendingRegistrationStore.kt",
            )
            .readText()

        assertTrue(source.contains("fun saveForFirebaseOwnerIfCurrentDraft("))
        assertTrue(source.contains("currentDraft.roleRequestIdempotencyKey.trim() != expectedOperationId"))
        assertTrue(source.contains("currentDraft.email"))
        assertTrue(source.contains("registration.email"))
    }

    @Test
    fun `signup abandonment clears only the exact current registration operation`() {
        val source = projectDirectory()
            .resolve(
                "src/main/java/com/example/smart_health_android/data/" +
                    "PendingRegistrationStore.kt",
            )
            .readText()

        assertTrue(source.contains("fun clearRegistrationAttempt("))
        assertTrue(source.contains("currentAttempt.roleRequestIdempotencyKey.trim() != expectedOperationId"))
        assertTrue(source.contains("storedFirebaseUserId.isNotBlank() &&"))
        assertTrue(source.contains("storedFirebaseUserId != expectedFirebaseUserId"))
        assertTrue(source.contains("return clear(context)"))
    }

    private fun projectDirectory(): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory,
            workingDirectory.resolve("app"),
        ).firstOrNull { candidate ->
            candidate.resolve("src/main/java").isDirectory
        } ?: error("Cannot locate Android app module from ${workingDirectory.absolutePath}")
    }
}
