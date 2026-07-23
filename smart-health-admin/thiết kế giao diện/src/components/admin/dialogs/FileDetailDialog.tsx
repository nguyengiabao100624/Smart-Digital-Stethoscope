import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Clock,
  Copy,
  Download,
  FileText,
  HardDrive,
  Lock,
  Share2,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { ConfirmActionDialog } from "../ConfirmActionDialog";

export interface StorageFile {
  id: string;
  name: string;
  bucket: string;
  type: string;
  size: string;
  uploader: string;
  uploadedAt: string;
  visibility: "private";
  previewUrl?: string;
  downloadUrl?: string;
  createdAt?: string;
  byteSize?: number;
  tags?: string[];
}

interface FileDetailDialogProps {
  file: StorageFile | null;
  onClose: () => void;
  onDownload?: (file: StorageFile) => void;
  onShare?: (file: StorageFile) => Promise<string | void> | string | void;
  onDelete?: (file: StorageFile) => Promise<void> | void;
}

export function FileDetailDialog({
  file,
  onClose,
  onDownload,
  onShare,
  onDelete,
}: FileDetailDialogProps) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [generatedShareLink, setGeneratedShareLink] = useState<{
    fileId: string;
    url: string;
  } | null>(null);
  if (!file) return null;

  const visibleShareUrl = generatedShareLink?.fileId === file.id ? generatedShareLink.url : "";

  const copyLink = async () => {
    if (!onShare) return;
    setSharing(true);
    try {
      const createdUrl = visibleShareUrl || (await onShare(file));
      const url = typeof createdUrl === "string" ? createdUrl.trim() : "";
      if (!url) throw new Error("Backend chưa trả về liên kết chia sẻ hợp lệ.");
      setGeneratedShareLink({ fileId: file.id, url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Đã sao chép liên kết");
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tạo liên kết chia sẻ."));
    } finally {
      setSharing(false);
    }
  };

  const deleteFile = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete?.(file);
      setConfirmDeleteOpen(false);
      onClose();
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể xóa tệp.");
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog.Root open={!!file} onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <Dialog.Title className="truncate font-semibold text-foreground">
                    {file.name}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground">
                    {file.bucket} • {file.type.toUpperCase()} • {file.size}
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5">
              <div className="flex min-h-[260px] items-center justify-center border-b border-border bg-muted/20 p-5 md:col-span-3 md:border-b-0 md:border-r">
                {file.previewUrl ? (
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="max-h-[360px] w-auto rounded-lg object-contain shadow-md"
                  />
                ) : (
                  <div className="text-center">
                    <div className="mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10">
                      <FileText className="h-12 w-12 text-primary" />
                    </div>
                    <div className="text-sm font-medium uppercase">{file.type}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Không có bản xem trước</div>
                  </div>
                )}
              </div>

              <div className="space-y-5 p-5 md:col-span-2">
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Thông tin
                  </h3>
                  <div className="space-y-2.5 text-sm">
                    <Row icon={HardDrive} label="Bucket" value={file.bucket} />
                    <Row icon={UserIcon} label="Người tải" value={file.uploader} />
                    <Row icon={Clock} label="Ngày tải" value={file.uploadedAt} />
                    <Row icon={Lock} label="Quyền" value="Theo quyền workspace" />
                  </div>
                </section>

                {file.tags && file.tags.length > 0 ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {file.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                {onShare ? (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Liên kết chia sẻ
                    </h3>
                    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                      <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                        {visibleShareUrl || "Bấm Chia sẻ để tạo liên kết"}
                      </span>
                      <button
                        onClick={copyLink}
                        disabled={sharing}
                        aria-label={
                          sharing ? "Đang tạo liên kết chia sẻ" : "Tạo và sao chép liên kết"
                        }
                        className="text-muted-foreground hover:text-primary"
                        title="Tạo và sao chép liên kết"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                    {copied ? <p className="mt-1 text-xs text-success">Đã sao chép!</p> : null}
                  </section>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/20 p-4">
              {onShare ? (
                <button
                  onClick={copyLink}
                  disabled={sharing}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <Share2 className="h-4 w-4" /> {sharing ? "Đang tạo..." : "Chia sẻ"}
                </button>
              ) : null}
              {onDownload ? (
                <button
                  onClick={() => onDownload(file)}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <Download className="h-4 w-4" /> Tải xuống
                </button>
              ) : null}
              {onDelete ? (
                <button
                  onClick={() => {
                    setDeleteError("");
                    setConfirmDeleteOpen(true);
                  }}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" /> {deleting ? "Đang xóa..." : "Xóa tệp"}
                </button>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {onDelete ? (
        <ConfirmActionDialog
          open={confirmDeleteOpen}
          onOpenChange={(open) => {
            setConfirmDeleteOpen(open);
            if (!open) setDeleteError("");
          }}
          title="Xóa tệp lưu trữ"
          description={
            <span>
              Bạn có chắc chắn muốn xóa <strong>{file.name}</strong>? Hành động này không thể hoàn
              tác.
            </span>
          }
          confirmLabel="Xóa tệp"
          tone="danger"
          loading={deleting}
          error={deleteError}
          onConfirm={deleteFile}
        />
      ) : null}
    </>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="ml-auto truncate text-right font-medium">{value}</span>
    </div>
  );
}
