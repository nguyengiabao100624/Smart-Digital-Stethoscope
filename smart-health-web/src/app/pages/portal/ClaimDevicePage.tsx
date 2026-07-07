import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Plus, QrCode, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PortalError } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function ClaimDevicePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [deviceId, setDeviceId] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [name, setName] = useState("");

  const capabilities = user?.capabilities || [];
  const canManage = capabilities.some((capability) =>
    ["workspace.devices.manage", "platform.devices.manage", "personal.devices.manage"].includes(
      capability,
    ),
  );
  const canClaim = capabilities.some((capability) =>
    [
      "workspace.devices.view",
      "workspace.devices.manage",
      "platform.devices.manage",
      "personal.devices.manage",
    ].includes(capability),
  );

  const requiresClaimCode = !canManage;
  const canSubmit = useMemo(() => {
    if (!deviceId.trim()) return false;
    if (requiresClaimCode && !claimCode.trim()) return false;
    return true;
  }, [claimCode, deviceId, requiresClaimCode]);

  const claim = useMutation({
    mutationFn: () =>
      smartHealthApi.activateDeviceByClaim({
        deviceId: deviceId.trim(),
        claimCode: claimCode.trim().toUpperCase(),
        name: name.trim() || undefined,
        connectionMethod: claimCode.trim() ? "QR" : "manual",
      }),
    onSuccess: async ({ device }) => {
      await queryClient.invalidateQueries({ queryKey: ["portal", "devices"] });
      toast.success("Đã thêm thiết bị vào workspace", {
        description: device.name || device.id,
      });
      navigate("/portal/devices");
    },
    onError: (error) => {
      toast.error("Không thể thêm thiết bị", {
        description: error instanceof Error ? error.message : "Vui lòng kiểm tra Device ID và claim code.",
      });
    },
  });

  if (!canClaim) {
    return (
      <PortalError error={new Error("Tài khoản không có quyền thêm hoặc claim thiết bị trong workspace này.")} />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/portal/devices" className="flex items-center gap-2 text-sm text-[#94b8d0]">
        <ArrowLeft size={15} />
        Quay lại thiết bị
      </Link>

      <div>
        <h1 className="hero-gradient-text flex items-center gap-2">
          <QrCode size={22} />
          Thêm thiết bị
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Nhập Device ID và claim code in trên QR/tem thiết bị để tự kích hoạt vào workspace.
        </p>
      </div>

      <form
        method="post"
        className="glass-panel space-y-5 rounded-2xl p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) claim.mutate();
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-white">
            Device ID
            <input
              id="claim-device-id"
              name="claimDeviceId"
              required
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              placeholder="VD: dev_20260706_abcd"
              className="portal-input mt-2 font-mono"
            />
          </label>

          <label className="block text-sm text-white">
            Claim code {requiresClaimCode ? "" : "(nếu có)"}
            <input
              id="claim-device-code"
              name="claimDeviceCode"
              required={requiresClaimCode}
              value={claimCode}
              onChange={(event) => setClaimCode(event.target.value.trim().toUpperCase())}
              placeholder="VD: A1B2C3D4E5F6"
              className="portal-input mt-2 text-center font-mono tracking-[0.18em]"
            />
          </label>
        </div>

        <label className="block text-sm text-white">
          Tên hiển thị
          <input
            id="claim-device-name"
            name="claimDeviceName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ống nghe phòng khám 01"
            className="portal-input mt-2"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[#00FFD1]/20 bg-[#00FFD1]/10 p-4 text-sm text-[#B9FFF1]">
            <div className="mb-2 flex items-center gap-2 font-semibold text-white">
              <ShieldCheck size={16} />
              Claim an toàn
            </div>
            Backend chỉ nhận thiết bị có claim code còn hạn và thuộc workspace hiện tại.
          </div>
          <div className="rounded-xl border border-[#4AA4E0]/20 bg-[#4AA4E0]/10 p-4 text-sm text-[#C7E8FF]">
            <div className="mb-2 flex items-center gap-2 font-semibold text-white">
              <Plus size={16} />
              Quyền quản lý
            </div>
            Tài khoản quản lý thiết bị có thể khai báo nhanh thiết bị mới khi chưa có claim code.
          </div>
        </div>

        <button
          id="claim-device-submit"
          type="submit"
          disabled={!canSubmit || claim.isPending}
          className="premium-button flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {claim.isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Đang thêm thiết bị...
            </>
          ) : (
            <>
              <CheckCircle2 size={16} />
              Xác nhận thêm thiết bị
            </>
          )}
        </button>
      </form>
    </div>
  );
}
