import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  hasFirebaseWebConfig,
  isProductionAuthMode,
  onFirebaseAuthStateChange,
  signInWithFirebaseEmail,
  signOutFirebase,
} from "../../lib/firebase-client";
import {
  smartHealthApi,
  type ApiUser,
  type WorkspaceMembership,
} from "../../lib/smart-health-api";

export type UserRole =
  | "doctor"
  | "workspace_admin"
  | "workspace_owner"
  | "nurse"
  | "technician"
  | "billing"
  | "viewer"
  | string;

export interface Workspace {
  id: string;
  name: string;
  type: string;
  role: UserRole;
  patientCount: number;
  deviceOnline: number;
  alertCount: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  capabilities: string[];
  allowedSurfaces: string[];
  accountStatus?: string;
  roleRequestStatus?: string;
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  raw: ApiUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  switchRole: (_role: UserRole) => void;
}

function workspaceFromMembership(
  member: WorkspaceMembership,
  user: ApiUser,
): Workspace {
  const id =
    member.workspaceId ||
    member.organizationId ||
    user.currentWorkspaceId ||
    user.organizationId ||
    "";
  const current = user.currentWorkspace || user.workspace;
  return {
    id,
    name:
      member.workspaceName ||
      (current?.id === id ? current.name : "") ||
      id ||
      "Workspace",
    type:
      member.workspaceType ||
      (current?.id === id ? current.workspaceType || current.type : "") ||
      "clinic",
    role: member.role || user.role || "viewer",
    patientCount: 0,
    deviceOnline: 0,
    alertCount: 0,
  };
}

function mapUser(raw: ApiUser): AuthUser {
  const memberships = raw.memberships?.length
    ? raw.memberships
    : [
        {
          organizationId: raw.organizationId,
          workspaceId: raw.currentWorkspaceId,
          role: raw.role,
          workspaceName: raw.currentWorkspace?.name,
          workspaceType: raw.currentWorkspace?.workspaceType,
        },
      ];
  const workspaces = memberships
    .map((membership) => workspaceFromMembership(membership, raw))
    .filter((workspace) => workspace.id);
  const currentId =
    raw.currentWorkspaceId || raw.organizationId || workspaces[0]?.id || "";
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === currentId) ||
    workspaceFromMembership(
      {
        workspaceId: currentId,
        role: raw.currentMembership?.role || raw.role,
        workspaceName: raw.currentWorkspace?.name,
        workspaceType: raw.currentWorkspace?.workspaceType,
      },
      raw,
    );
  return {
    id: raw.id,
    name: raw.name || raw.email || "Người dùng Smart Health",
    email: raw.email || "",
    role: raw.currentMembership?.role || raw.role || "viewer",
    avatar: raw.avatarUrl,
    capabilities: raw.capabilities || [],
    allowedSurfaces: raw.allowedSurfaces || [],
    accountStatus: raw.accountStatus,
    roleRequestStatus: raw.roleRequestStatus,
    currentWorkspace,
    workspaces: workspaces.length ? workspaces : [currentWorkspace],
    raw,
  };
}

function getPortalAccessError(user: AuthUser) {
  const allowedSurfaces = user.allowedSurfaces || [];
  const defaultSurface = user.raw.defaultSurface || "";
  if (allowedSurfaces.includes("portal")) return "";

  if (user.roleRequestStatus === "pending") {
    return "role_request_pending";
  }
  if (user.roleRequestStatus === "needs_info") {
    return "role_request_needs_info";
  }
  if (user.roleRequestStatus === "rejected") {
    return "role_request_rejected";
  }
  if (defaultSurface === "admin" || allowedSurfaces.includes("admin")) {
    return "wrong_surface_admin";
  }
  if (defaultSurface === "android" || allowedSurfaces.includes("android")) {
    return "wrong_surface_android";
  }
  return "portal_access_denied";
}

function isOnboardingAccessError(error: string) {
  return [
    "role_request_pending",
    "role_request_needs_info",
    "role_request_rejected",
  ].includes(error);
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    if (!smartHealthApi.hasToken()) {
      setUser(null);
      return null;
    }
    const result = await smartHealthApi.me();
    const next = mapUser(result.user);
    setUser(next);
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    if (isProductionAuthMode() && hasFirebaseWebConfig()) {
      const unsubscribe = onFirebaseAuthStateChange(async (firebaseUser) => {
        try {
          if (!firebaseUser) {
            smartHealthApi.clearToken();
            if (!cancelled) setUser(null);
            return;
          }
          const token = await firebaseUser.getIdToken();
          const result = await smartHealthApi.authenticateFirebase(token);
          const next = mapUser(result.user);
          const accessError = getPortalAccessError(next);
          if (accessError && !isOnboardingAccessError(accessError)) {
            smartHealthApi.clearToken();
            await signOutFirebase().catch(() => undefined);
            if (!cancelled) setUser(null);
            return;
          }
          if (!cancelled) setUser(next);
        } catch {
          smartHealthApi.clearToken();
          if (!cancelled) setUser(null);
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      });
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }
    refreshUser()
      .catch(() => setUser(null))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const result =
        isProductionAuthMode() && hasFirebaseWebConfig()
          ? await smartHealthApi.authenticateFirebase(
              await signInWithFirebaseEmail(email, password),
            )
          : await smartHealthApi.login(email, password);
      const next = mapUser(result.user);
      const accessError = getPortalAccessError(next);
      if (accessError) {
        if (isOnboardingAccessError(accessError)) {
          setUser(next);
          return { success: false, error: accessError };
        }
        await smartHealthApi.logout();
        if (isProductionAuthMode() && hasFirebaseWebConfig())
          await signOutFirebase();
        return { success: false, error: accessError };
      }
      setUser(next);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Đăng nhập thất bại.",
      };
    }
  };

  const logout = async () => {
    await smartHealthApi.logout().catch(() => undefined);
    if (isProductionAuthMode() && hasFirebaseWebConfig())
      await signOutFirebase().catch(() => undefined);
    setUser(null);
  };

  const switchWorkspace = async (workspaceId: string) => {
    const result = await smartHealthApi.updateMe({
      organizationId: workspaceId,
    });
    setUser(mapUser(result.user));
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
      refreshUser,
      switchWorkspace,
      switchRole: () => undefined,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
