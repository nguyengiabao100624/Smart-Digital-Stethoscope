import React, { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { createStorageOperationIdempotencyKey } from "@/lib/storage-operations";

type BucketOption = {
  id: string;
  name?: string;
  desc?: string;
  allowedExtensions?: string[];
  maxFileSizeMb?: number;
};

type UploadPayload = {
  bucket: string;
  file: File;
  tags: string[];
  idempotencyKey: string;
};

interface UploadFileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBucket?: string;
  buckets: BucketOption[];
  onUpload: (payload: UploadPayload) => Promise<void> | void;
}

interface PendingFile {
  id: string;
  file: File;
  idempotencyKey: string;
  status: "ready" | "uploading" | "succeeded" | "failed" | "invalid";
  error?: string;
}

type UploadSummary = {
  succeeded: number;
  failed: number;
  invalid: number;
};

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

function validateFile(file: File, bucket?: BucketOption) {
  const allowed = bucket?.allowedExtensions || [];
  const extension = extensionOf(file);
  const maxFileSizeMb = Number(bucket?.maxFileSizeMb || 500);
  const maxBytes = maxFileSizeMb * 1024 * 1024;

  if (allowed.length > 0 && extension && !allowed.includes(extension)) {
    return `Bucket không cho phép tệp .${extension}`;
  }
  if (file.size > maxBytes) {
    return `Tệp vượt quá ${maxFileSizeMb} MB`;
  }
  return undefined;
}

