import { describe, expect, it, vi } from "vitest";

import { resolveClinicalWorkflowIntent } from "../../src/lib/clinical-workflow-intent";

describe("clinical workflow idempotency intent", () => {
  it("replays the same key for the same payload regardless of object key order", () => {
    const createId = vi.fn().mockReturnValue("first-id");
    const first = resolveClinicalWorkflowIntent(
      null,
      "review-scan-1",
      { decision: "accepted", note: "", expectedVersion: 1 },
      createId,
    );
    const replay = resolveClinicalWorkflowIntent(
      first,
      "review-scan-1",
      { expectedVersion: 1, note: "", decision: "accepted" },
      createId,
    );

    expect(replay).toBe(first);
    expect(createId).toHaveBeenCalledOnce();
  });

  it("creates a new key when note, action, or expectedVersion changes", () => {
    const createId = vi.fn().mockReturnValueOnce("one").mockReturnValueOnce("two");
    const first = resolveClinicalWorkflowIntent(
      null,
      "alert-resolve-alert-1",
      { action: "resolve", note: "First", expectedVersion: 1 },
      createId,
    );
    const changed = resolveClinicalWorkflowIntent(
      first,
      "alert-resolve-alert-1",
      { action: "resolve", note: "Updated", expectedVersion: 1 },
      createId,
    );

    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(changed.idempotencyKey).toContain("two");
  });
});
