export type WorkspaceStatus = "pending" | "active" | "needs_info" | "rejected" | "inactive";

export type WorkspaceOperation = "create" | "update" | "transition" | "owner_approval" | "archive";
export type WorkspaceMutationAction = Exclude<WorkspaceOperation, "archive" | "owner_approval">;
export type WorkspaceType = "hospital" | "clinic" | "solo_practice" | "personal";

export type CanonicalWorkspace = {
  id: string;
  name: string;
  type: string;
  workspaceType: WorkspaceType;
  status: WorkspaceStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  legalName?: string;
  representative?: string;
  ownerUserId?: string;
  packageId?: string;
  subscriptionStatus?: string;
  billingCycle?: string;
};

export type CanonicalWorkspaceTransition = {
  from: WorkspaceStatus;
  to: WorkspaceStatus;
};

export type WorkspaceMutationOutcome = {
  workspace: CanonicalWorkspace;
  transition?: CanonicalWorkspaceTransition;
  operationId: string;
  idempotent: boolean;
};

export type WorkspaceArchiveIntent = {
  workspaceId: string;
  expectedVersion: number;
};

export type WorkspaceArchiveOutcome = {
  deleted: true;
  workspaceId: string;
  operationId: string;
  idempotent: boolean;
};

export type WorkspaceOwnerApprovalOutcome = {
  workspace: CanonicalWorkspace;
  ownerApproval: {
    userId: string;
    role: "workspace_owner";
    requestedRole: "workspace_owner";
    roleRequestStatus: "approved";
    identityOperationId: string;
  };
  operationId: string;
  idempotent: boolean;
};

export type WorkspaceOperationIntent = {
  workspaceId?: string;
  expectedVersion?: number;
  name?: string;
  type?: string;
  workspaceType?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  legalName?: string;
  representative?: string;
  ownerUserId?: string;
  packageId?: string;
  subscriptionStatus?: string;
  billingCycle?: string;
  fromStatus?: WorkspaceStatus;
  toStatus?: WorkspaceStatus;
  reason?: string;
  message?: string;
  requiredFields?: string[];
};

export type WorkspaceOperationAttempt = {
  fingerprint: string;
  idempotencyKey: string;
};

const INTENT_STRING_FIELDS = [
  "workspaceId",
  "name",
  "type",
  "workspaceType",
  "address",
  "phone",
  "email",
  "website",
  "legalName",
  "representative",
  "ownerUserId",
  "packageId",
  "subscriptionStatus",
  "billingCycle",
  "fromStatus",
  "toStatus",
  "reason",
  "message",
] as const satisfies ReadonlyArray<keyof WorkspaceOperationIntent>;

const WORKSPACE_STATUS_TRANSITIONS: Readonly<
  Record<WorkspaceStatus, ReadonlySet<WorkspaceStatus>>
> = {
  pending: new Set(["active", "needs_info", "rejected"]),
  needs_info: new Set(["pending"]),
  rejected: new Set(["pending"]),
  active: new Set(["inactive"]),
  inactive: new Set(["active"]),
};
const WORKSPACE_STATUSES = new Set<WorkspaceStatus>([
  "pending",
  "active",
  "needs_info",
  "rejected",
  "inactive",
]);
const WORKSPACE_TYPES = new Set<WorkspaceType>(["hospital", "clinic", "solo_practice", "personal"]);
const CANONICAL_OPTIONAL_STRING_FIELDS = [
  "address",
  "phone",
  "email",
  "website",
  "legalName",
  "representative",
  "ownerUserId",
  "packageId",
  "subscriptionStatus",
  "billingCycle",
] as const satisfies ReadonlyArray<keyof CanonicalWorkspace>;
const CONFIRMED_INTENT_FIELDS = [
  "name",
  "type",
  "workspaceType",
  "address",
  "phone",
  "email",
  "website",
  "legalName",
  "representative",
  "ownerUserId",
  "packageId",
  "subscriptionStatus",
  "billingCycle",
] as const satisfies ReadonlyArray<keyof WorkspaceOperationIntent>;

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi workspace thiếu ${label}.`);
  }
  return value.trim();
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new Error(`Phản hồi workspace thiếu ${label} canonical.`);
  }
  return value;
}

function canonicalString(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new Error(`Phản hồi workspace thiếu ${label} canonical.`);
  }
  return value.trim();
}

function requiredPositiveVersion(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Phản hồi workspace có ${label} không hợp lệ.`);
  }
  return value;
}

