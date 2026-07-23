import assert from "node:assert/strict";
import test from "node:test";
import {
  notificationCampaignFingerprint,
  parseNotificationCampaignReceipt,
  parseNotificationOptions,
  resolveNotificationCampaignAttempt,
  type NotificationCampaignIntent,
} from "../../src/lib/notification-operations.ts";

const intent: NotificationCampaignIntent = {
  title: "Kiểm tra thiết bị",
  message: "Vui lòng kiểm tra trạng thái thiết bị.",
  type: "warning",
  audience: { type: "role", workspaceId: "org_alpha", role: "doctor" },
  channels: ["in_app", "email", "push"],
};

const channels = {
  in_app: { available: true, status: "ready", provider: "backend" },
  email: {
    available: false,
    status: "unavailable",
    provider: "brevo",
    reasonCode: "NOTIFICATION_EMAIL_PROVIDER_UNAVAILABLE",
  },
  push: {
    available: false,
    status: "unavailable",
    provider: "fcm",
    reasonCode: "PUSH_PROVIDER_UNAVAILABLE",
  },
} as const;

test("parses scoped audience catalog and explicit provider availability", () => {
  const parsed = parseNotificationOptions({
    audiences: {
      workspaces: [{ id: "org_alpha", name: "Alpha", workspaceType: "clinic" }],
      roles: ["doctor"],
      users: [
        {
          id: "usr_doctor",
          workspaceId: "org_alpha",
          name: "Bác sĩ A",
          email: "a@example.test",
          role: "doctor",
        },
      ],
    },
    channels,
  });
  assert.equal(parsed.audiences.workspaces[0].id, "org_alpha");
  assert.equal(parsed.channels.email.available, false);
  assert.equal(parsed.channels.push.status, "unavailable");
});

test("rejects an options payload that hides provider state", () => {
  assert.throws(
    () =>
      parseNotificationOptions({
        audiences: { workspaces: [], roles: [], users: [] },
        channels: { in_app: channels.in_app, email: {}, push: channels.push },
      }),
    /email/,
  );
});

test("accepts only an exact campaign and per-recipient delivery receipt", () => {
  const receipt = parseNotificationCampaignReceipt(
    {
      campaign: {
        id: "campaign_1",
        operationId: "campaign_1",
        organizationId: "org_alpha",
        audience: intent.audience,
        requestedChannels: intent.channels,
        recipientCount: 1,
        notificationIds: ["notification_1"],
        channelSummary: {
          in_app: { ready: 1 },
          email: { unavailable: 1 },
          push: { unavailable: 1 },
        },
        status: "partial",
        createdAt: "2026-07-23T08:00:00.000Z",
      },
      notifications: [
        {
          id: "notification_1",
          userId: "usr_doctor",
          organizationId: "org_alpha",
          campaignId: "campaign_1",
          requestedChannels: intent.channels,
          inAppStatus: "ready",
          emailStatus: "unavailable",
          pushStatus: "unavailable",
        },
      ],
      idempotent: false,
      channelAvailability: channels,
    },
    intent,
  );
  assert.equal(receipt.campaign.recipientCount, 1);
  assert.equal(receipt.notifications[0].emailStatus, "unavailable");
});

test("rejects partial or mismatched campaign success responses", () => {
  assert.throws(
    () =>
      parseNotificationCampaignReceipt(
        {
          campaign: {
            id: "campaign_1",
            operationId: "campaign_1",
            organizationId: "org_alpha",
            audience: intent.audience,
            requestedChannels: intent.channels,
            recipientCount: 2,
            notificationIds: ["notification_1"],
            channelSummary: {},
            status: "ready",
            createdAt: "2026-07-23T08:00:00.000Z",
          },
          notifications: [],
          idempotent: false,
          channelAvailability: channels,
        },
        intent,
      ),
    /recipientCount/,
  );
});

test("keeps one idempotency attempt for the same intent and rotates after edits", () => {
  const first = resolveNotificationCampaignAttempt(null, intent);
  const retry = resolveNotificationCampaignAttempt(first, intent);
  const changed = resolveNotificationCampaignAttempt(first, {
    ...intent,
    message: "Nội dung khác",
  });
  assert.equal(retry, first);
  assert.notEqual(changed.idempotencyKey, first.idempotencyKey);
  assert.equal(first.fingerprint, notificationCampaignFingerprint(intent));
});
