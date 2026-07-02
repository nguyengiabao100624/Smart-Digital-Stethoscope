import { AlertCircle, Loader2 } from "lucide-react";

export function PortalLoading({ label = "Đang tải dữ liệu..." }: { label?: string }) {
  return (
    <div className="glass-panel rounded-2xl p-10 text-[#94b8d0] flex items-center justify-center gap-3">
      <Loader2 className="animate-spin text-[#00FFD1]" size={18} />
      {label}
    </div>
  );
}

export function PortalError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-[#FF4B4B]/30 bg-[#FF4B4B]/10 p-6 text-sm text-[#FF9A9A] flex flex-wrap items-center gap-3">
      <AlertCircle size={18} />
      <span className="flex-1">
        {error instanceof Error ? error.message : "Không thể tải dữ liệu."}
      </span>
      {retry && (
        <button
          onClick={retry}
          className="px-3 py-2 rounded-xl border border-[#FF4B4B]/30 hover:bg-[#FF4B4B]/10"
        >
          Thử lại
        </button>
      )}
    </div>
  );
}

export function PortalEmpty({ label }: { label: string }) {
  return (
    <div className="glass-panel rounded-2xl p-10 text-center text-sm text-[#94b8d0]">{label}</div>
  );
}