function requiredIsoDate(value: unknown, label: string) {
  const dateValue = requiredString(value, label);
  if (Number.isNaN(Date.parse(dateValue))) {
    throw new Error(`Phản hồi workspace có ${label} không hợp lệ.`);
  }
  return dateValue;
}

function requiredWorkspaceStatus(value: unknown, label = "trạng thái") {
  const status = requiredString(value, label) as WorkspaceStatus;
  if (!WORKSPACE_STATUSES.has(status)) {
    throw new Error(`Phản hồi workspace có ${label} không hợp lệ.`);
  }
  return status;
}

function requiredWorkspaceType(value: unknown) {
  const workspaceType = requiredString(value, "loại workspace") as WorkspaceType;
  if (!WORKSPACE_TYPES.has(workspaceType)) {
    throw new Error("Phản hồi workspace có loại workspace không hợp lệ.");
  }
  return workspaceType;
}

function parseCanonicalWorkspace(value: unknown): CanonicalWorkspace {
  const record = recordOf(value);
  const workspace: CanonicalWorkspace = {
    id: requiredString(record.id, "ID canonical"),
    name: requiredString(record.name, "tên canonical"),
    type: requiredString(record.type, "loại cơ sở canonical"),
    workspaceType: requiredWorkspaceType(record.workspaceType),
    status: requiredWorkspaceStatus(record.status),
    version: requiredPositiveVersion(record.version, "version"),
    createdAt: requiredIsoDate(record.createdAt, "thời điểm tạo"),
    updatedAt: requiredIsoDate(record.updatedAt, "thời điểm cập nhật"),
  };

  for (const field of CANONICAL_OPTIONAL_STRING_FIELDS) {
    const valueAtField = record[field];
    if (valueAtField === undefined) continue;
    if (typeof valueAtField !== "string") {
      throw new Error(`Phản hồi workspace có trường ${field} không hợp lệ.`);
    }
    workspace[field] = field === "email" ? valueAtField.trim().toLowerCase() : valueAtField.trim();
  }

  if (
    workspace.status === "active" &&
    workspace.workspaceType !== "personal" &&
    !workspace.ownerUserId
  ) {
    throw new Error("Workspace dùng chung đang hoạt động nhưng thiếu chủ sở hữu canonical.");
  }

  return workspace;
}

function assertIntentMatchesWorkspace(
  workspace: CanonicalWorkspace,
  intent: WorkspaceOperationIntent,
) {
  if (intent.workspaceId?.trim() && workspace.id !== intent.workspaceId.trim()) {
    throw new Error("Backend trả về workspace khác thao tác đang thực hiện.");
  }

  for (const field of CONFIRMED_INTENT_FIELDS) {
    const rawExpected = intent[field];
    if (typeof rawExpected !== "string") continue;
    const expected = field === "email" ? rawExpected.trim().toLowerCase() : rawExpected.trim();
    if (workspace[field] !== expected) {
      throw new Error(`Backend chưa xác nhận đúng trường ${field} của workspace.`);
    }
  }
}

