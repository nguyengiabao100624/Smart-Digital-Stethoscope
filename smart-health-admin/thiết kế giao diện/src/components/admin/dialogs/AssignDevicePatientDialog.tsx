import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, RefreshCw, UserRoundCog, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createDeviceOperationIdempotencyKey } from "@/lib/device-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  smartHealthApi,
  type SmartHealthDevice,
  type SmartHealthPatient,
} from "@/lib/smart-health-api";

type AssignDevicePatientDialogProps = {
  device: SmartHealthDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: (device: SmartHealthDevice) => void;
};

const controlClassName =
  "mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors motion-reduce:transition-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function AssignDevicePatientDialog({
  device,
  open,
  onOpenChange,
  onAssigned,
}: AssignDevicePatientDialogProps) {
  const [patients, setPatients] = useState<SmartHealthPatient[]>([]);
  const [search, setSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadPatients = useCallback(
    async (query: string, signal?: AbortSignal) => {
      if (!device?.organizationId) {
        setPatients([]);
        setError("Thiết bị chưa thuộc workspace nên chưa thể gán bệnh nhân.");
        return;
      }
      setLoadingPatients(true);
      setError("");
      try {
        const result = await smartHealthApi.listPatients({
          q: query.trim() || undefined,
          organizationId: device.organizationId,
          page: 1,
          limit: 100,
          sort: "name:asc",
          signal,
        });
        setPatients(result.patients || []);
      } catch (loadError) {
        if (signal?.aborted) return;
        setPatients([]);
        setError(
          toVietnameseErrorMessage(loadError, "Không thể tải bệnh nhân trong workspace này."),
        );
      } finally {
        if (!signal?.aborted) setLoadingPatients(false);
      }
    },
    [device?.organizationId],
  );

  useEffect(() => {
    if (!open) {
      attemptRef.current = null;
      return;
    }
    attemptRef.current = null;
    setPatientId(device?.assignedPatientId || "");
    setSearch("");
  }, [device, open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadPatients(search, controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadPatients, open, search]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!device || saving) return;
    setSaving(true);
    setError("");
    try {
      const fingerprint = patientId;
      if (attemptRef.current?.fingerprint !== fingerprint) {
        attemptRef.current = {
          fingerprint,
          key: createDeviceOperationIdempotencyKey(
            patientId ? "assign-patient" : "unassign-patient",
            device.id,
          ),
        };
      }
      const result = await smartHealthApi.assignDevicePatient(
        device.id,
        patientId,
        attemptRef.current.key,
      );
      attemptRef.current = null;
      onAssigned(result.device);
      toast.success(patientId ? "Đã gán thiết bị cho bệnh nhân." : "Đã bỏ gán bệnh nhân.");
      onOpenChange(false);
    } catch (submitError) {
      setError(
        toVietnameseErrorMessage(submitError, "Không thể cập nhật bệnh nhân sử dụng thiết bị."),
      );
    } finally {
      setSaving(false);
    }
  };

  const currentPatientMissing =
    Boolean(device?.assignedPatientId) &&
    !patients.some((patient) => patient.id === device?.assignedPatientId);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-slate-950/50 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] max-h-[90vh] w-[min(94vw,600px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserRoundCog className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Gán bệnh nhân sử dụng thiết bị
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                  Chỉ hiển thị bệnh nhân thuộc đúng workspace của thiết bị. Thao tác được lưu audit.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={saving}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label="Đóng gán bệnh nhân"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form className="mt-6 space-y-5" onSubmit={submit}>
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Thiết bị · Workspace
              </div>
              <div className="mt-2 break-words font-mono text-foreground">
                {device?.id} · {device?.organizationId || "Chưa gán"}
              </div>
            </div>

            <label className="block text-sm font-medium text-foreground">
              Tìm bệnh nhân
              <input
                name="patientSearch"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tên, mã hồ sơ, email hoặc số điện thoại"
                disabled={saving || !device?.organizationId}
                className={controlClassName}
              />
            </label>

            <label className="block text-sm font-medium text-foreground">
              Bệnh nhân được gán
              <select
                name="assignedPatientId"
                value={patientId}
                onChange={(event) => {
                  setPatientId(event.target.value);
                  setError("");
                }}
                disabled={saving || loadingPatients || !device?.organizationId}
                className={controlClassName}
              >
                <option value="">Không gán bệnh nhân</option>
                {currentPatientMissing ? (
                  <option value={device?.assignedPatientId || ""}>
                    Hồ sơ hiện tại ({device?.assignedPatientId})
                  </option>
                ) : null}
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name || patient.id} · {patient.patientCode || patient.id}
                  </option>
                ))}
              </select>
            </label>

            {loadingPatients ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Đang tải bệnh nhân...
              </div>
            ) : null}

            {!loadingPatients && patients.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                Không tìm thấy bệnh nhân phù hợp.
                <button
                  type="button"
                  onClick={() => void loadPatients(search)}
                  className="mt-3 flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Tải lại
                </button>
              </div>
            ) : null}

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
                disabled={saving || loadingPatients || !device?.organizationId}
                className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                {saving ? "Đang lưu..." : "Lưu phân công"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
