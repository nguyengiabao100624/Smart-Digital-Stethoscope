import type {
  ApiUser,
  StaffInvitation,
  StaffInvitationDelivery,
  StaffInvitationRole,
  WorkspaceMembership,
  WorkspaceMembershipAction,
} from "./smart-health-api";

type StaffOperation =
  | "invite-create"
  | "invite-resend"
  | "invite-revoke"
  | "member-suspend"
  | "member-reactivate"
  | "member-revoke"
  | "member-role"
  | "invite-accept";

type ExpectedInvitation = {
  organizationId: string;
  email: string;
  role: StaffInvitationRole;
};

type SessionStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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

const ROLES = new Set([
  "workspace_admin",
  "doctor",
  "nurse",
  "technician",
  "billing",
  "viewer",
]);
const STATUSES = new Set(["pending", "accepted", "revoked", "expired"]);
const DELIVERY_STATES = new Set(["ready", "unavailable", "sent", "failed"]);

function parseDelivery(value: unknown): StaffInvitationDelivery {
  const record = recordOf(value);
  const email = requiredString(record.email, "trạng thái gửi email");
  if (!DELIVERY_STATES.has(email)) {
    throw new Error("Phản hồi nhân sự có trạng thái gửi email không hợp lệ.");
  }
  return {
    email: email as StaffInvitationDelivery["email"],
    provider: typeof record.provider === "string" ? record.provider : "",
    messageId: typeof record.messageId === "string" ? record.messageId : "",
    lastAttemptAt:
      typeof record.lastAttemptAt === "string" ? record.lastAttemptAt : "",
    errorCode: typeof record.errorCode === "string" ? record.errorCode : "",
  };
}

