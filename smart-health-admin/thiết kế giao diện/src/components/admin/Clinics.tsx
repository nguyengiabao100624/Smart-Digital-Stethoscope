import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  AlertCircle,
  Archive,
  Building2,
  CheckCircle2,
  Edit3,
  Filter,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlock,
  UserRound,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AddClinicDialog } from "./dialogs/AddClinicDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { PageHeader, StatusBadge } from "./design-system";
import { PaginationFooter } from "./PaginationFooter";
import {
  smartHealthApi,
  type SmartHealthApiError,
  type SmartHealthClinic,
  type SmartHealthClinicListPagination,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  assertWorkspaceStatusTransition,
  parseWorkspaceArchiveOutcome,
  parseWorkspaceMutationOutcome,
  parseWorkspaceOwnerApprovalOutcome,
  resolveWorkspaceOperationAttempt,
  type CanonicalWorkspace,
  type WorkspaceOperationAttempt,
  type WorkspaceStatus,
  type WorkspaceType,
} from "@/lib/workspace-operations";
import { CapabilityGate } from "./AdminAccessContext";
import { useAdminAccess } from "./useAdminAccess";
import { WORKSPACE_MANAGE_CAPABILITIES } from "./action-permissions";

const PAGE_SIZE = 25;
const WORKSPACE_INFO_FIELDS = ["workspaceName", "address", "representative", "phone"];
const WORKSPACE_STATUSES = new Set<WorkspaceStatus>([
  "pending",
  "active",
  "needs_info",
  "rejected",
  "inactive",
]);
const WORKSPACE_TYPES = new Set<WorkspaceType>(["hospital", "clinic", "solo_practice", "personal"]);

type Clinic = {
  id: string;
  name: string;
  rawType: string;
  typeLabel: string;
  workspaceType: WorkspaceType | "unknown";
  status: WorkspaceStatus | "unknown";
  version: number;
  address: string;
  phone: string;
  email: string;
  website: string;
  legalName: string;
  representative: string;
  ownerUserId: string;
  packageId: string;
  subscriptionStatus: string;
  billingCycle: string;
  userCount: number;
  doctorCount: number;
  patientCount: number;
  deviceCount: number;
  storageGb: number;
  requestMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  source: SmartHealthClinic;
};

type LifecycleAction = {
  clinic: Clinic;
  toStatus: WorkspaceStatus;
  title: string;
  description: string;
  confirmLabel: string;
  tone: "success" | "warning" | "danger";
};

function finiteNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

function canonicalStatus(value: unknown): WorkspaceStatus | "unknown" {
  return typeof value === "string" && WORKSPACE_STATUSES.has(value as WorkspaceStatus)
    ? (value as WorkspaceStatus)
    : "unknown";
}

function canonicalWorkspaceType(value: unknown): WorkspaceType | "unknown" {
  return typeof value === "string" && WORKSPACE_TYPES.has(value as WorkspaceType)
    ? (value as WorkspaceType)
    : "unknown";
}

function getClinicalTypeLabel(type: string) {
  const labels: Record<string, string> = {
    general: "Đa khoa",
    cardiology: "Chuyên khoa Tim mạch",
    respiratory: "Chuyên khoa Hô hấp",
    pediatrics: "Chuyên khoa Nhi",
    hospital: "Bệnh viện",
    clinic: "Phòng khám",
  };
  return labels[type] ?? (type === "unknown" ? "Chưa xác định" : type);
}

