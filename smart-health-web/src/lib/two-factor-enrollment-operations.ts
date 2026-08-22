export interface TwoFactorEnrollmentStartIntent {
  userId: string;
  authSessionEpoch: number;
  idempotencyKey: string;
}

export interface TwoFactorEnrollmentStartReceipt {
  userId: string;
  twoFactor: { enabled: false; method: ""; enrollmentPending: true };
  enrollment: {
    id: string;
    method: "app";
    manualKey: string;
    otpauthUri: string;
    expiresAt: string;
  };
  replayed: boolean;
  superseded: boolean;
}

export interface TwoFactorEnrollmentIntent {
  userId: string;
  authSessionEpoch: number;
  enrollmentId: string;
  code: string;
  idempotencyKey: string;
}

export interface TwoFactorRecoveryDelivery {
  id: string;
  expiresAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
}

export interface TwoFactorRecoveryAckIntent {
  userId: string;
  authSessionEpoch: number;
  enrollmentId: string;
  deliveryId: string;
  recoveryAckToken: string;
  idempotencyKey: string;
}

export interface TwoFactorEnrollmentReceipt {
  userId: string;
  enrollmentId: string;
  twoFactor: { enabled: false; method: ""; enrollmentPending: true };
  recoveryCodes: string[];
  recoveryDelivery: TwoFactorRecoveryDelivery & { acknowledged: false };
  recoveryAckToken: string;
  replayed: boolean;
}

export interface TwoFactorRecoveryAckReceipt {
  userId: string;
  enrollmentId: string;
  twoFactor: { enabled: true; method: "app"; enrollmentPending: false };
  recoveryDelivery: TwoFactorRecoveryDelivery & {
    acknowledged: true;
    acknowledgedAt: string;
  };
  twoFactorToken: string;
  tokenExpiresAt: string;
  replayed: boolean;
}

export class TwoFactorEnrollmentContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwoFactorEnrollmentContractError";
  }
}

const VERIFY_KEYS = [
  "enrollmentId",
  "recoveryAckToken",
  "recoveryCodes",
  "recoveryDelivery",
  "replayed",
  "twoFactor",
  "userId",
] as const;
const START_KEYS = [
  "enrollment",
  "replayed",
  "superseded",
  "twoFactor",
  "userId",
] as const;
const START_ENROLLMENT_KEYS = [
  "expiresAt",
  "id",
  "manualKey",
  "method",
  "otpauthUri",
] as const;
const ACK_KEYS = [
  "enrollmentId",
  "recoveryDelivery",
  "replayed",
  "tokenExpiresAt",
  "twoFactor",
  "twoFactorToken",
  "userId",
] as const;

function contractError(message: string) {
  return new TwoFactorEnrollmentContractError(
    `Biên nhận thiết lập 2FA không hợp lệ: ${message}`,
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
  return (
    typeof value === "string" &&
    value === value.trim() &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function assertEnabledAppFactor(value: unknown) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["enabled", "enrollmentPending", "method"]) ||
    value.enabled !== true ||
    value.method !== "app" ||
    value.enrollmentPending !== false
  ) {
    throw contractError("backend chưa xác nhận đúng phương thức OTP ứng dụng.");
  }
}

function assertPendingAppFactor(value: unknown) {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["enabled", "enrollmentPending", "method"]) ||
    value.enabled !== false ||
    value.method !== "" ||
    value.enrollmentPending !== true
  ) {
    throw contractError(
      "backend phải giữ 2FA ở trạng thái tắt trong khi chờ xác nhận mã khôi phục.",
    );
  }
}

