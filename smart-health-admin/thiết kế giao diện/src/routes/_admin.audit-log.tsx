import { createFileRoute } from "@tanstack/react-router";
import { AuditLog } from "@/components/admin/AuditLog";

export const Route = createFileRoute("/_admin/audit-log")({
  head: () => ({ meta: [{ title: "Audit log — Smart Health" }] }),
  component: AuditLog,
});