function normalizedWorkspaceIntent(intent: WorkspaceOperationIntent) {
  const normalized: Record<string, unknown> = {};
  for (const field of INTENT_STRING_FIELDS) {
    const value = intent[field];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized[field] = field === "email" ? trimmed.toLowerCase() : trimmed;
  }

  if (intent.expectedVersion !== undefined) {
    if (!Number.isInteger(intent.expectedVersion) || intent.expectedVersion < 1) {
      throw new Error("Phiên bản workspace dự kiến phải là số nguyên dương.");
    }
    normalized.expectedVersion = intent.expectedVersion;
  }

  if (intent.requiredFields !== undefined) {
    normalized.requiredFields = Array.from(
      new Set(intent.requiredFields.map((field) => field.trim()).filter(Boolean)),
    ).sort();
  }

  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function workspaceIntentFingerprint(intent: WorkspaceOperationIntent) {
  return JSON.stringify(normalizedWorkspaceIntent(intent));
}

export function createWorkspaceOperationIdempotencyKey(
  operation: WorkspaceOperation,
  target = "new",
) {
  const safeTarget = target.trim().replace(/[^a-zA-Z0-9_.-]+/g, "-") || "new";
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `admin-workspace-${operation}-${safeTarget}-${nonce}`;
}

export function resolveWorkspaceOperationAttempt(
  previous: WorkspaceOperationAttempt | null | undefined,
  operation: WorkspaceOperation,
  intent: WorkspaceOperationIntent,
): WorkspaceOperationAttempt {
  const fingerprint = `${operation}:${workspaceIntentFingerprint(intent)}`;
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    idempotencyKey: createWorkspaceOperationIdempotencyKey(
      operation,
      intent.workspaceId?.trim() || "new",
    ),
  };
}

export function assertWorkspaceStatusTransition(
  fromStatus: WorkspaceStatus,
  toStatus: WorkspaceStatus,
) {
  if (!WORKSPACE_STATUS_TRANSITIONS[fromStatus]?.has(toStatus)) {
    throw new Error(`Chuyển trạng thái workspace không hợp lệ: ${fromStatus} → ${toStatus}.`);
  }
}

export function parseWorkspaceArchiveOutcome(
  response: unknown,
  intent: WorkspaceArchiveIntent,
): WorkspaceArchiveOutcome {
  const workspaceId = requiredString(intent.workspaceId, "workspaceId trong intent archive");
  requiredPositiveVersion(intent.expectedVersion, "expectedVersion trong intent archive");

  const responseRecord = recordOf(response);
  if (responseRecord.deleted !== true) {
    throw new Error("Backend chưa xác nhận archive workspace.");
  }

  const confirmedWorkspaceId = requiredString(responseRecord.workspaceId, "workspaceId canonical");
  if (confirmedWorkspaceId !== workspaceId) {
    throw new Error("Backend xác nhận archive cho workspace khác intent.");
  }

  return {
    deleted: true,
    workspaceId: confirmedWorkspaceId,
    operationId: requiredString(responseRecord.operationId, "operationId canonical"),
    idempotent: requiredBoolean(responseRecord.idempotent, "idempotent"),
  };
}

export function parseWorkspaceOwnerApprovalOutcome(
  response: unknown,
  intent: WorkspaceOperationIntent,
): WorkspaceOwnerApprovalOutcome {
  const workspaceId = requiredString(intent.workspaceId, "workspaceId trong intent duyệt owner");
  const expectedVersion = requiredPositiveVersion(
    intent.expectedVersion,
    "expectedVersion trong intent duyệt owner",
  );
  const responseRecord = recordOf(response);
  const workspace = parseCanonicalWorkspace(responseRecord.workspace);
  if (workspace.id !== workspaceId || workspace.version !== expectedVersion) {
    throw new Error("Backend chưa xác nhận đúng workspace/version khi duyệt owner.");
  }
  if (workspace.status !== "pending") {
    throw new Error("Workspace phải còn ở trạng thái chờ duyệt sau bước xác nhận owner.");
  }

  const ownerRecord = recordOf(responseRecord.ownerApproval);
  const userId = requiredString(ownerRecord.userId, "ownerApproval.userId");
  if (workspace.ownerUserId !== userId || (intent.ownerUserId && intent.ownerUserId !== userId)) {
    throw new Error("Backend xác nhận owner khác với workspace đang duyệt.");
  }
  if (
    ownerRecord.role !== "workspace_owner" ||
    ownerRecord.requestedRole !== "workspace_owner" ||
    ownerRecord.roleRequestStatus !== "approved"
  ) {
    throw new Error("Backend chưa xác nhận đầy đủ danh tính workspace owner.");
  }

  return {
    workspace,
    ownerApproval: {
      userId,
      role: "workspace_owner",
      requestedRole: "workspace_owner",
      roleRequestStatus: "approved",
      identityOperationId: canonicalString(
        ownerRecord.identityOperationId,
        "ownerApproval.identityOperationId",
      ),
    },
    operationId: requiredString(responseRecord.operationId, "operationId canonical"),
    idempotent: requiredBoolean(responseRecord.idempotent, "idempotent"),
  };
}