function parseDelivery(
  value: unknown,
  expectedId?: string,
): TwoFactorRecoveryDelivery {
  if (!isRecord(value))
    throw contractError("thiếu biên nhận giao mã khôi phục.");
  const acknowledged = value.acknowledged;
  const expectedKeys = acknowledged
    ? ["acknowledged", "acknowledgedAt", "expiresAt", "id"]
    : ["acknowledged", "expiresAt", "id"];
  if (!hasExactKeys(value, expectedKeys)) {
    throw contractError(
      "biên nhận giao mã khôi phục không đúng định dạng chuẩn.",
    );
  }
  if (
    !isBoundedIdentity(value.id, 200) ||
    (expectedId && value.id !== expectedId) ||
    !isDateTime(value.expiresAt) ||
    typeof acknowledged !== "boolean" ||
    (acknowledged && !isDateTime(value.acknowledgedAt))
  ) {
    throw contractError("biên nhận giao mã khôi phục không khớp thao tác.");
  }
  return value as unknown as TwoFactorRecoveryDelivery;
}

export function createTwoFactorEnrollmentIdempotencyKey() {
  const randomId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `two-factor-enrollment-${randomId}`;
}

export function assertTwoFactorEnrollmentStartIntent(
  intent: TwoFactorEnrollmentStartIntent,
) {
  if (!Number.isSafeInteger(intent.authSessionEpoch) || intent.authSessionEpoch < 0) {
    throw contractError("thiếu phiên xác thực chính được giới hạn.");
  }
  if (!isBoundedIdentity(intent.userId, 160)) {
    throw contractError("thiếu chủ tài khoản.");
  }
  if (!isBoundedIdentity(intent.idempotencyKey, 160)) {
    throw contractError("thiếu mã thao tác bắt đầu ổn định.");
  }
}

export function parseTwoFactorEnrollmentStartReceipt(
  payload: unknown,
  intent: TwoFactorEnrollmentStartIntent,
): TwoFactorEnrollmentStartReceipt {
  assertTwoFactorEnrollmentStartIntent(intent);
  if (!isRecord(payload) || !hasExactKeys(payload, START_KEYS)) {
    throw contractError("biên nhận bắt đầu không đúng định dạng chuẩn.");
  }
  assertPendingAppFactor(payload.twoFactor);
  if (
    payload.userId !== intent.userId ||
    typeof payload.replayed !== "boolean" ||
    typeof payload.superseded !== "boolean" ||
    !isRecord(payload.enrollment) ||
    !hasExactKeys(payload.enrollment, START_ENROLLMENT_KEYS) ||
    !isBoundedIdentity(payload.enrollment.id, 200) ||
    payload.enrollment.method !== "app" ||
    typeof payload.enrollment.manualKey !== "string" ||
    !/^[A-Z2-7]{16,128}$/.test(payload.enrollment.manualKey) ||
    typeof payload.enrollment.otpauthUri !== "string" ||
    !payload.enrollment.otpauthUri.startsWith("otpauth://totp/") ||
    !isDateTime(payload.enrollment.expiresAt)
  ) {
    throw contractError(
      "biên nhận bắt đầu không khớp chủ tài khoản hoặc lần thiết lập.",
    );
  }
  return payload as unknown as TwoFactorEnrollmentStartReceipt;
}

export function assertTwoFactorEnrollmentIntent(
  intent: TwoFactorEnrollmentIntent,
) {
  if (!Number.isSafeInteger(intent.authSessionEpoch) || intent.authSessionEpoch < 0) {
    throw contractError("thiếu phiên xác thực chính được giới hạn.");
  }
  if (!isBoundedIdentity(intent.userId, 160))
    throw contractError("thiếu chủ tài khoản.");
  if (!isBoundedIdentity(intent.enrollmentId, 200))
    throw contractError("thiếu mã định danh lần thiết lập.");
  if (!/^\d{6}$/.test(intent.code))
    throw contractError("mã OTP phải có đúng 6 chữ số.");
  if (!isBoundedIdentity(intent.idempotencyKey, 160)) {
    throw contractError("thiếu mã thao tác ổn định để thử lại an toàn.");
  }
}

