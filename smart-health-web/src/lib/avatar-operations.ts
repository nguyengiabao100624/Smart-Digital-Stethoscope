export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarContentType = (typeof AVATAR_CONTENT_TYPES)[number];

export type AvatarMutationAuthority = {
  userId: string;
  workspaceId: string;
  authSessionId: string;
  authSessionEpoch: number;
  bearerToken: string;
};

export type AvatarUploadIntent = AvatarMutationAuthority & {
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  idempotencyKey: string;
};

export type AvatarDeleteIntent = AvatarMutationAuthority & {
  expectedAvatarFileId: string;
  idempotencyKey: string;
};

export type AvatarCleanupReceipt = {
  status: "not_required" | "pending" | "completed" | "dead_letter";
  previousFileId: string;
};

export type AvatarCleanupStatus = AvatarCleanupReceipt["status"];
export type AvatarCleanupAction =
  | "none"
  | "upload"
  | "delete"
  | "orphan_upload";

export type AvatarCleanupStatusResponse = {
  userId: string;
  workspaceId: string;
  status: AvatarCleanupStatus;
  operationId: string;
  action: AvatarCleanupAction;
  previousFileId: string;
  attempts: number;
  lastErrorCode: string;
  updatedAt: string;
  manualSupportRequired: boolean;
};

export type AvatarUploadReceipt = {
  avatar: {
    fileId: string;
    ownerUserId: string;
    name: string;
    contentType: AvatarContentType;
    byteSize: number;
    sha256: string;
    downloadUrl: string;
    uploadedAt: string;
  };
  cleanup: AvatarCleanupReceipt;
  operationId: string;
  replayed: boolean;
};

export type AvatarDeleteReceipt = {
  deleted: true;
  avatar: {
    fileId: string;
    ownerUserId: string;
    deletedAt: string;
  };
  cleanup: AvatarCleanupReceipt;
  operationId: string;
  replayed: boolean;
};

export class AvatarContractError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "AvatarContractError";
    this.code = code;
    this.status = status;
  }
}

function contractError(code: string, message: string, status = 502) {
  return new AvatarContractError(code, message, status);
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

function validIdempotencyKey(value: string) {
  const key = value.trim();
  return key.length > 0 && key.length <= 160;
}

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index + 1).toLowerCase();
}

function extensionMatches(name: string, contentType: string) {
  const extension = extensionOf(name);
  return (
    (contentType === "image/jpeg" && ["jpg", "jpeg"].includes(extension)) ||
    (contentType === "image/png" && extension === "png") ||
    (contentType === "image/webp" && extension === "webp")
  );
}

