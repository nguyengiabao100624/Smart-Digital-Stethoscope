export type PasswordChangeInput = {
  currentPassword: string;
  newPassword: string;
};

export type PasswordChangeAuthority = {
  userId: string;
  firebaseConfigured: boolean;
  firebaseUid: string | null;
  authToken: string;
};

export type PasswordChangeIntent = PasswordChangeInput & {
  userId: string;
  firebaseUid: string | null;
  authToken: string;
  idempotencyKey: string;
  firebasePrepared: boolean;
  mutationOutcomeAmbiguous: boolean;
  tokenRecoveryAttempted: boolean;
};

export type PasswordChangeReceipt = {
  ok: true;
  user: {
    id: string;
  };
  provider: "firebase" | "demo";
  operationId: string;
  replayed: boolean;
};

type PasswordChangeApiError = Error & {
  status?: number;
  code?: string;
};

type FirebaseReauthenticationReceipt = {
  idToken: string;
  uid: string;
};

type FirebaseBackendAuthenticationReceipt = {
  user?: {
    id?: string;
    firebaseUid?: string;
  };
};

export type PasswordChangeDependencies = {
  currentAuthToken: () => string;
  currentFirebaseUid: () => string | null;
  reauthenticateFirebase: (password: string) => Promise<FirebaseReauthenticationReceipt>;
  authenticateFirebase: (idToken: string) => Promise<FirebaseBackendAuthenticationReceipt>;
  changePassword: (
    input: PasswordChangeInput,
    idempotencyKey: string,
  ) => Promise<PasswordChangeReceipt>;
};

const recoverablePasswordTokenCodes = new Set([
  "FIREBASE_ID_TOKEN_REVOKED",
  "FIREBASE_ID_TOKEN_EXPIRED",
]);

export class PasswordChangeAuthorityError extends Error {
  readonly code = "PASSWORD_CHANGE_AUTHORITY_CHANGED";

  constructor(message: string) {
    super(message);
    this.name = "PasswordChangeAuthorityError";
  }
}

export function isPasswordChangeAuthorityError(
  error: unknown,
): error is PasswordChangeAuthorityError {
  return (
    error instanceof PasswordChangeAuthorityError ||
    (error instanceof Error &&
      (error as PasswordChangeApiError).code === "PASSWORD_CHANGE_AUTHORITY_CHANGED")
  );
}

export function isAmbiguousPasswordMutationError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = (error as PasswordChangeApiError).status;
  return (
    typeof status !== "number" ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export function isPasswordMutationTokenRecoveryError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const apiError = error as PasswordChangeApiError;
  return apiError.status === 401 && recoverablePasswordTokenCodes.has(String(apiError.code || ""));
}

export function createPasswordChangeIntent(
  input: PasswordChangeInput,
  authority: PasswordChangeAuthority,
  idempotencyKey: string,
): PasswordChangeIntent {
  if (!authority.userId) {
    throw new PasswordChangeAuthorityError("Không xác định được tài khoản cần đổi mật khẩu.");
  }
  if (authority.firebaseConfigured && !authority.firebaseUid) {
    throw new PasswordChangeAuthorityError(
      "Backend chưa liên kết Firebase UID với tài khoản đang đăng nhập.",
    );
  }
  if (!idempotencyKey.trim()) {
    throw new Error("Đổi mật khẩu cần mã thao tác ổn định.");
  }
  if (!authority.authToken) {
    throw new PasswordChangeAuthorityError(
      "Phiên backend hiện tại không còn khả dụng; vui lòng đăng nhập lại.",
    );
  }
  return {
    ...input,
    userId: authority.userId,
    firebaseUid: authority.firebaseUid,
    authToken: authority.authToken,
    idempotencyKey,
    firebasePrepared: false,
    mutationOutcomeAmbiguous: false,
    tokenRecoveryAttempted: false,
  };
}

export function passwordIntentMatches(
  intent: PasswordChangeIntent,
  input: PasswordChangeInput,
  authority: PasswordChangeAuthority,
) {
  return (
    intent.userId === authority.userId &&
    intent.firebaseUid === authority.firebaseUid &&
    intent.authToken === authority.authToken &&
    intent.currentPassword === input.currentPassword &&
    intent.newPassword === input.newPassword
  );
}

function assertFirebaseAuthority(
  intent: PasswordChangeIntent,
  dependencies: PasswordChangeDependencies,
  context: string,
) {
  if (!intent.firebaseUid) {
    throw new PasswordChangeAuthorityError(`Không xác định được Firebase UID khi ${context}.`);
  }
  if (dependencies.currentFirebaseUid() !== intent.firebaseUid) {
    throw new PasswordChangeAuthorityError(
      `Tài khoản Firebase đã thay đổi khi ${context}; thao tác cũ đã bị hủy.`,
    );
  }
}

