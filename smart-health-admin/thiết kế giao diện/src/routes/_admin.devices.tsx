import { createFileRoute } from "@tanstack/react-router";
import { Devices } from "@/components/admin/Devices";

export const Route = createFileRoute("/_admin/devices")({
  head: () => ({ meta: [{ title: "Thiết bị — Shcare" }] }),
  component: Devices,
});
