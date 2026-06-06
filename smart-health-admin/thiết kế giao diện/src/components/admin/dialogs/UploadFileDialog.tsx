import React, { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, FileText, Globe2, Lock, Tag, Trash2, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

type BucketOption = {
  id: string;
  name?: string;
  desc?: string;
  allowedExtensions?: string[];
  maxFileSizeMb?: number;
  visibility?: string;
};

type UploadPayload = {
  bucket: string;
  file: File;
  visibility: string;
  tags: string[];
};

interface UploadFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBucket?: string;
  buckets?: BucketOption[];
  onUpload?: (payload: UploadPayload) => Promise<void> | void;
}

interface PendingFile {
  id: string;
  file: File;
  progress: number;
  done: boolean;
  error?: string;
}

const FALLBACK_BUCKETS: BucketOption[] = [
  { id: "medical-images", name: "Hình ảnh y khoa", allowedExtensions: ["dcm", "jpg", "png"] },
  { id: "heart-audio", name: "Âm thanh tim/phổi", allowedExtensions: ["wav", "mp3", "json"] },
  { id: "patient-reports", name: "Báo cáo bệnh nhân", allowedExtensions: ["pdf", "xlsx", "csv"] },
  { id: "device-firmware", name: "Firmware thiết bị", allowedExtensions: ["bin", "json"] },
  { id: "avatars", name: "Ảnh đại diện", allowedExtensions: ["jpg", "png", "webp"] },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extensionOf(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

export function UploadFileDialog({
  open,
  onOpenChange,
  defaultBucket,
  buckets = FALLBACK_BUCKETS,
  onUpload,
}: UploadFileDialogProps) {
  const [bucket, setBucket] = useState(defaultBucket || buckets[0]?.id || "heart-audio");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedBucket = buckets.find((item) => item.id === bucket);

  const addFiles = (list: File[]) => {
    const allowed = selectedBucket?.allowedExtensions || [];
    const next = list.map((file) => {
      const ext = extensionOf(file);
      const maxBytes = Number(selectedBucket?.maxFileSizeMb || 500) * 1024 * 1024;
      const blockedByExt = allowed.length > 0 && ext && !allowed.includes(ext);
      const blockedBySize = file.size > maxBytes;
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        progress: 0,
        done: false,
        error: blockedByExt
          ? `Bucket không cho phép file .${ext}`
          : blockedBySize
            ? `File vượt quá ${selectedBucket?.maxFileSizeMb || 500} MB`
            : undefined,
      };
    });
    setFiles((prev) => [...prev, ...next]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) {
      toast.error("Vui lòng chọn ít nhất một tệp");
      return;
    }
    const readyFiles = files.filter((file) => !file.error);
    if (!readyFiles.length) {
      toast.error("Không có tệp hợp lệ để tải lên");
      return;
    }

    setSubmitting(true);
    try {
      for (const item of readyFiles) {
        setFiles((prev) => prev.map((file) => (file.id === item.id ? { ...file, progress: 35 } : file)));
        if (onUpload) {
          await onUpload({
            bucket,
            file: item.file,
            visibility,
            tags: splitTags(tags),
          });
        }
        setFiles((prev) =>
          prev.map((file) => (file.id === item.id ? { ...file, progress: 100, done: true } : file)),
        );
      }
      toast.success(`Đã tải lên ${readyFiles.length} tệp vào ${bucket}`);
      onOpenChange(false);
      setFiles([]);
      setTags("");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tải tệp lên storage."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <UploadCloud className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="font-semibold text-foreground">Tải lên tệp</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Tệp được lưu vào object storage và ghi audit theo tài khoản quản trị.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Bucket đích</label>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              >
                {buckets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id} - {item.name || item.desc || "Bucket lưu trữ"}
                  </option>
                ))}
              </select>
              {selectedBucket?.allowedExtensions?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Cho phép: {selectedBucket.allowedExtensions.join(", ")}. Tối đa{" "}
                  {selectedBucket.maxFileSizeMb || 500} MB/tệp.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Tệp</label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <UploadCloud className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">Kéo thả tệp vào đây</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  hoặc bấm để chọn nhiều tệp từ máy tính.
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
                />
              </div>
            </div>

            <AnimatePresence>
              {files.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  {files.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 flex-shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{item.file.name}</div>
                          <div className={item.error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                            {item.error || formatSize(item.file.size)}
                          </div>
                        </div>
                        {item.done ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">
                            {Math.round(item.progress)}%
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((file) => file.id !== item.id))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className={`h-full transition-all ${item.error ? "bg-destructive" : item.done ? "bg-success" : "bg-primary"}`}
                          style={{ width: `${item.error ? 100 : item.progress}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Quyền truy cập</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibility("private")}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      visibility === "private" ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}
                  >
                    <Lock className="h-4 w-4" /> Riêng tư
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility("public")}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm ${
                      visibility === "public" ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}
                  >
                    <Globe2 className="h-4 w-4" /> Công khai
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Tags</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="VD: tim, tháng-5, báo-cáo"
                    className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>
            </div>

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
                {submitting ? "Đang tải lên..." : "Tải lên storage"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
