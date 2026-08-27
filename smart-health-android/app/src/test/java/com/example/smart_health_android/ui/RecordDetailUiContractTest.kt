package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecordDetailUiContractTest {
    private val screenSource = File(
        "src/main/java/com/example/smart_health_android/ui/screens/RecordDetailScreen.kt",
    )
    private val routeSource = File(
        "src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt",
    )
    private val manifestSource = File("src/main/AndroidManifest.xml")
    private val providerPathsSource = File("src/main/res/xml/record_file_paths.xml")

    @Test
    fun `record detail uses native state contract and real artifact paths`() {
        val source = screenSource.readText()

        assertTrue(source.contains("RecordDetailViewModelFactory"))
        assertTrue(source.contains("RecordWaveform("))
        assertTrue(source.contains("CreateDocument(\"audio/wav\")"))
        assertTrue(source.contains("FileProvider.getUriForFile"))
        assertTrue(source.contains("clearAndSetSemantics"))
        assertTrue(source.contains("840.dp"))
        assertFalse(source.contains("SmartHealthRepository.api"))
        assertFalse(source.contains("LocalUriHandler"))
        assertFalse(source.contains("MediaPlayer"))
        assertFalse(source.contains("Color.White"))
        assertFalse(source.contains("Brush.linearGradient"))
        assertFalse(source.contains("verticalScroll"))
        assertFalse(source.contains("waveform chi tiết sẽ được bổ sung"))
    }

    @Test
    fun `record stop action is capability-derived instead of role-guessed`() {
        val source = routeSource.readText()

        assertTrue(source.contains("canManageScan = routeAccessContext"))
        assertTrue(source.contains("MobileRouteCapabilities.ScanManage::contains"))
    }

    @Test
    fun `shares expose only the bounded private record cache`() {
        val manifest = manifestSource.readText()
        val paths = providerPathsSource.readText()

        assertTrue(manifest.contains("androidx.core.content.FileProvider"))
        assertTrue(manifest.contains("android:exported=\"false\""))
        assertTrue(manifest.contains("android:grantUriPermissions=\"true\""))
        assertTrue(paths.contains("path=\"record-audio/\""))
        assertFalse(paths.contains("path=\".\""))
        assertFalse(paths.contains("external-path"))
    }
}
