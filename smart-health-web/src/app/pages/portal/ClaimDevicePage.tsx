import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
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
  type DeviceAccessRedeemResponse,
} from "../../../lib/smart-health-api";
import { useAuth } from "../../context/AuthContext";

const ACCESS_CODE_PATTERN = /^SHC-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;

type RedeemFailure = {
  title: string;
  message: string;
  retryable: boolean;
};

type RedeemIntent = {
  userId: string;
  workspaceId: string;
  code: string;
  idempotencyKey: string;
};

function normalizeAccessCode(value: string) {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!compact.startsWith("SHC") || compact.length !== 19) return "";
  const body = compact.slice(3);
  const formatted = `SHC-${body.match(/.{1,4}/g)?.join("-") || ""}`;
  return ACCESS_CODE_PATTERN.test(formatted) ? formatted : "";
}

function createIntentKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `portal-device-access-${crypto.randomUUID()}`;
  }
  return `portal-device-access-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function classifyFailure(error: unknown): RedeemFailure {
  const apiError = error as ApiError;
  if (apiError?.code === "DEVICE_ACCESS_CODE_ALREADY_USED") {
    return {
      title: "Mã đã được sử dụng",
      message:
        "Mã này đã được một tài khoản khác đổi. Hãy nhờ Platform Admin tạo mã mới.",
      retryable: false,
    };
  }
  if (
    apiError?.status === 410 ||
    [
      "DEVICE_ACCESS_CODE_EXPIRED",
      "DEVICE_ACCESS_CODE_REVOKED",
      "DEVICE_ACCESS_DEVICE_UNAVAILABLE",
    ].includes(apiError?.code || "")
  ) {
    return {
      title: "Mã không còn hiệu lực",
      message:
        "Mã đã hết hạn, bị thu hồi hoặc thiết bị không còn sẵn sàng.",
      retryable: false,
    };
  }
  if (apiError?.status === 400 || apiError?.status === 403) {
    return {
      title: "Không thể cấp quyền thiết bị",
      message: "Mã không hợp lệ hoặc không thuộc workspace đang chọn.",
      retryable: false,
    };
  }
  if (
    typeof navigator !== "undefined" &&
    (!navigator.onLine || !apiError?.status)
  ) {
    return {
      title: "Chưa kết nối được máy chủ",
      message: "Giữ nguyên mã, kiểm tra mạng rồi thử lại cùng yêu cầu.",
      retryable: true,
    };
  }
  return {
    title: "Máy chủ chưa xác nhận",
    message:
      apiError?.message ||
      "Chưa có quyền nào được cấp. Vui lòng thử lại.",
    retryable: true,
  };
}

export default function ClaimDevicePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [failure, setFailure] = useState<RedeemFailure | null>(null);
  const [result, setResult] = useState<DeviceAccessRedeemResponse | null>(null);
  const intentKeyRef = useRef("");
  const inFlightKeyRef = useRef("");
  const workspaceId = user?.currentWorkspace.id || "";
  const userId = user?.id || "";
  const authorityRef = useRef({ userId, workspaceId });
  authorityRef.current = { userId, workspaceId };

  useEffect(() => {
    intentKeyRef.current = "";
    inFlightKeyRef.current = "";
    setCode("");
    setFieldError("");
    setFailure(null);
    setResult(null);
  }, [userId, workspaceId]);

  const redeem = useMutation<DeviceAccessRedeemResponse, unknown, RedeemIntent>({
    mutationFn: (intent) =>
      smartHealthApi.redeemDeviceAccess(intent.code, intent.idempotencyKey),
    onSuccess: async (response, intent) => {
      if (
        intent.idempotencyKey !== intentKeyRef.current ||
        intent.userId !== authorityRef.current.userId ||
        intent.workspaceId !== authorityRef.current.workspaceId
      ) {
        return;
      }
      if (
        response.grant.userId !== intent.userId ||
        response.grant.organizationId !== intent.workspaceId ||
        response.device.organizationId !== intent.workspaceId
      ) {
        setFailure({
          title: "Biên nhận không khớp quyền hiện tại",
          message:
            "Máy chủ trả về thiết bị ngoài workspace đang chọn. Chưa có dữ liệu nào được dùng.",
          retryable: false,
        });
        return;
      }
      setResult(response);
      setFailure(null);
      setCode("");
      intentKeyRef.current = "";
      inFlightKeyRef.current = "";
      await queryClient.invalidateQueries({
        queryKey: ["portal", "workspace", workspaceId, "devices"],
      });
    },
    onError: (error, intent) => {
      if (
        intent.idempotencyKey === intentKeyRef.current &&
        intent.userId === authorityRef.current.userId &&
        intent.workspaceId === authorityRef.current.workspaceId
      ) {
        setFailure(classifyFailure(error));
      }
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
  };

  const submit = () => {
    const normalized = normalizeAccessCode(code);
    if (!normalized) {
      setFieldError("Mã phải có dạng SHC-XXXX-XXXX-XXXX-XXXX.");
      return;
    }
    if (!workspaceId || !userId || inFlightKeyRef.current) return;
    const idempotencyKey = intentKeyRef.current || createIntentKey();
    intentKeyRef.current = idempotencyKey;
    setCode(normalized);
    setFieldError("");
    setFailure(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFailure(classifyFailure(new Error("Browser is offline.")));
      return;
    }
    inFlightKeyRef.current = idempotencyKey;
    redeem.mutate({ userId, workspaceId, code: normalized, idempotencyKey });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  return (
    <main
      className="mx-auto max-w-3xl space-y-6"
      aria-labelledby="device-access-title"
    >
      <Button asChild variant="ghost" className="min-h-11 px-2">
        <Link to="/portal/devices">
          <ArrowLeft aria-hidden="true" />
          Quay lại thiết bị
        </Link>
      </Button>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound aria-hidden="true" />
          </div>
          <div>
            <h1
              id="device-access-title"
              className="text-2xl font-semibold tracking-tight"
            >
              Thêm thiết bị bằng mã truy cập
            </h1>
            <p className="text-sm text-muted-foreground">
              Không cần Device ID. Mã xác định đúng thiết bị và phạm vi quyền
              được cấp.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Mã do Platform Admin cấp</CardTitle>
          <CardDescription>
            Mỗi mã chỉ dùng một lần và có thời hạn. QR trên tem hoặc màn Admin
            chứa đúng mã này, không chứa Device ID hay khóa bí mật.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="device-access-code">Mã truy cập</Label>
              <Input
                id="device-access-code"
                name="deviceAccessCode"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.slice(0, 120));
                  setFieldError("");
                  resetIntent();
                }}
                placeholder="SHC-XXXX-XXXX-XXXX-XXXX"
                className="min-h-11 font-mono uppercase"
                aria-invalid={Boolean(fieldError)}
                aria-describedby={
                  fieldError ? "device-access-code-error" : "device-access-help"
                }
              />
              <p id="device-access-help" className="text-sm text-muted-foreground">
                Có thể nhập có hoặc không có dấu gạch ngang; hệ thống tự chuẩn
                hóa trước khi gửi.
              </p>
              {fieldError ? (
                <p
                  id="device-access-code-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {fieldError}
                </p>
              ) : null}
            </div>

            <div className="flex gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <p>
                Mã “Xem &amp; kết nối Wi-Fi” không cho phép sửa hoặc gỡ thiết
                bị. Mã “Quản lý thiết bị” chỉ cấp quyền quản lý đúng thiết bị
                đó, không biến tài khoản thành Admin.
              </p>
            </div>

            <Button
              type="submit"
              className="min-h-11 w-full"
              disabled={redeem.isPending && Boolean(inFlightKeyRef.current)}
            >
              {redeem.isPending && Boolean(inFlightKeyRef.current) ? (
                <>
                  <Loader2
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Đang xác nhận…
                </>
              ) : (
                <>
                  <CheckCircle2 aria-hidden="true" />
                  Thêm thiết bị
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {failure ? (
        <Card role="alert" aria-live="assertive" className="border-destructive/40">
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <CircleAlert aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <CardTitle>{failure.title}</CardTitle>
              <CardDescription>{failure.message}</CardDescription>
            </div>
          </CardHeader>
          {failure.retryable ? (
            <CardContent>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={submit}
              >
                <RefreshCw aria-hidden="true" />
                Thử lại cùng yêu cầu
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {result ? (
        <Card role="status" aria-live="polite" className="border-emerald-600/40">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Đã thêm thiết bị</CardTitle>
                <CardDescription>{result.device.name || result.device.id}</CardDescription>
              </div>
              <Badge variant="default">
                {result.grant.accessLevel === "manager"
                  ? "Quản lý thiết bị"
                  : "Xem & kết nối Wi-Fi"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Máy chủ đã xác nhận quyền cho đúng tài khoản và workspace hiện
              tại. Thiết bị đã xuất hiện trong danh sách; trạng thái Online vẫn
              lấy từ phiên WSS thật của thiết bị.
            </p>
            <Button asChild className="min-h-11">
              <Link to="/portal/devices">Mở danh sách thiết bị</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
