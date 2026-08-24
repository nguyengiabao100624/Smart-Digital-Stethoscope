import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  Clock3,
  FileCheck2,
  FileText,
  History,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trash2,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { Skeleton } from "../../../components/ui/skeleton";
import { useAuth } from "../../context/AuthContext";
import {
  parsePatientListResponse,
  parsePatientScanHistoryResponse,
} from "../../../lib/patient-operations";
import {
  smartHealthApi,
  type ApiError,
  type CreatePatientSharePayload,
  type PatientShare,
  type PatientShareAuthorityType,
  type PatientShareStatus,
} from "../../../lib/smart-health-api";

type TargetType = "doctor" | "workspace";
type ShareScope = "patient_profile" | "selected_scans";

const SHARING_MANAGE_CAPABILITIES = [
  "platform.patients.manage",
  "workspace.patients.manage",
  "personal.sharing.manage",
];

const AUTHORITY_LABELS: Record<PatientShareAuthorityType, string> = {
  patient_consent: "Consent do bệnh nhân cấp",
  clinician_access_grant: "Quyền truy cập trực tiếp",
  administrative_assignment: "Phân công hành chính",
};

const STATUS_LABELS: Record<PatientShareStatus, string> = {
  active: "Đang hiệu lực",
  revoked: "Đã thu hồi",
  expired: "Đã hết hạn",
};

const PATIENT_SHARE_AUTHORITY_TYPES = new Set<PatientShareAuthorityType>([
  "patient_consent",
  "clinician_access_grant",
  "administrative_assignment",
]);

function hasCanonicalPatientShareContract(
  share: PatientShare | null | undefined,
  patientId: string,
) {
  return Boolean(
    share?.id &&
      share.patientId === patientId &&
      share.accessLevel === "read" &&
      PATIENT_SHARE_AUTHORITY_TYPES.has(share.authorityType) &&
      ["active", "revoked", "expired"].includes(share.status) &&
      share.recipient?.id &&
      ["doctor", "workspace"].includes(share.recipient.type) &&
      share.audit?.grantedAt,
  );
}

function matchesPatientShareIntent(
  share: PatientShare,
  intent: CreatePatientSharePayload,
) {
  const directDoctor = "doctorUserId" in intent;
  const expectedRecipientId = directDoctor
    ? intent.doctorUserId
    : intent.organizationId;
  const expectedScanIds =
    intent.scope === "selected_scans" ? [...(intent.scanIds || [])].sort() : [];
  return (
    share.recipient.type === (directDoctor ? "doctor" : "workspace") &&
    share.recipient.id === expectedRecipientId &&
    share.scope === intent.scope &&
    JSON.stringify([...share.scanIds].sort()) === JSON.stringify(expectedScanIds) &&
    (intent.expiresAt || "") === (share.expiresAt || "")
  );
}

function createShareIntentKey(operation: "create" | "revoke", id = "new") {
  const uniquePart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `portal-patient-share-${operation}-${id}-${uniquePart}`;
}

function isOffline() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function isPermissionError(error: unknown) {
  return Boolean(
    error && typeof error === "object" && (error as ApiError).status === 403,
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDateTime(value?: string, fallback = "Không giới hạn") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Không xác định"
    : date.toLocaleString("vi-VN");
}

function authorityLabel(authorityType?: PatientShareAuthorityType) {
  return authorityType
    ? AUTHORITY_LABELS[authorityType]
    : "Loại quyền chưa được backend xác định";
}

function statusLabel(status?: PatientShareStatus) {
  return status
    ? STATUS_LABELS[status]
    : "Trạng thái chưa được backend xác định";
}

function statusClass(status?: PatientShareStatus) {
  if (status === "active") {
    return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]";
  }
  if (status === "revoked") {
    return "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]";
  }
  if (status === "expired") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]";
  }
  return "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]";
}

function authorityClass(authorityType?: PatientShareAuthorityType) {
  if (authorityType === "patient_consent") {
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]";
  }
  if (authorityType === "clinician_access_grant") {
    return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]";
  }
  if (authorityType === "administrative_assignment") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]";
  }
  return "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-fg)]";
}

function scopeLabel(scope?: string, scanCount = 0) {
  if (scope === "selected_scans") {
    return `${scanCount} lượt đo được chọn`;
  }
  if (scope === "patient_profile") return "Toàn bộ hồ sơ bệnh nhân";
  return "Phạm vi chưa được backend xác định";
}

function recipientDetails(share: PatientShare) {
  return share.recipient;
}

function recipientTypeLabel(type?: string) {
  if (type === "doctor") return "Bác sĩ";
  if (type === "workspace") return "Workspace";
  return "Loại người nhận chưa xác định";
}

