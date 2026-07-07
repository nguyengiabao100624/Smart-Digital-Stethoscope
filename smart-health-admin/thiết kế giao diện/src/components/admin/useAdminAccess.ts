import { useContext } from "react";
import { AdminAccessContext } from "./admin-access-context";

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}
