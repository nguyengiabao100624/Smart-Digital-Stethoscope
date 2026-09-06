package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AIAssistantComposerContractTest {
    private val source = projectFile(
        "src/main/java/com/example/smart_health_android/ui/screens/AIAssistantScreen.kt",
    ).readText()

    @Test
    fun composerUsesTheIntegratedShcareVoiceLayout() {
        assertTrue(source.contains("ai_assistant.composer_shell"))
        assertTrue(source.contains("ai_assistant.voice_cancel"))
        assertTrue(source.contains("ai_assistant.waveform"))
        assertTrue(source.contains("ai_assistant.voice_stop"))
        assertFalse(source.contains("OutlinedTextField("))
    }

    @Test
    fun attachmentMenuOnlyPromisesImplementedNativeActions() {
        assertTrue(source.contains("ai_assistant.attachment_menu"))
        assertTrue(source.contains("Camera"))
        assertTrue(source.contains("Ảnh"))
        assertTrue(source.contains("Tệp"))
        assertFalse(source.contains("Plugin"))
    }

    private fun projectFile(relativePath: String): File {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
