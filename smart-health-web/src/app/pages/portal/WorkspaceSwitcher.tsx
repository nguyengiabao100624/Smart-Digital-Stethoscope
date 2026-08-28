import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Cpu,
  LayoutGrid,
  Loader2,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Users,
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
import { PortalEmpty, PortalLoading } from "../../components/PortalState";
import { useAuth, type Workspace } from "../../context/AuthContext";

function workspaceTypeLabel(type: string) {
  if (type === "solo_practice" || type === "doctor_private") return "Bác sĩ tư";
  if (type === "clinic") return "Phòng khám";
  if (type === "hospital") return "Bệnh viện";
  if (type === "personal") return "Cá nhân/gia đình";
  return "Cơ sở y tế";
}

function roleLabel(role: string) {
  if (role === "doctor") return "Bác sĩ";
  if (role === "workspace_owner") return "Chủ workspace";
  if (role === "workspace_admin" || role === "clinic_manager") {
    return "Quản lý workspace";
  }
  if (role === "nurse") return "Điều dưỡng";
  if (role === "technician") return "Kỹ thuật viên";
  if (role === "billing") return "Tài chính";
  if (role === "viewer") return "Chỉ xem";
  return role;
}

function unavailableReason(workspace: Workspace) {
  if (workspace.type === "personal" && workspace.role !== "patient") {
    return "Workspace cá nhân chỉ dành cho tài khoản bệnh nhân; bác sĩ dùng workspace phòng khám/bệnh viện"
  }
  if (workspace.membershipStatus === "suspended") {
    return "Membership đang tạm khóa";
  }
  if (workspace.membershipStatus === "revoked") {
    return "Membership đã bị thu hồi";
  }
  if (workspace.membershipStatus !== "active") {
    return "Membership chưa hoạt động";
  }
  if (workspace.workspaceStatus !== "active") {
    return "Workspace chưa hoạt động";
  }
  return "Workspace chưa sẵn sàng";
}