export function UploadFileDialog({
  open,
  onOpenChange,
  defaultBucket,
  buckets,
  onUpload,
}: UploadFileDialogProps) {
  const [bucket, setBucket] = useState("");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [summary, setSummary] = useState<UploadSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setBucket((current) => {
      if (defaultBucket && buckets.some((item) => item.id === defaultBucket)) {
        return defaultBucket;
      }
      if (buckets.some((item) => item.id === current)) {
        return current;
      }
      return buckets[0]?.id || "";
    });
  }, [buckets, defaultBucket, open]);

  const selectedBucket = buckets.find((item) => item.id === bucket);
  const hasCompletedAttempt = files.some(
    (item) => item.status === "succeeded" || item.status === "failed",
  );
  const hasFailedUploads = files.some((item) => item.status === "failed");
  const retryableFiles = files.filter((item) =>
    hasFailedUploads ? item.status === "failed" : item.status === "ready",
  );

  const resetDialog = () => {
    setFiles([]);
    setTags("");
    setFormError("");
    setSummary(null);
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (submitting) return;
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  };

  const addFiles = (list: File[]) => {
    if (!selectedBucket || submitting || hasCompletedAttempt) return;
    const now = Date.now();
    const next = list.map((file, index): PendingFile => {
      const validationError = validateFile(file, selectedBucket);
      return {
        id: `${now}-${index}-${file.name}`,
        file,
        idempotencyKey: createStorageOperationIdempotencyKey(
          "file-upload",
          `${selectedBucket.id}-${now}-${index}`,
        ),
        status: validationError ? "invalid" : "ready",
        error: validationError,
      };
    });
    setFiles((previous) => [...previous, ...next]);
    setFormError("");
    setSummary(null);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files?.length) addFiles(Array.from(event.dataTransfer.files));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    if (!selectedBucket) {
      setFormError("Chưa có bucket hợp lệ để tải tệp.");
      return;
    }
    if (!files.length) {
      setFormError("Vui lòng chọn ít nhất một tệp.");
      return;
    }
    if (!retryableFiles.length) {
      setFormError(
        hasFailedUploads ? "Không còn tệp lỗi có thể thử lại." : "Không có tệp hợp lệ để tải lên.",
      );
      return;
    }

    setSubmitting(true);
    setSummary(null);
    let succeeded = 0;
    let failed = 0;

    for (const item of retryableFiles) {
      setFiles((previous) =>
        previous.map((file) =>
          file.id === item.id ? { ...file, status: "uploading", error: undefined } : file,
        ),
      );

      try {
        await onUpload({
          bucket: selectedBucket.id,
          file: item.file,
          tags: splitTags(tags),
          idempotencyKey: item.idempotencyKey,
        });
        succeeded += 1;
        setFiles((previous) =>
          previous.map((file) =>
            file.id === item.id ? { ...file, status: "succeeded", error: undefined } : file,
          ),
        );
      } catch (error) {
        failed += 1;
        const message = toVietnameseErrorMessage(error, "Không thể tải tệp lên storage.");
        setFiles((previous) =>
          previous.map((file) =>
            file.id === item.id ? { ...file, status: "failed", error: message } : file,
          ),
        );
      }
    }

    const previousSucceeded = files.filter((item) => item.status === "succeeded").length;
    const invalid = files.filter((item) => item.status === "invalid").length;
    const totalSucceeded = previousSucceeded + succeeded;
    setSummary({ succeeded: totalSucceeded, failed, invalid });
    setSubmitting(false);

    if (failed === 0 && invalid === 0) {
      toast.success(`Đã tải lên ${totalSucceeded} tệp vào ${selectedBucket.id}`);
      resetDialog();
      onOpenChange(false);
    }
  };

  const statusLabel = (item: PendingFile) => {
    if (item.status === "uploading") return "Đang tải lên…";
    if (item.status === "succeeded") return "Đã tải lên";
    if (item.status === "failed") return "Tải lên thất bại";
    if (item.status === "invalid") return "Tệp không hợp lệ";
    return "Sẵn sàng";
  };

  const accept = selectedBucket?.allowedExtensions?.length
    ? selectedBucket.allowedExtensions.map((extension) => `.${extension}`).join(",")
    : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 animate-in fade-in motion-reduce:animate-none" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 motion-reduce:animate-none">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-5 sm:p-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <UploadCloud className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-semibold text-foreground">Tải lên tệp</Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Mỗi tệp chỉ được đánh dấu thành công sau khi backend xác nhận.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close
              aria-label="Đóng hộp thoại tải tệp"
              disabled={submitting}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form method="post" onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-6">
            {buckets.length === 0 ? (
              <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Chưa có bucket từ backend</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Platform Admin cần tạo bucket trước khi tải tệp. Không có bucket mẫu được chèn
                      tại client.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="upload-bucket"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Bucket đích
                </label>
                <select
                  id="upload-bucket"
                  value={bucket}
                  onChange={(event) => {
                    setBucket(event.target.value);
                    setFiles([]);
                    setFormError("");
                    setSummary(null);
                  }}
                  disabled={submitting || hasCompletedAttempt}
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
                >
                  {buckets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} - {item.name || item.desc || "Bucket lưu trữ"}
                    </option>
                  ))}
                </select>
                {selectedBucket?.allowedExtensions?.length ? (
                  <p id="upload-bucket-hint" className="mt-1 text-xs text-muted-foreground">
                    Cho phép: {selectedBucket.allowedExtensions.join(", ")}. Tối đa{" "}
                    {selectedBucket.maxFileSizeMb || 500} MB/tệp.
                  </p>
                ) : null}
              </div>
            )}

            <div>
              <span className="mb-2 block text-sm font-medium text-foreground">Tệp</span>
              <div
                role="button"
                tabIndex={selectedBucket && !submitting && !hasCompletedAttempt ? 0 : -1}
                aria-disabled={!selectedBucket || submitting || hasCompletedAttempt}
                aria-describedby="upload-drop-hint"
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && !submitting) {
                    event.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!submitting && !hasCompletedAttempt) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => {
                  if (!submitting && !hasCompletedAttempt) inputRef.current?.click();
                }}
                className={`rounded-xl border-2 border-dashed p-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                  !selectedBucket || submitting || hasCompletedAttempt
                    ? "cursor-not-allowed border-border bg-muted/30 opacity-60"
                    : dragOver
                      ? "cursor-pointer border-primary bg-primary/5"
                      : "cursor-pointer border-border hover:border-primary/40 hover:bg-muted/30"
                }`}
              >
                <UploadCloud className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">Kéo thả tệp vào đây</div>
                <div id="upload-drop-hint" className="mt-1 text-xs text-muted-foreground">
                  hoặc bấm để chọn nhiều tệp từ máy tính.
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  accept={accept}
                  disabled={!selectedBucket || submitting || hasCompletedAttempt}
                  aria-label="Chọn tệp tải lên"
                  onChange={(event) => {
                    if (event.target.files) addFiles(Array.from(event.target.files));
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <AnimatePresence initial={false}>
              {files.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                  aria-live="polite"
                >
                  {files.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 flex-shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium" title={item.file.name}>
                            {item.file.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatSize(item.file.size)} · {statusLabel(item)}
                          </div>
                          {item.error ? (
                            <p className="mt-1 break-words text-xs text-destructive">
                              {item.error}
                            </p>
                          ) : null}
                        </div>
                        {item.status === "uploading" ? (
                          <Loader2
                            aria-label="Đang tải lên"
                            className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none"
                          />
                        ) : item.status === "succeeded" ? (
                          <CheckCircle2 aria-label="Đã tải lên" className="h-4 w-4 text-success" />
                        ) : item.status === "failed" || item.status === "invalid" ? (
                          <AlertCircle aria-label="Có lỗi" className="h-4 w-4 text-destructive" />
                        ) : null}
                        <button
                          type="button"
                          aria-label={`Bỏ tệp ${item.file.name}`}
                          disabled={submitting || item.status === "uploading"}
                          onClick={() => {
                            setFiles((previous) => previous.filter((file) => file.id !== item.id));
                            setSummary(null);
                            setFormError("");
                          }}
                          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {item.status === "uploading" ? (
                        <div
                          role="progressbar"
                          aria-label={`Đang tải ${item.file.name}`}
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
                        >
                          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <div>
              <label
                htmlFor="upload-tags"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Tags
              </label>
              <div className="relative">
                <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="upload-tags"
                  type="text"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  disabled={submitting || hasCompletedAttempt}
                  maxLength={300}
                  placeholder="VD: tim, tháng-5, báo-cáo"
                  className="min-h-11 w-full rounded-md border border-border bg-background py-2 pl-10 pr-3 text-sm outline-none focus:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tệp được tải ở chế độ riêng tư; quyền công khai chưa có contract thực thi.
              </p>
            </div>

            {summary ? (
              <div
                role="status"
                className={`rounded-lg border p-3 text-sm ${
                  summary.failed > 0 || summary.invalid > 0
                    ? "border-warning/30 bg-warning/5"
                    : "border-success/30 bg-success/5"
                }`}
              >
                <p className="font-medium text-foreground">
                  Kết quả: {summary.succeeded} thành công, {summary.failed} thất bại
                  {summary.invalid > 0 ? `, ${summary.invalid} không hợp lệ` : ""}.
                </p>
                {summary.failed > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Chỉ những tệp lỗi sẽ được thử lại; tệp thành công không được gửi lại.
                  </p>
                ) : null}
              </div>
            ) : null}

            {formError ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {formError}
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={submitting}
                  className="min-h-11 flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {hasCompletedAttempt ? "Đóng" : "Hủy"}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={submitting || !selectedBucket || retryableFiles.length === 0}
                className="min-h-11 flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? `Đang xử lý ${retryableFiles.length} tệp…`
                  : hasFailedUploads
                    ? `Thử lại ${retryableFiles.length} tệp lỗi`
                    : `Tải lên ${retryableFiles.length || ""} tệp`.replace("  ", " ")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
