import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Settings } from "lucide-react";
import { toast } from "sonner";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function WorkspaceSettings() {
  const { user, refreshUser } = useAuth();
  const canManageWorkspace = Boolean(
    user?.capabilities.includes("workspace.settings.manage") ||
    user?.capabilities.includes("platform.settings.manage"),
  );
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["portal", "settings", user?.currentWorkspace.id],
    queryFn: smartHealthApi.getSettings,
  });
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    website: "",
  });
  const [preferences, setPreferences] = useState({
    abnormalResults: true,
    deviceOffline: true,
    newLogin: true,
  });
  useEffect(() => {
    const workspace = query.data?.workspace || user?.raw.currentWorkspace;
    if (workspace)
      setForm({
        name: workspace.name || "",
        address: workspace.address || "",
        phone: workspace.phone || "",
        email: workspace.email || "",
        website: workspace.website || "",
      });
    const current = user?.raw.notificationPreferences || {};
    setPreferences({
      abnormalResults: current.abnormalResults ?? true,
      deviceOffline: current.deviceOffline ?? true,
      newLogin: current.newLogin ?? true,
    });
  }, [query.data, user]);
  const saveWorkspace = useMutation({
    mutationFn: () => smartHealthApi.updateWorkspace(form),
    onSuccess: async () => {
      toast.success("Đã cập nhật workspace");
      await refreshUser();
      client.invalidateQueries({ queryKey: ["portal", "settings"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const savePreferences = useMutation({
    mutationFn: () =>
      smartHealthApi.updateMe({ notificationPreferences: preferences }),
    onSuccess: async () => {
      toast.success("Đã lưu cài đặt thông báo");
      await refreshUser();
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <PortalLoading />;
  if (query.error) return <PortalError error={query.error} />;
  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <Settings size={22} />
          Cài đặt workspace
        </h1>
        <p className="text-sm text-[#94b8d0]">
          {canManageWorkspace
            ? "Bạn có quyền cập nhật thông tin tổ chức."
            : "Thông tin tổ chức đang ở chế độ chỉ đọc."}
        </p>
      </div>
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Thông tin chung</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {(Object.keys(form) as Array<keyof typeof form>).map((key) => (
            <label key={key} className="text-xs text-[#94b8d0]">
              {
                {
                  name: "Tên workspace",
                  address: "Địa chỉ",
                  phone: "Điện thoại",
                  email: "Email",
                  website: "Website",
                }[key]
              }
              <input
                id={`workspace-${key}`}
                name={`workspace-${key}`}
                disabled={!canManageWorkspace}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="portal-input mt-2 disabled:opacity-60"
              />
            </label>
          ))}
        </div>
        {canManageWorkspace && (
          <button
            id="workspace-save"
            onClick={() => saveWorkspace.mutate()}
            disabled={saveWorkspace.isPending}
            className="premium-button mt-4 flex gap-2 items-center"
          >
            <Save size={14} />
            Lưu workspace
          </button>
        )}
      </div>
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4">Thông báo cá nhân</h2>
        <div className="space-y-3">
          {(Object.keys(preferences) as Array<keyof typeof preferences>).map(
            (key) => (
              <label
                key={key}
                className="flex justify-between gap-3 text-sm text-[#94b8d0]"
              >
                <span>
                  {
                    {
                      abnormalResults: "Kết quả bất thường",
                      deviceOffline: "Thiết bị offline",
                      newLogin: "Đăng nhập mới",
                    }[key]
                  }
                </span>
                <input
                  id={`notification-${key}`}
                  name={`notification-${key}`}
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={(e) =>
                    setPreferences({ ...preferences, [key]: e.target.checked })
                  }
                />
              </label>
            ),
          )}
        </div>
        <button
          id="workspace-save-notifications"
          onClick={() => savePreferences.mutate()}
          className="premium-button mt-4 flex gap-2 items-center"
        >
          <Save size={14} />
          Lưu thông báo
        </button>
      </div>
    </div>
  );
}
