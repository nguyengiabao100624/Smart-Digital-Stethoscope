import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "@/components/admin/AccountSettings";

export const Route = createFileRoute("/_admin/account")({
  head: () => ({ meta: [{ title: "Tài khoản — Shcare" }] }),
  component: AccountSettings,
});
