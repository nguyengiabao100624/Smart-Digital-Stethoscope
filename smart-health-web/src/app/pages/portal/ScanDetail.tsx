import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowLeft, Save } from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function ScanDetail() {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["portal", "scan", id],
    queryFn: () => smartHealthApi.getScan(id),
    enabled: Boolean(id),
  });
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(query.data?.scan.doctorNotes || ""), [query.data?.scan.doctorNotes]);
  const save = useMutation({
    mutationFn: () => smartHealthApi.updateScan(id, { doctorNotes: notes }),
    onSuccess: () => {
      toast.success("Đã lưu nhận xét bác sĩ");
      client.invalidateQueries({ queryKey: ["portal", "scan", id] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (query.isLoading) return <PortalLoading />;
  if (query.error || !query.data)
    return <PortalError error={query.error || new Error("Không tìm thấy lượt đo")} />;
  const scan = query.data.scan;
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <Link to="/portal/records" className="text-sm text-[#94b8d0] flex gap-2 items-center">
        <ArrowLeft size={15} />
        Lượt đo & hồ sơ
      </Link>
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <Activity size={22} />
          Chi tiết lượt đo
        </h1>
        <p className="text-sm text-[#94b8d0] font-mono">{scan.id}</p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Bệnh nhân", scan.patient?.name || scan.patientId],
          ["Thiết bị", scan.deviceId],
          ["Vị trí", scan.bodySite],
          ["BPM", scan.bpm],
        ].map(([label, value]) => (
          <div key={String(label)} className="glass-panel rounded-2xl p-4">
            <div className="text-xs text-[#94b8d0]">{label}</div>
            <div className="text-white font-semibold mt-2">{value || "—"}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="text-white font-semibold">Kết quả AI</h2>
          <div className="mt-4 text-xl font-bold text-[#00FFD1]">
            {scan.aiLabel || "Chưa có kết quả"}
          </div>
          <p className="text-sm text-[#94b8d0] mt-2">
            {scan.aiSummary || "Backend chưa trả về tóm tắt AI."}
          </p>
          {scan.aiConfidence != null && (
            <div className="mt-4 text-sm text-white">
              Độ tin cậy: {Math.round(scan.aiConfidence * 100)}%
            </div>
          )}
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-3">Nhận xét bác sĩ</h2>
          <textarea
            id="scan-review-notes"
            name="scanReviewNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="portal-input h-auto py-3"
          />
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="premium-button mt-3 flex gap-2 items-center"
          >
            <Save size={14} />
            Lưu nhận xét
          </button>
        </div>
      </div>
      {scan.audioUrl ? (
        <audio controls src={scan.audioUrl} className="w-full" />
      ) : (
        <div className="glass-panel rounded-2xl p-5 text-sm text-[#94b8d0]">
          Lượt đo chưa có URL âm thanh khả dụng.
        </div>
      )}
    </div>
  );
}
