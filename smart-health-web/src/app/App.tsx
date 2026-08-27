import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { useEffect, useState } from "react";
import { createAppRouter } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "sonner";

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [router, setRouter] = useState<ReturnType<typeof createAppRouter> | null>(null);
  const [toasterTheme, setToasterTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.resolvedTheme === "dark"
      ? "dark"
      : "light",
  );

  useEffect(() => {
    setRouter(createAppRouter());
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => {
      setToasterTheme(root.dataset.resolvedTheme === "dark" ? "dark" : "light");
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-resolved-theme"],
    });
    syncTheme();
    return () => observer.disconnect();
  }, []);

  if (!router) return <div data-client-app-placeholder />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster theme={toasterTheme} position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
