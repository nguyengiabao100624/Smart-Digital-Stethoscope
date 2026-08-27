package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Test

class LegacyThemePaletteRemovalContractTest {
    @Test
    fun legacyLightOnlyPaletteIsNotPartOfProductionSources() {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        val candidates = sequenceOf(
            workingDirectory.resolve(
                "src/main/java/com/example/smart_health_android/ui/theme/Color.kt",
            ),
            workingDirectory.resolve(
                "app/src/main/java/com/example/smart_health_android/ui/theme/Color.kt",
            ),
        )

        assertFalse(
            "The orphan light-only Color.kt palette must stay outside production",
            candidates.any(File::isFile),
        )
    }
}
