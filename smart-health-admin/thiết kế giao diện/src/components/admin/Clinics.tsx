import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Filter,
  Plus,
  MoreVertical,
  Building2,
  MapPin,
  Phone,
  Mail,
  Activity,
  Edit,
  Trash2,
  Lock,
  Unlock,
  X,
  ShieldCheck,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { toast } from "sonner";
import { AddClinicDialog } from "./dialogs/AddClinicDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { PageHeader, StatusBadge, Timeline } from "./design-system";
import { ADMIN_TABLE_PAGE_SIZE, PaginationFooter, paginateItems } from "./PaginationFooter";
import { smartHealthApi, type SmartHealthApiError, type SmartHealthClinic } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { CapabilityGate, useAdminAccess } from "./AdminAccessContext";
import { WORKSPACE_MANAGE_CAPABILITIES } from "./action-permissions";

type Clinic = {
  id: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  email: string;
  status: string;
  workspaceType: string;
  packageId: string;
  subscriptionStatus: string;
  billingCycle: string;
  userCount: number;
  deviceCount: number;
  doctorCount: number;
  patientCount: number;
  joinDate: string;
  rawType: string;
  website: string;
  createdAt: string;
  updatedAt: string;
};

function mapBackendClinic(clinic: SmartHealthClinic): Clinic {
  return {
    id: clinic.id,
    name: clinic.name,
    workspaceType: clinic.workspaceType || (clinic.type === "hospital" ? "hospital" : "clinic"),
    packageId: clinic.packageId || "",
    subscriptionStatus: clinic.subscriptionStatus || "trial",
    billingCycle: clinic.billingCycle || "monthly",
    rawType: clinic.type || "general",
    type:
      clinic.type === "cardiology"
        ? "Chuyên khoa Tim mạch"
        : clinic.type === "respiratory"
          ? "Chuyên khoa Hô hấp"
          : clinic.type === "pediatrics"
            ? "Chuyên khoa Nhi"
            : clinic.type === "hospital"
              ? "Bệnh viện"
              : clinic.type === "clinic"
                ? "Phòng khám"
                : clinic.type === "general"
                  ? "Đa khoa"
                  : clinic.type || "Khác",
    address: clinic.address || "Chưa cung cấp",
    phone: clinic.phone || "--",
    email: clinic.email || "--",
    status: clinic.status || "active",
    userCount: clinic.userCount || 0,
    deviceCount: clinic.deviceCount || 0,
    doctorCount: clinic.doctorCount || 0,
    patientCount: clinic.patientCount || 0,
    website: clinic.website || "",
    createdAt: clinic.createdAt || "",
    updatedAt: clinic.updatedAt || "",
    joinDate: clinic.createdAt
      ? new Intl.DateTimeFormat("vi-VN").format(new Date(clinic.createdAt))
      : "Chưa ghi nhận",
  };
}

type ClinicDeleteDetails = {
  accounts?: number;
  doctors?: number;
  patients?: number;
  devices?: number;
  total?: number;
};

function getClinicDeleteDetails(error: unknown): ClinicDeleteDetails | null {
  const payload = (error as SmartHealthApiError | undefined)?.payload;
  if (!payload || typeof payload !== "object") return null;
  const directDetails = (payload as { details?: unknown }).details;
  const nestedDetails = (payload as { error?: { details?: unknown } }).error?.details;
  const details = directDetails || nestedDetails;
  if (!details || typeof details !== "object") return null;
  return details as ClinicDeleteDetails;
}

function formatClinicLinks(summary: ClinicDeleteDetails) {
  const accounts = Number(summary.accounts || 0);
  const doctors = Number(summary.doctors || 0);
  const patients = Number(summary.patients || 0);
  const devices = Number(summary.devices || 0);
  return `${accounts} tài khoản (${doctors} bác sĩ), ${patients} bệnh nhân, ${devices} thiết bị`;
}

