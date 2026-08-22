package com.example.smart_health_android.ui.components

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShcareAdaptiveLayoutModeTest {
    @Test
    fun compactWidthsUseBottomNavigationMode() {
        assertEquals(
            ShcareAdaptiveLayoutMode.Compact,
            resolveShcareAdaptiveLayoutMode(widthDp = 360f, fontScale = 1f),
        )
        assertEquals(
            ShcareAdaptiveLayoutMode.Compact,
            resolveShcareAdaptiveLayoutMode(widthDp = 412f, fontScale = 1f),
        )
        assertEquals(
            ShcareAdaptiveLayoutMode.Compact,
            resolveShcareAdaptiveLayoutMode(widthDp = 599.5f, fontScale = 1f),
        )
    }

    @Test
    fun mediumWidthUsesSinglePaneNavigationRailMode() {
        assertEquals(
            ShcareAdaptiveLayoutMode.NavigationRail,
            resolveShcareAdaptiveLayoutMode(widthDp = 600f, fontScale = 1f),
        )
        assertEquals(
            ShcareAdaptiveLayoutMode.NavigationRail,
            resolveShcareAdaptiveLayoutMode(widthDp = 839.5f, fontScale = 1f),
        )
    }

    @Test
    fun expandedWidthUsesTwoPaneMode() {
        assertEquals(
            ShcareAdaptiveLayoutMode.TwoPane,
            resolveShcareAdaptiveLayoutMode(widthDp = 840f, fontScale = 1f),
        )
    }

    @Test
    fun expandedWidthFallsBackToSinglePaneAtTwoHundredPercentFontScale() {
        assertEquals(
            ShcareAdaptiveLayoutMode.NavigationRail,
            resolveShcareAdaptiveLayoutMode(widthDp = 840f, fontScale = 2f),
        )
    }

    @Test
    fun scaffoldKeepsLargeNavigationLabelsReadableAndExactWidthBoundaries() {
        val source = scaffoldSource()

        assertTrue(source.contains("NavigationLabelMaxLines = 2"))
        assertTrue(source.contains("maxLines = NavigationLabelMaxLines"))
        assertTrue(source.contains("TextOverflow.Ellipsis"))
        assertTrue(source.contains("labelTestTag()"))
        assertFalse(source.contains("maxLines = 1"))
        assertFalse(source.contains("roundToInt"))
    }

    private fun scaffoldSource(): String {
        val workingDirectory = File(requireNotNull(System.getProperty("user.dir")))
        val relativePath =
            "src/main/java/com/example/smart_health_android/ui/components/ShcareScaffold.kt"
        return sequenceOf(
            workingDirectory.resolve(relativePath),
            workingDirectory.resolve("app").resolve(relativePath),
        ).firstOrNull(File::isFile)
            ?.readText()
            ?: error("Cannot locate $relativePath from ${workingDirectory.absolutePath}")
    }
}
