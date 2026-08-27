import type {
  ClinicalAlert,
  ClinicalAlertStatus,
  ClinicalReview,
  ReviewDecision,
} from "./smart-health-api";

export type ClinicalReviewMutationExpectation = {
  workspaceId: string;
  scanId: string;
  decision: ReviewDecision;
  note: string;
  previousVersion: number;
};

export type ClinicalAlertMutationExpectation = {
  workspaceId: string;
  alertId: string;
  expectedStatus: Exclude<ClinicalAlertStatus, "open">;
  previousVersion: number;
  note: string;
};

const REVIEW_STATUSES = new Set(["pending", "reviewed"]);
const REVIEW_DECISIONS = new Set<ReviewDecision>([
  "accepted",
  "repeat_measurement",
  "follow_up_required",
]);
const REVIEWABLE_SCAN_STATUSES = new Set(["completed", "needs_review"]);
const ALERT_STATUSES = new Set<ClinicalAlertStatus>([
  "open",
  "acknowledged",
  "resolved",
]);
const ALERT_SOURCE_TYPES = new Set(["device", "scan"]);

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi nghiệp vụ lâm sàng thiếu ${label}.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new Error(`Phản hồi nghiệp vụ lâm sàng có ${label} không hợp lệ.`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(`Phản hồi nghiệp vụ lâm sàng có ${label} không hợp lệ.`);
  }
  return value;
}

function optionalDate(value: unknown, label: string) {
  const text = optionalText(value, label);
  if (!text) return "";
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`Phản hồi nghiệp vụ lâm sàng có ${label} không hợp lệ.`);
  }
  return text;
}

function requiredDate(value: unknown, label: string) {
  const text = requiredText(value, label);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`Phản hồi nghiệp vụ lâm sàng có ${label} không hợp lệ.`);
  }
  return text;
}

function requireResponseWorkspace(
  response: Record<string, unknown>,
  expectedWorkspaceId: string,
) {
  const expected = requiredText(expectedWorkspaceId, "workspace kỳ vọng");
  const actual = requiredText(response.workspaceId, "workspaceId");
  if (actual !== expected) {
    throw new Error(
      "Phản hồi nghiệp vụ lâm sàng không thuộc workspace hiện tại.",
    );
  }
  return actual;
}

function parseCanonicalReview(
  value: unknown,
  expectedWorkspaceId: string,
): ClinicalReview {
  const review = recordOf(value);
  const organizationId = requiredText(
    review.organizationId,
    "workspace của lượt duyệt",
  );
  if (organizationId !== expectedWorkspaceId) {
    throw new Error("Lượt duyệt không thuộc workspace hiện tại.");
  }

  const status = requiredText(review.status, "trạng thái lượt duyệt");
  if (!REVIEW_STATUSES.has(status)) {
    throw new Error("Phản hồi lượt duyệt có trạng thái không hợp lệ.");
  }
  const decision = optionalText(review.decision, "quyết định duyệt");
  const note = optionalText(review.note, "ghi chú duyệt");
  const reviewerUserId = optionalText(
    review.reviewerUserId,
    "người duyệt",
  );
  const reviewedAt = optionalDate(review.reviewedAt, "thời điểm duyệt");

  if (status === "pending") {
    if (decision || reviewerUserId || reviewedAt) {
      throw new Error(
        "Phản hồi lượt duyệt đang chờ nhưng đã chứa quyết định không hợp lệ.",
      );
    }
  } else {
    if (!REVIEW_DECISIONS.has(decision as ReviewDecision)) {
      throw new Error("Phản hồi lượt duyệt đã xử lý nhưng thiếu quyết định.");
    }
    if (!reviewerUserId || !reviewedAt) {
      throw new Error(
        "Phản hồi lượt duyệt đã xử lý nhưng thiếu người duyệt hoặc thời điểm.",
      );
    }
    if (decision !== "accepted" && !note) {
      throw new Error(
        "Phản hồi lượt duyệt thiếu ghi chú cho quyết định cần hành động.",
      );
    }
  }

  const scanStatus = requiredText(
    review.scanStatus,
    "trạng thái lượt đo",
  );
  if (!REVIEWABLE_SCAN_STATUSES.has(scanStatus)) {
    throw new Error(
      "Phản hồi lượt duyệt tham chiếu lượt đo chưa sẵn sàng.",
    );
  }

  return {
    id: requiredText(review.id, "ID lượt duyệt"),
    scanId: requiredText(review.scanId, "scanId"),
    organizationId,
    patientId: optionalText(review.patientId, "patientId"),
    deviceId: optionalText(review.deviceId, "deviceId"),
    status: status as ClinicalReview["status"],
    decision: decision as ClinicalReview["decision"],
    note,
    reviewerUserId,
    reviewedAt,
    version: positiveInteger(review.version, "phiên bản lượt duyệt"),
    scanStatus,
    scanCreatedAt: requiredDate(
      review.scanCreatedAt,
      "thời điểm tạo lượt đo",
    ),
    createdAt: optionalDate(review.createdAt, "thời điểm tạo lượt duyệt"),
    updatedAt: optionalDate(review.updatedAt, "thời điểm cập nhật lượt duyệt"),
  };
}

