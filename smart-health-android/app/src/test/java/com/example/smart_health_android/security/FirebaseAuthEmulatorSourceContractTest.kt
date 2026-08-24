package com.example.smart_health_android.security

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FirebaseAuthEmulatorSourceContractTest {
    @Test
    fun `debug builds can opt into a bounded Firebase Auth emulator`() {
        val build = projectDirectory().resolve("build.gradle.kts").readText()
        val auth = source("data/FirebaseAuthService.kt")

        assertTrue(build.contains("SHCARE_FIREBASE_AUTH_EMULATOR_HOST"))
        assertTrue(build.contains("SHCARE_FIREBASE_AUTH_EMULATOR_PORT"))
        assertTrue(build.contains("buildTypes {\n        debug"))
        assertTrue(auth.contains("BuildConfig.DEBUG"))
        assertTrue(auth.contains("instance.useEmulator("))
    }

    @Test
    fun `release builds cannot inherit local Firebase Auth emulator routing`() {
        val build = projectDirectory().resolve("build.gradle.kts").readText()

        assertTrue(build.contains("Release builds must not use the Firebase Auth emulator"))
        assertTrue(
            build.contains(
                "buildConfigField(\"String\", \"SHCARE_FIREBASE_AUTH_EMULATOR_HOST\", \"\\\"\\\"\")",
            ),
        )
        assertTrue(
            build.contains(
                "buildConfigField(\"int\", \"SHCARE_FIREBASE_AUTH_EMULATOR_PORT\", \"0\")",
            ),
        )
        assertFalse(build.contains("usesCleartextTraffic = \"true\""))
    }

    private fun source(relativePath: String): String =
        projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/$relativePath")
            .readText()

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
