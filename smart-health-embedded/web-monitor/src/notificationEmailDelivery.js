"use strict";

const RESERVED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "localhost",
]);

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isDeliverableNotificationEmailAddress(value) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (!domain || RESERVED_EMAIL_DOMAINS.has(domain)) return false;
  return ![".test", ".invalid", ".example", ".localhost"].some((suffix) =>
    domain.endsWith(suffix),
  );
}

function buildBrevoEventReportUrl(apiUrl, messageId) {
  const endpoint = new URL(String(apiUrl || "https://api.brevo.com/v3/smtp/email"));
  endpoint.pathname = "/v3/smtp/statistics/events";
  endpoint.search = "";
  endpoint.searchParams.set("messageId", String(messageId || ""));
  endpoint.searchParams.set("days", "1");
  endpoint.searchParams.set("limit", "50");
  endpoint.searchParams.set("sort", "desc");
  return endpoint.toString();
}

function normalizeBrevoEvent(value) {
  return String(value || "")
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function eventRank(event) {
  if (["opened", "unique_opened", "click", "delivered"].includes(event)) return 50;
  if (["hard_bounce", "blocked", "invalid", "invalid_email", "spam"].includes(event)) return 40;
  if (["soft_bounce"].includes(event)) return 35;
  if (["deferred"].includes(event)) return 20;
  if (["request", "requests", "sent"].includes(event)) return 10;
  return 0;
}

function resolveBrevoDeliveryPatch(events) {
  const candidates = (Array.isArray(events) ? events : [])
    .map((item) => ({
      event: normalizeBrevoEvent(item?.event),
      reason: String(item?.reason || item?.message || "").trim().slice(0, 500),
    }))
    .filter((item) => item.event);
  if (candidates.length === 0) return null;

  const selected = candidates.reduce((best, candidate) =>
    eventRank(candidate.event) > eventRank(best.event) ? candidate : best,
  );
  const event = selected.event;
  if (["opened", "unique_opened", "click", "delivered"].includes(event)) {
    return {
      emailStatus: "delivered",
      deliveryStatus: "delivered",
      emailErrorMessage: "",
    };
  }
  if (["hard_bounce", "blocked", "invalid", "invalid_email", "spam"].includes(event)) {
    const status = event === "invalid_email" || event === "invalid" ? "invalid" : event;
    return {
      emailStatus: status,
      deliveryStatus: status,
      emailErrorMessage: selected.reason || `BREVO_${status.toUpperCase()}`,
    };
  }
  if (event === "soft_bounce") {
    return {
      emailStatus: "soft_bounce",
      deliveryStatus: "soft_bounce",
      emailErrorMessage: selected.reason || "BREVO_SOFT_BOUNCE",
    };
  }
  if (event === "deferred") {
    return {
      emailStatus: "deferred",
      deliveryStatus: "deferred",
      emailErrorMessage: selected.reason,
    };
  }
  return {
    emailStatus: "sent",
    deliveryStatus: "sent",
    emailErrorMessage: "",
  };
}

const FAILURE_STATUSES = new Set([
  "blocked",
  "disabled",
  "failed",
  "hard_bounce",
  "invalid",
  "no_devices",
  "no_recipient",
  "skipped",
  "soft_bounce",
  "spam",
  "unavailable",
]);

function summarizeNotificationCampaignDelivery(notifications, requestedChannels) {
  const rows = Array.isArray(notifications) ? notifications : [];
  const channels = Array.isArray(requestedChannels) ? requestedChannels : [];
  const summarize = (field) => {
    const counts = {};
    for (const notification of rows) {
      const status = String(notification?.[field] || "skipped");
      counts[status] = Number(counts[status] || 0) + 1;
    }
    return counts;
  };
  const channelSummary = {
    in_app: summarize("inAppStatus"),
    email: summarize("emailStatus"),
    push: summarize("pushStatus"),
  };
  const statuses = rows.flatMap((notification) =>
    channels.map((channel) =>
      channel === "in_app"
        ? String(notification?.inAppStatus || "skipped")
        : channel === "email"
          ? String(notification?.emailStatus || "skipped")
          : String(notification?.pushStatus || "skipped"),
    ),
  );
  const hasFailure = statuses.some((status) => FAILURE_STATUSES.has(status));
  const hasPending = rows.some((notification) =>
    channels.some((channel) => {
      const status =
        channel === "in_app"
          ? String(notification?.inAppStatus || "skipped")
          : channel === "email"
            ? String(notification?.emailStatus || "skipped")
            : String(notification?.pushStatus || "skipped");
      if (channel === "in_app") return false;
      return ["ready", "deferred"].includes(status) || (channel === "email" && status === "sent");
    }),
  );
  const hasSuccess = rows.some((notification) =>
    channels.some((channel) => {
      const status =
        channel === "in_app"
          ? String(notification?.inAppStatus || "skipped")
          : channel === "email"
            ? String(notification?.emailStatus || "skipped")
            : String(notification?.pushStatus || "skipped");
      return channel === "in_app"
        ? ["ready", "sent", "delivered"].includes(status)
        : channel === "email"
          ? status === "delivered"
          : ["sent", "delivered"].includes(status);
    }),
  );
  const status = hasPending
    ? hasFailure
      ? "partial"
      : "pending"
    : hasFailure
      ? hasSuccess
        ? "partial"
        : "failed"
      : "delivered";
  return { channelSummary, status };
}

module.exports = {
  buildBrevoEventReportUrl,
  isDeliverableNotificationEmailAddress,
  resolveBrevoDeliveryPatch,
  summarizeNotificationCampaignDelivery,
};