function parseInvitation(value: unknown): StaffInvitation {
  const record = recordOf(value);
  const role = requiredString(record.role, "vai trò canonical");
  const status = requiredString(record.status, "trạng thái canonical");
  if (!ROLES.has(role))
    throw new Error("Phản hồi nhân sự có vai trò không hợp lệ.");
  if (!STATUSES.has(status))
    throw new Error("Phản hồi nhân sự có trạng thái không hợp lệ.");
  const deliveryRecord = recordOf(record.delivery);
  return {
    id: requiredString(record.id, "ID lời mời canonical"),
    organizationId: requiredString(
      record.organizationId,
      "workspace canonical",
    ),
    email: requiredString(record.email, "email canonical").toLowerCase(),
    role: role as StaffInvitationRole,
    status: status as StaffInvitation["status"],
    name: typeof record.name === "string" ? record.name : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    specialty: typeof record.specialty === "string" ? record.specialty : "",
    license: typeof record.license === "string" ? record.license : "",
    expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : "",
    acceptedAt: typeof record.acceptedAt === "string" ? record.acceptedAt : "",
    revokedAt: typeof record.revokedAt === "string" ? record.revokedAt : "",
    revokeReason:
      typeof record.revokeReason === "string" ? record.revokeReason : "",
    sendCount: Number.isInteger(Number(record.sendCount))
      ? Number(record.sendCount)
      : 0,
    delivery: Object.keys(deliveryRecord).length
      ? parseDelivery(deliveryRecord)
      : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

export function createPortalStaffIdempotencyKey(
  operation: StaffOperation,
  target = "new",
) {
  const safeTarget = target.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-") || "new";
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal-staff-${operation}-${safeTarget}-${nonce}`;
}

export function validateStaffInvitationToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  if (token.length < 32 || token.length > 512) {
    throw new Error("Liên kết mời nhân sự không hợp lệ hoặc đã bị cắt ngắn.");
  }
  return token;
}

async function staffInvitationTokenDigest(token: string) {
  const bytes = new TextEncoder().encode(token);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
  }
  return null;
}

function invitationAcceptanceStorage() {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

async function invitationAcceptanceStorageKey(token: string, userId: string) {
  const digest = await staffInvitationTokenDigest(
    validateStaffInvitationToken(token),
  );
  if (!digest) return null;
  const safeUserId =
    userId.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-") || "identity";
  return `shcare.staff-invitation.accept.v1.${digest}.${safeUserId}`;
}

export async function getStaffInvitationAcceptanceIdempotencyKey(
  token: string,
  userId: string,
  storage: SessionStorageLike | null = invitationAcceptanceStorage(),
) {
  const storageKey = await invitationAcceptanceStorageKey(token, userId);
  if (!storageKey) {
    return createPortalStaffIdempotencyKey("invite-accept", userId);
  }
  try {
    const existing = storage?.getItem(storageKey) || "";
    if (
      /^portal-staff-invite-accept-[a-zA-Z0-9_.-]+-[a-zA-Z0-9-]+$/.test(
        existing,
      )
    ) {
      return existing;
    }
  } catch {
    // Private browsing/storage policy must not block a safe in-memory retry.
  }
  const idempotencyKey = createPortalStaffIdempotencyKey(
    "invite-accept",
    userId,
  );
  try {
    storage?.setItem(storageKey, idempotencyKey);
  } catch {
    // The caller retains the generated key in memory for this mounted flow.
  }
  return idempotencyKey;
}

export async function clearStaffInvitationAcceptanceIdempotencyKey(
  token: string,
  userId: string,
  storage: SessionStorageLike | null = invitationAcceptanceStorage(),
) {
  const storageKey = await invitationAcceptanceStorageKey(token, userId);
  if (!storageKey) return;
  try {
    storage?.removeItem(storageKey);
  } catch {
    // A confirmed acceptance must still be allowed to continue to Portal.
  }
}

export function parseStaffInvitationAcceptanceOutcome(
  response: unknown,
  expectedIdentity: { userId: string; email: string },
) {
  const responseRecord = recordOf(response);
  const invitation = parseInvitation(responseRecord.invitation);
  const membershipRecord = recordOf(responseRecord.membership);
  const userRecord = recordOf(responseRecord.user);
  const expectedUserId = requiredString(
    expectedIdentity.userId,
    "ID tài khoản đang xác thực",
  );
  const expectedEmail = requiredString(
    expectedIdentity.email,
    "email tài khoản đang xác thực",
  ).toLowerCase();
  const userId = requiredString(userRecord.id, "ID tài khoản canonical");
  const userEmail = requiredString(
    userRecord.email,
    "email tài khoản canonical",
  ).toLowerCase();
  const membershipUserId = requiredString(
    membershipRecord.userId,
    "ID thành viên canonical",
  );
  const membershipWorkspaceId = requiredString(
    membershipRecord.organizationId || membershipRecord.workspaceId,
    "workspace thành viên canonical",
  );
  const membershipRole = requiredString(
    membershipRecord.role,
    "vai trò thành viên canonical",
  );
  const membershipStatus = requiredString(
    membershipRecord.status,
    "trạng thái thành viên canonical",
  );

  if (invitation.status !== "accepted") {
    throw new Error("Backend chưa xác nhận lời mời đã được chấp nhận.");
  }
  if (
    userId !== expectedUserId ||
    membershipUserId !== expectedUserId ||
    userEmail !== expectedEmail ||
    invitation.email !== expectedEmail
  ) {
    throw new Error(
      "Danh tính trong phản hồi không khớp tài khoản đang xác thực.",
    );
  }
  if (membershipWorkspaceId !== invitation.organizationId) {
    throw new Error("Workspace thành viên không khớp lời mời vừa chấp nhận.");
  }
  if (membershipRole !== invitation.role || membershipStatus !== "active") {
    throw new Error(
      "Backend chưa xác nhận đúng vai trò và trạng thái thành viên.",
    );
  }

  return {
    invitation,
    membership: membershipRecord as WorkspaceMembership,
    user: userRecord as unknown as ApiUser,
    idempotent: responseRecord.idempotent === true,
  };
}

export function parsePortalStaffInvitationOutcome(
  response: unknown,
  expected: ExpectedInvitation,
) {
  const responseRecord = recordOf(response);
  const invitation = parseInvitation(responseRecord.invitation);
  const delivery = parseDelivery(
    responseRecord.delivery || invitation.delivery,
  );
  if (invitation.organizationId !== expected.organizationId.trim()) {
    throw new Error("Workspace của lời mời không khớp với thao tác vừa gửi.");
  }
  if (invitation.email !== expected.email.trim().toLowerCase()) {
    throw new Error("Email của lời mời không khớp với thao tác vừa gửi.");
  }
  if (invitation.role !== expected.role) {
    throw new Error("Vai trò của lời mời không khớp với thao tác vừa gửi.");
  }
  const oneTimeAcceptanceUrl =
    typeof responseRecord.oneTimeAcceptanceUrl === "string" &&
    /^https:\/\//i.test(responseRecord.oneTimeAcceptanceUrl)
      ? responseRecord.oneTimeAcceptanceUrl
      : undefined;
  return {
    invitation: { ...invitation, delivery },
    delivery,
    acceptanceUrl: oneTimeAcceptanceUrl,
    idempotent: responseRecord.idempotent === true,
  };
}

export function parsePortalStaffInvitationList(
  response: unknown,
  expectedWorkspaceId: string,
) {
  const invitations = recordOf(response).invitations;
  if (!Array.isArray(invitations)) {
    throw new Error("Phản hồi nhân sự thiếu danh sách lời mời canonical.");
  }
  const workspaceId = requiredString(
    expectedWorkspaceId,
    "workspace kỳ vọng của lời mời",
  );
  const ids = new Set<string>();
  return invitations.map((value) => {
    const invitation = parseInvitation(value);
    if (invitation.organizationId !== workspaceId) {
      throw new Error(
        "Danh sách lời mời chứa dữ liệu ngoài workspace hiện tại.",
      );
    }
    if (ids.has(invitation.id)) {
      throw new Error(`Danh sách lời mời bị trùng ID ${invitation.id}.`);
    }
    ids.add(invitation.id);
    return invitation;
  });
}

export function assertPortalStaffInvitationStatus(
  response: unknown,
  expectedId: string,
  expectedStatus: StaffInvitation["status"],
  expectedWorkspaceId: string,
) {
  const invitation = parseInvitation(recordOf(response).invitation);
  if (
    invitation.id !== expectedId ||
    invitation.status !== expectedStatus ||
    invitation.organizationId !== expectedWorkspaceId
  ) {
    throw new Error(
      "Backend chưa xác nhận đúng lời mời và trạng thái vừa thao tác.",
    );
  }
  return invitation;
}

export function assertMembershipLifecycleOutcome(
  response: unknown,
  expectedUserId: string,
  expectedAction: WorkspaceMembershipAction,
  expectedWorkspaceId: string,
) {
  const responseRecord = recordOf(response);
  const membership = recordOf(responseRecord.membership);
  const user = recordOf(responseRecord.user);
  const expectedStatus =
    expectedAction === "suspend"
      ? "suspended"
      : expectedAction === "reactivate"
        ? "active"
        : "revoked";
  if (responseRecord.action !== expectedAction) {
    throw new Error("Thao tác membership trong phản hồi không khớp yêu cầu.");
  }
  if (membership.userId !== expectedUserId || user.id !== expectedUserId) {
    throw new Error("ID nhân sự trong phản hồi không khớp thao tác vừa gửi.");
  }
  const membershipWorkspaceId = requiredString(
    membership.workspaceId || membership.organizationId,
    "workspace membership canonical",
  );
  if (membershipWorkspaceId !== expectedWorkspaceId) {
    throw new Error(
      "Workspace membership trong phản hồi không khớp workspace đang thao tác.",
    );
  }
  if (membership.status !== expectedStatus) {
    throw new Error("Backend chưa xác nhận đúng trạng thái membership.");
  }
  if (expectedAction === "revoke" && responseRecord.revoked !== true) {
    throw new Error("Backend chưa xác nhận membership đã được thu hồi.");
  }
  return membership;
}
