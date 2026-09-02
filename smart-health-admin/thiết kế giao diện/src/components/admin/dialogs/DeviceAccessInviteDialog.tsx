import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Clock3,
  Copy,
  Download,
  Eye,
  LoaderCircle,
  QrCode,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import {
  smartHealthApi,
  type SmartHealthDevice,
  type SmartHealthDeviceAccessGrant,
  type SmartHealthDeviceAccessInvite,
  type SmartHealthDeviceAccessInviteCreation,
  type SmartHealthDeviceAccessLevel,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

type DeviceAccessInviteDialogProps = {
  device: SmartHealthDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ACCESS_OPTIONS: Array<{
  value: SmartHealthDeviceAccessLevel;
  title: string;
  description: string;
  icon: typeof Eye;
}> = [
  {
    value: "viewer",
    title: "Xem & kết nối Wi-Fi",
    description:
      "Xem trạng thái, thông tin thiết bị và cấu hình Wi-Fi. Không được sửa hoặc thu hồi thiết bị.",
    icon: Eye,
  },
  {
    value: "manager",
    title: "Quản lý thiết bị",
    description:
      "Dùng, cấu hình Wi-Fi và điều chỉnh thiết bị trong đúng workspace. Không có quyền Platform Admin.",
    icon: ShieldCheck,
  },
];

const EXPIRY_OPTIONS = [
  { value: 1, label: "1 giờ" },
  { value: 24, label: "24 giờ" },
  { value: 72, label: "3 ngày" },
  { value: 168, label: "7 ngày" },
];

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
    parsed,
  );
}

function statusLabel(status: SmartHealthDeviceAccessInvite["status"]) {
  return {
    active: "Chưa sử dụng",
    redeemed: "Đã sử dụng",
    expired: "Đã hết hạn",
    revoked: "Đã thu hồi",
  }[status];
}

