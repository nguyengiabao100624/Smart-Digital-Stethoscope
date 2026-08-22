import type { ApiUser, WorkspaceMembership } from "./smart-health-api";

export type PortalStaffLedger = {
  workspaceId: string;
  generatedAt: string;
  staff: ApiUser[];
  doctors: ApiUser[];
};

const STAFF_ROLES = new Set([
  "workspace_owner",
  "workspace_admin",
  "doctor",
  "nurse",
  "technician",
  "billing",
  "viewer",
]);
const MEMBERSHIP_STATUSES = new Set(["active", "suspended", "revoked"]);
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "firebaseclaims",
  "twofactorsecret",
  "twofactorsecretpreview",
  "twofactorrecoverycodes",
  "onetimestaffinvitationtoken",
  "onetimeacceptancetoken",
]);

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Phản hồi nhân sự thiếu ${label}.`);
  }
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalTimestamp(value: unknown, label: string) {
  const timestamp = requiredText(value, label);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Phản hồi nhân sự có ${label} không hợp lệ.`);
  }
  return timestamp;
}

function assertNoSensitiveFields(value: unknown, depth = 0) {
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoSensitiveFields(item, depth + 1));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      throw new Error(
        `Phản hồi nhân sự chứa trường nhạy cảm không được phép: ${key}.`,
      );
    }
    assertNoSensitiveFields(item, depth + 1);
  }
}

function parseMember(
  value: unknown,
  expectedWorkspaceId: string,
): ApiUser {
  const member = recordOf(value);
  const id = requiredText(member.id, "ID tài khoản canonical");
  const membership = recordOf(member.workspaceMembership);
  const organizationId = optionalText(membership.organizationId);
  const workspaceId = optionalText(membership.workspaceId);
  if (
    organizationId &&
    workspaceId &&
    organizationId !== workspaceId
  ) {
    throw new Error(
      `Membership của ${id} có alias workspace không đồng nhất.`,
    );
  }
  const membershipWorkspaceId = requiredText(
    workspaceId || organizationId,
    `workspace membership của ${id}`,
  );
  if (membershipWorkspaceId !== expectedWorkspaceId) {
    throw new Error(
      `Danh sách nhân sự chứa tài khoản ${id} ngoài workspace hiện tại.`,
    );
  }
  const membershipUserId = requiredText(
    membership.userId,
    `userId membership của ${id}`,
  );
  if (membershipUserId !== id) {
    throw new Error(`Membership nhân sự ${id} không khớp chủ tài khoản.`);
  }
  const membershipRole = requiredText(
    membership.role,
    `vai trò membership của ${id}`,
  );
  if (!STAFF_ROLES.has(membershipRole)) {
    throw new Error(`Nhân sự ${id} có vai trò workspace không hợp lệ.`);
  }
  const membershipStatus = requiredText(
    membership.status,
    `trạng thái membership của ${id}`,
  );
  if (!MEMBERSHIP_STATUSES.has(membershipStatus)) {
    throw new Error(`Nhân sự ${id} có trạng thái membership không hợp lệ.`);
  }
  if (typeof membership.operational !== "boolean") {
    throw new Error(`Membership của ${id} thiếu trạng thái vận hành canonical.`);
  }
  if (membershipStatus !== "active" && membership.operational) {
    throw new Error(
      `Membership ${membershipStatus} của ${id} không thể còn quyền vận hành.`,
    );
  }

  const accountStatus = requiredText(
    member.accountStatus,
    `trạng thái tài khoản của ${id}`,
  );
  const roleRequestStatus = requiredText(
    member.roleRequestStatus,
    `trạng thái duyệt của ${id}`,
  );
  if (
    membership.operational &&
    (accountStatus !== "active" || roleRequestStatus !== "approved")
  ) {
    throw new Error(
      `Nhân sự ${id} được đánh dấu vận hành dù tài khoản chưa active/approved.`,
    );
  }

  const normalizedMembership: WorkspaceMembership = {
    id: requiredText(membership.id, `ID membership của ${id}`),
    userId: id,
    organizationId: membershipWorkspaceId,
    workspaceId: membershipWorkspaceId,
    role: membershipRole,
    status: membershipStatus,
    operational: membership.operational,
    suspendedAt: optionalText(membership.suspendedAt),
    createdAt: optionalText(membership.createdAt),
    updatedAt: optionalText(membership.updatedAt),
  };

  return {
    id,
    role: optionalText(member.role),
    name: optionalText(member.name),
    title: optionalText(member.title),
    email: optionalText(member.email).toLowerCase(),
    phone: optionalText(member.phone),
    avatarUrl: optionalText(member.avatarUrl),
    license: optionalText(member.license),
    hospital: optionalText(member.hospital),
    department: optionalText(member.department),
    specialty: optionalText(member.specialty),
    accountStatus,
    roleRequestStatus,
    verifiedEmail: member.verifiedEmail === true,
    workspaceMembership: normalizedMembership,
  };
}

function parseUniqueMembers(
  value: unknown,
  expectedWorkspaceId: string,
  label: string,
) {
  if (!Array.isArray(value)) {
    throw new Error(`Phản hồi nhân sự thiếu ${label} canonical.`);
  }
  const ids = new Set<string>();
  return value.map((item) => {
    const member = parseMember(item, expectedWorkspaceId);
    if (ids.has(member.id)) {
      throw new Error(`${label} bị trùng ID ${member.id}.`);
    }
    ids.add(member.id);
    return member;
  });
}

export function parsePortalStaffLedger(
  response: unknown,
  expectedWorkspaceId: string,
): PortalStaffLedger {
  assertNoSensitiveFields(response);
  const expected = requiredText(
    expectedWorkspaceId,
    "workspace kỳ vọng của danh sách",
  );
  const record = recordOf(response);
  const workspaceId = requiredText(
    record.workspaceId,
    "workspace envelope canonical",
  );
  if (workspaceId !== expected) {
    throw new Error(
      "Workspace trong phản hồi nhân sự không khớp workspace hiện tại.",
    );
  }
  const generatedAt = canonicalTimestamp(
    record.generatedAt,
    "thời điểm tạo snapshot",
  );
  const staff = parseUniqueMembers(record.staff, workspaceId, "Danh sách nhân sự");
  const doctors = parseUniqueMembers(
    record.doctors,
    workspaceId,
    "Danh mục bác sĩ",
  );
  const staffById = new Map(staff.map((member) => [member.id, member]));
  for (const doctor of doctors) {
    const staffMember = staffById.get(doctor.id);
    const membership = doctor.workspaceMembership;
    if (
      !staffMember ||
      membership?.role !== "doctor" ||
      membership.status !== "active" ||
      membership.operational !== true ||
      doctor.role !== "doctor" ||
      doctor.accountStatus !== "active" ||
      doctor.roleRequestStatus !== "approved"
    ) {
      throw new Error(
        `Danh mục bác sĩ chứa tài khoản ${doctor.id} không còn quyền vận hành.`,
      );
    }
    if (
      staffMember.workspaceMembership?.role !== membership.role ||
      staffMember.workspaceMembership?.status !== membership.status ||
      staffMember.workspaceMembership?.operational !== membership.operational
    ) {
      throw new Error(
        `Danh mục bác sĩ không đồng nhất với ledger nhân sự cho ${doctor.id}.`,
      );
    }
  }
  return { workspaceId, generatedAt, staff, doctors };
}
