export type WorkspaceRequestIntent = {
  name: string;
  workspaceType: string;
};

export type WorkspaceRequestReceipt = {
  workspace: {
    id: string;
    name: string;
    workspaceType: string;
    status: "pending";
    version: number;
  };
  user: {
    id: string;
    role: "patient";
    requestedRole: "workspace_owner";
    roleRequestStatus: "pending";
    organizationId: string;
  };
  operationId: string;
  idempotent: boolean;
  notificationDelivery: "ready" | "failed" | "skipped";
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Backend chưa xác nhận ${label} của yêu cầu workspace.`);
  }
  return value.trim();
}

export function createWorkspaceRequestIdempotencyKey(target: string) {
  void target;
  const nonce =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `web-workspace-request-${nonce}`;
}

export function parseWorkspaceRequestReceipt(
  response: unknown,
  intent: WorkspaceRequestIntent,
): WorkspaceRequestReceipt {
  const root = recordOf(response);
  const workspaceRecord = recordOf(root.workspace);
  const userRecord = recordOf(root.user);
  const workspace = {
    id: requiredString(workspaceRecord.id, "workspace.id"),
    name: requiredString(workspaceRecord.name, "workspace.name"),
    workspaceType: requiredString(
      workspaceRecord.workspaceType,
      "workspace.workspaceType",
    ),
    status: workspaceRecord.status,
    version: workspaceRecord.version,
  };
  if (
    workspace.name !== intent.name.trim() ||
    workspace.workspaceType !== intent.workspaceType.trim()
  ) {
    throw new Error("Backend xác nhận workspace khác với hồ sơ vừa gửi.");
  }
  if (workspace.status !== "pending") {
    throw new Error(
      "Backend chưa đưa hồ sơ workspace về trạng thái chờ duyệt.",
    );
  }
  if (!Number.isInteger(workspace.version) || Number(workspace.version) < 1) {
    throw new Error("Backend chưa trả version canonical của workspace.");
  }
  const user = {
    id: requiredString(userRecord.id, "user.id"),
    role: userRecord.role,
    requestedRole: userRecord.requestedRole,
    roleRequestStatus: userRecord.roleRequestStatus,
    organizationId: requiredString(
      userRecord.organizationId,
      "user.organizationId",
    ),
  };
  if (
    user.role !== "patient" ||
    user.requestedRole !== "workspace_owner" ||
    user.roleRequestStatus !== "pending" ||
    user.organizationId !== workspace.id
  ) {
    throw new Error(
      "Backend chưa xác nhận đúng trạng thái danh tính workspace owner.",
    );
  }
  if (typeof root.idempotent !== "boolean") {
    throw new Error("Backend chưa trả trạng thái idempotent canonical.");
  }
  const notificationDelivery = root.notificationDelivery;
  if (!["ready", "failed", "skipped"].includes(String(notificationDelivery))) {
    throw new Error(
      "Backend chưa trả trạng thái notification delivery canonical.",
    );
  }

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      workspaceType: workspace.workspaceType,
      status: "pending",
      version: Number(workspace.version),
    },
    user: {
      id: user.id,
      role: "patient",
      requestedRole: "workspace_owner",
      roleRequestStatus: "pending",
      organizationId: user.organizationId,
    },
    operationId: requiredString(root.operationId, "operationId"),
    idempotent: root.idempotent,
    notificationDelivery:
      notificationDelivery as WorkspaceRequestReceipt["notificationDelivery"],
  };
}
