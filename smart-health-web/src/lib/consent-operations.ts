import type {
  CreatePatientSharePayload,
  PatientShare,
  PatientShareActor,
  PatientShareAuthorityType,
  PatientShareStatus,
  ShareTarget,
} from "./smart-health-api";

const AUTHORITY_TYPES = new Set<PatientShareAuthorityType>([
  "patient_consent",
  "clinician_access_grant",
  "administrative_assignment",
]);
const SHARE_STATUSES = new Set<PatientShareStatus>([
  "active",
  "revoked",
  "expired",
]);
const SHARE_SCOPES = new Set(["patient_profile", "selected_scans"]);

export interface PatientShareBoundary {
  workspaceId: string;
  patientId: string;
}

export interface PatientShareListResponse extends PatientShareBoundary {
  generatedAt: string;
  shares: PatientShare[];
}

export interface PatientShareCreateExpectation extends PatientShareBoundary {
  intent: CreatePatientSharePayload;
}

export interface PatientShareRevokeExpectation extends PatientShareBoundary {
  shareId: string;
}

export interface PatientShareCreateResponse extends PatientShareBoundary {
  generatedAt: string;
  share: PatientShare;
  replayed: boolean;
}

export interface PatientShareRevokeResponse
  extends PatientShareCreateResponse {
  revoked: true;
}

export interface ShareTargetsResponse {
  generatedAt: string;
  workspaceId: string;
  doctors: ShareTarget[];
  workspaces: ShareTarget[];
}