function mapBackendClinic(clinic: SmartHealthClinic): Clinic {
  const rawType =
    typeof clinic.type === "string" && clinic.type.trim() ? clinic.type.trim() : "unknown";
  const version = Number(clinic.version);
  return {
    id: String(clinic.id ?? "").trim(),
    name: String(clinic.name ?? "").trim() || "Workspace chưa đặt tên",
    rawType,
    typeLabel: getClinicalTypeLabel(rawType),
    workspaceType: canonicalWorkspaceType(clinic.workspaceType),
    status: canonicalStatus(clinic.status),
    version: Number.isInteger(version) && version > 0 ? version : 0,
    address: String(clinic.address ?? "").trim(),
    phone: String(clinic.phone ?? "").trim(),
    email: String(clinic.email ?? "").trim(),
    website: String(clinic.website ?? "").trim(),
    legalName: String(clinic.legalName ?? "").trim(),
    representative: String(clinic.representative ?? "").trim(),
    ownerUserId: String(clinic.ownerUserId ?? "").trim(),
    packageId: String(clinic.packageId ?? "").trim(),
    subscriptionStatus: String(clinic.subscriptionStatus ?? "").trim(),
    billingCycle: String(clinic.billingCycle ?? "").trim(),
    userCount: finiteNumber(clinic.userCount),
    doctorCount: finiteNumber(clinic.doctorCount ?? clinic.usage?.doctors),
    patientCount: finiteNumber(clinic.patientCount ?? clinic.usage?.patients),
    deviceCount: finiteNumber(clinic.deviceCount ?? clinic.usage?.devices),
    storageGb: finiteNumber(clinic.usage?.storageGb),
    requestMetadata:
      clinic.requestMetadata && typeof clinic.requestMetadata === "object"
        ? clinic.requestMetadata
        : {},
    createdAt: String(clinic.createdAt ?? "").trim(),
    updatedAt: String(clinic.updatedAt ?? "").trim(),
    source: clinic,
  };
}

function editorClinic(clinic: Clinic): SmartHealthClinic {
  return {
    ...clinic.source,
    id: clinic.id,
    name: clinic.name,
    type: clinic.rawType,
    workspaceType: clinic.workspaceType === "unknown" ? "" : clinic.workspaceType,
    status: clinic.status === "unknown" ? "" : clinic.status,
    version: clinic.version || undefined,
    address: clinic.address,
    phone: clinic.phone,
    email: clinic.email,
    website: clinic.website,
    legalName: clinic.legalName,
    representative: clinic.representative,
  };
}

function getWorkspaceStatusLabel(status: Clinic["status"]) {
  if (status === "active") return "Đang hoạt động";
  if (status === "pending") return "Chờ duyệt";
  if (status === "needs_info") return "Cần bổ sung";
  if (status === "rejected") return "Đã từ chối";
  if (status === "inactive") return "Tạm ngưng";
  return "Chưa xác định";
}

function getWorkspaceStatusTone(
  status: Clinic["status"],
): "success" | "warning" | "error" | "muted" | "info" {
  if (status === "active") return "success";
  if (status === "pending") return "info";
  if (status === "needs_info") return "warning";
  if (status === "rejected") return "error";
  return "muted";
}

