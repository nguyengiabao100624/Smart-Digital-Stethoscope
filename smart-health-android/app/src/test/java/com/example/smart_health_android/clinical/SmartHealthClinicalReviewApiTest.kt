package com.example.smart_health_android.clinical

import com.example.smart_health_android.clinical.reviews.ApiClinicalReviewsRepository
import com.example.smart_health_android.clinical.reviews.ClinicalReviewConfirmationException
import com.example.smart_health_android.data.ClinicalReviewDecision
import com.example.smart_health_android.data.ClinicalReviewStatus
import com.example.smart_health_android.data.SmartHealthApi
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SmartHealthClinicalReviewApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: SmartHealthApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = SmartHealthApi(baseUrl = server.url("/api/v1").toString().trimEnd('/'))
        api.setAuthToken("clinical-token")
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun `review queue sends bounded status and parses canonical workspace rows`() = runBlocking {
        server.enqueue(jsonResponse(reviewListResponse()))

        val response = api.listClinicalReviews(ClinicalReviewStatus.Pending, limit = 50)

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/v1/portal/review-queue?status=pending&limit=50", request.path)
        assertEquals("Bearer clinical-token", request.getHeader("Authorization"))
        assertEquals("workspace-1", response.workspaceId)
        assertEquals("scan-1", response.reviews.single().scanId)
    }

    @Test
    fun `review decision sends exact optimistic intent and stable idempotency key`() = runBlocking {
        server.enqueue(jsonResponse(reviewMutationResponse(version = 2)))

        val response = api.decideClinicalReview(
            scanId = "scan-1",
            decision = ClinicalReviewDecision.FollowUpRequired,
            note = "Theo dĂµi láº¡i sau 24 giá».",
            expectedVersion = 1,
            idempotencyKey = "review-decision-key-1",
        )

        val request = server.takeRequest()
        val body = JSONObject(request.body.readUtf8())
        assertEquals("POST", request.method)
        assertEquals("/api/v1/portal/review-queue/scan-1/decision", request.path)
        assertEquals("review-decision-key-1", request.getHeader("Idempotency-Key"))
        assertEquals("follow_up_required", body.getString("decision"))
        assertEquals("Theo dĂµi láº¡i sau 24 giá».", body.getString("note"))
        assertEquals(1, body.getInt("expectedVersion"))
        assertEquals(ClinicalReviewStatus.Reviewed, response.review.status)
    }

    @Test
    fun `actionable review decision requires note before network`() = runBlocking {
        val failure = runCatching {
            api.decideClinicalReview(
                "scan-1",
                ClinicalReviewDecision.RepeatMeasurement,
                " ",
                1,
                "review-key-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is IllegalArgumentException)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `repository rejects version not confirmed by backend`() = runBlocking {
        val original = apiListSingleReview()
        server.enqueue(jsonResponse(reviewMutationResponse(version = 3)))

        val failure = runCatching {
            ApiClinicalReviewsRepository(api).decide(
                review = original,
                decision = ClinicalReviewDecision.FollowUpRequired,
                note = "Theo dĂµi láº¡i sau 24 giá».",
                idempotencyKey = "review-key-1",
                expectedWorkspaceId = "workspace-1",
            )
        }.exceptionOrNull()

        assertTrue(failure is ClinicalReviewConfirmationException)
    }

    private suspend fun apiListSingleReview(): com.example.smart_health_android.data.ClinicalReview {
        server.enqueue(jsonResponse(reviewListResponse()))
        return api.listClinicalReviews(ClinicalReviewStatus.Pending).reviews.single()
    }

    private fun jsonResponse(body: String) = MockResponse()
        .setResponseCode(200)
        .setHeader("Content-Type", "application/json")
        .setBody(body)

    private fun reviewListResponse() = """
        {
          "workspaceId": "workspace-1",
          "reviews": [${reviewJson(status = "pending", decision = "", version = 1)}]
        }
    """.trimIndent()

    private fun reviewMutationResponse(version: Int) = """
        {
          "workspaceId": "workspace-1",
          "review": ${reviewJson(
              status = "reviewed",
              decision = "follow_up_required",
              version = version,
              note = "Theo dĂµi láº¡i sau 24 giá».",
              reviewerUserId = "doctor-1",
              reviewedAt = "2026-07-29T08:10:00.000Z",
          )}
        }
    """.trimIndent()

    private fun reviewJson(
        status: String,
        decision: String,
        version: Int,
        note: String = "",
        reviewerUserId: String = "",
        reviewedAt: String = "",
    ) = """
        {
          "id": "review-1",
          "scanId": "scan-1",
          "organizationId": "workspace-1",
          "patientId": "patient-1",
          "deviceId": "device-1",
          "status": "$status",
          "decision": "$decision",
          "note": "$note",
          "reviewerUserId": "$reviewerUserId",
          "reviewedAt": "$reviewedAt",
          "version": $version,
          "scanStatus": "needs_review",
          "scanCreatedAt": "2026-07-29T08:00:00.000Z",
          "createdAt": "",
          "updatedAt": "2026-07-29T08:10:00.000Z"
        }
    """.trimIndent()
}
