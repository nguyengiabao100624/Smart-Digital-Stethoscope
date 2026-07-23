import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  Check,
  CreditCard,
  Edit,
  Loader2,
  Package as PackageIcon,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { CreatePackageDialog } from "./dialogs/CreatePackageDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { AnimatedCard, PageHeader, StatusBadge } from "./design-system";
import {
  smartHealthApi,
  type SmartHealthClinic,
  type SmartHealthServicePackage,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { CapabilityGate } from "./AdminAccessContext";
import { useAdminAccess } from "./useAdminAccess";
import { PACKAGE_MANAGE_CAPABILITIES } from "./action-permissions";
import {
  createPackageOperationIdempotencyKey,
  parsePackageMutationOutcome,
} from "@/lib/package-operations";

const segmentLabels: Record<string, string> = {
  organization: "Bệnh viện / phòng khám",
  solo_practice: "Bác sĩ tư",
  personal: "Cá nhân / gia đình",
};

const durationLabels: Record<string, string> = {
  monthly: "tháng",
  quarterly: "quý",
  yearly: "năm",
};

const packageTypeLabels: Record<string, string> = {
  trial: "Dùng thử",
  basic: "Cơ bản",
  professional: "Chuyên nghiệp",
  enterprise: "Doanh nghiệp",
  custom: "Tùy chỉnh",
  solo: "Bác sĩ tư",
  personal: "Cá nhân / gia đình",
};

function formatMoney(value?: number, currency = "VND") {
  if (!value) return "0đ";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLimit(value?: number, suffix = "") {
  if (!value) return "Không giới hạn";
  return `${new Intl.NumberFormat("vi-VN").format(value)}${suffix}`;
}

function packageIcon(pkg: SmartHealthServicePackage) {
  if (pkg.segment === "personal") return UserRound;
  if (pkg.segment === "solo_practice") return Users;
  if (pkg.type === "enterprise") return Shield;
  if (pkg.type === "professional") return Zap;
  return PackageIcon;
}

function packageLimitRows(pkg: SmartHealthServicePackage) {
  const isPersonal = pkg.segment === "personal";
  return [
    ...(isPersonal ? [] : [{ label: "Số bác sĩ", value: formatLimit(pkg.maxDoctors) }]),
    {
      label: isPersonal ? "Hồ sơ gia đình" : "Bệnh nhân theo dõi",
      value: formatLimit(pkg.maxPatients),
    },
    { label: "Thiết bị kích hoạt", value: formatLimit(pkg.maxDevices) },
    { label: "Dung lượng audio", value: formatLimit(pkg.storageGb, " GB") },
    { label: "Lượt AI/tháng", value: formatLimit(pkg.aiMonthly) },
    { label: "Retention policy", value: formatLimit(pkg.retentionDays, " ngày") },
  ];
}

export function Packages() {
  const { hasAnyCapability } = useAdminAccess();
  const canManagePackages = hasAnyCapability(PACKAGE_MANAGE_CAPABILITIES);
  const [packages, setPackages] = useState<SmartHealthServicePackage[]>([]);
  const [workspaces, setWorkspaces] = useState<SmartHealthClinic[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SmartHealthServicePackage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [packageError, setPackageError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("all");
  const [archiveAction, setArchiveAction] = useState<SmartHealthServicePackage | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [isArchiving, setIsArchiving] = useState(false);
  const archiveIdempotencyKeysRef = React.useRef(new Map<string, string>());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [packageResult, workspaceResult] = await Promise.allSettled([
      smartHealthApi.listPackages(),
      smartHealthApi.listClinics(),
    ]);
    if (packageResult.status === "fulfilled") {
      setPackages(packageResult.value.packages);
      setPackageError("");
    } else {
      setPackages([]);
      setPackageError(
        toVietnameseErrorMessage(packageResult.reason, "Không thể tải gói dịch vụ từ backend."),
      );
    }
    if (workspaceResult.status === "fulfilled") {
      setWorkspaces(workspaceResult.value.clinics);
      setWorkspaceError("");
    } else {
      setWorkspaces([]);
      setWorkspaceError(
        toVietnameseErrorMessage(
          workspaceResult.reason,
          "Không thể tải số workspace đang sử dụng gói.",
        ),
      );
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const assignedCountByPackage = useMemo(() => {
    return workspaces.reduce<Record<string, number>>((acc, workspace) => {
      if (workspace.packageId) acc[workspace.packageId] = (acc[workspace.packageId] || 0) + 1;
      return acc;
    }, {});
  }, [workspaces]);

  const filteredPackages = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("vi-VN");
    return packages.filter((pkg) => {
      const status = pkg.status === "archived" ? "archived" : "active";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!query) return true;
      return [pkg.name, pkg.id, pkg.type, pkg.segment]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("vi-VN").includes(query));
    });
  }, [packages, searchTerm, statusFilter]);

  const activePackageCount = packages.filter((pkg) => pkg.status !== "archived").length;
  const archivedPackageCount = packages.length - activePackageCount;
  const assignedWorkspaceCount = Object.values(assignedCountByPackage).reduce(
    (sum, count) => sum + count,
    0,
  );

  const handleEdit = (pkg: SmartHealthServicePackage) => {
    if (!canManagePackages) {
      toast.error("Tài khoản không có quyền quản lý gói dịch vụ.");
      return;
    }
    setEditingPackage(pkg);
    setCreateDialogOpen(true);
  };

  const handleArchive = (pkg: SmartHealthServicePackage) => {
    if (!canManagePackages) {
      toast.error("Tài khoản không có quyền quản lý gói dịch vụ.");
      return;
    }
    setArchiveError("");
    setArchiveAction(pkg);
  };

  const confirmArchive = async () => {
    const pkg = archiveAction;
    if (!pkg) return;
    setIsArchiving(true);
    setArchiveError("");
    const idempotencyKey =
      archiveIdempotencyKeysRef.current.get(pkg.id) ||
      createPackageOperationIdempotencyKey("archive", pkg.id);
    archiveIdempotencyKeysRef.current.set(pkg.id, idempotencyKey);
    try {
      const response = await smartHealthApi.archivePackage(pkg.id, idempotencyKey);
      parsePackageMutationOutcome(response, "archive", { id: pkg.id });
      archiveIdempotencyKeysRef.current.delete(pkg.id);
      toast.success("Đã lưu trữ gói dịch vụ", {
        description: `${pkg.name} không còn khả dụng cho lần gán mới.`,
      });
      setArchiveAction(null);
      await loadData();
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Backend chưa xác nhận việc lưu trữ gói.");
      setArchiveError(message);
      toast.error("Không thể lưu trữ gói dịch vụ", { description: message });
    } finally {
      setIsArchiving(false);
    }
  };

  const archiveAssignedCount = archiveAction
    ? workspaceError
      ? null
      : assignedCountByPackage[archiveAction.id] || 0
    : 0;

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        eyebrow="Billing theo workspace"
        title="Gói dịch vụ & subscription"
        description="Quản lý danh mục gói và quota hiển thị cho workspace. Billing hiện là quy trình thủ công, không thu tiền trực tuyến."
        action={
          <CapabilityGate capabilities={PACKAGE_MANAGE_CAPABILITIES}>
            <button
              onClick={() => {
                setEditingPackage(null);
                setCreateDialogOpen(true);
              }}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Tạo gói mới
            </button>
          </CapabilityGate>
        }
      />

      {packageError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-semibold">Không thể tải danh mục gói</p>
            <p className="mt-1">{packageError}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-destructive/30 px-3 font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Thử lại
          </button>
        </div>
      ) : null}

      {workspaceError && !packageError ? (
        <div
          role="status"
          className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
        >
          <p className="font-semibold">Dữ liệu gán workspace đang tạm thiếu</p>
          <p className="mt-1">{workspaceError} Danh mục gói vẫn có thể xem và chỉnh sửa.</p>
        </div>
      ) : null}

      {!packageError ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PackageMetric
            icon={<PackageIcon className="h-5 w-5" />}
            label="Gói đang hoạt động"
            value={activePackageCount}
          />
          <PackageMetric
            icon={<Archive className="h-5 w-5" />}
            label="Gói đã lưu trữ"
            value={archivedPackageCount}
          />
          <PackageMetric
            icon={<CreditCard className="h-5 w-5" />}
            label="Workspace có gán gói"
            value={workspaceError ? "Chưa xác định" : assignedWorkspaceCount}
          />
        </div>
      ) : null}

      {!packageError ? (
        <AnimatedCard className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full md:max-w-md">
            <span className="sr-only">Tìm gói dịch vụ</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Tìm theo tên, mã, loại gói..."
              className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Trạng thái</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | "active" | "archived")
              }
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground"
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang hoạt động</option>
              <option value="archived">Đã lưu trữ</option>
            </select>
          </label>
        </AnimatedCard>
      ) : null}

      {isLoading && !packageError ? (
        <AnimatedCard className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải gói dịch vụ...
        </AnimatedCard>
      ) : packageError ? null : packages.length === 0 ? (
        <AnimatedCard className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <PackageIcon className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">Chưa có gói dịch vụ</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Tạo gói đầu tiên để hiển thị quota và billing summary cho workspace.
          </p>
        </AnimatedCard>
      ) : filteredPackages.length === 0 ? (
        <AnimatedCard className="px-6 py-12 text-center">
          <h2 className="font-semibold text-foreground">Không có gói phù hợp</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Thử đổi từ khóa hoặc bộ lọc trạng thái.
          </p>
        </AnimatedCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {filteredPackages.map((pkg, index) => {
            const Icon = packageIcon(pkg);
            const assignedCount = assignedCountByPackage[pkg.id] || 0;
            const isArchived = pkg.status === "archived";
            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.25 }}
                whileHover={{ y: -2 }}
                className={`relative flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm ${
                  isArchived ? "opacity-80" : ""
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Đang dùng</div>
                    <div className="text-lg font-semibold text-foreground">
                      {workspaceError ? "—" : `${assignedCount} WS`}
                    </div>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  <StatusBadge
                    label={segmentLabels[pkg.segment || "organization"] || "Khác"}
                    tone="muted"
                  />
                  <StatusBadge
                    label={isArchived ? "Đã lưu trữ" : "Đang hoạt động"}
                    tone={isArchived ? "muted" : "success"}
                  />
                </div>
                <h3 className="text-xl font-bold text-foreground">{pkg.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-5 text-muted-foreground">
                  {packageTypeLabels[pkg.type || "custom"] || "Tùy chỉnh"} · {pkg.id}
                </p>

                <div className="my-5 border-b border-border pb-5">
                  <span className="text-3xl font-bold text-foreground">
                    {formatMoney(pkg.price, pkg.currency)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {durationLabels[pkg.duration || "monthly"] || pkg.duration}
                  </span>
                </div>

                <div className="flex-1 space-y-3 text-sm">
                  {packageLimitRows(pkg).map((limit) => (
                    <Limit key={limit.label} label={limit.label} value={limit.value} />
                  ))}
                </div>

                <CapabilityGate capabilities={PACKAGE_MANAGE_CAPABILITIES}>
                  <div className="mt-6 flex gap-2">
                    <button
                      onClick={() => handleEdit(pkg)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border py-2 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <Edit className="h-4 w-4" />
                      Sửa
                    </button>
                    {!isArchived ? (
                      <button
                        onClick={() => handleArchive(pkg)}
                        className="min-h-11 min-w-11 rounded-md border border-warning/25 bg-warning/10 p-2 text-warning-foreground transition-colors hover:bg-warning/15"
                        aria-label={`Lưu trữ gói ${pkg.name}`}
                      >
                        <Archive className="mx-auto h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </CapabilityGate>
              </motion.div>
            );
          })}
        </div>
      )}

      <CreatePackageDialog
        open={canManagePackages && createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setEditingPackage(null);
        }}
        packageToEdit={editingPackage}
        onSaved={loadData}
      />
      <ConfirmActionDialog
        open={Boolean(archiveAction)}
        onOpenChange={(open) => {
          if (!open) setArchiveAction(null);
          setArchiveError("");
        }}
        title="Lưu trữ gói dịch vụ"
        description={
          archiveAction ? (
            <span>
              Gói <strong>{archiveAction.name}</strong> sẽ không còn khả dụng cho lần gán mới.
              {archiveAssignedCount === null ? (
                <>
                  <br />
                  Chưa tải được số workspace đang dùng; backend sẽ kiểm tra lại trước khi lưu.
                </>
              ) : archiveAssignedCount > 0 ? (
                <>
                  <br />
                  Đang có {archiveAssignedCount} workspace dùng gói này. Hãy chuyển các workspace
                  sang gói khác trước.
                </>
              ) : (
                <>
                  <br />
                  Gói không được gán cho workspace nào.
                </>
              )}
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Lưu trữ gói"
        tone="danger"
        loading={isArchiving}
        error={archiveError}
        onConfirm={confirmArchive}
      />
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Check className="h-4 w-4 text-success" />
        {label}
      </span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function PackageMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <AnimatedCard className="flex items-center gap-4 p-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      </div>
    </AnimatedCard>
  );
}
