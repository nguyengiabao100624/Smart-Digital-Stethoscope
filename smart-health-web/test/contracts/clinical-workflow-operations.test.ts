import assert from "node:assert/strict";
import test from "node:test";

import {
  parseClinicalAlertListResponse,
  parseClinicalAlertMutationResponse,
  parseClinicalReviewListResponse,
  parseClinicalReviewMutationResponse,
} from "../../src/lib/clinical-workflow-operations.ts";

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: "review-001",
    scanId: "scan-001",
    organizationId: "workspace-a",
    patientId: "patient-001",
    deviceId: "device-001",
    status: "pending",
    decision: "",
    note: "",
    reviewerUserId: "",
    reviewedAt: "",
    version: 1,
    scanStatus: "needs_review",
    scanCreatedAt: "2026-07-29T08:00:00.000Z",
    createdAt: "",
    updatedAt: "2026-07-29T08:00:00.000Z",
    ...overrides,
  };
}

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: "alert-001",
    organizationId: "workspace-a",
    sourceType: "scan",
    sourceId: "scan-001",
    dedupeKey: "scan:scan-001",
    occurrenceNumber: 1,
    previousAlertId: "",
    occurredAt: "2026-07-29T08:00:00.000Z",
    status: "open",
    severity: "warning",
    title: "Cần xem lại tín hiệu",
    message: "Lượt đo có nhiễu.",
    patientId: "patient-001",
    deviceId: "device-001",
    scanId: "scan-001",
    acknowledgedByUserId: "",
    acknowledgedAt: "",
    acknowledgementNote: "",
    resolvedByUserId: "",
    resolvedAt: "",
    resolutionNote: "",
    version: 1,
    metadata: {},
    createdAt: "2026-07-29T08:00:00.000Z",
    updatedAt: "2026-07-29T08:00:00.000Z",
    ...overrides,
  };
}

test("accepts only canonical review rows from the active workspace", () => {
  const parsed = parseClinicalReviewListResponse(
    { workspaceId: "workspace-a", reviews: [review()] },
    "workspace-a",
  );
  assert.equal(parsed.reviews[0].scanId, "scan-001");

  assert.throws(
    () =>
      parseClinicalReviewListResponse(
        {
          workspaceId: "workspace-b",
          reviews: [review({ organizationId: "workspace-b" })],
        },
        "workspace-a",
      ),
    /workspace hiện tại/,
  );
  assert.throws(
    () =>
      parseClinicalReviewListResponse(
        {
          workspaceId: "workspace-a",
          reviews: [review(), review()],
        },
        "workspace-a",
      ),
    /trùng/,
  );
});

test("rejects malformed review lifecycle and exact-decision receipts", () => {
  assert.throws(
    () =>
      parseClinicalReviewListResponse(
        {
          workspaceId: "workspace-a",
          reviews: [review({ status: "reviewed", decision: "" })],
        },
        "workspace-a",
      ),
    /quyết định/,
  );

  const receipt = parseClinicalReviewMutationResponse(
    {
      workspaceId: "workspace-a",
      review: review({
        status: "reviewed",
        decision: "follow_up_required",
        note: "Hẹn theo dõi",
        reviewerUserId: "doctor-001",
        reviewedAt: "2026-07-29T08:10:00.000Z",
        version: 2,
      }),
    },
    {
      workspaceId: "workspace-a",
      scanId: "scan-001",
      decision: "follow_up_required",
      note: "Hẹn theo dõi",
      previousVersion: 1,
    },
  );
  assert.equal(receipt.review.version, 2);

  assert.throws(
    () =>
      parseClinicalReviewMutationResponse(
        {
          workspaceId: "workspace-a",
          review: review({
            status: "reviewed",
            decision: "accepted",
            reviewerUserId: "doctor-001",
            reviewedAt: "2026-07-29T08:10:00.000Z",
            version: 2,
          }),
        },
        {
          workspaceId: "workspace-a",
          scanId: "scan-001",
          decision: "repeat_measurement",
          note: "Đo lại",
          previousVersion: 1,
        },
      ),
    /đúng quyết định/,
  );
});

test("rejects foreign, duplicate, and malformed alert ledger rows", () => {
  assert.equal(
    parseClinicalAlertListResponse(
      { workspaceId: "workspace-a", alerts: [alert()] },
      "workspace-a",
    ).alerts[0].id,
    "alert-001",
  );

  assert.throws(
    () =>
      parseClinicalAlertListResponse(
        {
          workspaceId: "workspace-a",
          alerts: [alert({ organizationId: "workspace-b" })],
        },
        "workspace-a",
      ),
    /workspace hiện tại/,
  );
  assert.throws(
    () =>
      parseClinicalAlertListResponse(
        {
          workspaceId: "workspace-a",
          alerts: [alert(), alert()],
        },
        "workspace-a",
      ),
    /trùng/,
  );
  assert.throws(
    () =>
      parseClinicalAlertListResponse(
        {
          workspaceId: "workspace-a",
          alerts: [alert({ sourceType: "provider" })],
        },
        "workspace-a",
      ),
    /nguồn/,
  );
});

test("accepts only the exact alert transition confirmed by a newer version", () => {
  const receipt = parseClinicalAlertMutationResponse(
    {
      workspaceId: "workspace-a",
      alert: alert({
        status: "acknowledged",
        acknowledgedByUserId: "doctor-001",
        acknowledgedAt: "2026-07-29T08:10:00.000Z",
        acknowledgementNote: "Đang kiểm tra",
        version: 2,
      }),
    },
    {
      workspaceId: "workspace-a",
      alertId: "alert-001",
      expectedStatus: "acknowledged",
      previousVersion: 1,
      note: "Đang kiểm tra",
    },
  );
  assert.equal(receipt.alert.status, "acknowledged");

  assert.throws(
    () =>
      parseClinicalAlertMutationResponse(
        {
          workspaceId: "workspace-b",
          alert: alert({
            organizationId: "workspace-b",
            status: "resolved",
            resolvedByUserId: "doctor-001",
            resolvedAt: "2026-07-29T08:15:00.000Z",
            resolutionNote: "Đã xử lý",
            version: 2,
          }),
        },
        {
          workspaceId: "workspace-a",
          alertId: "alert-001",
          expectedStatus: "resolved",
          previousVersion: 1,
          note: "Đã xử lý",
        },
      ),
    /workspace hiện tại/,
  );
});
