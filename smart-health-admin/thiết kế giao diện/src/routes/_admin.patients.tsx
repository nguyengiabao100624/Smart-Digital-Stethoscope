import { createFileRoute } from "@tanstack/react-router";
import { Patients } from "@/components/admin/Patients";

export const Route = createFileRoute("/_admin/patients")({
  head: () => ({ meta: [{ title: "Bệnh nhân — Shcare" }] }),
  component: Patients,
});
