import { createFileRoute } from "@tanstack/react-router";
import { AdminAccounts } from "@/components/admin/AdminAccounts";

export const Route = createFileRoute("/_admin/admin-accounts")({
  head: () => ({ meta: [{ title: "Tài khoản admin — Smart Health" }] }),
  component: AdminAccounts,
});
