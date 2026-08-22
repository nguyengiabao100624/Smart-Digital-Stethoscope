export interface AuthSessionRevokeIntent {
  userId: string;
  sessionId: string;
  idempotencyKey: string;
}

export interface AuthSessionRevokeSession {
  id: string;
  provider: string;
  device: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string;
  current: false;
}

export interface AuthSessionRevokeReceipt {
  session: AuthSessionRevokeSession;
  revoked: true;
  replayed: boolean;
}

export class AuthSessionRevokeContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthSessionRevokeContractError";
  }
}

const RECEIPT_KEYS = ["replayed", "revoked", "session"] as const;
const SESSION_KEYS = [
  "createdAt",
  "current",
  "device",
  "id",
  "ip",
  "lastSeenAt",
  "provider",
  "revokedAt",
  "userAgent",
] as const;

function contractError(message: string) {
  return new AuthSessionRevokeContractError(
    `Biên nhận thu hồi phiên đăng nhập không hợp lệ: ${message}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === keys[index])
  );
}

function isBoundedIdentity(value: unknown, maxLength: number) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  );
}

function isDateTime(value: unknown) {
  if (typeof value !== "string" || value !== value.trim()) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  );
}

export function createAuthSessionRevokeIdempotencyKey() {
  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `session-revoke-${randomId}`;
}

export function isAuthSessionIdempotencyCollision(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    String((error as { code?: unknown }).code || "") ===
      "IDEMPOTENCY_KEY_REUSED"
  );
}

export function assertAuthSessionRevokeIntent(
  intent: AuthSessionRevokeIntent,
  activeUserId: string,
) {
  if (!isBoundedIdentity(intent.userId, 120)) {
    throw contractError("thiếu chủ tài khoản của thao tác.");
  }
  if (!isBoundedIdentity(activeUserId, 120) || activeUserId !== intent.userId) {
    throw contractError("thao tác không còn thuộc tài khoản hiện tại.");
  }
  if (!isBoundedIdentity(intent.sessionId, 160)) {
    throw contractError("thiếu mã phiên cần thu hồi.");
  }
  if (!isBoundedIdentity(intent.idempotencyKey, 160)) {
    throw contractError("thiếu mã thao tác ổn định để thử lại an toàn.");
  }
}

export function parseAuthSessionRevokeReceipt(
  payload: unknown,
  intent: AuthSessionRevokeIntent,
  activeUserId: string,
): AuthSessionRevokeReceipt {
  assertAuthSessionRevokeIntent(intent, activeUserId);

  if (!isRecord(payload) || !hasExactKeys(payload, RECEIPT_KEYS)) {
    throw contractError("response không đúng canonical contract.");
  }
  if (payload.revoked !== true || typeof payload.replayed !== "boolean") {
    throw contractError("backend chưa xác nhận trạng thái thu hồi và replay.");
  }
  if (
    !isRecord(payload.session) ||
    !hasExactKeys(payload.session, SESSION_KEYS)
  ) {
    throw contractError("snapshot phiên không đúng canonical contract.");
  }

  const session = payload.session;
  if (
    !isBoundedIdentity(session.id, 160) ||
    session.id !== intent.sessionId ||
    !isBoundedIdentity(session.provider, 80) ||
    typeof session.device !== "string" ||
    typeof session.userAgent !== "string" ||
    typeof session.ip !== "string" ||
    !isDateTime(session.createdAt) ||
    !isDateTime(session.lastSeenAt) ||
    !isDateTime(session.revokedAt) ||
    session.current !== false
  ) {
    throw contractError("snapshot không xác nhận đúng phiên đã yêu cầu.");
  }

  return payload as unknown as AuthSessionRevokeReceipt;
}
