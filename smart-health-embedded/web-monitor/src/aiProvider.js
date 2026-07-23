"use strict";

function readEnvString(value, maxLength = 500) {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, maxLength);
}

function isAllowedProviderEndpoint(endpoint, nodeEnv) {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    if (url.username || url.password) return false;
    if ([...url.searchParams.keys()].some((key) => /key|token|secret|credential|password/i.test(key))) return false;
    if (url.hash) return false;
    if (url.protocol === "https:") return true;
    const isLocal = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
    return nodeEnv !== "production" && url.protocol === "http:" && isLocal;
  } catch {
    return false;
  }
}

function getAiProviderAvailability(env = process.env) {
  const endpoint = readEnvString(env.AI_PROVIDER_ENDPOINT, 2000);
  const apiKey = readEnvString(env.AI_PROVIDER_API_KEY, 4000);
  const model = readEnvString(env.AI_PROVIDER_MODEL, 160);
  const provider = readEnvString(env.AI_PROVIDER_NAME, 80) || "openai_compatible";
  const configured = Boolean(endpoint && apiKey && model);
  const validEndpoint = isAllowedProviderEndpoint(endpoint, readEnvString(env.NODE_ENV, 40).toLowerCase());
  const available = configured && validEndpoint;
  return {
    available,
    status: available ? "available" : "unavailable",
    provider,
    model: available ? model : "",
    reason: available ? "" : configured ? "invalid_configuration" : "not_configured",
  };
}

function aiProviderError(statusCode, code, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function getProviderTimeoutMs(env) {
  const configured = Number(env.AI_PROVIDER_TIMEOUT_MS || 15000);
  if (!Number.isFinite(configured)) return 15000;
  return Math.min(30000, Math.max(100, Math.round(configured)));
}

function normalizeProviderMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && ["system", "user", "assistant"].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: readEnvString(message.content, 8000),
    }))
    .filter((message) => message.content)
    .slice(-40);
}

async function readBoundedProviderResponse(response, maxBytes = 1024 * 1024) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("provider response exceeded limit");
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
      await reader.cancel();
      throw new Error("provider response exceeded limit");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function requestAiChat(messages, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const availability = getAiProviderAvailability(env);
  if (!availability.available || typeof fetchImpl !== "function") {
    throw aiProviderError(
      503,
      "AI_PROVIDER_UNAVAILABLE",
      "AI provider is not configured",
      { availability },
    );
  }
  const providerMessages = normalizeProviderMessages(messages);
  if (!providerMessages.some((message) => message.role === "user")) {
    throw aiProviderError(400, "AI_MESSAGE_REQUIRED", "A user message is required");
  }

  const controller = new AbortController();
  const timeoutMs = getProviderTimeoutMs(env);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(readEnvString(env.AI_PROVIDER_ENDPOINT, 2000), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readEnvString(env.AI_PROVIDER_API_KEY, 4000)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: availability.model,
        messages: providerMessages,
        stream: false,
      }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.body && typeof response.body.cancel === "function") {
        await response.body.cancel().catch(() => {});
      }
      throw aiProviderError(
        502,
        "AI_PROVIDER_REQUEST_FAILED",
        "AI provider rejected the request",
        { availability, providerStatus: response.status },
      );
    }
    const raw = await readBoundedProviderResponse(response);
    let parsed;
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch {
      throw aiProviderError(
        502,
        "AI_PROVIDER_INVALID_RESPONSE",
        "AI provider returned invalid JSON",
        { availability },
      );
    }
    const content = readEnvString(parsed?.choices?.[0]?.message?.content || parsed?.output_text, 8000);
    if (!content) {
      throw aiProviderError(
        502,
        "AI_PROVIDER_INVALID_RESPONSE",
        "AI provider returned no assistant message",
        { availability },
      );
    }
    return { content, availability };
  } catch (error) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      throw aiProviderError(
        504,
        "AI_PROVIDER_TIMEOUT",
        "AI provider request timed out",
        { availability, timeoutMs },
      );
    }
    if (error?.statusCode) throw error;
    throw aiProviderError(
      502,
      "AI_PROVIDER_REQUEST_FAILED",
      "AI provider request failed",
      { availability },
    );
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  getAiProviderAvailability,
  requestAiChat,
};
