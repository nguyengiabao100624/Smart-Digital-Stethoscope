import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import brandCss from "../../../packages/shcare-brand/tokens.css?url";
import faviconUrl from "../../../packages/shcare-brand/assets/shcare-favicon.svg?url";
import ogImageUrl from "../../../packages/shcare-brand/assets/shcare-og.svg?url";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { THEME_INIT_SCRIPT } from "../lib/theme";
import { ThemeToggle } from "../components/ThemeToggle";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Không tìm thấy trang</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trang bạn cần có thể đã được di chuyển hoặc không còn tồn tại.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Không thể tải trang
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hệ thống gặp lỗi khi tải nội dung. Bạn có thể thử lại hoặc quay về trang chủ.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Thử lại
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Về trang chủ
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Shcare — Nền tảng Smart Health Care theo dõi tim phổi từ xa" },
      {
        name: "description",
        content:
          "Shcare kết nối thiết bị, hồ sơ lượt đo và workspace lâm sàng để hỗ trợ theo dõi tim phổi từ xa.",
      },
      { name: "author", content: "Shcare" },
      { property: "og:title", content: "Shcare — Smart Health Care" },
      {
        property: "og:description",
        content:
          "Nền tảng Smart Health Care theo dõi tim phổi từ xa.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Shcare" },
      { property: "og:url", content: "https://shcare.web.app/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Shcare — Smart Health Care" },
      {
        name: "twitter:description",
        content:
          "Nền tảng Smart Health Care theo dõi tim phổi từ xa.",
      },
      {
        property: "og:image",
        content: `https://shcare.web.app${ogImageUrl}`,
      },
      {
        name: "twitter:image",
        content: `https://shcare.web.app${ogImageUrl}`,
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Shcare",
              alternateName: "Shcare — Smart Health Care",
              url: "https://shcare.web.app",
              logo: `https://shcare.web.app${faviconUrl}`,
            },
            {
              "@type": "WebSite",
              name: "Shcare",
              url: "https://shcare.web.app",
              inLanguage: "vi-VN",
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: faviconUrl },
      {
        rel: "stylesheet",
        href: brandCss,
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <ThemeToggle />
    </QueryClientProvider>
  );
}
