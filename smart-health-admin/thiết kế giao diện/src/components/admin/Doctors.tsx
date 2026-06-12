import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Filter,
  Plus,
  MoreVertical,
  Stethoscope,
  Mail,
  Phone,
  Building2,
  Calendar,
  Eye,
  Edit,
  Trash2,
  Lock,
  LockOpen,
  X,
  ShieldCheck,
  UserPlus,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { AddDoctorDialog } from "./dialogs/AddDoctorDialog";
import { PageHeader, StatusBadge, Timeline } from "./design-system";
import { ADMIN_TABLE_PAGE_SIZE, PaginationFooter, paginateItems } from "./PaginationFooter";
import { smartHealthApi, type SmartHealthAuthUser } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { CapabilityGate, useAdminAccess } from "./AdminAccessContext";
import {
  PLATFORM_USER_MANAGE_CAPABILITIES,
  STAFF_MANAGE_CAPABILITIES,
} from "./action-permissions";

type Doctor = {
  id: string;
  name: string;
  specialty: string;
  clinic: string;
  phone: string;
  email: string;
  status: string;
  patientsCount: number;
  measurementsCount: number;
  joinDate: string;
  avatarColor: string;
};

function formatDate(value?: string) {
  if (!value) return "Chưa ghi nhận";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function toDoctor(user: SmartHealthAuthUser): Doctor {
  return {
    id: user.id,
    name: user.name || user.email || "Bác sĩ chưa cập nhật tên",
    specialty: user.department || "Chưa cung cấp",
    clinic: user.hospital || "Chưa xác định",
    phone: user.phone || "Chưa cung cấp",
    email: user.email || "Chưa có email",
    status: user.accountStatus === "locked" ? "inactive" : "active",
    patientsCount: 0,
    measurementsCount: 0,
    joinDate: formatDate(user.roleApprovedAt || user.updatedAt || user.createdAt),
    avatarColor: "bg-blue-100 text-blue-600",
  };
}

export function Doctors() {
  const { hasAnyCapability } = useAdminAccess();
  const canManageStaff = hasAnyCapability(STAFF_MANAGE_CAPABILITIES);
  const canManagePlatformUsers = hasAnyCapability(PLATFORM_USER_MANAGE_CAPABILITIES);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState("all");
  const [filterClinic, setFilterClinic] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    description: string;
    confirm: string;
    tone?: "danger" | "success";
    action: () => Promise<void>;
  }>(null);

  const handleConfirmAction = async () => {
    if (confirmAction) {
      await confirmAction.action();
      setConfirmAction(null);
    }
  };

  const loadDoctors = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await smartHealthApi.listApprovedDoctors();
      setDoctors(response.doctors.map(toDoctor));
      setLoadError("");
    } catch (error) {
      setDoctors([]);
      setLoadError(toVietnameseErrorMessage(error, "Không thể tải danh sách bác sĩ đã duyệt."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSyncFirebase = async () => {
    if (!canManagePlatformUsers) {
      toast.error("Tài khoản không có quyền đồng bộ Firebase.");
      return;
    }
    try {
      const { deletedCount } = await smartHealthApi.syncFirebase();
      toast.success(`Đã đồng bộ Firebase. Xóa ${deletedCount} tài khoản không còn tồn tại trên Firebase.`);
      void loadDoctors();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Có lỗi khi đồng bộ Firebase");
    }
  };

  const handleDelete = (doc: Doctor) => {
    if (!canManageStaff) {
      toast.error("Tài khoản không có quyền quản lý bác sĩ.");
      return;
    }
    setConfirmAction({
      title: "Xóa bác sĩ và tài khoản Firebase",
      description: `Bạn có chắc chắn muốn xóa bác sĩ ${doc.name}? Hệ thống sẽ xóa hồ sơ backend, phiên đăng nhập, phân quyền và tài khoản Firebase Auth nếu tài khoản đã liên kết. Hành động này không thể hoàn tác.`,
      confirm: "Xóa bác sĩ",
      tone: "danger",
      action: async () => {
        try {
          const result = await smartHealthApi.deleteDoctor(doc.id);
          if (selectedDoctor?.id === doc.id) setSelectedDoctor(null);
          void loadDoctors();
          if (result.warning) {
            toast.warning(result.warning);
          } else if (result.firebaseDeleted) {
            toast.success("Đã xóa bác sĩ và tài khoản Firebase Auth.");
          } else if (result.firebaseAlreadyMissing) {
            toast.success("Đã xóa dữ liệu bác sĩ. Tài khoản Firebase Auth không còn tồn tại trước đó.");
          } else {
            toast.success("Đã xóa bác sĩ.");
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Có lỗi xảy ra khi xóa");
        }
      },
    });
  };

  const handleLock = (doc: Doctor) => {
    if (!canManageStaff) {
      toast.error("Tài khoản không có quyền quản lý bác sĩ.");
      return;
    }
    setConfirmAction({
      title: "Khóa tài khoản",
      description: `Khóa tài khoản ${doc.name}? Họ sẽ không thể đăng nhập với quyền bác sĩ nữa.`,
      confirm: "Khóa tài khoản",
      tone: "danger",
      action: async () => {
        try {
          const result = await smartHealthApi.lockDoctor(doc.id);
          if (selectedDoctor?.id === doc.id) setSelectedDoctor(null);
          void loadDoctors();
          if (result.warning) {
            toast.warning(result.warning);
          } else {
            toast.success("Đã khóa tài khoản bác sĩ.");
          }
        } catch (e) {
          toast.error(toVietnameseErrorMessage(e, "Có lỗi xảy ra khi khóa"));
        }
      },
    });
  };

  const handleUnlock = (doc: Doctor) => {
    if (!canManageStaff) {
      toast.error("Tài khoản không có quyền quản lý bác sĩ.");
      return;
    }
    setConfirmAction({
      title: "Mở khóa tài khoản",
      description: `Khôi phục quyền bác sĩ cho ${doc.name}? Họ sẽ có thể đăng nhập lại vào hệ thống dành cho bác sĩ.`,
      confirm: "Mở khóa tài khoản",
      tone: "success",
      action: async () => {
        try {
          const result = await smartHealthApi.unlockDoctor(doc.id);
          if (selectedDoctor?.id === doc.id) setSelectedDoctor(null);
          void loadDoctors();
          if (result.warning) {
            toast.warning(result.warning);
          } else {
            toast.success("Đã mở khóa tài khoản bác sĩ.");
          }
        } catch (e) {
          toast.error(toVietnameseErrorMessage(e, "Có lỗi xảy ra khi mở khóa"));
        }
      },
    });
  };

  useEffect(() => {
    void loadDoctors();
  }, [loadDoctors]);

  const filteredDoctors = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return doctors.filter((doc) => {
      const matchesSearch =
        !keyword ||
        doc.name.toLowerCase().includes(keyword) ||
        doc.email.toLowerCase().includes(keyword) ||
        doc.phone.toLowerCase().includes(keyword);
      const matchesStatus = filterStatus === "all" || doc.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [doctors, filterStatus, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterSpecialty, filterClinic, filterStatus, doctors.length]);

  const pagedDoctors = useMemo(
    () => paginateItems(filteredDoctors, page, ADMIN_TABLE_PAGE_SIZE),
    [filteredDoctors, page],
  );

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      <PageHeader
        eyebrow="Tài khoản đã duyệt"
        title="Quản lý bác sĩ"
        description="Quản lý vai trò, trạng thái tài khoản, phòng khám, bệnh nhân được gán và quyền truy cập hồ sơ."
        action={
          <div className="flex items-center gap-2">
            <CapabilityGate capabilities={PLATFORM_USER_MANAGE_CAPABILITIES}>
              <button
                onClick={handleSyncFirebase}
                className="flex items-center gap-2 bg-card border border-border text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-muted transition-colors shadow-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Đồng bộ Firebase
              </button>
            </CapabilityGate>
            <CapabilityGate capabilities={STAFF_MANAGE_CAPABILITIES}>
              <button
                onClick={() => setAddDialogOpen(true)}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Thêm bác sĩ
              </button>
            </CapabilityGate>
          </div>
        }
      />

      {loadError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          Chưa tải được danh sách bác sĩ đã duyệt từ backend. Trang không dùng dữ liệu mẫu để tránh hiển thị sai: {loadError}
        </div>
      )}

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-muted/20">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm tên bác sĩ, email, SĐT..."
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
                        Chuyên khoa
                      </label>
                      <select
                        value={filterSpecialty}
                        onChange={(e) => setFilterSpecialty(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả chuyên khoa</option>
                        <option value="cardio">Tim mạch</option>
                        <option value="respiratory">Hô hấp</option>
                        <option value="pediatrics">Nhi khoa</option>
                        <option value="general">Đa khoa</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Phòng khám
                      </label>
                      <select
                        value={filterClinic}
                        onChange={(e) => setFilterClinic(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả phòng khám</option>
                        <option value="tamanh">PK Đa khoa Tâm Anh</option>
                        <option value="hohapviet">PK Hô hấp Việt</option>
                        <option value="minhtam">PK Tim mạch Minh Tâm</option>
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
                        <option value="inactive">Đã khóa</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => {
                        setFilterSpecialty("all");
                        setFilterClinic("all");
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
                <th className="px-5 py-3 font-medium">Bác sĩ</th>
                <th className="px-5 py-3 font-medium">Liên hệ</th>
                <th className="px-5 py-3 font-medium">Nơi công tác</th>
                <th className="px-5 py-3 font-medium text-center">Hoạt động</th>
                <th className="px-5 py-3 font-medium">Trạng thái</th>
                <th className="px-5 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedDoctors.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${doc.avatarColor}`}
                      >
                        {doc.name.split(" ").pop()?.charAt(0)}
                      </div>
                      <div>
                        <button
                          onClick={() => setSelectedDoctor(doc)}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {doc.name}
                        </button>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="text-primary font-medium">{doc.id}</span>
                          <span>•</span>
                          <span>{doc.specialty}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{doc.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{doc.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Building2 className="w-4 h-4" />
                      <span>{doc.clinic}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-4 text-xs font-medium">
                      <div className="flex flex-col items-center">
                        <span className="text-foreground">{doc.patientsCount}</span>
                        <span className="text-muted-foreground text-[10px]">Bệnh nhân</span>
                      </div>
                      <div className="w-px h-6 bg-border"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-foreground">{doc.measurementsCount}</span>
                        <span className="text-muted-foreground text-[10px]">Lượt khám</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {doc.status === "active" ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success border border-success/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-success mr-1.5 animate-pulse"></span>
                        Đang hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground mr-1.5"></span>
                        Đã khóa
                      </span>
                    )}
                  </td>
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
                            onSelect={() => setSelectedDoctor(doc)}
                            className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /> Xem hồ sơ
                          </DropdownMenu.Item>
                          {canManageStaff && (
                            <>
                              <DropdownMenu.Item className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2">
                                <Edit className="w-4 h-4" /> Chỉnh sửa
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-px bg-border my-1" />
                              {doc.status === "inactive" ? (
                                <DropdownMenu.Item
                                  onSelect={() => handleUnlock(doc)}
                                  className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-success/10 text-success hover:text-success rounded-sm flex items-center gap-2"
                                >
                                  <LockOpen className="w-4 h-4" /> Mở khóa tài khoản
                                </DropdownMenu.Item>
                              ) : (
                                <DropdownMenu.Item
                                  onSelect={() => handleLock(doc)}
                                  className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-warning/10 text-warning hover:text-warning rounded-sm flex items-center gap-2"
                                >
                                  <Lock className="w-4 h-4" /> Khóa tài khoản
                                </DropdownMenu.Item>
                              )}
                              <DropdownMenu.Item
                                onClick={() => handleDelete(doc)}
                                className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-destructive/10 text-destructive hover:text-destructive rounded-sm flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" /> Xóa dữ liệu
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
              {!isLoading && filteredDoctors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy bác sĩ phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          totalItems={filteredDoctors.length}
          sourceTotalItems={doctors.length}
          itemLabel="bác sĩ"
          onPageChange={setPage}
        />
      </div>

      <AddDoctorDialog
        open={canManageStaff && addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={loadDoctors}
      />

      <AnimatePresence>
        {selectedDoctor && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDoctor(null)}
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
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full font-bold ${selectedDoctor.avatarColor}`}
                  >
                    {selectedDoctor.name.split(" ").pop()?.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{selectedDoctor.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedDoctor.email}</p>
                    <div className="mt-2">
                      {selectedDoctor.status === "active" ? (
                        <StatusBadge label="Đang hoạt động" tone="success" pulse />
                      ) : (
                        <StatusBadge label="Tạm khóa" tone="error" />
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedDoctor(null)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                <section className="grid grid-cols-2 gap-3">
                  <DoctorMetric label="Bệnh nhân" value={selectedDoctor.patientsCount} />
                  <DoctorMetric label="Lượt đo" value={selectedDoctor.measurementsCount} />
                  <DoctorMetric label="Vai trò" value="Bác sĩ" />
                  <DoctorMetric label="Ngày duyệt" value={selectedDoctor.joinDate} />
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Thông tin quyền truy cập
                  </h3>
                  <div className="space-y-3 text-sm">
                    <DoctorInfo
                      icon={Stethoscope}
                      label="Chuyên khoa"
                      value={selectedDoctor.specialty}
                    />
                    <DoctorInfo icon={Building2} label="Phòng khám" value={selectedDoctor.clinic} />
                    <DoctorInfo
                      icon={ShieldCheck}
                      label="Phạm vi dữ liệu"
                      value="Chỉ bệnh nhân được gán quyền"
                    />
                    <DoctorInfo
                      icon={UserPlus}
                      label="Bệnh nhân được gán"
                      value="145 hồ sơ đang có quyền xem"
                    />
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 text-sm font-semibold text-foreground">Audit timeline</h3>
                  <Timeline
                    items={[
                      {
                        title: "Phê duyệt tài khoản",
                        time: selectedDoctor.joinDate,
                        description: "Admin hệ thống cấp quyền bác sĩ.",
                        tone: "success",
                      },
                      {
                        title: "Gán phòng khám",
                        time: "Sau phê duyệt",
                        description: selectedDoctor.clinic,
                        tone: "primary",
                      },
                      {
                        title: "Cập nhật quyền truy cập",
                        time: "Hôm nay",
                        description: "Đồng bộ danh sách bệnh nhân phụ trách.",
                        tone: "warning",
                      },
                    ]}
                  />
                </section>
              </div>

              <CapabilityGate capabilities={STAFF_MANAGE_CAPABILITIES}>
                <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/30 p-5">
                  <button className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                    Gán phòng khám
                  </button>
                  <button className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                    Gán bệnh nhân
                  </button>
                  {selectedDoctor.status === "inactive" ? (
                    <button
                      onClick={() => handleUnlock(selectedDoctor)}
                      className="rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success hover:bg-success/20 transition-colors"
                    >
                      Mở khóa tài khoản
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLock(selectedDoctor)}
                      className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-[#B45309] hover:bg-warning/15"
                    >
                      Khóa tài khoản
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(selectedDoctor)}
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/15"
                  >
                    Xóa dữ liệu
                  </button>
                </div>
              </CapabilityGate>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <Dialog.Root open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div
              className={`mb-4 flex items-center gap-3 ${confirmAction?.tone === "success" ? "text-success" : "text-destructive"}`}
            >
              {confirmAction?.tone === "success" ? (
                <ShieldCheck className="h-6 w-6" />
              ) : (
                <ShieldAlert className="h-6 w-6" />
              )}
              <Dialog.Title className="text-lg font-bold">{confirmAction?.title}</Dialog.Title>
            </div>
            <Dialog.Description className="text-sm leading-6 text-muted-foreground">
              {confirmAction?.description}
            </Dialog.Description>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmAction}
                className={`rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                  confirmAction?.tone === "success"
                    ? "bg-success text-white hover:bg-success/90"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                }`}
              >
                {confirmAction?.confirm}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function DoctorMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

function DoctorInfo({
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



