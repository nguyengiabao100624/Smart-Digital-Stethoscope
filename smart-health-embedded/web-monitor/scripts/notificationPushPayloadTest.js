const test = require("node:test");
const assert = require("node:assert/strict");

const { buildPushNotificationPayload } = require("../src/notificationPushPayload");

test("appointment push preserves only sanitized deep-link metadata", () => {
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

  assert.deepEqual(payload.data, {
    notificationId: "noti_appointment",
    type: "info",
    channel: "in_app",
    organizationId: "org_alpha",
    userId: "usr_doctor",
    createdAt: "2026-07-14T01:00:00.000Z",
    appointmentId: "appt_alpha",
    patientId: "pat_alpha",
    destination: "appointment_detail",
    actionPath: "/appointments/appt_alpha",
    status: "scheduled",
  });
  assert.equal(Object.values(payload.data).every((value) => typeof value === "string"), true);
});

test("push rejects unsafe external deep links and arbitrary metadata", () => {
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

  assert.equal(payload.data.appointmentId, "appt_alpha");
  assert.equal(payload.data.actionPath, undefined);
  assert.equal(payload.data.destination, undefined);
  assert.equal(payload.data.token, undefined);
  assert.equal(payload.data.nested, undefined);
});

test("device pairing push carries accepted presence without leaking arbitrary metadata", () => {
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

  assert.equal(payload.data.deviceId, "dev_alpha");
  assert.equal(payload.data.pairingOutcome, "accepted");
  assert.equal(payload.data.presence, "awaiting_online");
  assert.equal(payload.data.onlineConfirmed, "false");
  assert.equal(payload.data.connectionMethod, "QR");
  assert.equal(payload.data.wifiPassword, undefined);
});
