import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { smartHealthApi } from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("smartHealthApi role request contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("smart_health_token", "firebase-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the caller-owned idempotency key and exact intent", async () => {
    const payload = {
      requestedRole: "doctor",
      accountType: "doctor",
      workspaceType: "clinic",
      name: "Bác sĩ A",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: "user-a",
          role: "patient",
          requestedRole: "doctor",
          roleRequestStatus: "pending",
          accountType: "doctor",
          workspaceType: "clinic",
          organizationId: "workspace-a",
        },
        roleRequest: {
          requestedRole: "doctor",
          status: "pending",
          requestedAt: "2026-07-29T12:00:00.000Z",
        },
        operationId: "operation-a",
        replayed: false,
      }),
    );

    await smartHealthApi.requestRole(payload, "role-request-key-a");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("http://localhost:3000/api/v1/auth/role-request");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "role-request-key-a",
    );
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  });

  it("rejects a blank key before any network request", async () => {
    await expect(
      smartHealthApi.requestRole(
        {
          requestedRole: "doctor",
          accountType: "doctor",
          workspaceType: "clinic",
        },
        " ",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a caller-owned idempotency key for role-request documents", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        document: {
          id: "document-a",
          userId: "user-a",
          organizationId: "workspace-a",
          name: "license.pdf",
          contentType: "application/pdf",
          byteSize: 1,
          sha256: "a".repeat(64),
          uploadedAt: "2026-08-01T12:00:00.000Z",
        },
        operationId: "operation-a",
        replayed: false,
      }),
    );
    const file = new File(["A"], "license.pdf", { type: "application/pdf" });

    await smartHealthApi.uploadRoleRequestDocument(file, "document-key-a");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/auth/role-request-document",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      "document-key-a",
    );
    expect(init?.body).toBe(file);
  });

  it("rejects a blank document key before any network request", async () => {
    const file = new File(["A"], "license.pdf", { type: "application/pdf" });
    await expect(
      smartHealthApi.uploadRoleRequestDocument(file, " "),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
