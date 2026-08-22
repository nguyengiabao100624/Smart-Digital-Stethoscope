import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle,
  FileText,
  Mail,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Stethoscope,
  UserRoundCheck,
  XCircle,
  Filter,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import {
  smartHealthApi,
  type SmartHealthAuthUser,
  type SmartHealthClinic,
} from "@/lib/smart-health-api";
import { PageHeader, StatusBadge, Timeline } from "./design-system";
import { itemMotion, listMotion } from "./motion-presets";
import { PaginationFooter } from "./PaginationFooter";
import { ADMIN_TABLE_PAGE_SIZE, paginateItems } from "./pagination-utils";
import { CapabilityGate } from "./AdminAccessContext";
import {
  DetailDrawer,
  DetailDrawerClose,
  DetailDrawerDescription,
  DetailDrawerTitle,
} from "./DetailDrawer";
import { useAdminAccess } from "./useAdminAccess";
import { DOCTOR_REQUEST_MANAGE_CAPABILITIES } from "./action-permissions";

type RequestStatus = "pending" | "needs_info" | "approved" | "rejected";

type DoctorRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  clinic: string;
  requestType: string;
  specialty: string;
  date: string;
  status: RequestStatus;
  verification: "Đã xác minh CCHN" | "Cần đối chiếu" | "Thiếu hồ sơ";
  license: string;
  reason: string;
  uid: string;
  lastLogin: string;
  requestedAt?: string;
  organizationId?: string;
  requiredFields?: string[];
  workspaceType?: string;
  accountType?: string;
};

const TABS: Array<{ value: RequestStatus; label: string }> = [
  { value: "pending", label: "Chờ duyệt" },
  { value: "needs_info", label: "Cần bổ sung" },
  { value: "approved", label: "Đã duyệt" },
  { value: "rejected", label: "Từ chối" },
];

function getStatusBadge(status: RequestStatus) {
  if (status === "approved") return <StatusBadge label="Đã duyệt" tone="success" />;
  if (status === "rejected") return <StatusBadge label="Từ chối" tone="error" />;
  if (status === "needs_info") return <StatusBadge label="Cần bổ sung" tone="warning" />;
  return <StatusBadge label="Chờ duyệt" tone="warning" />;
}

function getVerificationTone(verification: DoctorRequest["verification"]) {
  if (verification === "Đã xác minh CCHN") return "success" as const;
  if (verification === "Cần đối chiếu") return "warning" as const;
  return "error" as const;
}

