import React, { createContext, useContext, useMemo } from "react";
import type { SmartHealthAuthUser } from "@/lib/smart-health-api";

type AdminAccessContextValue = {
  currentUser: SmartHealthAuthUser | null;
  accessCheckComplete: boolean;
  isPlatformAdmin: boolean;
  capabilities: string[];
  hasCapability: (capability: string) => boolean;
  hasAnyCapability: (capabilities: readonly string[]) => boolean;
};

const AdminAccessContext = createContext<AdminAccessContextValue>({
  currentUser: null,
  accessCheckComplete: false,
  isPlatformAdmin: false,
  capabilities: [],
  hasCapability: () => false,
  hasAnyCapability: () => false,
});

export function userHasAnyCapability(
  user: SmartHealthAuthUser | null,
  capabilities: readonly string[],
) {
  if (capabilities.length === 0) return true;
  if (!user) return false;
  if (user.role === "admin") return true;

  const userCapabilities = user.capabilities || [];
  if (userCapabilities.length === 0) {
    return false;
  }

  const capabilitySet = new Set(userCapabilities);
  return capabilities.some((capability) => capabilitySet.has(capability));
}

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
      isPlatformAdmin: currentUser?.role === "admin" || capabilities.includes("platform.dashboard.view"),
      capabilities,
      hasCapability: (capability) => userHasAnyCapability(currentUser, [capability]),
      hasAnyCapability: (requiredCapabilities) =>
        userHasAnyCapability(currentUser, requiredCapabilities),
    };
  }, [accessCheckComplete, currentUser]);

  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess() {
  return useContext(AdminAccessContext);
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
