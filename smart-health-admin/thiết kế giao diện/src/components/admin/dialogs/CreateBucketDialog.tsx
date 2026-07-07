import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Archive,
  Bot,
  BrainCircuit,
  Database,
  FileAudio,
  FileCheck,
  FileText,
  FolderPlus,
  Globe2,
  HardDrive,
  Image,
  Lock,
  Shield,
  Stethoscope,
  UserRound,
  Video,
  AudioWaveform,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

export type BucketCreatePayload = {
  name: string;
  description?: string;
  iconKey?: string;
  colorKey?: string;
  category?: string;
  quotaGb?: number;
  visibility?: string;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
  maxFileSizeMb?: number;
  retentionDays?: number;
  encryptionRequired?: boolean;
};

interface CreateBucketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate?: (payload: BucketCreatePayload) => Promise<void> | void;
}

const BUCKET_TYPES = [
  {
    key: "audio",
    label: "Âm thanh",
    category: "clinical_audio",
    icon: FileAudio,
    colorKey: "emerald",
    extensions: "wav, mp3, m4a, flac, json",
    maxFileSizeMb: 500,
  },
  {
    key: "waveform",
    label: "Waveform",
    category: "waveform",
    icon: AudioWaveform,
    colorKey: "cyan",
    extensions: "json, csv",
    maxFileSizeMb: 100,
  },
  {
    key: "image",
    label: "Hình ảnh",
    category: "medical_image",
    icon: Image,
    colorKey: "blue",
    extensions: "jpg, jpeg, png, webp",
    maxFileSizeMb: 100,
  },
  {
    key: "dicom",
    label: "DICOM",
    category: "dicom",
    icon: Stethoscope,
    colorKey: "blue",
    extensions: "dcm, dicom",
    maxFileSizeMb: 500,
  },
  {
    key: "report",
    label: "Báo cáo",
    category: "patient_report",
    icon: FileText,
    colorKey: "amber",
    extensions: "pdf, docx, xlsx, csv, json",
    maxFileSizeMb: 200,
  },
  {
    key: "firmware",
    label: "Firmware",
    category: "device_firmware",
    icon: Shield,
    colorKey: "slate",
    extensions: "bin, json, txt",
    maxFileSizeMb: 100,
  },
  {
    key: "avatar",
    label: "Ảnh đại diện",
    category: "avatar",
    icon: UserRound,
    colorKey: "rose",
    extensions: "jpg, jpeg, png, webp",
    maxFileSizeMb: 10,
  },
  {
    key: "ai",
    label: "AI",
    category: "ai_artifact",
    icon: BrainCircuit,
    colorKey: "violet",
    extensions: "json, csv, pkl, onnx",
    maxFileSizeMb: 500,
  },
  {
    key: "export",
    label: "Export",
    category: "export",
    icon: FileCheck,
    colorKey: "teal",
    extensions: "pdf, xlsx, csv, json, sql",
    maxFileSizeMb: 200,
  },
  {
    key: "backup",
    label: "Backup",
    category: "backup",
    icon: Archive,
    colorKey: "slate",
    extensions: "zip, gz, json, sql",
    maxFileSizeMb: 1024,
  },
  {
    key: "audit",
    label: "Audit",
    category: "audit",
    icon: HardDrive,
    colorKey: "blue",
    extensions: "csv, json, pdf",
    maxFileSizeMb: 100,
  },
  {
    key: "video",
    label: "Video",
    category: "video",
    icon: Video,
    colorKey: "violet",
    extensions: "mp4, mov, webm",
    maxFileSizeMb: 1024,
  },
  {
    key: "database",
    label: "Dữ liệu khác",
    category: "custom",
    icon: Database,
    colorKey: "blue",
    extensions: "json, csv, txt, pdf",
    maxFileSizeMb: 500,
  },
  {
    key: "consent",
    label: "Consent",
    category: "consent",
    icon: Bot,
    colorKey: "emerald",
    extensions: "pdf, json",
    maxFileSizeMb: 50,
  },
];

