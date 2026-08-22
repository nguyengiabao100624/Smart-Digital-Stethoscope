import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function overviewPayload(workspaceId = "workspace-1") {
  return {
    generatedAt: "2026-07-29T03:00:00.000Z",
    workspaceId,
    range: {
      key: "today",
      label: "Hôm nay",
      startAt: "2026-07-28T17:00:00.000Z",
      endAt: "2026-07-29T03:00:00.000Z",
      timezoneOffsetMinutes: 420,
      bucket: "4h",
    },
    stats: {
      clinics: 1,
      workspaces: 1,
      patientsCount: 3,
      pendingDoctors: 0,
      devicesCount: 2,
      devicesOnline: 1,
      scansCount: 4,
      aiJobsFailed: 1,
      storageBytes: 2048,
      storageUsed: "0 MB",
    },
    measureData: [
      { time: "00:00", count: 1 },
      { time: "04:00", count: 1 },
      { time: "08:00", count: 2 },
    ],
    deviceData: [
      { key: "online", name: "Đang hoạt động", value: 1, color: "#18794E" },
      { key: "offline", name: "Mất kết nối", value: 1, color: "#D8E3EA" },
    ],
    aiJobData: [
      { key: "processing", name: "Đang xử lý", value: 1, color: "#2563A6" },
      { key: "completed", name: "Hoàn tất", value: 2, color: "#18794E" },
      { key: "failed", name: "Thất bại", value: 1, color: "#B4233A" },
      { key: "pending", name: "Chờ xử lý", value: 0, color: "#A15C00" },
    ],
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi portal overview contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "dashboard-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses canonical v1 with an explicit local range and returns the backend snapshot", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(overviewPayload()));

    const result = await smartHealthApi.overview("workspace-1", {
      range: "today",
      timezoneOffsetMinutes: 420,
    });

    const requestUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/api/v1/portal/overview");
    expect(requestUrl.searchParams.get("range")).toBe("today");
    expect(requestUrl.searchParams.get("timezoneOffsetMinutes")).toBe("420");
    expect(result.workspaceId).toBe("workspace-1");
    expect(result.stats.scansCount).toBe(4);
  });

  it("fails closed when the overview belongs to another workspace", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(overviewPayload("workspace-other")),
    );

    await expect(
      smartHealthApi.overview("workspace-1", {
        range: "today",
        timezoneOffsetMinutes: 420,
      }),
    ).rejects.toMatchObject({
      code: "OVERVIEW_RESPONSE_WORKSPACE_MISMATCH",
    });
  });

  it("rejects missing or contradictory KPI values instead of converting them to zero", async () => {
    const payload = overviewPayload();
    delete (payload.stats as Partial<typeof payload.stats>).devicesCount;
    payload.deviceData[0].value = 4;

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

    await expect(
      smartHealthApi.overview("workspace-1", {
        range: "today",
        timezoneOffsetMinutes: 420,
      }),
    ).rejects.toMatchObject({
      code: "OVERVIEW_RESPONSE_INVALID",
    });
  });
});
