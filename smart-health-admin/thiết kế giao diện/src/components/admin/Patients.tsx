import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Filter,
  Plus,
  MoreVertical,
  Users,
  Calendar,
  Activity,
  HeartPulse,
  Eye,
  FileText,
  Clock,
  MapPin,
  Phone,
  X,
  ShieldCheck,
  Share2,
  Download,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { AddPatientDialog } from "./dialogs/AddPatientDialog";
import { PageHeader, StatusBadge, Timeline } from "./design-system";
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE, paginateItems } from "./pagination-utils";
import { smartHealthApi, type SmartHealthPatient } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { CapabilityGate } from "./AdminAccessContext";
import { useAdminAccess } from "./useAdminAccess";
import { PATIENT_MANAGE_CAPABILITIES, REPORT_EXPORT_CAPABILITIES } from "./action-permissions";

type Patient = {
  id: string;
  name: string;
  gender: string;
  age: number;
  phone: string;
  address: string;
  lastVisit: string;
  condition: string;
  riskLevel: string;
  clinic: string;
  doctor: string;
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Chưa có lượt đo";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function normalizeGender(value?: string) {
  const gender = (value || "").toLowerCase();
  if (["male", "man", "nam"].includes(gender)) {
    return "Nam";
  }
  if (["female", "woman", "nu", "nữ"].includes(gender)) {
    return "Nữ";
  }
  return value || "Chưa rõ";
}

function conditionFromAiLabel(label?: string | null) {
  const normalized = (label || "").toLowerCase();
  if (!normalized) {
    return "Chưa phân loại";
  }
  if (normalized.includes("heart") || normalized.includes("cardio")) {
    return "Tim mạch";
  }
  if (normalized.includes("lung") || normalized.includes("respiratory")) {
    return "Hô hấp";
  }
  if (
    normalized.includes("noise") ||
    normalized.includes("clip") ||
    normalized.includes("too_short")
  ) {
    return "Tín hiệu cần đo lại";
  }
  if (normalized.includes("captured") || normalized.includes("recording")) {
    return "Đã ghi nhận lượt đo";
  }
  return label || "Đã ghi nhận lượt đo";
}

function riskFromPatient(patient: SmartHealthPatient) {
  const label = (patient.lastAiLabel || "").toLowerCase();
  if (label.includes("failed") || label.includes("noise") || label.includes("clip")) {
    return "high";
  }
  if ((patient.scanCount || 0) > 0) {
    return "medium";
  }
  return "low";
}

function mapBackendPatient(patient: SmartHealthPatient): Patient {
  return {
    id: patient.patientCode || patient.id,
    name: patient.name || "Bệnh nhân chưa xác định",
    gender: normalizeGender(patient.gender),
    age: Number.isFinite(Number(patient.age)) ? Number(patient.age) : 0,
    phone: patient.phone || "--",
    address: patient.address || patient.notes || "--",
    lastVisit: formatDate(patient.lastScanAt || patient.updatedAt || patient.createdAt),
    condition: conditionFromAiLabel(patient.lastAiLabel),
    riskLevel: riskFromPatient(patient),
    clinic: patient.organizationId || "Smart Health Clinic",
    doctor:
      patient.doctorName || patient.primaryDoctorId || patient.ownerUserId || "Chưa gán bác sĩ",
  };
}