const COLOR_OPTIONS = [
  { key: "blue", label: "Xanh y tế", className: "from-[#0B5C9A] to-[#0EA5E9]" },
  { key: "emerald", label: "Xanh ngọc", className: "from-[#00A896] to-[#10B981]" },
  { key: "amber", label: "Hổ phách", className: "from-[#F59E0B] to-[#F97316]" },
  { key: "rose", label: "Đỏ nhạt", className: "from-[#EF4444] to-[#F97316]" },
  { key: "violet", label: "Tím kỹ thuật", className: "from-[#7C3AED] to-[#0B5C9A]" },
  { key: "slate", label: "Xám thiết bị", className: "from-[#334155] to-[#0B5C9A]" },
  { key: "teal", label: "Teal", className: "from-[#0F766E] to-[#00A896]" },
  { key: "cyan", label: "Cyan", className: "from-[#0EA5E9] to-[#00A896]" },
];

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

export function CreateBucketDialog({ open, onOpenChange, onCreate }: CreateBucketDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [quota, setQuota] = useState("100");
  const [allowed, setAllowed] = useState("pdf, jpg, png, wav, json");
  const [retentionDays, setRetentionDays] = useState("3650");
  const [encrypt, setEncrypt] = useState(true);
  const [typeKey, setTypeKey] = useState("database");
  const [colorKey, setColorKey] = useState("blue");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("500");
  const [submitting, setSubmitting] = useState(false);

  const selectedType = BUCKET_TYPES.find((item) => item.key === typeKey) || BUCKET_TYPES[0];

  const applyType = (key: string) => {
    const type = BUCKET_TYPES.find((item) => item.key === key);
    if (!type) return;
    setTypeKey(type.key);
    setColorKey(type.colorKey);
    setAllowed(type.extensions);
    setMaxFileSizeMb(String(type.maxFileSizeMb));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên bucket");
      return;
    }

    const payload: BucketCreatePayload = {
      name,
      description,
      iconKey: typeKey,
      colorKey,
      category: selectedType.category,
      quotaGb: Number(quota) || 100,
      visibility,
      allowedExtensions: splitList(allowed),
      maxFileSizeMb: Number(maxFileSizeMb) || selectedType.maxFileSizeMb,
      retentionDays: Number(retentionDays) || 3650,
      encryptionRequired: encrypt,
    };

    setSubmitting(true);
    try {
      if (onCreate) {
        await onCreate(payload);
      } else {
        toast.success(`Đã tạo bucket "${name}"`);
      }
      onOpenChange(false);
      setName("");
      setDescription("");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tạo bucket."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-border p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FolderPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">
                  Tạo bucket mới
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Chọn biểu tượng, quota và chính sách lưu trữ cho bucket production.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={submit} className="space-y-5 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">Tên bucket</label>
                <input
                  value={name}
                  onChange={(e) =>
                    setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                  placeholder="vd: clinic-reports"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Quota (GB)</label>
                <input
                  type="number"
                  min={1}
                  value={quota}
                  onChange={(e) => setQuota(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Mô tả</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Bucket dùng để lưu..."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Loại bucket và biểu tượng</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BUCKET_TYPES.map((item) => {
                  const Icon = item.icon;
                  const active = typeKey === item.key;
                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => applyType(item.key)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Màu đại diện</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    type="button"
                    key={color.key}
                    onClick={() => setColorKey(color.key)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      colorKey === color.key
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <span className={`h-5 w-5 rounded-md bg-gradient-to-br ${color.className}`} />
                    {color.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium">Quyền mặc định</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility("private")}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      visibility === "private"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border"
                    }`}
                  >
                    <Lock className="h-4 w-4" /> Riêng tư
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility("public")}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      visibility === "public"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border"
                    }`}
                  >
                    <Globe2 className="h-4 w-4" /> Công khai
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Giữ dữ liệu (ngày)</label>
                <input
                  type="number"
                  min={0}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Dung lượng/tệp (MB)</label>
                <input
                  type="number"
                  min={1}
                  value={maxFileSizeMb}
                  onChange={(e) => setMaxFileSizeMb(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Loại file cho phép</label>
              <input
                value={allowed}
                onChange={(e) => setAllowed(e.target.value)}
                placeholder="dcm, jpg, png, pdf..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
              />
            </div>

            <label className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-3 text-sm">
              <span>
                <span className="font-medium">Bắt buộc mã hóa dữ liệu nhạy cảm</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Nên bật cho audio, DICOM, báo cáo và dữ liệu bệnh nhân.
                </span>
              </span>
              <input
                type="checkbox"
                checked={encrypt}
                onChange={(e) => setEncrypt(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
            </label>

            <div className="flex gap-3 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Hủy
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? "Đang tạo..." : "Tạo bucket"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
