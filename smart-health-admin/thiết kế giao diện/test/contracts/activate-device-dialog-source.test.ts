import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const activatePath = new URL(
  "../../src/components/admin/dialogs/ActivateDeviceDialog.tsx",
  import.meta.url,
);

test("preserves exact device and claim identifiers while validating canonical input", async () => {
  const source = await readFile(activatePath, "utf8");

  assert.match(source, /DEVICE_ID_PATTERN/);
  assert.match(source, /CLAIM_CODE_PATTERN/);
  assert.match(source, /setDeviceId\(value\)/);
  assert.match(source, /setClaimCode\(value\)/);
  assert.match(
    source,
    /activateDeviceByClaim\([\s\S]*?deviceId,\s*claimCode,\s*connectionMethod:\s*["']QR["']/,
  );
  assert.doesNotMatch(source, /trim\(\)\.toUpperCase\(\)|toUpperCase\(\)/);
  assert.doesNotMatch(source, /normalizedDeviceId|normalizedClaimCode/);
});

test("uses one stable intent key and a synchronous in-flight guard", async () => {
  const source = await readFile(activatePath, "utf8");

  assert.match(source, /idempotencyKeyRef\s*=\s*useRef<\s*string\s*>\(["']["']\)/);
  assert.match(source, /submitInFlightRef\s*=\s*useRef<\s*boolean\s*>\(false\)/);
  assert.match(source, /if\s*\(submitInFlightRef\.current\)\s*return/);
  assert.match(
    source,
    /idempotencyKeyRef\.current\s*\|\|[\s\S]{0,180}createDeviceOperationIdempotencyKey/,
  );
  assert.match(source, /idempotencyKeyRef\.current\s*=\s*operationKey/);
  assert.match(source, /submitInFlightRef\.current\s*=\s*true/);
  assert.match(source, /finally\s*\{[\s\S]{0,120}submitInFlightRef\.current\s*=\s*false/);
});

test("blocks every dialog dismissal path for the full in-flight request", async () => {
  const source = await readFile(activatePath, "utf8");

  assert.match(source, /isDismissBlocked\s*=\s*\(\)\s*=>\s*submitInFlightRef\.current/);
  assert.match(source, /if\s*\(!nextOpen\s*&&\s*isDismissBlocked\(\)\)\s*return/);
  assert.match(source, /onEscapeKeyDown=\{[\s\S]*?isDismissBlocked\(\)[\s\S]*?preventDefault\(\)/);
  assert.match(
    source,
    /onPointerDownOutside=\{[\s\S]*?isDismissBlocked\(\)[\s\S]*?preventDefault\(\)/,
  );
  assert.match(
    source,
    /onInteractOutside=\{[\s\S]*?isDismissBlocked\(\)[\s\S]*?preventDefault\(\)/,
  );
  assert.ok((source.match(/disabled=\{isDismissBlocked\(\)\}/g) || []).length >= 2);
});

test("keeps ambiguous network failures retryable with the same intent", async () => {
  const source = await readFile(activatePath, "utf8");

  assert.match(source, /isAmbiguousNetworkFailure/);
  assert.match(source, /failureKind/);
  assert.match(
    source,
    /Ch\u01b0a x\u00e1c \u0111\u1ecbnh backend \u0111\u00e3 nh\u1eadn y\u00eau c\u1ea7u/u,
  );
  assert.match(source, /Th\u1eed l\u1ea1i c\u00f9ng y\u00eau c\u1ea7u/u);
  assert.doesNotMatch(
    source,
    /catch\s*\(error\)[\s\S]{0,700}idempotencyKeyRef\.current\s*=\s*["']["']/,
  );
});

test("never presents online success without backend online confirmation", async () => {
  const source = await readFile(activatePath, "utf8");

  assert.match(source, /result\.pairing\.onlineConfirmed\s*===\s*true/);
  assert.match(source, /setStep\(["']awaiting_online["']\)/);
  assert.match(source, /setStep\(["']online["']\)/);
  assert.doesNotMatch(
    source,
    /Thi\u1ebft b\u1ecb \u0111\u00e3 s\u1eb5n s\u00e0ng s\u1eed d\u1ee5ng/u,
  );
});
