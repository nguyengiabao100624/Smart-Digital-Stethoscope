import { createFileRoute } from "@tanstack/react-router";
import { Storage } from "@/components/admin/Storage";

export const Route = createFileRoute("/_admin/storage")({
  head: () => ({ meta: [{ title: "Lưu trữ — Smart Health Admin" }] }),
  component: Storage,
});
