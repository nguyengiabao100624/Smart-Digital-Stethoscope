import { createContext, useContext } from "react";

export const PublicMotionContext = createContext(true);

export function usePublicMotionEnabled() {
  return useContext(PublicMotionContext);
}
