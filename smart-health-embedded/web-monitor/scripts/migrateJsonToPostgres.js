const fs = require("node:fs");
const path = require("node:path");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function valueOrNull(value) {
  return value === undefined || value === "" ? null : value;
}

async function runMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = path.join(__dirname, "..", "db", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    const existing = await client.query("SELECT 1 FROM schema_migrations WHERE id = $1", [id]);
    if (existing.rowCount > 0) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
}

async function upsertOrganization(client, organization) {
  await client.query(
    `
      INSERT INTO organizations (id, name, type, created_at, updated_at)
      VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), COALESCE($5::timestamptz, now()))
      ON CONFLICT (id)
      DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = EXCLUDED.updated_at
    `,
    [
      organization.id,
      organization.name || organization.id,
      organization.type || "clinic",
      toIso(organization.createdAt),
      toIso(organization.updatedAt),
    ]
  );
}

async function upsertUser(client, user) {
  await client.query(
    `
      INSERT INTO users (
        id, firebase_uid, email, phone, role, name, password_hash, license, hospital, department,
        address, organization_id, patient_id, verified_email, verified_phone, account_status,
        requested_role, role_request_status, role_requested_at, role_approved_at, role_rejected_at,
        role_reject_reason, role_info_request_at, role_info_request_message, firebase_claims,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21,
        $22, $23, $24, $25::jsonb,
        COALESCE($26::timestamptz, now()), COALESCE($27::timestamptz, now())
      )
      ON CONFLICT (id)
      DO UPDATE SET
        firebase_uid = COALESCE(EXCLUDED.firebase_uid, users.firebase_uid),
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        license = EXCLUDED.license,
        hospital = EXCLUDED.hospital,
        department = EXCLUDED.department,
        address = EXCLUDED.address,
        organization_id = EXCLUDED.organization_id,
        patient_id = EXCLUDED.patient_id,
        verified_email = EXCLUDED.verified_email,
        verified_phone = EXCLUDED.verified_phone,
        account_status = EXCLUDED.account_status,
        requested_role = EXCLUDED.requested_role,
        role_request_status = EXCLUDED.role_request_status,
        role_requested_at = EXCLUDED.role_requested_at,
        role_approved_at = EXCLUDED.role_approved_at,
        role_rejected_at = EXCLUDED.role_rejected_at,
        role_reject_reason = EXCLUDED.role_reject_reason,
        role_info_request_at = EXCLUDED.role_info_request_at,
        role_info_request_message = EXCLUDED.role_info_request_message,
        firebase_claims = EXCLUDED.firebase_claims,
        updated_at = EXCLUDED.updated_at
    `,
    [
      user.id,
      valueOrNull(user.firebaseUid),
      valueOrNull(user.email),
      valueOrNull(user.phone),
      user.role || "patient",
      user.name || user.email || user.id,
      valueOrNull(user.passwordHash || user.password),
      valueOrNull(user.license),
      valueOrNull(user.hospital),
      valueOrNull(user.department),
      valueOrNull(user.address),
      valueOrNull(user.organizationId),
      valueOrNull(user.patientId),
      Boolean(user.verifiedEmail),
      Boolean(user.verifiedPhone),
      user.accountStatus || "active",
      valueOrNull(user.requestedRole),
      valueOrNull(user.roleRequestStatus),
      toIso(user.roleRequestedAt),
      toIso(user.roleApprovedAt),
      toIso(user.roleRejectedAt),
      valueOrNull(user.roleRejectReason),
      toIso(user.roleInfoRequestAt),
      valueOrNull(user.roleInfoRequestMessage),
      JSON.stringify(user.firebaseClaims || {}),
      toIso(user.createdAt),
      toIso(user.updatedAt),
    ]
  );
}

async function upsertMembership(client, membership) {
  await client.query(
    `
      INSERT INTO memberships (id, organization_id, user_id, role, created_at)
      VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET role = EXCLUDED.role
    `,
    [
      membership.id,
      membership.organizationId,
      membership.userId,
      membership.role || "patient",
      toIso(membership.createdAt),
    ]
  );
}

