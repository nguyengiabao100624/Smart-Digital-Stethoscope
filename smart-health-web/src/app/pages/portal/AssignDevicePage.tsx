import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Link2,
  Loader2,
  Plus,
  WifiOff,
} from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";

interface AssignmentIntent {
  deviceId: string;
  patientId: string;
  workspaceId: string;
  idempotencyKey: string;
}

interface AssignmentIssue {
  title: string;
  message: string;
  retryable: boolean;
  offline?: boolean;
}

function createAssignmentKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `portal-device-assignment-${globalThis.crypto.randomUUID()}`;
  }
  return `portal-device-assignment-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function PageHeading() {
  return (
    <>
      <Button asChild variant="ghost" className="-ml-3 h-11 px-3">
        <Link to="/portal/devices">
          <ArrowLeft aria-hidden="true" />
          Quay lại danh sách thiết bị
        </Link>
      </Button>
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Link2 className="size-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Gán thiết bị
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Liên kết một thiết bị đã được claim với bệnh nhân trong cùng
            workspace.
          </p>
        </div>
      </header>
    </>
  );
}

function EmptyAssignmentState({
  kind,
}: {
  kind: "devices" | "patients";
}) {
  const isDevice = kind === "devices";
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">
          {isDevice ? "Không có thiết bị chưa gán" : "Chưa có bệnh nhân"}
        </h2>
        <CardDescription>
          {isDevice
            ? "Mọi thiết bị hiện có đã được gán hoặc chưa hoàn tất quy trình claim."
            : "Workspace cần ít nhất một hồ sơ bệnh nhân trước khi gán thiết bị."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="h-11">
          <Link
            to={isDevice ? "/portal/devices/claim" : "/portal/patients/new"}
          >
            <Plus aria-hidden="true" />
            {isDevice ? "Ghép thiết bị mới" : "Thêm bệnh nhân"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AssignDevicePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const client = useQueryClient();
  const workspaceId =
    user?.currentWorkspace?.id || user?.currentWorkspaceId || "";
  const workspaceRef = useRef(workspaceId);
  workspaceRef.current = workspaceId;
  const inFlightRef = useRef(false);
  const intentRef = useRef<AssignmentIntent | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [issue, setIssue] = useState<AssignmentIssue | null>(null);

  const devices = useQuery({
    queryKey: ["portal", "workspace", workspaceId, "devices"],
    queryFn: () => smartHealthApi.listDevices(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const patients = useQuery({
    queryKey: ["portal", "patients", workspaceId],
    queryFn: () => smartHealthApi.listPatients(),
    enabled: Boolean(workspaceId),
  });

  const availableDevices = (devices.data?.devices ?? []).filter(
    (device) =>
      !device.assignedPatientId &&
      device.status !== "revoked" &&
      device.organizationId === workspaceId,
  );
  const availablePatients = (patients.data?.patients ?? []).filter(
    (patient) => patient.organizationId === workspaceId,
  );

  const assign = useMutation({
    mutationFn: (intent: AssignmentIntent) =>
      smartHealthApi.updateDevice(
        intent.deviceId,
        { assignedPatientId: intent.patientId },
        intent.idempotencyKey,
      ),
    onSuccess: (response, intent) => {
      inFlightRef.current = false;
      const confirmed = response.device;
      if (
        intent.workspaceId !== workspaceRef.current ||
        confirmed.id !== intent.deviceId ||
        confirmed.organizationId !== intent.workspaceId ||
        confirmed.assignedPatientId !== intent.patientId
      ) {
        setIssue({
          title: "Chưa xác nhận được kết quả gán",
          message:
            "Backend trả về kết quả gán không đúng workspace, thiết bị hoặc bệnh nhân đã chọn. Dữ liệu trên màn hình chưa được thay đổi.",
          retryable: true,
        });
        return;
      }
      intentRef.current = null;
      setIssue(null);
      toast.success("Đã gán thiết bị cho bệnh nhân");
      client.invalidateQueries({
        queryKey: [
          "portal",
          "workspace",
          intent.workspaceId,
          "devices",
        ],
      });
      navigate("/portal/devices");
    },
    onError: (error) => {
      inFlightRef.current = false;
      const offline = !window.navigator.onLine;
      setIssue({
        title: offline ? "Bạn đang ngoại tuyến" : "Chưa xác nhận được yêu cầu",
        message: offline
          ? "Kết nối lại mạng rồi thử lại cùng yêu cầu. Chưa có thay đổi nào được xác nhận."
          : `Chưa xác định backend đã nhận yêu cầu hay chưa. Thử lại cùng yêu cầu để giữ nguyên mã chống gửi trùng.${
              error instanceof Error && error.message
                ? ` Chi tiết: ${error.message}`
                : ""
            }`,
        retryable: true,
        offline,
      });
    },
  });

  const resetIntent = () => {
    intentRef.current = null;
    setIssue(null);
  };

  const assignmentIntent = () => {
    const existing = intentRef.current;
    if (
      existing &&
      existing.deviceId === deviceId &&
      existing.patientId === patientId &&
      existing.workspaceId === workspaceId
    ) {
      return existing;
    }
    const next = {
      deviceId,
      patientId,
      workspaceId,
      idempotencyKey: createAssignmentKey(),
    };
    intentRef.current = next;
    return next;
  };

  const submitAssignment = () => {
    if (inFlightRef.current || assign.isPending) return;
    if (!deviceId || !patientId) {
      setIssue({
        title: "Chưa đủ thông tin",
        message: "Chọn cả thiết bị và bệnh nhân trước khi xác nhận.",
        retryable: false,
      });
      return;
    }
    const intent = assignmentIntent();
    if (!window.navigator.onLine) {
      setIssue({
        title: "Bạn đang ngoại tuyến",
        message:
          "Kết nối lại mạng rồi thử lại cùng yêu cầu. Chưa có thay đổi nào được gửi.",
        retryable: true,
        offline: true,
      });
      return;
    }
    setIssue(null);
    inFlightRef.current = true;
    assign.mutate(intent);
  };

  const canManage =
    user?.capabilities.includes("workspace.devices.manage") ||
    user?.capabilities.includes("platform.devices.manage");
  if (!canManage) {
    return (
      <PortalError
        error={
          new Error(
            "Tài khoản không có quyền gán thiết bị trong workspace này.",
          )
        }
      />
    );
  }
  if (!workspaceId) {
    return (
      <PortalError
        error={new Error("Chọn một workspace đang hoạt động để gán thiết bị.")}
      />
    );
  }
  if (devices.isLoading || patients.isLoading) {
    return <PortalLoading label="Đang tải thiết bị và bệnh nhân..." />;
  }
  if (devices.error || patients.error) {
    return (
      <PortalError
        error={devices.error || patients.error}
        retry={() => {
          void devices.refetch();
          void patients.refetch();
        }}
      />
    );
  }

  return (
    <div
      data-testid="portal-assign-device-page"
      className="mx-auto max-w-3xl space-y-6"
    >
      <PageHeading />

      {availableDevices.length === 0 ? (
        <EmptyAssignmentState kind="devices" />
      ) : availablePatients.length === 0 ? (
        <EmptyAssignmentState kind="patients" />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Chọn liên kết cần tạo</h2>
            <CardDescription>
              Backend sẽ kiểm tra lại quyền, workspace và trạng thái ownership
              trước khi ghi nhận.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              method="post"
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                submitAssignment();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="assign-device-id">Thiết bị</Label>
                <Select
                  value={deviceId}
                  onValueChange={(value) => {
                    setDeviceId(value);
                    resetIntent();
                  }}
                  disabled={assign.isPending}
                  required
                >
                  <SelectTrigger
                    id="assign-device-id"
                    name="assignDeviceId"
                    className="h-11"
                    aria-describedby="assign-device-help"
                  >
                    <SelectValue placeholder="Chọn thiết bị chưa gán" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDevices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name || device.id} —{" "}
                        {device.online ? "Online" : "Offline"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p
                  id="assign-device-help"
                  className="text-xs leading-5 text-muted-foreground"
                >
                  Chỉ hiển thị thiết bị chưa gán trong workspace hiện tại.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assign-patient-id">Bệnh nhân</Label>
                <Select
                  value={patientId}
                  onValueChange={(value) => {
                    setPatientId(value);
                    resetIntent();
                  }}
                  disabled={assign.isPending}
                  required
                >
                  <SelectTrigger
                    id="assign-patient-id"
                    name="assignPatientId"
                    className="h-11"
                  >
                    <SelectValue placeholder="Chọn bệnh nhân" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePatients.map((patient) => (
                      <SelectItem key={patient.id} value={patient.id}>
                        {patient.name || patient.id} —{" "}
                        {patient.patientCode || patient.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {issue && (
                <Alert
                  variant={issue.offline ? "default" : "destructive"}
                  aria-live="polite"
                >
                  {issue.offline ? (
                    <WifiOff aria-hidden="true" />
                  ) : (
                    <AlertCircle aria-hidden="true" />
                  )}
                  <AlertTitle>{issue.title}</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>{issue.message}</p>
                    {issue.retryable && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        disabled={assign.isPending}
                        onClick={submitAssignment}
                      >
                        Thử lại cùng yêu cầu
                      </Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                id="assign-device-submit"
                type="submit"
                disabled={assign.isPending || !deviceId || !patientId}
                className="h-11 w-full"
              >
                {assign.isPending ? (
                  <>
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin motion-reduce:animate-none"
                    />
                    Đang xác nhận...
                  </>
                ) : (
                  <>
                    <Link2 aria-hidden="true" />
                    Xác nhận gán thiết bị
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
