import { describe, expect, it } from "vitest";
import {
  createRoleRequestIdempotencyKey,
  parseRoleRequestReceipt,
  type RoleRequestIntent,
} from "../../src/lib/role-request-contract";

const doctorIntent: RoleRequestIntent = {
  requestedRole: "doctor",
  accountType: "doctor",
  workspaceType: "clinic",
  organizationId: "workspace-a",
};

function receipt() {
  return {
    user: {
      id: "user-a",
      role: "patient",
      requestedRole: "doctor",
      roleRequestStatus: "pending",
      roleRequestedAt: "2026-07-29T12:00:00.000Z",
      accountStatus: "active",
      accountType: "doctor",
      workspaceType: "clinic",
      organizationId: "workspace-a",
    },
    roleRequest: {
      requestedRole: "doctor",
      status: "pending",
      requestedAt: "2026-07-29T12:00:00.000Z",
    },
    operationId: "role-request-operation-a",
    replayed: false,
  };
}

describe("role request contract", () => {
  it("creates a fresh stable-format operation key for a caller to retain", () => {
    const first = createRoleRequestIdempotencyKey();
    const second = createRoleRequestIdempotencyKey();

    expect(first).toMatch(/^web-role-request-[A-Za-z0-9-]+$/);
    expect(second).not.toBe(first);
  });

  it("accepts only an exact account-bound lifecycle receipt", () => {
    expect(
      parseRoleRequestReceipt(receipt(), doctorIntent, "user-a"),
    ).toMatchObject({
      user: {
        id: "user-a",
        requestedRole: "doctor",
        roleRequestStatus: "pending",
      },
      operationId: "role-request-operation-a",
      replayed: false,
    });
  });

  it.each([
    ["wrong owner", { user: { ...receipt().user, id: "user-b" } }],
    [
      "wrong lifecycle",
      {
        user: { ...receipt().user, roleRequestStatus: "approved" },
        roleRequest: { ...receipt().roleRequest, status: "approved" },
      },
    ],
    ["wrong model", { user: { ...receipt().user, workspaceType: "personal" } }],
    [
      "wrong workspace target",
      { user: { ...receipt().user, organizationId: "workspace-b" } },
    ],
    ["missing operation", { operationId: "" }],
    ["missing replay flag", { replayed: undefined }],
    ["extra top-level field", { provider: "firebase" }],
    [
      "extra lifecycle field",
      {
        roleRequest: {
          ...receipt().roleRequest,
          reviewer: "platform-admin",
        },
      },
    ],
    [
      "locked account",
      { user: { ...receipt().user, accountStatus: "locked" } },
    ],
    [
      "mismatched lifecycle timestamp",
      {
        user: {
          ...receipt().user,
          roleRequestedAt: "2026-07-29T12:00:01.000Z",
        },
      },
    ],
    [
      "invalid lifecycle timestamp",
      {
        user: { ...receipt().user, roleRequestedAt: "not-a-date" },
        roleRequest: {
          ...receipt().roleRequest,
          requestedAt: "not-a-date",
        },
      },
    ],
    [
      "timestamp without an RFC3339 offset",
      {
        user: {
          ...receipt().user,
          roleRequestedAt: "2026-07-29T12:00:00",
        },
        roleRequest: {
          ...receipt().roleRequest,
          requestedAt: "2026-07-29T12:00:00",
        },
      },
    ],
    [
      "timestamp with a non-RFC3339 separator",
      {
        user: {
          ...receipt().user,
          roleRequestedAt: "2026-07-29 12:00:00Z",
        },
        roleRequest: {
          ...receipt().roleRequest,
          requestedAt: "2026-07-29 12:00:00Z",
        },
      },
    ],
    [
      "impossible RFC3339 calendar date",
      {
        user: {
          ...receipt().user,
          roleRequestedAt: "2026-02-30T12:00:00Z",
        },
        roleRequest: {
          ...receipt().roleRequest,
          requestedAt: "2026-02-30T12:00:00Z",
        },
      },
    ],
    [
      "unexpected effective role",
      { user: { ...receipt().user, role: "doctor" } },
    ],
  ])("rejects %s", (_label, patch) => {
    const candidate = {
      ...receipt(),
      ...patch,
    };
    expect(() =>
      parseRoleRequestReceipt(candidate, doctorIntent, "user-a"),
    ).toThrow();
  });
});
