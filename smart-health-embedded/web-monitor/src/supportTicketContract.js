const SUPPORT_TICKET_TYPES = Object.freeze([
  "device_connection",
  "measurement_missing",
  "account_access",
  "interface_issue",
  "other",
]);

const SUPPORT_TICKET_TYPE_ALIASES = new Map([
  ["device_connection", "device_connection"],
  ["thiết bị không kết nối", "device_connection"],
  ["measurement_missing", "measurement_missing"],
  ["không nhận được lượt đo", "measurement_missing"],
  ["account_access", "account_access"],
  ["lỗi tài khoản / quyền truy cập", "account_access"],
  ["interface_issue", "interface_issue"],
  ["lỗi giao diện", "interface_issue"],
  ["other", "other"],
  ["khác", "other"],
  ["operations", "other"],
]);

function contractError(statusCode, code, message, details = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function readText(value, maxLength = 3000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeSupportTicketType(value) {
  const raw = readText(value, 160).toLowerCase();
  const type = SUPPORT_TICKET_TYPE_ALIASES.get(raw) || "";
  if (!type) {
    throw contractError(
      400,
      "SUPPORT_TICKET_TYPE_INVALID",
      "Loại yêu cầu hỗ trợ không được hỗ trợ",
      { allowedTypes: [...SUPPORT_TICKET_TYPES] },
    );
  }
  return type;
}

function normalizeSupportTicketDescription(value) {
  const description = readText(value, 3000);
  if (description.length < 10) {
    throw contractError(
      400,
      "SUPPORT_TICKET_DESCRIPTION_INVALID",
      "Mô tả yêu cầu hỗ trợ phải có ít nhất 10 ký tự",
      {
        fieldErrors: {
          description: "Mô tả phải có ít nhất 10 ký tự.",
        },
      },
    );
  }
  return description;
}

function normalizeSupportTicketCreate(payload = {}, authority = {}) {
  for (const field of [
    "id",
    "workspaceId",
    "organizationId",
    "requesterUserId",
    "userId",
    "status",
    "createdAt",
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw contractError(
        400,
        "SUPPORT_TICKET_AUTHORITY_FORBIDDEN",
        "Danh tính người gửi và workspace phải do backend xác định",
        { field },
      );
    }
  }

  const workspaceId = readText(authority.workspaceId, 120);
  const requesterUserId = readText(authority.requesterUserId, 120);
  if (!workspaceId || !requesterUserId) {
    throw contractError(
      403,
      "SUPPORT_TICKET_AUTHORITY_REQUIRED",
      "Cần tài khoản và workspace đang hoạt động để gửi yêu cầu hỗ trợ",
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(payload, "description") &&
    Object.prototype.hasOwnProperty.call(payload, "desc") &&
    readText(payload.description) !== readText(payload.desc)
  ) {
    throw contractError(
      400,
      "SUPPORT_TICKET_DESCRIPTION_CONFLICT",
      "Mô tả yêu cầu hỗ trợ bị mâu thuẫn",
    );
  }

  return {
    workspaceId,
    requesterUserId,
    type: normalizeSupportTicketType(payload.type),
    description: normalizeSupportTicketDescription(
      Object.prototype.hasOwnProperty.call(payload, "description")
        ? payload.description
        : payload.desc,
    ),
  };
}

function normalizeSupportTicketRecord(value = {}) {
  const workspaceId = readText(value.workspaceId || value.organizationId, 120);
  const requesterUserId = readText(value.requesterUserId || value.userId, 120);
  if (!workspaceId || !requesterUserId) {
    throw contractError(
      400,
      "SUPPORT_TICKET_AUTHORITY_REQUIRED",
      "Support ticket requires a canonical workspace and requester",
    );
  }
  return {
    workspaceId,
    requesterUserId,
    type: normalizeSupportTicketType(value.type),
    description: normalizeSupportTicketDescription(value.description),
  };
}

function publicSupportTicket(ticket) {
  if (!ticket) return null;
  return {
    id: readText(ticket.id, 160),
    workspaceId: readText(ticket.workspaceId || ticket.organizationId, 120),
    requesterUserId: readText(ticket.requesterUserId || ticket.userId, 120),
    type: normalizeSupportTicketType(ticket.type),
    status: "open",
    createdAt: readText(ticket.createdAt, 80),
  };
}

module.exports = {
  SUPPORT_TICKET_TYPES,
  contractError,
  normalizeSupportTicketCreate,
  normalizeSupportTicketDescription,
  normalizeSupportTicketRecord,
  normalizeSupportTicketType,
  publicSupportTicket,
};