export function Clinics() {
  const { hasAnyCapability } = useAdminAccess();
  const canManageWorkspaces = hasAnyCapability(WORKSPACE_MANAGE_CAPABILITIES);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [backendError, setBackendError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [deleteAction, setDeleteAction] = useState<Clinic | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const loadClinics = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await smartHealthApi.listClinics();
      const mappedClinics = response.clinics.map(mapBackendClinic);
      setClinics(mappedClinics);
      setSelectedClinic((current) =>
        current ? mappedClinics.find((clinic) => clinic.id === current.id) || null : null,
      );
      setBackendError("");
    } catch (error) {
      setClinics([]);
      setBackendError(toVietnameseErrorMessage(error, "Không thể tải danh sách phòng khám."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadClinics();
  }, [loadClinics]);

  const visibleClinics = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return clinics.filter((clinic) => {
      const matchesSearch =
        !keyword ||
        [clinic.id, clinic.name, clinic.phone, clinic.email, clinic.type]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      const matchesStatus = filterStatus === "all" || clinic.status === filterStatus;
      const matchesType =
        filterType === "all" ||
        (filterType === "organization" && ["hospital", "clinic"].includes(clinic.workspaceType)) ||
        filterType === clinic.workspaceType;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [clinics, filterStatus, filterType, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterType, filterStatus, clinics.length]);

  const pagedClinics = useMemo(
    () => paginateItems(visibleClinics, page, ADMIN_TABLE_PAGE_SIZE),
    [page, visibleClinics],
  );

  const openCreateDialog = () => {
    if (!canManageWorkspaces) {
      toast.error("Tai khoan khong co quyen quan ly workspace.");
      return;
    }
    setEditingClinic(null);
    setAddDialogOpen(true);
  };

  const openEditDialog = (clinic: Clinic) => {
    if (!canManageWorkspaces) {
      toast.error("Tai khoan khong co quyen quan ly workspace.");
      return;
    }
    setEditingClinic(clinic);
    setAddDialogOpen(true);
  };

  const handleToggleStatus = async (clinic: Clinic) => {
    if (!canManageWorkspaces) {
      toast.error("Tai khoan khong co quyen quan ly workspace.");
      return;
    }
    const nextStatus = clinic.status === "active" ? "inactive" : "active";
    try {
      await smartHealthApi.updateClinic(clinic.id, { status: nextStatus });
      toast.success(nextStatus === "active" ? "Đã mở khóa phòng khám" : "Đã tạm khóa phòng khám", {
        description:
          nextStatus === "active"
            ? `${clinic.name} đã xuất hiện lại trong catalog đăng ký.`
            : `${clinic.name} đã bị ẩn khỏi catalog đăng ký của bác sĩ.`,
      });
      await loadClinics();
    } catch (error) {
      toast.error(nextStatus === "active" ? "Không thể mở khóa phòng khám" : "Không thể tạm khóa phòng khám", {
        description: toVietnameseErrorMessage(error, "Vui lòng kiểm tra backend."),
      });
    }
  };

  const handleDelete = (clinic: Clinic) => {
    if (!canManageWorkspaces) {
      toast.error("Tai khoan khong co quyen quan ly workspace.");
      return;
    }
    setDeleteError("");
    setDeleteAction(clinic);
  };

  const confirmDelete = async () => {
    const clinic = deleteAction;
    if (!clinic) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await smartHealthApi.deleteClinic(clinic.id);
      toast.success("Đã xóa phòng khám", {
        description: `${clinic.name} đã được gỡ khỏi hệ thống.`,
      });
      setSelectedClinic((current) => (current?.id === clinic.id ? null : current));
      setDeleteAction(null);
      await loadClinics();
    } catch (error) {
      const apiMessage = toVietnameseErrorMessage(
        error,
        "Phòng khám có thể đang còn tài khoản, bệnh nhân hoặc thiết bị liên kết.",
      );
      const deleteDetails = getClinicDeleteDetails(error);
      const message = deleteDetails
        ? `${apiMessage}. Backend đang ghi nhận: ${formatClinicLinks(deleteDetails)}.`
        : apiMessage;
      setDeleteError(message);
      toast.error("Không thể xóa phòng khám", { description: message });
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteResourceSummary = deleteAction
    ? {
        accounts: deleteAction.userCount,
        doctors: deleteAction.doctorCount,
        patients: deleteAction.patientCount,
        devices: deleteAction.deviceCount,
      }
    : null;
  const deleteResourceCount = deleteResourceSummary
    ? deleteResourceSummary.accounts + deleteResourceSummary.patients + deleteResourceSummary.devices
    : 0;

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      <PageHeader
        eyebrow="Tổ chức B2B"
        title="Quản lý phòng khám"
        description="Quản lý thông tin pháp lý, người đại diện, thành viên, thiết bị được gán, subscription và audit log."
        action={
          <CapabilityGate capabilities={WORKSPACE_MANAGE_CAPABILITIES}>
            <button
              onClick={openCreateDialog}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Tạo phòng khám
            </button>
          </CapabilityGate>
        }
      />

      {backendError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          {backendError}
        </div>
      )}

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-muted/20">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm tên, mã phòng khám, SDT..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-shadow"
            />
          </div>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button className="flex items-center justify-center gap-2 px-4 py-2 bg-card border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors flex-shrink-0">
                <Filter className="w-4 h-4" /> Lọc
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="bg-popover border border-border rounded-lg shadow-lg p-4 w-80 z-50 mr-4"
                sideOffset={5}
              >
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Bộ lọc</h3>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Loại hình
                      </label>
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả workspace</option>
                        <option value="organization">Bệnh viện / phòng khám</option>
                        <option value="solo_practice">Bác sĩ tư</option>
                        <option value="personal">Cá nhân / gia đình</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Trạng thái
                      </label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả trạng thái</option>
                        <option value="active">Đang hoạt động</option>
                        <option value="inactive">Ngừng hoạt động</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => {
                        setFilterType("all");
                        setFilterStatus("all");
                      }}
                      className="flex-1 px-3 py-1.5 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors"
                    >
                      Đặt lại
                    </button>
                    <Popover.Close asChild>
                      <button className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                        Áp dụng
                      </button>
                    </Popover.Close>
                  </div>
                </div>
                <Popover.Arrow className="fill-border" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Thông tin phòng khám</th>
                <th className="px-5 py-3 font-medium">Liên hệ</th>
                <th className="px-5 py-3 font-medium text-center">Tài nguyên</th>
                <th className="px-5 py-3 font-medium">Trạng thái</th>
                <th className="px-5 py-3 font-medium">Ngày tham gia</th>
                <th className="px-5 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedClinics.map((clinic) => (
                <tr key={clinic.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <button
                          onClick={() => setSelectedClinic(clinic)}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {clinic.name}
                        </button>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="text-primary font-medium">{clinic.id}</span>
                          <span>•</span>
                          <span>{clinic.type}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{clinic.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{clinic.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-4 text-xs font-medium">
                      <div className="flex flex-col items-center">
                        <span className="text-foreground">{clinic.doctorCount}</span>
                        <span className="text-muted-foreground text-[10px]">Bác sĩ</span>
                      </div>
                      <div className="w-px h-6 bg-border"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-foreground">{clinic.deviceCount}</span>
                        <span className="text-muted-foreground text-[10px]">Thiết bị</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {clinic.status === "active" ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-success mr-1.5"></span>
                        Đang hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mr-1.5"></span>
                        Ngừng hoạt động
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{clinic.joinDate}</td>
                  <td className="px-5 py-4 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors outline-none">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="min-w-[160px] bg-popover text-popover-foreground rounded-md shadow-md border border-border p-1 z-50 mr-2">
                          <DropdownMenu.Item
                            onSelect={() => setSelectedClinic(clinic)}
                            className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2"
                          >
                            <Activity className="w-4 h-4" /> Thống kê
                          </DropdownMenu.Item>
                          {canManageWorkspaces && (
                            <>
                              <DropdownMenu.Item
                                onSelect={() => openEditDialog(clinic)}
                                className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2"
                              >
                                <Edit className="w-4 h-4" /> Chỉnh sửa
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onSelect={() => {
                                  void handleToggleStatus(clinic);
                                }}
                                className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2"
                              >
                                {clinic.status === "active" ? (
                                  <>
                                    <Lock className="w-4 h-4" /> Tạm khóa
                                  </>
                                ) : (
                                  <>
                                    <Unlock className="w-4 h-4" /> Mở khóa
                                  </>
                                )}
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-px bg-border my-1" />
                              <DropdownMenu.Item
                                onSelect={() => {
                                  void handleDelete(clinic);
                                }}
                                className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-destructive/10 text-destructive hover:text-destructive rounded-sm flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" /> Xóa
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}
              {!isLoading && visibleClinics.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy phòng khám phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          totalItems={visibleClinics.length}
          sourceTotalItems={clinics.length}
          itemLabel="phòng khám"
          onPageChange={setPage}
        />
      </div>

      <AddClinicDialog
        open={canManageWorkspaces && addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) setEditingClinic(null);
        }}
        onCreated={loadClinics}
        clinic={
          editingClinic
            ? {
                id: editingClinic.id,
                name: editingClinic.name,
                type: editingClinic.rawType,
                address: editingClinic.address === "Chưa cung cấp" ? "" : editingClinic.address,
                phone: editingClinic.phone === "--" ? "" : editingClinic.phone,
                email: editingClinic.email === "--" ? "" : editingClinic.email,
                website: editingClinic.website,
                status: editingClinic.status,
                doctorCount: editingClinic.doctorCount,
                patientCount: editingClinic.patientCount,
                deviceCount: editingClinic.deviceCount,
                createdAt: editingClinic.createdAt,
                updatedAt: editingClinic.updatedAt,
              }
            : null
        }
      />

      <ConfirmActionDialog
        open={Boolean(deleteAction)}
        onOpenChange={(open) => {
          if (!open) setDeleteAction(null);
          setDeleteError("");
        }}
        title="Xóa phòng khám"
        description={
          deleteAction ? (
            <span>
              Bạn có chắc chắn muốn xóa <strong>{deleteAction.name}</strong>? Hành động này không thể hoàn tác.
              {deleteResourceCount > 0 ? (
                <>
                  <br />
                  Hệ thống đang ghi nhận: {formatClinicLinks(deleteResourceSummary || {})}. Backend sẽ từ chối xóa
                  cho đến khi các liên kết này được chuyển hoặc gỡ.
                </>
              ) : null}
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Xóa phòng khám"
        tone="danger"
        loading={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
      />

      <AnimatePresence>
        {selectedClinic && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedClinic(null)}
              className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-card shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{selectedClinic.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedClinic.id} • {selectedClinic.type}
                    </p>
                    <div className="mt-2">
                      {selectedClinic.status === "active" ? (
                        <StatusBadge label="Đang hoạt động" tone="success" pulse />
                      ) : (
                        <StatusBadge label="Ngừng hoạt động" tone="muted" />
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedClinic(null)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                <section className="grid grid-cols-2 gap-3">
                  <ClinicMetric label="Số bác sĩ" value={selectedClinic.doctorCount} />
                  <ClinicMetric label="Số bệnh nhân" value={selectedClinic.patientCount} />
                  <ClinicMetric label="Số thiết bị" value={selectedClinic.deviceCount} />
                  <ClinicMetric label="Dung lượng audio" value="824 GB" />
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Thông tin pháp lý</h3>
                  <div className="space-y-3 text-sm">
                    <InfoLine icon={ShieldCheck} label="Mã số pháp lý" value="MST-0312-889-221" />
                    <InfoLine icon={MapPin} label="Địa chỉ" value={selectedClinic.address} />
                    <InfoLine
                      icon={Phone}
                      label="Người đại diện"
                      value="Nguyễn Gia Bảo / 0909 888 777"
                    />
                    <InfoLine icon={Mail} label="Email" value={selectedClinic.email} />
                  </div>
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Subscription</h3>
                  <div className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2">
                    <span className="text-sm text-muted-foreground">Gói hiện tại</span>
                    <StatusBadge label="Clinic Pro" tone="info" />
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    Chu kỳ thanh toán kế tiếp: 01/06/2026
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 text-sm font-semibold text-foreground">Audit log</h3>
                  <Timeline
                    items={[
                      {
                        title: "Tạo phòng khám",
                        time: selectedClinic.joinDate,
                        description: "Admin hệ thống tạo tổ chức và gán gói dịch vụ.",
                        tone: "primary",
                      },
                      {
                        title: "Gán thiết bị",
                        time: "18/05/2026",
                        description: `${selectedClinic.deviceCount} thiết bị đang thuộc phòng khám.`,
                        tone: "success",
                      },
                      {
                        title: "Cập nhật subscription",
                        time: "01/05/2026",
                        description: "Nâng cấp lên Clinic Pro.",
                        tone: "warning",
                      },
                    ]}
                  />
                </section>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClinicMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
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
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}
