import { describe, expect, it } from "vitest";

import {
  validateClinicalAlertAction,
  validateReviewDecision,
} from "../../src/lib/clinical-workflow-validation";

describe("clinical workflow validation", () => {
  it("allows accepted review without a note", () => {
    expect(validateReviewDecision("accepted", "")).toBe("");
  });

  it.each(["repeat_measurement", "follow_up_required"] as const)(
    "requires a note for %s review decisions",
    (decision) => {
      expect(validateReviewDecision(decision, "   ")).not.toBe("");
      expect(validateReviewDecision(decision, "Đã ghi rõ hướng xử lý")).toBe("");
    },
  );

  it("requires a note only when resolving an alert", () => {
    expect(validateClinicalAlertAction("acknowledge", "")).toBe("");
    expect(validateClinicalAlertAction("resolve", "   ")).not.toBe("");
    expect(validateClinicalAlertAction("resolve", "Đã liên hệ bệnh nhân")).toBe("");
  });
});
