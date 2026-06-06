import { createFileRoute } from "@tanstack/react-router";
import { AdminActions } from "@/components/admin/AdminActions";

export const Route = createFileRoute("/_admin/admin-actions")({
  head: () => ({ meta: [{ title: "Hành động quản trị — Smart Health" }] }),
  component: AdminActions,
});
