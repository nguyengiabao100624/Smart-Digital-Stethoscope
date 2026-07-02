import { createFileRoute } from "@tanstack/react-router";
import ClientApp from "@/components/ClientApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shcare — Nền tảng theo dõi sức khỏe" },
      {
        name: "description",
        content:
          "Shcare giúp bác sĩ và phòng khám theo dõi bệnh nhân từ xa với thiết bị thông minh và bảng điều khiển trực quan.",
      },
      { property: "og:title", content: "Shcare — Nền tảng theo dõi sức khỏe" },
      {
        property: "og:description",
        content: "Theo dõi bệnh nhân từ xa với thiết bị thông minh và bảng điều khiển trực quan.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <ClientApp />;
}
