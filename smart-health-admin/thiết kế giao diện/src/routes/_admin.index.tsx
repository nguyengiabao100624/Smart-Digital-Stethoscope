import { createFileRoute } from "@tanstack/react-router";
import { Overview } from "@/components/admin/Overview";

export const Route = createFileRoute("/_admin/")({
  head: () => ({ meta: [{ title: "Tổng quan — Shcare Platform Admin" }] }),
  component: Overview,
});
