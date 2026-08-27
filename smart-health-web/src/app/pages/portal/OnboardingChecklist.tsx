import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleHelp,
  Loader2,
  RefreshCw,
  Rocket,
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
import { smartHealthApi } from "../../../lib/smart-health-api";
import { PortalError } from "../../components/PortalState";
import { canAccessRoute } from "../../contracts/route-contract";
import { useAuth } from "../../context/AuthContext";

type StepState =
  | "complete"
  | "incomplete"
  | "loading"
  | "unknown"
  | "error";

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  state: StepState;
  to?: string;
  retry?: () => void;
}

const stepPresentation: Record<
  StepState,
  {
    label: string;
    icon: typeof CheckCircle2;
    iconClassName: string;
    badgeClassName: string;
  }
> = {
  complete: {
    label: "Hoàn tất",
    icon: CheckCircle2,
    iconClassName: "text-[var(--status-success-fg)]",
    badgeClassName:
      "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  },
  incomplete: {
    label: "Chưa hoàn tất",
    icon: Circle,
    iconClassName: "text-muted-foreground",
    badgeClassName: "border-border bg-muted text-muted-foreground",
  },
  loading: {
    label: "Đang xác minh",
    icon: Loader2,
    iconClassName: "animate-spin text-primary motion-reduce:animate-none",
    badgeClassName:
      "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]",
  },
  unknown: {
    label: "Chưa xác minh",
    icon: CircleHelp,
    iconClassName: "text-[var(--status-warning-fg)]",
    badgeClassName:
      "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
  },
  error: {
    label: "Chưa xác minh",
    icon: CircleAlert,
    iconClassName: "text-destructive",
    badgeClassName:
      "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]",
  },
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function OnboardingStepCard({ step }: { step: OnboardingStep }) {
  const presentation = stepPresentation[step.state];
  const StateIcon = presentation.icon;

  return (
    <Card
      data-testid={`onboarding-step-${step.id}`}
      className="h-full overflow-hidden"
    >
      <CardHeader className="flex-row items-start gap-4 space-y-0">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
          <StateIcon
            aria-hidden="true"
            className={`size-5 ${presentation.iconClassName}`}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base text-foreground">
              {step.label}
            </CardTitle>
            <Badge variant="outline" className={presentation.badgeClassName}>
              {presentation.label}
            </Badge>
          </div>
          <CardDescription className="mt-2 leading-relaxed">
            {step.description}
          </CardDescription>
        </div>
      </CardHeader>
      {step.to || step.retry ? (
        <CardContent className="flex flex-wrap justify-end gap-2 pt-0">
          {step.retry ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={step.retry}
              aria-label={`Thử xác minh lại ${step.label}`}
            >
              <RefreshCw aria-hidden="true" />
              Thử lại
            </Button>
          ) : null}
          {step.to ? (
            <Button asChild variant="ghost" className="h-11">
              <Link
                to={step.to}
                aria-label={`Mở bước ${step.label}`}
              >
                Mở
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const capabilities = user?.capabilities || [];
  const workspaceId = user?.currentWorkspace.id || "";
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const canManageAccount = canAccessRoute(capabilities, "/portal/settings");
  const canSwitchWorkspace = canAccessRoute(capabilities, "/portal/workspace");
  const canViewPatients = canAccessRoute(capabilities, "/portal/patients");
  const canViewDevices = canAccessRoute(capabilities, "/portal/devices");
  const canViewLive = canAccessRoute(capabilities, "/portal/live");
  const canViewBilling = canAccessRoute(capabilities, "/portal/billing");

  const patients = useQuery({
    queryKey: ["portal", "patients", "onboarding", workspaceId],
    queryFn: async () => {
      const result = await smartHealthApi.listPatients();
      if (
        !Array.isArray(result.patients) ||
        result.patients.some(
          (patient) => patient.organizationId !== workspaceId,
        )
      ) {
        throw new Error(
          "Backend trả về bệnh nhân không thuộc workspace hiện tại. Tiến độ đã bị chặn.",
        );
      }
      return result;
    },
    enabled: Boolean(workspaceId && canViewPatients && online),
    retry: false,
  });

  const devices = useQuery({
    queryKey: ["portal", "devices", "onboarding", workspaceId],
    queryFn: async () => {
      const result = await smartHealthApi.listDevices(workspaceId);
      if (
        !Array.isArray(result.devices) ||
        result.devices.some(
          (device) => device.organizationId !== workspaceId,
        )
      ) {
        throw new Error(
          "Backend trả về thiết bị không thuộc workspace hiện tại. Tiến độ đã bị chặn.",
        );
      }
      return result;
    },
    enabled: Boolean(workspaceId && canViewDevices && online),
    retry: false,
  });

  const billing = useQuery({
    queryKey: ["portal", "billing", "onboarding", workspaceId],
    queryFn: () => smartHealthApi.portalBilling(workspaceId),
    enabled: Boolean(workspaceId && canViewBilling && online),
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

  if (!user || !workspaceId) {
    return (
      <PortalError
        error={new Error(
          "Tài khoản chưa có workspace hoạt động để xác minh tiến độ bắt đầu.",
        )}
      />
    );
  }

  const rawWorkspaceId =
    user.raw.currentWorkspace?.id ||
    user.raw.workspace?.id ||
    user.raw.currentWorkspaceId ||
    user.raw.organizationId ||
    "";
  const membership =
    user.raw.currentMembership ||
    user.raw.workspaceMembership ||
    user.raw.memberships?.find(
      (candidate) =>
        (candidate.workspaceId || candidate.organizationId) === workspaceId,
    );
  const membershipWorkspaceId =
    membership?.workspaceId || membership?.organizationId || "";
  if (
    (rawWorkspaceId && rawWorkspaceId !== workspaceId) ||
    (membershipWorkspaceId && membershipWorkspaceId !== workspaceId)
  ) {
    return (
      <PortalError
        error={new Error(
          "Backend trả về workspace hoặc membership không khớp phiên hiện tại. Tiến độ đã bị chặn.",
        )}
      />
    );
  }

  const queryState = (
    query: {
      data: unknown;
      error: unknown;
      isLoading: boolean;
    },
    complete: boolean,
  ): StepState => {
    if (!online && !query.data) return "unknown";
    if (query.isLoading || (!query.data && !query.error)) return "loading";
    if (query.error) return "error";
    return complete ? "complete" : "incomplete";
  };

  const patientState = queryState(
    patients,
    Boolean(patients.data?.patients.length),
  );
  const deviceState = queryState(
    devices,
    Boolean(devices.data?.devices.length),
  );
  const onlineDeviceState = queryState(
    devices,
    Boolean(devices.data?.devices.some((device) => device.online === true)),
  );
  const billingState = queryState(
    billing,
    Boolean(
      billing.data?.package &&
        billing.data.workspace.packageId === billing.data.package.id &&
        billing.data.subscription.organizationId === workspaceId,
    ),
  );
  const profileComplete = Boolean(
    user.raw.id === user.id &&
      user.raw.name?.trim() &&
      user.raw.email?.trim(),
  );
  const membershipState: StepState = !membership
    ? "unknown"
    : membership.status === "active"
      ? "complete"
      : membership.status
        ? "incomplete"
        : "unknown";

  const steps: OnboardingStep[] = [
    {
      id: "profile",
      label: "Hồ sơ tài khoản",
      description: profileComplete
        ? "Tên và email đã được backend xác nhận cho tài khoản hiện tại."
        : "Bổ sung tên và email để hoàn thiện hồ sơ tài khoản.",
      state: profileComplete ? "complete" : "incomplete",
      to: canManageAccount ? "/portal/settings" : undefined,
    },
    {
      id: "workspace",
      label: "Membership workspace",
      description:
        membershipState === "complete"
          ? `Membership đang hoạt động tại ${user.currentWorkspace.name || workspaceId}.`
          : membershipState === "incomplete"
            ? "Membership hiện không ở trạng thái hoạt động."
            : "Backend chưa xác nhận membership hoạt động cho workspace này.",
      state: membershipState,
      to: canSwitchWorkspace ? "/portal/workspace" : undefined,
    },
  ];

  if (canViewPatients) {
    steps.push({
      id: "patients",
      label: "Bệnh nhân đầu tiên",
      description:
        patientState === "error"
          ? errorMessage(
              patients.error,
              "Không thể xác minh danh sách bệnh nhân.",
            )
          : patientState === "unknown"
            ? "Không thể xác minh danh sách bệnh nhân khi đang ngoại tuyến."
            : patientState === "complete"
              ? "Workspace đã có ít nhất một hồ sơ bệnh nhân."
              : patientState === "loading"
                ? "Đang đọc danh sách bệnh nhân từ backend."
                : "Workspace chưa có hồ sơ bệnh nhân.",
      state: patientState,
      to: "/portal/patients",
      retry:
        patientState === "error" && online
          ? () => void patients.refetch()
          : undefined,
    });
  }

  if (canViewDevices) {
    steps.push(
      {
        id: "devices",
        label: "Thiết bị đầu tiên",
        description:
          deviceState === "error"
            ? errorMessage(
                devices.error,
                "Không thể xác minh danh sách thiết bị.",
              )
            : deviceState === "unknown"
              ? "Không thể xác minh danh sách thiết bị khi đang ngoại tuyến."
              : deviceState === "complete"
                ? "Workspace đã có ít nhất một thiết bị."
                : deviceState === "loading"
                  ? "Đang đọc danh sách thiết bị từ backend."
                  : "Workspace chưa có thiết bị.",
        state: deviceState,
        to: "/portal/devices",
        retry:
          deviceState === "error" && online
            ? () => void devices.refetch()
            : undefined,
      },
      {
        id: "devices-online",
        label: "Thiết bị đang online",
        description:
          onlineDeviceState === "error"
            ? "Chưa thể xác minh trạng thái online vì danh sách thiết bị không hợp lệ."
            : onlineDeviceState === "unknown"
              ? "Trạng thái online chưa thể được xác minh khi ngoại tuyến."
              : onlineDeviceState === "complete"
                ? "Backend đã xác nhận ít nhất một thiết bị online."
                : onlineDeviceState === "loading"
                  ? "Đang xác minh trạng thái thiết bị."
                  : "Chưa có thiết bị nào được backend xác nhận online.",
        state: onlineDeviceState,
        to: canViewLive ? "/portal/live" : "/portal/devices",
      },
    );
  }

  if (canViewBilling) {
    steps.push({
      id: "billing",
      label: "Gói dịch vụ",
      description:
        billingState === "error"
          ? errorMessage(
              billing.error,
              "Không thể xác minh gói dịch vụ.",
            )
          : billingState === "unknown"
            ? "Không thể xác minh gói dịch vụ khi đang ngoại tuyến."
            : billingState === "complete"
              ? `Backend đã xác nhận ${billing.data?.package?.name || "gói dịch vụ"} cho workspace.`
              : billingState === "loading"
                ? "Đang đọc gói dịch vụ từ backend."
                : "Workspace chưa được gán gói dịch vụ.",
      state: billingState,
      to: "/portal/billing",
      retry:
        billingState === "error" && online
          ? () => void billing.refetch()
          : undefined,
    });
  }

  const completed = steps.filter((step) => step.state === "complete").length;
  const progress = steps.length ? (completed / steps.length) * 100 : 0;
  const hasUnknown = steps.some(
    (step) => step.state === "error" || step.state === "unknown",
  );
  const refreshing =
    patients.isFetching || devices.isFetching || billing.isFetching;
  const refresh = () => {
    if (!online || refreshing) return;
    if (canViewPatients) void patients.refetch();
    if (canViewDevices) void devices.refetch();
    if (canViewBilling) void billing.refetch();
  };

  return (
    <div
      id="portal-onboarding-page"
      data-testid="portal-onboarding-page"
      className="mx-auto max-w-5xl space-y-5"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Rocket aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Bắt đầu với Shcare
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Chỉ những bước phù hợp với quyền hiện tại mới được hiển thị.
              Trạng thái lỗi hoặc ngoại tuyến không bị tính thành chưa hoàn tất.
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="h-11 w-full sm:w-auto"
          onClick={refresh}
          disabled={!online || refreshing}
          aria-label="Làm mới tiến độ"
          aria-busy={refreshing}
        >
          <RefreshCw
            aria-hidden="true"
            className={
              refreshing ? "animate-spin motion-reduce:animate-none" : ""
            }
          />
          {refreshing ? "Đang làm mới" : "Làm mới"}
        </Button>
      </header>

      {!online ? (
        <Alert className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Bạn đang ngoại tuyến</AlertTitle>
          <AlertDescription>
            Các bước cần dữ liệu mới sẽ giữ trạng thái chưa xác minh. Kết nối
            mạng để làm mới tiến độ.
          </AlertDescription>
        </Alert>
      ) : null}

      {hasUnknown ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Một số bước chưa được xác minh</AlertTitle>
          <AlertDescription>
            Shcare không chuyển lỗi tải hoặc dữ liệu sai workspace thành trạng
            thái chưa hoàn tất. Hãy thử lại từng bước khi kết nối ổn định.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Tiến độ workspace</CardTitle>
              <CardDescription className="mt-1">
                {completed}/{steps.length} bước hoàn tất
              </CardDescription>
            </div>
            <Badge variant="outline">
              {completed === steps.length ? "Đã sẵn sàng" : "Đang thiết lập"}
            </Badge>
          </div>
          <div
            role="progressbar"
            aria-label="Tiến độ bắt đầu nhanh"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={completed}
            aria-valuetext={`${completed} trên ${steps.length} bước hoàn tất`}
            className="h-2.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full origin-left rounded-full bg-primary transition-transform duration-200 motion-reduce:transition-none"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
        </CardHeader>
      </Card>

      <section
        aria-label="Các bước bắt đầu nhanh"
        className="grid gap-4 md:grid-cols-2"
      >
        {steps.map((step) => (
          <OnboardingStepCard key={step.id} step={step} />
        ))}
      </section>

      {completed === steps.length && !hasUnknown ? (
        <Alert className="border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Các bước hiện có đã hoàn tất</AlertTitle>
          <AlertDescription>
            Tiến độ này chỉ phản ánh dữ liệu và quyền backend đã xác nhận cho
            workspace hiện tại.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
