import React, { useMemo } from "react";
import type { SmartHealthAuthUser } from "@/lib/smart-health-api";
import {
  AdminAccessContext,
  userHasAnyCapability,
  type AdminAccessContextValue,
} from "./admin-access-context";
import { useAdminAccess } from "./useAdminAccess";

export function AdminAccessProvider({
  currentUser,
  accessCheckComplete,
  children,
}: {
  currentUser: SmartHealthAuthUser | null;
  accessCheckComplete: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo<AdminAccessContextValue>(() => {
    const capabilities = currentUser?.capabilities || [];
    return {
      currentUser,
      accessCheckComplete,
      isPlatformAdmin:
        currentUser?.role === "admin" || capabilities.includes("platform.dashboard.view"),
      capabilities,
      hasCapability: (capability) => userHasAnyCapability(currentUser, [capability]),
      hasAnyCapability: (requiredCapabilities) =>
        userHasAnyCapability(currentUser, requiredCapabilities),
    };
  }, [accessCheckComplete, currentUser]);

  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function CapabilityGate({
  capabilities,
  fallback = null,
  children,
}: {
  capabilities: readonly string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { accessCheckComplete, hasAnyCapability } = useAdminAccess();
  if (!accessCheckComplete) return null;
  if (!hasAnyCapability(capabilities)) return <>{fallback}</>;
  return <>{children}</>;
}
