const assert = require("node:assert/strict");
const test = require("node:test");

const {
  filterAndPageAuditLogs,
  normalizeAuditLogQuery,
  sanitizeAuditMetadata,
} = require("../src/auditLogContract");

const logs = [
  {
    id: "audit_3",
    actorUserId: "user_alpha",
    organizationId: "org_alpha",
    action: "export.download",
    resourceType: "export",
    resourceId: "export_1",
    ip: "127.0.0.3",
    metadata: { format: "csv" },
    createdAt: "2026-07-23T10:00:00.000Z",
  },
  {
    id: "audit_2",
    actorUserId: "user_beta",
    organizationId: "org_beta",
    action: "patient.update",
    resourceType: "patient",
    resourceId: "patient_beta",
    ip: "127.0.0.2",
    metadata: {},
    createdAt: "2026-07-22T10:00:00.000Z",
  },
  {
    id: "audit_1",
    actorUserId: "user_alpha",
    organizationId: "org_alpha",
    action: "patient.create",
    resourceType: "patient",
    resourceId: "patient_alpha",
    ip: "127.0.0.1",
    metadata: { patientCode: "BN-001" },
    createdAt: "2026-07-21T10:00:00.000Z",
  },
];

test("audit query normalization bounds pagination and allowlists sort", () => {
  const query = normalizeAuditLogQuery({ page: "0", limit: "999", sort: "metadata:desc" });
  assert.equal(query.page, 1);
  assert.equal(query.limit, 100);
  assert.equal(query.sort, "createdAt:desc");
});

test("audit query rejects invalid and reversed date ranges", () => {
  assert.throws(
    () => normalizeAuditLogQuery({ startDate: "2026-02-30" }),
    (error) => error?.code === "AUDIT_DATE_INVALID",
  );
  assert.throws(
    () => normalizeAuditLogQuery({ startDate: "2026-07-23", endDate: "2026-07-01" }),
    (error) => error?.code === "AUDIT_DATE_RANGE_INVALID",
  );
});

test("audit runtime paging applies tenant, action, date and search filters before pagination", () => {
  const page = filterAndPageAuditLogs(logs, {
    organizationId: "org_alpha",
    q: "patient_alpha",
    resourceType: "patient",
    startDate: "2026-07-01",
    endDate: "2026-07-23",
    page: 1,
    limit: 1,
  });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].id, "audit_1");
});

test("audit metadata recursively redacts credentials", () => {
  const safe = sanitizeAuditMetadata({
    token: "do-not-leak",
    nested: {
      passwordHash: "do-not-leak",
      oneTimeCode: "123456",
      totpSeed: "do-not-leak",
      recoveryCode: "do-not-leak",
      claimCode: "do-not-leak",
      proofOfPossession: "do-not-leak",
      verificationLink: "https://private.example/verify",
      resetLink: "https://private.example/reset",
      result: "ok",
    },
    list: [{ apiKey: "do-not-leak", sessionCookie: "do-not-leak" }],
  });
  assert.deepEqual(safe, {
    token: "[REDACTED]",
    nested: {
      passwordHash: "[REDACTED]",
      oneTimeCode: "[REDACTED]",
      totpSeed: "[REDACTED]",
      recoveryCode: "[REDACTED]",
      claimCode: "[REDACTED]",
      proofOfPossession: "[REDACTED]",
      verificationLink: "[REDACTED]",
      resetLink: "[REDACTED]",
      result: "ok",
    },
    list: [{ apiKey: "[REDACTED]", sessionCookie: "[REDACTED]" }],
  });
});