async function upsertNotification(client, notification) {
  await client.query(
    `
      INSERT INTO notifications (id, user_id, organization_id, type, title, message, read_at, created_at, updated_at)
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        COALESCE($8::timestamptz, now()), COALESCE($9::timestamptz, now())
      )
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        organization_id = EXCLUDED.organization_id,
        type = EXCLUDED.type,
        title = EXCLUDED.title,
        message = EXCLUDED.message,
        read_at = EXCLUDED.read_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      notification.id,
      valueOrNull(notification.userId),
      valueOrNull(notification.organizationId),
      notification.type || "info",
      notification.title || "",
      notification.message || "",
      notification.read || notification.readAt ? toIso(notification.readAt) || toIso(notification.updatedAt) || new Date().toISOString() : null,
      toIso(notification.createdAt),
      toIso(notification.updatedAt),
    ]
  );
}

async function upsertPatient(client, patient) {
  await client.query(
    `
      INSERT INTO patients (
        id, organization_id, owner_user_id, patient_code, name, age, gender, phone, email, address, notes, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        COALESCE($12::timestamptz, now()), COALESCE($13::timestamptz, now())
      )
      ON CONFLICT (id)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        owner_user_id = EXCLUDED.owner_user_id,
        patient_code = EXCLUDED.patient_code,
        name = EXCLUDED.name,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        address = EXCLUDED.address,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at
    `,
    [
      patient.id,
      valueOrNull(patient.organizationId),
      valueOrNull(patient.ownerUserId),
      patient.patientCode || patient.id,
      patient.name || patient.patientCode || patient.id,
      patient.age === undefined || patient.age === "" ? null : patient.age,
      valueOrNull(patient.gender),
      valueOrNull(patient.phone),
      valueOrNull(patient.email),
      valueOrNull(patient.address),
      valueOrNull(patient.notes),
      toIso(patient.createdAt),
      toIso(patient.updatedAt),
    ]
  );
}

async function upsertDevice(client, device) {
  await client.query(
    `
      INSERT INTO devices (
        id, organization_id, paired_user_id, name, type, status, signal, battery, connected,
        connection_method, secret_hash, firmware_version, last_seen_at, revoked_at, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, COALESCE($15::timestamptz, now()), COALESCE($16::timestamptz, now())
      )
      ON CONFLICT (id)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        paired_user_id = EXCLUDED.paired_user_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        status = EXCLUDED.status,
        signal = EXCLUDED.signal,
        battery = EXCLUDED.battery,
        connected = EXCLUDED.connected,
        connection_method = EXCLUDED.connection_method,
        secret_hash = EXCLUDED.secret_hash,
        firmware_version = EXCLUDED.firmware_version,
        last_seen_at = EXCLUDED.last_seen_at,
        revoked_at = EXCLUDED.revoked_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      device.id,
      valueOrNull(device.organizationId),
      valueOrNull(device.pairedUserId),
      device.name || device.id,
      device.type || "stethoscope",
      device.status || "unclaimed",
      device.signal === undefined || device.signal === "" ? null : device.signal,
      device.battery === undefined || device.battery === "" ? null : device.battery,
      Boolean(device.connected),
      valueOrNull(device.connectionMethod),
      valueOrNull(device.secretHash || device.secret),
      valueOrNull(device.firmwareVersion || device.firmware),
      toIso(device.lastSeenAt),
      toIso(device.revokedAt),
      toIso(device.createdAt),
      toIso(device.updatedAt),
    ]
  );
}

