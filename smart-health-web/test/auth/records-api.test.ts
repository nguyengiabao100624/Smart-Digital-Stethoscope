import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function scansResponse(
  scans: Array<{ id: string }>,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify({ scans }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("smartHealthApi records pagination contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "records-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends q/page/limit/sort and reads the authoritative total from headers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      scansResponse(
        [{ id: "scan-26" }],
        { "X-Page": "2", "X-Limit": "25", "X-Total-Count": "51" },
      ),
    );

    const result = await smartHealthApi.listScans({
      q: "Patient A",
      status: "completed",
      page: 2,
      limit: 25,
      sort: "createdAt:desc",
    });

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/portal/scans?q=Patient+A&status=completed&page=2&limit=25&sort=createdAt%3Adesc",
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 51,
      hasNextPage: true,
    });
  });

  it("keeps total unknown when legacy backend responses have no pagination headers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      scansResponse(
        Array.from({ length: 25 }, (_, index) => ({ id: `scan-${index}` })),
      ),
    );

    const result = await smartHealthApi.listScans({ page: 1, limit: 25 });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 25,
      total: null,
      hasNextPage: true,
    });
  });

  it("stops legacy pagination when a short page is returned without inventing a total", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      scansResponse([{ id: "scan-1" }, { id: "scan-2" }]),
    );

    const result = await smartHealthApi.listScans({ page: 3, limit: 25 });

    expect(result.pagination).toEqual({
      page: 3,
      limit: 25,
      total: null,
      hasNextPage: false,
    });
  });
});