function assertBackendAuthority(
  intent: PasswordChangeIntent,
  dependencies: PasswordChangeDependencies,
  context: string,
  allowMissingToken = false,
) {
  const currentToken = dependencies.currentAuthToken();
  if (currentToken !== intent.authToken && !(allowMissingToken && currentToken === "")) {
    throw new PasswordChangeAuthorityError(
      `Phiên backend đã thay đổi khi ${context}; thao tác cũ đã bị hủy.`,
    );
  }
}

async function authenticatePasswordAuthority(
  password: string,
  intent: PasswordChangeIntent,
  dependencies: PasswordChangeDependencies,
  context: string,
  allowMissingBackendToken = false,
) {
  assertBackendAuthority(intent, dependencies, context, allowMissingBackendToken);
  assertFirebaseAuthority(intent, dependencies, context);
  const firebaseReceipt = await dependencies.reauthenticateFirebase(password);
  if (firebaseReceipt.uid !== intent.firebaseUid) {
    throw new PasswordChangeAuthorityError(`Firebase xác nhận một tài khoản khác khi ${context}.`);
  }
  assertFirebaseAuthority(intent, dependencies, context);

  const backendReceipt = await dependencies.authenticateFirebase(firebaseReceipt.idToken);
  intent.authToken = firebaseReceipt.idToken;
  if (
    backendReceipt.user?.id !== intent.userId ||
    (backendReceipt.user.firebaseUid !== undefined &&
      backendReceipt.user.firebaseUid !== intent.firebaseUid)
  ) {
    throw new PasswordChangeAuthorityError(`Backend không xác nhận đúng tài khoản khi ${context}.`);
  }
  assertBackendAuthority(intent, dependencies, context);
  assertFirebaseAuthority(intent, dependencies, context);
}

function assertPasswordReceiptOwner(receipt: PasswordChangeReceipt, intent: PasswordChangeIntent) {
  if (receipt.user.id !== intent.userId) {
    throw new PasswordChangeAuthorityError(
      "Biên nhận đổi mật khẩu không thuộc tài khoản đã bắt đầu thao tác.",
    );
  }
}

export async function executePasswordChange(
  intent: PasswordChangeIntent,
  authority: PasswordChangeAuthority,
  dependencies: PasswordChangeDependencies,
) {
  if (
    intent.userId !== authority.userId ||
    intent.firebaseUid !== authority.firebaseUid ||
    intent.authToken !== authority.authToken
  ) {
    throw new PasswordChangeAuthorityError(
      "Quyền tài khoản đã thay đổi; thao tác đổi mật khẩu cũ đã bị hủy.",
    );
  }

  if (authority.firebaseConfigured && !intent.firebasePrepared) {
    await authenticatePasswordAuthority(
      intent.currentPassword,
      intent,
      dependencies,
      "xác thực mật khẩu hiện tại",
    );
    intent.firebasePrepared = true;
  }

  const input = {
    currentPassword: intent.currentPassword,
    newPassword: intent.newPassword,
  };
  const hadPreviousAmbiguousMutation = intent.mutationOutcomeAmbiguous;
  let receipt: PasswordChangeReceipt;

  try {
    assertBackendAuthority(intent, dependencies, "gửi yêu cầu đổi mật khẩu");
    receipt = await dependencies.changePassword(input, intent.idempotencyKey);
  } catch (error) {
    const canRecoverRevokedToken =
      authority.firebaseConfigured &&
      hadPreviousAmbiguousMutation &&
      !intent.tokenRecoveryAttempted &&
      isPasswordMutationTokenRecoveryError(error);

    intent.mutationOutcomeAmbiguous =
      intent.mutationOutcomeAmbiguous || isAmbiguousPasswordMutationError(error);

    if (!canRecoverRevokedToken) throw error;

    intent.tokenRecoveryAttempted = true;
    await authenticatePasswordAuthority(
      intent.newPassword,
      intent,
      dependencies,
      "khôi phục biên nhận đổi mật khẩu",
      true,
    );
    intent.firebasePrepared = true;
    assertBackendAuthority(intent, dependencies, "gửi lại yêu cầu đổi mật khẩu");
    receipt = await dependencies.changePassword(input, intent.idempotencyKey);
  }

  assertPasswordReceiptOwner(receipt, intent);
  assertBackendAuthority(intent, dependencies, "xác nhận biên nhận đổi mật khẩu");
  if (authority.firebaseConfigured) {
    assertFirebaseAuthority(intent, dependencies, "xác nhận biên nhận đổi mật khẩu");
  }
  return receipt;
}
