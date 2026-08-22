export type RoleRequestDocumentIdentity = {
  fingerprint: string;
  idempotencyKey: string;
  name: string;
  contentType: string;
  byteSize: number;
  sha256: string;
};

export type RoleRequestDocumentReceipt = {
  document: {
    id: string;
    userId: string;
    organizationId: string;
    name: string;
    contentType: string;
    byteSize: number;
    sha256: string;
    uploadedAt: string;
  };
  operationId: string;
  replayed: boolean;
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Backend chưa xác nhận ${field} của tài liệu.`);
  }
  return value.trim();
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Không thể đọc tài liệu xác minh."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(
        new Error("Trình duyệt không trả nội dung nhị phân của tài liệu."),
      );
    };
    reader.readAsArrayBuffer(file);
  });
}

function isRfc3339(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
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

export async function inspectRoleRequestDocument(
  file: File,
): Promise<RoleRequestDocumentIdentity> {
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error(
      "Trình duyệt không hỗ trợ kiểm tra an toàn nội dung tài liệu.",
    );
  }
  const sha256 = bytesToHex(
    await globalThis.crypto.subtle.digest("SHA-256", await readFileBytes(file)),
  );
  const fingerprint = JSON.stringify({
    name: file.name,
    contentType: file.type,
    byteSize: file.size,
    sha256,
  });
  const keyDigest = bytesToHex(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(fingerprint),
    ),
  );
  return {
    fingerprint,
    idempotencyKey: `web-role-document-v1-${keyDigest}`,
    name: file.name,
    contentType: file.type,
    byteSize: file.size,
    sha256,
  };
}

export function parseRoleRequestDocumentReceipt(
  response: unknown,
  expected: {
    userId: string;
    organizationId: string;
    identity: RoleRequestDocumentIdentity;
  },
): RoleRequestDocumentReceipt {
  const root = recordOf(response);
  const document = recordOf(root.document);
  if (
    !hasExactKeys(root, ["document", "operationId", "replayed"]) ||
    !hasExactKeys(document, [
      "id",
      "userId",
      "organizationId",
      "name",
      "contentType",
      "byteSize",
      "sha256",
      "uploadedAt",
    ])
  ) {
    throw new Error(
      "Backend trả biên nhận tài liệu không đúng schema canonical.",
    );
  }

  const parsed = {
    id: requiredString(document.id, "document.id"),
    userId: requiredString(document.userId, "document.userId"),
    organizationId: requiredString(
      document.organizationId,
      "document.organizationId",
    ),
    name: requiredString(document.name, "document.name"),
    contentType: requiredString(document.contentType, "document.contentType"),
    byteSize: document.byteSize,
    sha256: requiredString(document.sha256, "document.sha256").toLowerCase(),
    uploadedAt: requiredString(document.uploadedAt, "document.uploadedAt"),
  };
  const operationId = requiredString(root.operationId, "operationId");
  const expectedOrganizationId = expected.organizationId?.trim() || "";
  if (
    !expected.userId.trim() ||
    parsed.userId !== expected.userId.trim() ||
    !expectedOrganizationId ||
    parsed.organizationId !== expectedOrganizationId ||
    parsed.name !== expected.identity.name ||
    parsed.contentType !== expected.identity.contentType ||
    typeof parsed.byteSize !== "number" ||
    !Number.isSafeInteger(parsed.byteSize) ||
    parsed.byteSize < 1 ||
    parsed.byteSize !== expected.identity.byteSize ||
    parsed.sha256 !== expected.identity.sha256 ||
    !/^[a-f0-9]{64}$/.test(parsed.sha256) ||
    !isRfc3339(parsed.uploadedAt) ||
    operationId.length > 160 ||
    typeof root.replayed !== "boolean"
  ) {
    throw new Error(
      "Backend trả tài liệu không khớp chủ sở hữu, workspace hoặc nội dung đã tải lên.",
    );
  }

  return {
    document: {
      ...parsed,
      byteSize: parsed.byteSize as number,
    },
    operationId,
    replayed: root.replayed,
  };
}
