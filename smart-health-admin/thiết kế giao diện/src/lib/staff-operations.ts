import type {
  SmartHealthFirebaseReconciliation,
  SmartHealthStaffInvitation,
  SmartHealthStaffInvitationDelivery,
} from "./smart-health-api";

export type StaffOperation =
  | "invite-create"
  | "invite-resend"
  | "invite-revoke"
  | "doctor-lock"
  | "doctor-unlock"
  | "doctor-delete";

type ExpectedInvitation = {
  organizationId: string;
  email: string;
  role: SmartHealthStaffInvitation["role"];
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi nhân sự thiếu ${label}.`);
  }
  return value.trim();
}

function nonNegativeInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`Phản hồi đối soát có ${label} không hợp lệ.`);
  }
  return number;
}

export function createStaffOperationIdempotencyKey(operation: StaffOperation, target = "new") {
  const safeTarget = target.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-") || "new";
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `admin-staff-${operation}-${safeTarget}-${nonce}`;
}

const INVITATION_STATUSES = new Set(["pending", "accepted", "revoked", "expired"]);
const STAFF_ROLES = new Set([
  "workspace_admin",
  "doctor",
  "nurse",
  "technician",
  "billing",
  "viewer",
]);
const EMAIL_DELIVERY_STATES = new Set(["ready", "unavailable", "sent", "failed"]);

function parseInvitation(value: unknown): SmartHealthStaffInvitation {
  const invitation = recordOf(value);
  const role = requiredString(invitation.role, "vai trò canonical");
  const status = requiredString(invitation.status, "trạng thái canonical");
  if (!STAFF_ROLES.has(role)) {
    throw new Error("Phản hồi nhân sự có vai trò không hợp lệ.");
  }
  if (!INVITATION_STATUSES.has(status)) {
    throw new Error("Phản hồi nhân sự có trạng thái lời mời không hợp lệ.");
  }

  const deliveryRecord = recordOf(invitation.delivery);
  const delivery = Object.keys(deliveryRecord).length ? parseDelivery(deliveryRecord) : undefined;
  return {
    id: requiredString(invitation.id, "ID lời mời canonical"),
    organizationId: requiredString(invitation.organizationId, "workspace canonical"),
    email: requiredString(invitation.email, "email canonical").toLowerCase(),
    role: role as SmartHealthStaffInvitation["role"],
    status: status as SmartHealthStaffInvitation["status"],
    name: typeof invitation.name === "string" ? invitation.name : "",
    phone: typeof invitation.phone === "string" ? invitation.phone : "",
    specialty: typeof invitation.specialty === "string" ? invitation.specialty : "",
    license: typeof invitation.license === "string" ? invitation.license : "",
    expiresAt: typeof invitation.expiresAt === "string" ? invitation.expiresAt : "",
    acceptedAt: typeof invitation.acceptedAt === "string" ? invitation.acceptedAt : "",
    acceptedByUserId:
      typeof invitation.acceptedByUserId === "string" ? invitation.acceptedByUserId : "",
    revokedAt: typeof invitation.revokedAt === "string" ? invitation.revokedAt : "",
    revokedByUserId:
      typeof invitation.revokedByUserId === "string" ? invitation.revokedByUserId : "",
    revokeReason: typeof invitation.revokeReason === "string" ? invitation.revokeReason : "",
    createdByUserId:
      typeof invitation.createdByUserId === "string" ? invitation.createdByUserId : "",
    lastSentAt: typeof invitation.lastSentAt === "string" ? invitation.lastSentAt : "",
    sendCount: Number.isInteger(Number(invitation.sendCount)) ? Number(invitation.sendCount) : 0,
    delivery,
    createdAt: typeof invitation.createdAt === "string" ? invitation.createdAt : "",
    updatedAt: typeof invitation.updatedAt === "string" ? invitation.updatedAt : "",
  };
}

function parseDelivery(value: unknown): SmartHealthStaffInvitationDelivery {
  const delivery = recordOf(value);
  const email = requiredString(delivery.email, "trạng thái gửi email");
  if (!EMAIL_DELIVERY_STATES.has(email)) {
    throw new Error("Phản hồi nhân sự có trạng thái gửi email không hợp lệ.");
  }
  return {
    email: email as SmartHealthStaffInvitationDelivery["email"],
    provider: typeof delivery.provider === "string" ? delivery.provider : "",
    messageId: typeof delivery.messageId === "string" ? delivery.messageId : "",
    lastAttemptAt: typeof delivery.lastAttemptAt === "string" ? delivery.lastAttemptAt : "",
    errorCode: typeof delivery.errorCode === "string" ? delivery.errorCode : "",
  };
}

export function parseStaffInvitationOutcome(response: unknown, expected: ExpectedInvitation) {
  const responseRecord = recordOf(response);
  const invitation = parseInvitation(responseRecord.invitation);
  const delivery = parseDelivery(responseRecord.delivery || invitation.delivery);

  if (invitation.organizationId !== expected.organizationId.trim()) {
    throw new Error("Workspace của lời mời không khớp với thao tác vừa gửi.");
  }
  if (invitation.email !== expected.email.trim().toLowerCase()) {
    throw new Error("Email của lời mời không khớp với thao tác vừa gửi.");
  }
  if (invitation.role !== expected.role) {
    throw new Error("Vai trò của lời mời không khớp với thao tác vừa gửi.");
  }

  let oneTimeAcceptanceUrl: string | undefined;
  if (typeof responseRecord.oneTimeAcceptanceUrl === "string") {
    let parsed: URL;
    try {
      parsed = new URL(responseRecord.oneTimeAcceptanceUrl);
    } catch {
      throw new Error("Backend trả về liên kết chấp nhận lời mời không hợp lệ.");
    }
    const loopbackHttp =
      parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !loopbackHttp) {
      throw new Error("Liên kết chấp nhận lời mời phải dùng HTTPS ngoài môi trường loopback.");
    }
    if (parsed.pathname !== "/staff-invitations/accept" || !parsed.searchParams.get("token")) {
      throw new Error("Backend trả về sai route chấp nhận lời mời canonical.");
    }
    oneTimeAcceptanceUrl = parsed.toString();
  }

  return {
    invitation: { ...invitation, delivery },
    delivery,
    acceptanceUrl: oneTimeAcceptanceUrl,
    idempotent: responseRecord.idempotent === true,
  };
}

export function parseStaffInvitationList(response: unknown) {
  const invitations = recordOf(response).invitations;
  if (!Array.isArray(invitations)) {
    throw new Error("Phản hồi nhân sự thiếu danh sách lời mời canonical.");
  }
  return invitations.map(parseInvitation);
}

export function assertStaffInvitationStatusOutcome(
  response: unknown,
  expectedId: string,
  expectedStatus: SmartHealthStaffInvitation["status"],
) {
  const invitation = parseInvitation(recordOf(response).invitation);
  if (invitation.id !== expectedId || invitation.status !== expectedStatus) {
    throw new Error("Backend chưa xác nhận đúng lời mời và trạng thái vừa thao tác.");
  }
  return invitation;
}

export function assertDoctorAccountStateOutcome(
  response: unknown,
  expectedDoctorId: string,
  expectedStatus: "locked" | "active",
) {
  const request = recordOf(recordOf(response).request);
  if (request.id !== expectedDoctorId) {
    throw new Error("ID bác sĩ trong phản hồi không khớp với thao tác vừa gửi.");
  }
  if (request.accountStatus !== expectedStatus) {
    throw new Error("Backend chưa xác nhận đúng trạng thái tài khoản bác sĩ.");
  }
}

export function assertDoctorDeleteOutcome(response: unknown, expectedDoctorId: string) {
  const record = recordOf(response);
  if (record.deleted !== true) {
    throw new Error("Backend chưa xác nhận dữ liệu bác sĩ đã được xóa.");
  }
  if (record.userId !== expectedDoctorId) {
    throw new Error("ID bác sĩ đã xóa trong phản hồi không khớp với thao tác vừa gửi.");
  }
}

export function parseFirebaseReconciliationOutcome(
  response: unknown,
): SmartHealthFirebaseReconciliation {
  const record = recordOf(response);
  if (record.mode !== "report_only" || record.destructiveAction !== false) {
    throw new Error("Màn hình này chỉ hỗ trợ đối soát Firebase không phá hủy dữ liệu.");
  }
  if (Number(record.deletedCount) !== 0) {
    throw new Error("Phản hồi đối soát không được tuyên bố đã xóa tài khoản.");
  }

  return {
    mode: "report_only",
    destructiveAction: false,
    deletedCount: 0,
    providerAccountCount: nonNegativeInteger(record.providerAccountCount, "số tài khoản provider"),
    backendLinkedAccountCount: nonNegativeInteger(
      record.backendLinkedAccountCount,
      "số tài khoản backend liên kết",
    ),
    missingProviderAccountCount: nonNegativeInteger(
      record.missingProviderAccountCount,
      "số tài khoản thiếu trên provider",
    ),
    missingBackendAccountCount: nonNegativeInteger(
      record.missingBackendAccountCount,
      "số tài khoản thiếu trên backend",
    ),
    missingProviderAccounts: Array.isArray(record.missingProviderAccounts)
      ? record.missingProviderAccounts.filter((item): item is string => typeof item === "string")
      : [],
    missingBackendAccounts: Array.isArray(record.missingBackendAccounts)
      ? record.missingBackendAccounts.filter((item): item is string => typeof item === "string")
      : [],
    resultsTruncated: record.resultsTruncated === true,
  };
}
