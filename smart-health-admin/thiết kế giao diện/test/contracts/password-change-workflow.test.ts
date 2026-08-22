import assert from "node:assert/strict";
import test from "node:test";

import {
  createPasswordChangeIntent,
  executePasswordChange,
  passwordIntentMatches,
  type PasswordChangeAuthority,
  type PasswordChangeDependencies,
  type PasswordChangeReceipt,
} from "../../src/lib/password-change.ts";

const authority: PasswordChangeAuthority = {
  userId: "backend-user-1",
  firebaseConfigured: true,
  firebaseUid: "firebase-user-1",
  authToken: "backend-token-1",
};

const receipt: PasswordChangeReceipt = {
  ok: true,
  user: { id: "backend-user-1" },
  provider: "firebase",
  operationId: "identity-operation-1",
  replayed: true,
};

function apiError(status: number, code: string) {
  return Object.assign(new Error(code), { status, code });
}

test("preserves exact secrets and only recovers a revoked token after an ambiguous same-intent attempt", async () => {
  const calls: Array<{
    input: { currentPassword: string; newPassword: string };
    key: string;
  }> = [];
  const reauthenticationPasswords: string[] = [];
  let attempt = 0;
  let currentAuthToken = authority.authToken;

  const dependencies: PasswordChangeDependencies = {
    currentAuthToken: () => currentAuthToken,
    currentFirebaseUid: () => "firebase-user-1",
    reauthenticateFirebase: async (password) => {
      reauthenticationPasswords.push(password);
      return {
        idToken: `token-${reauthenticationPasswords.length}`,
        uid: "firebase-user-1",
      };
    },
    authenticateFirebase: async (idToken) => {
      currentAuthToken = idToken;
      return {
        user: {
          id: "backend-user-1",
          firebaseUid: "firebase-user-1",
        },
      };
    },
    changePassword: async (input, key) => {
      calls.push({ input, key });
      attempt += 1;
      if (attempt === 1) throw new Error("network interrupted");
      if (attempt === 2) {
        currentAuthToken = "";
        throw apiError(401, "FIREBASE_ID_TOKEN_REVOKED");
      }
      return receipt;
    },
  };
  const intent = createPasswordChangeIntent(
    {
      currentPassword: " CurrentPass1 ",
      newPassword: " NewPass2 ",
    },
    authority,
    "password-change:stable",
  );

  await assert.rejects(
    executePasswordChange(intent, authority, dependencies),
    /network interrupted/,
  );
  assert.equal(intent.mutationOutcomeAmbiguous, true);
  await assert.doesNotReject(
    executePasswordChange(intent, { ...authority, authToken: "token-1" }, dependencies),
  );

  assert.deepEqual(reauthenticationPasswords, [" CurrentPass1 ", " NewPass2 "]);
  assert.deepEqual(
    calls.map(({ key }) => key),
    ["password-change:stable", "password-change:stable", "password-change:stable"],
  );
  assert.deepEqual(calls[0]?.input, {
    currentPassword: " CurrentPass1 ",
    newPassword: " NewPass2 ",
  });
});

test("does not use the new password to recover an immediate or generic 401", async () => {
  for (const code of ["FIREBASE_ID_TOKEN_REVOKED", "FIREBASE_ID_TOKEN_INVALID"]) {
    const reauthenticationPasswords: string[] = [];
    const intent = createPasswordChangeIntent(
      {
        currentPassword: "CurrentPass1",
        newPassword: "NewPass2",
      },
      authority,
      `password-change:${code}`,
    );
    let currentAuthToken = authority.authToken;
    const dependencies: PasswordChangeDependencies = {
      currentAuthToken: () => currentAuthToken,
      currentFirebaseUid: () => "firebase-user-1",
      reauthenticateFirebase: async (password) => {
        reauthenticationPasswords.push(password);
        return { idToken: "token-current", uid: "firebase-user-1" };
      },
      authenticateFirebase: async (idToken) => {
        currentAuthToken = idToken;
        return {
          user: {
            id: "backend-user-1",
            firebaseUid: "firebase-user-1",
          },
        };
      },
      changePassword: async () => {
        throw apiError(401, code);
      },
    };

    await assert.rejects(executePasswordChange(intent, authority, dependencies), new RegExp(code));
    assert.deepEqual(reauthenticationPasswords, ["CurrentPass1"]);
    assert.equal(intent.mutationOutcomeAmbiguous, false);
  }
});

test("fails closed before mutation when Firebase authority belongs to another account", async () => {
  let mutationCalls = 0;
  const intent = createPasswordChangeIntent(
    {
      currentPassword: "CurrentPass1",
      newPassword: "NewPass2",
    },
    authority,
    "password-change:cross-account",
  );
  const dependencies: PasswordChangeDependencies = {
    currentAuthToken: () => authority.authToken,
    currentFirebaseUid: () => "firebase-user-other",
    reauthenticateFirebase: async () => ({
      idToken: "token-other",
      uid: "firebase-user-other",
    }),
    authenticateFirebase: async () => ({
      user: {
        id: "backend-user-other",
        firebaseUid: "firebase-user-other",
      },
    }),
    changePassword: async () => {
      mutationCalls += 1;
      return receipt;
    },
  };

  await assert.rejects(
    executePasswordChange(intent, authority, dependencies),
    /Tài khoản Firebase đã thay đổi/,
  );
  assert.equal(mutationCalls, 0);
});

test("rejects a receipt owned by another backend account", async () => {
  const intent = createPasswordChangeIntent(
    {
      currentPassword: "CurrentPass1",
      newPassword: "NewPass2",
    },
    { ...authority, firebaseConfigured: false, firebaseUid: null },
    "password-change:wrong-owner",
  );
  const dependencies: PasswordChangeDependencies = {
    currentAuthToken: () => authority.authToken,
    currentFirebaseUid: () => null,
    reauthenticateFirebase: async () => {
      throw new Error("not expected");
    },
    authenticateFirebase: async () => {
      throw new Error("not expected");
    },
    changePassword: async () => ({
      ...receipt,
      provider: "demo",
      user: { id: "backend-user-other" },
    }),
  };

  await assert.rejects(
    executePasswordChange(
      intent,
      { ...authority, firebaseConfigured: false, firebaseUid: null },
      dependencies,
    ),
    /không thuộc tài khoản/,
  );
});

test("reuses an intent only for the exact account and untrimmed secret values", () => {
  const input = {
    currentPassword: " CurrentPass1 ",
    newPassword: " NewPass2 ",
  };
  const intent = createPasswordChangeIntent(input, authority, "password-change:exact");

  assert.equal(passwordIntentMatches(intent, input, authority), true);
  assert.equal(
    passwordIntentMatches(intent, { ...input, newPassword: input.newPassword.trim() }, authority),
    false,
  );
  assert.equal(
    passwordIntentMatches(intent, input, {
      ...authority,
      firebaseUid: "firebase-user-other",
    }),
    false,
  );
});
