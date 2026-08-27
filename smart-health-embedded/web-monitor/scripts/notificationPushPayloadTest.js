const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildPushNotificationPayload } = require("../src/notificationPushPayload");

test("push is a data-only generic wake-up without clinical content or deep links", () => {
  const payload = buildPushNotificationPayload({
    id: "noti_appointment",
    type: "info",
    channel: "in_app",
    organizationId: "org_alpha",
    userId: "usr_doctor",
    title: "Lịch hẹn mới",
    message: "Bạn có lịch hẹn mới.",
    createdAt: "2026-07-14T01:00:00.000Z",
    metadata: {
      appointmentId: "appt_alpha",
      patientId: "pat_alpha",
      destination: "appointment_detail",
      actionPath: "/appointments/appt_alpha",
      status: "scheduled",
      password: "must-not-leak",
      deviceSecret: "must-not-leak",
      arbitraryClinicalNote: "must-not-leak",
    },
  });

  assert.deepEqual(payload, {
    data: {
    notificationId: "noti_appointment",
    workspaceId: "org_alpha",
    organizationId: "org_alpha",
    userId: "usr_doctor",
    notificationProtocolVersion: "2",
    createdAt: "2026-07-14T01:00:00.000Z",
    },
    android: {
      priority: "high",
    },
  });
  assert.equal(Object.values(payload.data).every((value) => typeof value === "string"), true);
  assert.equal(payload.notification, undefined);
  assert.equal(payload.data.appointmentId, undefined);
  assert.equal(payload.data.patientId, undefined);
  assert.equal(payload.data.destination, undefined);
  assert.equal(payload.data.actionPath, undefined);
  assert.equal(payload.data.status, undefined);
});

test("push emits one canonical workspace binding with organization compatibility", () => {
  const payload = buildPushNotificationPayload({
    id: "noti_workspace",
    workspaceId: "workspace_current",
    organizationId: "workspace_stale_alias",
    userId: "usr_doctor",
    title: "Workspace update",
    message: "A workspace-bound event is ready.",
  });

  assert.equal(payload.data.workspaceId, "workspace_current");
  assert.equal(payload.data.organizationId, "workspace_current");
});

test("push rejects all provider deep links and arbitrary metadata", () => {
  const payload = buildPushNotificationPayload({
    id: "noti_external",
    title: "Cập nhật",
    message: "Có cập nhật mới.",
    metadata: {
      appointmentId: "appt_alpha",
      actionPath: "https://attacker.example/steal",
      destination: "../../unsafe",
      token: "must-not-leak",
      nested: { phi: "must-not-leak" },
    },
  });

  assert.equal(payload.data.appointmentId, undefined);
  assert.equal(payload.data.actionPath, undefined);
  assert.equal(payload.data.destination, undefined);
  assert.equal(payload.data.token, undefined);
  assert.equal(payload.data.nested, undefined);
});

test("device pairing push remains a generic wake-up without device state", () => {
  const payload = buildPushNotificationPayload({
    id: "noti_pairing",
    type: "info",
    organizationId: "org_alpha",
    userId: "usr_admin",
    title: "Yêu cầu ghép thiết bị đã được chấp nhận",
    message: "Thiết bị đang chờ xác thực trực tuyến.",
    metadata: {
      deviceId: "dev_alpha",
      destination: "device_detail",
      actionPath: "/devices/dev_alpha",
      pairingOutcome: "accepted",
      presence: "awaiting_online",
      onlineConfirmed: false,
      connectionMethod: "QR",
      wifiPassword: "must-not-leak",
    },
  });

  assert.equal(payload.data.deviceId, undefined);
  assert.equal(payload.data.pairingOutcome, undefined);
  assert.equal(payload.data.presence, undefined);
  assert.equal(payload.data.onlineConfirmed, undefined);
  assert.equal(payload.data.connectionMethod, undefined);
  assert.equal(payload.data.wifiPassword, undefined);
});

test("push never exposes registration session or client version bindings", () => {
  const payload = buildPushNotificationPayload({
    id: "noti_private_binding",
    workspaceId: "workspace_current",
    userId: "usr_current",
    authSessionId: "must-not-leak",
    notificationProtocolVersion: 99,
    appVersion: "must-not-leak",
  });

  assert.equal(payload.data.notificationProtocolVersion, "2");
  assert.equal(payload.data.authSessionId, undefined);
  assert.equal(payload.data.appVersion, undefined);
});

test("backend data-only payload matches the shared HTTP v1 fixture and closed schema", () => {
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
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(contractRoot, "notification-fcm-data-envelope.schema.json"),
      "utf8",
    ),
  );
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(contractRoot, "fixtures", "notification-fcm-data-envelope.json"),
      "utf8",
    ),
  );
  const payload = buildPushNotificationPayload({
    id: fixture.notificationId,
    workspaceId: fixture.workspaceId,
    userId: fixture.userId,
    createdAt: fixture.createdAt,
  });

  assert.deepEqual(payload.data, fixture);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    Object.keys(payload.data).filter((key) => !Object.hasOwn(schema.properties, key)),
    [],
  );
  assert.deepEqual(
    schema.required.filter((key) => !Object.hasOwn(payload.data, key)),
    [],
  );
});
