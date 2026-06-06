import { createFileRoute } from "@tanstack/react-router";
import { ForgotPassword } from "@/components/admin/ForgotPassword";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Quên mật khẩu — Smart Health" }] }),
  component: ForgotPassword,
});
