import { createFileRoute } from "@tanstack/react-router";
import { Login } from "@/components/admin/Login";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Đăng nhập — Smart Health Admin" }] }),
  component: Login,
});
