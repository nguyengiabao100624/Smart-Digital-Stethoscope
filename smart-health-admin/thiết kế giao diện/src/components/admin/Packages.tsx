import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CreditCard,
  Edit,
  Loader2,
  Package as PackageIcon,
  Plus,
  Shield,
  Star,
  Trash2,
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
  const [backendError, setBackendError] = useState("");
  const [deleteAction, setDeleteAction] = useState<SmartHealthServicePackage | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [packageResponse, clinicResponse] = await Promise.all([
        smartHealthApi.listPackages(),
        smartHealthApi.listClinics(),
      ]);
      setPackages(packageResponse.packages);
      setWorkspaces(clinicResponse.clinics);
      setBackendError("");
    } catch (error) {
      setPackages([]);
      setBackendError(toVietnameseErrorMessage(error, "Không thể tải gói dịch vụ từ backend."));
    } finally {
      setIsLoading(false);
    }
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

  const segmentCounts = useMemo(() => {
    return workspaces.reduce<Record<string, number>>((acc, workspace) => {
      const key = workspace.workspaceType || "clinic";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [workspaces]);

  const handleEdit = (pkg: SmartHealthServicePackage) => {
    if (!canManagePackages) {
      toast.error("Tai khoan khong co quyen quan ly goi dich vu.");
      return;
    }
    setEditingPackage(pkg);
    setCreateDialogOpen(true);
  };

  const handleDelete = (pkg: SmartHealthServicePackage) => {
    if (!canManagePackages) {
      toast.error("Tai khoan khong co quyen quan ly goi dich vu.");
      return;
    }
    setDeleteError("");
    setDeleteAction(pkg);
  };

  const confirmDelete = async () => {
    const pkg = deleteAction;
    if (!pkg) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await smartHealthApi.deletePackage(pkg.id);
      toast.success("Đã xóa gói dịch vụ", {
        description: `${pkg.name} đã được gỡ khỏi backend.`,
      });
      setDeleteAction(null);
      await loadData();
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Vui lòng kiểm tra backend.");
      setDeleteError(message);
      toast.error("Không thể xóa gói dịch vụ", { description: message });
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteAssignedCount = deleteAction ? assignedCountByPackage[deleteAction.id] || 0 : 0;

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        eyebrow="Billing theo workspace"
        title="Gói dịch vụ & subscription"
        description="Quản lý gói cho bệnh viện/phòng khám, bác sĩ tư và cá nhân/gia đình theo giới hạn bác sĩ, hồ sơ/bệnh nhân, thiết bị kích hoạt, storage, AI và retention."
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

      {backendError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          {backendError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <AnimatedCard className="scan-sheen relative overflow-hidden bg-gradient-to-r from-primary to-secondary p-5 text-primary-foreground lg:col-span-3">
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="h-4 w-4" />
                Subscription workspace
              </div>
              <p className="mt-2 max-w-2xl text-sm text-white/85">
                {workspaces.length} workspace đang quản lý: {segmentCounts.hospital || 0} bệnh viện,{" "}
                {segmentCounts.clinic || 0} phòng khám, {segmentCounts.solo_practice || 0} bác sĩ
                tư, {segmentCounts.personal || 0} cá nhân/gia đình.
              </p>
            </div>
            <div className="rounded-md bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30">
              {packages.length} gói khả dụng
            </div>
          </div>
        </AnimatedCard>

        <AnimatedCard className="border-warning/30 bg-warning/10 p-5" delay={0.05}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-[#B45309]" />
            <div>
              <div className="font-semibold text-[#92400E]">Quota cần theo dõi</div>
              <p className="mt-1 text-sm leading-5 text-[#B45309]">
                Workspace vượt storage hoặc AI nên bị cảnh báo trước khi chặn thao tác.
              </p>
            </div>
          </div>
        </AnimatedCard>
      </div>

      {isLoading ? (
        <AnimatedCard className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải gói dịch vụ...
        </AnimatedCard>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {packages.map((pkg, index) => {
            const Icon = packageIcon(pkg);
            const assignedCount = assignedCountByPackage[pkg.id] || 0;
            const isPopular = pkg.type === "professional";
            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.25 }}
                whileHover={{ y: -3 }}
                className={`relative flex flex-col rounded-xl border bg-card p-5 shadow-sm ${
                  isPopular ? "border-primary pt-9 ring-1 ring-primary/20" : "border-border"
                }`}
              >
                {isPopular && (
                  <div className="absolute left-1/2 top-3 -translate-x-1/2">
                    <StatusBadge label="Được chọn nhiều" tone="info" />
                  </div>
                )}

                <div className="mb-4 flex items-center justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-lg ${isPopular ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Đang dùng</div>
                    <div className="text-lg font-semibold text-foreground">{assignedCount} WS</div>
                  </div>
                </div>

                <div className="mb-3">
                  <StatusBadge
                    label={segmentLabels[pkg.segment || "organization"] || "Khác"}
                    tone="muted"
                  />
                </div>
                <h3 className="text-xl font-bold text-foreground">{pkg.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-5 text-muted-foreground">
                  {pkg.type || "custom"} · {pkg.status || "active"}
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
                    <button
                      onClick={() => void handleDelete(pkg)}
                      className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-destructive transition-colors hover:bg-destructive/15"
                      aria-label="Xóa gói"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
        open={Boolean(deleteAction)}
        onOpenChange={(open) => {
          if (!open) setDeleteAction(null);
          setDeleteError("");
        }}
        title="Xóa gói dịch vụ"
        description={
          deleteAction ? (
            <span>
              Bạn có chắc chắn muốn xóa <strong>{deleteAction.name}</strong>?
              {deleteAssignedCount > 0 ? (
                <>
                  <br />
                  Đang có {deleteAssignedCount} workspace dùng gói này. Backend có thể từ chối nếu
                  gói còn được gán.
                </>
              ) : null}
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Xóa gói"
        tone="danger"
        loading={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
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