function normalizeRequestStatus(user: SmartHealthAuthUser): RequestStatus {
  const status = user.status || user.roleRequestStatus;
  if (status === "approved" || status === "rejected" || status === "needs_info") {
    return status;
  }
  return "pending";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "Chưa ghi nhận";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function matchesDateFilter(value: string | undefined, filter: string) {
  if (filter === "all") {
    return true;
  }

  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const now = new Date();
  if (filter === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return date.getTime() >= startOfToday;
  }

  if (filter === "week") {
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return date.getTime() >= sevenDaysAgo;
  }

  return true;
}

function getDoctorWorkspaceType(user: SmartHealthAuthUser, clinic?: SmartHealthClinic) {
  return (
    user.workspaceType ||
    user.workspace?.workspaceType ||
    user.workspace?.type ||
    clinic?.workspaceType ||
    clinic?.type ||
    ""
  );
}

function getDoctorRequestTypeLabel(accountType?: string, workspaceType?: string) {
  if (accountType === "solo_doctor" || workspaceType === "solo_practice") {
    return "Bác sĩ tư";
  }
  if (accountType === "doctor" || workspaceType === "clinic" || workspaceType === "hospital") {
    return "Bác sĩ cơ sở";
  }
  return "Bác sĩ";
}

function toDoctorRequest(
  user: SmartHealthAuthUser,
  clinicMap: Map<string, SmartHealthClinic> = new Map(),
): DoctorRequest {
  const hasLicense = Boolean(user.license?.trim());
  const clinic = user.organizationId ? clinicMap.get(user.organizationId) : undefined;
  const requestedAt = user.requestedAt || user.roleRequestedAt || user.createdAt;
  const status = normalizeRequestStatus(user);
  const workspaceType = getDoctorWorkspaceType(user, clinic);
  const accountType =
    user.accountType ||
    (workspaceType === "solo_practice"
      ? "solo_doctor"
      : user.requestedRole === "doctor"
        ? "doctor"
        : "");
  return {
    id: user.id,
    name: user.name || user.email || "Bác sĩ chưa cập nhật tên",
    email: user.email || "Chưa có email",
    phone: user.phone || "Chưa cung cấp",
    clinic:
      user.clinicName || user.hospital || user.clinicSuggestion || clinic?.name || "Chưa xác định",
    requestType: getDoctorRequestTypeLabel(accountType, workspaceType),
    specialty: user.specialty || user.department || "Chưa cung cấp",
    date: formatDateTime(requestedAt),
    status,
    verification:
      status === "needs_info" ? "Cần đối chiếu" : hasLicense ? "Đã xác minh CCHN" : "Thiếu hồ sơ",
    license: user.license || "Chưa cung cấp",
    reason:
      user.registrationReason?.trim() ||
      user.rejectReason ||
      user.roleRejectReason ||
      user.roleInfoRequestMessage ||
      "Bác sĩ đăng ký quyền truy cập từ ứng dụng Android sau khi xác thực email Firebase.",
    uid: user.firebaseUid || user.id,
    lastLogin: formatDateTime(user.updatedAt),
    requestedAt,
    organizationId: user.organizationId,
    requiredFields: user.roleInfoRequiredFields || [],
    workspaceType,
    accountType,
  };
}

export function DoctorApproval() {
  const { hasAnyCapability } = useAdminAccess();
  const canManageDoctorRequests = hasAnyCapability(DOCTOR_REQUEST_MANAGE_CAPABILITIES);
  const [selectedDoc, setSelectedDoc] = useState<DoctorRequest | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [infoFields, setInfoFields] = useState<string[]>([]);
  const [approveOrganizationId, setApproveOrganizationId] = useState("");
  const [clinics, setClinics] = useState<SmartHealthClinic[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [clinicFilter, setClinicFilter] = useState("all");
  const [verificationFilter, setVerificationFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [doctorRequests, setDoctorRequests] = useState<DoctorRequest[]>([]);
  const [activeRequestTab, setActiveRequestTab] = useState<RequestStatus>("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [requestPages, setRequestPages] = useState<Record<RequestStatus, number>>({
    pending: 1,
    needs_info: 1,
    approved: 1,
    rejected: 1,
  });

  const loadDoctorRequests = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [requestsResponse, clinicsResponse] = await Promise.all([
        smartHealthApi.listDoctorRoleRequests(),
        smartHealthApi.listCatalogClinics(),
      ]);
      setClinics(clinicsResponse.clinics);
      const clinicMap = new Map(clinicsResponse.clinics.map((clinic) => [clinic.id, clinic]));
      setDoctorRequests(requestsResponse.requests.map((user) => toDoctorRequest(user, clinicMap)));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể tải danh sách duyệt bác sĩ.";
      setLoadError(message);
      setDoctorRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDoctorRequests();
  }, [loadDoctorRequests]);

  useEffect(() => {
    const matchedClinic = selectedDoc?.clinic
      ? clinics.find((clinic) => clinic.name === selectedDoc.clinic)
      : undefined;
    setApproveOrganizationId(selectedDoc?.organizationId || matchedClinic?.id || "");
    setInfoFields(selectedDoc?.requiredFields || []);
  }, [selectedDoc, clinics]);

  const filteredDoctorRequests = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const verificationMap: Record<string, DoctorRequest["verification"]> = {
      verified: "Đã xác minh CCHN",
      review: "Cần đối chiếu",
      missing: "Thiếu hồ sơ",
    };

    return doctorRequests.filter((item) => {
      const haystack = [
        item.name,
        item.email,
        item.phone,
        item.uid,
        item.clinic,
        item.specialty,
        item.license,
      ]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !keyword || haystack.includes(keyword);
      const matchesClinic =
        clinicFilter === "all" ||
        item.organizationId === clinicFilter ||
        item.clinic.toLowerCase().includes(clinicFilter.toLowerCase());
      const expectedVerification = verificationMap[verificationFilter];
      const matchesVerification =
        verificationFilter === "all" || item.verification === expectedVerification;
      const matchesDate = matchesDateFilter(item.requestedAt, dateFilter);
      return matchesSearch && matchesClinic && matchesVerification && matchesDate;
    });
  }, [clinicFilter, dateFilter, doctorRequests, searchTerm, verificationFilter]);

  const counts = useMemo(
    () =>
      TABS.reduce(
        (acc, tab) => ({
          ...acc,
          [tab.value]: filteredDoctorRequests.filter((item) => item.status === tab.value).length,
        }),
        {} as Record<RequestStatus, number>,
      ),
    [filteredDoctorRequests],
  );

  useEffect(() => {
    setRequestPages({
      pending: 1,
      needs_info: 1,
      approved: 1,
      rejected: 1,
    });
  }, [dateFilter, filteredDoctorRequests.length, searchTerm, clinicFilter, verificationFilter]);

  const handleApproveRequest = async () => {
    if (!selectedDoc) return;
    if (!canManageDoctorRequests) {
      toast.error("Tài khoản không có quyền duyệt bác sĩ.");
      return;
    }

    const organizationId = approveOrganizationId || selectedDoc.organizationId;
    if (!organizationId) {
      toast.error("Vui lòng chọn tổ chức/phòng khám trước khi phê duyệt.");
      return;
    }

    setActionLoading(true);
    try {
      await smartHealthApi.approveDoctorRoleRequest(selectedDoc.id, {
        organizationId,
        role: "doctor",
      });
      toast.success("Đã phê duyệt tài khoản. Bác sĩ cần đăng nhập lại để nhận quyền mới.");
      setApproveOpen(false);
      setSelectedDoc(null);
      await loadDoctorRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể xử lý yêu cầu bác sĩ.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedDoc) return;
    if (!canManageDoctorRequests) {
      toast.error("Tai khoan khong co quyen duyet bac si.");
      return;
    }

    setActionLoading(true);
    try {
      await smartHealthApi.rejectDoctorRoleRequest(selectedDoc.id, rejectReason.trim());
      toast.success("Đã từ chối yêu cầu và ghi nhận lý do vào audit log.");
      setRejectOpen(false);
      setSelectedDoc(null);
      setRejectReason("");
      await loadDoctorRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể xử lý yêu cầu bác sĩ.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestMoreInfo = async () => {
    if (!selectedDoc) return;
    if (!canManageDoctorRequests) {
      toast.error("Tai khoan khong co quyen duyet bac si.");
      return;
    }

    setActionLoading(true);
    try {
      const response = await smartHealthApi.requestDoctorRoleMoreInfo(
        selectedDoc.id,
        infoMessage.trim(),
        infoFields,
      );
      const clinicMap = new Map(clinics.map((clinic) => [clinic.id, clinic]));
      const updatedRequest = toDoctorRequest(response.request, clinicMap);
      setDoctorRequests((current) =>
        current.map((request) => (request.id === updatedRequest.id ? updatedRequest : request)),
      );
      setRequestPages((current) => ({ ...current, needs_info: 1 }));
      setActiveRequestTab("needs_info");
      toast.success("Đã gửi yêu cầu bổ sung thông tin đến bác sĩ.");
      setInfoOpen(false);
      setSelectedDoc(null);
      setInfoMessage("");
      setInfoFields([]);
      await loadDoctorRequests();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không thể gửi yêu cầu bổ sung thông tin.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const renderTable = (status: RequestStatus) => {
    const rows = filteredDoctorRequests.filter((doc) => doc.status === status);
    const page = requestPages[status] || 1;
    const pagedRows = paginateItems(rows, page, ADMIN_TABLE_PAGE_SIZE);

    return (
      <motion.div
        variants={listMotion}
        initial="hidden"
        animate="show"
        className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
      >
        <div
          className="overflow-x-auto scrollbar-subtle"
          tabIndex={0}
          aria-label="Bảng yêu cầu duyệt bác sĩ"
        >
          <table className="data-table w-full whitespace-nowrap text-left text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3">Họ tên</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Số điện thoại</th>
                <th className="px-5 py-3">Loại</th>
                <th className="px-5 py-3">Phòng khám/cơ sở</th>
                <th className="px-5 py-3">Chuyên khoa</th>
                <th className="px-5 py-3">Ngày gửi</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="sticky right-0 bg-muted px-5 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pagedRows.map((doc) => (
                <motion.tr key={doc.id} variants={itemMotion}>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setSelectedDoc(doc)}
                      className="text-left font-semibold text-foreground hover:text-primary"
                    >
                      {doc.name}
                    </button>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{doc.id}</div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{doc.email}</td>
                  <td className="px-5 py-4 text-muted-foreground">{doc.phone}</td>
                  <td className="px-5 py-4">{doc.requestType}</td>
                  <td className="max-w-[260px] truncate px-5 py-4">{doc.clinic}</td>
                  <td className="px-5 py-4">{doc.specialty}</td>
                  <td className="px-5 py-4 text-muted-foreground">{doc.date}</td>
                  <td className="px-5 py-4">{getStatusBadge(doc.status)}</td>
                  <td className="sticky right-0 bg-card px-5 py-4 text-right shadow-[-12px_0_16px_-18px_rgba(15,23,42,0.45)]">
                    <button
                      onClick={() => setSelectedDoc(doc)}
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                    >
                      {doc.status === "pending" || doc.status === "needs_info"
                        ? "Xem xét"
                        : "Xem chi tiết"}
                    </button>
                  </td>
                </motion.tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {isLoading
                      ? "Đang tải yêu cầu duyệt bác sĩ..."
                      : loadError || "Chưa có yêu cầu duyệt bác sĩ trong trạng thái này."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationFooter
          page={page}
          totalItems={rows.length}
          itemLabel="yêu cầu"
          onPageChange={(nextPage) =>
            setRequestPages((current) => ({ ...current, [status]: nextPage }))
          }
        />
      </motion.div>
    );
  };

  return (
    <div className="relative flex h-full flex-col space-y-6">
      <PageHeader
        eyebrow="Quản trị quyền truy cập"
        title="Duyệt tài khoản bác sĩ"
        description="Xác minh hồ sơ bác sĩ, cấp quyền phòng khám và ghi lại toàn bộ quyết định vào audit log."
      />

      <Tabs.Root
        value={activeRequestTab}
        onValueChange={(value) => setActiveRequestTab(value as RequestStatus)}
        className="flex flex-1 flex-col"
      >
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <Tabs.List className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {tab.label}
                  <span className="ml-2 rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground data-[state=active]:text-foreground">
                    {counts[tab.value]}
                  </span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Tìm tên, email, UID..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>
              <Popover.Root>
                <Popover.Trigger asChild>
                  <button className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                    <Filter className="h-4 w-4" />
                    Lọc
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={8}
                    align="end"
                    className="z-50 w-80 rounded-lg border border-border bg-popover p-4 shadow-xl"
                  >
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold">Bộ lọc duyệt bác sĩ</h3>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Cơ sở y tế
                        </span>
                        <select
                          value={clinicFilter}
                          onChange={(event) => setClinicFilter(event.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        >
                          <option value="all">Tất cả cơ sở y tế</option>
                          {clinics.map((clinic) => (
                            <option key={clinic.id} value={clinic.id}>
                              {clinic.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Ngày gửi yêu cầu
                        </span>
                        <select
                          value={dateFilter}
                          onChange={(event) => setDateFilter(event.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        >
                          <option value="all">Tất cả thời gian</option>
                          <option value="today">Hôm nay</option>
                          <option value="week">7 ngày qua</option>
                        </select>
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                          Trạng thái xác minh
                        </span>
                        <select
                          value={verificationFilter}
                          onChange={(event) => setVerificationFilter(event.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                        >
                          <option value="all">Tất cả trạng thái</option>
                          <option value="verified">Đã xác minh CCHN</option>
                          <option value="review">Cần đối chiếu</option>
                          <option value="missing">Thiếu hồ sơ</option>
                        </select>
                      </label>
                      <div className="flex gap-2 border-t border-border pt-3">
                        <button
                          onClick={() => {
                            setSearchTerm("");
                            setClinicFilter("all");
                            setDateFilter("all");
                            setVerificationFilter("all");
                          }}
                          className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                        >
                          Đặt lại
                        </button>
                        <Popover.Close asChild>
                          <button className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            Áp dụng
                          </button>
                        </Popover.Close>
                      </div>
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>
          </div>
        </div>

        {TABS.map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value} className="mt-4 flex-1 outline-none">
            {renderTable(tab.value)}
          </Tabs.Content>
        ))}
      </Tabs.Root>

      <DetailDrawer
        open={Boolean(selectedDoc)}
        onOpenChange={(open) => {
          if (!open) setSelectedDoc(null);
        }}
        title={selectedDoc ? `Hồ sơ bác sĩ ${selectedDoc.name}` : "Hồ sơ bác sĩ"}
        className="max-w-[480px]"
      >
        {selectedDoc && (
          <>
            <div className="border-b border-border p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserRoundCheck className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <DetailDrawerTitle className="truncate">{selectedDoc.name}</DetailDrawerTitle>
                    <DetailDrawerDescription className="mt-1 truncate">
                      {selectedDoc.email}
                    </DetailDrawerDescription>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {getStatusBadge(selectedDoc.status)}
                      <StatusBadge
                        label={selectedDoc.verification}
                        tone={getVerificationTone(selectedDoc.verification)}
                      />
                    </div>
                  </div>
                </div>
                <DetailDrawerClose label="Đóng hồ sơ bác sĩ" className="rounded-full" />
              </div>
            </div>

            <Tabs.Root defaultValue="info" className="flex min-h-0 flex-1 flex-col">
              <Tabs.List className="flex gap-2 border-b border-border px-5 py-3">
                {["Thông tin", "Lịch sử", "Audit"].map((label, index) => (
                  <Tabs.Trigger
                    key={label}
                    value={index === 0 ? "info" : index === 1 ? "history" : "audit"}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    {label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content
                value="info"
                className="min-h-0 flex-1 overflow-y-auto p-6 outline-none"
              >
                <div className="space-y-6">
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Hồ sơ bác sĩ
                    </h3>
                    <div className="grid gap-3">
                      <InfoRow icon={Mail} label="Email" value={selectedDoc.email} />
                      <InfoRow icon={Phone} label="Số điện thoại" value={selectedDoc.phone} />
                      <InfoRow
                        icon={UserRoundCheck}
                        label="Loại đăng ký"
                        value={selectedDoc.requestType}
                      />
                      <InfoRow
                        icon={Building2}
                        label="Phòng khám/cơ sở"
                        value={selectedDoc.clinic}
                      />
                      <InfoRow
                        icon={FileText}
                        label="Số giấy phép hành nghề"
                        value={selectedDoc.license}
                      />
                      <InfoRow
                        icon={Stethoscope}
                        label="Chuyên khoa"
                        value={selectedDoc.specialty}
                      />
                      <InfoRow
                        icon={ShieldCheck}
                        label="UID Firebase"
                        value={selectedDoc.uid}
                        mono
                      />
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="mb-2 text-sm font-semibold text-foreground">Lý do đăng ký</div>
                    <p className="text-sm leading-6 text-muted-foreground">{selectedDoc.reason}</p>
                  </section>
                </div>
              </Tabs.Content>

              <Tabs.Content
                value="history"
                className="min-h-0 flex-1 overflow-y-auto p-6 outline-none"
              >
                <div className="space-y-5">
                  <InfoRow icon={Calendar} label="Ngày gửi yêu cầu" value={selectedDoc.date} />
                  <InfoRow
                    icon={ShieldCheck}
                    label="Lịch sử đăng nhập"
                    value={selectedDoc.lastLogin}
                  />
                  <div>
                    <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Diễn biến xác minh
                    </h3>
                    <Timeline
                      items={[
                        {
                          title: "Tạo tài khoản Firebase",
                          time: selectedDoc.date,
                          description: `UID ${selectedDoc.uid} được ghi nhận trên hệ thống.`,
                          tone: "primary",
                        },
                        {
                          title: selectedDoc.verification,
                          time: "Sau khi gửi yêu cầu",
                          description: "Hồ sơ được đối chiếu với thông tin phòng khám và CCHN.",
                          tone:
                            getVerificationTone(selectedDoc.verification) === "success"
                              ? "success"
                              : "warning",
                        },
                      ]}
                    />
                  </div>
                </div>
              </Tabs.Content>

              <Tabs.Content
                value="audit"
                className="min-h-0 flex-1 overflow-y-auto p-6 outline-none"
              >
                <Timeline
                  items={[
                    {
                      title: "Nhận yêu cầu duyệt tài khoản",
                      time: `${selectedDoc.date} 09:10`,
                      description: `Resource ID ${selectedDoc.id}, actor system@smarthealth.vn.`,
                      tone: "primary",
                    },
                    {
                      title: "Đọc hồ sơ xác minh",
                      time: "Hôm nay 08:42",
                      description:
                        "Actor admin@smarthealth.vn mở detail drawer để kiểm tra thông tin.",
                      tone: "success",
                    },
                    {
                      title: "Chờ quyết định quản trị",
                      time: "Hiện tại",
                      description:
                        "Các hành động phê duyệt, từ chối hoặc yêu cầu bổ sung sẽ được ghi bất biến.",
                      tone: "warning",
                    },
                  ]}
                />
              </Tabs.Content>
            </Tabs.Root>

            <div className="border-t border-border bg-muted/30 p-5">
              {selectedDoc.status === "pending" || selectedDoc.status === "needs_info" ? (
                <CapabilityGate capabilities={DOCTOR_REQUEST_MANAGE_CAPABILITIES}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      onClick={() => setRejectOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15"
                    >
                      <XCircle className="h-4 w-4" />
                      Từ chối
                    </button>
                    <button
                      onClick={() => {
                        setInfoFields(
                          selectedDoc.requiredFields?.length
                            ? selectedDoc.requiredFields
                            : ["license", "clinic", "specialty"],
                        );
                        setInfoOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <Send className="h-4 w-4" />
                      Bổ sung
                    </button>
                    <button
                      onClick={() => setApproveOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Phê duyệt
                    </button>
                  </div>
                </CapabilityGate>
              ) : (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  Hồ sơ này đã có quyết định. Các nút phê duyệt/từ chối chỉ hiển thị ở trạng thái
                  chờ duyệt hoặc cần bổ sung.
                </div>
              )}
            </div>
          </>
        )}
      </DetailDrawer>

      <Dialog.Root open={canManageDoctorRequests && approveOpen} onOpenChange={setApproveOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3 text-primary">
              <CheckCircle className="h-6 w-6" />
              <Dialog.Title className="text-lg font-bold">Phê duyệt tài khoản bác sĩ</Dialog.Title>
            </div>
            <Dialog.Description className="mb-6 text-sm leading-6 text-muted-foreground">
              Sau khi phê duyệt, bác sĩ có thể đăng nhập và truy cập dữ liệu bệnh nhân theo quyền
              được cấp. Hệ thống sẽ yêu cầu bác sĩ đăng nhập lại để nhận quyền mới.
            </Dialog.Description>
            <div className="space-y-4">
              <SearchableClinicSelect
                clinics={clinics}
                value={approveOrganizationId}
                fallbackLabel={selectedDoc?.clinic || "Chọn tổ chức/phòng khám"}
                onChange={setApproveOrganizationId}
              />
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-sm font-medium text-foreground">Vai trò được cấp: Bác sĩ</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Yêu cầu duyệt bác sĩ chỉ cấp role doctor. Các vai trò nhân sự khác được quản lý
                  trong quy trình thành viên workspace.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setApproveOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Hủy
              </button>
              <button
                onClick={handleApproveRequest}
                disabled={actionLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Phê duyệt tài khoản
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={canManageDoctorRequests && infoOpen} onOpenChange={setInfoOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3 text-primary">
              <Send className="h-6 w-6" />
              <Dialog.Title className="text-lg font-bold">Yêu cầu bổ sung thông tin</Dialog.Title>
            </div>
            <Dialog.Description className="mb-6 text-sm leading-6 text-muted-foreground">
              Nội dung này sẽ được lưu vào hồ sơ duyệt. Khi bác sĩ bấm kiểm tra lại trên ứng dụng,
              màn chờ duyệt sẽ hiển thị yêu cầu bổ sung này.
            </Dialog.Description>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Thông tin cần bổ sung</span>
              <textarea
                value={infoMessage}
                onChange={(event) => setInfoMessage(event.target.value)}
                className="min-h-[112px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="Ví dụ: Vui lòng bổ sung chuyên khoa và ảnh chụp CCHN còn hiệu lực."
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setInfoOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Hủy
              </button>
              <button
                onClick={handleRequestMoreInfo}
                disabled={!infoMessage.trim() || actionLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
              >
                Gửi yêu cầu bổ sung
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={canManageDoctorRequests && rejectOpen} onOpenChange={setRejectOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-slate-900/45" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3 text-destructive">
              <AlertCircle className="h-6 w-6" />
              <Dialog.Title className="text-lg font-bold">Từ chối yêu cầu</Dialog.Title>
            </div>
            <Dialog.Description className="mb-6 text-sm leading-6 text-muted-foreground">
              Yêu cầu sẽ bị từ chối, bác sĩ không thể truy cập dữ liệu bệnh nhân. Lý do từ chối là
              bắt buộc và sẽ được lưu vào audit log.
            </Dialog.Description>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Lý do từ chối</span>
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                className="min-h-[112px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-destructive focus:ring-1 focus:ring-destructive"
                placeholder="Ví dụ: Thiếu CCHN hợp lệ hoặc thông tin cơ sở y tế chưa khớp."
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRejectOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Hủy
              </button>
              <button
                onClick={handleRejectRequest}
                disabled={!rejectReason.trim() || actionLoading}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-50"
              >
                Từ chối yêu cầu
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function SearchableClinicSelect({
  clinics,
  value,
  fallbackLabel,
  onChange,
}: {
  clinics: SmartHealthClinic[];
  value: string;
  fallbackLabel: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedClinic = clinics.find((clinic) => clinic.id === value);
  const filteredClinics = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return clinics;

    return clinics.filter((clinic) => {
      const haystack = `${clinic.name} ${clinic.address || ""} ${clinic.type || ""}`.toLowerCase();
      return haystack.includes(cleanQuery);
    });
  }, [clinics, query]);

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">Chọn tổ chức/phòng khám</span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted/60 focus:border-ring focus:ring-1 focus:ring-ring"
          >
            <span className="min-w-0 truncate">
              {selectedClinic?.name || fallbackLabel || "Chọn tổ chức/phòng khám"}
            </span>
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={8}
            align="start"
            className="z-[90] w-[min(86vw,472px)] rounded-lg border border-border bg-popover p-3 shadow-xl"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
                placeholder="Tìm bệnh viện/phòng khám..."
                className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto pr-1">
              {filteredClinics.map((clinic) => (
                <button
                  key={clinic.id}
                  type="button"
                  onClick={() => {
                    onChange(clinic.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    clinic.id === value ? "bg-primary/10 text-primary" : "text-foreground"
                  }`}
                >
                  <span className="block font-medium">{clinic.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {clinic.address || (clinic.type === "clinic" ? "Phòng khám" : "Bệnh viện")}
                  </span>
                </button>
              ))}
              {filteredClinics.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Không tìm thấy cơ sở y tế phù hợp.
                </div>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={
            mono
              ? "mt-0.5 font-mono text-sm text-foreground"
              : "mt-0.5 text-sm font-medium text-foreground"
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}
