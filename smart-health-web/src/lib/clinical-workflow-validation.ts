import type { ReviewDecision } from "./smart-health-api";

export type ClinicalAlertAction = "acknowledge" | "resolve";

export function validateReviewDecision(
  decision: ReviewDecision,
  note: string,
): string {
  if (decision === "accepted" || note.trim()) return "";

  return decision === "repeat_measurement"
    ? "Cần ghi lý do để bệnh nhân thực hiện đo lại."
    : "Cần ghi nội dung theo dõi tiếp theo.";
}

export function validateClinicalAlertAction(
  action: ClinicalAlertAction,
  note: string,
): string {
  if (action === "acknowledge" || note.trim()) return "";
  return "Cần ghi nội dung xử lý trước khi đóng cảnh báo.";
}
