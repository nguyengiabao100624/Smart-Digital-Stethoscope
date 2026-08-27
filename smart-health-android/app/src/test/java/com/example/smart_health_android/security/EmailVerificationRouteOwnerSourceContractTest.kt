package com.example.smart_health_android.security

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class EmailVerificationRouteOwnerSourceContractTest {
    @Test
    fun `route owner is injected through screen factory and repository without recapture`() {
        val screen = source("ui/screens/ContactVerificationScreens.kt")
        val verification = source("security/EmailVerificationViewModel.kt")

        assertTrue(screen.contains("firebaseOwner: FirebaseOwnerBinding,"))
        assertTrue(screen.contains("firebaseOwner = firebaseOwner"))
        assertTrue(verification.contains("private val expectedOwner: FirebaseOwnerBinding"))
        assertTrue(verification.contains("expectedOwner = firebaseOwner"))
        assertFalse(
            verification.contains(
                "private val expectedOwner = firebaseSession.currentOwnerBindingOrNull()",
            ),
        )
    }

    private fun source(relativePath: String): String {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve("src/main/java/com/example/smart_health_android/$relativePath"),
            workingDirectory.resolve("app/src/main/java/com/example/smart_health_android/$relativePath"),
        ).firstOrNull(File::isFile)?.readText()
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
