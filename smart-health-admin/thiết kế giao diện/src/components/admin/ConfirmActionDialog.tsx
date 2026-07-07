import React from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmTone = "danger" | "success" | "warning";

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Hủy",
  tone = "danger",
  loading = false,
  error = "",
  onOpenChange,
  onConfirm,
}: ConfirmActionDialogProps) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const iconClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/10 text-[#B45309]"
        : "bg-destructive/10 text-destructive";
  const buttonClass =
    tone === "success"
      ? "bg-success text-white hover:bg-success/90"
      : tone === "warning"
        ? "bg-warning text-white hover:bg-warning/90"
        : "";

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
      <AlertDialogContent className="max-w-md rounded-xl border-border bg-card">
        <AlertDialogHeader>
          <div className="mb-2 flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${iconClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-left text-lg text-foreground">
              {title}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left leading-6">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
          <Button
            type="button"
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={loading}
            onClick={() => void onConfirm()}
            className={buttonClass}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Đang xử lý..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