function formatDate(value: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "Chưa ghi nhận";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function lifecycleConfig(clinic: Clinic, toStatus: WorkspaceStatus): LifecycleAction {
  if (toStatus === "active" && clinic.status === "pending") {
    return {
      clinic,
      toStatus,
      title: "Phê duyệt workspace",
      description:
        "Hệ thống sẽ xác nhận danh tính workspace owner trước, sau đó mới kích hoạt workspace bằng một receipt riêng.",
      confirmLabel: "Xác nhận và kích hoạt",
      tone: "success",
    };
  }
  if (toStatus === "active") {
    return {
      clinic,
      toStatus,
      title: "Kích hoạt lại workspace",
      description:
        "Quyền truy cập workspace chỉ hoạt động lại sau khi backend xác nhận transition.",
      confirmLabel: "Kích hoạt lại",
      tone: "success",
    };
  }
  if (toStatus === "inactive") {
    return {
      clinic,
      toStatus,
      title: "Tạm ngưng workspace",
      description:
        "Thao tác này ngừng quyền vận hành của workspace nhưng giữ dữ liệu để có thể khôi phục hoặc lưu trữ sau đó.",
      confirmLabel: "Tạm ngưng",
      tone: "warning",
    };
  }
  return {
    clinic,
    toStatus,
    title: "Đưa hồ sơ về chờ duyệt",
    description: "Hồ sơ sẽ quay lại hàng chờ để Platform Admin xem xét lại.",
    confirmLabel: "Đưa về chờ duyệt",
    tone: "warning",
  };
}

export function Clinics() {
  const { hasAnyCapability } = useAdminAccess();
  const canManageWorkspaces = hasAnyCapability(WORKSPACE_MANAGE_CAPABILITIES);
  const [searchTerm, setSearchTerm] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [pagination, setPagination] = useState<SmartHealthClinicListPagination>({
    totalCount: 0,
    page: 1,
    limit: PAGE_SIZE,
    pageCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isStale, setIsStale] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [infoAction, setInfoAction] = useState<Clinic | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [rejectAction, setRejectAction] = useState<Clinic | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [archiveAction, setArchiveAction] = useState<Clinic | null>(null);
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [statusActionError, setStatusActionError] = useState("");
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const hasLoadedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const transitionAttemptRef = useRef<WorkspaceOperationAttempt | null>(null);
  const ownerApprovalAttemptRef = useRef<WorkspaceOperationAttempt | null>(null);
  const archiveAttemptRef = useRef<WorkspaceOperationAttempt | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequenceRef.current;
    const hasSnapshot = hasLoadedRef.current;
    setIsLoading(!hasSnapshot);
    setIsRefreshing(hasSnapshot);
    setPermissionDenied(false);

    void smartHealthApi
      .listClinics({
        q: deferredSearch || undefined,
        status: filterStatus === "all" ? undefined : filterStatus,
        workspaceType: filterType === "all" ? undefined : filterType,
        page,
        limit: PAGE_SIZE,
        sort: "updatedAt:desc",
        signal: controller.signal,
      })
      .then((response) => {
        if (sequence !== requestSequenceRef.current) return;
        if (!response.pagination) {
          throw new Error(
            "Backend chưa trả metadata phân trang canonical cho danh sách workspace.",
          );
        }
        const mapped = response.clinics.map(mapBackendClinic);
        setClinics(mapped);
        setPagination(response.pagination);
        setSelectedClinic((current) =>
          current ? (mapped.find((clinic) => clinic.id === current.id) ?? null) : null,
        );
        setLoadError("");
        setIsStale(false);
        hasLoadedRef.current = true;
      })
      .catch((error: unknown) => {
        if (sequence !== requestSequenceRef.current || isAbortError(error)) return;
        const denied = (error as SmartHealthApiError | undefined)?.status === 403;
        const message = toVietnameseErrorMessage(error, "Không thể tải danh sách workspace.");
        setLoadError(message);
        setPermissionDenied(denied);
        if (denied) {
          setClinics([]);
          setSelectedClinic(null);
          setIsStale(false);
          hasLoadedRef.current = false;
        } else if (hasSnapshot) {
          setIsStale(true);
        } else {
          setClinics([]);
        }
      })
      .finally(() => {
        if (sequence !== requestSequenceRef.current) return;
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => controller.abort();
  }, [deferredSearch, filterStatus, filterType, page, reloadKey]);

  const reload = () => setReloadKey((current) => current + 1);

  const replaceConfirmedWorkspace = (workspace: CanonicalWorkspace) => {
    const replace = (clinic: Clinic) =>
      clinic.id === workspace.id ? mapBackendClinic({ ...clinic.source, ...workspace }) : clinic;
    setClinics((current) => current.map(replace));
    setSelectedClinic((current) => (current ? replace(current) : null));
  };

  const openCreateDialog = () => {
    if (!canManageWorkspaces) return;
    setEditingClinic(null);
    setAddDialogOpen(true);
  };

  const openEditDialog = (clinic: Clinic) => {
    if (!canManageWorkspaces) return;
    setEditingClinic(clinic);
    setAddDialogOpen(true);
  };

  const runTransitionAction = async (
    clinic: Clinic,
    toStatus: WorkspaceStatus,
    metadata: { reason?: string; message?: string; requiredFields?: string[] } = {},
  ) => {
    if (statusActionLoading) return false;
    if (!canManageWorkspaces) {
      setStatusActionError("Tài khoản không có quyền quản lý workspace.");
      return false;
    }
    if (clinic.status === "unknown" || clinic.version < 1) {
      setStatusActionError(
        "Dữ liệu workspace thiếu status/version canonical. Hãy tải lại danh sách.",
      );
      return false;
    }

    setStatusActionLoading(true);
    setStatusActionError("");
    try {
      assertWorkspaceStatusTransition(clinic.status, toStatus);
      let transitionClinic = clinic;

      if (clinic.status === "pending" && toStatus === "active") {
        const ownerIntent = {
          workspaceId: clinic.id,
          expectedVersion: clinic.version,
          ownerUserId: clinic.ownerUserId,
          fromStatus: clinic.status,
          toStatus,
        };
        const ownerAttempt = resolveWorkspaceOperationAttempt(
          ownerApprovalAttemptRef.current,
          "owner_approval",
          ownerIntent,
        );
        ownerApprovalAttemptRef.current = ownerAttempt;
        const ownerResponse = await smartHealthApi.approveWorkspaceOwner(
          clinic.id,
          clinic.version,
          ownerAttempt.idempotencyKey,
        );
        const ownerOutcome = parseWorkspaceOwnerApprovalOutcome(ownerResponse, ownerIntent);
        transitionClinic = mapBackendClinic({ ...clinic.source, ...ownerOutcome.workspace });
      }

      const transitionIntent = {
        workspaceId: transitionClinic.id,
        expectedVersion: transitionClinic.version,
        fromStatus: transitionClinic.status as WorkspaceStatus,
        toStatus,
        reason: metadata.reason,
        message: metadata.message,
        requiredFields: metadata.requiredFields,
      };
      const transitionAttempt = resolveWorkspaceOperationAttempt(
        transitionAttemptRef.current,
        "transition",
        transitionIntent,
      );
      transitionAttemptRef.current = transitionAttempt;
      const response = await smartHealthApi.updateClinic(
        transitionClinic.id,
        {
          status: toStatus,
          expectedVersion: transitionClinic.version,
          ...(metadata.reason ? { reason: metadata.reason } : {}),
          ...(metadata.message ? { message: metadata.message } : {}),
          ...(metadata.requiredFields ? { requiredFields: metadata.requiredFields } : {}),
        },
        transitionAttempt.idempotencyKey,
      );
      const outcome = parseWorkspaceMutationOutcome(response, "transition", transitionIntent);
      replaceConfirmedWorkspace(outcome.workspace);
      transitionAttemptRef.current = null;
      ownerApprovalAttemptRef.current = null;
      toast.success(`Đã cập nhật: ${getWorkspaceStatusLabel(toStatus)}`, {
        description: `${outcome.workspace.name} được backend xác nhận ở version ${outcome.workspace.version}.`,
      });
      reload();
      return true;
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể cập nhật lifecycle workspace.");
      setStatusActionError(message);
      toast.error("Workspace chưa được cập nhật", { description: message });
      return false;
    } finally {
      setStatusActionLoading(false);
    }
  };

  const confirmLifecycleAction = async () => {
    if (!lifecycleAction) return;
    const success = await runTransitionAction(lifecycleAction.clinic, lifecycleAction.toStatus);
    if (success) setLifecycleAction(null);
  };

  const requestMoreInfo = async () => {
    if (!infoAction || !infoMessage.trim()) return;
    const success = await runTransitionAction(infoAction, "needs_info", {
      message: infoMessage.trim(),
      requiredFields: WORKSPACE_INFO_FIELDS,
    });
    if (success) {
      setInfoAction(null);
      setInfoMessage("");
    }
  };

  const rejectWorkspace = async () => {
    if (!rejectAction || !rejectReason.trim()) return;
    const success = await runTransitionAction(rejectAction, "rejected", {
      reason: rejectReason.trim(),
    });
    if (success) {
      setRejectAction(null);
      setRejectReason("");
    }
  };

  const archiveWorkspace = async () => {
    if (isArchiving || !archiveAction) return;
    if (archiveAction.status !== "inactive" || archiveAction.version < 1) {
      setArchiveError(
        "Workspace phải ở trạng thái tạm ngưng và có version canonical trước khi lưu trữ.",
      );
      return;
    }
    setIsArchiving(true);
    setArchiveError("");
    const intent = {
      workspaceId: archiveAction.id,
      expectedVersion: archiveAction.version,
    };
    const attempt = resolveWorkspaceOperationAttempt(archiveAttemptRef.current, "archive", intent);
    archiveAttemptRef.current = attempt;
    try {
      const response = await smartHealthApi.deleteClinic(
        archiveAction.id,
        archiveAction.version,
        attempt.idempotencyKey,
      );
      const outcome = parseWorkspaceArchiveOutcome(response, intent);
      setClinics((current) => current.filter((clinic) => clinic.id !== outcome.workspaceId));
      setSelectedClinic((current) => (current?.id === outcome.workspaceId ? null : current));
      setArchiveAction(null);
      archiveAttemptRef.current = null;
      toast.success("Đã lưu trữ workspace", {
        description: "Backend đã xác nhận tombstone; workspace không còn cấp quyền truy cập.",
      });
      reload();
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể lưu trữ workspace.");
      setArchiveError(message);
      toast.error("Workspace chưa được lưu trữ", { description: message });
    } finally {
      setIsArchiving(false);
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setDeferredSearch("");
    setFilterType("all");
    setFilterStatus("all");
    setPage(1);
  };

  const resultSummary = useMemo(() => {
    if (pagination.totalCount === 0) return "Không có workspace phù hợp";
    return `${pagination.totalCount} workspace từ backend`;
  }, [pagination.totalCount]);

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        eyebrow="Tổ chức B2B"
        title="Workspace và cơ sở y tế"
        description="Duyệt hồ sơ, quản lý lifecycle và theo dõi dữ liệu vận hành đã được backend xác nhận."
        action={
          <CapabilityGate capabilities={WORKSPACE_MANAGE_CAPABILITIES}>
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo workspace
            </button>
          </CapabilityGate>
        }
      />

      {!isOnline ? (
        <StateBanner icon={WifiOff} tone="warning" title="Không có kết nối mạng">
          Dữ liệu mới và thao tác thay đổi sẽ không được xác nhận cho đến khi kết nối trở lại.
        </StateBanner>
      ) : null}
      {isStale ? (
        <StateBanner icon={AlertCircle} tone="warning" title="Đang hiển thị dữ liệu gần nhất">
          {loadError} <RetryButton onClick={reload} />
        </StateBanner>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border bg-muted/20 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_220px]">
            <label className="relative block sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Tìm workspace</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Tìm workspace"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder="Tên, mã, email, số điện thoại..."
                className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none transition-shadow focus:border-ring focus:ring-1 focus:ring-ring motion-reduce:transition-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Loại workspace
              </span>
              <select
                value={filterType}
                onChange={(event) => {
                  setFilterType(event.target.value);
                  setPage(1);
                }}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              >
                <option value="all">Tất cả loại</option>
                <option value="hospital">Bệnh viện</option>
                <option value="clinic">Phòng khám</option>
                <option value="solo_practice">Bác sĩ tư</option>
                <option value="personal">Cá nhân / gia đình</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Trạng thái
              </span>
              <select
                value={filterStatus}
                onChange={(event) => {
                  setFilterStatus(event.target.value);
                  setPage(1);
                }}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Chờ duyệt</option>
                <option value="needs_info">Cần bổ sung</option>
                <option value="rejected">Đã từ chối</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm ngưng</option>
              </select>
            </label>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 text-sm text-muted-foreground lg:justify-end">
            <span className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {resultSummary}
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-11 rounded-md px-3 text-sm font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Đặt lại
            </button>
          </div>
        </div>

        {permissionDenied ? (
          <FullState
            icon={ShieldCheck}
            title="Bạn không có quyền xem danh sách workspace"
            description="Quyền truy cập được backend xác định theo capability, không dựa vào menu đang hiển thị."
            action={<RetryButton onClick={reload} />}
          />
        ) : isLoading ? (
          <WorkspaceTableSkeleton />
        ) : loadError && clinics.length === 0 ? (
          <FullState
            icon={AlertCircle}
            title="Không thể tải danh sách workspace"
            description={loadError}
            action={<RetryButton onClick={reload} />}
          />
        ) : clinics.length === 0 ? (
          <FullState
            icon={Building2}
            title="Chưa có workspace phù hợp"
            description="Thay đổi bộ lọc hoặc tạo workspace mới nếu bạn có quyền."
            action={
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Xóa bộ lọc
              </button>
            }
          />
        ) : (
          <>
            <div className="relative min-h-0 flex-1 overflow-auto">
              {isRefreshing ? (
                <div
                  className="absolute right-4 top-3 z-10 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
                  role="status"
                >
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Đang đồng bộ
                </div>
              ) : null}
              <table className="w-full min-w-[980px] text-left text-sm" aria-busy={isRefreshing}>
                <thead className="sticky top-0 z-[1] bg-muted/95 text-muted-foreground backdrop-blur-sm">
                  <tr>
                    <th className="px-5 py-3 font-medium">Workspace</th>
                    <th className="px-5 py-3 font-medium">Liên hệ</th>
                    <th className="px-5 py-3 font-medium">Quy mô</th>
                    <th className="px-5 py-3 font-medium">Trạng thái</th>
                    <th className="px-5 py-3 font-medium">Cập nhật</th>
                    <th className="px-5 py-3 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clinics.map((clinic) => (
                    <tr
                      key={clinic.id}
                      className="transition-colors hover:bg-muted/30 motion-reduce:transition-none"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Building2 className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setSelectedClinic(clinic)}
                              className="min-h-11 max-w-[300px] truncate text-left font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {clinic.name}
                            </button>
                            <p className="truncate text-xs text-muted-foreground">
                              {clinic.id} · {clinic.typeLabel}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <ContactLine
                          icon={Phone}
                          value={clinic.phone}
                          fallback="Chưa có số điện thoại"
                        />
                        <ContactLine icon={Mail} value={clinic.email} fallback="Chưa có email" />
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        <div>
                          {clinic.doctorCount} bác sĩ · {clinic.patientCount} bệnh nhân
                        </div>
                        <div className="mt-1 text-xs">
                          {clinic.deviceCount} thiết bị · {clinic.userCount} tài khoản
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge
                          label={getWorkspaceStatusLabel(clinic.status)}
                          tone={getWorkspaceStatusTone(clinic.status)}
                          pulse={clinic.status === "pending"}
                        />
                        {clinic.version < 1 ? (
                          <p className="mt-1 text-xs text-destructive">Thiếu version canonical</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        <div>{formatDate(clinic.updatedAt)}</div>
                        <div className="mt-1 text-xs">Version {clinic.version || "—"}</div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {canManageWorkspaces ? (
                          <WorkspaceActions
                            clinic={clinic}
                            onEdit={openEditDialog}
                            onLifecycle={(target, status) => {
                              setStatusActionError("");
                              setLifecycleAction(lifecycleConfig(target, status));
                            }}
                            onRequestInfo={(target) => {
                              setStatusActionError("");
                              setInfoMessage("");
                              setInfoAction(target);
                            }}
                            onReject={(target) => {
                              setStatusActionError("");
                              setRejectReason("");
                              setRejectAction(target);
                            }}
                            onArchive={(target) => {
                              setArchiveError("");
                              setArchiveAction(target);
                            }}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">Chỉ xem</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationFooter
              page={pagination.page}
              pageSize={pagination.limit}
              totalItems={pagination.totalCount}
              itemLabel="workspace"
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <AddClinicDialog
        open={canManageWorkspaces && addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) setEditingClinic(null);
        }}
        onCreated={reload}
        onSaved={replaceConfirmedWorkspace}
        clinic={editingClinic ? editorClinic(editingClinic) : null}
      />

      <ConfirmActionDialog
        open={Boolean(lifecycleAction)}
        onOpenChange={(open) => {
          if (!open && !statusActionLoading) {
            setLifecycleAction(null);
            setStatusActionError("");
          }
        }}
        title={lifecycleAction?.title ?? "Cập nhật workspace"}
        description={
          lifecycleAction
            ? `${lifecycleAction.description} Workspace: ${lifecycleAction.clinic.name}.`
            : ""
        }
        confirmLabel={lifecycleAction?.confirmLabel ?? "Xác nhận"}
        tone={lifecycleAction?.tone ?? "warning"}
        loading={statusActionLoading}
        error={statusActionError}
        onConfirm={confirmLifecycleAction}
      />

      <ReviewMessageDialog
        open={Boolean(infoAction)}
        title="Yêu cầu bổ sung hồ sơ"
        description="Nội dung và danh sách trường cần bổ sung sẽ được lưu cùng transition needs_info."
        label="Thông tin cần bổ sung"
        placeholder="Ví dụ: Vui lòng bổ sung giấy phép hoạt động và địa chỉ pháp lý."
        value={infoMessage}
        onChange={setInfoMessage}
        confirmLabel="Gửi yêu cầu bổ sung"
        loading={statusActionLoading}
        error={statusActionError}
        onConfirm={requestMoreInfo}
        onOpenChange={(open) => {
          if (!open && !statusActionLoading) {
            setInfoAction(null);
            setInfoMessage("");
            setStatusActionError("");
          }
        }}
      />

      <ReviewMessageDialog
        open={Boolean(rejectAction)}
        title="Từ chối yêu cầu workspace"
        description="Lý do từ chối là bắt buộc và được lưu vào audit cùng transition rejected."
        label="Lý do từ chối"
        placeholder="Nêu rõ thông tin không thể xác minh hoặc hồ sơ chưa hợp lệ."
        value={rejectReason}
        onChange={setRejectReason}
        confirmLabel="Từ chối yêu cầu"
        tone="danger"
        loading={statusActionLoading}
        error={statusActionError}
        onConfirm={rejectWorkspace}
        onOpenChange={(open) => {
          if (!open && !statusActionLoading) {
            setRejectAction(null);
            setRejectReason("");
            setStatusActionError("");
          }
        }}
      />

      <ConfirmActionDialog
        open={Boolean(archiveAction)}
        onOpenChange={(open) => {
          if (!open && !isArchiving) {
            setArchiveAction(null);
            setArchiveError("");
          }
        }}
        title="Lưu trữ workspace"
        description={
          archiveAction
            ? `Tạo tombstone cho ${archiveAction.name}. Dữ liệu liên kết được giữ theo chính sách nhưng workspace không còn cấp quyền truy cập.`
            : ""
        }
        confirmLabel="Lưu trữ workspace"
        tone="danger"
        loading={isArchiving}
        error={archiveError}
        onConfirm={archiveWorkspace}
      />

      <WorkspaceDetailDrawer
        clinic={selectedClinic}
        onOpenChange={(open) => {
          if (!open) setSelectedClinic(null);
        }}
      />
    </div>
  );
}

function WorkspaceActions({
  clinic,
  onEdit,
  onLifecycle,
  onRequestInfo,
  onReject,
  onArchive,
}: {
  clinic: Clinic;
  onEdit: (clinic: Clinic) => void;
  onLifecycle: (clinic: Clinic, status: WorkspaceStatus) => void;
  onRequestInfo: (clinic: Clinic) => void;
  onReject: (clinic: Clinic) => void;
  onArchive: (clinic: Clinic) => void;
}) {
  const actionable = clinic.status !== "unknown" && clinic.version > 0;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Thao tác với ${clinic.name}`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-lg border border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg"
        >
          <ActionItem icon={Edit3} label="Chỉnh sửa thông tin" onSelect={() => onEdit(clinic)} />
          {actionable && clinic.status === "pending" ? (
            <>
              <ActionItem
                icon={CheckCircle2}
                label="Phê duyệt workspace"
                onSelect={() => onLifecycle(clinic, "active")}
              />
              <ActionItem
                icon={RefreshCw}
                label="Yêu cầu bổ sung hồ sơ"
                onSelect={() => onRequestInfo(clinic)}
              />
              <ActionItem
                icon={AlertCircle}
                label="Từ chối yêu cầu workspace"
                tone="danger"
                onSelect={() => onReject(clinic)}
              />
            </>
          ) : null}
          {actionable && ["needs_info", "rejected"].includes(clinic.status) ? (
            <ActionItem
              icon={RefreshCw}
              label="Đưa về chờ duyệt"
              onSelect={() => onLifecycle(clinic, "pending")}
            />
          ) : null}
          {actionable && clinic.status === "active" ? (
            <ActionItem
              icon={Lock}
              label="Tạm ngưng workspace"
              onSelect={() => onLifecycle(clinic, "inactive")}
            />
          ) : null}
          {actionable && clinic.status === "inactive" ? (
            <>
              <ActionItem
                icon={Unlock}
                label="Kích hoạt lại workspace"
                onSelect={() => onLifecycle(clinic, "active")}
              />
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <ActionItem
                icon={Archive}
                label="Lưu trữ workspace"
                tone="danger"
                onSelect={() => onArchive(clinic)}
              />
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ActionItem({
  icon: Icon,
  label,
  tone = "default",
  onSelect,
}: {
  icon: React.ElementType;
  label: string;
  tone?: "default" | "danger";
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 outline-none focus:bg-muted ${
        tone === "danger" ? "text-destructive focus:text-destructive" : ""
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </DropdownMenu.Item>
  );
}

function WorkspaceDetailDrawer({
  clinic,
  onOpenChange,
}: {
  clinic: Clinic | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={Boolean(clinic)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/45 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out motion-reduce:animate-none" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right motion-reduce:animate-none">
          {clinic ? (
            <>
              <header className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <Dialog.Title className="truncate text-lg font-semibold text-foreground">
                      {clinic.name}
                    </Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                      {clinic.id} · Version {clinic.version || "—"}
                    </Dialog.Description>
                    <div className="mt-2">
                      <StatusBadge
                        label={getWorkspaceStatusLabel(clinic.status)}
                        tone={getWorkspaceStatusTone(clinic.status)}
                      />
                    </div>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Đóng chi tiết workspace"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </header>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                <section className="grid grid-cols-2 gap-3" aria-label="Chỉ số workspace">
                  <Metric label="Bác sĩ" value={clinic.doctorCount} />
                  <Metric label="Bệnh nhân" value={clinic.patientCount} />
                  <Metric label="Thiết bị" value={clinic.deviceCount} />
                  <Metric label="Tổng dung lượng lưu trữ" value={`${clinic.storageGb} GB`} />
                </section>
                <DetailSection title="Liên hệ và pháp lý">
                  <InfoLine icon={UserRound} label="Người đại diện" value={clinic.representative} />
                  <InfoLine icon={ShieldCheck} label="Tên pháp lý" value={clinic.legalName} />
                  <InfoLine icon={MapPin} label="Địa chỉ" value={clinic.address} />
                  <InfoLine icon={Phone} label="Số điện thoại" value={clinic.phone} />
                  <InfoLine icon={Mail} label="Email" value={clinic.email} />
                </DetailSection>
                <DetailSection title="Quyền sở hữu và gói">
                  <InfoLine icon={Users} label="Owner user ID" value={clinic.ownerUserId} />
                  <InfoLine
                    icon={Building2}
                    label="Loại workspace"
                    value={
                      clinic.workspaceType === "unknown" ? "Chưa xác định" : clinic.workspaceType
                    }
                  />
                  <InfoLine icon={ShieldCheck} label="Gói hiện tại" value={clinic.packageId} />
                  <p className="text-sm text-muted-foreground">
                    Chu kỳ: {clinic.billingCycle || "Chưa gán"} · Trạng thái:{" "}
                    {clinic.subscriptionStatus || "Chưa gán"}
                  </p>
                </DetailSection>
                <DetailSection title="Dấu thời gian backend">
                  <p className="text-sm text-muted-foreground">
                    Tạo: {formatDate(clinic.createdAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Cập nhật: {formatDate(clinic.updatedAt)}
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Đây là dữ liệu canonical của workspace, không phải audit timeline. Xem trang
                    Audit để tra cứu sự kiện chi tiết.
                  </p>
                </DetailSection>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReviewMessageDialog({
  open,
  title,
  description,
  label,
  placeholder,
  value,
  confirmLabel,
  tone = "default",
  loading,
  error,
  onChange,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  value: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  loading: boolean;
  error: string;
  onChange: (value: string) => void;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const id = title.includes("Từ chối") ? "workspace-reject-message" : "workspace-info-message";
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-950/50 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content
          onEscapeKeyDown={(event) => loading && event.preventDefault()}
          onPointerDownOutside={(event) => loading && event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-[70] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none sm:p-6"
        >
          <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </Dialog.Description>
          <label htmlFor={id} className="mt-5 block text-sm font-medium text-foreground">
            {label}
          </label>
          <textarea
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
            placeholder={placeholder}
            className="mt-2 min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {error ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={loading}
              onClick={() => onOpenChange(false)}
              className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={loading || !value.trim()}
              onClick={() => void onConfirm()}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${tone === "danger" ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"}`}
            >
              {loading ? (
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : null}
              {loading ? "Đang chờ backend..." : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function WorkspaceTableSkeleton() {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Đang tải workspace">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[2fr_1.4fr_1fr_1fr] gap-4 rounded-lg border border-border p-4"
        >
          {Array.from({ length: 4 }, (__, cell) => (
            <div
              key={cell}
              className="h-5 animate-pulse rounded bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Đang tải dữ liệu workspace từ backend.</span>
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-current px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      Thử lại
    </button>
  );
}

function StateBanner({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  tone: "warning";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground"
      role="status"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function FullState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-80 flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function ContactLine({
  icon: Icon,
  value,
  fallback,
}: {
  icon: React.ElementType;
  value: string;
  fallback: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{value || fallback}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 break-words font-medium text-foreground">
          {value || "Chưa cung cấp"}
        </div>
      </div>
    </div>
  );
}
