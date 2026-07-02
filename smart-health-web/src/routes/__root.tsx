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

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeToggle } from "../components/ThemeToggle";

const themeInitScript = `(function(){try{var t=localStorage.getItem('shcare-theme')||localStorage.getItem('lovable-theme');if(t!=='light'&&t!=='dark')t='light';var r=document.documentElement;if(t==='dark')r.classList.add('dark');else r.classList.remove('dark');r.dataset.theme=t;r.style.colorScheme=t;localStorage.setItem('shcare-theme',t);localStorage.removeItem('lovable-theme');}catch(e){document.documentElement.classList.remove('dark');}})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
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
      { title: "Smart Health Care | Nền tảng HealthTech AI" },
      {
        name: "description",
        content:
          "Theo dõi sức khỏe tim phổi từ xa với thiết bị thông minh, AI phân tích và cổng quản lý bảo mật cho bác sĩ, phòng khám.",
      },
      { name: "author", content: "Smart Health Care" },
      { property: "og:title", content: "Smart Health Care | Nền tảng HealthTech AI" },
      {
        property: "og:description",
        content:
          "Theo dõi sức khỏe tim phổi từ xa với thiết bị thông minh, AI phân tích và cổng quản lý bảo mật cho bác sĩ, phòng khám.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Smart Health Care" },
      { property: "og:url", content: "https://shcare.web.app/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Smart Health Care | Nền tảng HealthTech AI" },
      {
        name: "twitter:description",
        content:
          "Theo dõi sức khỏe tim phổi từ xa với thiết bị thông minh, AI phân tích và cổng quản lý bảo mật cho bác sĩ, phòng khám.",
      },
      {
        property: "og:image",
        content: "https://shcare.web.app/og-image.png",
      },
      {
        name: "twitter:image",
        content: "https://shcare.web.app/og-image.png",
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
              name: "Smart Health Care",
              alternateName: "Shcare",
              url: "https://shcare.web.app",
              logo: "https://shcare.web.app/favicon.ico",
            },
            {
              "@type": "WebSite",
              name: "Smart Health Care",
              url: "https://shcare.web.app",
              inLanguage: "vi-VN",
            },
          ],
        }),
      },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..900&family=Nunito+Sans:ital,wght@0,300..900;1,300..900&family=Outfit:wght@400..900&display=swap",
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
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
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
