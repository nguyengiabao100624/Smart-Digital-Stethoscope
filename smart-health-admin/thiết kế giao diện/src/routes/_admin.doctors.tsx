import { createFileRoute } from "@tanstack/react-router";
import { Doctors } from "@/components/admin/Doctors";

export const Route = createFileRoute("/_admin/doctors")({
  head: () => ({ meta: [{ title: "Bác sĩ — Smart Health" }] }),
  component: Doctors,
});
