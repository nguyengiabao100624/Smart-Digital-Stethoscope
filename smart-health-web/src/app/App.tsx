import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { useEffect, useState } from "react";
import { createAppRouter } from "./routes";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "sonner";

export default function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [router, setRouter] = useState<ReturnType<typeof createAppRouter> | null>(null);

  useEffect(() => {
    setRouter(createAppRouter());
  }, []);

  if (!router) return <div data-client-app-placeholder />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}
