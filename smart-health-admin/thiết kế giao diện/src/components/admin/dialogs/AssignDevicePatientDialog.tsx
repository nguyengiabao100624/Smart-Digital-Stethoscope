import * as Dialog from "@radix-ui/react-dialog";
import {
  Building2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UserRoundCog,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createDeviceOperationIdempotencyKey } from "@/lib/device-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  smartHealthApi,
  type SmartHealthAuthUser,
  type SmartHealthClinic,
  type SmartHealthDevice,
  type SmartHealthPatient,
} from "@/lib/smart-health-api";
import { useAdminAccess } from "../useAdminAccess";

type AssignDevicePatientDialogProps = {
  device: SmartHealthDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: (device: SmartHealthDevice) => void;
};

const controlClassName =
  "mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors motion-reduce:transition-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

function patientLinkedUserId(patient?: SmartHealthPatient) {
  return patient?.accountUserId || patient?.ownerUserId || patient?.guardianUserId || "";
}

function patientLabel(patient: SmartHealthPatient) {
  const identity = patient.patientCode || patient.id;
  const contact = patient.phone || patient.email || "chưa có liên hệ";
  return `${patient.name || patient.id} · ${identity} · ${contact}`;
}

function doctorLabel(doctor: SmartHealthAuthUser) {
  const contact = doctor.phone || doctor.email || doctor.id;
  return `${doctor.name || doctor.id} · ${contact}`;
}

