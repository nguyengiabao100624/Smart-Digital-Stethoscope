package com.example.smart_health_android.ui

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DataStorageExportUiContractTest {
    private val storageScreen = source("ui/screens/DataStorageScreen.kt")
    private val exportScreen = source("ui/screens/ExportDataScreen.kt")
    private val navigation = source("navigation/AppNavGraph.kt")
    private val api = source("data/SmartHealthApi.kt")

    @Test
    fun `storage UI uses confirmed remote and private local-cache state`() {
        assertTrue(storageScreen.contains("DataStorageViewModelFactory"))
        assertTrue(storageScreen.contains("collectAsStateWithLifecycle()"))
        assertTrue(storageScreen.contains("ShcareLoadingState"))
        assertTrue(storageScreen.contains("ShcareEmptyState"))
        assertTrue(storageScreen.contains("ShcareErrorState"))
        assertTrue(storageScreen.contains("MaterialTheme.colorScheme"))
        assertTrue(storageScreen.contains("ShcareTheme.colors"))
        assertTrue(storageScreen.contains("LiveRegionMode"))
        assertTrue(storageScreen.contains("defaultMinSize(minHeight = 48.dp)"))

        assertFalse(storageScreen.contains("SmartHealthRepository.api"))
        assertFalse(storageScreen.contains("SettingToggleRow"))
        assertFalse(storageScreen.contains("Brush.linearGradient"))
        assertFalse(storageScreen.contains("Color.White"))
        assertFalse(storageScreen.contains("Color(0x"))
        assertFalse(storageScreen.contains("Lần cuối: 2 giờ trước"))
        assertFalse(storageScreen.contains("Chưa đồng bộ"))
        assertFalse(storageScreen.contains("Xóa toàn bộ dữ liệu"))
        assertFalse(storageScreen.contains("onNavigateToDeleteData"))
    }

    @Test
    fun `export UI downloads a real artifact before system document save`() {
        assertTrue(exportScreen.contains("ExportDataViewModelFactory"))
        assertTrue(exportScreen.contains("collectAsStateWithLifecycle()"))
        assertTrue(exportScreen.contains("CreateDocument("))
        assertTrue(exportScreen.contains("ExportDataUiEffect.SaveDocument"))
        assertTrue(exportScreen.contains("copyExportToDocument"))
        assertTrue(exportScreen.contains("effect.contentType"))
        assertTrue(exportScreen.contains("copiedBytes == expectedBytes"))
        assertTrue(exportScreen.contains("resolver.delete(destination"))
        assertTrue(exportScreen.contains("LinearProgressIndicator"))
        assertTrue(exportScreen.contains("DatePickerDialog"))
        assertTrue(exportScreen.contains("MaterialTheme.colorScheme"))

        assertFalse(exportScreen.contains("SmartHealthRepository.api"))
        assertFalse(exportScreen.contains("rememberCoroutineScope"))
        assertFalse(exportScreen.contains("01/01/2026"))
        assertFalse(exportScreen.contains("13/05/2026"))
        assertFalse(exportScreen.contains("\"zip\""))
        assertFalse(exportScreen.contains("Nén ZIP"))
        assertFalse(exportScreen.contains("CreateDocument(\"*/*\")"))
        assertFalse(exportScreen.contains("Color.White"))
        assertFalse(exportScreen.contains("Color(0x"))
    }

    @Test
    fun `mobile navigation cannot reach the platform-wide delete endpoint`() {
        assertFalse(navigation.contains("DeleteDataScreen("))
        assertFalse(navigation.contains("authorizedMobileComposable(navController, \"delete-data\")"))
        assertFalse(api.contains("deleteAllData("))
        assertFalse(api.contains("/data/all"))
    }

    private fun source(relativePath: String): String {
        return projectFile(
            "src/main/java/com/example/smart_health_android/$relativePath",
        ).readText()
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
