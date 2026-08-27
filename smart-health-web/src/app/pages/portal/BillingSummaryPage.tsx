import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Info,
  Mail,
  PackageOpen,
  Phone,
  ReceiptText,
  RefreshCw,
  WalletCards,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";
import {
  smartHealthApi,
  type BillingUsageRow,
} from "../../../lib/smart-health-api";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";

const statusLabels: Record<string, string> = {
  active: "Đang hoạt động",
  trial: "Dùng thử",
  past_due: "Quá hạn",
  canceled: "Đã hủy",
  paused: "Tạm dừng",
};

const cycleLabels: Record<string, string> = {
  monthly: "Hàng tháng",
  annual: "Hàng năm",
  yearly: "Hàng năm",
};

const workspaceTypeLabels: Record<string, string> = {
  clinic: "Phòng khám",
  hospital: "Bệnh viện",
  solo_practice: "Phòng khám cá nhân",
  doctor_private: "Phòng khám cá nhân",
  personal: "Cá nhân / gia đình",
};

const featureLabels: Record<string, string> = {
  cloudStorage: "Lưu trữ cloud",
  analytics: "Báo cáo phân tích",
  aiDiagnosis: "Phân tích chất lượng tín hiệu",
  prioritySupport: "Hỗ trợ ưu tiên",
};

function labelOf(value?: string, labels: Record<string, string> = {}) {
  if (!value) return "Chưa cập nhật";
  return labels[value] || "Khác";
}

