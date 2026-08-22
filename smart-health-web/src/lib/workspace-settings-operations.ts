export type WorkspaceSettingsPayload = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
};

export type WorkspaceSettingsUpdateIntent = {
  userId: string;
  workspaceId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: WorkspaceSettingsPayload;
};

export type WorkspaceSettingsReceipt = {
  ownership: {
    userId: string;
    workspaceId: string;
  };
  workspace: WorkspaceSettingsPayload & {
    id: string;
    version: number;
    updatedAt: string;
  };
  operationId: string;
  replayed: boolean;
};

export class WorkspaceSettingsContractError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkspaceSettingsContractError";
    this.code = code;
    this.status = 502;
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasExactKeys(
  value: Record<string, unknown> | null,
  keys: readonly string[],
) {
  return Boolean(
    value &&
      keys.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every((key) => keys.includes(key)),
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validTimestamp(value: unknown) {
  const candidate = text(value);
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      candidate,
    ) && Number.isFinite(Date.parse(candidate))
  );
}

function contractError(code: string, message: string) {
  return new WorkspaceSettingsContractError(code, message);
}

export function createWorkspaceSettingsIdempotencyKey() {
  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `workspace-settings-${randomId}`.slice(0, 160);
}

export function workspaceSettingsIntentFingerprint(
  intent: Omit<WorkspaceSettingsUpdateIntent, "idempotencyKey">,
) {
  return JSON.stringify([
    intent.userId,
    intent.workspaceId,
    intent.expectedVersion,
    intent.payload.name,
    intent.payload.address,
    intent.payload.phone,
    intent.payload.email,
    intent.payload.website,
  ]);
}

export function assertWorkspaceSettingsIntent(
  intent: WorkspaceSettingsUpdateIntent,
) {
  if (
    !intent.userId.trim() ||
    !intent.workspaceId.trim() ||
    !Number.isInteger(intent.expectedVersion) ||
    intent.expectedVersion < 1
  ) {
    throw contractError(
      "WORKSPACE_SETTINGS_INTENT_INVALID",
      "Không thể xác định tài khoản, workspace hoặc phiên bản đang sở hữu thao tác.",
    );
  }
  const key = intent.idempotencyKey.trim();
  if (!key || key.length > 160) {
    throw contractError(
      "WORKSPACE_SETTINGS_IDEMPOTENCY_KEY_INVALID",
      "Mã thao tác cập nhật workspace không hợp lệ.",
    );
  }
  const payload = intent.payload;
  if (
    !payload ||
    [payload.name, payload.address, payload.phone, payload.email, payload.website].some(
      (value) => typeof value !== "string",
    ) ||
    !payload.name.trim()
  ) {
    throw contractError(
      "WORKSPACE_SETTINGS_PAYLOAD_INVALID",
      "Thông tin workspace cần cập nhật không hợp lệ.",
    );
  }
  return intent;
}

export function isWorkspaceSettingsIdempotencyCollision(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "IDEMPOTENCY_KEY_REUSED",
  );
}

export function parseWorkspaceSettingsReceipt(
  payload: unknown,
  intent: WorkspaceSettingsUpdateIntent,
  currentUserId: string,
  currentWorkspaceId: string,
): WorkspaceSettingsReceipt {
  assertWorkspaceSettingsIntent(intent);
  const root = recordOf(payload);
  const ownership = recordOf(root?.ownership);
  const workspace = recordOf(root?.workspace);
  const expectedUserId = intent.userId.trim();
  const expectedWorkspaceId = intent.workspaceId.trim();
  if (
    !currentUserId.trim() ||
    !currentWorkspaceId.trim() ||
    currentUserId.trim() !== expectedUserId ||
    currentWorkspaceId.trim() !== expectedWorkspaceId ||
    text(ownership?.userId) !== expectedUserId ||
    text(ownership?.workspaceId) !== expectedWorkspaceId ||
    text(workspace?.id) !== expectedWorkspaceId
  ) {
    throw contractError(
      "WORKSPACE_SETTINGS_RECEIPT_OWNER_MISMATCH",
      "Biên nhận cập nhật workspace không thuộc tài khoản hoặc workspace hiện tại.",
    );
  }

  const rootKeys = ["ownership", "workspace", "operationId", "replayed"];
  const ownershipKeys = ["userId", "workspaceId"];
  const workspaceKeys = [
    "id",
    "name",
    "address",
    "phone",
    "email",
    "website",
    "version",
    "updatedAt",
  ];
  const exactPayload =
    hasExactKeys(root, rootKeys) &&
    hasExactKeys(ownership, ownershipKeys) &&
    hasExactKeys(workspace, workspaceKeys);
  const confirmedFields = (
    ["name", "address", "phone", "email", "website"] as const
  ).every((field) => workspace?.[field] === intent.payload[field]);
  const valid =
    exactPayload &&
    confirmedFields &&
    workspace?.version === intent.expectedVersion + 1 &&
    validTimestamp(workspace?.updatedAt) &&
    text(root?.operationId).length > 0 &&
    text(root?.operationId).length <= 160 &&
    typeof root?.replayed === "boolean";
  if (!valid) {
    throw contractError(
      "WORKSPACE_SETTINGS_RECEIPT_INVALID",
      "Backend chưa xác nhận biên nhận cập nhật workspace hiện tại đầy đủ. Thao tác chưa được báo thành công.",
    );
  }
  return payload as WorkspaceSettingsReceipt;
}