export function parseWorkspaceMutationOutcome(
  response: unknown,
  action: WorkspaceMutationAction,
  intent: WorkspaceOperationIntent,
): WorkspaceMutationOutcome {
  const responseRecord = recordOf(response);
  const workspace = parseCanonicalWorkspace(responseRecord.workspace);
  const operationId = requiredString(responseRecord.operationId, "operationId canonical");
  const idempotent = requiredBoolean(responseRecord.idempotent, "idempotent");

  assertIntentMatchesWorkspace(workspace, intent);

  if (action === "create") {
    if (intent.expectedVersion !== undefined) {
      throw new Error("Thao tác tạo workspace không được gửi expectedVersion.");
    }
    if (workspace.status !== "pending") {
      throw new Error("Workspace mới phải bắt đầu ở trạng thái pending.");
    }
    if (workspace.version !== 1) {
      throw new Error("Backend chưa xác nhận workspace mới ở version 1.");
    }
    if (responseRecord.transition !== undefined) {
      throw new Error("Phản hồi tạo workspace không được chứa transition.");
    }
    return { workspace, operationId, idempotent };
  }

  const workspaceId = requiredString(intent.workspaceId, "workspaceId trong intent");
  const expectedVersion = requiredPositiveVersion(
    intent.expectedVersion,
    "expectedVersion trong intent",
  );
  const nextVersion = expectedVersion + 1;

  if (workspace.id !== workspaceId) {
    throw new Error("Backend trả về workspace khác thao tác đang thực hiện.");
  }
  if (workspace.version !== nextVersion) {
    throw new Error("Backend chưa xác nhận đúng version mới của workspace.");
  }

  if (action === "update") {
    if (intent.toStatus !== undefined) {
      throw new Error("Thao tác update không được tự xác nhận chuyển trạng thái.");
    }
    if (intent.fromStatus !== undefined) {
      const expectedStatus = requiredWorkspaceStatus(
        intent.fromStatus,
        "trạng thái hiện tại trong intent",
      );
      if (workspace.status !== expectedStatus) {
        throw new Error("Backend đã thay đổi trạng thái ngoài intent update.");
      }
    }
    if (responseRecord.transition !== undefined) {
      throw new Error("Phản hồi update workspace không được chứa transition.");
    }
    return { workspace, operationId, idempotent };
  }

  const fromStatus = requiredWorkspaceStatus(intent.fromStatus, "fromStatus trong intent");
  const toStatus = requiredWorkspaceStatus(intent.toStatus, "toStatus trong intent");
  assertWorkspaceStatusTransition(fromStatus, toStatus);

  const transitionRecord = recordOf(responseRecord.transition);
  const transition: CanonicalWorkspaceTransition = {
    from: requiredWorkspaceStatus(transitionRecord.from, "transition.from"),
    to: requiredWorkspaceStatus(transitionRecord.to, "transition.to"),
  };

  if (
    transition.from !== fromStatus ||
    transition.to !== toStatus ||
    workspace.status !== toStatus
  ) {
    throw new Error("Backend chưa xác nhận đúng transition workspace đã yêu cầu.");
  }

  return { workspace, transition, operationId, idempotent };
}
