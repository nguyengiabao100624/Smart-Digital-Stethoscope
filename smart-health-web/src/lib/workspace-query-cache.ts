import type { QueryFilters } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

const ACCOUNT_QUERY_ROOTS = new Set(["me", "auth-sessions"]);

export function isWorkspaceSensitivePortalQueryKey(
  queryKey: readonly unknown[],
) {
  if (queryKey[0] !== "portal" || typeof queryKey[1] !== "string") {
    return false;
  }
  return !ACCOUNT_QUERY_ROOTS.has(queryKey[1]);
}

export async function isolatePortalWorkspaceQueries(queryClient: QueryClient) {
  const predicate: NonNullable<QueryFilters["predicate"]> = (query) =>
    isWorkspaceSensitivePortalQueryKey(query.queryKey);

  await queryClient.cancelQueries({ predicate }, { silent: true });
  await queryClient.invalidateQueries({ predicate, refetchType: "none" });
  queryClient.removeQueries({ predicate });
}

export function portalWorkspaceQueryKey(
  workspaceId: string,
  ...scope: readonly unknown[]
) {
  return ["portal", "workspace", workspaceId, ...scope] as const;
}
