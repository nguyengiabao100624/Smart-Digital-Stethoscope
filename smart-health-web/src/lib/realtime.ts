export interface RealtimeConnection {
  url: string;
  protocols: string[];
}

const WEBSOCKET_PROTOCOL_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function buildRealtimeConnection(
  apiBase: string,
  bearerToken: string,
): RealtimeConnection {
  const url = new URL(apiBase);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Realtime API base must use HTTP or HTTPS.");
  }

  const token = bearerToken.trim();
  if (token && !WEBSOCKET_PROTOCOL_TOKEN.test(token)) {
    throw new Error(
      "Bearer token cannot be represented safely as a WebSocket subprotocol.",
    );
  }

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/app";
  url.search = "";
  url.hash = "";

  return {
    url: url.toString().replace(/\/$/, ""),
    protocols: [
      "shcare.realtime.v1",
      ...(token ? [`shcare.bearer.${token}`] : []),
    ],
  };
}
