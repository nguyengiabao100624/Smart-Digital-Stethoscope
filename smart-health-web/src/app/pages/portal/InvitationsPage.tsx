import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileText, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PortalEmpty, PortalError, PortalLoading } from "../../components/PortalState";
import { PatientShare, ShareTarget, smartHealthApi } from "../../../lib/smart-health-api";

type TargetType = "doctor" | "workspace";
type ShareScope = "patient_profile" | "selected_scans";

function formatDate(value?: string) {
  if (!value) return "Không giới hạn";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("vi-VN");
}

function shareTargetLabel(share: PatientShare, doctors: Map<string, ShareTarget>, workspaces: Map<string, ShareTarget>) {
  if (share.doctorUserId || share.doctorId) {
    const id = share.doctorUserId || share.doctorId || "";
    const doctor = doctors.get(id);
    return doctor?.name || doctor?.email || id || "Bác sĩ";
  }
  if (share.organizationId) {
    const workspace = workspaces.get(share.organizationId);
    return workspace?.name || share.organizationId;
  }
  return "Đối tượng chia sẻ";
}

function scopeLabel(scope?: string, scanCount = 0) {
  if (scope === "selected_scans") return `Chỉ ${scanCount || 0} lượt đo đã chọn`;
  return "Toàn bộ hồ sơ bệnh nhân";
}

