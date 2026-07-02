import { createFileRoute } from "@tanstack/react-router";
import ClientApp from "@/components/ClientApp";

export const Route = createFileRoute("/$")({
  component: SplatRoute,
});

function SplatRoute() {
  return <ClientApp />;
}
