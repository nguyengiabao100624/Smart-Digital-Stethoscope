import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/components/admin/Layout";

export const Route = createFileRoute("/_admin")({
  component: Layout,
});
