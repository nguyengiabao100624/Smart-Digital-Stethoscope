const backendBaseUrl = String(
  process.env.SHCARE_HIL_BACKEND_URL || "http://127.0.0.1:3765",
).replace(/\/+$/, "");
const deviceId = String(process.env.SHCARE_HIL_DEVICE_ID || "").trim();
const timeoutMs = Number(process.env.SHCARE_HIL_TIMEOUT_MS || 90_000);

if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/.test(deviceId)) {
  throw new Error("SHCARE_HIL_DEVICE_ID must be a canonical device id");
}
if (!Number.isFinite(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 300_000) {
  throw new Error("SHCARE_HIL_TIMEOUT_MS must be between 10000 and 300000");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${backendBaseUrl}${pathname}`, {
    ...options,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} ${pathname} returned HTTP ${response.status} ${JSON.stringify(body)}`,
    );
  }
  return { response, body };
}

async function poll(label, operation, predicate, limitMs = timeoutMs) {
  const deadline = Date.now() + limitMs;
  let lastValue = null;
  while (Date.now() < deadline) {
    lastValue = await operation();
    if (predicate(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} timed out; last value=${JSON.stringify(lastValue)}`);
}

const login = await requestJson("/api/v1/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "platform.hil@shcare.local", password: "12345678" }),
});
const token = String(login.body.token || "");
if (!token) throw new Error("HIL admin login returned no bearer token");
const authorization = { Authorization: `Bearer ${token}` };

const onlineDevice = await poll(
  "authenticated device online",
  async () => (await requestJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}`,
    { headers: authorization },
  )).body.device,
  (device) => device?.online === true && device?.telemetry?.connectionMethod === "wss",
);

const commandResult = await requestJson(
  `/api/v1/devices/${encodeURIComponent(deviceId)}/commands`,
  {
    method: "POST",
    headers: {
      ...authorization,
      "Content-Type": "application/json",
      "Idempotency-Key": `hil-wifi-status-${Date.now()}`,
    },
    body: JSON.stringify({ type: "wifi.status", payload: {} }),
  },
);
const commandId = String(commandResult.body.command?.id || "");
if (!commandId) throw new Error("wifi.status returned no command id");
const appliedCommand = await poll(
  "device command applied ACK",
  async () => (await requestJson(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(commandId)}`,
    { headers: authorization },
  )).body.command,
  (command) => command?.state === "applied",
);

const started = await requestJson("/api/v1/scans/start", {
  method: "POST",
  headers: {
    ...authorization,
    "Content-Type": "application/json",
    "Idempotency-Key": `hil-scan-start-${Date.now()}`,
  },
  body: JSON.stringify({ patientId: "pat_hil", deviceId, mode: "heart" }),
});
const scanId = String(started.body.scan?.id || "");
if (!scanId) throw new Error("scan start returned no scan id");
const recordingScan = await poll(
  "authenticated audio-v2 recording",
  async () => (await requestJson(`/api/v1/scans/${encodeURIComponent(scanId)}`, {
    headers: authorization,
  })).body.scan,
  (scan) => scan?.status === "recording" && Number(scan?.sampleCount || 0) >= 128,
);

const stopped = await requestJson(`/api/v1/scans/${encodeURIComponent(scanId)}/stop`, {
  method: "POST",
  headers: {
    ...authorization,
    "Idempotency-Key": `hil-scan-stop-${Date.now()}`,
  },
});
const completedScan = await poll(
  "durable scan completion",
  async () => (await requestJson(`/api/v1/scans/${encodeURIComponent(scanId)}`, {
    headers: authorization,
  })).body.scan,
  (scan) => scan?.status === "completed",
);

process.stdout.write(`${JSON.stringify({
  status: "PASS",
  deviceId,
  authenticatedTransport: onlineDevice.telemetry?.connectionMethod || "wss",
  command: {
    id: commandId,
    state: appliedCommand.state,
    code: appliedCommand.code,
  },
  scan: {
    id: scanId,
    startStatus: recordingScan.status,
    finalStatus: completedScan.status,
    sampleCount: Number(completedScan.sampleCount || recordingScan.sampleCount || 0),
    droppedPackets: Number(completedScan.droppedPackets || recordingScan.droppedPackets || 0),
    stopReceiptStatus: stopped.body.scan?.status || "",
  },
})}\n`);
