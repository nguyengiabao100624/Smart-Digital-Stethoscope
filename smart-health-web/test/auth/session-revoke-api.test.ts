import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAuthSessionRevokeIdempotencyKey,
  parseAuthSessionRevokeReceipt,
  type AuthSessionRevokeIntent,
} from "../../src/lib/auth-session-operations";
import { smartHealthApi } from "../../src/lib/smart-health-api";

const canonicalReceipt = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../packages/shcare-contracts/http/v1/fixtures/auth-session-revoke-response.json",
    ),
    "utf8",
  ),
) as Record<string, unknown>;

const intent: AuthSessionRevokeIntent = {
  userId: "user-1",
  sessionId: "session-remote-1",
  idempotencyKey: "session-revoke-user-1-session-remote-1-intent-1",
};

function fixtureForIntent() {
  const session = canonicalReceipt.session as Record<string, unknown>;
  return {
    ...canonicalReceipt,
    session: {
      ...session,
      id: intent.sessionId,
    },
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("auth session revoke receipt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("smart_health_token", "primary-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("accepts the shared canonical fixture for the same session owner", () => {
    expect(
      parseAuthSessionRevokeReceipt(fixtureForIntent(), intent, intent.userId),
    ).toEqual(fixtureForIntent());
  });

  it("sends the caller-owned idempotency key without submitting client authority", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(fixtureForIntent()));

    await expect(smartHealthApi.revokeSession(intent)).resolves.toEqual(
      fixtureForIntent(),
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:3000/api/v1/auth/sessions/session-remote-1/revoke",
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      intent.idempotencyKey,
    );
    expect(init?.body).toBeUndefined();
  });

  it.each([
    [
      "another session",
      () => ({
        ...fixtureForIntent(),
        session: {
          ...(fixtureForIntent().session as Record<string, unknown>),
          id: "session-other",
        },
      }),
    ],
    [
      "missing revoked",
      () => {
        const { revoked: _revoked, ...candidate } = fixtureForIntent();
        return candidate;
      },
    ],
    ["false revoked", () => ({ ...fixtureForIntent(), revoked: false })],
    [
      "non-date-time timestamp",
      () => ({
        ...fixtureForIntent(),
        session: { ...fixtureForIntent().session, createdAt: "2026-08-06" },
      }),
    ],
    [
      "impossible calendar date",
      () => ({
        ...fixtureForIntent(),
        session: { ...fixtureForIntent().session, createdAt: "2026-02-30T00:00:00Z" },
      }),
    ],
    [
      "overlong provider identity",
      () => ({
        ...fixtureForIntent(),
        session: { ...fixtureForIntent().session, provider: "p".repeat(81) },
      }),
    ],
    [
      "missing replayed",
      () => {
        const { replayed: _replayed, ...candidate } = fixtureForIntent();
        return candidate;
      },
    ],
  ])("rejects %s instead of confirming success", (_label, candidate) => {
    expect(() =>
      parseAuthSessionRevokeReceipt(candidate(), intent, intent.userId),
    ).toThrow(/biên nhận thu hồi phiên đăng nhập/i);
  });

  it("accepts a real leap-day RFC3339 timestamp", () => {
    const candidate = fixtureForIntent();
    candidate.session.createdAt = "2024-02-29T00:00:00+07:00";
    expect(parseAuthSessionRevokeReceipt(candidate, intent, intent.userId)).toEqual(candidate);
  });

  it("rejects a receipt after the authenticated owner changes", () => {
    expect(() =>
      parseAuthSessionRevokeReceipt(fixtureForIntent(), intent, "user-2"),
    ).toThrow(/tài khoản hiện tại/i);
  });

  it("rejects a blank operation key before sending a request", async () => {
    await expect(
      smartHealthApi.revokeSession({ ...intent, idempotencyKey: " " }),
    ).rejects.toThrow(/mã thao tác/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates an opaque operation key within the backend 160-character limit", () => {
    const key = createAuthSessionRevokeIdempotencyKey();

    expect(key).toMatch(/^session-revoke-/);
    expect(key.length).toBeLessThanOrEqual(160);
    expect(key).not.toContain(intent.userId);
    expect(key).not.toContain(intent.sessionId);
  });

  it("rejects an operation key longer than the backend contract", async () => {
    await expect(
      smartHealthApi.revokeSession({
        ...intent,
        idempotencyKey: "k".repeat(161),
      }),
    ).rejects.toThrow(/mã thao tác/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