export function Patients() {
  const { hasAnyCapability } = useAdminAccess();
  const canManagePatients = hasAnyCapability(PATIENT_MANAGE_CAPABILITIES);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);

  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      const { patients: backendPatients } = await smartHealthApi.listPatients();
      setPatients(backendPatients.map(mapBackendPatient));
      setBackendError(null);
    } catch (err) {
      setPatients([]);
      setBackendError(toVietnameseErrorMessage(err, "Không thể tải dữ liệu bệnh nhân."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPatients();
  }, [loadPatients]);

  const visiblePatients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return patients.filter((patient) => {
      const matchesSearch =
        !query ||
        [patient.id, patient.name, patient.phone, patient.condition, patient.doctor]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesRisk = filterRisk === "all" || patient.riskLevel === filterRisk;
      const condition = patient.condition.toLowerCase();
      const matchesCondition =
        filterCondition === "all" ||
        (filterCondition === "cardio" && condition.includes("tim")) ||
        (filterCondition === "respiratory" && condition.includes("hô")) ||
        (filterCondition === "hypertension" && condition.includes("huyết")) ||
        (filterCondition === "diabetes" && condition.includes("đái"));

      return matchesSearch && matchesRisk && matchesCondition;
    });
  }, [filterCondition, filterRisk, patients, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterRisk, filterCondition, patients.length]);

  const pagedPatients = useMemo(
    () => paginateItems(visiblePatients, page, ADMIN_TABLE_PAGE_SIZE),
    [page, visiblePatients],
  );

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "high":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
            Nguy cơ cao
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning border border-warning/20">
            Nguy cơ TB
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success border border-success/20">
            Nguy cơ thấp
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      <PageHeader
        eyebrow="Hồ sơ y tế"
        title="Quản lý bệnh nhân"
        description="Quản lý hồ sơ bệnh nhân, quan hệ bác sĩ-bệnh nhân, consent, lượt đo gần đây và audit log truy cập."
        action={
          <CapabilityGate capabilities={PATIENT_MANAGE_CAPABILITIES}>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Thêm hồ sơ
            </button>
          </CapabilityGate>
        }
      />

      {backendError && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-[#B45309]">
          Chưa tải được dữ liệu bệnh nhân từ backend. Trang không dùng dữ liệu mẫu để tránh hiển thị
          sai: {backendError}
        </div>
      )}

      <div className="flex-1 bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-center bg-muted/20">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm tên, CCCD, mã bệnh nhân, SĐT..."
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
                        Mức độ nguy cơ
                      </label>
                      <select
                        value={filterRisk}
                        onChange={(e) => setFilterRisk(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả mức độ</option>
                        <option value="high">Nguy cơ cao</option>
                        <option value="medium">Nguy cơ TB</option>
                        <option value="low">Nguy cơ thấp</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                        Nhóm bệnh
                      </label>
                      <select
                        value={filterCondition}
                        onChange={(e) => setFilterCondition(e.target.value)}
                        className="w-full border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-ring bg-background"
                      >
                        <option value="all">Tất cả nhóm bệnh</option>
                        <option value="cardio">Tim mạch</option>
                        <option value="respiratory">Hô hấp</option>
                        <option value="hypertension">Huyết áp</option>
                        <option value="diabetes">Đái tháo đường</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => {
                        setFilterRisk("all");
                        setFilterCondition("all");
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
                <th className="px-5 py-3 font-medium">Bệnh nhân</th>
                <th className="px-5 py-3 font-medium">Liên hệ</th>
                <th className="px-5 py-3 font-medium">Lần khám cuối</th>
                <th className="px-5 py-3 font-medium">Nhóm bệnh</th>
                <th className="px-5 py-3 font-medium">Bác sĩ phụ trách</th>
                <th className="px-5 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedPatients.map((patient) => (
                <tr key={patient.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          <button
                            onClick={() => setSelectedPatient(patient)}
                            className="hover:text-primary"
                          >
                            {patient.name}
                          </button>
                          {getRiskBadge(patient.riskLevel)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="text-primary font-medium">{patient.id}</span>
                          <span>•</span>
                          <span>
                            {patient.gender}, {patient.age} tuổi
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{patient.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{patient.address}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Clock className="w-4 h-4" />
                      <span>{patient.lastVisit}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-foreground text-sm">
                      <HeartPulse className="w-4 h-4 text-muted-foreground" />
                      <span>{patient.condition}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{patient.doctor}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{patient.clinic}</div>
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
                            onSelect={() => setSelectedPatient(patient)}
                            className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /> Chi tiết hồ sơ
                          </DropdownMenu.Item>
                          <DropdownMenu.Item className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2">
                            <Activity className="w-4 h-4" /> Lịch sử đo
                          </DropdownMenu.Item>
                          <DropdownMenu.Item className="text-sm px-2 py-1.5 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-sm flex items-center gap-2">
                            <FileText className="w-4 h-4" /> Đơn thuốc
                          </DropdownMenu.Item>
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
              {!isLoading && visiblePatients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    Không tìm thấy bệnh nhân phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationFooter
          page={page}
          totalItems={visiblePatients.length}
          sourceTotalItems={patients.length}
          itemLabel="bệnh nhân"
          onPageChange={setPage}
        />
      </div>

      <AddPatientDialog
        open={canManagePatients && addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={loadPatients}
      />

      <AnimatePresence>
        {selectedPatient && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPatient(null)}
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
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {selectedPatient.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedPatient.id} • {selectedPatient.gender}, {selectedPatient.age} tuổi
                    </p>
                    <div className="mt-2">{getRiskBadge(selectedPatient.riskLevel)}</div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPatient(null)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Thông tin cơ bản</h3>
                  <div className="space-y-3 text-sm">
                    <PatientInfo icon={Phone} label="Số điện thoại" value={selectedPatient.phone} />
                    <PatientInfo icon={MapPin} label="Địa chỉ" value={selectedPatient.address} />
                    <PatientInfo
                      icon={HeartPulse}
                      label="Nhóm bệnh"
                      value={selectedPatient.condition}
                    />
                    <PatientInfo
                      icon={Clock}
                      label="Lần đo gần nhất"
                      value={selectedPatient.lastVisit}
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Bác sĩ được cấp quyền
                  </h3>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {selectedPatient.doctor}
                      </div>
                      <div className="text-xs text-muted-foreground">{selectedPatient.clinic}</div>
                    </div>
                    <StatusBadge label="Đang có quyền" tone="success" />
                  </div>
                </section>

                <section>
                  <h3 className="mb-4 text-sm font-semibold text-foreground">
                    Lượt đo gần đây & audit log
                  </h3>
                  <Timeline
                    items={[
                      {
                        title: "Lượt đo tim mạch",
                        time: selectedPatient.lastVisit,
                        description: "AI confidence 94%, audio đã lưu trữ.",
                        tone: "success",
                      },
                      {
                        title: "Bác sĩ mở hồ sơ",
                        time: "Hôm nay 09:12",
                        description: `${selectedPatient.doctor} xem hồ sơ theo quyền được cấp.`,
                        tone: "primary",
                      },
                      {
                        title: "Consent chia sẻ hồ sơ",
                        time: "18/05/2026",
                        description: "Bệnh nhân đồng ý chia sẻ dữ liệu trong 30 ngày.",
                        tone: "warning",
                      },
                    ]}
                  />
                </section>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/30 p-5">
                <CapabilityGate capabilities={PATIENT_MANAGE_CAPABILITIES}>
                  <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                    <ShieldCheck className="h-4 w-4" />
                    Cấp quyền
                  </button>
                  <button className="inline-flex items-center justify-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/15">
                    Thu hồi quyền
                  </button>
                  <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                    <Share2 className="h-4 w-4" />
                    Link chia sẻ
                  </button>
                </CapabilityGate>
                <CapabilityGate capabilities={REPORT_EXPORT_CAPABILITIES}>
                  <button className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                    <Download className="h-4 w-4" />
                    Export
                  </button>
                </CapabilityGate>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function PatientInfo({
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
