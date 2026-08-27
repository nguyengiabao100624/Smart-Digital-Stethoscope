export type RoleRequestIntent = {
  requestedRole: "doctor" | "patient";
  accountType: "doctor" | "solo_doctor" | "personal";
  workspaceType: "clinic" | "solo_practice" | "personal";
  organizationId?: string;
};

export type PublicClinicOption = {
  id: string;
  name: string;
  workspaceType: "clinic" | "hospital";
  address: string;
};

export type RoleRequestReceipt = {
  user: {
    id: string;
    role: string;
    requestedRole: "doctor" | "patient";
    roleRequestStatus: "pending" | "approved";
    roleRequestedAt: string;
    accountStatus: "active";
    accountType: RoleRequestIntent["accountType"];
    workspaceType: RoleRequestIntent["workspaceType"];
    organizationId: string;
  };
  roleRequest: {
    requestedRole: "doctor" | "patient";
    status: "pending" | "approved";
    requestedAt: string;
  };
  operationId: string;
  replayed: boolean;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Backend chưa xác nhận ${field} của yêu cầu quyền.`);
  }
  return value.trim();
}

function hasExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    keys.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => keys.includes(key))
  );
}

function isValidDateTime(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = match[9] === undefined ? 0 : Number(match[9]);
  const offsetMinute = match[10] === undefined ? 0 : Number(match[10]);
  const daysInMonth =
    month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;

  return (
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

export function createRoleRequestIdempotencyKey(): string {
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `web-role-request-${nonce}`;
}

export function parsePublicClinicCatalog(
  response: unknown,
): PublicClinicOption[] {
  const root = recordOf(response);
  if (!hasExactKeys(root, ["clinics"]) || !Array.isArray(root.clinics)) {
    throw new Error("Danh mục cơ sở y tế không đúng schema canonical.");
  }

  const seen = new Set<string>();
  return root.clinics.map((candidate) => {
    const clinic = recordOf(candidate);
    const id = requiredString(clinic.id, "clinic.id");
    const name = requiredString(clinic.name, "clinic.name");
    const workspaceType = requiredString(
      clinic.workspaceType || clinic.type,
      "clinic.workspaceType",
    );
    const status = requiredString(clinic.status, "clinic.status");
    const address =
      typeof clinic.address === "string" ? clinic.address.trim() : "";
    if (
      id.length > 120 ||
      name.length > 160 ||
      address.length > 240 ||
      !["clinic", "hospital"].includes(workspaceType) ||
      status !== "active" ||
      seen.has(id)
    ) {
      throw new Error(
        "Danh mục cơ sở y tế chứa định danh hoặc trạng thái không hợp lệ.",
      );
    }
    seen.add(id);
    return {
      id,
      name,
      workspaceType: workspaceType as PublicClinicOption["workspaceType"],
      address,
    };
  });
}

export function parseRoleRequestReceipt(
  response: unknown,
  intent: RoleRequestIntent,
  expectedUserId: string,
): RoleRequestReceipt {
  const root = recordOf(response);
  const userRecord = recordOf(root.user);
  const requestRecord = recordOf(root.roleRequest);
  if (
    !hasExactKeys(root, ["user", "roleRequest", "operationId", "replayed"]) ||
    !hasExactKeys(requestRecord, ["requestedRole", "status", "requestedAt"])
  ) {
    throw new Error("Backend trả biên nhận quyền không đúng schema canonical.");
  }
  const userId = requiredString(userRecord.id, "user.id");
  const userRole = requiredString(userRecord.role, "user.role");
  const roleRequestedAt = requiredString(
    userRecord.roleRequestedAt,
    "user.roleRequestedAt",
  );
  const accountStatus = requiredString(
    userRecord.accountStatus,
    "user.accountStatus",
  );
  const requestedRole = requiredString(
    requestRecord.requestedRole,
    "roleRequest.requestedRole",
  );
  const status = requiredString(requestRecord.status, "roleRequest.status");
  const requestedAt = requiredString(
    requestRecord.requestedAt,
    "roleRequest.requestedAt",
  );
  const operationId = requiredString(root.operationId, "operationId");
  const organizationId = requiredString(
    userRecord.organizationId,
    "user.organizationId",
  );
  const expectedOrganizationId = intent.organizationId?.trim() || "";
  const expectedStatus =
    intent.requestedRole === "doctor" ? "pending" : "approved";

  if (
    !expectedUserId.trim() ||
    userId !== expectedUserId.trim() ||
    userId.length > 120
  ) {
    throw new Error("Backend trả hồ sơ quyền không thuộc tài khoản hiện tại.");
  }
  if (
    requestedRole !== intent.requestedRole ||
    userRecord.requestedRole !== intent.requestedRole ||
    status !== expectedStatus ||
    userRecord.roleRequestStatus !== expectedStatus
  ) {
    throw new Error("Backend chưa xác nhận đúng lifecycle của yêu cầu quyền.");
  }
  if (
    userRecord.accountType !== intent.accountType ||
    userRecord.workspaceType !== intent.workspaceType ||
    (intent.workspaceType === "clinic" && !expectedOrganizationId) ||
    (expectedOrganizationId && organizationId !== expectedOrganizationId)
  ) {
    throw new Error(
      "Backend xác nhận mô hình tài khoản khác với hồ sơ đã gửi.",
    );
  }
  if (
    userRole !== "patient" ||
    accountStatus !== "active" ||
    !isValidDateTime(roleRequestedAt) ||
    !isValidDateTime(requestedAt) ||
    roleRequestedAt !== requestedAt ||
    organizationId.length > 120 ||
    operationId.length > 160
  ) {
    throw new Error(
      "Backend trả trạng thái tài khoản hoặc biên nhận vòng đời không hợp lệ.",
    );
  }
  if (typeof root.replayed !== "boolean") {
    throw new Error("Backend chưa trả trạng thái replay canonical.");
  }

  return {
    user: {
      id: userId,
      role: userRole,
      requestedRole: intent.requestedRole,
      roleRequestStatus: expectedStatus,
      roleRequestedAt,
      accountStatus: "active",
      accountType: intent.accountType,
      workspaceType: intent.workspaceType,
      organizationId,
    },
    roleRequest: {
      requestedRole: intent.requestedRole,
      status: expectedStatus,
      requestedAt,
    },
    operationId,
    replayed: root.replayed,
  };
}
