import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Link } from "react-router";

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
  smartHealthApi,
  type ApiError,
  type DevicePairingResponse,
} from "../../../lib/smart-health-api";
import { useAuth } from "../../context/AuthContext";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,62}$/;
const CLAIM_CODE_PATTERN = /^[A-Za-z0-9_-]{6,80}$/;

type ClaimFields = {
  deviceId?: string;
  claimCode?: string;
};

type ClaimFailure = {
  kind: "offline" | "expired" | "permission" | "api";
  title: string;
  message: string;
  guidance: string;
  retryable: boolean;
};

type ClaimIntent = {
  deviceId: string;
  claimCode: string;
  idempotencyKey: string;
};

function createIntentKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `portal-device-claim-${crypto.randomUUID()}`;
  }
  return `portal-device-claim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validateClaim(deviceId: string, claimCode: string): ClaimFields {
  const errors: ClaimFields = {};

  if (!deviceId) {
    errors.deviceId = "Vui lòng nhập Device ID.";
  } else if (!DEVICE_ID_PATTERN.test(deviceId)) {
    errors.deviceId =
      "Device ID chỉ được chứa chữ, số, dấu gạch ngang hoặc gạch dưới; dài 3–63 ký tự.";
  }

  if (!claimCode) {
    errors.claimCode = "Vui lòng nhập claim code.";
  } else if (!CLAIM_CODE_PATTERN.test(claimCode)) {
    errors.claimCode =
      "Claim code phải có từ 6 đến 80 ký tự gồm chữ, số, dấu gạch ngang hoặc gạch dưới.";
  }

  return errors;
}

function classifyClaimFailure(error: unknown): ClaimFailure {
  const apiError = error as ApiError;
  if (apiError?.status === 403) {
    return {
      kind: "permission",
      title: "Không có quyền ghép thiết bị",
      message: "Backend đã từ chối thao tác cho workspace hiện tại.",
      guidance: "Liên hệ quản trị viên workspace để được cấp quyền.",
      retryable: false,
    };
  }

  if (apiError?.code === "DEVICE_CLAIM_EXPIRED") {
    return {
      kind: "expired",
      title: "Claim code đã hết hạn",
      message: "Mã một lần này không còn hiệu lực nên thiết bị chưa được ghép.",
      guidance: "Nhập claim code mới được cấp cho đúng thiết bị rồi gửi lại.",
      retryable: false,
    };
  }

  if (
    typeof navigator !== "undefined" &&
    (!navigator.onLine || !apiError?.status)
  ) {
    return {
      kind: "offline",
      title: navigator.onLine ? "Mất kết nối với backend" : "Thiết bị đang ngoại tuyến",
      message: "Chưa xác định backend đã nhận yêu cầu hay chưa.",
      guidance:
        "Giữ nguyên Device ID và claim code, kiểm tra kết nối rồi dùng nút bên dưới để tránh ghép trùng.",
      retryable: true,
    };
  }

  return {
    kind: "api",
    title: "Không thể ghép thiết bị",
    message: apiError?.message || "Backend không thể xử lý yêu cầu ghép thiết bị.",
    guidance: "Kiểm tra thông tin và thử lại. Nếu lỗi tiếp diễn, liên hệ quản trị viên.",
    retryable: true,
  };
}

export default function ClaimDevicePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ClaimFields>({});
  const [failure, setFailure] = useState<ClaimFailure | null>(null);
  const [result, setResult] = useState<DevicePairingResponse | null>(null);
  const [presenceMessage, setPresenceMessage] = useState("");
  const [checkingPresence, setCheckingPresence] = useState(false);
  const intentKeyRef = useRef("");
  const inFlightKeyRef = useRef("");

  const capabilities = user?.capabilities || [];
  const canClaim = capabilities.some((capability) =>
    [
      "workspace.devices.view",
      "workspace.devices.manage",
      "platform.devices.manage",
      "personal.devices.manage",
    ].includes(capability),
  );
  const workspaceId = user?.currentWorkspace.id || "unknown";

  const claim = useMutation<DevicePairingResponse, unknown, ClaimIntent>({
    mutationFn: ({ deviceId: exactDeviceId, claimCode: exactClaimCode, idempotencyKey }) =>
      smartHealthApi.activateDeviceByClaim(
        {
          deviceId: exactDeviceId,
          claimCode: exactClaimCode,
          connectionMethod: "QR",
        },
        idempotencyKey,
      ),
    onSuccess: async (response, intent) => {
      if (intentKeyRef.current !== intent.idempotencyKey) return;
      setResult(response);
      setFailure(null);
      setPresenceMessage("");
      inFlightKeyRef.current = "";
      intentKeyRef.current = "";
      await queryClient.invalidateQueries({
        queryKey: ["portal", "devices", workspaceId],
      });
    },
    onError: (error, intent) => {
      if (intentKeyRef.current !== intent.idempotencyKey) return;
      setFailure(classifyClaimFailure(error));
    },
    onSettled: (_data, _error, intent) => {
      if (inFlightKeyRef.current === intent.idempotencyKey) {
        inFlightKeyRef.current = "";
      }
    },
  });

  const resetIntent = () => {
    intentKeyRef.current = "";
    inFlightKeyRef.current = "";
    setFailure(null);
    setResult(null);
    setPresenceMessage("");
  };

  const submitClaim = () => {
    const errors = validateClaim(deviceId, claimCode);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (inFlightKeyRef.current) return;

    const idempotencyKey = intentKeyRef.current || createIntentKey();
    intentKeyRef.current = idempotencyKey;
    inFlightKeyRef.current = idempotencyKey;
    setFailure(null);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      inFlightKeyRef.current = "";
      setFailure(classifyClaimFailure(new Error("Browser is offline")));
      return;
    }

    claim.mutate({ deviceId, claimCode, idempotencyKey });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitClaim();
  };

  const checkPresence = async () => {
    if (!result || checkingPresence) return;
    setCheckingPresence(true);
    setPresenceMessage("");
    try {
      const response = await smartHealthApi.listDevices();
      const currentDevice = response.devices.find((device) => device.id === result.device.id);
      if (currentDevice?.online) {
        setResult({
          ...result,
          device: currentDevice,
          pairing: {
            ...result.pairing,
            outcome: "success",
            presence: "online",
            onlineConfirmed: true,
          },
        });
        setPresenceMessage("Thiết bị đã đăng nhập WSS và backend xác nhận Online.");
        await queryClient.invalidateQueries({
          queryKey: ["portal", "devices", workspaceId],
        });
      } else {
        setPresenceMessage(
          "Thiết bị vẫn chưa Online. Hãy kiểm tra nguồn, Wi-Fi rồi kiểm tra lại.",
        );
      }
    } catch {
      setPresenceMessage(
        "Không thể kiểm tra trạng thái lúc này. Kết quả ghép đã chấp nhận vẫn được giữ; vui lòng thử lại.",
      );
    } finally {
      setCheckingPresence(false);
    }
  };

  if (!canClaim) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card role="alert" className="border-destructive/40">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldCheck aria-hidden="true" />
            </div>
            <CardTitle>Không có quyền ghép thiết bị</CardTitle>
            <CardDescription>
              Tài khoản hiện tại không có capability ghép thiết bị trong workspace này.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">Liên hệ quản trị viên workspace để được cấp quyền.</p>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/portal/devices">
                <ArrowLeft aria-hidden="true" />
                Quay lại thiết bị
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6" aria-labelledby="claim-device-title">
      <Button asChild variant="ghost" className="min-h-11 px-2">
        <Link to="/portal/devices">
          <ArrowLeft aria-hidden="true" />
          Quay lại thiết bị
        </Link>
      </Button>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <QrCode aria-hidden="true" />
          </div>
          <div>
            <h1 id="claim-device-title" className="text-2xl font-semibold tracking-tight">
              Ghép thiết bị Shcare
            </h1>
            <p className="text-sm text-muted-foreground">
              Nhập chính xác Device ID và claim code trên QR hoặc tem thiết bị.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin xác thực</CardTitle>
          <CardDescription>
            Claim code là mã dùng một lần và luôn bắt buộc, kể cả với tài khoản quản lý.
            Hệ thống giữ nguyên chữ hoa, chữ thường của cả hai giá trị.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="claim-device-id">Device ID</Label>
                <Input
                  id="claim-device-id"
                  name="claimDeviceId"
                  autoComplete="off"
                  spellCheck={false}
                  value={deviceId}
                  onChange={(event) => {
                    setDeviceId(event.target.value);
                    setFieldErrors((current) => ({ ...current, deviceId: undefined }));
                    resetIntent();
                  }}
                  placeholder="VD: Device_Aa-01"
                  className="min-h-11 font-mono"
                  aria-invalid={Boolean(fieldErrors.deviceId)}
                  aria-describedby={fieldErrors.deviceId ? "claim-device-id-error" : undefined}
                />
                {fieldErrors.deviceId ? (
                  <p id="claim-device-id-error" role="alert" className="text-sm text-destructive">
                    {fieldErrors.deviceId}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="claim-device-code">Claim code</Label>
                <Input
                  id="claim-device-code"
                  name="claimDeviceCode"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  value={claimCode}
                  onChange={(event) => {
                    setClaimCode(event.target.value);
                    setFieldErrors((current) => ({ ...current, claimCode: undefined }));
                    resetIntent();
                  }}
                  placeholder="VD: Claim_aB-123"
                  className="min-h-11 font-mono"
                  aria-invalid={Boolean(fieldErrors.claimCode)}
                  aria-describedby={fieldErrors.claimCode ? "claim-device-code-error" : undefined}
                />
                {fieldErrors.claimCode ? (
                  <p id="claim-device-code-error" role="alert" className="text-sm text-destructive">
                    {fieldErrors.claimCode}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <ShieldCheck className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <p>
                Backend kiểm tra quyền workspace và mã claim. Portal chỉ báo thiết bị Online sau
                khi backend xác nhận kết nối thiết bị đã được xác thực.
              </p>
            </div>

            <Button
              id="claim-device-submit"
              type="submit"
              className="min-h-11 w-full"
              disabled={claim.isPending && Boolean(inFlightKeyRef.current)}
            >
              {claim.isPending && Boolean(inFlightKeyRef.current) ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Đang gửi yêu cầu…
                </>
              ) : (
                <>
                  <CheckCircle2 aria-hidden="true" />
                  Xác nhận ghép thiết bị
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {failure ? (
        <Card role="alert" className="border-destructive/40" aria-live="assertive">
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              {failure.kind === "offline" ? (
                <WifiOff aria-hidden="true" />
              ) : (
                <CircleAlert aria-hidden="true" />
              )}
            </div>
            <div className="space-y-1.5">
              <CardTitle>{failure.title}</CardTitle>
              <CardDescription>{failure.message}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{failure.guidance}</p>
            {failure.retryable ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={submitClaim}
                disabled={claim.isPending && Boolean(inFlightKeyRef.current)}
              >
                <RefreshCw aria-hidden="true" />
                Thử lại cùng yêu cầu
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <Card className={result.pairing.onlineConfirmed ? "border-emerald-600/40" : "border-primary/30"}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                  {result.pairing.onlineConfirmed ? (
                    <Wifi aria-hidden="true" />
                  ) : (
                    <Clock3 aria-hidden="true" />
                  )}
                </div>
                <div className="space-y-1">
                  <CardTitle>
                    {result.pairing.onlineConfirmed
                      ? "Thiết bị đã xác thực trực tuyến"
                      : "Backend đã chấp nhận"}
                  </CardTitle>
                  <CardDescription className="font-mono">{result.device.id}</CardDescription>
                </div>
              </div>
              <Badge variant={result.pairing.onlineConfirmed ? "default" : "secondary"}>
                {result.pairing.onlineConfirmed ? "Online" : "Đang chờ Online"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {result.pairing.onlineConfirmed ? (
              <p className="text-sm">
                Thiết bị đã đăng nhập bằng transport được xác thực và sẵn sàng hiển thị trạng thái
                hoạt động thực tế.
              </p>
            ) : (
              <p className="text-sm">
                Yêu cầu ghép đã được ghi nhận; đang chờ thiết bị xác thực trực tuyến. Chưa thể coi
                thiết bị là Online ở bước này.
              </p>
            )}

            {presenceMessage ? (
              <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm" aria-live="polite">
                {presenceMessage}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              {!result.pairing.onlineConfirmed ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={checkPresence}
                  disabled={checkingPresence}
                >
                  {checkingPresence ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw aria-hidden="true" />
                  )}
                  {presenceMessage ? "Kiểm tra lại" : "Kiểm tra trạng thái"}
                </Button>
              ) : null}
              <Button asChild className="min-h-11">
                <Link to="/portal/devices">Mở danh sách thiết bị</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
