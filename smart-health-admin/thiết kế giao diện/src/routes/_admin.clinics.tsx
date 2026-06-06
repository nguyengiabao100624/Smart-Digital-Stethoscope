import { createFileRoute } from "@tanstack/react-router";
import { Clinics } from "@/components/admin/Clinics";

export const Route = createFileRoute("/_admin/clinics")({
  head: () => ({ meta: [{ title: "Phòng khám — Smart Health" }] }),
  component: Clinics,
});