function auditDetails(share: PatientShare) {
  return {
    grantedBy:
      share.grantedByActor?.name ||
      share.audit?.grantedByUserId ||
      share.grantedByUserId ||
      "",
    grantedByRole: share.grantedByActor?.role || "",
    grantedAt: share.audit?.grantedAt || share.createdAt || "",
    consentedAt: share.consentedAt || "",
    revokedBy:
      share.revokedByActor?.name ||
      share.audit?.revokedByUserId ||
      share.revokedByUserId ||
      "",
    revokedByRole: share.revokedByActor?.role || "",
    revokedAt: share.audit?.revokedAt || share.revokedAt || "",
    updatedAt: share.audit?.updatedAt || share.updatedAt || "",
  };
}

export default function InvitationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = user?.currentWorkspace.id || "";
  const activeWorkspaceRef = useRef(workspaceId);
  const previousWorkspaceRef = useRef(workspaceId);
  const operationEpochRef = useRef(0);
  const workspaceChanging =
    Boolean(previousWorkspaceRef.current) &&
    previousWorkspaceRef.current !== workspaceId;
  const capabilities = user?.capabilities || [];
  const canManageSharing = capabilities.some((capability) =>
    SHARING_MANAGE_CAPABILITIES.includes(capability),
  );

  const [online, setOnline] = useState(() => !isOffline());
  const [patientId, setPatientId] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("doctor");
  const [targetId, setTargetId] = useState("");
  const [scope, setScope] = useState<ShareScope>("patient_profile");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedScanIds, setSelectedScanIds] = useState<string[]>([]);
  const [createIntentKey, setCreateIntentKey] = useState(() =>
    createShareIntentKey("create"),
  );
  const [createError, setCreateError] = useState("");
  const [revokeIntent, setRevokeIntent] = useState<{
    share: PatientShare;
    patientId: string;
    key: string;
  } | null>(null);
  const [revokeError, setRevokeError] = useState("");

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useLayoutEffect(() => {
    activeWorkspaceRef.current = workspaceId;
    if (previousWorkspaceRef.current === workspaceId) return;
    operationEpochRef.current += 1;
    previousWorkspaceRef.current = workspaceId;
    setPatientId("");
    setTargetType("doctor");
    setTargetId("");
    setScope("patient_profile");
    setExpiresAt("");
    setSelectedScanIds([]);
    setCreateIntentKey(createShareIntentKey("create"));
    setCreateError("");
    setRevokeIntent(null);
    setRevokeError("");
  }, [workspaceId]);

  const patientsQuery = useQuery({
    queryKey: ["portal", "patients", workspaceId, "share-access"],
    queryFn: async () => ({
      patients: parsePatientListResponse(
        await smartHealthApi.listPatients(),
        workspaceId,
      ),
    }),
    enabled: Boolean(
      workspaceId && canManageSharing && !workspaceChanging,
    ),
    retry: false,
  });
  const targetsQuery = useQuery({
    queryKey: ["portal", "share-targets", workspaceId],
    queryFn: () => smartHealthApi.shareTargets(workspaceId),
    enabled: Boolean(
      workspaceId && canManageSharing && !workspaceChanging,
    ),
    retry: false,
  });
  const scansQuery = useQuery({
    queryKey: ["portal", "share-scans", workspaceId, patientId],
    queryFn: async () =>
      parsePatientScanHistoryResponse(
        await smartHealthApi.listScans({ patientId, limit: 100 }),
        workspaceId,
        patientId,
      ),
    enabled: Boolean(
      workspaceId &&
      patientId &&
      scope === "selected_scans" &&
      canManageSharing &&
      !workspaceChanging,
    ),
    retry: false,
  });
  const sharesQuery = useQuery({
    queryKey: ["portal", "patient-shares", workspaceId, patientId],
    queryFn: () =>
      smartHealthApi.listPatientShares(patientId, workspaceId),
    enabled: Boolean(
      workspaceId &&
        patientId &&
        canManageSharing &&
        !workspaceChanging,
    ),
    retry: false,
  });

  const targetOptions =
    targetType === "doctor"
      ? targetsQuery.data?.doctors || []
      : targetsQuery.data?.workspaces || [];
  const shares = sharesQuery.data?.shares || [];
  const invalidShareContract = shares.some(
    (share) => !hasCanonicalPatientShareContract(share, patientId),
  );
  const activeShareCount = shares.filter(
    (share) => share.status === "active",
  ).length;

  const rotateCreateIntent = () => {
    setCreateIntentKey(createShareIntentKey("create"));
    setCreateError("");
  };

  const createMutation = useMutation({
    mutationFn: ({
      selectedPatientId,
      payload,
      idempotencyKey,
      operationWorkspaceId,
    }: {
      selectedPatientId: string;
      payload: CreatePatientSharePayload;
      idempotencyKey: string;
      operationWorkspaceId: string;
      operationEpoch: number;
    }) =>
      smartHealthApi.createPatientShare(
        selectedPatientId,
        payload,
        idempotencyKey,
        operationWorkspaceId,
      ),
    onSuccess: async (payload, variables) => {
      if (
        activeWorkspaceRef.current !== variables.operationWorkspaceId ||
        operationEpochRef.current !== variables.operationEpoch
      ) {
        return;
      }
      if (
        !hasCanonicalPatientShareContract(
          payload.share,
          variables.selectedPatientId,
        ) ||
        !matchesPatientShareIntent(payload.share, variables.payload) ||
        payload.share.status !== "active" ||
        payload.share.active !== true
      ) {
        setCreateError(
          "Backend chưa xác nhận đầy đủ quyền truy cập đang hiệu lực.",
        );
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [
          "portal",
          "patient-shares",
          variables.operationWorkspaceId,
          variables.selectedPatientId,
        ],
      });
      toast.success("Backend đã ghi nhận quyền truy cập dữ liệu.");
      setTargetId("");
      setSelectedScanIds([]);
      setExpiresAt("");
      setCreateError("");
      setCreateIntentKey(createShareIntentKey("create"));
    },
    onError: (error, variables) => {
      if (
        activeWorkspaceRef.current !== variables.operationWorkspaceId ||
        operationEpochRef.current !== variables.operationEpoch
      ) {
        return;
      }
      setCreateError(
        errorMessage(error, "Không thể cấp quyền truy cập dữ liệu."),
      );
    },
  });

  const revokeMutation = useMutation({
    mutationFn: ({
      share,
      patientId: selectedPatientId,
      key,
      operationWorkspaceId,
    }: {
      share: PatientShare;
      patientId: string;
      key: string;
      operationWorkspaceId: string;
      operationEpoch: number;
    }) =>
      smartHealthApi.revokePatientShare(
        selectedPatientId,
        share.id,
        key,
        operationWorkspaceId,
      ),
    onSuccess: async (payload, variables) => {
      if (
        activeWorkspaceRef.current !== variables.operationWorkspaceId ||
        operationEpochRef.current !== variables.operationEpoch
      ) {
        return;
      }
      if (
        !payload.revoked ||
        !hasCanonicalPatientShareContract(
          payload.share,
          variables.patientId,
        ) ||
        payload.share.id !== variables.share.id ||
        payload.share.status !== "revoked" ||
        payload.share.active !== false ||
        !payload.share.audit.revokedAt
      ) {
        setRevokeError(
          "Backend chưa xác nhận đầy đủ quyền truy cập đã được thu hồi.",
        );
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: [
          "portal",
          "patient-shares",
          variables.operationWorkspaceId,
          variables.patientId,
        ],
      });
      toast.success("Backend đã xác nhận thu hồi quyền truy cập.");
      setRevokeIntent(null);
      setRevokeError("");
    },
    onError: (error, variables) => {
      if (
        activeWorkspaceRef.current !== variables.operationWorkspaceId ||
        operationEpochRef.current !== variables.operationEpoch
      ) {
        return;
      }
      setRevokeError(
        errorMessage(error, "Không thể thu hồi quyền truy cập dữ liệu."),
      );
    },
  });

  const submitShare = () => {
    setCreateError("");
    if (isOffline()) {
      setCreateError(
        "Thiết bị đang ngoại tuyến. Vui lòng kết nối mạng rồi thử lại.",
      );
      return;
    }
    if (!patientId) {
      setCreateError("Vui lòng chọn hồ sơ bệnh nhân.");
      return;
    }
    if (!targetId) {
      setCreateError(
        targetType === "doctor"
          ? "Vui lòng chọn bác sĩ nhận quyền trực tiếp."
          : "Vui lòng chọn workspace nhận phân công hành chính.",
      );
      return;
    }
    if (scope === "selected_scans" && selectedScanIds.length === 0) {
      setCreateError("Vui lòng chọn ít nhất một lượt đo.");
      return;
    }
    const expiration = expiresAt ? new Date(expiresAt) : null;
    if (
      expiration &&
      (Number.isNaN(expiration.getTime()) || expiration.getTime() <= Date.now())
    ) {
      setCreateError("Thời hạn phải là một thời điểm hợp lệ trong tương lai.");
      return;
    }

    const payload: CreatePatientSharePayload = {
      ...(targetType === "doctor"
        ? { doctorUserId: targetId }
        : { organizationId: targetId }),
      scope,
      ...(scope === "selected_scans" ? { scanIds: selectedScanIds } : {}),
      ...(expiration ? { expiresAt: expiration.toISOString() } : {}),
    };
    createMutation.mutate({
      selectedPatientId: patientId,
      payload,
      idempotencyKey: createIntentKey,
      operationWorkspaceId: workspaceId,
      operationEpoch: operationEpochRef.current,
    });
  };

  if (!canManageSharing) {
    return <PermissionState />;
  }

  if (patientsQuery.isLoading || workspaceChanging) {
    return <ConsentLoading />;
  }

  if (isPermissionError(patientsQuery.error)) {
    return <PermissionState />;
  }

  if (patientsQuery.error && !patientsQuery.data) {
    return (
      <ConsentError
        error={patientsQuery.error}
        retry={() => void patientsQuery.refetch()}
      />
    );
  }

  const patients = patientsQuery.data?.patients || [];
  const patientsRefreshError = patientsQuery.data
    ? patientsQuery.error
    : null;
  const targetsRefreshError = targetsQuery.data ? targetsQuery.error : null;
  const sharesRefreshError = sharesQuery.data ? sharesQuery.error : null;
  const canMutateLedger = online && !sharesRefreshError;

  return (
    <div
      className="space-y-6"
      data-testid="portal-consent"
      data-workspace-id={workspaceId}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Kiểm soát dữ liệu sức khỏe
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <ShieldCheck aria-hidden="true" size={24} />
            Quyền truy cập dữ liệu
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Cấp đúng người nhận, đúng phạm vi và đúng thời hạn. Loại thẩm quyền
            và trạng thái luôn lấy từ backend; Portal không tự suy diễn consent.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            void patientsQuery.refetch();
            void targetsQuery.refetch();
            if (patientId) void sharesQuery.refetch();
          }}
        >
          <RefreshCw aria-hidden="true" />
          Làm mới
        </Button>
      </header>

      {!online ? (
        <OfflineState hasCachedData={Boolean(patients.length)} />
      ) : null}

      {patientsRefreshError ? (
        <ConsentRefreshWarning
          title="Không thể làm mới danh sách hồ sơ"
          retry={() => void patientsQuery.refetch()}
        />
      ) : null}

      <section
        aria-label="Phân biệt loại quyền"
        className="grid gap-4 lg:grid-cols-2"
      >
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Stethoscope aria-hidden="true" size={20} />
              </span>
              <div>
                <CardTitle className="text-base">Truy cập trực tiếp</CardTitle>
                <CardDescription>
                  Bác sĩ cụ thể nhận đúng phạm vi hồ sơ.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Backend quyết định đây là consent của bệnh nhân hay quyền truy cập
            lâm sàng dựa trên actor đã xác thực.
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[var(--clinical-info)]/10 text-[var(--clinical-info)]">
                <Building2 aria-hidden="true" size={20} />
              </span>
              <div>
                <CardTitle className="text-base">
                  Phân công hành chính
                </CardTitle>
                <CardDescription>
                  Workspace nhận quyền điều phối theo nghiệp vụ.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Phân công workspace không được hiển thị như consent của bệnh nhân và
            luôn có dấu vết cấp, thu hồi từ backend.
          </CardContent>
        </Card>
      </section>

      <section
        aria-label="Tổng quan quyền truy cập"
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          { label: "Hồ sơ có thể quản lý", value: patients.length },
          { label: "Người nhận khả dụng", value: targetOptions.length },
          { label: "Đang hiệu lực", value: activeShareCount },
        ].map((item) => (
          <Card key={item.label} className="shadow-sm">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound aria-hidden="true" />
            Cấp quyền truy cập
          </CardTitle>
          <CardDescription>
            Backend sẽ kiểm tra actor, tenant, người nhận, phạm vi và ghi audit
            trong cùng mutation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="share-patient-id">Hồ sơ bệnh nhân</Label>
              <select
                id="share-patient-id"
                name="sharePatientId"
                value={patientId}
                onChange={(event) => {
                  setPatientId(event.target.value);
                  setTargetId("");
                  setSelectedScanIds([]);
                  rotateCreateIntent();
                }}
                className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Chọn hồ sơ bệnh nhân</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name || patient.patientCode || patient.id}
                  </option>
                ))}
              </select>
              {!patients.length ? (
                <p className="text-sm text-muted-foreground">
                  Workspace hiện tại chưa có hồ sơ mà bạn được phép quản lý.
                </p>
              ) : null}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">
                Cách cấp quyền
              </legend>
              <RadioGroup
                value={targetType}
                onValueChange={(value) => {
                  setTargetType(value as TargetType);
                  setTargetId("");
                  rotateCreateIntent();
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <Label
                  htmlFor="share-target-doctor"
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/30"
                >
                  <RadioGroupItem id="share-target-doctor" value="doctor" />
                  <span>
                    <span className="block font-medium text-foreground">
                      Bác sĩ cụ thể
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Truy cập trực tiếp
                    </span>
                  </span>
                </Label>
                <Label
                  htmlFor="share-target-workspace"
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/30"
                >
                  <RadioGroupItem
                    id="share-target-workspace"
                    value="workspace"
                  />
                  <span>
                    <span className="block font-medium text-foreground">
                      Workspace
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Phân công hành chính
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            </fieldset>
          </div>

          {targetsRefreshError ? (
            <ConsentRefreshWarning
              compact
              title="Không thể làm mới danh sách người nhận"
              retry={() => void targetsQuery.refetch()}
            />
          ) : null}

          {targetsQuery.isLoading ? (
            <div className="space-y-2" aria-label="Đang tải người nhận">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : isPermissionError(targetsQuery.error) ? (
            <InlinePermissionState />
          ) : targetsQuery.error && !targetsQuery.data ? (
            <ConsentError
              compact
              error={targetsQuery.error}
              retry={() => void targetsQuery.refetch()}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="share-target-id">
                  {targetType === "doctor"
                    ? "Bác sĩ nhận quyền"
                    : "Workspace nhận phân công"}
                </Label>
                <select
                  id="share-target-id"
                  name="shareTargetId"
                  value={targetId}
                  onChange={(event) => {
                    setTargetId(event.target.value);
                    rotateCreateIntent();
                  }}
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">
                    {targetType === "doctor" ? "Chọn bác sĩ" : "Chọn workspace"}
                  </option>
                  {targetOptions.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name || target.email || target.id}
                    </option>
                  ))}
                </select>
                {!targetOptions.length ? (
                  <p className="text-sm text-muted-foreground">
                    Backend chưa trả về người nhận phù hợp trong phạm vi của
                    bạn.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="share-scope">Phạm vi dữ liệu</Label>
                <select
                  id="share-scope"
                  name="shareScope"
                  value={scope}
                  onChange={(event) => {
                    setScope(event.target.value as ShareScope);
                    setSelectedScanIds([]);
                    rotateCreateIntent();
                  }}
                  className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="patient_profile">
                    Toàn bộ hồ sơ bệnh nhân
                  </option>
                  <option value="selected_scans">
                    Chỉ các lượt đo được chọn
                  </option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="share-expires-at">
                  Thời hạn (không bắt buộc)
                </Label>
                <Input
                  id="share-expires-at"
                  name="shareExpiresAt"
                  type="datetime-local"
                  value={expiresAt}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(event) => {
                    setExpiresAt(event.target.value);
                    rotateCreateIntent();
                  }}
                  className="min-h-11"
                />
              </div>
            </div>
          )}

          {scope === "selected_scans" ? (
            <section
              className="rounded-xl border bg-muted/10 p-4"
              aria-labelledby="share-scan-heading"
              data-share-scan-scope
            >
              <div className="flex items-center gap-2">
                <FileText
                  aria-hidden="true"
                  className="text-primary"
                  size={18}
                />
                <h2
                  id="share-scan-heading"
                  className="font-medium text-foreground"
                >
                  Lượt đo được phép truy cập
                </h2>
              </div>
              {!patientId ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Chọn hồ sơ bệnh nhân trước khi chọn lượt đo.
                </p>
              ) : scansQuery.isLoading ? (
                <div
                  className="mt-4 grid gap-2 sm:grid-cols-2"
                  aria-label="Đang tải lượt đo"
                >
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              ) : scansQuery.error ? (
                isPermissionError(scansQuery.error) ? (
                  <div className="mt-4">
                    <InlinePermissionState />
                  </div>
                ) : (
                  <div className="mt-4">
                    <ConsentError
                      compact
                      error={scansQuery.error}
                      retry={() => void scansQuery.refetch()}
                    />
                  </div>
                )
              ) : !scansQuery.data?.scans.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Hồ sơ này chưa có lượt đo khả dụng để cấp riêng lẻ.
                </p>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {scansQuery.data.scans.map((scan) => {
                    const checked = selectedScanIds.includes(scan.id);
                    return (
                      <Label
                        key={scan.id}
                        htmlFor={`share-scan-${scan.id}`}
                        className="flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 font-normal hover:bg-muted/30"
                      >
                        <Checkbox
                          id={`share-scan-${scan.id}`}
                          data-share-scan={scan.id}
                          checked={checked}
                          onCheckedChange={(next) => {
                            setSelectedScanIds((current) =>
                              next === true
                                ? [...new Set([...current, scan.id])]
                                : current.filter((id) => id !== scan.id),
                            );
                            rotateCreateIntent();
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {scan.aiLabel || scan.status || scan.id}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDateTime(
                              scan.createdAt || scan.startedAt,
                              "Chưa có thời gian",
                            )}
                          </span>
                        </span>
                      </Label>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {createError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={17}
              />
              <span>{createError}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="max-w-2xl text-xs text-muted-foreground">
              Nút chỉ báo thành công sau khi backend trả về bản ghi quyền truy
              cập có mã định danh.
            </p>
            <Button
              id="share-create-submit"
              type="button"
              className="min-h-11"
              disabled={
                !online ||
                !patientId ||
                !targetId ||
                targetsQuery.isLoading ||
                Boolean(targetsQuery.error) ||
                createMutation.isPending
              }
              onClick={submitShare}
            >
              {createMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <ShieldCheck aria-hidden="true" />
              )}
              {createMutation.isPending
                ? "Backend đang xử lý..."
                : "Cấp quyền truy cập"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section aria-labelledby="patient-share-ledger-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="patient-share-ledger-heading"
              className="text-lg font-semibold text-foreground"
            >
              Sổ quyền truy cập
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Bao gồm cả quyền đang hiệu lực, hết hạn và đã thu hồi do backend
              trả về.
            </p>
          </div>
          {patientId ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => void sharesQuery.refetch()}
              disabled={sharesQuery.isFetching}
            >
              {sharesQuery.isFetching ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              Cập nhật sổ quyền
            </Button>
          ) : null}
        </div>

        {sharesRefreshError ? (
          <ConsentRefreshWarning
            compact
            title="Không thể làm mới sổ quyền truy cập"
            retry={() => void sharesQuery.refetch()}
          />
        ) : null}

        {!patientId ? (
          <ConsentEmpty
            icon={FileCheck2}
            title="Chọn hồ sơ để xem quyền truy cập"
            description="Sổ quyền được tải riêng theo hồ sơ, không trộn dữ liệu giữa các bệnh nhân."
          />
        ) : sharesQuery.isLoading ? (
          <ShareLedgerLoading />
        ) : isPermissionError(sharesQuery.error) ? (
          <PermissionState compact />
        ) : sharesQuery.error && !sharesQuery.data ? (
          <ConsentError
            error={sharesQuery.error}
            retry={() => void sharesQuery.refetch()}
          />
        ) : invalidShareContract ? (
          <ConsentError
            error={new Error(
              "Backend trả về sổ quyền truy cập thiếu authority, lifecycle, recipient hoặc audit.",
            )}
            retry={() => void sharesQuery.refetch()}
          />
        ) : !shares.length ? (
          <ConsentEmpty
            icon={KeyRound}
            title="Chưa có quyền truy cập nào"
            description="Backend chưa ghi nhận quyền truy cập hoặc phân công nào cho hồ sơ này."
          />
        ) : (
          <>
            <div className="grid gap-4 md:hidden">
              {shares.map((share) => (
                <MobileShareCard
                  key={share.id}
                  share={share}
                  online={canMutateLedger}
                  revokePending={revokeMutation.isPending}
                  onRevoke={() => {
                    setRevokeError("");
                    setRevokeIntent({
                      share,
                      patientId,
                      key: createShareIntentKey("revoke", share.id),
                    });
                  }}
                />
              ))}
            </div>
            <Card className="hidden overflow-hidden shadow-sm md:block">
              <div
                role="region"
                aria-label="Sổ quyền truy cập dữ liệu"
                tabIndex={0}
                className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <table className="w-full min-w-[1120px] text-sm">
                  <thead className="border-b bg-muted/30 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Người nhận</th>
                      <th className="px-4 py-3">Loại quyền</th>
                      <th className="px-4 py-3">Phạm vi & thời hạn</th>
                      <th className="px-4 py-3">Dấu vết audit</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shares.map((share) => {
                      const recipient = recipientDetails(share);
                      const audit = auditDetails(share);
                      return (
                        <tr
                          key={share.id}
                          data-share-row={share.id}
                          className="align-top transition-colors hover:bg-muted/20"
                        >
                          <td className="px-4 py-4">
                            <p className="font-medium text-foreground">
                              {recipient.name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {recipientTypeLabel(recipient.type)}
                              {recipient.id ? ` · ${recipient.id}` : ""}
                            </p>
                            {recipient.workspaceId ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Workspace: {recipient.workspaceId}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <Badge
                              variant="outline"
                              className={authorityClass(share.authorityType)}
                            >
                              {authorityLabel(share.authorityType)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4">
                            <p className="text-foreground">
                              {scopeLabel(
                                share.scope,
                                share.scanIds?.length || 0,
                              )}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock3 aria-hidden="true" size={13} />
                              {formatDateTime(share.expiresAt)}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground">
                            <p>
                              Cấp:{" "}
                              {formatDateTime(
                                audit.grantedAt,
                                "Chưa có thời gian",
                              )}
                            </p>
                            <p className="mt-1">
                              Actor: {audit.grantedBy || "Chưa có metadata"}
                              {audit.grantedByRole
                                ? ` · ${audit.grantedByRole}`
                                : ""}
                            </p>
                            {share.authorityType === "patient_consent" &&
                            audit.consentedAt ? (
                              <p className="mt-1">
                                Consent: {formatDateTime(audit.consentedAt)}
                              </p>
                            ) : null}
                            {audit.revokedAt ? (
                              <p className="mt-1">
                                Thu hồi:{" "}
                                {formatDateTime(
                                  audit.revokedAt,
                                  "Chưa có thời gian",
                                )}
                                {audit.revokedBy ? ` · ${audit.revokedBy}` : ""}
                                {audit.revokedByRole
                                  ? ` (${audit.revokedByRole})`
                                  : ""}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4">
                            <Badge
                              variant="outline"
                              className={statusClass(share.status)}
                            >
                              {statusLabel(share.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {share.status === "active" ? (
                              <Button
                                data-share-revoke={share.id}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="min-h-11 text-destructive hover:text-destructive"
                                disabled={
                                  !canMutateLedger ||
                                  revokeMutation.isPending
                                }
                                onClick={() => {
                                  setRevokeError("");
                                  setRevokeIntent({
                                    share,
                                    patientId,
                                    key: createShareIntentKey(
                                      "revoke",
                                      share.id,
                                    ),
                                  });
                                }}
                              >
                                <Trash2 aria-hidden="true" />
                                Thu hồi
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Không còn hiệu lực
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </section>

      <AlertDialog
        open={Boolean(revokeIntent)}
        onOpenChange={(open) => {
          if (!open && !revokeMutation.isPending) {
            setRevokeIntent(null);
            setRevokeError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Thu hồi quyền truy cập?</AlertDialogTitle>
            <AlertDialogDescription>
              Backend sẽ đóng quyền của{" "}
              {revokeIntent
                ? recipientDetails(revokeIntent.share).name
                : "người nhận"}{" "}
              và ghi actor, thời gian thu hồi vào audit. Thao tác này không xóa
              lịch sử.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={17}
              />
              <span>{revokeError}</span>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>
              Giữ quyền
            </AlertDialogCancel>
            <AlertDialogAction
              data-share-revoke-confirm
              disabled={
                !canMutateLedger ||
                revokeMutation.isPending ||
                !revokeIntent
              }
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (revokeIntent) {
                  revokeMutation.mutate({
                    ...revokeIntent,
                    operationWorkspaceId: workspaceId,
                    operationEpoch: operationEpochRef.current,
                  });
                }
              }}
            >
              {revokeMutation.isPending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {revokeMutation.isPending
                ? "Backend đang thu hồi..."
                : "Xác nhận thu hồi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
function MobileShareCard({
  share,
  online,
  revokePending,
  onRevoke,
}: {
  share: PatientShare;
  online: boolean;
  revokePending: boolean;
  onRevoke: () => void;
}) {
  const recipient = recipientDetails(share);
  const audit = auditDetails(share);
  return (
    <Card data-share-row={share.id} className="shadow-sm">
      <CardHeader className="gap-3 p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              {recipient.name}
            </CardTitle>
            <CardDescription className="mt-1 truncate">
              {recipientTypeLabel(recipient.type)}
              {recipient.id ? ` · ${recipient.id}` : ""}
            </CardDescription>
          </div>
          <Badge variant="outline" className={statusClass(share.status)}>
            {statusLabel(share.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-2">
        <Badge
          variant="outline"
          className={authorityClass(share.authorityType)}
        >
          {authorityLabel(share.authorityType)}
        </Badge>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Phạm vi</dt>
            <dd className="mt-1 text-foreground">
              {scopeLabel(share.scope, share.scanIds?.length || 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Thời hạn</dt>
            <dd className="mt-1 text-foreground">
              {formatDateTime(share.expiresAt)}
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <History aria-hidden="true" size={13} />
              Audit
            </dt>
            <dd className="mt-1 text-foreground">
              Cấp {formatDateTime(audit.grantedAt, "chưa có thời gian")}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              Actor: {audit.grantedBy || "Chưa có metadata"}
              {audit.grantedByRole ? ` · ${audit.grantedByRole}` : ""}
            </dd>
            {share.authorityType === "patient_consent" && audit.consentedAt ? (
              <dd className="mt-1 text-xs text-muted-foreground">
                Consent {formatDateTime(audit.consentedAt, "chưa có thời gian")}
              </dd>
            ) : null}
            {audit.revokedAt ? (
              <dd className="mt-1 text-xs text-muted-foreground">
                Thu hồi {formatDateTime(audit.revokedAt, "chưa có thời gian")}
                {audit.revokedBy ? ` · ${audit.revokedBy}` : ""}
                {audit.revokedByRole ? ` (${audit.revokedByRole})` : ""}
              </dd>
            ) : null}
          </div>
        </dl>
        {share.status === "active" ? (
          <Button
            data-share-revoke={share.id}
            type="button"
            variant="outline"
            className="min-h-11 w-full text-destructive hover:text-destructive"
            disabled={!online || revokePending}
            onClick={onRevoke}
          >
            <Trash2 aria-hidden="true" />
            Thu hồi quyền
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConsentLoading() {
  return (
    <div className="space-y-5" aria-label="Đang tải quyền truy cập">
      <div className="space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-9 w-80 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

function ShareLedgerLoading() {
  return (
    <div
      className="grid gap-4 md:grid-cols-2"
      aria-label="Đang tải sổ quyền truy cập"
    >
      <Skeleton className="h-48" />
      <Skeleton className="h-48" />
    </div>
  );
}

function ConsentError({
  error,
  retry,
  compact = false,
}: {
  error: unknown;
  retry?: () => void;
  compact?: boolean;
}) {
  return (
    <Card
      className="border-destructive/30 bg-destructive/5 shadow-sm"
      role="alert"
    >
      <CardContent
        className={`flex flex-wrap items-center gap-3 ${compact ? "p-4" : "p-6"}`}
      >
        <AlertCircle aria-hidden="true" className="shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            Không thể tải dữ liệu quyền truy cập
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {errorMessage(error, "Backend không phản hồi. Vui lòng thử lại.")}
          </p>
        </div>
        {retry ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={retry}
          >
            <RefreshCw aria-hidden="true" />
            Thử lại
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PermissionState({ compact = false }: { compact?: boolean }) {
  return (
    <Card
      className="border-[var(--clinical-warning)]/30 bg-[var(--clinical-warning)]/5 shadow-sm"
      role="alert"
    >
      <CardContent
        className={`flex items-start gap-3 ${compact ? "p-4" : "p-6"}`}
      >
        <ShieldAlert
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--clinical-warning)]"
        />
        <div>
          <p className="font-medium text-foreground">
            Không có quyền quản lý truy cập dữ liệu
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tài khoản cần quyền quản lý bệnh nhân của workspace, quyền quản lý
            bệnh nhân cấp nền tảng hoặc quyền chia sẻ hồ sơ cá nhân. Backend vẫn
            là nơi quyết định cuối cùng.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function InlinePermissionState() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-[var(--clinical-warning)]/30 bg-[var(--clinical-warning)]/5 p-4 text-sm"
    >
      <ShieldAlert
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[var(--clinical-warning)]"
        size={18}
      />
      <div>
        <p className="font-medium text-foreground">
          Backend từ chối phạm vi này
        </p>
        <p className="mt-1 text-muted-foreground">
          Kiểm tra workspace hiện tại và quyền được cấp cho tài khoản rồi thử
          lại.
        </p>
      </div>
    </div>
  );
}

function ConsentRefreshWarning({
  title,
  retry,
  compact = false,
}: {
  title: string;
  retry: () => void;
  compact?: boolean;
}) {
  return (
    <Card
      className="border-[var(--clinical-warning)]/30 bg-[var(--clinical-warning)]/5 shadow-sm"
      role="status"
    >
      <CardContent
        className={`flex flex-wrap items-center gap-3 ${compact ? "p-4" : "p-5"}`}
      >
        <AlertCircle
          aria-hidden="true"
          className="shrink-0 text-[var(--clinical-warning)]"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Dữ liệu đang hiển thị là snapshot đã tải và có thể đã cũ. Các
            mutation liên quan được khóa cho đến khi backend xác nhận lại.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={retry}
        >
          <RefreshCw aria-hidden="true" />
          Thử lại
        </Button>
      </CardContent>
    </Card>
  );
}

function OfflineState({ hasCachedData }: { hasCachedData: boolean }) {
  return (
    <Card
      role="status"
      className="border-[var(--clinical-warning)]/30 bg-[var(--clinical-warning)]/5 shadow-sm"
    >
      <CardContent className="flex items-start gap-3 p-4">
        <WifiOff
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--clinical-warning)]"
        />
        <div>
          <p className="font-medium text-foreground">Đang ngoại tuyến</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasCachedData
              ? "Dữ liệu đã tải có thể đã cũ. Cấp và thu hồi quyền được khóa cho đến khi có mạng."
              : "Chưa có dữ liệu đã tải. Hãy kết nối mạng để lấy quyền truy cập từ backend."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsentEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof KeyRound;
  title: string;
  description: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col items-center px-5 py-12 text-center">
        <Icon aria-hidden="true" className="text-muted-foreground" size={28} />
        <p className="mt-3 font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
