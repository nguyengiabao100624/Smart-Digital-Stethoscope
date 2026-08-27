import { createFileRoute } from "@tanstack/react-router";
import { AIMeasurements } from "@/components/admin/AIMeasurements";

export const Route = createFileRoute("/_admin/ai-measurements")({
  head: () => ({ meta: [{ title: "Lượt đo & tín hiệu — Shcare" }] }),
  component: AIMeasurements,
});
