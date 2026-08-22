package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class UiScreenApiBoundaryTest {
    @Test
    fun `screens never access the API singleton directly`() {
        val screensDirectory = projectDirectory()
            .resolve("src/main/java/com/example/smart_health_android/ui/screens")
        val directApiScreens = screensDirectory
            .walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { it.readText().contains("SmartHealthRepository.api") }
            .map(File::getName)
            .toSortedSet()

        assertEquals(sortedSetOf<String>(), directApiScreens)
        assertFalse(
            "Doctor dashboard must stay behind its repository and ViewModel boundary",
            "DashboardScreen.kt" in directApiScreens,
        )
        assertFalse(
            "Medical records must stay behind its repository and ViewModel boundary",
            "MedicalRecordsScreen.kt" in directApiScreens,
        )
        assertFalse(
            "Sign-up must stay behind its repository and ViewModel boundary",
            "SignUpScreen.kt" in directApiScreens,
        )
        assertFalse(
            "Email verification must stay behind its repository and ViewModel boundary",
            "ContactVerificationScreens.kt" in directApiScreens,
        )
        assertFalse("Settings must stay behind its ViewModel boundary", "SettingsScreen.kt" in directApiScreens)
        assertFalse(
            "Change password must stay behind its repository and ViewModel boundary",
            "ChangePasswordScreen.kt" in directApiScreens,
        )
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
