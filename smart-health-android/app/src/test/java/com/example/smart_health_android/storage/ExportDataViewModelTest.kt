package com.example.smart_health_android.storage

import java.io.File
import java.io.IOException
import kotlin.io.path.createTempFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ExportDataViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `successful backend artifact waits for system document save before success`() = runTest(dispatcher) {
        val artifactFile = createTempFile("shcare-export-", ".pdf").toFile()
        val repository = FakeExportDataRepository(
            results = ArrayDeque(
                listOf(
                    Result.success(
                        ExportArtifact(
                            file = artifactFile,
                            fileName = "shcare-export.pdf",
                            contentType = "application/pdf",
                            byteCount = 123L,
                            artifactSha256 = "a".repeat(64),
                            rendererVersion = "shcare.export-artifact.v1",
                        ),
                    ),
                ),
            ),
        )
        val viewModel = ExportDataViewModel(
            repository = repository,
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
        )
        val effect = async { viewModel.effects.first() }

        viewModel.onAction(ExportDataUiAction.Submit)
        runCurrent()

        assertEquals(ExportDataPhase.AwaitingDocument, viewModel.uiState.value.phase)
        assertFalse(viewModel.uiState.value.statusMessage?.contains("Đã lưu") == true)
        assertEquals(
            ExportDataUiEffect.SaveDocument(
                file = artifactFile,
                fileName = "shcare-export.pdf",
                contentType = "application/pdf",
            ),
            effect.await(),
        )

        viewModel.onAction(ExportDataUiAction.DocumentSaved)
        runCurrent()

        assertEquals(ExportDataPhase.Saved, viewModel.uiState.value.phase)
        assertTrue(viewModel.uiState.value.statusMessage?.contains("Đã lưu") == true)
        assertEquals(listOf(artifactFile), repository.discarded)
    }

    @Test
    fun `same request retry reuses its idempotency key but changed request rotates it`() = runTest(dispatcher) {
        val repository = FakeExportDataRepository(
            results = ArrayDeque(
                listOf(
                    Result.failure(IOException("offline")),
                    Result.failure(IOException("offline")),
                    Result.failure(IOException("offline")),
                ),
            ),
        )
        val viewModel = ExportDataViewModel(
            repository = repository,
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
        )

        viewModel.onAction(ExportDataUiAction.Submit)
        runCurrent()
        viewModel.onAction(ExportDataUiAction.Submit)
        runCurrent()

        assertEquals(repository.idempotencyKeys[0], repository.idempotencyKeys[1])

        viewModel.onAction(ExportDataUiAction.FormatChanged(ExportFormat.Csv))
        viewModel.onAction(ExportDataUiAction.Submit)
        runCurrent()

        assertNotEquals(repository.idempotencyKeys[1], repository.idempotencyKeys[2])
    }

    @Test
    fun `a new export after a confirmed document save rotates the idempotency key`() =
        runTest(dispatcher) {
            val firstFile = createTempFile("shcare-export-first-", ".pdf").toFile()
            val secondFile = createTempFile("shcare-export-second-", ".pdf").toFile()
            val repository = FakeExportDataRepository(
                results = ArrayDeque(
                    listOf(
                        Result.success(
                            ExportArtifact(
                                file = firstFile,
                                fileName = "first.pdf",
                                contentType = "application/pdf",
                                byteCount = 10L,
                                artifactSha256 = "a".repeat(64),
                                rendererVersion = "shcare.export-artifact.v1",
                            ),
                        ),
                        Result.success(
                            ExportArtifact(
                                file = secondFile,
                                fileName = "second.pdf",
                                contentType = "application/pdf",
                                byteCount = 20L,
                                artifactSha256 = "b".repeat(64),
                                rendererVersion = "shcare.export-artifact.v1",
                            ),
                        ),
                    ),
                ),
            )
            val viewModel = ExportDataViewModel(
                repository = repository,
                expectedUserId = "user_1",
                expectedWorkspaceId = "workspace_1",
            )
            val firstEffect = async { viewModel.effects.first() }

            viewModel.onAction(ExportDataUiAction.Submit)
            runCurrent()
            firstEffect.await()
            viewModel.onAction(ExportDataUiAction.DocumentSaved)
            runCurrent()

            val secondEffect = async { viewModel.effects.first() }
            viewModel.onAction(ExportDataUiAction.Submit)
            runCurrent()
            secondEffect.await()

            assertEquals(2, repository.idempotencyKeys.size)
            assertNotEquals(repository.idempotencyKeys[0], repository.idempotencyKeys[1])
        }

    @Test
    fun `invalid or incomplete date range never calls the backend`() = runTest(dispatcher) {
        val repository = FakeExportDataRepository(results = ArrayDeque())
        val viewModel = ExportDataViewModel(
            repository = repository,
            expectedUserId = "user_1",
            expectedWorkspaceId = "workspace_1",
        )

        viewModel.onAction(
            ExportDataUiAction.DateRangeChanged(
                startDate = "2026-07-27",
                endDate = "",
            ),
        )
        viewModel.onAction(ExportDataUiAction.Submit)
        runCurrent()

        assertEquals(ExportDataPhase.Error, viewModel.uiState.value.phase)
        assertTrue(viewModel.uiState.value.errorMessage?.isNotBlank() == true)
        assertTrue(repository.idempotencyKeys.isEmpty())
    }
}

private class FakeExportDataRepository(
    private val results: ArrayDeque<Result<ExportArtifact>>,
) : ExportDataRepository {
    val idempotencyKeys = mutableListOf<String>()
    val discarded = mutableListOf<File>()

    override suspend fun createAndDownload(
        request: ExportDataRequest,
        idempotencyKey: String,
        expectedUserId: String,
        expectedWorkspaceId: String,
        onProgress: (ExportProgress) -> Unit,
    ): ExportArtifact {
        idempotencyKeys += idempotencyKey
        onProgress(ExportProgress.Creating)
        onProgress(ExportProgress.Downloading(bytesDownloaded = 1L, totalBytes = 2L))
        return results.removeFirst().getOrThrow()
    }

    override fun discard(file: File) {
        discarded += file
    }
}
