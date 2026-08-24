import { createContext } from "react";
import type { SmartHealthAuthUser } from "@/lib/smart-health-api";

export type AdminAccessContextValue = {
  currentUser: SmartHealthAuthUser | null;
  accessCheckComplete: boolean;
  isPlatformAdmin: boolean;
  capabilities: string[];
  hasCapability: (capability: string) => boolean;
  hasAnyCapability: (capabilities: readonly string[]) => boolean;
};

export const AdminAccessContext = createContext<AdminAccessContextValue>({
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
  if (user.role === "admin" || user.role === "platform_admin") return true;

  const userCapabilities = user.capabilities || [];
  if (userCapabilities.length === 0) {
    return false;
  }

  const capabilitySet = new Set(userCapabilities);
  return capabilities.some((capability) => capabilitySet.has(capability));
}