export function parseClinicalReviewListResponse(
  response: unknown,
  expectedWorkspaceId: string,
) {
  const record = recordOf(response);
  const workspaceId = requireResponseWorkspace(record, expectedWorkspaceId);
  if (!Array.isArray(record.reviews)) {
    throw new Error("Phản hồi hàng đợi duyệt thiếu danh sách canonical.");
  }

  const ids = new Set<string>();
  const scanIds = new Set<string>();
  const reviews = record.reviews.map((item) => {
    const review = parseCanonicalReview(item, workspaceId);
    if (ids.has(review.id) || scanIds.has(review.scanId)) {
      throw new Error("Phản hồi hàng đợi duyệt có mục bị trùng.");
    }
    ids.add(review.id);
    scanIds.add(review.scanId);
    return review;
  });
  return { workspaceId, reviews };
}

export function parseClinicalReviewMutationResponse(
  response: unknown,
  expectation: ClinicalReviewMutationExpectation,
) {
  const record = recordOf(response);
  const workspaceId = requireResponseWorkspace(
    record,
    expectation.workspaceId,
  );
  const review = parseCanonicalReview(record.review, workspaceId);
  if (review.scanId !== expectation.scanId) {
    throw new Error("Backend không trả về đúng lượt đo đang duyệt.");
  }
  if (review.status !== "reviewed") {
    throw new Error("Backend chưa xác nhận lượt đo đã được duyệt.");
  }
  if (review.decision !== expectation.decision) {
    throw new Error("Backend chưa xác nhận đúng quyết định duyệt.");
  }
  if ((review.note || "").trim() !== expectation.note.trim()) {
    throw new Error("Backend chưa xác nhận đúng ghi chú duyệt.");
  }
  if (review.version <= expectation.previousVersion) {
    throw new Error("Backend chưa xác nhận phiên bản duyệt mới hơn.");
  }
  return { workspaceId, review };
}

