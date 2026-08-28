"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildBrevoEventReportUrl,
  isDeliverableNotificationEmailAddress,
  resolveBrevoDeliveryPatch,
  summarizeNotificationCampaignDelivery,
} = require("../src/notificationEmailDelivery");

test("campaign email eligibility rejects reserved and non-routable recipients", () => {
  assert.equal(isDeliverableNotificationEmailAddress("patient@gmail.com"), true);
  assert.equal(isDeliverableNotificationEmailAddress("doctor@clinic.vn"), true);

  for (const address of [
    "doctor.portal.smoke@smarthealth.test",
    "user@example.com",
    "user@example.org",
    "user@example.net",
    "user@localhost",
    "user@clinic.invalid",
    "not-an-email",
    "",
  ]) {
    assert.equal(
      isDeliverableNotificationEmailAddress(address),
      false,
      `${address || "empty"} must not be sent to Brevo`,
    );
  }
});

test("Brevo event report URL is message-bound and never contains credentials", () => {
  const url = new URL(
    buildBrevoEventReportUrl(
      "https://api.brevo.com/v3/smtp/email",
      "<message-123@smtp-relay.mailin.fr>",
    ),
  );
  assert.equal(url.origin, "https://api.brevo.com");
  assert.equal(url.pathname, "/v3/smtp/statistics/events");
  assert.equal(url.searchParams.get("messageId"), "<message-123@smtp-relay.mailin.fr>");
  assert.equal(url.searchParams.get("days"), "1");
  assert.equal(url.toString().includes("api-key"), false);
});

test("Brevo reconciliation distinguishes acceptance, delivery and bounce", () => {
  assert.deepEqual(resolveBrevoDeliveryPatch([{ event: "sent" }]), {
    emailStatus: "sent",
    deliveryStatus: "sent",
    emailErrorMessage: "",
  });
  assert.deepEqual(resolveBrevoDeliveryPatch([{ event: "opened" }]), {
    emailStatus: "delivered",
    deliveryStatus: "delivered",
    emailErrorMessage: "",
  });
  assert.deepEqual(
    resolveBrevoDeliveryPatch([
      { event: "sent" },
      { event: "soft_bounce", reason: "Mailbox temporarily unavailable" },
    ]),
    {
      emailStatus: "soft_bounce",
      deliveryStatus: "soft_bounce",
      emailErrorMessage: "Mailbox temporarily unavailable",
    },
  );
  assert.deepEqual(
    resolveBrevoDeliveryPatch([{ event: "hardBounce", reason: "Unknown recipient" }]),
    {
      emailStatus: "hard_bounce",
      deliveryStatus: "hard_bounce",
      emailErrorMessage: "Unknown recipient",
    },
  );
});

test("a terminal delivered event wins over older transient events", () => {
  assert.deepEqual(
    resolveBrevoDeliveryPatch([
      { event: "deferred", reason: "Greylisted" },
      { event: "delivered" },
      { event: "sent" },
    ]),
    {
      emailStatus: "delivered",
      deliveryStatus: "delivered",
      emailErrorMessage: "",
    },
  );
});

test("campaign summary does not call provider acceptance a delivery", () => {
  const pending = summarizeNotificationCampaignDelivery(
    [
      { inAppStatus: "ready", emailStatus: "sent", pushStatus: "skipped" },
      { inAppStatus: "ready", emailStatus: "soft_bounce", pushStatus: "skipped" },
    ],
    ["in_app", "email"],
  );
  assert.equal(pending.status, "partial");
  assert.deepEqual(pending.channelSummary.email, { sent: 1, soft_bounce: 1 });

  const delivered = summarizeNotificationCampaignDelivery(
    [{ inAppStatus: "ready", emailStatus: "delivered", pushStatus: "skipped" }],
    ["in_app", "email"],
  );
  assert.equal(delivered.status, "delivered");
});

test("backend wires eligibility, durable provider identity and tenant-scoped refresh", () => {
  const root = path.join(__dirname, "..");
  const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const repositories = fs.readFileSync(path.join(root, "src", "repositories.js"), "utf8");

  assert.match(server, /emailEligible:\s*isDeliverableNotificationEmailAddress/);
  assert.match(server, /emailMessageId:\s*result\.messageId/);
  assert.match(server, /segments\[2\]\s*===\s*"campaigns"/);
  assert.match(server, /allowedWorkspaceIds\.has\(organizationId\)/);
  assert.match(server, /refreshBrevoNotificationDelivery/);
  assert.match(server, /recipientEmail:\s*recipient\?\.email/);
  assert.match(repositories, /async listCampaign\(campaignId\)/);
  assert.match(repositories, /metadata\s*=\s*\$14::jsonb/);
});
