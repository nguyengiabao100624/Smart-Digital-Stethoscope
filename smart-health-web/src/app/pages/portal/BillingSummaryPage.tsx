import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Mail,
  Phone,
  ReceiptText,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import {
  smartHealthApi,
  type BillingUsageRow,
} from "../../../lib/smart-health-api";

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

const featureLabels: Record<string, string> = {
  cloudStorage: "Lưu trữ cloud",
  analytics: "Báo cáo phân tích",
  aiDiagnosis: "Phân tích chất lượng tín hiệu",
  prioritySupport: "Hỗ trợ ưu tiên",
};

function labelOf(value?: string, labels: Record<string, string> = {}) {
  if (!value) return "Chưa cập nhật";
  return labels[value] || value;
}

function formatMoney(amount = 0, currency = "VND") {
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

function usageTone(row: BillingUsageRow) {
  if (row.status === "exceeded") return "text-[#FF9A9A]";
  if (row.status === "warning") return "text-[#F59E0B]";
  return "text-[#00FFD1]";
}

export default function BillingSummaryPage() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["portal", "billing", user?.currentWorkspace.id],
    queryFn: smartHealthApi.portalBilling,
    enabled: Boolean(user),
  });

  if (query.isLoading) {
    return <PortalLoading label="Đang tải thông tin gói dịch vụ..." />;
  }

  if (query.error || !query.data) {
    return (
      <PortalError
        error={query.error || new Error("Không thể tải thông tin billing.")}
        retry={() => query.refetch()}
      />
    );
  }

  const billing = query.data;
  const workspace = billing.workspace;
  const servicePackage = billing.package;
  const subscription = billing.subscription;
  const status = subscription.status || workspace.subscriptionStatus || "";
  const cycle = subscription.billingCycle || workspace.billingCycle || "";
  const features = Object.entries(servicePackage?.features || {}).filter(([, value]) =>
    Boolean(value),
  );

  return (
    <div id="portal-billing-page" className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex items-center gap-2">
            <CreditCard size={22} />
            Gói dịch vụ
          </h1>
          <p className="text-sm text-[#94b8d0]">
            Theo dõi gói, trạng thái thuê bao và hạn mức sử dụng của workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-[#00FFD1] transition hover:bg-white/5"
        >
          <RefreshCw className="mr-2 inline" size={15} />
          Làm mới
        </button>
      </div>

      <section
        id="portal-billing-plan"
        className="grid gap-4 lg:grid-cols-[1.3fr_.7fr]"
      >
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-[#94b8d0]">
                Workspace
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                {workspace.name || user?.currentWorkspace.name || "Workspace"}
              </h2>
              <p className="mt-1 text-sm text-[#94b8d0]">
                {workspace.workspaceType || workspace.type || "clinic"}
              </p>
            </div>
            <div className="rounded-2xl border border-[#00FFD1]/25 bg-[#00FFD1]/10 px-4 py-3 text-right">
              <p className="text-xs text-[#94b8d0]">Trạng thái</p>
              <p className="mt-1 font-semibold text-[#00FFD1]">
                {labelOf(status, statusLabels)}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-4">
              <p className="text-xs text-[#94b8d0]">Tên gói</p>
              <p className="mt-2 font-semibold text-white">
                {servicePackage?.name || workspace.packageId || "Chưa gán gói"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <p className="text-xs text-[#94b8d0]">Chi phí hiện tại</p>
              <p className="mt-2 font-semibold text-white">
                {billing.currentCharge
                  ? formatMoney(
                      billing.currentCharge.amount,
                      billing.currentCharge.currency,
                    )
                  : "Chưa cập nhật"}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <p className="text-xs text-[#94b8d0]">Chu kỳ</p>
              <p className="mt-2 font-semibold text-white">
                {labelOf(cycle, cycleLabels)}
              </p>
            </div>
          </div>

          {features.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {features.map(([key]) => (
                <span
                  key={key}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[#D6ECFF]"
                >
                  <CheckCircle2 className="mr-1 inline text-[#00FFD1]" size={13} />
                  {featureLabels[key] || key}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center gap-2 text-white">
            <WalletCards size={18} className="text-[#00FFD1]" />
            <h2 className="font-semibold">Thanh toán</h2>
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[#94b8d0]">Mã gói</dt>
              <dd className="text-right font-medium text-white">
                {servicePackage?.id || workspace.packageId || "Chưa có"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#94b8d0]">Nguồn dữ liệu</dt>
              <dd className="text-right font-medium text-white">
                {subscription.source === "subscription"
                  ? "Bản ghi thuê bao"
                  : "Workspace"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[#94b8d0]">Cập nhật</dt>
              <dd className="text-right font-medium text-white">
                {billing.generatedAt
                  ? new Date(billing.generatedAt).toLocaleString("vi-VN")
                  : "Chưa cập nhật"}
              </dd>
            </div>
          </dl>
          <Link
            to="/portal/help"
            className="premium-button mt-6 flex items-center justify-center gap-2"
          >
            <ReceiptText size={15} />
            Yêu cầu hỗ trợ billing
          </Link>
        </div>
      </section>

      <section id="portal-billing-usage" className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Hạn mức sử dụng</h2>
            <p className="text-sm text-[#94b8d0]">
              Dữ liệu tính theo workspace hiện tại.
            </p>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-[#94b8d0]">
            {servicePackage?.duration || cycle || "monthly"}
          </span>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {billing.usageRows.map((row) => (
            <div
              key={row.key}
              data-billing-usage-row={row.key}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-white">{row.label}</span>
                <span className={usageTone(row)}>{usageValue(row)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#00FFD1]"
                  style={{ width: `${row.percent ?? 0}%` }}
                />
              </div>
              {row.status === "warning" || row.status === "exceeded" ? (
                <p className="mt-2 text-xs text-[#F59E0B]">
                  <AlertTriangle className="mr-1 inline" size={13} />
                  Cần kiểm tra hạn mức trước khi tiếp tục mở rộng sử dụng.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section
        id="portal-billing-contact"
        className="grid gap-4 md:grid-cols-[.8fr_1.2fr]"
      >
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="font-semibold text-white">Liên hệ billing</h2>
          <div className="mt-4 space-y-3 text-sm text-[#D6ECFF]">
            <p>{billing.billingContact.name || workspace.name || "Workspace"}</p>
            <p className="flex items-center gap-2">
              <Mail size={15} className="text-[#00FFD1]" />
              {billing.billingContact.email || "Chưa cập nhật email"}
            </p>
            <p className="flex items-center gap-2">
              <Phone size={15} className="text-[#00FFD1]" />
              {billing.billingContact.phone || "Chưa cập nhật số điện thoại"}
            </p>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="font-semibold text-white">Ghi nhận hóa đơn</h2>
          <p className="mt-3 text-sm leading-6 text-[#94b8d0]">
            {billing.invoicePolicy?.message ||
              "Thông tin gói dịch vụ được đồng bộ ở cấp workspace."}
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[#94b8d0]">
            Provider: {billing.invoicePolicy?.mode || "manual"}
          </p>
        </div>
      </section>
    </div>
  );
}
