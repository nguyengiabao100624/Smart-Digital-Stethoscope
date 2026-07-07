import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function StaffPage() {
  const client = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", specialty: "", license: "" });
  const query = useQuery({ queryKey: ["portal", "staff"], queryFn: smartHealthApi.listStaff });
  const create = useMutation({
    mutationFn: () => smartHealthApi.createStaff(form),
    onSuccess: () => {
      toast.success("Đã tạo hồ sơ bác sĩ");
      setShow(false);
      client.invalidateQueries({ queryKey: ["portal", "staff"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const staff = query.data?.doctors || [];
  return (
    <div className="space-y-5">
      <div className="flex justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex gap-2 items-center">
            <Stethoscope size={22} />
            Bác sĩ / nhân sự
          </h1>
          <p className="text-sm text-[#94b8d0]">
            Danh sách được giới hạn theo workspace và capability.
          </p>
        </div>
        <button
          onClick={() => setShow((value) => !value)}
          className="premium-button flex gap-2 items-center"
        >
          <Plus size={15} />
          Thêm bác sĩ
        </button>
      </div>
      {show && (
        <form
          method="post"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="glass-panel rounded-2xl p-5 grid md:grid-cols-3 gap-3"
        >
          {(["name", "email", "phone", "specialty", "license"] as const).map((key) => (
            <input
              key={key}
              id={`staff-${key}`}
              name={`staff-${key}`}
              required={key === "name" || key === "email"}
              type={key === "email" ? "email" : "text"}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="portal-input"
              placeholder={
                {
                  name: "Họ tên",
                  email: "Email",
                  phone: "Số điện thoại",
                  specialty: "Chuyên khoa",
                  license: "Số giấy phép",
                }[key]
              }
            />
          ))}
          <button disabled={create.isPending} className="premium-button">
            {create.isPending ? "Đang lưu..." : "Tạo hồ sơ"}
          </button>
        </form>
      )}
      {query.isLoading ? (
        <PortalLoading />
      ) : query.error ? (
        <PortalError error={query.error} />
      ) : !staff.length ? (
        <PortalEmpty label="Workspace chưa có bác sĩ." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {staff.map((member) => (
            <div key={member.id} className="glass-panel rounded-2xl p-5">
              <div className="text-white font-semibold">{member.name || member.email}</div>
              <div className="text-xs text-[#00FFD1] mt-1">
                {String(member.specialty || member.department || "Chưa cập nhật chuyên khoa")}
              </div>
              <div className="text-sm text-[#94b8d0] mt-4 space-y-1">
                <div>{member.email}</div>
                <div>{member.phone || "—"}</div>
                <div>Trạng thái: {member.accountStatus || "active"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
