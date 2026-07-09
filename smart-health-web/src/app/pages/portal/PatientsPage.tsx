import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function PatientsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", gender: "", age: "" });
  const patients = useQuery({
    queryKey: ["portal", "patients", user?.currentWorkspace.id, search],
    queryFn: () => smartHealthApi.listPatients(search),
  });
  const create = useMutation({
    mutationFn: () =>
      smartHealthApi.createPatient({ ...form, age: form.age ? Number(form.age) : null }),
    onSuccess: () => {
      toast.success("Đã tạo hồ sơ bệnh nhân");
      setShowCreate(false);
      setForm({ name: "", phone: "", email: "", gender: "", age: "" });
      queryClient.invalidateQueries({ queryKey: ["portal", "patients"] });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex items-center gap-2">
            <Users size={22} />
            Bệnh nhân
          </h1>
          <p className="text-sm text-[#94b8d0]">Hồ sơ thuộc {user?.currentWorkspace.name}</p>
        </div>
        <button
          id="portal-add-patient"
          onClick={() => setShowCreate((value) => !value)}
          className="premium-button flex gap-2 items-center"
        >
          <Plus size={15} />
          Thêm bệnh nhân
        </button>
      </div>
      {showCreate && (
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          className="glass-panel rounded-2xl p-5 grid md:grid-cols-5 gap-3"
        >
          <input
            id="portal-patient-name"
            name="patientName"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Họ và tên"
            className="portal-input"
          />
          <input
            id="portal-patient-phone"
            name="patientPhone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Số điện thoại"
            className="portal-input"
          />
          <input
            id="portal-patient-email"
            name="patientEmail"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            className="portal-input"
          />
          <input
            id="portal-patient-age"
            name="patientAge"
            type="number"
            min="0"
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
            placeholder="Tuổi"
            className="portal-input"
          />
          <button id="portal-save-patient" disabled={create.isPending} className="premium-button">
            {create.isPending ? "Đang lưu..." : "Lưu hồ sơ"}
          </button>
        </form>
      )}
      <div className="glass-panel rounded-2xl p-4">
        <div className="portal-search-field">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94b8d0]" size={15} />
          <input
            id="portal-patient-search"
            name="portalPatientSearch"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, mã, số điện thoại..."
            className="portal-input pl-10"
          />
        </div>
      </div>
      {patients.isLoading ? (
        <PortalLoading />
      ) : patients.error ? (
        <PortalError error={patients.error} retry={() => patients.refetch()} />
      ) : !patients.data?.patients.length ? (
        <PortalEmpty label="Chưa có hồ sơ bệnh nhân." />
      ) : (
        <div className="glass-panel rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-[#94b8d0]">
                {["Bệnh nhân", "Mã hồ sơ", "Liên hệ", "Lượt đo", "Lần đo cuối", ""].map((h) => (
                  <th key={h} className="p-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.data.patients.map((patient) => (
                <tr key={patient.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-4 text-white font-medium">{patient.name || "Chưa có tên"}</td>
                  <td className="p-4 text-[#94b8d0] font-mono text-xs">
                    {patient.patientCode || patient.id}
                  </td>
                  <td className="p-4 text-[#94b8d0] text-sm">
                    {patient.phone || patient.email || "—"}
                  </td>
                  <td className="p-4 text-[#00FFD1]">{patient.scanCount || 0}</td>
                  <td className="p-4 text-[#94b8d0] text-sm">
                    {patient.lastScanAt
                      ? new Date(patient.lastScanAt).toLocaleString("vi-VN")
                      : "—"}
                  </td>
                  <td className="p-4">
                    <Link to={`/portal/patients/${patient.id}`} className="text-[#00FFD1] text-sm">
                      Mở hồ sơ →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