export function AssignDevicePatientDialog({
  device,
  open,
  onOpenChange,
  onAssigned,
}: AssignDevicePatientDialogProps) {
  const { isPlatformAdmin } = useAdminAccess();
  const [workspaces, setWorkspaces] = useState<SmartHealthClinic[]>([]);
  const [doctors, setDoctors] = useState<SmartHealthAuthUser[]>([]);
  const [patients, setPatients] = useState<SmartHealthPatient[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === patientId),
    [patientId, patients],
  );
  const linkedPatientUserId = patientLinkedUserId(selectedPatient);

  const loadWorkspaces = useCallback(
    async (signal?: AbortSignal) => {
      if (!isPlatformAdmin) return;
      setLoadingWorkspaces(true);
      try {
        const result = await smartHealthApi.listClinics({
          status: "active",
          limit: 100,
          sort: "name:asc",
          signal,
        });
        setWorkspaces(result.clinics || []);
      } catch (loadError) {
        if (!signal?.aborted) {
          setWorkspaces([]);
          setError(
            toVietnameseErrorMessage(
              loadError,
              "Không thể tải danh sách workspace đang hoạt động.",
            ),
          );
        }
      } finally {
        if (!signal?.aborted) setLoadingWorkspaces(false);
      }
    },
    [isPlatformAdmin],
  );

  const loadDoctors = useCallback(
    async (query: string, signal?: AbortSignal) => {
      if (!isPlatformAdmin || !workspaceId) {
        setDoctors([]);
        return;
      }
      setLoadingDoctors(true);
      try {
        const result = await smartHealthApi.listApprovedDoctors({
          q: query.trim() || undefined,
          organizationId: workspaceId,
          status: "active",
          page: 1,
          limit: 100,
          sort: "name:asc",
          signal,
        });
        setDoctors(result.doctors || []);
      } catch (loadError) {
        if (!signal?.aborted) {
          setDoctors([]);
          setError(toVietnameseErrorMessage(loadError, "Không thể tải bác sĩ trong workspace."));
        }
      } finally {
        if (!signal?.aborted) setLoadingDoctors(false);
      }
    },
    [isPlatformAdmin, workspaceId],
  );

  const loadPatients = useCallback(
    async (query: string, signal?: AbortSignal) => {
      if (!workspaceId) {
        setPatients([]);
        return;
      }
      setLoadingPatients(true);
      try {
        const result = await smartHealthApi.listPatients({
          q: query.trim() || undefined,
          organizationId: workspaceId,
          page: 1,
          limit: 100,
          sort: "name:asc",
          signal,
        });
        setPatients(result.patients || []);
      } catch (loadError) {
        if (!signal?.aborted) {
          setPatients([]);
          setError(toVietnameseErrorMessage(loadError, "Không thể tải bệnh nhân trong workspace."));
        }
      } finally {
        if (!signal?.aborted) setLoadingPatients(false);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!open) {
      attemptRef.current = null;
      return;
    }
    attemptRef.current = null;
    setWorkspaceId(device?.organizationId || "");
    setOwnerUserId(device?.ownerUserId || device?.pairedUserId || "");
    setPatientId(device?.assignedPatientId || "");
    setDoctorSearch("");
    setPatientSearch("");
    setError("");
    const controller = new AbortController();
    void loadWorkspaces(controller.signal);
    return () => controller.abort();
  }, [device, loadWorkspaces, open]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadDoctors(doctorSearch, controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [doctorSearch, loadDoctors, open, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadPatients(patientSearch, controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadPatients, open, patientSearch, workspaceId]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!device || saving) return;
    if (!workspaceId) {
      setError("Vui lòng chọn workspace quản lý thiết bị.");
      return;
    }
    if (patientId && !ownerUserId) {
      setError(
        "Bệnh nhân này chưa liên kết tài khoản. Hãy chọn một bác sĩ chịu trách nhiệm trước khi lưu.",
      );
      return;
    }

    setSaving(true);
    setError("");
    try {
      const fingerprint = `${workspaceId}|${ownerUserId}|${patientId}`;
      if (attemptRef.current?.fingerprint !== fingerprint) {
        attemptRef.current = {
          fingerprint,
          key: createDeviceOperationIdempotencyKey("assignment", device.id),
        };
      }
      const result = isPlatformAdmin
        ? await smartHealthApi.assignDevice(
            device.id,
            {
              organizationId: workspaceId,
              ownerUserId,
              assignedPatientId: patientId,
            },
            attemptRef.current.key,
          )
        : await smartHealthApi.assignDevicePatient(device.id, patientId, attemptRef.current.key);
      attemptRef.current = null;
      onAssigned(result.device);
      toast.success("Đã cập nhật phân công thiết bị.", {
        description: patientId
          ? "Workspace, tài khoản chịu trách nhiệm và bệnh nhân đã được đồng bộ."
          : ownerUserId
            ? "Thiết bị đã được cấp cho tài khoản trong workspace."
            : "Thiết bị đang ở kho của workspace và chưa cấp cho người dùng.",
      });
      onOpenChange(false);
    } catch (submitError) {
      setError(
        toVietnameseErrorMessage(
          submitError,
          "Không thể cập nhật phân công. Dữ liệu cũ vẫn được giữ nguyên.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const currentOwnerMissing =
    Boolean(ownerUserId) && !doctors.some((doctor) => doctor.id === ownerUserId);
  const currentPatientMissing =
    Boolean(patientId) && !patients.some((patient) => patient.id === patientId);
  const allocationMode = patientId ? "patient" : ownerUserId ? "account" : "workspace";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-slate-950/50 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] max-h-[92vh] w-[min(96vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl focus:outline-none sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserRoundCog className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Phân công và quyền sở hữu thiết bị
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                  Platform Admin có thể đồng bộ workspace, bác sĩ/tài khoản chịu trách nhiệm và bệnh
                  nhân trong một giao dịch có audit.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={saving}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label="Đóng phân công thiết bị"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form className="mt-6 space-y-5" onSubmit={submit}>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Thiết bị
              </div>
              <div className="mt-2 break-words font-mono text-foreground">{device?.id}</div>
            </div>

            <section className="space-y-3" aria-labelledby="device-workspace-heading">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 id="device-workspace-heading" className="text-sm font-semibold text-foreground">
                  1. Workspace quản lý
                </h3>
              </div>
              <label className="block text-sm font-medium text-foreground">
                Workspace
                <select
                  name="organizationId"
                  value={workspaceId}
                  onChange={(event) => {
                    setWorkspaceId(event.target.value);
                    setOwnerUserId("");
                    setPatientId("");
                    setDoctorSearch("");
                    setPatientSearch("");
                    setError("");
                  }}
                  disabled={saving || loadingWorkspaces || !isPlatformAdmin}
                  className={controlClassName}
                >
                  {!workspaceId ? <option value="">Chọn workspace</option> : null}
                  {!isPlatformAdmin && workspaceId ? (
                    <option value={workspaceId}>{workspaceId}</option>
                  ) : null}
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name} ({workspace.id})
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="space-y-3" aria-labelledby="device-owner-heading">
              <div className="flex items-center gap-2">
                <Stethoscope className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 id="device-owner-heading" className="text-sm font-semibold text-foreground">
                  2. Bác sĩ hoặc tài khoản chịu trách nhiệm
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-foreground">
                  Tìm bác sĩ theo tên, email, số điện thoại
                  <input
                    name="doctorSearch"
                    type="search"
                    value={doctorSearch}
                    onChange={(event) => setDoctorSearch(event.target.value)}
                    placeholder="VD: 0986..., bác sĩ An"
                    disabled={saving || !isPlatformAdmin || !workspaceId}
                    className={controlClassName}
                  />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Tài khoản chịu trách nhiệm
                  <select
                    name="ownerUserId"
                    value={ownerUserId}
                    onChange={(event) => {
                      setOwnerUserId(event.target.value);
                      setError("");
                    }}
                    disabled={saving || loadingDoctors || !isPlatformAdmin || !workspaceId}
                    className={controlClassName}
                  >
                    <option value="">Chưa cấp cho tài khoản</option>
                    {currentOwnerMissing ? (
                      <option value={ownerUserId}>Tài khoản hiện tại ({ownerUserId})</option>
                    ) : null}
                    {linkedPatientUserId &&
                    !doctors.some((doctor) => doctor.id === linkedPatientUserId) ? (
                      <option value={linkedPatientUserId}>
                        Tài khoản liên kết của bệnh nhân ({linkedPatientUserId})
                      </option>
                    ) : null}
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctorLabel(doctor)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {loadingDoctors ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Đang tìm bác sĩ...
                </p>
              ) : null}
              {!loadingDoctors && isPlatformAdmin && doctorSearch && doctors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Không có bác sĩ đang hoạt động khớp từ khóa trong workspace đã chọn.
                </p>
              ) : null}
            </section>

            <section className="space-y-3" aria-labelledby="device-patient-heading">
              <div className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-primary" aria-hidden="true" />
                <h3 id="device-patient-heading" className="text-sm font-semibold text-foreground">
                  3. Bệnh nhân sử dụng (không bắt buộc)
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-foreground">
                  Tìm hồ sơ theo tên, mã, email, số điện thoại
                  <input
                    name="patientSearch"
                    type="search"
                    value={patientSearch}
                    onChange={(event) => setPatientSearch(event.target.value)}
                    placeholder="VD: BN-001, 0986..."
                    disabled={saving || !workspaceId}
                    className={controlClassName}
                  />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Hồ sơ bệnh nhân
                  <select
                    name="assignedPatientId"
                    value={patientId}
                    onChange={(event) => {
                      const nextPatientId = event.target.value;
                      const nextPatient = patients.find((patient) => patient.id === nextPatientId);
                      const linkedUserId = patientLinkedUserId(nextPatient);
                      setPatientId(nextPatientId);
                      if (nextPatientId && !ownerUserId && linkedUserId) {
                        setOwnerUserId(linkedUserId);
                      }
                      setError("");
                    }}
                    disabled={saving || loadingPatients || !workspaceId}
                    className={controlClassName}
                  >
                    <option value="">Không gán bệnh nhân</option>
                    {currentPatientMissing ? (
                      <option value={patientId}>Hồ sơ hiện tại ({patientId})</option>
                    ) : null}
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patientLabel(patient)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {loadingPatients ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Đang tìm bệnh nhân...
                </p>
              ) : null}
              {!loadingPatients && patientSearch && patients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <p>
                    Không có hồ sơ bệnh nhân khớp từ khóa trong workspace này. Nếu đây là số điện
                    thoại bác sĩ, hãy tìm ở mục bác sĩ phía trên.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadPatients(patientSearch)}
                    className="mt-3 flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Tải lại
                  </button>
                </div>
              ) : null}
            </section>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-medium">
                    {allocationMode === "patient"
                      ? "Thiết bị sẽ được gán cho bệnh nhân trong workspace đã chọn."
                      : allocationMode === "account"
                        ? "Tài khoản được chọn có thể mở thiết bị bằng Device ID trong App."
                        : "Thiết bị chỉ nằm trong kho workspace và chưa thuộc tài khoản nào."}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Claim code chỉ dùng một lần khi bàn giao thiết bị chưa được phân công. Thiết bị
                    đã được Admin cấp trực tiếp cho tài khoản thì App chỉ cần Device ID.
                  </p>
                </div>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-danger-text"
              >
                {error}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={saving}
                  className="min-h-11 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={saving || loadingPatients || loadingDoctors || !workspaceId}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                {saving ? "Đang lưu..." : "Lưu toàn bộ phân công"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