export function DeviceAccessInviteDialog({
  device,
  open,
  onOpenChange,
}: DeviceAccessInviteDialogProps) {
  const [accessLevel, setAccessLevel] = useState<SmartHealthDeviceAccessLevel>("viewer");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [created, setCreated] = useState<SmartHealthDeviceAccessInviteCreation | null>(null);
  const [invites, setInvites] = useState<SmartHealthDeviceAccessInvite[]>([]);
  const [grants, setGrants] = useState<SmartHealthDeviceAccessGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [error, setError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const qrRef = useRef<SVGSVGElement | null>(null);

  const loadAccess = useCallback(async () => {
    if (!device) return;
    setLoading(true);
    setError("");
    try {
      const result = await smartHealthApi.listDeviceAccess(device.id);
      setInvites(result.invites);
      setGrants(result.grants);
    } catch (cause) {
      setError(toVietnameseErrorMessage(cause, "Không thể tải danh sách mã truy cập."));
    } finally {
      setLoading(false);
    }
  }, [device]);

  useEffect(() => {
    if (!open || !device) return;
    setAccessLevel("viewer");
    setExpiresInHours(24);
    setCreated(null);
    setIdempotencyKey(crypto.randomUUID());
    void loadAccess();
  }, [open, device, loadAccess]);

  const createInvite = async () => {
    if (!device || creating) return;
    const stableKey = idempotencyKey || crypto.randomUUID();
    setIdempotencyKey(stableKey);
    setCreating(true);
    setError("");
    try {
      const result = await smartHealthApi.createDeviceAccessInvite(
        device.id,
        { accessLevel, expiresInHours },
        stableKey,
      );
      setCreated(result);
      setInvites((current) => [
        result.invite,
        ...current.filter((item) => item.id !== result.invite.id),
      ]);
      toast.success("Đã tạo mã truy cập thiết bị");
    } catch (cause) {
      setError(toVietnameseErrorMessage(cause, "Không thể tạo mã truy cập thiết bị."));
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async () => {
    if (!created?.code) return;
    try {
      await navigator.clipboard.writeText(created.code);
      toast.success("Đã sao chép mã truy cập");
    } catch {
      toast.error("Trình duyệt không cho phép sao chép tự động");
    }
  };

  const downloadQr = () => {
    if (!qrRef.current || !device) return;
    const source = new XMLSerializer().serializeToString(qrRef.current);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shcare-device-access-${device.id}-${created?.invite.accessLevel || "code"}.svg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const revokeInvite = async (invite: SmartHealthDeviceAccessInvite) => {
    if (!device || revokingId) return;
    setRevokingId(invite.id);
    setError("");
    try {
      const result = await smartHealthApi.revokeDeviceAccessInvite(device.id, invite.id);
      setInvites((current) =>
        current.map((item) => (item.id === result.invite.id ? result.invite : item)),
      );
      toast.success("Đã thu hồi mã truy cập");
    } catch (cause) {
      setError(toVietnameseErrorMessage(cause, "Không thể thu hồi mã truy cập."));
    } finally {
      setRevokingId("");
    }
  };

  const revokeGrant = async (grant: SmartHealthDeviceAccessGrant) => {
    if (!device || revokingId) return;
    setRevokingId(grant.id);
    setError("");
    try {
      const result = await smartHealthApi.revokeDeviceAccessGrant(device.id, grant.id);
      setGrants((current) =>
        current.map((item) => (item.id === result.grant.id ? result.grant : item)),
      );
      toast.success("Đã thu hồi quyền truy cập thiết bị");
    } catch (cause) {
      setError(toVietnameseErrorMessage(cause, "Không thể thu hồi quyền truy cập thiết bị."));
    } finally {
      setRevokingId("");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/45" />
        <Dialog.Content
          aria-describedby="device-access-description"
          className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl focus:outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <QrCode className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Tạo mã/QR truy cập
                </Dialog.Title>
                <Dialog.Description
                  id="device-access-description"
                  className="mt-1 text-sm leading-6 text-muted-foreground"
                >
                  {device?.name || device?.id} · người nhận chỉ nhập mã hoặc quét QR trong App
                  Shcare.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Đóng"
                disabled={creating}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6 p-5 sm:p-6">
            {!created ? (
              <>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-foreground">Quyền được cấp</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ACCESS_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const selected = accessLevel === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`relative flex min-h-36 cursor-pointer flex-col rounded-xl border p-4 transition-colors motion-reduce:transition-none focus-within:ring-2 focus-within:ring-ring ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                        >
                          <input
                            type="radio"
                            name="device-access-level"
                            value={option.value}
                            checked={selected}
                            onChange={() => setAccessLevel(option.value)}
                            className="sr-only"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`flex h-10 w-10 items-center justify-center rounded-lg ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                            >
                              <Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                            {selected ? (
                              <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                            ) : null}
                          </div>
                          <span className="mt-3 text-sm font-semibold text-foreground">
                            {option.title}
                          </span>
                          <span className="mt-1 text-xs leading-5 text-muted-foreground">
                            {option.description}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="block space-y-2 text-sm font-medium text-foreground">
                  Thời hạn sử dụng mã
                  <select
                    value={expiresInHours}
                    onChange={(event) => setExpiresInHours(Number(event.target.value))}
                    className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {EXPIRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-xl border border-info/25 bg-info/10 p-4 text-sm leading-6 text-foreground">
                  Mỗi mã chỉ dùng được một lần và chỉ trong workspace của thiết bị. Mã quản lý không
                  cấp quyền quản trị toàn hệ thống.
                </div>

                <button
                  type="button"
                  onClick={() => void createInvite()}
                  disabled={creating || !device}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? (
                    <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <QrCode className="h-5 w-5" />
                  )}
                  {creating ? "Đang tạo mã an toàn..." : "Tạo mã và QR"}
                </button>
              </>
            ) : (
              <section className="space-y-5" aria-live="polite">
                <div className="rounded-xl border border-success/30 bg-success/10 p-4">
                  <div className="flex items-center gap-2 font-semibold text-success">
                    <Check className="h-5 w-5" /> Mã đã sẵn sàng
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    Mã thô chỉ xuất hiện trong lần tạo này. Hãy giao đúng mã/QR cho người nhận.
                  </p>
                </div>
                <div className="grid items-center gap-5 rounded-xl border border-border bg-background p-5 sm:grid-cols-[220px_1fr]">
                  <div className="mx-auto rounded-xl border border-border bg-white p-3 shadow-sm">
                    <QRCodeSVG
                      ref={qrRef}
                      value={created.qrPayload}
                      size={192}
                      level="Q"
                      marginSize={4}
                      title="QR truy cập thiết bị Shcare"
                      bgColor="#FFFFFF"
                      fgColor="#0B1F33"
                    />
                  </div>
                  <div className="min-w-0 space-y-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Mã truy cập
                      </p>
                      <p
                        className="mt-1 break-all font-mono text-lg font-semibold tracking-wide text-foreground"
                        data-testid="device-access-code"
                      >
                        {created.code}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void copyCode()}
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Copy className="h-4 w-4" /> Sao chép mã
                      </button>
                      <button
                        type="button"
                        onClick={downloadQr}
                        className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Download className="h-4 w-4" /> Tải QR
                      </button>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4" /> Hết hạn{" "}
                      {formatDateTime(created.invite.expiresAt)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCreated(null);
                    setIdempotencyKey(crypto.randomUUID());
                  }}
                  className="min-h-11 w-full rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Tạo mã khác
                </button>
              </section>
            )}

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <section className="space-y-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Lịch sử mã và quyền</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Không thể xem lại mã thô sau khi đóng hộp thoại.
                  </p>
                </div>
                {loading ? (
                  <LoaderCircle
                    className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none"
                    aria-label="Đang tải"
                  />
                ) : null}
              </div>
              {!loading && invites.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Chưa có mã truy cập nào.
                </div>
              ) : null}
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {invite.accessLevel === "manager"
                          ? "Quản lý thiết bị"
                          : "Xem & kết nối Wi-Fi"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {statusLabel(invite.status)} · hết hạn {formatDateTime(invite.expiresAt)}
                      </p>
                    </div>
                    {invite.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => void revokeInvite(invite)}
                        disabled={Boolean(revokingId)}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        {revokingId === invite.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}{" "}
                        Thu hồi mã
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {grants.length > 0 ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tài khoản đã nhận quyền
                  </p>
                  {grants.map((grant) => (
                    <div
                      key={grant.id}
                      className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {grant.userId}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {grant.accessLevel === "manager"
                            ? "Quản lý thiết bị"
                            : "Xem & kết nối Wi-Fi"}
                          {grant.status === "revoked" ? " · Đã thu hồi" : " · Đang hoạt động"}
                        </p>
                      </div>
                      {grant.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => void revokeGrant(grant)}
                          disabled={Boolean(revokingId)}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          {revokingId === grant.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}{" "}
                          Thu hồi quyền
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