export default function WorkspaceSwitcher() {
  const { user, isLoading, switchWorkspace } = useAuth();
  const navigate = useNavigate();
  const [switchingId, setSwitchingId] = useState("");
  const [failedId, setFailedId] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  if (isLoading) {
    return <PortalLoading label="Đang xác minh danh sách workspace…" />;
  }

  if (!user) {
    return (
      <Alert variant="destructive" data-testid="workspace-session-unavailable">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>Không thể xác minh quyền workspace</AlertTitle>
        <AlertDescription>
          Phiên Portal không còn đủ thông tin quyền. Hãy đăng nhập lại trước khi
          xem dữ liệu workspace.
        </AlertDescription>
      </Alert>
    );
  }

  const handleSwitch = async (workspaceId: string) => {
    const target = user.workspaces.find(
      (workspace) => workspace.id === workspaceId,
    );
    if (
      !target?.operational ||
      workspaceId === user.currentWorkspace.id ||
      switchingId ||
      !online
    ) {
      return;
    }
    setSwitchError("");
    setFailedId("");
    setSwitchingId(workspaceId);
    try {
      await switchWorkspace(workspaceId);
      navigate("/portal/dashboard", { replace: true });
    } catch (error) {
      setFailedId(workspaceId);
      setSwitchError(
        error instanceof Error
          ? error.message
          : "Không thể chuyển workspace lúc này.",
      );
    } finally {
      setSwitchingId("");
    }
  };

  return (
    <div
      data-testid="portal-workspace-switcher-page"
      className="mx-auto max-w-5xl space-y-6"
    >
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutGrid aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Chọn workspace
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Mỗi workspace có quyền và dữ liệu riêng. Shcare chỉ đổi ngữ cảnh
              sau khi backend xác nhận membership đang hoạt động.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit bg-card px-3 py-1.5">
          {user.workspaces.length} workspace
        </Badge>
      </header>

      {!online ? (
        <Alert className="border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]">
          <WifiOff aria-hidden="true" />
          <AlertTitle>Bạn đang ngoại tuyến</AlertTitle>
          <AlertDescription>
            Danh sách hiện tại vẫn được hiển thị, nhưng không thể chuyển
            workspace cho đến khi kết nối mạng trở lại.
          </AlertDescription>
        </Alert>
      ) : null}

      {switchError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Chưa chuyển được workspace</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{switchError}</p>
            {failedId ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 border-destructive/40 bg-background"
                disabled={!online || Boolean(switchingId)}
                onClick={() => void handleSwitch(failedId)}
              >
                <RefreshCw aria-hidden="true" />
                Thử lại workspace đã chọn
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {switchingId ? "Đang chờ backend xác nhận workspace mới." : ""}
      </p>

      <section aria-labelledby="workspace-list-heading">
        <Card className="overflow-hidden shadow-sm">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle id="workspace-list-heading" className="text-lg">
              Workspace được cấp quyền
            </CardTitle>
            <CardDescription>
              Workspace bị tạm khóa hoặc thu hồi vẫn hiện để bạn biết trạng
              thái, nhưng không thể mở dữ liệu.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {user.workspaces.length === 0 ? (
              <PortalEmpty label="Tài khoản chưa có workspace được backend xác nhận." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {user.workspaces.map((workspace) => {
                  const active = workspace.id === user.currentWorkspace.id;
                  const switching = switchingId === workspace.id;
                  const incompatiblePersona =
                    workspace.type === "personal" && workspace.role !== "patient";
                  const unavailable = !workspace.operational || incompatiblePersona;
                  return (
                    <Button
                      type="button"
                      variant="outline"
                      key={workspace.id}
                      data-workspace-card={workspace.id}
                      data-workspace-active={active ? "true" : "false"}
                      data-workspace-operational={
                        workspace.operational ? "true" : "false"
                      }
                      aria-current={active ? "page" : undefined}
                      disabled={
                        unavailable ||
                        Boolean(switchingId) ||
                        (!active && !online)
                      }
                      className={[
                        "h-auto min-h-44 w-full items-stretch justify-start whitespace-normal rounded-xl p-0 text-left shadow-none",
                        "transition-colors duration-200 motion-reduce:transition-none",
                        active
                          ? "border-primary/40 bg-primary/[0.045]"
                          : "bg-card hover:border-primary/35 hover:bg-accent/35",
                        unavailable
                          ? "cursor-not-allowed opacity-70"
                          : "",
                      ].join(" ")}
                      onClick={() => void handleSwitch(workspace.id)}
                    >
                      <span className="flex w-full flex-col p-4 sm:p-5">
                        <span className="flex items-start justify-between gap-3">
                          <span className="flex min-w-0 items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <Building2
                                aria-hidden="true"
                                className="size-5"
                              />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-base font-semibold text-foreground">
                                {workspace.name}
                              </span>
                              <span className="mt-1 block text-sm font-normal text-muted-foreground">
                                {workspaceTypeLabel(workspace.type)}
                                {" · "}
                                {roleLabel(workspace.role)}
                              </span>
                            </span>
                          </span>
                          {active ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                            >
                              <CheckCircle2 aria-hidden="true" />
                              Đang dùng
                            </Badge>
                          ) : switching ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 border-primary/30 bg-primary/10 text-primary"
                            >
                              <Loader2
                                aria-hidden="true"
                                className="animate-spin motion-reduce:animate-none"
                              />
                              Đang chuyển…
                            </Badge>
                          ) : null}
                        </span>

                        {unavailable ? (
                          <span className="mt-5 flex items-center gap-2 text-sm font-medium text-[var(--status-warning-fg)]">
                            <ShieldAlert
                              aria-hidden="true"
                              className="size-4"
                            />
                            {unavailableReason(workspace)}
                          </span>
                        ) : workspace.metricsAvailable ? (
                          <span className="mt-5 grid gap-2 text-sm font-normal text-muted-foreground sm:grid-cols-2">
                            <span
                              className="flex items-center gap-2"
                              data-workspace-patient-count={
                                workspace.patientCount ?? undefined
                              }
                            >
                              <Users aria-hidden="true" className="size-4" />
                              {workspace.patientCount} bệnh nhân
                            </span>
                            <span
                              className="flex items-center gap-2"
                              data-workspace-device-online={
                                workspace.deviceOnline ?? undefined
                              }
                            >
                              <Cpu aria-hidden="true" className="size-4" />
                              {workspace.deviceOnline} thiết bị online
                            </span>
                            <span
                              className="flex items-center gap-2"
                              data-workspace-alert-count={
                                workspace.alertCount ?? undefined
                              }
                            >
                              <AlertTriangle
                                aria-hidden="true"
                                className="size-4"
                              />
                              {workspace.alertCount} cảnh báo
                            </span>
                            {workspace.scanCount !== null ? (
                              <span
                                className="flex items-center gap-2"
                                data-workspace-scan-count={workspace.scanCount}
                              >
                                <ScanLine
                                  aria-hidden="true"
                                  className="size-4"
                                />
                                {workspace.scanCount} lượt đo
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span
                            className="mt-5 flex items-center gap-2 text-sm font-normal text-muted-foreground"
                            data-workspace-metrics="unavailable"
                          >
                            <AlertCircle
                              aria-hidden="true"
                              className="size-4"
                            />
                            Số liệu vận hành chưa sẵn sàng
                          </span>
                        )}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
