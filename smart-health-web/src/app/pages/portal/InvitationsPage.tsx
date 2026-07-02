import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { smartHealthApi } from "../../../lib/smart-health-api";

export default function InvitationsPage() {
  const client = useQueryClient();
  const [patientId, setPatientId] = useState("");
  const [targetType, setTargetType] = useState<"doctor" | "workspace">("doctor");
  const [targetId, setTargetId] = useState("");
  const patients = useQuery({
    queryKey: ["portal", "patients"],
    queryFn: () => smartHealthApi.listPatients(),
  });
  const targets = useQuery({
    queryKey: ["portal", "share-targets"],
    queryFn: () => smartHealthApi.shareTargets(),
  });
  const shares = useQuery({
    queryKey: ["portal", "patient-shares", patientId],
    queryFn: () => smartHealthApi.listPatientShares(patientId),
    enabled: Boolean(patientId),
  });
  const create = useMutation({
    mutationFn: () =>
      smartHealthApi.createPatientShare(
        patientId,
        targetType === "doctor"
          ? { doctorUserId: targetId, scope: "patient_profile" }
          : { organizationId: targetId, scope: "patient_profile" },
      ),
    onSuccess: () => {
      toast.success("Đã cấp quyền chia sẻ hồ sơ");
      client.invalidateQueries({ queryKey: ["portal", "patient-shares", patientId] });
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) => smartHealthApi.revokePatientShare(patientId, shareId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["portal", "patient-shares", patientId] }),
  });
  if (patients.isLoading || targets.isLoading) return <PortalLoading />;
  if (patients.error || targets.error)
    return <PortalError error={patients.error || targets.error} />;
  const options =
    targetType === "doctor" ? targets.data?.doctors || [] : targets.data?.workspaces || [];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="hero-gradient-text flex gap-2 items-center">
          <Mail size={22} />
          Chia sẻ & consent
        </h1>
        <p className="text-sm text-[#94b8d0]">
          Quyền truy cập hồ sơ được backend audit và giới hạn theo workspace.
        </p>
      </div>
      <div className="glass-panel rounded-2xl p-5 grid md:grid-cols-4 gap-3">
        <select
          value={patientId}
          onChange={(e) => {
            setPatientId(e.target.value);
            setTargetId("");
          }}
          className="portal-input"
        >
          <option value="">Chọn bệnh nhân</option>
          {patients.data?.patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name || patient.id}
            </option>
          ))}
        </select>
        <select
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as "doctor" | "workspace");
            setTargetId("");
          }}
          className="portal-input"
        >
          <option value="doctor">Bác sĩ</option>
          <option value="workspace">Workspace</option>
        </select>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="portal-input"
        >
          <option value="">Chọn đối tượng</option>
          {options.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name || target.email || target.id}
            </option>
          ))}
        </select>
        <button
          disabled={!patientId || !targetId || create.isPending}
          onClick={() => create.mutate()}
          className="premium-button"
        >
          Cấp quyền
        </button>
      </div>
      {!patientId ? (
        <PortalEmpty label="Chọn bệnh nhân để xem quyền chia sẻ." />
      ) : shares.isLoading ? (
        <PortalLoading />
      ) : shares.error ? (
        <PortalError error={shares.error} />
      ) : !shares.data?.shares.length ? (
        <PortalEmpty label="Hồ sơ chưa được chia sẻ." />
      ) : (
        <div className="glass-panel rounded-2xl divide-y divide-white/5">
          {shares.data.shares.map((share, index) => (
            <div key={String(share.id || index)} className="p-4 flex justify-between items-center">
              <div>
                <div className="text-white text-sm">
                  {String(share.doctorUserId || share.organizationId || "Đối tượng")}
                </div>
                <div className="text-xs text-[#94b8d0]">
                  {String(share.scope || "patient_profile")} ·{" "}
                  {share.active === false ? "Đã hết hiệu lực" : "Đang hoạt động"}
                </div>
              </div>
              {share.active !== false && (
                <button
                  onClick={() => revoke.mutate(String(share.id))}
                  className="text-[#FF6B6B] p-2"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