export default function InvitationsPage() {
  const client = useQueryClient();
  const [patientId, setPatientId] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("doctor");
  const [targetId, setTargetId] = useState("");
  const [scope, setScope] = useState<ShareScope>("patient_profile");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedScanIds, setSelectedScanIds] = useState<string[]>([]);

  const patients = useQuery({
    queryKey: ["portal", "patients"],
    queryFn: () => smartHealthApi.listPatients(),
  });
  const targets = useQuery({
    queryKey: ["portal", "share-targets"],
    queryFn: () => smartHealthApi.shareTargets(),
  });
  const scans = useQuery({
    queryKey: ["portal", "share-scans", patientId],
    queryFn: () => smartHealthApi.listScans({ patientId, limit: 100 }),
    enabled: Boolean(patientId),
  });
  const shares = useQuery({
    queryKey: ["portal", "patient-shares", patientId],
    queryFn: () => smartHealthApi.listPatientShares(patientId),
    enabled: Boolean(patientId),
  });

  const doctorsById = useMemo(
    () => new Map((targets.data?.doctors || []).map((target) => [target.id, target])),
    [targets.data?.doctors],
  );
  const workspacesById = useMemo(
    () => new Map((targets.data?.workspaces || []).map((target) => [target.id, target])),
    [targets.data?.workspaces],
  );
  const options = targetType === "doctor" ? targets.data?.doctors || [] : targets.data?.workspaces || [];
  const activeShares = (shares.data?.shares || []).filter((share) => share.active !== false);
  const canSubmit =
    Boolean(patientId && targetId) && (scope !== "selected_scans" || selectedScanIds.length > 0);

  const create = useMutation({
    mutationFn: () =>
      smartHealthApi.createPatientShare(patientId, {
        ...(targetType === "doctor" ? { doctorUserId: targetId } : { organizationId: targetId }),
        scope,
        ...(scope === "selected_scans" ? { scanIds: selectedScanIds } : {}),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      }),
    onSuccess: () => {
      toast.success("Đã cấp quyền chia sẻ hồ sơ");
      setTargetId("");
      setSelectedScanIds([]);
      client.invalidateQueries({ queryKey: ["portal", "patient-shares", patientId] });
    },
    onError: (error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (shareId: string) => smartHealthApi.revokePatientShare(patientId, shareId),
    onSuccess: () => {
      toast.success("Đã thu hồi quyền chia sẻ");
      client.invalidateQueries({ queryKey: ["portal", "patient-shares", patientId] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (patients.isLoading || targets.isLoading) return <PortalLoading />;
  if (patients.error || targets.error) return <PortalError error={patients.error || targets.error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="hero-gradient-text flex gap-2 items-center">
            <Mail size={22} />
            Chia sẻ & consent
          </h1>
          <p className="text-sm text-[#94b8d0]">
            Cấp quyền theo bệnh nhân, phạm vi dữ liệu và thời hạn. Backend audit mọi lần cấp
            hoặc thu hồi.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="glass-panel rounded-xl px-3 py-2">
            <b className="block text-white text-base">{patients.data?.patients.length || 0}</b>
            <span className="text-[#94b8d0]">Bệnh nhân</span>
          </div>
          <div className="glass-panel rounded-xl px-3 py-2">
            <b className="block text-white text-base">{options.length}</b>
            <span className="text-[#94b8d0]">Đích chia sẻ</span>
          </div>
          <div className="glass-panel rounded-xl px-3 py-2">
            <b className="block text-white text-base">{activeShares.length}</b>
            <span className="text-[#94b8d0]">Đang cấp</span>
          </div>
        </div>
      </div>

      <section className="glass-panel rounded-2xl p-5 space-y-4" aria-label="Cấp quyền chia sẻ hồ sơ">
        <div className="grid lg:grid-cols-4 md:grid-cols-2 gap-3">
          <label className="text-xs text-[#94b8d0] space-y-2">
            <span>Bệnh nhân</span>
            <select
              id="share-patient-id"
              name="sharePatientId"
              value={patientId}
              onChange={(event) => {
                setPatientId(event.target.value);
                setTargetId("");
                setSelectedScanIds([]);
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
          </label>

          <label className="text-xs text-[#94b8d0] space-y-2">
            <span>Loại đối tượng</span>
            <select
              id="share-target-type"
              name="shareTargetType"
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value as TargetType);
                setTargetId("");
              }}
              className="portal-input"
            >
              <option value="doctor">Bác sĩ</option>
              <option value="workspace">Workspace</option>
            </select>
          </label>

          <label className="text-xs text-[#94b8d0] space-y-2">
            <span>Đối tượng nhận quyền</span>
            <select
              id="share-target-id"
              name="shareTargetId"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="portal-input"
            >
              <option value="">Chọn đối tượng</option>
              {options.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name || target.email || target.id}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs text-[#94b8d0] space-y-2">
            <span>Phạm vi consent</span>
            <select
              id="share-scope"
              name="shareScope"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as ShareScope);
                setSelectedScanIds([]);
              }}
              className="portal-input"
            >
              <option value="patient_profile">Toàn bộ hồ sơ</option>
              <option value="selected_scans">Chỉ lượt đo đã chọn</option>
            </select>
          </label>
        </div>

        <div className="grid lg:grid-cols-[1fr_auto] gap-3 items-end">
          <label className="text-xs text-[#94b8d0] space-y-2">
            <span>Thời hạn tùy chọn</span>
            <input
              id="share-expires-at"
              name="shareExpiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="portal-input"
            />
          </label>
          <button
            id="share-create-submit"
            disabled={!canSubmit || create.isPending}
            onClick={() => create.mutate()}
            className="premium-button flex items-center justify-center gap-2 min-h-12 disabled:opacity-50"
          >
            <ShieldCheck size={16} />
            {create.isPending ? "Đang cấp quyền..." : "Cấp quyền"}
          </button>
        </div>

        {scope === "selected_scans" && (
          <div className="rounded-2xl border border-white/10 p-4" data-share-scan-scope>
            <div className="mb-3 flex items-center gap-2 text-sm text-white">
              <FileText size={16} />
              Chọn lượt đo được chia sẻ
            </div>
            {!patientId ? (
              <p className="text-sm text-[#94b8d0]">Chọn bệnh nhân trước khi chọn lượt đo.</p>
            ) : scans.isLoading ? (
              <PortalLoading />
            ) : scans.error ? (
              <PortalError error={scans.error} retry={() => scans.refetch()} />
            ) : !scans.data?.scans.length ? (
              <PortalEmpty label="Bệnh nhân này chưa có lượt đo để chia sẻ riêng lẻ." />
            ) : (
              <div className="grid md:grid-cols-2 gap-2">
                {scans.data.scans.map((scan) => {
                  const selected = selectedScanIds.includes(scan.id);
                  return (
                    <label
                      key={scan.id}
                      className="flex gap-3 rounded-xl border border-white/10 p-3 text-sm text-[#94b8d0]"
                    >
                      <input
                        data-share-scan={scan.id}
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          setSelectedScanIds((current) =>
                            event.target.checked
                              ? [...current, scan.id]
                              : current.filter((id) => id !== scan.id),
                          )
                        }
                      />
                      <span>
                        <b className="block text-white">{scan.aiLabel || scan.status || scan.id}</b>
                        {formatDate(scan.createdAt || scan.startedAt)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {!patientId ? (
        <PortalEmpty label="Chọn bệnh nhân để xem và quản lý quyền chia sẻ." />
      ) : shares.isLoading ? (
        <PortalLoading />
      ) : shares.error ? (
        <PortalError error={shares.error} retry={() => shares.refetch()} />
      ) : !shares.data?.shares.length ? (
        <PortalEmpty label="Hồ sơ chưa được chia sẻ." />
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="grid md:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 border-b border-white/10 p-4 text-xs uppercase text-[#94b8d0]">
            <span>Đối tượng</span>
            <span>Phạm vi</span>
            <span>Thời hạn</span>
            <span className="text-right">Trạng thái</span>
          </div>
          <div className="divide-y divide-white/5">
            {shares.data.shares.map((share) => (
              <div
                key={share.id}
                data-share-row={share.id}
                className="grid md:grid-cols-[1.5fr_1fr_1fr_auto] gap-3 p-4 items-center"
              >
                <div>
                  <div className="text-white text-sm">
                    {shareTargetLabel(share, doctorsById, workspacesById)}
                  </div>
                  <div className="text-xs text-[#94b8d0]">{share.id}</div>
                </div>
                <div className="text-sm text-[#94b8d0]">
                  {scopeLabel(share.scope, share.scanIds?.length || 0)}
                </div>
                <div className="flex items-center gap-2 text-sm text-[#94b8d0]">
                  <Clock size={14} />
                  {formatDate(share.expiresAt)}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-xs text-white">
                    <CheckCircle2 size={13} />
                    {share.active === false ? "Đã thu hồi" : "Đang cấp"}
                  </span>
                  {share.active !== false && (
                    <button
                      data-share-revoke={share.id}
                      onClick={() => revoke.mutate(share.id)}
                      disabled={revoke.isPending}
                      className="rounded-lg p-2 text-[#FF6B6B] hover:bg-[#FF6B6B]/10 disabled:opacity-50"
                      aria-label="Thu hồi quyền chia sẻ"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
