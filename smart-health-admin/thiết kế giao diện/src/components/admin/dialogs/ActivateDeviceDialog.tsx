import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, CheckCircle2, Loader2, Wifi, X } from "lucide-react";
import { toast } from "sonner";
import { smartHealthApi } from "@/lib/smart-health-api";

interface ActivateDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActivated?: () => void | Promise<void>;
}

export function ActivateDeviceDialog({ open, onOpenChange, onActivated }: ActivateDeviceDialogProps) {
  const [step, setStep] = useState<"input" | "activating" | "success">("input");
  const [deviceId, setDeviceId] = useState("");
  const [claimCode, setClaimCode] = useState("");

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep("activating");
    try {
      await smartHealthApi.activateDeviceByClaim({
        deviceId,
        claimCode,
        connectionMethod: "QR",
      });
      setStep("success");
      toast.success("Đã kích hoạt thiết bị", {
        description: "Thiết bị đã sẵn sàng sử dụng.",
      });
      await onActivated?.();
      window.setTimeout(() => {
        onOpenChange(false);
        setStep("input");
        setDeviceId("");
        setClaimCode("");
      }, 900);
    } catch (error) {
      setStep("input");
      toast.error("Không thể kích hoạt thiết bị", {
        description: error instanceof Error ? error.message : "Vui lòng kiểm tra Device ID và claim code.",
      });
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-in fade-in bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-border p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">Kích hoạt thiết bị</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Nhập Device ID và claim code được tạo từ màn thêm thiết bị.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground transition-colors hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleActivate} className="space-y-6 p-6">
            {step === "input" && (
              <>
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                    <div className="text-sm text-muted-foreground">
                      Thiết bị đã revoke hoặc claim code hết hạn sẽ bị backend từ chối.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Device ID <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="VD: dev_20260525_abcd1234"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Claim code <span className="text-destructive">*</span>
                  </label>
                  <input
                    required
                    value={claimCode}
                    onChange={(e) => setClaimCode(e.target.value.trim().toUpperCase())}
                    placeholder="VD: A1B2C3D4E5F6"
                    className="w-full rounded-md border border-border bg-background px-4 py-3 text-center font-mono text-lg tracking-widest outline-none focus:border-ring focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="flex gap-3">
                  <Dialog.Close asChild>
                    <button type="button" className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                      Hủy
                    </button>
                  </Dialog.Close>
                  <button
                    type="submit"
                    disabled={!deviceId || !claimCode}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Kích hoạt
                  </button>
                </div>
              </>
            )}

            {step === "activating" && (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Đang kích hoạt thiết bị...</p>
                  <p className="mt-1 text-sm text-muted-foreground">Backend đang xác minh claim code.</p>
                </div>
              </div>
            )}

            {step === "success" && (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Kích hoạt thành công</p>
                  <p className="mt-1 text-sm text-muted-foreground">Thiết bị đã được kết nối với hệ thống.</p>
                </div>
              </div>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
