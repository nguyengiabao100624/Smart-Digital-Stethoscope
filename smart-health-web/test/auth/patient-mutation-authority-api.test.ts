import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  smartHealthApi,
} from "../../src/lib/smart-health-api";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("personal patient mutation authority", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "patient-bearer-a");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves only the current backend session and binds all three mutation methods", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          sessions: [
            { id: "auth-session-old", current: false },
            { id: "auth-session-current", current: true },
          ],
        }),
      )
      .mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));

    const resolved = await smartHealthApi.resolvePatientMutationAuthority(
      "user-patient",
      "workspace-personal",
    );
    expect(resolved).toEqual({
      expectedUserId: "user-patient",
      expectedWorkspaceId: "workspace-personal",
      expectedAuthSessionId: "auth-session-current",
      authSessionEpoch: smartHealthApi.getAuthSessionEpochSnapshot(),
    });

    await smartHealthApi.createPatient({ name: "Dependent" }, "create-key", resolved);
    await smartHealthApi.updatePatient(
      "patient-dependent",
      { name: "Updated" },
      "update-key",
      resolved,
    );
    await smartHealthApi.deletePatient("patient-dependent", "delete-key", resolved);

    const mutationCalls = vi.mocked(fetch).mock.calls.slice(1);
    expect(mutationCalls).toHaveLength(3);
    for (const [, init] of mutationCalls) {
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Shcare-Expected-User-Id")).toBe(resolved.expectedUserId);
      expect(headers.get("X-Shcare-Expected-Workspace-Id")).toBe(
        resolved.expectedWorkspaceId,
      );
      expect(headers.get("X-Shcare-Expected-Auth-Session-Id")).toBe(
        resolved.expectedAuthSessionId,
      );
    }
  });

  it("rejects a session lookup whose bearer was replaced before mutation dispatch", async () => {
    let finishLookup: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishLookup = resolve;
        }),
    );

    const lookup = smartHealthApi.resolvePatientMutationAuthority(
      "user-patient",
      "workspace-personal",
    );
    window.localStorage.setItem("smart_health_token", "patient-bearer-b");
    finishLookup?.(
      jsonResponse({
        sessions: [{ id: "auth-session-current", current: true }],
      }),
    );

    await expect(lookup).rejects.toMatchObject({
      status: 409,
      code: "AUTH_SESSION_REPLACED",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an absent current session before sending a mutation", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ sessions: [{ id: "auth-session-old", current: false }] }),
    );

    await expect(
      smartHealthApi.resolvePatientMutationAuthority(
        "user-patient",
        "workspace-personal",
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "PATIENT_MUTATION_AUTHORITY_INVALID",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
