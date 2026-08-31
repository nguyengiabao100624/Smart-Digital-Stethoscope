import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ArrowRightLeft, Loader2, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { createDeviceOperationIdempotencyKey } from "@/lib/device-operations";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  smartHealthApi,
  type SmartHealthClinic,
  type SmartHealthDevice,
} from "@/lib/smart-health-api";

type TransferDeviceDialogProps = {
  device: SmartHealthDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred: (device: SmartHealthDevice) => void;
};

const controlClassName =
  "mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors motion-reduce:transition-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export function TransferDeviceDialog({
  device,
  open,
  onOpenChange,
  onTransferred,
}: TransferDeviceDialogProps) {
  const [workspaces, setWorkspaces] = useState<SmartHealthClinic[]>([]);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const attemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadWorkspaces = useCallback(async (signal?: AbortSignal) => {
    setLoadingWorkspaces(true);
    setError("");
    try {
      const result = await smartHealthApi.listClinics({
        status: "active",
        limit: 100,
        sort: "name:asc",
        signal,
      });
      setWorkspaces(result.clinics || []);
    } catch (loadError) {
      if (signal?.aborted) return;
      setWorkspaces([]);
      setError(
        toVietnameseErrorMessage(loadError, "Không thể tải danh sách workspace đang hoạt động."),
      );
    } finally {
      if (!signal?.aborted) setLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      attemptRef.current = null;
      return;
    }
    attemptRef.current = null;
    setTargetWorkspaceId(device?.organizationId || "");
    setConfirmation("");
    const controller = new AbortController();
    void loadWorkspaces(controller.signal);
    return () => controller.abort();
  }, [device, loadWorkspaces, open]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!device || saving) return;
    if (!targetWorkspaceId) {
      setError("Vui lòng chọn workspace đích.");
      return;
    }
    if (targetWorkspaceId === device.organizationId) {
      setError("Thiết bị đang thuộc workspace này. Hãy chọn workspace đích khác.");
      return;
    }
    if (confirmation.trim() !== device.id) {
      setError("Device ID xác nhận chưa khớp.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const fingerprint = targetWorkspaceId;
      if (attemptRef.current?.fingerprint !== fingerprint) {
        attemptRef.current = {
          fingerprint,
          key: createDeviceOperationIdempotencyKey("transfer", device.id),
        };
      }
      const result = await smartHealthApi.transferDevice(
        device.id,
        targetWorkspaceId,
        attemptRef.current.key,
      );
      attemptRef.current = null;
      onTransferred(result.device);
      toast.success("Đã chuyển thiết bị sang workspace mới.");
      onOpenChange(false);
    } catch (submitError) {
      setError(
        toVietnameseErrorMessage(
          submitError,
          "Không thể chuyển thiết bị. Quyền sở hữu chưa được thay đổi.",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const targetWorkspace = workspaces.find((workspace) => workspace.id === targetWorkspaceId);

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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <ArrowRightLeft className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Chuyển workspace thiết bị
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-5 text-muted-foreground">
                  Chỉ Platform Admin được thực hiện. Mọi thay đổi đều có audit ở workspace nguồn và
                  đích.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={saving}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                aria-label="Đóng chuyển workspace"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <form className="mt-6 space-y-5" onSubmit={submit}>
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-foreground">
              <div className="flex gap-3">
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <p>
                  Thiết bị sẽ ngắt phiên cloud hiện tại, hủy quyền sở hữu cũ và chỉ có thể xác thực
                  lại theo workspace mới. Lịch sử kỹ thuật vẫn được giữ nguyên.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Workspace hiện tại
                </div>
                <div className="mt-2 break-words font-mono text-sm text-foreground">
                  {device?.organizationId || "Chưa gán"}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Thiết bị
                </div>
                <div className="mt-2 break-words font-mono text-sm text-foreground">
                  {device?.id || ""}
                </div>
              </div>
            </div>

            <label className="block text-sm font-medium text-foreground">
              Workspace đích
              <select
                name="organizationId"
                value={targetWorkspaceId}
                onChange={(event) => {
                  setTargetWorkspaceId(event.target.value);
                  setError("");
                }}
                disabled={saving || loadingWorkspaces}
                className={controlClassName}
              >
                <option value="">Chọn workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.id})
                  </option>
                ))}
              </select>
            </label>

            {loadingWorkspaces ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Đang tải workspace...
              </div>
            ) : null}

            {!loadingWorkspaces && workspaces.length === 0 ? (
              <button
                type="button"
                onClick={() => void loadWorkspaces()}
                className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Tải lại workspace
              </button>
            ) : null}

            <label className="block text-sm font-medium text-foreground">
              Nhập Device ID để xác nhận
              <input
                name="confirmation"
                value={confirmation}
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setError("");
                }}
                placeholder={device?.id || "Device ID"}
                autoComplete="off"
                disabled={saving}
                className={controlClassName}
              />
            </label>

            {targetWorkspace ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Đích đã chọn: <strong className="text-foreground">{targetWorkspace.name}</strong>
              </p>
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
                disabled={
                  saving ||
                  loadingWorkspaces ||
                  !device ||
                  !targetWorkspaceId ||
                  targetWorkspaceId === device.organizationId ||
                  confirmation.trim() !== device.id
                }
                className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-warning px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-warning/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                {saving ? "Đang chuyển..." : "Xác nhận chuyển workspace"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
