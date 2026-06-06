import { createFileRoute } from "@tanstack/react-router";
import { Notifications } from "@/components/admin/Notifications";

export const Route = createFileRoute("/_admin/notifications")({
  head: () => ({ meta: [{ title: "Thông báo — Smart Health" }] }),
  component: Notifications,
});
