package com.example.smart_health_android.clinical.reviews

import com.example.smart_health_android.data.ClinicalReview
import com.example.smart_health_android.data.ClinicalReviewDecision
import com.example.smart_health_android.data.ClinicalReviewList
import com.example.smart_health_android.data.ClinicalReviewStatus
import com.example.smart_health_android.data.SmartHealthApiException
import java.io.IOException
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClinicalReviewsViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `initial load exposes only the canonical workspace review queue`() = runTest(dispatcher) {
        val repository = FakeClinicalReviewsRepository()
        val viewModel = ClinicalReviewsViewModel(repository, "workspace-1", canManage = true)
        runCurrent()

        assertEquals(ClinicalReviewsLoadState.Content, viewModel.uiState.value.loadState)
        assertEquals(listOf("review-1"), viewModel.uiState.value.reviews.map(ClinicalReview::id))
        assertEquals(listOf(ClinicalReviewFilter.Pending), repository.filters)
    }

    @Test
    fun `actionable decision requires a note before calling backend`() = runTest(dispatcher) {
        val repository = FakeClinicalReviewsRepository()
        val viewModel = ClinicalReviewsViewModel(repository, "workspace-1", canManage = true)
        runCurrent()

        viewModel.onAction(
            ClinicalReviewsUiAction.RequestDecision(
                "scan-1",
                ClinicalReviewDecision.RepeatMeasurement,
            ),
        )
        viewModel.onAction(ClinicalReviewsUiAction.ConfirmDecision)

        assertEquals(
            ClinicalReviewValidationError.ActionNoteRequired,
            viewModel.uiState.value.pendingDecision?.validationError,
        )
        assertTrue(repository.decisions.isEmpty())
    }

    @Test
    fun `ambiguous retry reuses key and succeeds only after exact receipt`() = runTest(dispatcher) {
        val repository = FakeClinicalReviewsRepository(
            decisionResults = ArrayDeque(
                listOf(
                    Result.failure(IOException("timeout")),
                    Result.success(reviewedReview()),
                ),
            ),
        )
        val viewModel = ClinicalReviewsViewModel(
            repository,
            "workspace-1",
            canManage = true,
            idempotencyKeyFactory = { "stable-review-key" },
        )
        runCurrent()
        viewModel.onAction(
            ClinicalReviewsUiAction.RequestDecision("scan-1", ClinicalReviewDecision.Accepted),
        )

        viewModel.onAction(ClinicalReviewsUiAction.ConfirmDecision)
        runCurrent()
        assertEquals(ClinicalReviewsError.Offline, viewModel.uiState.value.error)
        assertTrue(viewModel.uiState.value.reviews.isNotEmpty())

        val effect = async { viewModel.effects.first() }
        viewModel.onAction(ClinicalReviewsUiAction.ConfirmDecision)
        runCurrent()

        assertEquals(listOf("stable-review-key", "stable-review-key"), repository.decisions.map { it.key })
        assertEquals(ClinicalReviewsLoadState.Empty, viewModel.uiState.value.loadState)
        assertTrue(viewModel.uiState.value.reviews.isEmpty())
        assertNull(viewModel.uiState.value.pendingDecision)
        assertEquals(
            ClinicalReviewsUiEffect.BackendDecisionConfirmed(ClinicalReviewDecision.Accepted),
            effect.await(),
        )
    }

    @Test
    fun `permission and offline failures remain distinct`() = runTest(dispatcher) {
        val forbidden = ClinicalReviewsViewModel(
            FakeClinicalReviewsRepository(
                loadResults = ArrayDeque(
                    listOf(Result.failure(SmartHealthApiException(403, "FORBIDDEN", message = "denied"))),
                ),
            ),
            "workspace-1",
            canManage = true,
        )
        runCurrent()
        assertEquals(ClinicalReviewsLoadState.PermissionDenied, forbidden.uiState.value.loadState)

        val offline = ClinicalReviewsViewModel(
            FakeClinicalReviewsRepository(
                loadResults = ArrayDeque(listOf(Result.failure(IOException("offline")))),
            ),
            "workspace-1",
            canManage = true,
        )
        runCurrent()
        assertEquals(ClinicalReviewsLoadState.Offline, offline.uiState.value.loadState)
    }
}

private data class ReviewDecisionCall(
    val decision: ClinicalReviewDecision,
    val note: String,
    val key: String,
)

private class FakeClinicalReviewsRepository(
    private val loadResults: ArrayDeque<Result<ClinicalReviewList>> = ArrayDeque(
        listOf(Result.success(reviewList())),
    ),
    private val decisionResults: ArrayDeque<Result<ClinicalReview>> = ArrayDeque(
        listOf(Result.success(reviewedReview())),
    ),
) : ClinicalReviewsRepository {
    val filters = mutableListOf<ClinicalReviewFilter>()
    val decisions = mutableListOf<ReviewDecisionCall>()

    override suspend fun load(
        filter: ClinicalReviewFilter,
        expectedWorkspaceId: String,
    ): ClinicalReviewList {
        filters += filter
        return if (loadResults.size > 1) {
            loadResults.removeFirst().getOrThrow()
        } else {
            loadResults.first().getOrThrow()
        }
    }

    override suspend fun decide(
        review: ClinicalReview,
        decision: ClinicalReviewDecision,
        note: String,
        idempotencyKey: String,
        expectedWorkspaceId: String,
    ): ClinicalReview {
        decisions += ReviewDecisionCall(decision, note, idempotencyKey)
        return decisionResults.removeFirst().getOrThrow()
    }
}

private fun reviewList() = ClinicalReviewList(
    workspaceId = "workspace-1",
    reviews = listOf(pendingReview()),
)

private fun pendingReview() = ClinicalReview(
    id = "review-1",
    scanId = "scan-1",
    organizationId = "workspace-1",
    patientId = "patient-1",
    deviceId = "device-1",
    status = ClinicalReviewStatus.Pending,
    version = 1,
    scanStatus = "needs_review",
    scanCreatedAt = "2026-07-29T08:00:00.000Z",
)

private fun reviewedReview() = pendingReview().copy(
    status = ClinicalReviewStatus.Reviewed,
    decision = ClinicalReviewDecision.Accepted,
    reviewerUserId = "doctor-1",
    reviewedAt = "2026-07-29T08:10:00.000Z",
    version = 2,
)
