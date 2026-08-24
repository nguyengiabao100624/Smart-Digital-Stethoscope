"use strict";

function readString(value, maxLength = 4000) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function outboundWebhookError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function parseAllowedOrigins(env = process.env) {
  return new Set(
    readString(env.OUTBOUND_WEBHOOK_ALLOWED_ORIGINS, 8000)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => {
        try {
          return new URL(value).origin.toLowerCase();
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

function validateOutboundWebhookTarget(rawUrl, options = {}) {
  const env = options.env || process.env;
  const tenantManaged = options.tenantManaged === true;
  let url;
  try {
    url = new URL(readString(rawUrl, 2000));
  } catch {
    throw outboundWebhookError(
      "OUTBOUND_WEBHOOK_DESTINATION_INVALID",
      "Outbound webhook URL is invalid",
    );
  }

  if (url.username || url.password || url.hash) {
    throw outboundWebhookError(
      "OUTBOUND_WEBHOOK_DESTINATION_INVALID",
      "Outbound webhook credentials and fragments are not allowed",
    );
  }
  const nodeEnv = readString(env.NODE_ENV, 40).toLowerCase();
  const localHttpAllowed =
    nodeEnv !== "production" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  if (url.protocol !== "https:" && !localHttpAllowed) {
    throw outboundWebhookError(
      "OUTBOUND_WEBHOOK_DESTINATION_INVALID",
      "Outbound webhook must use HTTPS",
    );
  }

  if (tenantManaged) {
    const allowedOrigins = parseAllowedOrigins(env);
    if (!allowedOrigins.has(url.origin.toLowerCase())) {
      throw outboundWebhookError(
        "OUTBOUND_WEBHOOK_DESTINATION_NOT_ALLOWED",
        "Workspace webhook destination is not approved by the platform",
        { origin: url.origin },
      );
    }
  }
  return url.toString();
}

function getOutboundWebhookTimeoutMs(env = process.env) {
  const configured = Number(env.OUTBOUND_WEBHOOK_TIMEOUT_MS || 8000);
  if (!Number.isFinite(configured)) return 8000;
  return Math.min(30000, Math.max(250, Math.round(configured)));
}

function getOutboundWebhookResponseLimit(env = process.env) {
  const configured = Number(env.OUTBOUND_WEBHOOK_MAX_RESPONSE_BYTES || 16 * 1024);
  if (!Number.isFinite(configured)) return 16 * 1024;
  return Math.min(64 * 1024, Math.max(1024, Math.round(configured)));
}

async function readBoundedResponseText(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw outboundWebhookError(
        "OUTBOUND_WEBHOOK_RESPONSE_TOO_LARGE",
        "Outbound webhook response exceeded the configured limit",
      );
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw outboundWebhookError(
        "OUTBOUND_WEBHOOK_RESPONSE_TOO_LARGE",
        "Outbound webhook response exceeded the configured limit",
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function postOutboundWebhook(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw outboundWebhookError(
      "OUTBOUND_WEBHOOK_UNAVAILABLE",
      "Outbound webhook transport is unavailable",
    );
  }
  const url = validateOutboundWebhookTarget(options.url, {
    env,
    tenantManaged: options.tenantManaged,
  });
  const timeoutMs = getOutboundWebhookTimeoutMs(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: options.headers || {},
      body: options.bodyText || "",
      redirect: "error",
      signal: controller.signal,
    });
    const responseText = await readBoundedResponseText(
      response,
      getOutboundWebhookResponseLimit(env),
    );
    return { response, responseText };
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw outboundWebhookError(
        "OUTBOUND_WEBHOOK_TIMEOUT",
        "Outbound webhook request timed out",
        { timeoutMs },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getOutboundWebhookResponseLimit,
  getOutboundWebhookTimeoutMs,
  parseAllowedOrigins,
  postOutboundWebhook,
  readBoundedResponseText,
  validateOutboundWebhookTarget,
};
