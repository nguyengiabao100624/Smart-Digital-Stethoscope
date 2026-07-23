import { describe, expect, it } from "vitest";

import {
  createWorkspaceRequestIdempotencyKey,
  parseWorkspaceRequestReceipt,
} from "../../src/lib/workspace-request-contract";

const intent = { name: "Phòng khám An Tâm", workspaceType: "clinic" };
const receipt = {
  workspace: {
    id: "org_antam",
    name: intent.name,
    workspaceType: intent.workspaceType,
    status: "pending",
    version: 3,
  },
  user: {
    id: "user_owner",
    role: "patient",
    requestedRole: "workspace_owner",
    roleRequestStatus: "pending",
    organizationId: "org_antam",
  },
  operationId: "workspace_request_operation_1",
  idempotent: false,
  notificationDelivery: "ready",
};

describe("workspace request contract", () => {
  it("accepts an exact canonical receipt", () => {
    expect(parseWorkspaceRequestReceipt(receipt, intent)).toEqual(receipt);
  });

  it("fails closed on stale versions, wrong identity state, or malformed delivery truth", () => {
    expect(() =>
      parseWorkspaceRequestReceipt(
        { ...receipt, workspace: { ...receipt.workspace, version: 0 } },
        intent,
      ),
    ).toThrow();
    expect(() =>
      parseWorkspaceRequestReceipt(
        {
          ...receipt,
          user: { ...receipt.user, roleRequestStatus: "approved" },
        },
        intent,
      ),
    ).toThrow();
    expect(() =>
      parseWorkspaceRequestReceipt(
        { ...receipt, notificationDelivery: "sent" },
        intent,
      ),
    ).toThrow();
  });

  it("creates operation-scoped keys without leaking the raw target", () => {
    const key = createWorkspaceRequestIdempotencyKey(
      "Owner+Clinic@Example.com",
    );
    expect(key).toMatch(/^web-workspace-request-/);
    expect(key).not.toContain("@");
    expect(key).not.toContain("owner");
  });
});