async function upsertScan(client, scan) {
  await client.query(
    `
      INSERT INTO scan_sessions (
        id, organization_id, patient_id, device_id, created_by_user_id, idempotency_key, status,
        processing_status, mode, body_site, started_at, ended_at, sample_rate, sample_count,
        duration_seconds, peak, rms, level_percent, bpm, ai_label, ai_confidence, ai_summary,
        doctor_notes, audio_url, wav_file, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, COALESCE($11::timestamptz, now()), $12::timestamptz, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, COALESCE($26::timestamptz, now()), COALESCE($27::timestamptz, now())
      )
      ON CONFLICT (id)
      DO UPDATE SET
        status = EXCLUDED.status,
        processing_status = EXCLUDED.processing_status,
        audio_url = EXCLUDED.audio_url,
        wav_file = EXCLUDED.wav_file,
        updated_at = EXCLUDED.updated_at
    `,
    [
      scan.id,
      valueOrNull(scan.organizationId),
      scan.patientId,
      valueOrNull(scan.deviceId),
      valueOrNull(scan.createdByUserId),
      valueOrNull(scan.idempotencyKey),
      scan.status || "recording",
      scan.processingStatus || scan.status || "recording",
      scan.mode || "heart",
      valueOrNull(scan.bodySite),
      toIso(scan.startedAt || scan.createdAt),
      toIso(scan.endedAt),
      scan.sampleRate || 16000,
      scan.sampleCount || 0,
      scan.durationSeconds || 0,
      scan.peak || 0,
      scan.rms || 0,
      scan.levelPercent || 0,
      scan.bpm || 0,
      valueOrNull(scan.aiLabel),
      scan.aiConfidence === undefined || scan.aiConfidence === "" ? null : scan.aiConfidence,
      valueOrNull(scan.aiSummary),
      valueOrNull(scan.doctorNotes),
      valueOrNull(scan.audioUrl),
      valueOrNull(scan.wavFile),
      toIso(scan.createdAt || scan.startedAt),
      toIso(scan.updatedAt),
    ]
  );
}

async function upsertAudioFile(client, audioFile) {
  await client.query(
    `
      INSERT INTO audio_files (id, scan_id, patient_id, storage_provider, object_key, content_type, byte_size, sample_rate, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
      ON CONFLICT (id)
      DO UPDATE SET storage_provider = EXCLUDED.storage_provider, object_key = EXCLUDED.object_key, byte_size = EXCLUDED.byte_size
    `,
    [
      audioFile.id,
      audioFile.scanId,
      audioFile.patientId,
      audioFile.storageProvider || "local",
      audioFile.objectKey,
      audioFile.contentType || "audio/wav",
      audioFile.byteSize || 0,
      audioFile.sampleRate || 16000,
      toIso(audioFile.createdAt),
    ]
  );
}

async function upsertAiResult(client, aiResult) {
  await client.query(
    `
      INSERT INTO ai_results (id, scan_id, model_version, label, confidence, summary, raw_result, status, error_code, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, COALESCE($10::timestamptz, now()), COALESCE($11::timestamptz, now()))
      ON CONFLICT (id)
      DO UPDATE SET label = EXCLUDED.label, confidence = EXCLUDED.confidence, summary = EXCLUDED.summary, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
    `,
    [
      aiResult.id,
      aiResult.scanId,
      aiResult.modelVersion || "signal-quality-demo",
      valueOrNull(aiResult.label),
      aiResult.confidence === undefined || aiResult.confidence === "" ? null : aiResult.confidence,
      valueOrNull(aiResult.summary),
      JSON.stringify(aiResult.rawResult || {}),
      aiResult.status || "completed",
      valueOrNull(aiResult.errorCode),
      toIso(aiResult.createdAt),
      toIso(aiResult.updatedAt),
    ]
  );
}

async function insertAuditLog(client, log) {
  await client.query(
    `
      INSERT INTO audit_logs (
        id, actor_user_id, organization_id, action, resource_type, resource_id, ip, user_agent, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::inet, $8, $9::jsonb, COALESCE($10::timestamptz, now()))
      ON CONFLICT (id) DO NOTHING
    `,
    [
      log.id,
      valueOrNull(log.actorUserId || log.userId),
      valueOrNull(log.organizationId),
      log.action || "legacy.access_log",
      valueOrNull(log.resourceType),
      valueOrNull(log.resourceId),
      valueOrNull(log.ip),
      valueOrNull(log.userAgent || log.device),
      JSON.stringify(log.metadata || log.detail || log),
      toIso(log.createdAt),
    ]
  );
}

