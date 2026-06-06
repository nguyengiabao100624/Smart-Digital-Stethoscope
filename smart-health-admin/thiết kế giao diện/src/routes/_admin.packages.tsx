import { createFileRoute } from "@tanstack/react-router";
import { Packages } from "@/components/admin/Packages";

export const Route = createFileRoute("/_admin/packages")({
  head: () => ({ meta: [{ title: "Gói dịch vụ — Smart Health" }] }),
  component: Packages,
});
