import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://shcare.web.app";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/san-pham", changefreq: "monthly", priority: "0.9" },
  { path: "/san-pham/ong-nghe-thong-minh", changefreq: "monthly", priority: "0.8" },
  { path: "/san-pham/theo-doi-tu-xa", changefreq: "monthly", priority: "0.8" },
  { path: "/san-pham/ho-so-luot-do", changefreq: "monthly", priority: "0.7" },
  { path: "/giai-phap", changefreq: "monthly", priority: "0.8" },
  { path: "/giai-phap/bac-si-ca-nhan", changefreq: "monthly", priority: "0.8" },
  { path: "/giai-phap/phong-kham", changefreq: "monthly", priority: "0.8" },
  { path: "/giai-phap/benh-nhan-tai-nha", changefreq: "monthly", priority: "0.8" },
  { path: "/bang-gia", changefreq: "monthly", priority: "0.9" },
  { path: "/lien-he", changefreq: "yearly", priority: "0.6" },
  { path: "/tai-nguyen", changefreq: "monthly", priority: "0.7" },
  { path: "/tai-nguyen/faq", changefreq: "monthly", priority: "0.6" },
  { path: "/tai-nguyen/kien-thuc-rpm", changefreq: "monthly", priority: "0.7" },
  { path: "/bao-mat", changefreq: "yearly", priority: "0.6" },
  { path: "/bao-mat-consent", changefreq: "yearly", priority: "0.5" },
  { path: "/chinh-sach-bao-mat", changefreq: "yearly", priority: "0.4" },
  { path: "/dieu-khoan", changefreq: "yearly", priority: "0.4" },
  { path: "/phap-ly", changefreq: "yearly", priority: "0.4" },
];

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
