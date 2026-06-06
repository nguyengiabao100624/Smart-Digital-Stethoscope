import {
  Link as TLink,
  Outlet,
  useLocation,
  useNavigate as tNavigate,
} from "@tanstack/react-router";

// Re-export with relaxed types so ported components using string paths compile.
export const Link = TLink as unknown as React.ComponentType<
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean }
>;

export { Outlet, useLocation };

export function useNavigate() {
  const nav = tNavigate();
  return (to: string) => nav({ to: to as never });
}
