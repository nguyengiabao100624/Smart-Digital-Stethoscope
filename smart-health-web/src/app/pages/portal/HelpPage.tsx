import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  HelpCircle,
  Link2,
  Loader2,
  MailWarning,
  MessageCircle,
  RotateCcw,
  Search,
  ShieldMinus,
  UserPlus,
  WifiOff,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import {
  smartHealthApi,
  type SupportTicketCreateResponse,
  type SupportTicketType,
} from "../../../lib/smart-health-api";
import { useAuth } from "../../context/AuthContext";

type TicketForm = {
  type: SupportTicketType | "";
  description: string;
};

type TicketErrors = Partial<Record<keyof TicketForm, string>>;

const issueTypes: Array<{ value: SupportTicketType; label: string }> = [
  { value: "device_connection", label: "Thiết bị không kết nối" },
  { value: "measurement_missing", label: "Không nhận được lượt đo" },
  { value: "account_access", label: "Tài khoản hoặc quyền truy cập" },
  { value: "interface_issue", label: "Lỗi giao diện" },
  { value: "other", label: "Khác" },
];

const guides = [
  {
    icon: UserPlus,
    title: "Mời bệnh nhân",
    description: "Kiểm tra quy trình tạo hồ sơ và gửi lời mời consent.",
    issueType: "account_access" as const,
  },
  {
    icon: Link2,
    title: "Gán thiết bị",
    description: "Kiểm tra điều kiện gán ống nghe Shcare cho bệnh nhân.",
    issueType: "device_connection" as const,
  },
  {
    icon: WifiOff,
    title: "Thiết bị offline",
    description: "Kiểm tra nguồn, Wi-Fi và trạng thái kết nối gần nhất.",
    issueType: "device_connection" as const,
  },
  {
    icon: MailWarning,
    title: "Chưa nhận email",
    description: "Kiểm tra địa chỉ email và trạng thái gửi lời mời.",
    issueType: "account_access" as const,
  },
  {
    icon: ShieldMinus,
    title: "Thu hồi consent",
    description: "Xem lại scope, người nhận và trạng thái quyền truy cập.",
    issueType: "other" as const,
  },
  {
    icon: FileText,
    title: "Xem lượt đo và waveform",
    description: "Kiểm tra quyền truy cập và trạng thái xử lý lượt đo.",
    issueType: "measurement_missing" as const,
  },
];

function createSupportIntentKey() {
  const randomId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `portal-support-${randomId}`;
}

function ticketFingerprint(form: TicketForm) {
  return JSON.stringify({
    type: form.type,
    description: form.description.trim(),
  });
}

function validateTicket(form: TicketForm) {
  const errors: TicketErrors = {};
  if (!form.type) errors.type = "Hãy chọn loại vấn đề.";
  if (form.description.trim().length < 10) {
    errors.description = "Mô tả phải có ít nhất 10 ký tự.";
  }
  return errors;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : value;
}