function recordOf(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} phải là object.`);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} là bắt buộc.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") {
    throw new Error(`${label} không hợp lệ.`);
  }
  return value.trim();
}

function requiredTimestamp(value: unknown, label: string) {
  const timestamp = requiredText(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return timestamp;
}

function optionalTimestamp(value: unknown, label: string) {
  const timestamp = optionalText(value, label);
  if (timestamp && !Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return timestamp;
}

function requireBoundary(
  response: Record<string, unknown>,
  expected: PatientShareBoundary,
) {
  const expectedWorkspaceId = requiredText(
    expected.workspaceId,
    "Workspace quyền truy cập dự kiến",
  );
  const expectedPatientId = requiredText(
    expected.patientId,
    "Hồ sơ quyền truy cập dự kiến",
  );
  const workspaceId = requiredText(
    response.workspaceId,
    "Workspace quyền truy cập",
  );
  const patientId = requiredText(
    response.patientId,
    "Hồ sơ quyền truy cập",
  );
  if (workspaceId !== expectedWorkspaceId) {
    throw new Error(
      "Phản hồi quyền truy cập không thuộc workspace hiện tại.",
    );
  }
  if (patientId !== expectedPatientId) {
    throw new Error(
      "Phản hồi quyền truy cập không thuộc hồ sơ đang thao tác.",
    );
  }
  return { workspaceId, patientId };
}

function parseActor(value: unknown, label: string): PatientShareActor | null {
  if (value === undefined || value === null) return null;
  const actor = recordOf(value, label);
  return {
    id: requiredText(actor.id, `${label} ID`),
    name: requiredText(actor.name, `${label} tên`),
    role: requiredText(actor.role, `${label} vai trò`),
  };
}

function parsePatientShare(
  value: unknown,
  expectedPatientId: string,
): PatientShare {
  const share = recordOf(value, "Quyền truy cập dữ liệu");
  const id = requiredText(share.id, "ID quyền truy cập");
  const patientId = requiredText(share.patientId, "patientId quyền truy cập");
  if (patientId !== expectedPatientId) {
    throw new Error("Quyền truy cập không thuộc hồ sơ đang thao tác.");
  }

  const authorityType = requiredText(
    share.authorityType,
    "Loại thẩm quyền",
  ) as PatientShareAuthorityType;
  if (!AUTHORITY_TYPES.has(authorityType)) {
    throw new Error("Quyền truy cập có loại thẩm quyền không hợp lệ.");
  }
  const status = requiredText(
    share.status,
    "Lifecycle quyền truy cập",
  ) as PatientShareStatus;
  if (!SHARE_STATUSES.has(status)) {
    throw new Error("Quyền truy cập có lifecycle không hợp lệ.");
  }
  if (typeof share.active !== "boolean" || share.active !== (status === "active")) {
    throw new Error("Lifecycle và cờ active của quyền truy cập mâu thuẫn.");
  }
  if (share.accessLevel !== "read") {
    throw new Error("Quyền truy cập có accessLevel không được hỗ trợ.");
  }

  const scope = requiredText(share.scope, "Phạm vi quyền truy cập");
  if (!SHARE_SCOPES.has(scope)) {
    throw new Error("Quyền truy cập có scope không hợp lệ.");
  }
  if (!Array.isArray(share.scanIds)) {
    throw new Error("Quyền truy cập thiếu danh sách scanIds canonical.");
  }
  const scanIds = share.scanIds.map((scanId) =>
    requiredText(scanId, "scanId được chia sẻ"),
  );
  if (new Set(scanIds).size !== scanIds.length) {
    throw new Error("Quyền truy cập có scanId bị trùng.");
  }
  if (scope === "patient_profile" && scanIds.length > 0) {
    throw new Error("Quyền toàn hồ sơ không được kèm scanIds.");
  }
  if (scope === "selected_scans" && scanIds.length === 0) {
    throw new Error("Quyền theo lượt đo phải có ít nhất một scanId.");
  }

  const recipient = recordOf(share.recipient, "Người nhận quyền truy cập");
  const recipientType = requiredText(
    recipient.type,
    "Loại người nhận",
  );
  if (recipientType !== "doctor" && recipientType !== "workspace") {
    throw new Error("Loại người nhận quyền truy cập không hợp lệ.");
  }
  const recipientId = requiredText(recipient.id, "ID người nhận");
  const recipientWorkspaceId = requiredText(
    recipient.workspaceId,
    "Workspace người nhận",
  );
  const doctorUserId = optionalText(
    share.doctorUserId || share.doctorId,
    "Bác sĩ nhận quyền",
  );
  const organizationId = optionalText(
    share.organizationId,
    "Workspace nhận quyền",
  );
  if (
    (recipientType === "doctor" &&
      (!doctorUserId || doctorUserId !== recipientId)) ||
    (recipientType === "workspace" &&
      (!organizationId ||
        organizationId !== recipientId ||
        recipientWorkspaceId !== recipientId))
  ) {
    throw new Error(
      "Người nhận quyền truy cập không khớp principal canonical.",
    );
  }

  const audit = recordOf(share.audit, "Audit quyền truy cập");
  const grantedByUserId = requiredText(
    audit.grantedByUserId,
    "Actor cấp quyền",
  );
  const grantedAt = requiredTimestamp(audit.grantedAt, "Thời điểm cấp quyền");
  const revokedByUserId = optionalText(
    audit.revokedByUserId,
    "Actor thu hồi quyền",
  );
  const revokedAt = optionalTimestamp(
    audit.revokedAt,
    "Thời điểm thu hồi quyền",
  );
  if (status === "revoked" && (!revokedByUserId || !revokedAt)) {
    throw new Error(
      "Quyền đã thu hồi nhưng thiếu actor hoặc thời điểm audit.",
    );
  }
  if (status !== "revoked" && (revokedByUserId || revokedAt)) {
    throw new Error(
      "Lifecycle quyền truy cập mâu thuẫn với audit thu hồi.",
    );
  }

  const consentedAt = optionalTimestamp(
    share.consentedAt,
    "Thời điểm consent",
  );
  if (authorityType === "patient_consent" && !consentedAt) {
    throw new Error("Consent của bệnh nhân thiếu thời điểm xác nhận.");
  }
  if (authorityType !== "patient_consent" && consentedAt) {
    throw new Error(
      "Quyền không phải consent nhưng chứa thời điểm consent.",
    );
  }

  const expiresAt = optionalTimestamp(
    share.expiresAt,
    "Thời điểm hết hạn quyền truy cập",
  );
  const createdAt = requiredTimestamp(
    share.createdAt || grantedAt,
    "Thời điểm tạo quyền truy cập",
  );
  const updatedAt = requiredTimestamp(
    share.updatedAt || grantedAt,
    "Thời điểm cập nhật quyền truy cập",
  );

  return {
    ...(share as unknown as PatientShare),
    id,
    patientId,
    doctorUserId: doctorUserId || undefined,
    organizationId: organizationId || undefined,
    scope: scope as PatientShare["scope"],
    scanIds,
    accessLevel: "read",
    purpose: optionalText(share.purpose, "Mục đích truy cập"),
    consentedAt,
    active: status === "active",
    authorityType,
    status,
    recipient: {
      ...(recipient as unknown as PatientShare["recipient"]),
      id: recipientId,
      type: recipientType,
      name: requiredText(recipient.name, "Tên người nhận"),
      workspaceId: recipientWorkspaceId,
    },
    grantedByActor: parseActor(
      share.grantedByActor,
      "Actor cấp quyền hiển thị",
    ),
    revokedByActor: parseActor(
      share.revokedByActor,
      "Actor thu hồi quyền hiển thị",
    ),
    audit: {
      ...(audit as unknown as PatientShare["audit"]),
      grantedByUserId,
      grantedAt,
      revokedByUserId,
      revokedAt,
      updatedAt: optionalTimestamp(
        audit.updatedAt,
        "Thời điểm cập nhật audit",
      ),
    },
    expiresAt: expiresAt || undefined,
    revokedAt: revokedAt || null,
    createdAt,
    updatedAt,
  };
}

function parseReplayed(value: unknown) {
  if (typeof value !== "boolean") {
    throw new Error("Biên nhận quyền truy cập thiếu cờ replayed canonical.");
  }
  return value;
}

export function parsePatientShareListResponse(
  response: unknown,
  expected: PatientShareBoundary,
): PatientShareListResponse {
  const root = recordOf(response, "Sổ quyền truy cập");
  const boundary = requireBoundary(root, expected);
  if (!Array.isArray(root.shares)) {
    throw new Error("Sổ quyền truy cập thiếu danh sách canonical.");
  }
  const ids = new Set<string>();
  const shares = root.shares.map((value) => {
    const parsed = parsePatientShare(value, boundary.patientId);
    if (ids.has(parsed.id)) {
      throw new Error(`Sổ quyền truy cập bị trùng ID ${parsed.id}.`);
    }
    ids.add(parsed.id);
    return parsed;
  });
  return {
    generatedAt: requiredTimestamp(
      root.generatedAt,
      "Thời điểm tạo sổ quyền truy cập",
    ),
    ...boundary,
    shares,
  };
}

export function parsePatientShareCreateResponse(
  response: unknown,
  expected: PatientShareCreateExpectation,
): PatientShareCreateResponse {
  const root = recordOf(response, "Biên nhận cấp quyền truy cập");
  const boundary = requireBoundary(root, expected);
  const share = parsePatientShare(root.share, boundary.patientId);
  if (share.status !== "active" || share.active !== true) {
    throw new Error("Backend chưa xác nhận quyền truy cập đang có hiệu lực.");
  }

  const isDoctorIntent = "doctorUserId" in expected.intent;
  const expectedRecipientId = isDoctorIntent
    ? expected.intent.doctorUserId
    : expected.intent.organizationId;
  const expectedScanIds =
    expected.intent.scope === "selected_scans"
      ? [...(expected.intent.scanIds || [])].sort()
      : [];
  if (
    share.recipient.type !== (isDoctorIntent ? "doctor" : "workspace") ||
    share.recipient.id !== expectedRecipientId ||
    share.scope !== expected.intent.scope ||
    JSON.stringify([...share.scanIds].sort()) !==
      JSON.stringify(expectedScanIds) ||
    (share.expiresAt || "") !== (expected.intent.expiresAt || "")
  ) {
    throw new Error(
      "Biên nhận cấp quyền không khớp người nhận, phạm vi hoặc thời hạn đã chọn.",
    );
  }

  return {
    generatedAt: requiredTimestamp(
      root.generatedAt,
      "Thời điểm tạo biên nhận cấp quyền",
    ),
    ...boundary,
    share,
    replayed: parseReplayed(root.replayed),
  };
}

export function parsePatientShareRevokeResponse(
  response: unknown,
  expected: PatientShareRevokeExpectation,
): PatientShareRevokeResponse {
  const root = recordOf(response, "Biên nhận thu hồi quyền truy cập");
  const boundary = requireBoundary(root, expected);
  if (root.revoked !== true) {
    throw new Error("Backend chưa xác nhận quyền truy cập đã được thu hồi.");
  }
  const share = parsePatientShare(root.share, boundary.patientId);
  if (
    share.id !== expected.shareId ||
    share.status !== "revoked" ||
    share.active !== false ||
    !share.audit.revokedAt
  ) {
    throw new Error(
      "Biên nhận thu hồi không khớp quyền truy cập đang thao tác.",
    );
  }
  return {
    generatedAt: requiredTimestamp(
      root.generatedAt,
      "Thời điểm tạo biên nhận thu hồi",
    ),
    ...boundary,
    revoked: true,
    share,
    replayed: parseReplayed(root.replayed),
  };
}

function parseTarget(value: unknown, label: string): ShareTarget {
  const target = recordOf(value, label);
  return {
    ...(target as unknown as ShareTarget),
    id: requiredText(target.id, `${label} ID`),
    name: requiredText(target.name, `${label} tên`),
  };
}

function parseUniqueTargets(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} phải là danh sách.`);
  }
  const ids = new Set<string>();
  return value.map((item) => {
    const target = parseTarget(item, label);
    if (ids.has(target.id)) {
      throw new Error(`${label} bị trùng ID ${target.id}.`);
    }
    ids.add(target.id);
    return target;
  });
}

export function parseShareTargetsResponse(
  response: unknown,
  expectedWorkspaceId: string,
): ShareTargetsResponse {
  const root = recordOf(response, "Danh sách người nhận quyền");
  const expected = requiredText(
    expectedWorkspaceId,
    "Workspace nguồn chia sẻ dự kiến",
  );
  const workspaceId = requiredText(
    root.workspaceId,
    "Workspace nguồn chia sẻ",
  );
  if (workspaceId !== expected) {
    throw new Error(
      "Danh sách người nhận quyền không thuộc workspace hiện tại.",
    );
  }
  return {
    generatedAt: requiredTimestamp(
      root.generatedAt,
      "Thời điểm tạo danh sách người nhận",
    ),
    workspaceId,
    doctors: parseUniqueTargets(root.doctors, "Danh sách bác sĩ"),
    workspaces: parseUniqueTargets(root.workspaces, "Danh sách workspace"),
  };
}
