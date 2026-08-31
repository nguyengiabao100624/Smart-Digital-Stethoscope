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
  assert.match(api, /requestJson<SmartHealthTwoFactorStatus>\("\/v1\/me\/2fa"\)/);
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
  assert.match(api, /"\/v1\/me\/notification-preferences"/);
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

test("uses the canonical idempotent account profile contract without mixing avatar authority", () => {
  const api = read("src/lib/smart-health-api.ts");
  const account = read("src/components/admin/AccountSettings.tsx");

  assert.match(api, /payload: SmartHealthAccountProfilePatch/);
  assert.match(api, /expectedUserId: string/);
  assert.match(api, /parseAccountProfileReceipt\(/);
  assert.match(api, /await requestJson<unknown>\("\/v1\/me"/);
  assert.match(api, /headers: \{ "Idempotency-Key": idempotencyKey \}/);

  const saveSource =
    account.match(/const handleSave = async \(\) => \{[\s\S]*?\n[ ]{2}\};/)?.[0] || "";
  assert.match(saveSource, /profileSaveIntentRef/);
  assert.match(saveSource, /createIdempotencyKey\("account-profile"\)/);
  assert.match(saveSource, /smartHealthApi\.updateMe\(/);
  assert.match(saveSource, /activeIntent\.idempotencyKey/);
  assert.match(saveSource, /smartHealthApi\.me\(\)/);
  assert.match(saveSource, /Object\.entries\(patch\)/);
  assert.doesNotMatch(saveSource, /avatarFileId|avatarUrl|organizationId|workspaceId/);
});

test("binds canonical avatar mutations to the current user, workspace and auth session", () => {
  const api = read("src/lib/smart-health-api.ts");
  const account = read("src/components/admin/AccountSettings.tsx");

  assert.match(api, /async resolveAvatarMutationAuthority\(/);
  assert.match(api, /session\.current === true && !session\.revokedAt/);
  assert.match(api, /"X-Shcare-Expected-User-Id"/);
  assert.match(api, /"X-Shcare-Expected-Workspace-Id"/);
  assert.match(api, /"X-Shcare-Expected-Auth-Session-Id"/);
  assert.match(
    api,
    /parseAvatarUploadReceipt\([\s\S]{0,100}requestJson<unknown>\("\/v1\/me\/avatar"/,
  );
  assert.match(
    api,
    /parseAvatarDeleteReceipt\([\s\S]{0,100}requestJson<unknown>\("\/v1\/me\/avatar"/,
  );
  assert.match(api, /"Idempotency-Key": intent\.idempotencyKey/);
  assert.match(api, /expectedAvatarFileId: intent\.expectedAvatarFileId/);
  assert.match(api, /requestBlob\("\/v1\/me\/avatar"\)/);

  assert.match(account, /accountWorkspaceId/);
  assert.match(account, /avatarUploadIntentRef/);
  assert.match(account, /avatarDeleteIntentRef/);
  assert.match(account, /resolveAvatarMutationAuthority\(/);
  assert.match(account, /user\.avatarFileId !== receipt\.avatar\.fileId/);
  assert.match(account, /if \(user\.avatarFileId \|\| receipt\.avatar\.fileId/);
  assert.match(account, /window\.dispatchEvent\(new Event\("shcare:avatar-updated"\)\)/);
});

test("keeps every Admin account read and mutation on the canonical v1 authority", () => {
  const api = read("src/lib/smart-health-api.ts");

  assert.match(api, /requestJson<\{ user: SmartHealthAuthUser \}>\("\/v1\/me"\)/);
  assert.match(api, /"\/v1\/me\/2fa"/);
  assert.match(api, /"\/v1\/me\/notification-preferences"/);
  assert.match(api, /"\/v1\/auth\/sessions"/);
  assert.doesNotMatch(api, /requestJson[^\n]*\("\/me"\)/);
  assert.doesNotMatch(api, /"\/me\/2fa"/);
  assert.doesNotMatch(api, /"\/me\/notification-preferences"/);
  assert.doesNotMatch(api, /"\/auth\/sessions"/);
});
