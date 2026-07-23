import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: HeadersInit = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("smartHealthApi audit and export contract", () => {
  const artifactSha256 = "a".repeat(64);

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "audit-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sends audit filters to the server and preserves canonical pagination", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          logs: [
            {
              id: "audit-1",
              actorUserId: "user-1",
              actorName: "Bác sĩ An",
              actorRole: "doctor",
              organizationId: "workspace-1",
              organizationName: "Phòng khám An Tâm",
              action: "scan.review",
              resourceType: "scan",
              resourceId: "scan-1",
              outcome: "success",
              ip: "127.0.0.1",
              userAgent: "Browser",
              metadata: { decision: "accepted" },
              createdAt: "2026-07-23T10:00:00.000Z",
            },
          ],
          pagination: {
            page: 2,
            limit: 20,
            total: 41,
            pageCount: 3,
            hasNextPage: true,
            sort: "createdAt:desc",
          },
        },
        200,
        {
          "X-Page": "2",
          "X-Page-Limit": "20",
          "X-Total-Count": "41",
        },
      ),
    );

    const result = await smartHealthApi.listAuditLogs({
      q: "scan",
      action: "scan.review",
      resourceType: "scan",
      actorUserId: "user-1",
      startDate: "2026-07-01",
      endDate: "2026-07-23",
      page: 2,
      limit: 20,
      sort: "createdAt:desc",
    });

    const requestUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/api/portal/audit-log");
    expect(Object.fromEntries(requestUrl.searchParams)).toMatchObject({
      q: "scan",
      action: "scan.review",
      resourceType: "scan",
      actorUserId: "user-1",
      startDate: "2026-07-01",
      endDate: "2026-07-23",
      page: "2",
      limit: "20",
      sort: "createdAt:desc",
    });
    expect(result.logs[0]).toMatchObject({
      id: "audit-1",
      actorUserId: "user-1",
      outcome: "success",
      resourceType: "scan",
    });
    expect(result.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 41,
      pageCount: 3,
      hasNextPage: true,
      sort: "createdAt:desc",
    });
  });

  it("creates an idempotent export then returns the verified binary response metadata", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          {
            export: {
              id: "export-1",
              organizationId: "workspace-1",
              workspaceId: "workspace-1",
              createdByUserId: "user-1",
              format: "csv",
              dataset: "audit_logs",
              scopeKind: "workspace",
              status: "ready",
              recordCount: 12,
              downloadUrl: "/api/v1/exports/download/export-1",
              artifactSha256,
              rendererVersion: "shcare.export-artifact.v1",
              createdAt: "2026-07-23T10:00:00.000Z",
            },
            replayed: false,
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        new Response("created_at,action\n2026-07-23,scan.review", {
          status: 200,
          headers: {
            "Content-Type": "text/csv;charset=utf-8",
            "Content-Disposition":
              'attachment; filename="shcare-audit-export-1.csv"',
            "X-Shcare-Artifact-SHA256": artifactSha256,
            "X-Shcare-Renderer-Version": "shcare.export-artifact.v1",
          },
        }),
      );

    const created = await smartHealthApi.createExport(
      {
        format: "csv",
        dataset: "audit_logs",
        filters: {
          q: "scan",
          resourceType: "scan",
          startDate: "2026-07-01",
          endDate: "2026-07-23",
        },
      },
      "portal-audit-export-intent-1",
    );
    const download = await smartHealthApi.downloadExport(created.export.id);

    const [createUrl, createInit] = vi.mocked(fetch).mock.calls[0];
    expect(String(createUrl)).toBe("http://localhost:3000/api/v1/exports");
    expect(createInit?.method).toBe("POST");
    expect(new Headers(createInit?.headers).get("Idempotency-Key")).toBe(
      "portal-audit-export-intent-1",
    );
    expect(JSON.parse(String(createInit?.body))).toEqual({
      format: "csv",
      dataset: "audit_logs",
      filters: {
        q: "scan",
        resourceType: "scan",
        startDate: "2026-07-01",
        endDate: "2026-07-23",
      },
    });
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toBe(
      "http://localhost:3000/api/v1/exports/download/export-1",
    );
    expect(download.fileName).toBe("shcare-audit-export-1.csv");
    expect(download.contentType).toContain("text/csv");
    expect(download.artifactSha256).toBe(artifactSha256);
    expect(download.rendererVersion).toBe("shcare.export-artifact.v1");
    expect(await download.blob.text()).toContain("scan.review");
  });

  it("rejects a create receipt that is not ready or has no canonical artifact id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          export: {
            id: "",
            format: "csv",
            dataset: "audit_logs",
            status: "pending",
            rendererVersion: "shcare.export-artifact.v1",
            recordCount: 0,
            downloadUrl: "/api/v1/exports/download/",
          },
          replayed: false,
        },
        201,
      ),
    );

    await expect(
      smartHealthApi.createExport(
        { format: "csv", dataset: "audit_logs" },
        "portal-audit-export-invalid-receipt",
      ),
    ).rejects.toMatchObject({
      code: "EXPORT_CREATE_RESPONSE_INVALID",
      status: 502,
    });
  });

  it("rejects a platform-scoped artifact at the Portal API boundary", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          export: {
            id: "export-platform",
            organizationId: "workspace-1",
            workspaceId: "workspace-1",
            createdByUserId: "platform-user",
            format: "csv",
            dataset: "audit_logs",
            scopeKind: "platform",
            status: "ready",
            recordCount: 2,
            artifactSha256,
            rendererVersion: "shcare.export-artifact.v1",
            downloadUrl: "/api/v1/exports/download/export-platform",
            createdAt: "2026-07-23T10:00:00.000Z",
          },
          replayed: false,
        },
        201,
      ),
    );

    await expect(
      smartHealthApi.createExport(
        { format: "csv", dataset: "audit_logs" },
        "portal-platform-export-denied",
      ),
    ).rejects.toMatchObject({
      code: "EXPORT_CREATE_RESPONSE_INVALID",
      status: 502,
    });
  });

  it("rejects empty or unverifiable artifact downloads", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response("", {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="empty.csv"',
            "X-Shcare-Artifact-SHA256": artifactSha256,
            "X-Shcare-Renderer-Version": "shcare.export-artifact.v1",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response("audit", {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": 'attachment; filename="unverified.csv"',
            "X-Shcare-Renderer-Version": "shcare.export-artifact.v1",
          },
        }),
      );

    await expect(
      smartHealthApi.downloadExport("export-empty"),
    ).rejects.toMatchObject({ code: "EXPORT_ARTIFACT_EMPTY", status: 502 });
    await expect(
      smartHealthApi.downloadExport("export-unverified"),
    ).rejects.toMatchObject({
      code: "EXPORT_ARTIFACT_IDENTITY_INVALID",
      status: 502,
    });
  });
});
