package com.example.smart_health_android.ui.screens

import android.content.ContentValues
import android.provider.MediaStore
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.smart_health_android.data.StorageSummary
import com.example.smart_health_android.storage.DataStorageLoadState
import com.example.smart_health_android.storage.DataStorageRepository
import com.example.smart_health_android.storage.DataStorageSnapshot
import com.example.smart_health_android.storage.DataStorageViewModel
import com.example.smart_health_android.storage.ExportArtifact
import com.example.smart_health_android.storage.ExportDataRepository
import com.example.smart_health_android.storage.ExportDataRequest
import com.example.smart_health_android.storage.ExportDataViewModel
import com.example.smart_health_android.storage.ExportProgress
import com.example.smart_health_android.storage.LocalCacheSummary
import com.example.smart_health_android.ui.foundation.ShcareThemeMode
import com.example.smart_health_android.ui.theme.ShcareMobileTheme
import java.io.File
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DataStorageExportScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun measuredStorageRemainsUsableInDarkThemeAtTwoHundredPercentFontScale() {
        val viewModel = DataStorageViewModel(
            repository = StaticDataStorageRepository(
                result = Result.success(
                    DataStorageSnapshot(
                        remote = StorageSummary(
                            scanCount = 3,
                            patientCount = 2,
                            audioFileCount = 1,
                            audioUsedBytes = 524_288L,
                            cloudUsedBytes = 786_432L,
                            storageFileCount = 2,
                        ),
                        localCache = LocalCacheSummary(
                            fileCount = 1,
                            byteCount = 2_048L,
                        ),
                    ),
                ),
            ),
        )

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(hostDensity.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(
                    mode = ShcareThemeMode.Dark,
                    useDynamicColor = false,
                ) {
                    DataStorageScreen(
                        onNavigateBack = {},
                        onNavigateToExportData = {},
                        canExportData = true,
                        viewModel = viewModel,
                    )
                }
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == DataStorageLoadState.Ready
        }
        composeRule.onNodeWithText("Lưu trữ và xuất dữ liệu").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Cập nhật số liệu lưu trữ")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithText("Tệp tạm trên máy").assertIsDisplayed()
        composeRule.onNodeWithTag("data-storage-list")
            .performScrollToNode(hasText("Xóa tệp tạm trên thiết bị"))
        composeRule.onNodeWithText("Xóa tệp tạm trên thiết bị")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("data-storage-list")
            .performScrollToNode(hasText("Tạo bản xuất dữ liệu"))
        composeRule.onNodeWithText("Tạo bản xuất dữ liệu")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithText("Xóa toàn bộ dữ liệu").assertDoesNotExist()
    }

    @Test
    fun offlineStorageHasAnExplicitFortyEightDpRetryState() {
        val viewModel = DataStorageViewModel(
            repository = StaticDataStorageRepository(
                result = Result.failure(IOException("offline")),
            ),
        )

        composeRule.setContent {
            ShcareMobileTheme(
                mode = ShcareThemeMode.Light,
                useDynamicColor = false,
            ) {
                DataStorageScreen(
                    onNavigateBack = {},
                    onNavigateToExportData = {},
                    canExportData = false,
                    viewModel = viewModel,
                )
            }
        }

        composeRule.waitUntil(timeoutMillis = 5_000L) {
            viewModel.uiState.value.loadState == DataStorageLoadState.Offline
        }
        composeRule.onNodeWithText("Thử lại")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithText("Tạo bản xuất dữ liệu").assertDoesNotExist()
    }

    @Test
    fun exportSurfaceUsesNativeFormatsAndLargeTouchTargetsWithoutZip() {
        val viewModel = ExportDataViewModel(
            repository = FailingExportRepository(),
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
        )

        composeRule.setContent {
            val hostDensity = LocalDensity.current
            CompositionLocalProvider(
                LocalDensity provides Density(hostDensity.density, fontScale = 2f),
            ) {
                ShcareMobileTheme(
                    mode = ShcareThemeMode.Dark,
                    useDynamicColor = false,
                ) {
                    ExportDataScreen(
                        onNavigateBack = {},
                        expectedUserId = "user_1",
                        expectedWorkspaceId = "workspace_1",
                        viewModel = viewModel,
                    )
                }
            }
        }

        composeRule.onNodeWithText("Xuất dữ liệu").assertIsDisplayed()
        composeRule.onNodeWithText("Từ ngày")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("export-data-list")
            .performScrollToNode(hasText("PDF"))
        composeRule.onNodeWithText("PDF")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("export-data-list")
            .performScrollToNode(hasText("JSON"))
        composeRule.onNodeWithText("JSON")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithTag("export-data-list")
            .performScrollToNode(hasText("Tạo và tải bản xuất"))
        composeRule.onNodeWithText("Tạo và tải bản xuất")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
        composeRule.onNodeWithText("ZIP").assertDoesNotExist()
    }

    @Test
    fun verifiedArtifactCopiesThroughTheAndroidDocumentProvider() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val expected = "verified-shcare-export".toByteArray()
        val source = File.createTempFile("shcare-export-provider-", ".json", context.cacheDir)
            .apply { writeBytes(expected) }
        val resolver = context.contentResolver
        val destination = resolver.insert(
            MediaStore.Downloads.EXTERNAL_CONTENT_URI,
            ContentValues().apply {
                put(
                    MediaStore.MediaColumns.DISPLAY_NAME,
                    "shcare-export-test-${System.nanoTime()}.json",
                )
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
            },
        )
        assertNotNull(destination)

        try {
            runBlocking {
                copyExportToDocument(
                    context = context,
                    source = source,
                    destination = requireNotNull(destination),
                )
            }
            val actual = resolver.openInputStream(requireNotNull(destination))
                ?.use { it.readBytes() }
            assertArrayEquals(expected, actual)
        } finally {
            source.delete()
            destination?.let { resolver.delete(it, null, null) }
        }
    }
}

private class StaticDataStorageRepository(
    private val result: Result<DataStorageSnapshot>,
) : DataStorageRepository {
    override suspend fun load(): DataStorageSnapshot = result.getOrThrow()

    override suspend fun clearLocalCache(): LocalCacheSummary =
        result.getOrThrow().localCache.copy(fileCount = 0, byteCount = 0L)
}

private class FailingExportRepository : ExportDataRepository {
    override suspend fun createAndDownload(
        request: ExportDataRequest,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        onProgress: (ExportProgress) -> Unit,
    ): ExportArtifact = throw IOException("offline")

    override fun discard(file: File) = Unit
}
