import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function PatientDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const patient = useQuery({
    queryKey: ["portal", "patient", id],
    queryFn: () => smartHealthApi.getPatient(id),
    enabled: Boolean(id),
  });
  const scans = useQuery({
    queryKey: ["portal", "scans", "patient", id],
    queryFn: () => smartHealthApi.listScans({ patientId: id, limit: 100 }),
    enabled: Boolean(id),
  });
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(patient.data?.patient.notes || ""), [patient.data?.patient.notes]);
  const save = useMutation({
    mutationFn: () => smartHealthApi.updatePatient(id, { notes }),
    onSuccess: () => {
      toast.success("Đã lưu hồ sơ");
      client.invalidateQueries({ queryKey: ["portal", "patient", id] });
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => smartHealthApi.deletePatient(id),
    onSuccess: () => {
      toast.success("Đã xóa hồ sơ bệnh nhân");
      navigate("/portal/patients");
    },
    onError: (error) => toast.error(error.message),
  });
  if (patient.isLoading) return <PortalLoading />;
  if (patient.error || !patient.data)
    return (
      <PortalError
        error={patient.error || new Error("Không tìm thấy bệnh nhân")}
        retry={() => patient.refetch()}
      />
    );
  const data = patient.data.patient;
  return (
    <div className="space-y-5">
      <Link to="/portal/patients" className="text-sm text-[#94b8d0] flex gap-2 items-center">
        <ArrowLeft size={15} />
        Danh sách bệnh nhân
      </Link>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex gap-2 items-center">
            <UserRound size={22} />
            {data.name || "Hồ sơ bệnh nhân"}
          </h1>
          <p className="text-sm text-[#94b8d0]">{data.patientCode || data.id}</p>
        </div>
        <button
          id="patient-delete"
          onClick={() => {
            if (window.confirm("Xóa hồ sơ bệnh nhân này?")) remove.mutate();
          }}
          className="rounded-xl border border-[#FF4B4B]/30 text-[#FF6B6B] px-3 flex gap-2 items-center"
        >
          <Trash2 size={15} />
          Xóa
        </button>
      </div>
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="glass-panel rounded-2xl p-5 space-y-3 text-sm">
          <h2 className="text-white font-semibold">Thông tin</h2>
          {[
            ["Tuổi", data.age],
            ["Giới tính", data.gender],
            ["Điện thoại", data.phone],
            ["Email", data.email],
            ["Địa chỉ", data.address],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-3 text-[#94b8d0]">
              <span>{label}</span>
              <b className="text-white text-right">{value || "—"}</b>
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-3">Ghi chú lâm sàng</h2>
          <textarea
            id="patient-clinical-notes"
            name="patientClinicalNotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="portal-input h-auto py-3 resize-y"
            placeholder="Nhập ghi chú..."
          />
          <button
            id="patient-save-notes"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="premium-button mt-3 flex gap-2 items-center"
          >
            <Save size={14} />
            {save.isPending ? "Đang lưu..." : "Lưu ghi chú"}
          </button>
        </div>
      </div>
      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 text-white font-semibold">Lịch sử lượt đo</div>
        {scans.isLoading ? (
          <PortalLoading />
        ) : !scans.data?.scans.length ? (
          <div className="p-8 text-center text-[#94b8d0]">Chưa có lượt đo.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {scans.data.scans.map((scan) => (
              <Link
                key={scan.id}
                to={`/portal/records/${scan.id}`}
                className="p-4 flex justify-between gap-3 hover:bg-white/5"
              >
                <div>
                  <div className="text-sm text-white">
                    {scan.aiLabel || scan.status || "Lượt đo"}
                  </div>
                  <div className="text-xs text-[#94b8d0]">
                    {scan.deviceId || "Không rõ thiết bị"}
                  </div>
                </div>
                <span className="text-xs text-[#94b8d0]">
                  {scan.createdAt ? new Date(scan.createdAt).toLocaleString("vi-VN") : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
