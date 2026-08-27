import { createFileRoute } from "@tanstack/react-router";
import { DoctorApproval } from "@/components/admin/DoctorApproval";

export const Route = createFileRoute("/_admin/doctor-approval")({
  head: () => ({ meta: [{ title: "Duyệt bác sĩ — Shcare" }] }),
  component: DoctorApproval,
});
