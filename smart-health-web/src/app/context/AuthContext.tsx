import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getCurrentFirebaseUid,
  hasFirebaseWebConfig,
  isProductionAuthMode,
  onFirebaseAuthStateChange,
  signInWithFirebaseEmail,
  signOutFirebase,
  signOutFirebaseIfUidMatches,
} from "../../lib/firebase-client";
import {
  smartHealthApi,
  type ApiError,
  type ApiUser,
  type TwoFactorChallengeDetails,
  type WorkspaceMembership,
} from "../../lib/smart-health-api";
import {
  resolveClinicalWorkflowIntent,
  type ClinicalWorkflowIntent,
} from "../../lib/clinical-workflow-intent";
import { isolatePortalWorkspaceQueries } from "../../lib/workspace-query-cache";

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
  patientCount: number | null;
  deviceOnline: number | null;
  alertCount: number | null;
  scanCount: number | null;
  operational: boolean;
  membershipStatus: string;
  workspaceStatus: string;
  metricsAvailable: boolean;
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
  currentWorkspaceId: string;
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  raw: ApiUser;
}

function toOptionalCount(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    }
  }
  return null;
}

export interface LogoutAuthority {
  userId: string;
  firebaseUid: string | null;
  authToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  identityUser: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  twoFactorChallenge: TwoFactorChallengeDetails | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  loginForStaffInvitation: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  completeTwoFactorLogin: (
    code: string,
  ) => Promise<{ success: boolean; error?: string }>;
  completeStaffInvitationTwoFactorLogin: (
    code: string,
  ) => Promise<{ success: boolean; error?: string }>;
  cancelTwoFactorLogin: () => Promise<void>;
  logout: (authority?: LogoutAuthority) => Promise<boolean>;
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
  const membershipStatus = String(member.status || "active").toLowerCase();
  const workspaceStatus = String(
    member.workspaceStatus ||
      (current?.id === id ? current.status : "") ||
      "active",
  ).toLowerCase();
  const operational =
    typeof member.operational === "boolean"
      ? member.operational
      : membershipStatus === "active" && workspaceStatus === "active";
  const patientCount = toOptionalCount(
    member.patientCount,
    member.patientsCount,
    current?.id === id ? current.patientCount : undefined,
    current?.id === id ? current.patientsCount : undefined,
  );
  const deviceOnline = toOptionalCount(
    member.deviceOnline,
    member.devicesOnline,
    current?.id === id ? current.deviceOnline : undefined,
    current?.id === id ? current.devicesOnline : undefined,
  );
  const alertCount = toOptionalCount(
    member.alertCount,
    member.alertsCount,
    current?.id === id ? current.alertCount : undefined,
    current?.id === id ? current.alertsCount : undefined,
  );
  const scanCount = toOptionalCount(
    member.scanCount,
    member.scansCount,
    current?.id === id ? current.scanCount : undefined,
    current?.id === id ? current.scansCount : undefined,
  );
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
    patientCount,
    deviceOnline,
    alertCount,
    scanCount,
    operational,
    membershipStatus,
    workspaceStatus,
    metricsAvailable:
      operational &&
      patientCount !== null &&
      deviceOnline !== null &&
      alertCount !== null,
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
    currentWorkspaceId: currentWorkspace.id,
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

function isStaffInvitationAcceptanceLocation() {
  return (
    typeof window !== "undefined" &&
    window.location.pathname === "/staff-invitations/accept"
  );
}

function readTwoFactorChallenge(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const apiError = error as ApiError;
  if (apiError.code !== "TWO_FACTOR_REQUIRED") return null;
  const details = apiError.details;
  if (!details || typeof details !== "object") return null;
  const candidate = details as Partial<TwoFactorChallengeDetails>;
  if (
    !candidate.challengeId ||
    candidate.method !== "app" ||
    !candidate.expiresAt
  ) {
    return null;
  }
  return candidate as TwoFactorChallengeDetails;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [identityUser, setIdentityUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [twoFactorChallenge, setTwoFactorChallenge] =
    useState<TwoFactorChallengeDetails | null>(null);
  const workspaceSwitchAttemptRef = useRef<ClinicalWorkflowIntent | null>(null);
  const firebaseAuthAttemptRef = useRef(0);
  const userRef = useRef<AuthUser | null>(user);
  const identityUserRef = useRef<AuthUser | null>(identityUser);
  userRef.current = user;
  identityUserRef.current = identityUser;

  const refreshUser = async () => {
    if (!smartHealthApi.hasToken()) {
      setUser(null);
      setIdentityUser(null);
      return null;
    }
    const result = await smartHealthApi.me();
    const next = mapUser(result.user);
    setIdentityUser(next);
    const accessError = getPortalAccessError(next);
    if (accessError && !isOnboardingAccessError(accessError)) {
      setUser(null);
      return null;
    }
    setUser(next);
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    if (isProductionAuthMode() && hasFirebaseWebConfig()) {
      const unsubscribe = onFirebaseAuthStateChange(async (firebaseUser) => {
        const attemptId = ++firebaseAuthAttemptRef.current;
        const initialBearer = smartHealthApi.getTokenSnapshot();
        let attemptBearer = initialBearer;
        const isLatestAttempt = () =>
          !cancelled && firebaseAuthAttemptRef.current === attemptId;

        try {
          if (!firebaseUser) {
            if (getCurrentFirebaseUid() !== null) return;
            if (initialBearer) {
              smartHealthApi.clearTokenIfMatches(initialBearer);
            }
            if (
              isLatestAttempt() &&
              getCurrentFirebaseUid() === null &&
              smartHealthApi.getTokenSnapshot() === ""
            ) {
              setTwoFactorChallenge(null);
              setUser(null);
              setIdentityUser(null);
            }
            return;
          }

          const firebaseUid = firebaseUser.uid;
          const token = await firebaseUser.getIdToken();
          attemptBearer = token;
          if (
            !isLatestAttempt() ||
            getCurrentFirebaseUid() !== firebaseUid
          ) {
            return;
          }
          const result = await smartHealthApi.authenticateFirebase(token);
          if (
            !isLatestAttempt() ||
            getCurrentFirebaseUid() !== firebaseUid ||
            smartHealthApi.getTokenSnapshot() !== token
          ) {
            smartHealthApi.clearTokenIfMatches(token);
            return;
          }

          const next = mapUser(result.user);
          setIdentityUser(next);
          const accessError = getPortalAccessError(next);
          if (accessError && !isOnboardingAccessError(accessError)) {
            if (isStaffInvitationAcceptanceLocation()) {
              setUser(null);
              return;
            }
            smartHealthApi.clearTokenIfMatches(token);
            const signedOut = await signOutFirebaseIfUidMatches(
              firebaseUid,
            ).catch(() => false);
            if (
              signedOut &&
              isLatestAttempt() &&
              getCurrentFirebaseUid() === null &&
              smartHealthApi.getTokenSnapshot() === ""
            ) {
              setUser(null);
              setIdentityUser(null);
            }
            return;
          }
          setUser(next);
        } catch (error) {
          const firebaseUid = firebaseUser?.uid || null;
          if (
            !isLatestAttempt() ||
            !firebaseUid ||
            getCurrentFirebaseUid() !== firebaseUid
          ) {
            return;
          }

          const challenge = readTwoFactorChallenge(error);
          if (challenge) {
            if (
              attemptBearer &&
              smartHealthApi.getTokenSnapshot() === attemptBearer
            ) {
              setTwoFactorChallenge(challenge);
              setUser(null);
              setIdentityUser(null);
            }
          } else {
            const currentBearer = smartHealthApi.getTokenSnapshot();
            if (currentBearer === attemptBearer && attemptBearer) {
              smartHealthApi.clearTokenIfMatches(attemptBearer);
            }
            if (
              isLatestAttempt() &&
              getCurrentFirebaseUid() === firebaseUid &&
              smartHealthApi.getTokenSnapshot() === ""
            ) {
              setTwoFactorChallenge(null);
              setUser(null);
              setIdentityUser(null);
            }
          }
        } finally {
          if (isLatestAttempt()) setIsLoading(false);
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
    setTwoFactorChallenge(null);
    try {
      const result =
        isProductionAuthMode() && hasFirebaseWebConfig()
          ? await smartHealthApi.authenticateFirebase(
              await signInWithFirebaseEmail(email, password),
            )
          : await smartHealthApi.login(email, password);
      if ("twoFactorRequired" in result && result.twoFactorRequired) {
        const details = "details" in result ? result.details : result;
        setTwoFactorChallenge(details);
        setUser(null);
        return { success: false, error: "two_factor_required" };
      }
      if (!("user" in result)) {
        return { success: false, error: "auth_response_invalid" };
      }
      const next = mapUser(result.user);
      setIdentityUser(next);
      const accessError = getPortalAccessError(next);
      if (accessError) {
        if (isOnboardingAccessError(accessError)) {
          setUser(next);
          return { success: false, error: accessError };
        }
        await smartHealthApi.logout();
        if (isProductionAuthMode() && hasFirebaseWebConfig())
          await signOutFirebase();
        setIdentityUser(null);
        return { success: false, error: accessError };
      }
      setUser(next);
      return { success: true };
    } catch (error) {
      const challenge = readTwoFactorChallenge(error);
      if (challenge) {
        setTwoFactorChallenge(challenge);
        setUser(null);
        return { success: false, error: "two_factor_required" };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Đăng nhập thất bại.",
      };
    }
  };

  const loginForStaffInvitation = async (email: string, password: string) => {
    setTwoFactorChallenge(null);
    try {
      const result =
        isProductionAuthMode() && hasFirebaseWebConfig()
          ? await smartHealthApi.authenticateFirebase(
              await signInWithFirebaseEmail(email, password),
            )
          : await smartHealthApi.login(email, password);
      if ("twoFactorRequired" in result && result.twoFactorRequired) {
        const details = "details" in result ? result.details : result;
        setTwoFactorChallenge(details);
        setIdentityUser(null);
        setUser(null);
        return { success: false, error: "two_factor_required" };
      }
      if (!("user" in result)) {
        return { success: false, error: "auth_response_invalid" };
      }
      const next = mapUser(result.user);
      setIdentityUser(next);
      const accessError = getPortalAccessError(next);
      setUser(
        accessError && !isOnboardingAccessError(accessError) ? null : next,
      );
      return { success: true };
    } catch (error) {
      const challenge = readTwoFactorChallenge(error);
      if (challenge) {
        setTwoFactorChallenge(challenge);
        setIdentityUser(null);
        setUser(null);
        return { success: false, error: "two_factor_required" };
      }
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Xác thực tài khoản thất bại.",
      };
    }
  };

  const completeTwoFactorLoginForMode = async (
    code: string,
    identityOnly: boolean,
  ) => {
    if (!twoFactorChallenge) {
      return { success: false, error: "two_factor_expired" };
    }
    try {
      const challengeResult = await smartHealthApi.completeTwoFactorChallenge({
        challengeId: twoFactorChallenge.challengeId,
        code,
      });
      const raw = challengeResult.user || (await smartHealthApi.me()).user;
      const next = mapUser(raw);
      setIdentityUser(next);
      const accessError = getPortalAccessError(next);
      if (accessError) {
        if (identityOnly) {
          setUser(isOnboardingAccessError(accessError) ? next : null);
          setTwoFactorChallenge(null);
          return { success: true };
        }
        if (isOnboardingAccessError(accessError)) {
          setUser(next);
          setTwoFactorChallenge(null);
          return { success: false, error: accessError };
        }
        await smartHealthApi.logout().catch(() => undefined);
        if (isProductionAuthMode() && hasFirebaseWebConfig()) {
          await signOutFirebase().catch(() => undefined);
        }
        setTwoFactorChallenge(null);
        setIdentityUser(null);
        return { success: false, error: accessError };
      }
      setUser(next);
      setTwoFactorChallenge(null);
      return { success: true };
    } catch (error) {
      const nextChallenge = readTwoFactorChallenge(error);
      if (nextChallenge) setTwoFactorChallenge(nextChallenge);
      return {
        success: false,
        error:
          error && typeof error === "object" && (error as ApiError).code
            ? (error as ApiError).code
            : error instanceof Error
              ? error.message
              : "TWO_FACTOR_VERIFICATION_FAILED",
      };
    }
  };

  const completeTwoFactorLogin = (code: string) =>
    completeTwoFactorLoginForMode(code, false);

  const completeStaffInvitationTwoFactorLogin = (code: string) =>
    completeTwoFactorLoginForMode(code, true);

  const cancelTwoFactorLogin = async () => {
    smartHealthApi.clearToken();
    if (isProductionAuthMode() && hasFirebaseWebConfig()) {
      await signOutFirebase().catch(() => undefined);
    }
    setTwoFactorChallenge(null);
    setUser(null);
    setIdentityUser(null);
  };

  const logout = async (authority?: LogoutAuthority) => {
    if (!authority) {
      await smartHealthApi.logout().catch(() => undefined);
      if (isProductionAuthMode() && hasFirebaseWebConfig())
        await signOutFirebase().catch(() => undefined);
      setUser(null);
      setIdentityUser(null);
      setTwoFactorChallenge(null);
      return true;
    }

    const activeUserId =
      userRef.current?.id || identityUserRef.current?.id || "";
    const activeOwnerMatchesBefore = activeUserId === authority.userId;
    if (
      !authority.userId ||
      !authority.authToken ||
      !activeOwnerMatchesBefore ||
      smartHealthApi.getTokenSnapshot() !== authority.authToken
    ) {
      return false;
    }

    let backendSessionClosed = false;
    try {
      backendSessionClosed = await smartHealthApi.logoutIfTokenMatches(
        authority.authToken,
      );
    } catch {
      backendSessionClosed = smartHealthApi.getTokenSnapshot() === "";
    }

    let firebaseSessionClosed = true;
    if (authority.firebaseUid) {
      const currentFirebaseUid = getCurrentFirebaseUid();
      firebaseSessionClosed =
        currentFirebaseUid === null ||
        (currentFirebaseUid === authority.firebaseUid &&
          (await signOutFirebaseIfUidMatches(authority.firebaseUid).catch(
            () => false,
          )));
    }

    const activeUserIdAfter =
      userRef.current?.id || identityUserRef.current?.id || "";
    const activeOwnerMatchesAfter = activeUserIdAfter === authority.userId;
    const backendOwnerStillClosed =
      backendSessionClosed && smartHealthApi.getTokenSnapshot() === "";
    const firebaseOwnerStillClosed =
      firebaseSessionClosed &&
      (!authority.firebaseUid || getCurrentFirebaseUid() === null);
    const ownerStillCurrentAndClosed =
      activeOwnerMatchesAfter &&
      backendOwnerStillClosed &&
      firebaseOwnerStillClosed;

    if (ownerStillCurrentAndClosed) {
      setUser(null);
      setIdentityUser(null);
      setTwoFactorChallenge(null);
    }
    return ownerStillCurrentAndClosed;
  };

  const switchWorkspace = async (workspaceId: string) => {
    const requestedWorkspaceId = workspaceId.trim();
    const previousWorkspaceId = user?.currentWorkspace.id || "";
    if (!requestedWorkspaceId) {
      throw new Error("Thiếu workspace cần chuyển.");
    }

    const attempt = resolveClinicalWorkflowIntent(
      workspaceSwitchAttemptRef.current,
      "workspace-switch",
      { workspaceId: requestedWorkspaceId },
    );
    workspaceSwitchAttemptRef.current = attempt;

    const acceptConfirmedWorkspace = async (next: AuthUser) => {
      await isolatePortalWorkspaceQueries(queryClient);
      setIdentityUser(next);
      const accessError = getPortalAccessError(next);
      if (accessError && !isOnboardingAccessError(accessError)) {
        setUser(null);
        workspaceSwitchAttemptRef.current = null;
        throw new Error(
          "Workspace đã chọn không còn cấp quyền truy cập Portal. Hãy đăng nhập lại để xác minh quyền.",
        );
      }
      setUser(next);
      workspaceSwitchAttemptRef.current = null;
    };

    let mutationError: unknown = null;
    let mutationUser: AuthUser | null = null;
    try {
      const result = await smartHealthApi.switchWorkspace(
        requestedWorkspaceId,
        attempt.idempotencyKey,
      );
      mutationUser = mapUser(result.user);
    } catch (error) {
      mutationError = error;
    }

    if (mutationUser?.currentWorkspace.id === requestedWorkspaceId) {
      await acceptConfirmedWorkspace(mutationUser);
      return;
    }

    let reconciled: AuthUser;
    try {
      const current = await smartHealthApi.me();
      reconciled = mapUser(current.user);
    } catch {
      await isolatePortalWorkspaceQueries(queryClient);
      if (mutationError instanceof Error) throw mutationError;
      throw new Error(
        "Chưa thể xác minh workspace hiện tại. Dữ liệu workspace đã được đóng; hãy tải lại trang hoặc đăng nhập lại trước khi tiếp tục.",
      );
    }

    if (reconciled.currentWorkspace.id === requestedWorkspaceId) {
      await acceptConfirmedWorkspace(reconciled);
      return;
    }

    if (
      reconciled.currentWorkspace.id &&
      previousWorkspaceId &&
      reconciled.currentWorkspace.id !== previousWorkspaceId
    ) {
      await isolatePortalWorkspaceQueries(queryClient);
      setIdentityUser(reconciled);
      setUser(reconciled);
      workspaceSwitchAttemptRef.current = null;
      throw new Error(
        "Workspace đang hoạt động đã thay đổi ở phiên khác. Shcare đã đồng bộ lại theo xác nhận mới nhất của backend.",
      );
    }

    if (mutationError instanceof Error) throw mutationError;
    throw new Error(
      "Backend chưa xác nhận chuyển workspace. Workspace hiện tại vẫn được giữ nguyên; vui lòng thử lại.",
    );
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      identityUser,
      isAuthenticated: Boolean(user),
      isLoading,
      twoFactorChallenge,
      login,
      loginForStaffInvitation,
      completeTwoFactorLogin,
      completeStaffInvitationTwoFactorLogin,
      cancelTwoFactorLogin,
      logout,
      refreshUser,
      switchWorkspace,
      switchRole: () => undefined,
    }),
    [user, identityUser, isLoading, twoFactorChallenge],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
