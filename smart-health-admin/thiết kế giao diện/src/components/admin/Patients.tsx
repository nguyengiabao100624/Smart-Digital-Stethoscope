import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Search,
  Plus,
  Users,
  Activity,
  HeartPulse,
  Eye,
  FileText,
  Clock,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Building2,
  Pencil,
  Trash2,
  ShieldAlert,
  X,
} from "lucide-react";
import { AddPatientDialog } from "./dialogs/AddPatientDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { PageHeader } from "./design-system";
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE, paginateItems } from "./pagination-utils";
import { smartHealthApi, type SmartHealthPatient } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { CapabilityGate } from "./AdminAccessContext";
import { useAdminAccess } from "./useAdminAccess";
import { PATIENT_MANAGE_CAPABILITIES } from "./action-permissions";
import {
  parsePatientDeleteOutcome,
  parsePatientListResponse,
  resolvePatientOperationAttempt,
  type PatientMutationIntent,
  type PatientOperationAttempt,
} from "@/lib/patient-operations";

type Patient = {
  id: string;
  patientCode?: string;
  name: string;
  gender?: string;
  age?: number;
  dateOfBirth?: string;
  bloodType?: string;
  allergies?: string[];
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  organizationId?: string;
  primaryDoctorId?: string;
  doctorName?: string;
  scanCount?: number;
  lastScanAt?: string | null;
  lastSignalLabel?: string | null;
  createdAt?: string;
  updatedAt?: string;
  profileType?: string;
  relationship?: string;
};

function formatDate(value?: string | null) {
  if (!value) {
    return undefined;
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
  if (!gender) {
    return undefined;
  }
  if (["male", "man", "nam"].includes(gender)) {
    return "Nam";
  }
  if (["female", "woman", "nu", "nữ"].includes(gender)) {
    return "Nữ";
  }
  return value;
}

function normalizeAge(value?: number | null) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const age = Number(value);
  return Number.isFinite(age) && age >= 0 ? age : undefined;
}

function normalizeScanCount(value?: number) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : undefined;
}

function mapBackendPatient(patient: SmartHealthPatient): Patient {
  return {
    id: patient.id,
    patientCode: patient.patientCode,
    name: patient.name || "Hồ sơ chưa có tên",
    gender: patient.gender,
    age: normalizeAge(patient.age),
    dateOfBirth: patient.dateOfBirth,
    bloodType: patient.bloodType,
    allergies: patient.allergies,
    emergencyContact: patient.emergencyContact,
    phone: patient.phone,
    email: patient.email,
    address: patient.address,
    notes: patient.notes,
    organizationId: patient.organizationId,
    primaryDoctorId: patient.primaryDoctorId,
    doctorName: patient.doctorName,
    scanCount: normalizeScanCount(patient.scanCount),
    lastScanAt: patient.lastScanAt,
    lastSignalLabel: patient.lastAiLabel,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
    profileType: patient.profileType,
    relationship: patient.relationship,
  };
}

function patientMutationIntent(patient: Patient): PatientMutationIntent {
  return {
    patientId: patient.id,
    name: patient.name,
    patientCode: patient.patientCode || "",
    dateOfBirth: patient.dateOfBirth || "",
    gender: patient.gender || "",
    phone: patient.phone || "",
    email: patient.email || "",
    address: patient.address || "",
    bloodType: patient.bloodType || "",
    allergies: patient.allergies || [],
    emergencyContact: {
      name: patient.emergencyContact?.name || "",
      phone: patient.emergencyContact?.phone || "",
      relationship: patient.emergencyContact?.relationship || "",
    },
    notes: patient.notes || "",
  };
}

function patientDemographics(patient: Patient) {
  const values = [
    normalizeGender(patient.gender),
    patient.age === undefined ? undefined : `${patient.age} tuổi`,
  ].filter((value): value is string => Boolean(value));

  return values.length > 0 ? values.join(", ") : "Chưa cập nhật giới tính và tuổi";
}

function patientDoctor(patient: Patient) {
  return patient.doctorName || patient.primaryDoctorId;
}