function ensureDefaultOrganization(db) {
  if (Array.isArray(db.organizations) && db.organizations.length > 0) {
    return;
  }
  db.organizations = [
    {
      id: "org_default_clinic",
      name: "Smart Health Clinic",
      type: "clinic",
      createdAt: db.createdAt,
      updatedAt: db.updatedAt,
    },
  ];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const dbFile = path.resolve(process.env.DB_FILE || path.join(__dirname, "..", "data", "db.json"));
  if (!fs.existsSync(dbFile)) {
    throw new Error(`Không tìm thấy file dữ liệu JSON: ${dbFile}`);
  }

  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await runMigrations(client);
    const db = readJson(dbFile);
    ensureDefaultOrganization(db);

    const counters = {
      organizations: 0,
      users: 0,
      memberships: 0,
      patients: 0,
      devices: 0,
      scans: 0,
      audioFiles: 0,
      aiResults: 0,
      notifications: 0,
      auditLogs: 0,
    };

    await client.query("BEGIN");
    try {
      const organizationIds = new Set((db.organizations || []).map((organization) => organization.id));
      const userIds = new Set((db.users || []).map((user) => user.id));

      for (const organization of db.organizations || []) {
        await upsertOrganization(client, organization);
        counters.organizations += 1;
      }

      for (const user of db.users || []) {
        await upsertUser(client, user);
        counters.users += 1;
      }

      for (const membership of db.memberships || []) {
        await upsertMembership(client, membership);
        counters.memberships += 1;
      }

      for (const patient of db.patients || []) {
        await upsertPatient(client, {
          ...patient,
          organizationId: organizationIds.has(patient.organizationId) ? patient.organizationId : "org_default_clinic",
          ownerUserId: userIds.has(patient.ownerUserId) ? patient.ownerUserId : "",
        });
        counters.patients += 1;
      }

      for (const device of db.devices || []) {
        await upsertDevice(client, {
          ...device,
          organizationId: organizationIds.has(device.organizationId) ? device.organizationId : "org_default_clinic",
          pairedUserId: userIds.has(device.pairedUserId) ? device.pairedUserId : "",
        });
        counters.devices += 1;
      }

      const patientIds = new Set((db.patients || []).map((patient) => patient.id));
      const deviceIds = new Set((db.devices || []).map((device) => device.id));
      const scanIds = new Set((db.scans || []).map((scan) => scan.id));

      for (const scan of db.scans || []) {
        if (!patientIds.has(scan.patientId)) continue;
        await upsertScan(client, {
          ...scan,
          organizationId: organizationIds.has(scan.organizationId) ? scan.organizationId : "org_default_clinic",
          deviceId: deviceIds.has(scan.deviceId) ? scan.deviceId : null,
          createdByUserId: userIds.has(scan.createdByUserId) ? scan.createdByUserId : null,
        });
        counters.scans += 1;
      }

      for (const audioFile of db.audioFiles || []) {
        if (!scanIds.has(audioFile.scanId) || !patientIds.has(audioFile.patientId)) continue;
        await upsertAudioFile(client, audioFile);
        counters.audioFiles += 1;
      }

      for (const aiResult of db.aiResults || []) {
        if (!scanIds.has(aiResult.scanId)) continue;
        await upsertAiResult(client, aiResult);
        counters.aiResults += 1;
      }

      for (const notification of db.notifications || []) {
        await upsertNotification(client, notification);
        counters.notifications += 1;
      }

      for (const log of db.auditLogs || []) {
        await insertAuditLog(client, log);
        counters.auditLogs += 1;
      }

      for (const log of db.accessLogs || []) {
        await insertAuditLog(client, {
          id: `legacy_${log.id}`,
          action: log.action || "legacy.access_log",
          ip: log.ip || "",
          userAgent: log.device || "",
          metadata: log,
          createdAt: log.createdAt,
        });
        counters.auditLogs += 1;
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    console.log("Migration JSON -> PostgreSQL hoàn tất:");
    for (const [name, count] of Object.entries(counters)) {
      console.log(`- ${name}: ${count}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
