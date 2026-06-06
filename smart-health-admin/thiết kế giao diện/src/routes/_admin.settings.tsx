import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "@/components/admin/Settings";

export const Route = createFileRoute("/_admin/settings")({
  head: () => ({ meta: [{ title: "Cài đặt hệ thống — Smart Health" }] }),
  component: Settings,
});
