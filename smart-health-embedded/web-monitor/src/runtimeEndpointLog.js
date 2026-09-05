"use strict";

function normalizePublicHttpBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return "";
    if (url.username || url.password) return "";

    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function toWebSocketEndpoint(baseUrl, route) {
  const normalized = normalizePublicHttpBaseUrl(baseUrl);
  if (!normalized) return "";
  const url = new URL(normalized);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${String(route || "").replace(/^\/+/, "")}`;
  return url.toString();
}

function buildRuntimeEndpointLogLines({
  production,
  publicBackendUrl,
  port,
  audioUdpPort,
  localUrls = [],
}) {
  if (production) {
    const publicBaseUrl = normalizePublicHttpBaseUrl(publicBackendUrl);
    if (!publicBaseUrl) {
      return [
        "Public endpoint: managed by the hosting provider",
        "Realtime device transport: authenticated WSS",
        "UDP audio fallback: development-only and not advertised to production devices",
      ];
    }

    return [
      `Public backend: ${publicBaseUrl}`,
      `App WebSocket: ${toWebSocketEndpoint(publicBaseUrl, "/app")}`,
      `ESP WebSocket: ${toWebSocketEndpoint(publicBaseUrl, "/esp")}`,
      "UDP audio fallback: development-only and not advertised to production devices",
    ];
  }

  return [
    ...localUrls.map((url) => `Open ${url}`),
    `App WebSocket: ws://<this-computer-ip>:${port}/app`,
    `ESP WebSocket firmware should connect to ws://<this-computer-ip>:${port}/esp`,
    `UDP firmware should send PCM16 audio to <this-computer-ip>:${audioUdpPort}`,
  ];
}

module.exports = {
  buildRuntimeEndpointLogLines,
  normalizePublicHttpBaseUrl,
  toWebSocketEndpoint,
};