export default function HelpPage() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspace.id || "";
  const requesterUserId = user?.id || "";
  const [search, setSearch] = useState("");
  const [ticketForm, setTicketForm] = useState<TicketForm>({
    type: "",
    description: "",
  });
  const [fieldErrors, setFieldErrors] = useState<TicketErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] =
    useState<SupportTicketCreateResponse | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const attemptRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const inFlightRef = useRef(false);

  const filteredGuides = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");
    if (!query) return guides;
    return guides.filter((guide) =>
      `${guide.title} ${guide.description}`
        .toLocaleLowerCase("vi-VN")
        .includes(query),
    );
  }, [search]);

  const dirty =
    !receipt &&
    Boolean(ticketForm.type || ticketForm.description.trim().length > 0);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const guardUnsaved = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guardUnsaved);
    return () => window.removeEventListener("beforeunload", guardUnsaved);
  }, [dirty]);

  const updateForm = (patch: Partial<TicketForm>) => {
    setTicketForm((current) => ({ ...current, ...patch }));
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of Object.keys(patch) as Array<keyof TicketForm>) {
        delete next[field];
      }
      return next;
    });
    setSubmitError("");
  };

  const handleSubmit = async () => {
    if (inFlightRef.current || !online) return;
    const errors = validateTicket(ticketForm);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!workspaceId || !requesterUserId || !ticketForm.type) {
      setSubmitError(
        "Không xác định được tài khoản hoặc workspace hiện tại. Hãy đăng nhập lại.",
      );
      return;
    }

    const fingerprint = ticketFingerprint(ticketForm);
    const attempt =
      attemptRef.current?.fingerprint === fingerprint
        ? attemptRef.current
        : {
            fingerprint,
            idempotencyKey: createSupportIntentKey(),
          };
    attemptRef.current = attempt;
    inFlightRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await smartHealthApi.createSupportTicket(
        {
          type: ticketForm.type,
          description: ticketForm.description.trim(),
        },
        attempt.idempotencyKey,
        { workspaceId, requesterUserId },
      );
      attemptRef.current = null;
      setReceipt(result);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Không thể gửi yêu cầu hỗ trợ.",
      );
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const resetTicket = () => {
    setTicketForm({ type: "", description: "" });
    setFieldErrors({});
    setSubmitError("");
    setReceipt(null);
    attemptRef.current = null;
  };

  return (
    <div
      data-testid="portal-help-page"
      className="mx-auto max-w-6xl space-y-6"
    >
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <HelpCircle aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Hỗ trợ Shcare
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Tìm hướng dẫn nhanh hoặc gửi yêu cầu được ràng buộc với workspace
              hiện tại.
            </p>
          </div>
        </div>
      </header>

      {!online ? (
        <Alert className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Bạn đang ngoại tuyến</AlertTitle>
          <AlertDescription>
            Hướng dẫn vẫn có thể xem, nhưng yêu cầu chỉ được gửi khi kết nối
            mạng trở lại.
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="help-guides-heading" className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2
              id="help-guides-heading"
              className="text-lg font-semibold text-foreground"
            >
              Hướng dẫn nhanh
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chọn một hướng dẫn để điền sẵn đúng nhóm vấn đề.
            </p>
          </div>
          <div className="relative w-full sm:max-w-sm">
            <Label htmlFor="portal-help-search" className="sr-only">
              Tìm hướng dẫn
            </Label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="portal-help-search"
              name="portalHelpSearch"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm hướng dẫn"
              aria-label="Tìm hướng dẫn"
              className="h-11 pl-10"
            />
          </div>
        </div>

        {filteredGuides.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredGuides.map((guide) => {
              const GuideIcon = guide.icon;
              return (
                <button
                  key={guide.title}
                  type="button"
                  data-support-guide={guide.title}
                  aria-label={`${guide.title}: ${guide.description}`}
                  onClick={() =>
                    updateForm({
                      type: guide.issueType,
                      description:
                        ticketForm.description || guide.description,
                    })
                  }
                  className="min-h-11 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
                >
                  <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <GuideIcon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="block text-sm font-semibold">
                    {guide.title}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {guide.description}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex min-h-32 flex-col items-center justify-center p-6 text-center">
              <Search aria-hidden="true" className="size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">
                Không tìm thấy hướng dẫn phù hợp
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Thử từ khóa khác hoặc gửi yêu cầu hỗ trợ bên dưới.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-labelledby="support-ticket-heading">
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle
              id="support-ticket-heading"
              className="flex items-center gap-2 text-lg"
            >
              <MessageCircle aria-hidden="true" className="size-5 text-primary" />
              Gửi yêu cầu hỗ trợ
            </CardTitle>
            <CardDescription>
              Backend sẽ tạo mã yêu cầu, khóa theo tài khoản và workspace, rồi
              trả biên nhận trước khi Portal báo thành công.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {receipt ? (
              <div
                id="support-ticket-success"
                className="mx-auto max-w-xl py-4 text-center"
                role="status"
                aria-live="polite"
              >
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
                  <CheckCircle2 aria-hidden="true" className="size-6" />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-foreground">
                  Đã ghi nhận yêu cầu
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Biên nhận do backend tạo cho workspace hiện tại.
                </p>
                <dl className="mx-auto mt-5 grid max-w-md gap-3 rounded-xl border bg-muted/30 p-4 text-left text-sm sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted-foreground">
                      Mã yêu cầu
                    </dt>
                    <dd className="mt-1 break-all font-mono text-foreground">
                      {receipt.ticket.id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">
                      Trạng thái
                    </dt>
                    <dd className="mt-1">
                      <Badge
                        variant="outline"
                        className="border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                      >
                        Đang mở
                      </Badge>
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-muted-foreground">
                      Thời điểm ghi nhận
                    </dt>
                    <dd className="mt-1 text-foreground">
                      {formatCreatedAt(receipt.ticket.createdAt)}
                    </dd>
                  </div>
                </dl>
                {receipt.replayed ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Yêu cầu đã được ghi nhận trước đó
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 h-11"
                  onClick={resetTicket}
                >
                  Gửi yêu cầu khác
                </Button>
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="support-ticket-type">Loại vấn đề</Label>
                    <Select
                      value={ticketForm.type}
                      onValueChange={(value) =>
                        updateForm({ type: value as SupportTicketType })
                      }
                    >
                      <SelectTrigger
                        id="support-ticket-type"
                        className="h-11"
                        aria-invalid={Boolean(fieldErrors.type)}
                        aria-describedby={
                          fieldErrors.type
                            ? "support-ticket-type-error"
                            : undefined
                        }
                      >
                        <SelectValue placeholder="Chọn loại vấn đề" />
                      </SelectTrigger>
                      <SelectContent>
                        {issueTypes.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldErrors.type ? (
                      <p
                        id="support-ticket-type-error"
                        className="text-sm text-destructive"
                      >
                        {fieldErrors.type}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="support-ticket-description">
                        Mô tả vấn đề
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {ticketForm.description.length}/3000
                      </span>
                    </div>
                    <Textarea
                      id="support-ticket-description"
                      name="supportTicketDescription"
                      value={ticketForm.description}
                      onChange={(event) =>
                        updateForm({ description: event.target.value })
                      }
                      rows={6}
                      maxLength={3000}
                      placeholder="Mô tả điều bạn đã thử, trạng thái hiện tại và thời điểm xảy ra…"
                      aria-label="Mô tả vấn đề"
                      aria-invalid={Boolean(fieldErrors.description)}
                      aria-describedby={
                        fieldErrors.description
                          ? "support-ticket-description-error"
                          : "support-ticket-description-hint"
                      }
                      className="min-h-36 resize-y"
                    />
                    {fieldErrors.description ? (
                      <p
                        id="support-ticket-description-error"
                        className="text-sm text-destructive"
                      >
                        {fieldErrors.description}
                      </p>
                    ) : (
                      <p
                        id="support-ticket-description-hint"
                        className="text-xs text-muted-foreground"
                      >
                        Không nhập mật khẩu, secret thiết bị hoặc dữ liệu không
                        cần thiết cho việc hỗ trợ.
                      </p>
                    )}
                  </div>

                  {submitError ? (
                    <Alert variant="destructive">
                      <AlertCircle aria-hidden="true" />
                      <AlertTitle>Chưa gửi được yêu cầu</AlertTitle>
                      <AlertDescription className="space-y-3">
                        <p>{submitError}</p>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 border-destructive/40 bg-background"
                          disabled={submitting || !online}
                          onClick={() => void handleSubmit()}
                        >
                          <RotateCcw aria-hidden="true" />
                          Thử gửi lại
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <Button
                    id="support-ticket-submit"
                    type="button"
                    className="h-11 w-full sm:w-auto"
                    disabled={submitting || !online}
                    onClick={() => void handleSubmit()}
                  >
                    {submitting ? (
                      <>
                        <Loader2
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                        Đang gửi…
                      </>
                    ) : (
                      <>
                        <MessageCircle aria-hidden="true" />
                        Gửi yêu cầu hỗ trợ
                      </>
                    )}
                  </Button>
                </div>

                <aside className="rounded-xl border bg-muted/30 p-4">
                  <h3 className="text-sm font-semibold text-foreground">
                    Trước khi gửi
                  </h3>
                  <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      Chọn đúng nhóm để yêu cầu được phân loại.
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      Ghi lại bước đã thử và trạng thái lỗi.
                    </li>
                    <li className="flex gap-2">
                      <CheckCircle2
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      Chỉ tin trạng thái thành công khi có mã biên nhận.
                    </li>
                  </ul>
                </aside>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