export function assertTwoFactorRecoveryAckIntent(
  intent: TwoFactorRecoveryAckIntent,
) {
  if (!Number.isSafeInteger(intent.authSessionEpoch) || intent.authSessionEpoch < 0) {
    throw contractError("thiếu phiên xác thực chính được giới hạn.");
  }
  if (!isBoundedIdentity(intent.enrollmentId, 200)) {
    throw contractError("thiếu mã định danh lần thiết lập cần xác nhận.");
  }
  if (
    !isBoundedIdentity(intent.recoveryAckToken, 1024) ||
    !/^[A-Za-z0-9_-]+$/.test(intent.recoveryAckToken)
  ) {
    throw contractError("thiếu mã xác nhận khôi phục dùng một lần được giới hạn.");
  }
  if (!isBoundedIdentity(intent.userId, 160))
    throw contractError("thiếu chủ tài khoản.");
  if (!isBoundedIdentity(intent.deliveryId, 200))
    throw contractError("thiếu lần giao mã khôi phục.");
  if (!isBoundedIdentity(intent.idempotencyKey, 160)) {
    throw contractError("thiếu mã thao tác ổn định để xác nhận an toàn.");
  }
}

export function parseTwoFactorEnrollmentReceipt(
  payload: unknown,
  intent: TwoFactorEnrollmentIntent,
): TwoFactorEnrollmentReceipt {
  assertTwoFactorEnrollmentIntent(intent);
  if (!isRecord(payload) || !hasExactKeys(payload, VERIFY_KEYS)) {
    throw contractError("biên nhận phản hồi không đúng định dạng chuẩn.");
  }
  assertPendingAppFactor(payload.twoFactor);
  if (
    payload.userId !== intent.userId ||
    payload.enrollmentId !== intent.enrollmentId ||
    typeof payload.replayed !== "boolean" ||
    !Array.isArray(payload.recoveryCodes) ||
    payload.recoveryCodes.length !== 8 ||
    payload.recoveryCodes.some(
      (code) =>
        typeof code !== "string" || !/^[A-F0-9]{6}-[A-F0-9]{6}$/.test(code),
    ) ||
    new Set(payload.recoveryCodes).size !== 8 ||
    typeof payload.recoveryAckToken !== "string" ||
    !isBoundedIdentity(payload.recoveryAckToken, 1024) ||
    !/^[A-Za-z0-9_-]+$/.test(payload.recoveryAckToken)
  ) {
    throw contractError(
      "biên nhận không xác nhận đúng chủ tài khoản, lần thiết lập hoặc dữ liệu 2FA.",
    );
  }
  const delivery = parseDelivery(payload.recoveryDelivery);
  if (delivery.acknowledged || Date.parse(delivery.expiresAt) <= Date.now()) {
    throw contractError("cửa sổ giao mã khôi phục không còn khả dụng.");
  }
  return payload as unknown as TwoFactorEnrollmentReceipt;
}

export function parseTwoFactorRecoveryAckReceipt(
  payload: unknown,
  expected: { userId: string; enrollmentId: string; deliveryId: string },
): TwoFactorRecoveryAckReceipt {
  if (!isRecord(payload) || !hasExactKeys(payload, ACK_KEYS)) {
    throw contractError(
      "biên nhận xác nhận lưu mã không đúng định dạng chuẩn.",
    );
  }
  assertEnabledAppFactor(payload.twoFactor);
  const delivery = parseDelivery(payload.recoveryDelivery, expected.deliveryId);
  if (
    payload.userId !== expected.userId ||
    payload.enrollmentId !== expected.enrollmentId ||
    typeof payload.replayed !== "boolean" ||
    !delivery.acknowledged ||
    !delivery.acknowledgedAt ||
    typeof payload.twoFactorToken !== "string" ||
    !isBoundedIdentity(payload.twoFactorToken, 1024) ||
    !/^[A-Za-z0-9_-]+$/.test(payload.twoFactorToken) ||
    typeof payload.tokenExpiresAt !== "string" ||
    !isDateTime(payload.tokenExpiresAt) ||
    Date.parse(payload.tokenExpiresAt) <= Date.parse(delivery.acknowledgedAt)
  ) {
    throw contractError(
      "backend chưa xác nhận đúng chủ tài khoản và lần giao mã.",
    );
  }
  return payload as unknown as TwoFactorRecoveryAckReceipt;
}