function hasBackendScanSummary(patient: Patient) {
  return (
    patient.scanCount !== undefined ||
    Boolean(patient.lastScanAt) ||
    Boolean(patient.lastSignalLabel)
  );
}

export function Patients() {
  const shouldReduceMotion = useReducedMotion();
  const { hasAnyCapability } = useAdminAccess();
  const canManagePatients = hasAnyCapability(PATIENT_MANAGE_CAPABILITIES);
  const [searchTerm, setSearchTerm] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [editorPatient, setEditorPatient] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const deleteAttemptRef = useRef<PatientOperationAttempt | null>(null);

  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      const backendPatients = parsePatientListResponse(await smartHealthApi.listPatients());
      setPatients(backendPatients.map(mapBackendPatient));
      setSelectedPatient((current) => {
        if (!current) return null;
        const refreshed = backendPatients.find((patient) => patient.id === current.id);
        return refreshed ? mapBackendPatient(refreshed) : null;
      });
      setBackendError(null);
    } catch (err) {
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
      if (!query) {
        return true;
      }

      return [
        patient.id,
        patient.patientCode,
        patient.name,
        patient.phone,
        patient.email,
        patient.address,
        patient.doctorName,
        patient.primaryDoctorId,
        patient.organizationId,
        patient.lastSignalLabel,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [patients, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, patients.length]);

  const pagedPatients = useMemo(
    () => paginateItems(visiblePatients, page, ADMIN_TABLE_PAGE_SIZE),
    [page, visiblePatients],
  );
  const emptyMessage = backendError
    ? "Không thể hiển thị danh sách vì backend chưa phản hồi."
    : searchTerm.trim()
      ? "Không có hồ sơ nào khớp từ khóa tìm kiếm."
      : "Backend chưa trả về hồ sơ bệnh nhân nào.";

  const openCreate = () => {
    setEditorPatient(null);
    setAddDialogOpen(true);
  };

  const openEdit = (patient: Patient) => {
    setEditorPatient(patient);
    setAddDialogOpen(true);
  };

  const handleSaved = async (saved: SmartHealthPatient) => {
    const mapped = mapBackendPatient(saved);
    setPatients((current) => {
      const found = current.some((patient) => patient.id === mapped.id);
      return found
        ? current.map((patient) => (patient.id === mapped.id ? mapped : patient))
        : [mapped, ...current];
    });
    setSelectedPatient((current) => (current?.id === mapped.id ? mapped : current));
    await loadPatients();
  };

  const requestDelete = (patient: Patient) => {
    deleteAttemptRef.current = null;
    setDeleteError("");
    setDeleteTarget(patient);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    const attempt = resolvePatientOperationAttempt(
      deleteAttemptRef.current,
      "delete",
      patientMutationIntent(deleteTarget),
    );
    deleteAttemptRef.current = attempt;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const response = await smartHealthApi.deletePatient(deleteTarget.id, attempt.idempotencyKey);
      parsePatientDeleteOutcome(response, deleteTarget.id);
      setPatients((current) => current.filter((patient) => patient.id !== deleteTarget.id));
      setSelectedPatient((current) => (current?.id === deleteTarget.id ? null : current));
      setDeleteTarget(null);
      deleteAttemptRef.current = null;
    } catch (error) {
      setDeleteError(
        toVietnameseErrorMessage(
          error,
          "Backend chưa xác nhận xóa đúng hồ sơ. Bạn có thể thử gửi lại an toàn.",
        ),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col relative">
      <PageHeader
        eyebrow="Hồ sơ y tế"
        title="Quản lý bệnh nhân"
        description="Hiển thị hồ sơ, phân công bác sĩ và tóm tắt lượt đo do backend xác nhận."
        action={
          <CapabilityGate capabilities={PATIENT_MANAGE_CAPABILITIES}>
            <button
              onClick={openCreate}
              className="flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <div className="border-b border-border bg-muted/20 p-4">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm tên, mã hồ sơ, số điện thoại, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-h-11 w-full rounded-md border border-border bg-card py-2 pl-9 pr-4 text-sm outline-none transition-shadow focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Bệnh nhân</th>
                <th className="px-5 py-3 font-medium">Liên hệ</th>
                <th className="px-5 py-3 font-medium">Lần đo gần nhất</th>
                <th className="px-5 py-3 font-medium">Tóm tắt lượt đo</th>
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
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">
                          <button
                            onClick={() => setSelectedPatient(patient)}
                            className="inline-flex min-h-11 items-center rounded-sm py-2 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {patient.name}
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="text-primary font-medium">
                            {patient.patientCode || "Chưa có mã hồ sơ"}
                          </span>
                          <span>•</span>
                          <span>{patientDemographics(patient)}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1 text-xs">
                      {patient.phone && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{patient.phone}</span>
                        </div>
                      )}
                      {patient.email && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{patient.email}</span>
                        </div>
                      )}
                      {!patient.phone && !patient.email && (
                        <span className="text-muted-foreground">Chưa cập nhật liên hệ</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(patient.lastScanAt) || "Chưa có lượt đo"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-2 text-foreground text-sm">
                      <HeartPulse className="w-4 h-4 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <div>
                          {patient.scanCount === undefined
                            ? "Chưa có số liệu"
                            : `${patient.scanCount} lượt đo`}
                        </div>
                        {patient.lastSignalLabel && (
                          <div
                            className="max-w-52 truncate text-xs text-muted-foreground"
                            title={patient.lastSignalLabel}
                          >
                            Nhãn xử lý: {patient.lastSignalLabel}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">
                      {patientDoctor(patient) || "Chưa có phân công trong hồ sơ"}
                    </div>
                    {patient.organizationId && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Workspace: {patient.organizationId}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedPatient(patient)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Eye className="h-4 w-4" />
                      Xem chi tiết
                    </button>
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
                    {emptyMessage}
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
        patient={editorPatient}
        onOpenChange={(nextOpen) => {
          setAddDialogOpen(nextOpen);
          if (!nextOpen) setEditorPatient(null);
        }}
        onSaved={handleSaved}
      />

      <AnimatePresence>
        {selectedPatient && (
          <>
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPatient(null)}
              className="fixed inset-0 z-40 bg-slate-950/40"
            />
            <motion.aside
              initial={shouldReduceMotion ? false : { x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="patient-detail-title"
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col border-l border-border bg-card shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 id="patient-detail-title" className="text-lg font-semibold text-foreground">
                      {selectedPatient.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedPatient.patientCode || "Chưa có mã hồ sơ"} •{" "}
                      {patientDemographics(selectedPatient)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Đóng chi tiết bệnh nhân"
                  onClick={() => setSelectedPatient(null)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Thông tin cơ bản</h3>
                  <div className="space-y-3 text-sm">
                    <PatientInfo icon={Phone} label="Số điện thoại" value={selectedPatient.phone} />
                    <PatientInfo icon={Mail} label="Email" value={selectedPatient.email} />
                    <PatientInfo
                      icon={Calendar}
                      label="Ngày sinh"
                      value={formatDate(selectedPatient.dateOfBirth)}
                    />
                    <PatientInfo
                      icon={HeartPulse}
                      label="Nhóm máu"
                      value={selectedPatient.bloodType}
                    />
                    <PatientInfo icon={MapPin} label="Địa chỉ" value={selectedPatient.address} />
                    <PatientInfo
                      icon={FileText}
                      label="Ghi chú hồ sơ"
                      value={selectedPatient.notes}
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Dị ứng và liên hệ khẩn cấp
                  </h3>
                  <div className="space-y-3 text-sm">
                    <PatientInfo
                      icon={ShieldAlert}
                      label="Dị ứng đã khai báo"
                      value={
                        selectedPatient.allergies?.length
                          ? selectedPatient.allergies.join(", ")
                          : undefined
                      }
                    />
                    <PatientInfo
                      icon={Phone}
                      label="Liên hệ khẩn cấp"
                      value={
                        selectedPatient.emergencyContact?.name ||
                        selectedPatient.emergencyContact?.phone
                          ? [
                              selectedPatient.emergencyContact?.name,
                              selectedPatient.emergencyContact?.phone,
                              selectedPatient.emergencyContact?.relationship,
                            ]
                              .filter(Boolean)
                              .join(" • ")
                          : undefined
                      }
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Bác sĩ phụ trách trong hồ sơ
                  </h3>
                  {patientDoctor(selectedPatient) ? (
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <div className="text-sm font-semibold text-foreground">
                        {selectedPatient.doctorName || selectedPatient.primaryDoctorId}
                      </div>
                      {selectedPatient.doctorName && selectedPatient.primaryDoctorId && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Mã bác sĩ: {selectedPatient.primaryDoctorId}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                      Backend chưa cung cấp bác sĩ phụ trách cho hồ sơ này.
                    </div>
                  )}
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    Phân công trong hồ sơ không thay thế trạng thái quyền truy cập hoặc chấp thuận
                    của bệnh nhân.
                  </p>
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">
                    Tóm tắt lượt đo từ backend
                  </h3>
                  {hasBackendScanSummary(selectedPatient) ? (
                    <div className="space-y-3 text-sm">
                      <PatientInfo
                        icon={Activity}
                        label="Số lượt đo"
                        value={
                          selectedPatient.scanCount === undefined
                            ? undefined
                            : `${selectedPatient.scanCount} lượt`
                        }
                      />
                      <PatientInfo
                        icon={Clock}
                        label="Lần đo gần nhất"
                        value={formatDate(selectedPatient.lastScanAt)}
                      />
                      <PatientInfo
                        icon={HeartPulse}
                        label="Nhãn xử lý gần nhất"
                        value={selectedPatient.lastSignalLabel || undefined}
                      />
                      {selectedPatient.lastSignalLabel && (
                        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                          Nhãn xử lý do backend trả về, không phải chẩn đoán.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                      Không có dữ liệu lượt đo từ backend.
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-border p-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Thông tin hệ thống</h3>
                  <div className="space-y-3 text-sm">
                    <PatientInfo
                      icon={FileText}
                      label="ID hệ thống canonical"
                      value={selectedPatient.id}
                    />
                    <PatientInfo
                      icon={FileText}
                      label="Mã hồ sơ hiển thị"
                      value={selectedPatient.patientCode}
                    />
                    <PatientInfo
                      icon={Building2}
                      label="Workspace"
                      value={selectedPatient.organizationId}
                    />
                    <PatientInfo
                      icon={Clock}
                      label="Tạo lúc"
                      value={formatDate(selectedPatient.createdAt)}
                    />
                    <PatientInfo
                      icon={Clock}
                      label="Cập nhật lúc"
                      value={formatDate(selectedPatient.updatedAt)}
                    />
                  </div>
                </section>
              </div>

              {canManagePatients ? (
                <div className="flex flex-col gap-3 border-t border-border bg-card p-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(selectedPatient)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Pencil className="h-4 w-4" />
                    Chỉnh sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDelete(selectedPatient)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="h-4 w-4" />
                    Xóa hồ sơ
                  </button>
                </div>
              ) : null}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        title="Xóa hồ sơ bệnh nhân?"
        description={
          <span>
            Hồ sơ <strong>{deleteTarget?.name}</strong> sẽ được soft-delete và ghi audit theo ID hệ
            thống <strong>{deleteTarget?.id}</strong>. Mã hiển thị không được dùng làm khóa xóa.
          </span>
        }
        confirmLabel="Xóa hồ sơ"
        loading={isDeleting}
        error={deleteError}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isDeleting) {
            setDeleteTarget(null);
            setDeleteError("");
            deleteAttemptRef.current = null;
          }
        }}
        onConfirm={confirmDelete}
      />
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
  value?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium text-foreground">{value ?? "Chưa cập nhật"}</div>
      </div>
    </div>
  );
}
