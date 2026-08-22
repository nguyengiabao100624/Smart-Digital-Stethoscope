import { describe, expect, it } from "vitest";

import {
  inspectRoleRequestDocument,
  parseRoleRequestDocumentReceipt,
} from "../../src/lib/role-request-document-contract";

describe("role request document contract", () => {
  it("derives a stable key from exact file identity and changes it for new bytes", async () => {
    const first = await inspectRoleRequestDocument(
      new File(["A"], "license.pdf", { type: "application/pdf" }),
    );
    const replay = await inspectRoleRequestDocument(
      new File(["A"], "license.pdf", { type: "application/pdf" }),
    );
    const changed = await inspectRoleRequestDocument(
      new File(["B"], "license.pdf", { type: "application/pdf" }),
    );

    expect(replay).toEqual(first);
    expect(first.idempotencyKey).toMatch(/^web-role-document-v1-[a-f0-9]{64}$/);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(changed.sha256).not.toBe(first.sha256);
  });

  it("rejects a receipt owned by another account", async () => {
    const identity = await inspectRoleRequestDocument(
      new File(["A"], "license.pdf", { type: "application/pdf" }),
    );
    const response = {
      document: {
        id: "document-a",
        userId: "user-other",
        organizationId: "workspace-a",
        name: identity.name,
        contentType: identity.contentType,
        byteSize: identity.byteSize,
        sha256: identity.sha256,
        uploadedAt: "2026-08-01T12:00:00.000Z",
      },
      operationId: "operation-a",
      replayed: false,
    };

    expect(() =>
      parseRoleRequestDocumentReceipt(response, {
        userId: "user-a",
        organizationId: "workspace-a",
        identity,
      }),
    ).toThrow(/không khớp chủ sở hữu/);
  });

  it("requires the caller to bind every receipt to one canonical workspace", async () => {
    const identity = await inspectRoleRequestDocument(
      new File(["A"], "license.pdf", { type: "application/pdf" }),
    );
    const response = {
      document: {
        id: "document-a",
        userId: "user-a",
        organizationId: "workspace-other",
        name: identity.name,
        contentType: identity.contentType,
        byteSize: identity.byteSize,
        sha256: identity.sha256,
        uploadedAt: "2026-08-01T12:00:00.000Z",
      },
      operationId: "operation-a",
      replayed: false,
    };

    expect(() =>
      parseRoleRequestDocumentReceipt(response, {
        userId: "user-a",
        organizationId: "",
        identity,
      }),
    ).toThrow(/không khớp chủ sở hữu/);
  });

  it("rejects a non-existent RFC3339 calendar date", async () => {
    const identity = await inspectRoleRequestDocument(
      new File(["A"], "license.pdf", { type: "application/pdf" }),
    );
    const response = {
      document: {
        id: "document-a",
        userId: "user-a",
        organizationId: "workspace-a",
        name: identity.name,
        contentType: identity.contentType,
        byteSize: identity.byteSize,
        sha256: identity.sha256,
        uploadedAt: "2026-02-31T12:00:00.000Z",
      },
      operationId: "operation-a",
      replayed: false,
    };

    expect(() =>
      parseRoleRequestDocumentReceipt(response, {
        userId: "user-a",
        organizationId: "workspace-a",
        identity,
      }),
    ).toThrow(/không khớp chủ sở hữu/);
  });
});
