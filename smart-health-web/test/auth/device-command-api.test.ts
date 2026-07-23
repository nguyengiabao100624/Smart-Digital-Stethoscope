import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi device command contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a caller-owned idempotency key for a typed command", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        command: {
          protocolVersion: 1,
          id: "command-1",
          deviceId: "device-1",
          type: "restart",
          correlationId: "correlation-1",
          state: "delivered",
        },
        delivery: { websocket: true, mqtt: false, delivered: true },
      }, 202),
    );

    await smartHealthApi.sendDeviceCommand("device-1", {
      type: "restart",
      payload: {},
      idempotencyKey: "device-command-retry-key-1",
    });

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Idempotency-Key")).toBe(
      "device-command-retry-key-1",
    );
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      type: "restart",
      payload: {},
    });
  });

  it("passes an AbortSignal to command polling so unmounted screens can cancel it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ command: { id: "command-1", state: "applied" } }),
    );
    const controller = new AbortController();

    await smartHealthApi.getDeviceCommand(
      "device-1",
      "command-1",
      controller.signal,
    );

    const [, requestInit] = vi.mocked(fetch).mock.calls[0];
    expect(requestInit?.signal).toBe(controller.signal);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "/portal/devices/device-1/commands/command-1",
    );
  });
});
