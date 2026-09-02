const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildDeviceAccessQrPayload,
  classifyDeviceAccessInvite,
  deriveDeviceAccessCode,
  hashDeviceAccessCode,
  normalizeDeviceAccessCode,
  normalizeDeviceAccessLevel,
  publicDeviceAccessInvite,
} = require("../src/deviceAccessContract");

const derivation = {
  deviceId: "shcare-g3-prod-demo",
  organizationId: "org_default_clinic",
  accessLevel: "viewer",
  expiresAt: "2026-09-03T10:00:00.000Z",
  secretMaterial: "sha256:factory-verification-material",
  idempotencyKey: "idem-access-1",
  fingerprint: "fingerprint-1",
};

test("device access codes are deterministic, readable and normalize scanner input", () => {
  const code = deriveDeviceAccessCode(derivation);
  assert.match(code, /^SHC-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.equal(deriveDeviceAccessCode(derivation), code);
  assert.equal(normalizeDeviceAccessCode(code.toLowerCase().replaceAll("-", " ")), code);
  assert.equal(normalizeDeviceAccessCode("SHC-INVALID"), "");
  assert.equal(hashDeviceAccessCode(code), hashDeviceAccessCode(code.toLowerCase()));
});

test("QR payload contains only the opaque access code and no device identity", () => {
  const code = deriveDeviceAccessCode(derivation);
  const payload = buildDeviceAccessQrPayload(code);
  assert.equal(payload, `shcare://device-access?v=1&code=${code}`);
  assert.doesNotMatch(payload, /shcare-g3-prod-demo|org_default_clinic|factory/i);
});

test("public invite metadata never returns a code hash", () => {
  const invite = publicDeviceAccessInvite({
    id: "dai_1",
    deviceId: derivation.deviceId,
    organizationId: derivation.organizationId,
    accessLevel: "manager",
    codeHash: "must-not-leak",
    expiresAt: "2026-09-03T10:00:00.000Z",
    createdAt: "2026-09-02T10:00:00.000Z",
  });
  assert.equal(invite.accessLevel, "manager");
  assert.equal(Object.prototype.hasOwnProperty.call(invite, "codeHash"), false);
  assert.equal(normalizeDeviceAccessLevel("VIEWER"), "viewer");
  assert.throws(() => normalizeDeviceAccessLevel("platform_admin"), /viewer or manager/);
});

test("invite lifecycle distinguishes active, redeemed, revoked and expired", () => {
  const base = { expiresAt: "2026-09-03T10:00:00.000Z" };
  const now = Date.parse("2026-09-02T10:00:00.000Z");
  assert.equal(classifyDeviceAccessInvite(base, now), "active");
  assert.equal(classifyDeviceAccessInvite({ ...base, redeemedAt: "2026-09-02T11:00:00Z" }, now), "redeemed");
  assert.equal(classifyDeviceAccessInvite({ ...base, revokedAt: "2026-09-02T11:00:00Z" }, now), "revoked");
  assert.equal(classifyDeviceAccessInvite({ expiresAt: "2026-09-01T10:00:00Z" }, now), "expired");
});

test("migration creates separate invite and grant tables with constrained scopes", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "058_device_access_invites.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS device_access_invites/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS device_access_grants/);
  assert.match(migration, /access_level IN \('viewer', 'manager'\)/);
  assert.match(migration, /UNIQUE \(device_id, user_id\)/);
  assert.match(migration, /device_access_invites_creator_idempotency_idx/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
});