export function assertAvatarFile(file: File) {
  if (!file || !(file instanceof File)) {
    throw contractError(
      "AVATAR_FILE_REQUIRED",
      "Vui lòng chọn một tệp ảnh đại diện.",
      400,
    );
  }
  if (
    !AVATAR_CONTENT_TYPES.includes(file.type as AvatarContentType) ||
    !extensionMatches(file.name, file.type)
  ) {
    throw contractError(
      "AVATAR_CONTENT_TYPE_UNSUPPORTED",
      "Ảnh đại diện chỉ hỗ trợ JPEG, PNG hoặc WebP đúng định dạng.",
      415,
    );
  }
  if (file.size < 1) {
    throw contractError(
      "AVATAR_FILE_EMPTY",
      "Tệp ảnh đại diện đang rỗng.",
      400,
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw contractError(
      "AVATAR_FILE_TOO_LARGE",
      "Ảnh đại diện tối đa 2 MB.",
      413,
    );
  }
  return file;
}

function assertFileSignature(bytes: Uint8Array, contentType: string) {
  const matches =
    (contentType === "image/jpeg" &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (contentType === "image/png" &&
      bytes.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => bytes[index] === byte,
      )) ||
    (contentType === "image/webp" &&
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
  if (!matches) {
    throw contractError(
      "AVATAR_CONTENT_MISMATCH",
      "Nội dung tệp không khớp định dạng ảnh đã khai báo.",
      415,
    );
  }
}

export async function hashAvatarFile(file: File) {
  assertAvatarFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertFileSignature(bytes, file.type);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createAvatarIdempotencyKey(action: "upload" | "delete") {
  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `avatar-${action}-${randomId}`.slice(0, 160);
}

export function avatarUploadIntentFingerprint(
  intent: Omit<AvatarUploadIntent, "idempotencyKey">,
) {
  return JSON.stringify([
    intent.userId,
    intent.workspaceId,
    intent.authSessionId,
    intent.authSessionEpoch,
    intent.bearerToken,
    intent.fileName,
    intent.contentType,
    intent.byteSize,
    intent.sha256,
  ]);
}

export function avatarDeleteIntentFingerprint(
  intent: Omit<AvatarDeleteIntent, "idempotencyKey">,
) {
  return JSON.stringify([
    intent.userId,
    intent.workspaceId,
    intent.authSessionId,
    intent.authSessionEpoch,
    intent.bearerToken,
    intent.expectedAvatarFileId,
  ]);
}

export function isAvatarIdempotencyCollision(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "IDEMPOTENCY_KEY_REUSED",
  );
}

function assertIntentOwner(
  intentUserId: string,
  currentUserId: string,
  receiptOwnerUserId: unknown,
) {
  if (
    !intentUserId.trim() ||
    currentUserId.trim() !== intentUserId.trim() ||
    text(receiptOwnerUserId) !== intentUserId.trim()
  ) {
    throw contractError(
      "AVATAR_RECEIPT_OWNER_MISMATCH",
      "Biên nhận ảnh không thuộc tài khoản hiện tại.",
    );
  }
}

function validCleanup(value: Record<string, unknown> | null) {
  return Boolean(
    hasExactKeys(value, ["status", "previousFileId"]) &&
    ["not_required", "pending", "completed", "dead_letter"].includes(
      text(value?.status),
    ) &&
    typeof value?.previousFileId === "string",
  );
}

export function parseAvatarCleanupStatus(
  payload: unknown,
  currentUserId: string,
  currentWorkspaceId: string,
): AvatarCleanupStatusResponse {
  const root = recordOf(payload);
  const status = text(root?.status) as AvatarCleanupStatus;
  const operationId = text(root?.operationId);
  const action = text(root?.action) as AvatarCleanupAction;
  const previousFileId =
    typeof root?.previousFileId === "string" ? root.previousFileId : null;
  const attempts = root?.attempts;
  const lastErrorCode =
    typeof root?.lastErrorCode === "string" ? root.lastErrorCode : null;
  const updatedAt = typeof root?.updatedAt === "string" ? root.updatedAt : null;
  const unresolved = status === "pending" || status === "dead_letter";
  const valid =
    hasExactKeys(root, [
      "userId",
      "workspaceId",
      "status",
      "operationId",
      "action",
      "previousFileId",
      "attempts",
      "lastErrorCode",
      "updatedAt",
      "manualSupportRequired",
    ]) &&
    text(root?.userId) === currentUserId.trim() &&
    text(root?.workspaceId) === currentWorkspaceId.trim() &&
    currentWorkspaceId.trim().length > 0 &&
    ["not_required", "pending", "completed", "dead_letter"].includes(status) &&
    ["none", "upload", "delete", "orphan_upload"].includes(action) &&
    operationId.length <= 160 &&
    (!unresolved || (operationId.length > 0 && action !== "none")) &&
    previousFileId !== null &&
    previousFileId.length <= 160 &&
    Number.isInteger(attempts) &&
    Number(attempts) >= 0 &&
    Number(attempts) <= 50 &&
    lastErrorCode !== null &&
    lastErrorCode.length <= 120 &&
    (/^[A-Z0-9_]*$/.test(lastErrorCode) || lastErrorCode === "") &&
    updatedAt !== null &&
    (operationId ? validTimestamp(updatedAt) : updatedAt === "") &&
    root?.manualSupportRequired === (status === "dead_letter") &&
    (status !== "dead_letter" || lastErrorCode.length > 0);
  if (!valid) {
    throw contractError(
      "AVATAR_CLEANUP_STATUS_INVALID",
      "Backend trả về trạng thái dọn ảnh không thuộc tài khoản/workspace hiện tại hoặc chưa đủ bằng chứng.",
    );
  }
  return payload as AvatarCleanupStatusResponse;
}

export function parseAvatarUploadReceipt(
  payload: unknown,
  intent: AvatarUploadIntent,
  currentUserId: string,
): AvatarUploadReceipt {
  assertAvatarFile(
    new File([new Uint8Array(intent.byteSize)], intent.fileName, {
      type: intent.contentType,
    }),
  );
  if (
    !validIdempotencyKey(intent.idempotencyKey) ||
    !/^[a-f0-9]{64}$/.test(intent.sha256)
  ) {
    throw contractError(
      "AVATAR_UPLOAD_INTENT_INVALID",
      "Không thể xác định thao tác tải ảnh đại diện hiện tại.",
      400,
    );
  }
  const root = recordOf(payload);
  const avatar = recordOf(root?.avatar);
  const cleanup = recordOf(root?.cleanup);
  assertIntentOwner(intent.userId, currentUserId, avatar?.ownerUserId);
  const valid =
    hasExactKeys(root, ["avatar", "cleanup", "operationId", "replayed"]) &&
    hasExactKeys(avatar, [
      "fileId",
      "ownerUserId",
      "name",
      "contentType",
      "byteSize",
      "sha256",
      "downloadUrl",
      "uploadedAt",
    ]) &&
    validCleanup(cleanup) &&
    text(avatar?.fileId).length > 0 &&
    avatar?.name === intent.fileName &&
    avatar?.contentType === intent.contentType &&
    avatar?.byteSize === intent.byteSize &&
    avatar?.sha256 === intent.sha256 &&
    avatar?.downloadUrl === "/api/v1/me/avatar" &&
    validTimestamp(avatar?.uploadedAt) &&
    text(root?.operationId).length > 0 &&
    text(root?.operationId).length <= 160 &&
    typeof root?.replayed === "boolean";
  if (!valid) {
    throw contractError(
      "AVATAR_UPLOAD_RECEIPT_INVALID",
      "Backend chưa trả biên nhận ảnh đại diện chính xác; thao tác chưa được báo thành công.",
    );
  }
  return payload as AvatarUploadReceipt;
}

export function parseAvatarDeleteReceipt(
  payload: unknown,
  intent: AvatarDeleteIntent,
  currentUserId: string,
): AvatarDeleteReceipt {
  if (
    !intent.expectedAvatarFileId.trim() ||
    !validIdempotencyKey(intent.idempotencyKey)
  ) {
    throw contractError(
      "AVATAR_DELETE_INTENT_INVALID",
      "Không thể xác định ảnh đang được yêu cầu xoá.",
      400,
    );
  }
  const root = recordOf(payload);
  const avatar = recordOf(root?.avatar);
  const cleanup = recordOf(root?.cleanup);
  assertIntentOwner(intent.userId, currentUserId, avatar?.ownerUserId);
  const valid =
    hasExactKeys(root, [
      "deleted",
      "avatar",
      "cleanup",
      "operationId",
      "replayed",
    ]) &&
    root?.deleted === true &&
    hasExactKeys(avatar, ["fileId", "ownerUserId", "deletedAt"]) &&
    avatar?.fileId === intent.expectedAvatarFileId &&
    validTimestamp(avatar?.deletedAt) &&
    validCleanup(cleanup) &&
    cleanup?.previousFileId === intent.expectedAvatarFileId &&
    text(root?.operationId).length > 0 &&
    text(root?.operationId).length <= 160 &&
    typeof root?.replayed === "boolean";
  if (!valid) {
    throw contractError(
      "AVATAR_DELETE_RECEIPT_INVALID",
      "Backend chưa trả biên nhận xoá ảnh chính xác; thao tác chưa được báo thành công.",
    );
  }
  return payload as AvatarDeleteReceipt;
}
