import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/components/admin/ThemeProvider";
import { useAdminTheme } from "@/components/admin/theme-context";
import { Toaster } from "@/components/ui/sonner";
import { IS_PORTAL_SURFACE, WEB_SURFACE_DESCRIPTION, WEB_SURFACE_TITLE } from "@/lib/surface";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

import brandCss from "../../../../packages/shcare-brand/tokens.css?url";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Không tìm thấy trang</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Đường dẫn này không tồn tại hoặc đã được di chuyển trong{" "}
          {IS_PORTAL_SURFACE ? "Shcare Web Portal" : "cổng quản trị"}.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Về tổng quan
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: WEB_SURFACE_TITLE },
      { name: "description", content: WEB_SURFACE_DESCRIPTION },
      { name: "author", content: "Shcare" },
      { property: "og:title", content: WEB_SURFACE_TITLE },
      {
        property: "og:description",
        content: WEB_SURFACE_DESCRIPTION,
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
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
});

function RootShell({ children }: { children: React.ReactNode }) {
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

function ThemedToaster() {
  const { resolvedTheme } = useAdminTheme();
  return <Toaster position="top-right" theme={resolvedTheme} />;
}

function RootComponent() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <Outlet />
        <ThemedToaster />
      </ThemeProvider>
    </MotionConfig>
  );
}
