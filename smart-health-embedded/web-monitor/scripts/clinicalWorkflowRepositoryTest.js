const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createClinicalWorkflowRepository } = require("../src/clinicalWorkflowRepository");

function createHarness(overrides = {}) {
  let sequence = 0;
  const now = "2026-07-18T08:00:00.000Z";
  const db = {
    scans: [
      {
        id: "scan_alpha",
        organizationId: "org_alpha",
        patientId: "patient_alpha",
        deviceId: "device_alpha",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "scan_beta",
        organizationId: "org_beta",
        patientId: "patient_beta",
        deviceId: "device_beta",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      },
    ],
    scanReviews: [],
    clinicalAlerts: [],
    auditLogs: [],
    idempotencyKeys: [],
  };
  const repository = createClinicalWorkflowRepository({
    getDb: () => db,
    saveDb: overrides.saveDb || (async () => {}),
    getPool: () => null,
    createId: (prefix) => `${prefix}_${++sequence}`,
    nowIso: () => now,
  });
  return { db, repository };
}

function idempotency(operation, key, fingerprint) {
  return { scope: "org_alpha:usr_doctor", operation, key, fingerprint };
}

test("review queue derives pending work and commits one audited optimistic decision", async () => {
  const { db, repository } = createHarness();

  const pending = await repository.reviews.list({ organizationId: "org_alpha", status: "pending" });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].scanId, "scan_alpha");
  assert.equal(pending[0].status, "pending");
  assert.equal(pending[0].version, 1);

  const mutation = {
    organizationId: "org_alpha",
    scanId: "scan_alpha",
    decision: "follow_up_required",
    note: "Schedule a clinician follow-up.",
    reviewerUserId: "usr_doctor",
    expectedVersion: 1,
    idempotency: idempotency("scan.review.decision:scan_alpha", "review-alpha", "review-fingerprint"),
    audit: { actorUserId: "usr_doctor", ip: "127.0.0.1", userAgent: "test" },
  };
  const decided = await repository.reviews.decide(mutation);

  assert.equal(decided.replayed, false);
  assert.equal(decided.review.status, "reviewed");
  assert.equal(decided.review.decision, "follow_up_required");
  assert.equal(decided.review.reviewerUserId, "usr_doctor");
  assert.equal(decided.review.version, 2);
  assert.equal(db.scanReviews.length, 1);
  assert.equal(db.auditLogs.filter((item) => item.action === "scan.review.decision").length, 1);
  assert.equal(db.idempotencyKeys.length, 1);

  const replay = await repository.reviews.decide(mutation);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.review, decided.review);
  assert.equal(db.auditLogs.length, 1);

  await assert.rejects(
    repository.reviews.decide({
      ...mutation,
      decision: "accepted",
      idempotency: idempotency("scan.review.decision:scan_alpha", "review-alpha", "different-fingerprint"),
    }),
    (error) => error.statusCode === 409 && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("review mutation rejects cross-workspace access before writing audit state", async () => {
  const { db, repository } = createHarness();
  await assert.rejects(
    repository.reviews.decide({
      organizationId: "org_alpha",
      scanId: "scan_beta",
      decision: "accepted",
      note: "Reviewed.",
      reviewerUserId: "usr_doctor",
      expectedVersion: 1,
      idempotency: idempotency("scan.review.decision:scan_beta", "review-beta", "review-beta-fingerprint"),
      audit: { actorUserId: "usr_doctor" },
    }),
    (error) => error.statusCode === 403 && error.code === "REVIEW_SCOPE_DENIED",
  );
  assert.deepEqual(db.scanReviews, []);
  assert.deepEqual(db.auditLogs, []);
  assert.deepEqual(db.idempotencyKeys, []);
});

test("alert source is deduplicated and lifecycle mutations are audited and versioned", async () => {
  const { db, repository } = createHarness();
  const opened = await repository.alerts.upsertSource({
    organizationId: "org_alpha",
    sourceType: "device",
    sourceId: "device_alpha",
    severity: "warning",
    title: "Device offline",
    message: "No heartbeat received.",
    deviceId: "device_alpha",
    actorUserId: "usr_doctor",
    idempotency: idempotency("alert.source:device:device_alpha", "alert-open", "alert-open-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(opened.alert.status, "open");
  assert.equal(opened.alert.version, 1);

  const duplicate = await repository.alerts.upsertSource({
    organizationId: "org_alpha",
    sourceType: "device",
    sourceId: "device_alpha",
    severity: "critical",
    title: "Duplicate signal",
    message: "Must not create another ledger row.",
    deviceId: "device_alpha",
    actorUserId: "usr_doctor",
    idempotency: idempotency("alert.source:device:device_alpha", "alert-open-duplicate", "alert-open-duplicate-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(duplicate.deduplicated, true);
  assert.equal(duplicate.alert.id, opened.alert.id);
  assert.equal(db.clinicalAlerts.length, 1);
  assert.equal(db.auditLogs.filter((item) => item.action === "alert.open").length, 1);

  const acknowledged = await repository.alerts.transition({
    organizationId: "org_alpha",
    alertId: opened.alert.id,
    action: "acknowledge",
    actorUserId: "usr_doctor",
    expectedVersion: 1,
    note: "Investigating connectivity.",
    idempotency: idempotency(`alert.acknowledge:${opened.alert.id}`, "alert-ack", "alert-ack-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(acknowledged.alert.status, "acknowledged");
  assert.equal(acknowledged.alert.version, 2);
  assert.equal(acknowledged.alert.acknowledgedByUserId, "usr_doctor");

  const replay = await repository.alerts.transition({
    organizationId: "org_alpha",
    alertId: opened.alert.id,
    action: "acknowledge",
    actorUserId: "usr_doctor",
    expectedVersion: 1,
    note: "Investigating connectivity.",
    idempotency: idempotency(`alert.acknowledge:${opened.alert.id}`, "alert-ack", "alert-ack-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(replay.replayed, true);
  assert.equal(db.auditLogs.filter((item) => item.action === "alert.acknowledge").length, 1);

  const resolved = await repository.alerts.transition({
    organizationId: "org_alpha",
    alertId: opened.alert.id,
    action: "resolve",
    actorUserId: "usr_doctor",
    expectedVersion: 2,
    note: "Device reconnected and heartbeat is stable.",
    idempotency: idempotency(`alert.resolve:${opened.alert.id}`, "alert-resolve", "alert-resolve-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(resolved.alert.status, "resolved");
  assert.equal(resolved.alert.version, 3);
  assert.equal(resolved.alert.resolvedByUserId, "usr_doctor");
  assert.equal(db.auditLogs.filter((item) => item.action === "alert.resolve").length, 1);

  const recurrence = await repository.alerts.upsertSource({
    organizationId: "org_alpha",
    sourceType: "device",
    sourceId: "device_alpha",
    severity: "critical",
    title: "Device offline again",
    message: "A new heartbeat outage occurred after resolution.",
    deviceId: "device_alpha",
    actorUserId: "usr_doctor",
    idempotency: idempotency("alert.source:device:device_alpha", "alert-recurrence", "alert-recurrence-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(recurrence.deduplicated, false);
  assert.equal(recurrence.recurrence, true);
  assert.notEqual(recurrence.alert.id, resolved.alert.id);
  assert.equal(recurrence.alert.status, "open");
  assert.equal(recurrence.alert.occurrenceNumber, 2);
  assert.equal(recurrence.alert.previousAlertId, resolved.alert.id);
  assert.equal(recurrence.alert.severity, "critical");
  assert.equal(recurrence.alert.title, "Device offline again");
  assert.equal(recurrence.alert.message, "A new heartbeat outage occurred after resolution.");
  assert.equal(recurrence.alert.version, 1);
  assert.ok(recurrence.alert.occurredAt);
  assert.equal(db.clinicalAlerts.length, 2);
  assert.equal(db.clinicalAlerts.find((item) => item.id === resolved.alert.id).status, "resolved");
  assert.equal(db.auditLogs.filter((item) => item.action === "alert.reopen").length, 1);

  const activeDuplicate = await repository.alerts.upsertSource({
    organizationId: "org_alpha",
    sourceType: "device",
    sourceId: "device_alpha",
    severity: "warning",
    title: "Must not replace active occurrence",
    message: "Active alerts are deduplicated.",
    deviceId: "device_alpha",
    actorUserId: "usr_doctor",
    idempotency: idempotency("alert.source:device:device_alpha", "alert-active-dedupe", "alert-active-dedupe-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(activeDuplicate.deduplicated, true);
  assert.equal(activeDuplicate.alert.id, recurrence.alert.id);
  assert.equal(activeDuplicate.alert.title, "Device offline again");
  assert.equal(db.clinicalAlerts.length, 2);
  assert.equal(db.auditLogs.filter((item) => item.action === "alert.reopen").length, 1);
});

test("PostgreSQL recurrence creates a new occurrence and commits audit plus idempotency", async () => {
  const timestamp = "2026-07-18T09:00:00.000Z";
  const queries = [];
  const db = {
    scans: [], scanReviews: [], clinicalAlerts: [], auditLogs: [], idempotencyKeys: [],
  };
  const resolvedRow = {
    id: "alert_resolved_sql",
    organization_id: "org_alpha",
    source_type: "device",
    source_id: "device_alpha",
    dedupe_key: "device:device_alpha",
    occurrence_number: 1,
    previous_alert_id: null,
    occurred_at: "2026-07-18T08:00:00.000Z",
    status: "resolved",
    severity: "warning",
    title: "First outage",
    message: "Resolved outage",
    device_id: "device_alpha",
    version: 3,
    resolved_by_user_id: "usr_doctor",
    resolved_at: "2026-07-18T08:30:00.000Z",
    resolution_note: "Recovered",
    metadata: {},
    created_at: "2026-07-18T08:00:00.000Z",
    updated_at: "2026-07-18T08:30:00.000Z",
  };
  const pool = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      queries.push({ text, params });
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rowCount: 0, rows: [] };
      if (text.includes("pg_advisory_xact_lock")) return { rowCount: 1, rows: [{}] };
      if (text.includes("FROM mutation_idempotency")) return { rowCount: 0, rows: [] };
      if (text.includes("FROM clinical_alerts") && text.includes("dedupe_key")) {
        return { rowCount: 1, rows: [resolvedRow] };
      }
      if (text.startsWith("INSERT INTO clinical_alerts")) {
        return {
          rowCount: 1,
          rows: [{
            id: params[0],
            organization_id: params[1],
            source_type: params[2],
            source_id: params[3],
            dedupe_key: params[4],
            occurrence_number: params[5],
            previous_alert_id: params[6],
            occurred_at: params[7],
            status: "open",
            severity: params[8],
            title: params[9],
            message: params[10],
            patient_id: params[11],
            device_id: params[12],
            scan_id: params[13],
            metadata: JSON.parse(params[14]),
            version: 1,
            created_at: params[7],
            updated_at: params[7],
          }],
        };
      }
      if (text.startsWith("INSERT INTO audit_logs")) return { rowCount: 1, rows: [] };
      if (text.startsWith("INSERT INTO mutation_idempotency")) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected SQL: ${text}`);
    },
  };
  let sequence = 0;
  const repository = createClinicalWorkflowRepository({
    getDb: () => db,
    saveDb: async () => {},
    getPool: () => pool,
    createId: (prefix) => `${prefix}_sql_${++sequence}`,
    nowIso: () => timestamp,
  });
  const result = await repository.alerts.upsertSource({
    organizationId: "org_alpha",
    sourceType: "device",
    sourceId: "device_alpha",
    severity: "critical",
    title: "Second outage",
    message: "The source failed again.",
    deviceId: "device_alpha",
    actorUserId: "usr_doctor",
    idempotency: idempotency("alert.source:device:device_alpha", "sql-recurrence", "sql-recurrence-fingerprint"),
    audit: { actorUserId: "usr_doctor" },
  });
  assert.equal(result.recurrence, true);
  assert.equal(result.deduplicated, false);
  assert.equal(result.alert.occurrenceNumber, 2);
  assert.equal(result.alert.previousAlertId, "alert_resolved_sql");
  assert.equal(result.alert.title, "Second outage");
  assert.equal(result.alert.version, 1);
  const insertedAlert = queries.find((query) => query.text.startsWith("INSERT INTO clinical_alerts"));
  assert.match(insertedAlert.text, /occurrence_number, previous_alert_id, occurred_at/i);
  assert.equal(insertedAlert.params[5], 2);
  assert.equal(insertedAlert.params[6], "alert_resolved_sql");
  const auditInsert = queries.find((query) => query.text.startsWith("INSERT INTO audit_logs"));
  assert.equal(auditInsert.params[3], "alert.reopen");
  assert.ok(queries.some((query) => query.text.startsWith("INSERT INTO mutation_idempotency")));
  assert.ok(queries.some((query) => query.text === "COMMIT"));
});

test("alert transition rejects cross-workspace access and stale optimistic versions", async () => {
  const { db, repository } = createHarness();
  db.clinicalAlerts.push({
    id: "alert_beta",
    organizationId: "org_beta",
    sourceType: "device",
    sourceId: "device_beta",
    dedupeKey: "device:device_beta",
    status: "open",
    severity: "warning",
    title: "Beta only",
    message: "Private tenant state",
    version: 1,
    createdAt: "2026-07-18T08:00:00.000Z",
    updatedAt: "2026-07-18T08:00:00.000Z",
  });

  await assert.rejects(
    repository.alerts.transition({
      organizationId: "org_alpha",
      alertId: "alert_beta",
      action: "acknowledge",
      actorUserId: "usr_doctor",
      expectedVersion: 1,
      idempotency: idempotency("alert.acknowledge:alert_beta", "cross-alert", "cross-alert-fingerprint"),
      audit: { actorUserId: "usr_doctor" },
    }),
    (error) => error.statusCode === 403 && error.code === "ALERT_SCOPE_DENIED",
  );
  assert.equal(db.auditLogs.length, 0);

  db.clinicalAlerts[0].organizationId = "org_alpha";
  await assert.rejects(
    repository.alerts.transition({
      organizationId: "org_alpha",
      alertId: "alert_beta",
      action: "acknowledge",
      actorUserId: "usr_doctor",
      expectedVersion: 9,
      idempotency: idempotency("alert.acknowledge:alert_beta", "stale-alert", "stale-alert-fingerprint"),
      audit: { actorUserId: "usr_doctor" },
    }),
    (error) => error.statusCode === 409 && error.code === "ALERT_VERSION_CONFLICT",
  );
  assert.equal(db.auditLogs.length, 0);
});

test("concurrent source reports with different idempotency keys still create one alert", async () => {
  const { db, repository } = createHarness();
  const base = {
    organizationId: "org_alpha",
    sourceType: "scan",
    sourceId: "scan_alpha",
    severity: "warning",
    title: "Signal quality warning",
    message: "The same source was reported concurrently.",
    scanId: "scan_alpha",
    actorUserId: "usr_doctor",
    audit: { actorUserId: "usr_doctor" },
  };
  const [first, second] = await Promise.all([
    repository.alerts.upsertSource({
      ...base,
      idempotency: idempotency("alert.source:scan:scan_alpha", "parallel-source-a", "parallel-source-fingerprint-a"),
    }),
    repository.alerts.upsertSource({
      ...base,
      idempotency: idempotency("alert.source:scan:scan_alpha", "parallel-source-b", "parallel-source-fingerprint-b"),
    }),
  ]);
  assert.equal(first.alert.id, second.alert.id);
  assert.deepEqual([first.deduplicated, second.deduplicated].sort(), [false, true]);
  assert.equal(db.clinicalAlerts.length, 1);
  assert.equal(db.auditLogs.filter((item) => item.action === "alert.open").length, 1);
  assert.equal(db.idempotencyKeys.length, 2);
});

test("JSON mutation rolls back ledger, audit, and idempotency together when persistence fails", async () => {
  const { db, repository } = createHarness({ saveDb: async () => { throw new Error("disk unavailable"); } });
  await assert.rejects(
    repository.alerts.upsertSource({
      organizationId: "org_alpha",
      sourceType: "scan",
      sourceId: "scan_alpha",
      severity: "warning",
      title: "Review needed",
      message: "Signal quality requires review.",
      scanId: "scan_alpha",
      actorUserId: "usr_doctor",
      idempotency: idempotency("alert.source:scan:scan_alpha", "rollback-alert", "rollback-alert-fingerprint"),
      audit: { actorUserId: "usr_doctor" },
    }),
    /disk unavailable/,
  );
  assert.deepEqual(db.clinicalAlerts, []);
  assert.deepEqual(db.auditLogs, []);
  assert.deepEqual(db.idempotencyKeys, []);
});

test("clinical workflow migration defines tenant keys, lifecycle constraints, dedupe, and versions", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "029_clinical_review_alert_ledgers.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS scan_reviews/i);
  assert.match(migration, /CHECK \(status IN \('pending', 'reviewed'\)\)/i);
  assert.match(migration, /accepted.*repeat_measurement.*follow_up_required/is);
  assert.match(migration, /version integer NOT NULL DEFAULT 1/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS clinical_alerts/i);
  assert.match(migration, /CHECK \(status IN \('open', 'acknowledged', 'resolved'\)\)/i);
  assert.match(migration, /clinical_alerts_one_active_source_uidx[\s\S]*WHERE status IN \('open', 'acknowledged'\)/i);
  assert.match(migration, /clinical_alerts_source_occurrence_uidx/i);
  assert.match(migration, /occurrence_number integer NOT NULL DEFAULT 1/i);
  assert.match(migration, /previous_alert_id text REFERENCES clinical_alerts\(id\)/i);
  assert.match(migration, /ALTER TABLE scan_reviews ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /ALTER TABLE clinical_alerts ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE scan_reviews FROM PUBLIC/i);
  assert.match(migration, /REVOKE ALL ON TABLE clinical_alerts FROM authenticated/i);
});