function formatMoney(amount?: number, currency = "VND") {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return "Chưa cập nhật";
  }
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "VND" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("vi-VN")} ${currency}`;
  }
}

function formatDateTime(value?: string) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Thời gian không hợp lệ"
    : date.toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      });
}

function usageValue(row: BillingUsageRow) {
  const used =
    row.key === "storageGb"
      ? row.used.toLocaleString("vi-VN", { maximumFractionDigits: 2 })
      : Math.round(row.used).toLocaleString("vi-VN");
  const limit =
    row.limit > 0
      ? row.key === "storageGb"
        ? row.limit.toLocaleString("vi-VN", { maximumFractionDigits: 2 })
        : Math.round(row.limit).toLocaleString("vi-VN")
      : "Không giới hạn";
  return `${used} / ${limit} ${row.unit}`;
}

function usagePresentation(row: BillingUsageRow) {
  if (row.status === "exceeded") {
    return {
      label: "Đã vượt hạn mức",
      className:
        "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
    };
  }
  if (row.status === "warning") {
    return {
      label: "Sắp đạt hạn mức",
      className:
        "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
    };
  }
  if (row.status === "unlimited") {
    return {
      label: "Không giới hạn",
      className: "border-border bg-muted text-muted-foreground",
    };
  }
  return {
    label: "Trong hạn mức",
    className:
      "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  };
}

function featureLabel(key: string) {
  return featureLabels[key] || "Tính năng theo gói";
}

export default function BillingSummaryPage() {
  const { user } = useAuth();
  const workspaceId = user?.currentWorkspace.id || "";
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const query = useQuery({
    queryKey: ["portal", "billing", workspaceId],
    queryFn: () => smartHealthApi.portalBilling(workspaceId),
    enabled: Boolean(user && workspaceId),
    retry: false,
  });

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  if (!workspaceId) {
    return (
      <PortalError
        error={new Error(
          "Tài khoản chưa có workspace hoạt động để xem thông tin gói.",
        )}
      />
    );
  }

  if (query.isLoading) {
    return <PortalLoading label="Đang tải thông tin gói dịch vụ..." />;
  }

  if (query.error || !query.data) {
    return (
      <PortalError
        error={query.error || new Error("Không thể tải thông tin gói dịch vụ.")}
        retry={online ? () => query.refetch() : undefined}
      />
    );
  }

  const billing = query.data;
  const workspace = billing.workspace;
  const servicePackage = billing.package;
  const subscription = billing.subscription;
  const status = subscription.status || workspace.subscriptionStatus || "";
  const cycle = subscription.billingCycle || workspace.billingCycle || "";
  const features = Object.entries(servicePackage?.features || {}).filter(
    ([, value]) => Boolean(value),
  );
  const refresh = () => {
    if (!online || query.isFetching) return;
    void query.refetch();
  };

  return (
    <div
      id="portal-billing-page"
      data-testid="portal-billing-page"
      className="mx-auto max-w-6xl space-y-5"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard size={21} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Gói dịch vụ
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Theo dõi gói, trạng thái thuê bao và hạn mức thực tế của
                workspace.
              </p>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={refresh}
          disabled={!online || query.isFetching}
          aria-label="Làm mới thông tin gói"
          aria-busy={query.isFetching}
        >
          <RefreshCw aria-hidden="true" />
          {query.isFetching ? "Đang làm mới" : "Làm mới"}
        </Button>
      </header>

      {!online ? (
        <Alert className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Bạn đang ngoại tuyến</AlertTitle>
          <AlertDescription>
            Dữ liệu bên dưới là snapshot gần nhất đã tải. Kết nối mạng để làm
            mới thông tin gói và hạn mức.
          </AlertDescription>
        </Alert>
      ) : null}

      <section
        id="portal-billing-plan"
        aria-label="Gói và quy trình thanh toán"
        className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]"
      >
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <CardDescription>Workspace</CardDescription>
                <CardTitle>
                  <h2 className="mt-1 break-words text-xl sm:text-2xl">
                    {workspace.name || user?.currentWorkspace.name}
                  </h2>
                </CardTitle>
                <p className="mt-2 text-sm text-muted-foreground">
                  {labelOf(
                    workspace.workspaceType || workspace.type,
                    workspaceTypeLabels,
                  )}
                </p>
              </div>
              <Badge
                variant="outline"
                className="min-h-8 border-border bg-muted px-3 text-foreground"
              >
                {labelOf(status, statusLabels)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {servicePackage ? (
              <>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <dt className="text-xs font-medium text-muted-foreground">
                      Tên gói
                    </dt>
                    <dd className="mt-2 break-words font-semibold text-foreground">
                      {servicePackage.name}
                    </dd>
                  </div>
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <dt className="text-xs font-medium text-muted-foreground">
                      Chi phí tham chiếu
                    </dt>
                    <dd className="mt-2 font-semibold text-foreground">
                      {formatMoney(
                        billing.currentCharge?.amount,
                        billing.currentCharge?.currency,
                      )}
                    </dd>
                  </div>
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <dt className="text-xs font-medium text-muted-foreground">
                      Chu kỳ
                    </dt>
                    <dd className="mt-2 font-semibold text-foreground">
                      {labelOf(cycle, cycleLabels)}
                    </dd>
                  </div>
                </dl>
                {features.length > 0 ? (
                  <div className="flex flex-wrap gap-2" aria-label="Tính năng của gói">
                    {features.map(([key]) => (
                      <Badge key={key} variant="secondary" className="min-h-8 gap-1.5">
                        <CheckCircle2 aria-hidden="true" />
                        {featureLabel(key)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Chưa có danh sách tính năng được backend xác nhận cho gói
                    này.
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed p-5">
                <div className="flex items-start gap-3">
                  <PackageOpen
                    className="mt-0.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold text-foreground">
                      Chưa có gói dịch vụ
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Liên hệ bộ phận hỗ trợ để xác nhận gói phù hợp. Hệ thống
                      chưa tạo chi phí hoặc hạn mức thay thế.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <WalletCards className="text-primary" aria-hidden="true" />
                <CardTitle>
                  <h2>Quy trình thanh toán</h2>
                </CardTitle>
              </div>
              <Badge variant="outline">Thủ công</Badge>
            </div>
            <CardDescription>
              Thanh toán trực tuyến chưa được tích hợp. Mọi thay đổi gói cần
              được Shcare xác nhận thủ công.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Mã gói</dt>
                <dd className="break-all text-right font-medium text-foreground">
                  {servicePackage?.id || workspace.packageId || "Chưa có"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Nguồn dữ liệu</dt>
                <dd className="text-right font-medium text-foreground">
                  {subscription.source === "subscription"
                    ? "Bản ghi thuê bao"
                    : "Workspace"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Cập nhật</dt>
                <dd className="text-right font-medium text-foreground">
                  {formatDateTime(billing.generatedAt)}
                </dd>
              </div>
            </dl>
            <Button asChild className="h-11 w-full">
              <Link to="/portal/help">
                <ReceiptText aria-hidden="true" />
                Yêu cầu hỗ trợ về gói
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card id="portal-billing-usage">
        <CardHeader className="sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>
              <h2>Hạn mức sử dụng</h2>
            </CardTitle>
            <CardDescription className="mt-1">
              Chỉ hiển thị số liệu backend đo được trong workspace hiện tại.
            </CardDescription>
          </div>
          <Badge variant="outline" className="mt-2 min-h-8 sm:mt-0">
            {labelOf(servicePackage?.duration || cycle, cycleLabels)}
          </Badge>
        </CardHeader>
        <CardContent>
          {billing.usageRows.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {billing.usageRows.map((row) => {
                const presentation = usagePresentation(row);
                return (
                  <article
                    key={row.key}
                    data-billing-usage-row={row.key}
                    className="rounded-xl border bg-muted/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium text-foreground">{row.label}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {usageValue(row)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`min-h-8 ${presentation.className}`}
                      >
                        {presentation.label}
                      </Badge>
                    </div>
                    {row.percent === null ? (
                      <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                        Gói này không công bố giới hạn phần trăm cho chỉ số.
                      </p>
                    ) : (
                      <Progress
                        className="mt-4"
                        value={row.percent}
                        aria-label={`${row.label}: ${presentation.label}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={row.percent}
                        aria-valuetext={`${row.percent}% — ${presentation.label}`}
                      />
                    )}
                    {row.status === "warning" ||
                    row.status === "exceeded" ? (
                      <p className="mt-3 flex items-start gap-2 text-xs text-[var(--status-warning-fg)]">
                        <AlertTriangle
                          className="mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        Cần kiểm tra hạn mức trước khi tiếp tục mở rộng sử dụng.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <PackageOpen
                className="mx-auto text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 font-semibold text-foreground">
                Chưa có dữ liệu hạn mức
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Liên hệ bộ phận hỗ trợ để xác nhận gói và hạn mức cho workspace.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <section
        id="portal-billing-contact"
        aria-label="Liên hệ và chính sách hóa đơn"
        className="grid gap-4 md:grid-cols-[.8fr_1.2fr]"
      >
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Liên hệ về gói</h2>
            </CardTitle>
            <CardDescription>
              Đầu mối được lưu ở cấp workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium text-foreground">
              {billing.billingContact.name || workspace.name}
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <Mail className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="break-all">
                {billing.billingContact.email || "Chưa cập nhật email"}
              </span>
            </p>
            <p className="flex items-start gap-2 text-muted-foreground">
              <Phone className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <span>
                {billing.billingContact.phone || "Chưa cập nhật số điện thoại"}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="text-primary" aria-hidden="true" />
              <CardTitle>
                <h2>Ghi nhận hóa đơn</h2>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              {billing.invoicePolicy.message}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Quy trình thủ công · chưa có nhà cung cấp thanh toán trực tuyến
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
