import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testRoot, "..", "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

test("treats two-factor authentication as a verified backend workflow", () => {
  const api = read("src/lib/smart-health-api.ts");
  const account = read("src/components/admin/AccountSettings.tsx");

  assert.match(api, /async getTwoFactorStatus\(\)/);
  assert.match(api, /requestJson<SmartHealthTwoFactorStatus>\("\/me\/2fa"\)/);
  assert.doesNotMatch(api, /async updateTwoFactor\(/);
  assert.doesNotMatch(api, /"\/me\/2fa",\s*\{\s*method:\s*"POST"/);

  assert.match(account, /smartHealthApi\.getTwoFactorStatus\(\)/);
  assert.doesNotMatch(account, /smartHealthApi\.updateTwoFactor/);
  assert.doesNotMatch(account, /Bật SMS 2FA|Bật app 2FA/);
  assert.match(account, /hoàn tất xác\s+minh(?:\s+mã)?\s+OTP/i);
});

test("uses the field-level, idempotent notification preference contract", () => {
  const api = read("src/lib/smart-health-api.ts");
  const account = read("src/components/admin/AccountSettings.tsx");

  assert.match(api, /async getNotificationPreferences\(\)/);
  assert.match(api, /"\/me\/notification-preferences"/);
  assert.match(api, /async patchNotificationPreference\(/);
  assert.match(
    api,
    /payload:\s*\{\s*key:\s*SmartHealthNotificationPreferenceKey;\s*enabled:\s*boolean/,
  );
  assert.match(api, /headers:\s*\{\s*"Idempotency-Key":\s*idempotencyKey\s*\}/);

  const saveSource =
    account.match(/const handleSave = async \(\) => \{[\s\S]*?\n[ ]{2}\};/)?.[0] || "";
  assert.doesNotMatch(saveSource, /notificationPreferences/);
  assert.doesNotMatch(account, /updateMe\(\{\s*notificationPreferences/);
  assert.match(account, /preferencePendingKeys/);
  assert.match(account, /crypto\.randomUUID\(\)/);
  assert.match(account, /response\.ownership\.userId/);
  assert.match(account, /response\.preferences\[key\]/);
  assert.match(account, /disabled=\{preferencePendingKeys\.has\(key\)[^}]*\}/);
});

test("keeps the switch visual compact while exposing a 44px interaction target", () => {
  const switchSource = read("src/components/ui/switch.tsx");

  assert.match(switchSource, /h-11 w-11/);
  assert.match(switchSource, /aria-hidden="true"/);
  assert.match(switchSource, /h-6 w-11/);
});

test("keeps Firebase as reauthentication only and uses the canonical idempotent password receipt", () => {
  const api = read("src/lib/smart-health-api.ts");
  const firebase = read("src/lib/firebase-client.ts");
  const workflow = read("src/lib/password-change.ts");
  const account = read("src/components/admin/AccountSettings.tsx");

  assert.doesNotMatch(firebase, /\bupdatePassword\b/);
  assert.doesNotMatch(account, /firebaseClientUpdated|changeFirebasePassword/);
  assert.match(firebase, /reauthenticateFirebasePassword/);
  assert.match(account, /executePasswordChange/);
  assert.match(account, /getSmartHealthStoredTokenSnapshot/);
  assert.match(account, /logoutIfTokenMatches/);
  assert.match(account, /signOutFirebaseIfUidMatches/);

  assert.match(api, /requestJson<unknown>\("\/v1\/me\/password"/);
  assert.match(api, /"Idempotency-Key":\s*idempotencyKey/);
  assert.match(api, /parsePasswordChangeReceipt/);
  assert.match(api, /rootKeys\.join\("\|"\)\s*===\s*"ok\|operationId\|provider\|replayed\|user"/);
  assert.match(api, /userKeys\.length === 1/);
  assert.match(api, /userKeys\[0\] === "id"/);

  assert.match(workflow, /hadPreviousAmbiguousMutation/);
  assert.match(workflow, /isPasswordMutationTokenRecoveryError/);
  assert.match(workflow, /intent\.newPassword/);
  assert.match(workflow, /receipt\.user\.id !== intent\.userId/);
  assert.match(workflow, /dependencies\.currentFirebaseUid\(\)/);
  assert.match(workflow, /dependencies\.currentAuthToken\(\)/);
});
