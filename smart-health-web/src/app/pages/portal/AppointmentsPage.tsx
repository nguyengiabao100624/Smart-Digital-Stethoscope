import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Plus, Search, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { useAuth } from "../../context/AuthContext";
import { smartHealthApi, type Appointment } from "../../../lib/smart-health-api";

const statusLabels: Record<string, string> = {
  scheduled: "Đã đặt",
  confirmed: "Đã xác nhận",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
  no_show: "Không đến",
};

const typeLabels: Record<string, string> = {
  remote_consultation: "Tư vấn từ xa",
  clinic_visit: "Khám tại cơ sở",
  measurement: "Lượt đo",
  follow_up: "Tái khám",
};

function toDatetimeLocal(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoFromLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function defaultForm() {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return {
    patientId: "",
    doctorUserId: "",
    type: "remote_consultation",
    startsAt: toDatetimeLocal(start),
    endsAt: toDatetimeLocal(end),
    reason: "",
    notes: "",
  };
}

function AppointmentStatus({ value }: { value?: string }) {
  const status = value || "scheduled";
  const tone =
    status === "cancelled"
      ? "text-[#FF6B6B]"
      : status === "confirmed" || status === "completed"
        ? "text-[#00FFD1]"
        : "text-[#F59E0B]";
  return <span className={`text-sm font-medium ${tone}`}>{statusLabels[status] || status}</span>;
}

export default function AppointmentsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(defaultForm);

  const appointmentsQuery = useQuery({
    queryKey: ["portal", "appointments", user?.currentWorkspace.id, status],
    queryFn: () => smartHealthApi.listAppointments({ status }),
  });
  const patientsQuery = useQuery({
    queryKey: ["portal", "patients", user?.currentWorkspace.id],
    queryFn: () => smartHealthApi.listPatients(),
  });
  const staffQuery = useQuery({
    queryKey: ["portal", "staff", user?.currentWorkspace.id],
    queryFn: smartHealthApi.listStaff,
    retry: false,
  });

  const refresh = () => {
    client.invalidateQueries({ queryKey: ["portal", "appointments"] });
    client.invalidateQueries({ queryKey: ["portal", "notifications"] });
  };

  const create = useMutation({
    mutationFn: () => {
      const startsAt = toIsoFromLocal(form.startsAt);
      const endsAt = toIsoFromLocal(form.endsAt);
      if (!form.patientId || !startsAt || !endsAt) {
        throw new Error("Chọn bệnh nhân và thời gian hợp lệ");
      }
      return smartHealthApi.createAppointment({
        patientId: form.patientId,
        doctorUserId: form.doctorUserId || undefined,
        type: form.type,
        startsAt,
        endsAt,
        reason: form.reason,
        notes: form.notes,
      });
    },
    onSuccess: () => {
      toast.success("Đã tạo lịch hẹn");
      setShowCreate(false);
      setForm(defaultForm());
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ appointment, nextStatus }: { appointment: Appointment; nextStatus: string }) =>
      smartHealthApi.updateAppointment(appointment.id, { status: nextStatus }),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: smartHealthApi.deleteAppointment,
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const appointments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (appointmentsQuery.data?.appointments || []).filter((appointment) => {
      if (!needle) return true;
      return [
        appointment.patient?.name,
        appointment.patient?.patientCode,
        appointment.doctor?.name,
        appointment.reason,
        appointment.id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [appointmentsQuery.data?.appointments, search]);

  const patients = patientsQuery.data?.patients || [];
  const doctors = staffQuery.data?.doctors || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex items-center gap-2">
            <CalendarDays size={22} />
            Lịch hẹn
          </h1>
          <p className="text-sm text-[#94b8d0]">Lịch tư vấn và tái khám trong workspace hiện tại</p>
        </div>
        <button
          id="portal-add-appointment"
          onClick={() => setShowCreate((value) => !value)}
          className="premium-button flex items-center gap-2"
        >
          <Plus size={15} />
          Tạo lịch hẹn
        </button>
      </div>

      {showCreate && (
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          className="glass-panel rounded-2xl p-5 grid md:grid-cols-2 xl:grid-cols-4 gap-3"
        >
          <select
            id="appointment-patient-id"
            name="appointmentPatientId"
            required
            value={form.patientId}
            onChange={(event) => setForm({ ...form, patientId: event.target.value })}
            className="portal-input"
          >
            <option value="">Chọn bệnh nhân</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name || patient.patientCode || patient.id}
              </option>
            ))}
          </select>
          <select
            id="appointment-doctor-id"
            name="appointmentDoctorId"
            value={form.doctorUserId}
            onChange={(event) => setForm({ ...form, doctorUserId: event.target.value })}
            className="portal-input"
          >
            <option value="">Tự động / chưa gán</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name || doctor.email || doctor.id}
              </option>
            ))}
          </select>
          <select
            id="appointment-type"
            name="appointmentType"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
            className="portal-input"
          >
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            id="appointment-starts-at"
            name="appointmentStartsAt"
            type="datetime-local"
            required
            value={form.startsAt}
            onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
            className="portal-input"
          />
          <input
            id="appointment-ends-at"
            name="appointmentEndsAt"
            type="datetime-local"
            required
            value={form.endsAt}
            onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
            className="portal-input"
          />
          <input
            id="appointment-reason"
            name="appointmentReason"
            value={form.reason}
            onChange={(event) => setForm({ ...form, reason: event.target.value })}
            placeholder="Lý do hẹn"
            className="portal-input xl:col-span-2"
          />
          <textarea
            id="appointment-notes"
            name="appointmentNotes"
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Ghi chú nội bộ"
            className="portal-input min-h-24 xl:col-span-3"
          />
          <button id="appointment-save" disabled={create.isPending} className="premium-button">
            {create.isPending ? "Đang lưu..." : "Lưu lịch hẹn"}
          </button>
        </form>
      )}

      <div className="glass-panel rounded-2xl p-4 flex flex-wrap gap-3">
        <div className="portal-search-field flex-1 min-w-60">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94b8d0]" />
          <input
            id="portal-appointment-search"
            name="portalAppointmentSearch"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="portal-input pl-10"
            placeholder="Tìm bệnh nhân, bác sĩ, lý do..."
          />
        </div>
        <select
          id="portal-appointment-status"
          name="portalAppointmentStatus"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="portal-input max-w-52"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {appointmentsQuery.isLoading || patientsQuery.isLoading ? (
        <PortalLoading />
      ) : appointmentsQuery.error ? (
        <PortalError error={appointmentsQuery.error} retry={() => appointmentsQuery.refetch()} />
      ) : !appointments.length ? (
        <PortalEmpty label="Chưa có lịch hẹn phù hợp." />
      ) : (
        <div className="glass-panel rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-[#94b8d0]">
                {["Thời gian", "Bệnh nhân", "Bác sĩ", "Loại", "Trạng thái", "Lý do", ""].map((header) => (
                  <th key={header} className="p-4">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr
                  key={appointment.id}
                  data-appointment-row={appointment.id}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="p-4 text-sm text-white">
                    {appointment.startsAt ? new Date(appointment.startsAt).toLocaleString("vi-VN") : "-"}
                    <div className="text-xs text-[#94b8d0]">
                      {appointment.endsAt ? new Date(appointment.endsAt).toLocaleTimeString("vi-VN") : ""}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-white font-medium">{appointment.patient?.name || appointment.patientId || "-"}</div>
                    <div className="text-xs text-[#94b8d0]">{appointment.patient?.patientCode || appointment.patientId}</div>
                  </td>
                  <td className="p-4 text-sm text-[#94b8d0]">
                    {appointment.doctor?.name || appointment.doctorUserId || "Chưa gán"}
                  </td>
                  <td className="p-4 text-sm text-white">{typeLabels[appointment.type || ""] || appointment.type || "-"}</td>
                  <td className="p-4">
                    <AppointmentStatus value={appointment.status} />
                  </td>
                  <td className="p-4 text-sm text-[#94b8d0] max-w-72 truncate">
                    {appointment.reason || appointment.notes || "-"}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        data-appointment-confirm={appointment.id}
                        disabled={updateStatus.isPending || appointment.status === "confirmed"}
                        onClick={() => updateStatus.mutate({ appointment, nextStatus: "confirmed" })}
                        className="rounded-lg border border-white/10 p-2 text-[#00FFD1] disabled:opacity-40"
                        aria-label="Xác nhận lịch hẹn"
                      >
                        <CheckCircle2 size={15} />
                      </button>
                      <button
                        data-appointment-cancel={appointment.id}
                        disabled={updateStatus.isPending || appointment.status === "cancelled"}
                        onClick={() => updateStatus.mutate({ appointment, nextStatus: "cancelled" })}
                        className="rounded-lg border border-white/10 p-2 text-[#F59E0B] disabled:opacity-40"
                        aria-label="Hủy lịch hẹn"
                      >
                        <XCircle size={15} />
                      </button>
                      <button
                        data-appointment-delete={appointment.id}
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(appointment.id)}
                        className="rounded-lg border border-white/10 p-2 text-[#FF6B6B] disabled:opacity-40"
                        aria-label="Xóa lịch hẹn"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
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
