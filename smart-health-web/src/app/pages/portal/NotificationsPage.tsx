import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function NotificationsPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["portal", "notifications"],
    queryFn: smartHealthApi.listNotifications,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["portal", "notifications"] });
  const markAll = useMutation({
    mutationFn: smartHealthApi.markAllNotificationsRead,
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
  const mark = useMutation({ mutationFn: smartHealthApi.markNotificationRead, onSuccess: refresh });
  const remove = useMutation({ mutationFn: smartHealthApi.deleteNotification, onSuccess: refresh });
  const list = query.data?.notifications || [];
  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex gap-2 items-center">
            <Bell size={22} />
            Thông báo
          </h1>
          <p className="text-sm text-[#94b8d0]">
            {list.filter((item) => !item.read).length} thông báo chưa đọc
          </p>
        </div>
        <button
          id="notifications-mark-all-read"
          disabled={markAll.isPending || !list.length}
          onClick={() => markAll.mutate()}
          className="rounded-xl border border-white/10 px-3 text-sm text-[#00FFD1] flex gap-2 items-center"
        >
          <CheckCheck size={15} />
          Đánh dấu tất cả đã đọc
        </button>
      </div>
      {query.isLoading ? (
        <PortalLoading />
      ) : query.error ? (
        <PortalError error={query.error} retry={() => query.refetch()} />
      ) : !list.length ? (
        <PortalEmpty label="Không có thông báo." />
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden divide-y divide-white/5">
          {list.map((item) => (
            <div
              key={item.id}
              className={`p-4 flex gap-3 ${item.read ? "opacity-70" : "bg-[#00FFD1]/5"}`}
            >
              <button
                data-notification-read={item.id}
                onClick={() => !item.read && mark.mutate(item.id)}
                className="flex-1 text-left"
              >
                <div className="text-sm font-semibold text-white">{item.title || "Thông báo"}</div>
                <div className="text-xs text-[#94b8d0] mt-1">{item.message}</div>
                <div className="text-[11px] text-white/50 mt-2">
                  {item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : ""}
                </div>
              </button>
              <button
                aria-label="Xóa thông báo"
                data-notification-delete={item.id}
                onClick={() => remove.mutate(item.id)}
                className="text-[#FF6B6B] p-2"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
