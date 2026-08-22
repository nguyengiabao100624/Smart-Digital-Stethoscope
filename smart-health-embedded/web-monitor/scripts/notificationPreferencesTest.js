"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  CLOUD_NOTIFICATION_PREFERENCE_KEYS,
  mergeNotificationPreferences,
  mergeNotificationPushStatus,
  normalizeNotificationPreferences,
  parseNotificationPreferencePatch,
  parseNotificationCampaignType,
  resolveNotificationPreferenceKey,
  resolveNotificationPreferenceDecision,
} = require("../src/notificationPreferences");

test("normalization publishes stable account-wide defaults without inventing AI opt-in", () => {
  assert.deepEqual(normalizeNotificationPreferences(), {
    enabled: true,
    sound: true,
    vibration: true,
    doctorRequests: true,
    abnormalResults: true,
    deviceOffline: true,
    appointments: true,
    messages: true,
    aiUpdates: false,
    newLogin: true,
  });
  assert.deepEqual(CLOUD_NOTIFICATION_PREFERENCE_KEYS, [
    "enabled",
    "doctorRequests",
    "abnormalResults",
    "deviceOffline",
    "appointments",
    "messages",
    "aiUpdates",
    "newLogin",
  ]);
});

test("field merge changes only the requested cloud preference", () => {
  const current = normalizeNotificationPreferences({
    enabled: true,
    messages: true,
    appointments: false,
    aiUpdates: true,
  });
  const merged = mergeNotificationPreferences(current, { messages: false });
  assert.equal(merged.messages, false);
  assert.equal(merged.appointments, false);
  assert.equal(merged.aiUpdates, true);
  assert.equal(merged.enabled, true);
});

test("dedicated patch parser accepts exactly one cloud field", () => {
  assert.deepEqual(parseNotificationPreferencePatch({ key: "messages", enabled: false }), {
    key: "messages",
    enabled: false,
  });
  assert.deepEqual(parseNotificationPreferencePatch({ key: "enabled", enabled: false }), {
    key: "enabled",
    enabled: false,
  });
});

test("dedicated patch parser rejects client-only, unknown, extra and non-boolean input", () => {
  for (const payload of [
    { key: "sound", enabled: false },
    { key: "vibration", enabled: false },
    { key: "unknown", enabled: false },
    { key: "messages", enabled: "false" },
    { key: "messages", enabled: false, workspaceId: "workspace_b" },
    { preferences: { messages: false } },
  ]) {
    assert.throws(
      () => parseNotificationPreferencePatch(payload),
      (error) =>
        Number(error.statusCode) === 400 &&
        ["NOTIFICATION_PREFERENCE_FIELD_INVALID", "NOTIFICATION_PREFERENCE_PATCH_INVALID"].includes(
          error.code,
        ),
    );
  }
});

test("preference resolver trusts a valid server-owned metadata key before narrow aliases", () => {
  assert.equal(
    resolveNotificationPreferenceKey({
      type: "warning",
      metadata: { preferenceKey: "appointments", appointmentId: "appointment_a" },
    }),
    "appointments",
  );
  assert.equal(
    resolveNotificationPreferenceKey({
      type: "doctor_info_requested",
      metadata: {},
    }),
    "doctorRequests",
  );
  assert.equal(
    resolveNotificationPreferenceKey({
      type: "info",
      metadata: { appointmentId: "appointment_a" },
    }),
    "appointments",
  );
  assert.equal(resolveNotificationPreferenceKey({ type: "critical", metadata: {} }), null);
  assert.equal(resolveNotificationPreferenceKey({ type: "custom_campaign", metadata: {} }), null);
});

test("delivery decision respects global and category opt-out but allows unknown legacy types", () => {
  assert.deepEqual(
    resolveNotificationPreferenceDecision(
      normalizeNotificationPreferences({ enabled: false }),
      { type: "custom_campaign" },
    ),
    {
      allowed: false,
      preferenceKey: null,
      reasonCode: "NOTIFICATION_PREFERENCES_DISABLED",
    },
  );
  assert.deepEqual(
    resolveNotificationPreferenceDecision(
      normalizeNotificationPreferences({ appointments: false }),
      { type: "info", metadata: { appointmentId: "appointment_a" } },
    ),
    {
      allowed: false,
      preferenceKey: "appointments",
      reasonCode: "NOTIFICATION_PREFERENCE_DISABLED",
    },
  );
  assert.deepEqual(
    resolveNotificationPreferenceDecision(
      normalizeNotificationPreferences({ messages: false }),
      { type: "custom_campaign" },
    ),
    {
      allowed: true,
      preferenceKey: null,
      reasonCode: "",
    },
  );
});

test("backend cloud fields match the shared closed HTTP v1 contract", () => {
  const contractRoot = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "packages",
    "shcare-contracts",
    "http",
    "v1",
  );
  const patchSchema = JSON.parse(
    fs.readFileSync(
      path.join(contractRoot, "notification-preferences-patch-request.schema.json"),
      "utf8",
    ),
  );
  const responseSchema = JSON.parse(
    fs.readFileSync(
      path.join(contractRoot, "notification-preferences-response.schema.json"),
      "utf8",
    ),
  );
  assert.equal(patchSchema.additionalProperties, false);
  assert.deepEqual(patchSchema.properties.key.enum, CLOUD_NOTIFICATION_PREFERENCE_KEYS);
  assert.deepEqual(
    responseSchema.$defs.preferences.required,
    CLOUD_NOTIFICATION_PREFERENCE_KEYS,
  );
  assert.equal(responseSchema.$defs.preferences.properties.sound, undefined);
  assert.equal(responseSchema.$defs.preferences.properties.vibration, undefined);
});

test("campaign notification type is restricted to the published API allowlist", () => {
  for (const type of ["info", "warning", "success", "error"]) {
    assert.equal(parseNotificationCampaignType(type), type);
  }
  for (const type of ["", "critical", "custom", "doctor_info_requested", null]) {
    assert.throws(
      () => parseNotificationCampaignType(type),
      (error) =>
        Number(error.statusCode) === 400 &&
        error.code === "NOTIFICATION_TYPE_INVALID",
    );
  }
});

test("push delivery evidence never regresses after a provider accepted at least one send", () => {
  for (const nextStatus of [
    "skipped",
    "disabled",
    "unavailable",
    "no_devices",
    "failed",
    "ready",
  ]) {
    assert.equal(mergeNotificationPushStatus("partial", nextStatus), "partial");
    assert.equal(mergeNotificationPushStatus("sent", nextStatus), "sent");
  }
  assert.equal(mergeNotificationPushStatus("failed", "partial"), "partial");
  assert.equal(mergeNotificationPushStatus("ready", "sent"), "sent");
  assert.equal(mergeNotificationPushStatus("ready", "skipped"), "skipped");
});

test("generic notification factories cannot fan private content out to platform-admin email", () => {
  const serverSource = fs.readFileSync(
    path.resolve(__dirname, "..", "server.js"),
    "utf8",
  );
  assert.equal(
    serverSource.includes("queuePlatformAdminNotificationEmail("),
    false,
    "platform-wide email must use an explicit audited audience flow, never a generic factory side-channel",
  );
});