function parseCanonicalAlert(
  value: unknown,
  expectedWorkspaceId: string,
): ClinicalAlert {
  const alert = recordOf(value);
  const organizationId = requiredText(
    alert.organizationId,
    "workspace của cảnh báo",
  );
  if (organizationId !== expectedWorkspaceId) {
    throw new Error("Cảnh báo không thuộc workspace hiện tại.");
  }

  const sourceType = requiredText(alert.sourceType, "loại nguồn cảnh báo");
  if (!ALERT_SOURCE_TYPES.has(sourceType)) {
    throw new Error("Phản hồi cảnh báo có nguồn không hợp lệ.");
  }
  const sourceId = requiredText(alert.sourceId, "ID nguồn cảnh báo");
  const patientId = optionalText(alert.patientId, "patientId");
  const deviceId = optionalText(alert.deviceId, "deviceId");
  const scanId = optionalText(alert.scanId, "scanId");
  if (
    (sourceType === "device" && deviceId !== sourceId) ||
    (sourceType === "scan" && scanId !== sourceId)
  ) {
    throw new Error("Phản hồi cảnh báo có định danh nguồn không khớp.");
  }

  const status = requiredText(alert.status, "trạng thái cảnh báo");
  if (!ALERT_STATUSES.has(status as ClinicalAlertStatus)) {
    throw new Error("Phản hồi cảnh báo có trạng thái không hợp lệ.");
  }
  const acknowledgedByUserId = optionalText(
    alert.acknowledgedByUserId,
    "người tiếp nhận",
  );
  const acknowledgedAt = optionalDate(
    alert.acknowledgedAt,
    "thời điểm tiếp nhận",
  );
  const acknowledgementNote = optionalText(
    alert.acknowledgementNote,
    "ghi chú tiếp nhận",
  );
  const resolvedByUserId = optionalText(
    alert.resolvedByUserId,
    "người xử lý",
  );
  const resolvedAt = optionalDate(alert.resolvedAt, "thời điểm xử lý");
  const resolutionNote = optionalText(
    alert.resolutionNote,
    "ghi chú xử lý",
  );

  if (
    status === "acknowledged" &&
    (!acknowledgedByUserId || !acknowledgedAt)
  ) {
    throw new Error(
      "Phản hồi cảnh báo đã tiếp nhận nhưng thiếu người hoặc thời điểm.",
    );
  }
  if (
    status === "resolved" &&
    (!resolvedByUserId || !resolvedAt || !resolutionNote)
  ) {
    throw new Error(
      "Phản hồi cảnh báo đã xử lý nhưng thiếu bằng chứng xử lý.",
    );
  }

  const metadata =
    alert.metadata === undefined ? {} : recordOf(alert.metadata);
  if (
    alert.metadata !== undefined &&
    (typeof alert.metadata !== "object" ||
      alert.metadata === null ||
      Array.isArray(alert.metadata))
  ) {
    throw new Error("Phản hồi cảnh báo có metadata không hợp lệ.");
  }

  return {
    id: requiredText(alert.id, "ID cảnh báo"),
    organizationId,
    sourceType,
    sourceId,
    dedupeKey: optionalText(alert.dedupeKey, "khóa chống trùng"),
    occurrenceNumber: positiveInteger(
      alert.occurrenceNumber,
      "số lần xuất hiện",
    ),
    previousAlertId: optionalText(
      alert.previousAlertId,
      "cảnh báo trước đó",
    ),
    occurredAt: requiredDate(alert.occurredAt, "thời điểm xảy ra"),
    status: status as ClinicalAlertStatus,
    severity: requiredText(alert.severity, "mức độ cảnh báo"),
    title: requiredText(alert.title, "tiêu đề cảnh báo"),
    message: requiredText(alert.message, "nội dung cảnh báo"),
    patientId,
    deviceId,
    scanId,
    acknowledgedByUserId,
    acknowledgedAt,
    acknowledgementNote,
    resolvedByUserId,
    resolvedAt,
    resolutionNote,
    version: positiveInteger(alert.version, "phiên bản cảnh báo"),
    metadata,
    createdAt: requiredDate(alert.createdAt, "thời điểm tạo cảnh báo"),
    updatedAt: requiredDate(alert.updatedAt, "thời điểm cập nhật cảnh báo"),
  };
}

export function parseClinicalAlertListResponse(
  response: unknown,
  expectedWorkspaceId: string,
) {
  const record = recordOf(response);
  const workspaceId = requireResponseWorkspace(record, expectedWorkspaceId);
  if (!Array.isArray(record.alerts)) {
    throw new Error("Phản hồi sổ cảnh báo thiếu danh sách canonical.");
  }

  const ids = new Set<string>();
  const alerts = record.alerts.map((item) => {
    const alert = parseCanonicalAlert(item, workspaceId);
    if (ids.has(alert.id)) {
      throw new Error(`Phản hồi sổ cảnh báo bị trùng ID ${alert.id}.`);
    }
    ids.add(alert.id);
    return alert;
  });
  return { workspaceId, alerts };
}

export function parseClinicalAlertMutationResponse(
  response: unknown,
  expectation: ClinicalAlertMutationExpectation,
) {
  const record = recordOf(response);
  const workspaceId = requireResponseWorkspace(
    record,
    expectation.workspaceId,
  );
  const alert = parseCanonicalAlert(record.alert, workspaceId);
  if (alert.id !== expectation.alertId) {
    throw new Error("Backend không trả về đúng cảnh báo đang thao tác.");
  }
  if (alert.status !== expectation.expectedStatus) {
    throw new Error("Backend chưa xác nhận đúng trạng thái cảnh báo.");
  }
  const receiptNote =
    expectation.expectedStatus === "acknowledged"
      ? alert.acknowledgementNote
      : alert.resolutionNote;
  if ((receiptNote || "").trim() !== expectation.note.trim()) {
    throw new Error("Backend chưa xác nhận đúng ghi chú cảnh báo.");
  }
  if (alert.version <= expectation.previousVersion) {
    throw new Error("Backend chưa xác nhận phiên bản cảnh báo mới hơn.");
  }
  return { workspaceId, alert };
}
