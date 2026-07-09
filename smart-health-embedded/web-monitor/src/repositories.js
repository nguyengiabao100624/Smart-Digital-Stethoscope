function toIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function optional(value) {
  return value === undefined ? null : value;
}

function optionalTimestamp(value) {
  return value ? value : null;
}

function objectOf(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function profileClaimsFromUser(user = {}) {
  return {
    title: user.title || "",
    specialty: user.specialty || "",
    avatarFileId: user.avatarFileId || "",
    avatarUrl: user.avatarUrl || "",
    avatarStorage: objectOf(user.avatarStorage),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    twoFactorMethod: user.twoFactorMethod || "",
    twoFactorSecretPreview: user.twoFactorSecretPreview || "",
    twoFactorRecoveryCodes: Array.isArray(user.twoFactorRecoveryCodes) ? user.twoFactorRecoveryCodes : [],
    notificationPreferences: objectOf(user.notificationPreferences),
  };
}

function firebaseClaimsForUser(user = {}) {
  const claims = { ...objectOf(user.firebaseClaims) };
  const existingProfile = objectOf(claims.profile);
  const registrationReason = user.registrationReason || claims.registrationReason || existingProfile.registrationReason || "";
  if (registrationReason) {
    claims.registrationReason = registrationReason;
  }
  const workspaceType = user.workspaceType || claims.workspaceType || existingProfile.workspaceType || "";
  if (workspaceType) {
    claims.workspaceType = workspaceType;
  }
  const accountType = user.accountType || claims.accountType || existingProfile.accountType || "";
  if (accountType) {
    claims.accountType = accountType;
  }
  const clinicSuggestion = user.clinicSuggestion || claims.clinicSuggestion || existingProfile.clinicSuggestion || "";
  if (clinicSuggestion) {
    claims.clinicSuggestion = clinicSuggestion;
  }
  if (Array.isArray(user.roleInfoRequiredFields)) {
    claims.roleInfoRequiredFields = user.roleInfoRequiredFields;
  }
  claims.profile = {
    ...existingProfile,
    ...profileClaimsFromUser(user),
  };
  return claims;
}

function rowToUser(row) {
  if (!row) return null;
  const firebaseClaims = objectOf(row.firebase_claims);
  const profile = objectOf(firebaseClaims.profile);
  const roleInfoRequiredFields = Array.isArray(firebaseClaims.roleInfoRequiredFields)
    ? firebaseClaims.roleInfoRequiredFields
    : Array.isArray(profile.roleInfoRequiredFields)
      ? profile.roleInfoRequiredFields
      : [];
  return {
    id: row.id,
    firebaseUid: row.firebase_uid || "",
    email: row.email || "",
    phone: row.phone || "",
    role: row.role || "patient",
    name: row.name || "",
    title: profile.title || "",
    password: row.password_hash || "",
    license: row.license || "",
    hospital: row.hospital || "",
    department: row.department || "",
    specialty: profile.specialty || "",
    address: row.address || "",
    avatarFileId: profile.avatarFileId || "",
    avatarUrl: profile.avatarUrl || "",
    avatarStorage: objectOf(profile.avatarStorage),
    twoFactorEnabled: Boolean(profile.twoFactorEnabled),
    twoFactorMethod: profile.twoFactorMethod || "",
    twoFactorSecretPreview: profile.twoFactorSecretPreview || "",
    twoFactorRecoveryCodes: Array.isArray(profile.twoFactorRecoveryCodes) ? profile.twoFactorRecoveryCodes : [],
    notificationPreferences: objectOf(profile.notificationPreferences),
    organizationId: row.organization_id || "",
    patientId: row.patient_id || "",
    verifiedEmail: Boolean(row.verified_email),
    verifiedPhone: Boolean(row.verified_phone),
    accountStatus: row.account_status || "active",
    requestedRole: row.requested_role || "",
    roleRequestStatus: row.role_request_status || "",
    roleRequestedAt: toIso(row.role_requested_at),
    roleApprovedAt: toIso(row.role_approved_at),
    roleRejectedAt: toIso(row.role_rejected_at),
    roleRejectReason: row.role_reject_reason || "",
    roleInfoRequestAt: toIso(row.role_info_request_at),
    roleInfoRequestMessage: row.role_info_request_message || "",
    roleInfoRequiredFields,
    registrationReason: row.registration_reason || firebaseClaims.registrationReason || profile.registrationReason || "",
    workspaceType: firebaseClaims.workspaceType || profile.workspaceType || "",
    accountType: firebaseClaims.accountType || profile.accountType || "",
    clinicSuggestion: firebaseClaims.clinicSuggestion || profile.clinicSuggestion || "",
    firebaseClaims,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToNotification(row) {
  if (!row) return null;
  let pushAttempts = [];
  if (Array.isArray(row.push_attempts)) {
    pushAttempts = row.push_attempts;
  } else if (typeof row.push_attempts === "string") {
    try {
      const parsed = JSON.parse(row.push_attempts || "[]");
      pushAttempts = Array.isArray(parsed) ? parsed : [];
    } catch {
      pushAttempts = [];
    }
  }
  return {
    id: row.id,
    userId: row.user_id || "",
    organizationId: row.organization_id || "",
    type: row.type || "info",
    title: row.title || "",
    message: row.message || "",
    channel: row.channel || "in_app",
    deliveryStatus: row.delivery_status || "ready",
    sentAt: toIso(row.sent_at),
    failedAt: toIso(row.failed_at),
    retryCount: row.retry_count || 0,
    errorMessage: row.error_message || "",
    pushStatus: row.push_status || "ready",
    pushSentAt: toIso(row.push_sent_at),
    pushFailedAt: toIso(row.push_failed_at),
    pushErrorMessage: row.push_error_message || "",
    pushAttempts,
    read: Boolean(row.read_at),
    readAt: toIso(row.read_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToOrganization(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    type: row.type || "clinic",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    userId: row.user_id || "",
    role: row.role || "patient",
    createdAt: toIso(row.created_at),
  };
}

function rowToAuditLog(row) {
  if (!row) return null;
  return {
    id: row.id,
    actorUserId: row.actor_user_id || "",
    organizationId: row.organization_id || "",
    action: row.action || "",
    resourceType: row.resource_type || "",
    resourceId: row.resource_id || "",
    ip: row.ip || "",
    userAgent: row.user_agent || "",
    metadata: row.metadata || {},
    createdAt: toIso(row.created_at),
  };
}

function rowToPatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    ownerUserId: row.owner_user_id || "",
    patientCode: row.patient_code || "",
    name: row.name || "",
    age: row.age === null || row.age === undefined ? null : Number(row.age),
    gender: row.gender || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
    notes: row.notes || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToPatientShare(row) {
  if (!row) return null;
  let scanIds = [];
  if (Array.isArray(row.scan_ids)) {
    scanIds = row.scan_ids;
  } else if (typeof row.scan_ids === "string") {
    try {
      const parsed = JSON.parse(row.scan_ids || "[]");
      scanIds = Array.isArray(parsed) ? parsed : [];
    } catch {
      scanIds = [];
    }
  }
  return {
    id: row.id,
    doctorUserId: row.doctor_user_id || "",
    doctorId: row.doctor_id || row.doctor_user_id || "",
    patientId: row.patient_id || "",
    organizationId: row.organization_id || "",
    accessLevel: row.access_level || "read",
    scope: row.scope || (scanIds.length ? "selected_scans" : "patient_profile"),
    scanIds,
    grantedByUserId: row.granted_by_user_id || "",
    expiresAt: toIso(row.expires_at),
    revokedAt: toIso(row.revoked_at),
    revokedByUserId: row.revoked_by_user_id || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    pairedUserId: row.paired_user_id || "",
    name: row.name || "",
    type: row.type || "stethoscope",
    status: row.status || "unclaimed",
    signal: row.signal === null || row.signal === undefined ? null : Number(row.signal),
    battery: row.battery === null || row.battery === undefined ? null : Number(row.battery),
    connected: Boolean(row.connected),
    connectionMethod: row.connection_method || "",
    secretHash: row.secret_hash || "",
    firmwareVersion: row.firmware_version || "",
    lastSeenAt: toIso(row.last_seen_at),
    revokedAt: toIso(row.revoked_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToScan(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || "",
    patientId: row.patient_id || "",
    deviceId: row.device_id || "",
    createdByUserId: row.created_by_user_id || "",
    idempotencyKey: row.idempotency_key || "",
    status: row.status || "recording",
    processingStatus: row.processing_status || "recording",
    mode: row.mode || "heart",
    bodySite: row.body_site || "",
    startedAt: toIso(row.started_at),
    endedAt: toIso(row.ended_at),
    sampleRate: row.sample_rate === null || row.sample_rate === undefined ? 16000 : Number(row.sample_rate),
    sampleCount: row.sample_count === null || row.sample_count === undefined ? 0 : Number(row.sample_count),
    durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined ? 0 : Number(row.duration_seconds),
    peak: row.peak === null || row.peak === undefined ? 0 : Number(row.peak),
    rms: row.rms === null || row.rms === undefined ? 0 : Number(row.rms),
    levelPercent: row.level_percent === null || row.level_percent === undefined ? 0 : Number(row.level_percent),
    bpm: row.bpm === null || row.bpm === undefined ? 0 : Number(row.bpm),
    aiLabel: row.ai_label || "",
    aiConfidence: row.ai_confidence === null || row.ai_confidence === undefined ? null : Number(row.ai_confidence),
    aiSummary: row.ai_summary || "",
    doctorNotes: row.doctor_notes || "",
    audioUrl: row.audio_url || "",
    wavFile: row.wav_file || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToAudioFile(row) {
  if (!row) return null;
  return {
    id: row.id,
    scanId: row.scan_id || "",
    patientId: row.patient_id || "",
    storageProvider: row.storage_provider || "local",
    objectKey: row.object_key || "",
    contentType: row.content_type || "audio/wav",
    byteSize: row.byte_size === null || row.byte_size === undefined ? 0 : Number(row.byte_size),
    sampleRate: row.sample_rate === null || row.sample_rate === undefined ? 16000 : Number(row.sample_rate),
    createdAt: toIso(row.created_at),
  };
}

function rowToAiResult(row) {
  if (!row) return null;
  return {
    id: row.id,
    scanId: row.scan_id || "",
    modelVersion: row.model_version || "",
    label: row.label || "",
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    summary: row.summary || "",
    rawResult: row.raw_result || {},
    status: row.status || "queued",
    errorCode: row.error_code || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToDeviceEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.device_id || "",
    eventType: row.event_type || "",
    payload: row.payload || {},
    createdAt: toIso(row.created_at),
  };
}

function rowToNotificationDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || "",
    platform: row.platform || "android",
    fcmToken: row.fcm_token || "",
    enabled: Boolean(row.enabled),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function rowToExport(row) {
  if (!row) return null;
  return {
    id: row.id,
    format: row.format || "pdf",
    status: row.status || "ready",
    includeAudio: Boolean(row.include_audio),
    includeReports: Boolean(row.include_reports),
    includeHistory: Boolean(row.include_history),
    recordCount: row.record_count === null || row.record_count === undefined ? 0 : Number(row.record_count),
    downloadUrl: row.download_url || "",
    createdAt: toIso(row.created_at),
  };
}

function syncArrayItem(items, item) {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) {
    items.unshift(item);
    return item;
  }
  items[index] = {
    ...items[index],
    ...item,
  };
  return items[index];
}

function mergeSqlListWithRuntime(runtimeItems, sqlItems) {
  const merged = [...sqlItems];
  const seen = new Set(sqlItems.map((item) => item.id));
  for (const item of runtimeItems) {
    if (item?.id && !seen.has(item.id)) {
      merged.push(item);
    }
  }
  return merged;
}

function matchesDoctorRequestStatus(user, status) {
  return (
    user &&
    user.requestedRole === "doctor" &&
    (!status || status === "all" || (user.roleRequestStatus || "pending") === status)
  );
}

function createRepositories(options) {
  const getDb = options.getDb;
  const saveDb = options.saveDb;
  const createId = options.createId;
  const nowIso = options.nowIso;
  const getPool = options.getPool || (() => null);
  const onSqlError = options.onSqlError || ((err) => console.warn(`Repository SQL fallback: ${err.message}`));

  async function withSql(operation) {
    const pool = getPool();
    if (!pool) {
      return null;
    }
    try {
      return await operation(pool);
    } catch (err) {
      onSqlError(err);
      return null;
    }
  }

  function patientShareItems() {
    const db = getDb();
    db.doctorPatientAccess = Array.isArray(db.doctorPatientAccess) ? db.doctorPatientAccess : [];
    return db.doctorPatientAccess;
  }

  async function upsertUserSql(user) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO users (
            id, firebase_uid, email, phone, role, name, password_hash, license, hospital, department,
            address, organization_id, patient_id, verified_email, verified_phone, account_status,
            requested_role, role_request_status, role_requested_at, role_approved_at, role_rejected_at,
            role_reject_reason, role_info_request_at, role_info_request_message, firebase_claims, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12,
            CASE WHEN $13 IS NOT NULL AND EXISTS (SELECT 1 FROM patients WHERE id = $13) THEN $13 ELSE NULL END,
            $14, $15, $16,
            $17, $18, $19, $20, $21,
            $22, $23, $24, $25::jsonb, now()
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
            updated_at = now()
        `,
        [
          user.id,
          optional(user.firebaseUid),
          optional(user.email),
          optional(user.phone),
          user.role || "patient",
          user.name || user.email || user.id,
          optional(user.passwordHash || user.password),
          optional(user.license),
          optional(user.hospital),
          optional(user.department),
          optional(user.address),
          optional(user.organizationId),
          optional(user.patientId),
          Boolean(user.verifiedEmail),
          Boolean(user.verifiedPhone),
          user.accountStatus || "active",
          optional(user.requestedRole),
          optional(user.roleRequestStatus),
          optionalTimestamp(user.roleRequestedAt),
          optionalTimestamp(user.roleApprovedAt),
          optionalTimestamp(user.roleRejectedAt),
          optional(user.roleRejectReason),
          optionalTimestamp(user.roleInfoRequestAt),
          optional(user.roleInfoRequestMessage),
          JSON.stringify(firebaseClaimsForUser(user)),
        ]
      )
    );
  }

  async function upsertOrganizationSql(organization) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO organizations (id, name, type, updated_at)
          VALUES ($1, $2, $3, now())
          ON CONFLICT (id)
          DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = now()
        `,
        [organization.id, organization.name || organization.id, organization.type || "clinic"]
      )
    );
  }

  async function upsertMembershipSql(membership) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO memberships (id, organization_id, user_id, role)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (organization_id, user_id)
          DO UPDATE SET role = EXCLUDED.role
        `,
        [membership.id, membership.organizationId, membership.userId, membership.role || "patient"]
      )
    );
  }

  async function upsertNotificationSql(notification) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO notifications (
            id, user_id, organization_id, type, title, message, channel, delivery_status,
            push_status, push_sent_at, push_failed_at, push_error_message, push_attempts, read_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11::timestamptz, $12, $13::jsonb, $14, now())
          ON CONFLICT (id)
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            organization_id = EXCLUDED.organization_id,
            type = EXCLUDED.type,
            title = EXCLUDED.title,
            message = EXCLUDED.message,
            channel = EXCLUDED.channel,
            delivery_status = EXCLUDED.delivery_status,
            push_status = EXCLUDED.push_status,
            push_sent_at = EXCLUDED.push_sent_at,
            push_failed_at = EXCLUDED.push_failed_at,
            push_error_message = EXCLUDED.push_error_message,
            push_attempts = EXCLUDED.push_attempts,
            read_at = EXCLUDED.read_at,
            updated_at = now()
        `,
        [
          notification.id,
          optional(notification.userId),
          optional(notification.organizationId),
          notification.type || "info",
          notification.title || "",
          notification.message || "",
          notification.channel || "in_app",
          notification.deliveryStatus || "ready",
          notification.pushStatus || "ready",
          optionalTimestamp(notification.pushSentAt),
          optionalTimestamp(notification.pushFailedAt),
          optional(notification.pushErrorMessage || ""),
          JSON.stringify(Array.isArray(notification.pushAttempts) ? notification.pushAttempts : []),
          notification.read || notification.readAt ? notification.readAt || nowIso() : null,
        ]
      )
    );
  }

  async function upsertPatientSql(patient) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO patients (
            id, organization_id, owner_user_id, patient_code, name, age, gender, phone, email, address, notes, created_at, updated_at
          )
          VALUES (
            $1, $2,
            CASE WHEN $3 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $3) THEN $3 ELSE NULL END,
            $4, $5, $6, $7, $8, $9, $10, $11,
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
          optional(patient.organizationId),
          optional(patient.ownerUserId),
          patient.patientCode || patient.id,
          patient.name || patient.patientCode || patient.id,
          patient.age === undefined || patient.age === "" ? null : patient.age,
          optional(patient.gender),
          optional(patient.phone),
          optional(patient.email),
          optional(patient.address),
          optional(patient.notes),
          optional(patient.createdAt),
          patient.updatedAt || nowIso(),
        ]
      )
    );
  }

  async function upsertPatientShareSql(grant) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO doctor_patient_access (
            id, doctor_user_id, doctor_id, patient_id, organization_id, access_level, scope, scan_ids,
            granted_by_user_id, expires_at, revoked_at, revoked_by_user_id, created_at, updated_at
          )
          VALUES (
            $1,
            CASE WHEN $2 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $2) THEN $2 ELSE NULL END,
            $3, $4,
            CASE WHEN $5 IS NOT NULL AND EXISTS (SELECT 1 FROM organizations WHERE id = $5) THEN $5 ELSE NULL END,
            $6, $7, $8::jsonb,
            CASE WHEN $9 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $9) THEN $9 ELSE NULL END,
            $10::timestamptz, $11::timestamptz,
            CASE WHEN $12 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $12) THEN $12 ELSE NULL END,
            COALESCE($13::timestamptz, now()), COALESCE($14::timestamptz, now())
          )
          ON CONFLICT (id)
          DO UPDATE SET
            doctor_user_id = EXCLUDED.doctor_user_id,
            doctor_id = EXCLUDED.doctor_id,
            patient_id = EXCLUDED.patient_id,
            organization_id = EXCLUDED.organization_id,
            access_level = EXCLUDED.access_level,
            scope = EXCLUDED.scope,
            scan_ids = EXCLUDED.scan_ids,
            granted_by_user_id = EXCLUDED.granted_by_user_id,
            expires_at = EXCLUDED.expires_at,
            revoked_at = EXCLUDED.revoked_at,
            revoked_by_user_id = EXCLUDED.revoked_by_user_id,
            updated_at = EXCLUDED.updated_at
        `,
        [
          grant.id,
          optional(grant.doctorUserId || grant.doctorId),
          optional(grant.doctorId || grant.doctorUserId),
          grant.patientId,
          optional(grant.organizationId),
          grant.accessLevel || "read",
          grant.scope || (Array.isArray(grant.scanIds) && grant.scanIds.length ? "selected_scans" : "patient_profile"),
          JSON.stringify(Array.isArray(grant.scanIds) ? grant.scanIds : []),
          optional(grant.grantedByUserId),
          optionalTimestamp(grant.expiresAt),
          optionalTimestamp(grant.revokedAt),
          optional(grant.revokedByUserId),
          optional(grant.createdAt),
          grant.updatedAt || nowIso(),
        ]
      )
    );
  }

  async function upsertDeviceSql(device) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO devices (
            id, organization_id, paired_user_id, name, type, status, signal, battery, connected,
            connection_method, secret_hash, firmware_version, last_seen_at, revoked_at, created_at, updated_at
          )
          VALUES (
            $1, $2,
            CASE WHEN $3 IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE id = $3) THEN $3 ELSE NULL END,
            $4, $5, $6, $7, $8, $9,
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
          optional(device.organizationId),
          optional(device.pairedUserId),
          device.name || device.id,
          device.type || "stethoscope",
          device.status || "unclaimed",
          device.signal === undefined || device.signal === "" ? null : device.signal,
          device.battery === undefined || device.battery === "" ? null : device.battery,
          Boolean(device.connected),
          optional(device.connectionMethod),
          optional(device.secretHash || device.secret),
          optional(device.firmwareVersion || device.firmware),
          optional(device.lastSeenAt),
          optional(device.revokedAt),
          optional(device.createdAt),
          device.updatedAt || nowIso(),
        ]
      )
    );
  }

  async function upsertScanSql(scan) {
    await withSql((pool) =>
      pool.query(
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
            organization_id = EXCLUDED.organization_id,
            patient_id = EXCLUDED.patient_id,
            device_id = EXCLUDED.device_id,
            created_by_user_id = EXCLUDED.created_by_user_id,
            idempotency_key = EXCLUDED.idempotency_key,
            status = EXCLUDED.status,
            processing_status = EXCLUDED.processing_status,
            mode = EXCLUDED.mode,
            body_site = EXCLUDED.body_site,
            started_at = EXCLUDED.started_at,
            ended_at = EXCLUDED.ended_at,
            sample_rate = EXCLUDED.sample_rate,
            sample_count = EXCLUDED.sample_count,
            duration_seconds = EXCLUDED.duration_seconds,
            peak = EXCLUDED.peak,
            rms = EXCLUDED.rms,
            level_percent = EXCLUDED.level_percent,
            bpm = EXCLUDED.bpm,
            ai_label = EXCLUDED.ai_label,
            ai_confidence = EXCLUDED.ai_confidence,
            ai_summary = EXCLUDED.ai_summary,
            doctor_notes = EXCLUDED.doctor_notes,
            audio_url = EXCLUDED.audio_url,
            wav_file = EXCLUDED.wav_file,
            updated_at = EXCLUDED.updated_at
        `,
        [
          scan.id,
          optional(scan.organizationId),
          scan.patientId,
          optional(scan.deviceId),
          optional(scan.createdByUserId),
          optional(scan.idempotencyKey),
          scan.status || "recording",
          scan.processingStatus || scan.status || "recording",
          scan.mode || "heart",
          optional(scan.bodySite),
          optional(scan.startedAt),
          optional(scan.endedAt),
          scan.sampleRate || 16000,
          scan.sampleCount || 0,
          scan.durationSeconds || 0,
          scan.peak || 0,
          scan.rms || 0,
          scan.levelPercent || 0,
          scan.bpm || 0,
          optional(scan.aiLabel),
          scan.aiConfidence === undefined || scan.aiConfidence === "" ? null : scan.aiConfidence,
          optional(scan.aiSummary),
          optional(scan.doctorNotes),
          optional(scan.audioUrl),
          optional(scan.wavFile),
          optional(scan.createdAt || scan.startedAt),
          scan.updatedAt || nowIso(),
        ]
      )
    );
  }

  async function insertAudioFileSql(audioFile) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO audio_files (
            id, scan_id, patient_id, storage_provider, object_key, content_type, byte_size, sample_rate, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
          ON CONFLICT (id)
          DO UPDATE SET
            storage_provider = EXCLUDED.storage_provider,
            object_key = EXCLUDED.object_key,
            content_type = EXCLUDED.content_type,
            byte_size = EXCLUDED.byte_size,
            sample_rate = EXCLUDED.sample_rate
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
          optional(audioFile.createdAt),
        ]
      )
    );
  }

  async function upsertAiResultSql(aiResult) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO ai_results (
            id, scan_id, model_version, label, confidence, summary, raw_result, status, error_code, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, COALESCE($10::timestamptz, now()), COALESCE($11::timestamptz, now()))
          ON CONFLICT (id)
          DO UPDATE SET
            model_version = EXCLUDED.model_version,
            label = EXCLUDED.label,
            confidence = EXCLUDED.confidence,
            summary = EXCLUDED.summary,
            raw_result = EXCLUDED.raw_result,
            status = EXCLUDED.status,
            error_code = EXCLUDED.error_code,
            updated_at = EXCLUDED.updated_at
        `,
        [
          aiResult.id,
          aiResult.scanId,
          aiResult.modelVersion || "signal-quality-demo",
          optional(aiResult.label),
          aiResult.confidence === undefined || aiResult.confidence === "" ? null : aiResult.confidence,
          optional(aiResult.summary),
          JSON.stringify(aiResult.rawResult || {}),
          aiResult.status || "queued",
          optional(aiResult.errorCode),
          optional(aiResult.createdAt),
          aiResult.updatedAt || nowIso(),
        ]
      )
    );
  }

  async function insertDeviceEventSql(event) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO device_events (id, device_id, event_type, payload, created_at)
          VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()))
          ON CONFLICT (id) DO NOTHING
        `,
        [event.id, event.deviceId, event.eventType, JSON.stringify(event.payload || {}), optional(event.createdAt)]
      )
    );
  }

  async function upsertNotificationDeviceSql(device) {
    await withSql((pool) =>
      pool.query(
        `
          INSERT INTO notification_devices (id, user_id, platform, fcm_token, enabled, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), COALESCE($7::timestamptz, now()))
          ON CONFLICT (user_id, fcm_token)
          DO UPDATE SET platform = EXCLUDED.platform, enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at
        `,
        [
          device.id,
          device.userId,
          device.platform || "android",
          device.fcmToken,
          device.enabled !== false,
          optional(device.createdAt),
          device.updatedAt || nowIso(),
        ]
      )
    );
  }

  const users = {
    async save(user) {
      user.updatedAt = nowIso();
      syncArrayItem(getDb().users, user);
      await upsertUserSql(user);
      await saveDb();
      return user;
    },

    async findByIdOrFirebaseUid(identifier) {
      const id = String(identifier || "");
      const sqlUser = await withSql(async (pool) => {
        const result = await pool.query(
          "SELECT * FROM users WHERE id = $1 OR firebase_uid = $1 OR lower(email) = lower($1) LIMIT 1",
          [id]
        );
        return result.rows[0] ? rowToUser(result.rows[0]) : null;
      });
      if (sqlUser) {
        return syncArrayItem(getDb().users, sqlUser);
      }
      return getDb().users.find((user) => user.id === id || user.firebaseUid === id || String(user.email || "").toLowerCase() === id.toLowerCase()) || null;
    },

    async listDoctorRequests(status) {
      const sqlUsers = await withSql(async (pool) => {
        const params = [];
        let where = "requested_role = 'doctor'";
        if (status && status !== "all") {
          params.push(status);
          where += ` AND COALESCE(role_request_status, 'pending') = $${params.length}`;
        }
        const result = await pool.query(
          `
            SELECT * FROM users
            WHERE ${where}
            ORDER BY COALESCE(role_requested_at, created_at) DESC
          `,
          params
        );
        return result.rows.map(rowToUser);
      });
      if (sqlUsers && sqlUsers.length > 0) {
        for (const user of sqlUsers) {
          syncArrayItem(getDb().users, user);
        }
        return sqlUsers;
      }
      return getDb()
        .users.filter((user) => matchesDoctorRequestStatus(user, status))
        .sort((a, b) => String(b.roleRequestedAt || b.createdAt || "").localeCompare(String(a.roleRequestedAt || a.createdAt || "")));
    },

    async updateDoctorRequestState(identifier, patch = {}) {
      const id = String(identifier || "");
      const nextClaims = { ...objectOf(patch.firebaseClaims) };
      if (Array.isArray(patch.roleInfoRequiredFields)) {
        nextClaims.roleInfoRequiredFields = patch.roleInfoRequiredFields;
      }
      const hasSql = Boolean(getPool());
      const sqlUser = await withSql(async (pool) => {
        const result = await pool.query(
          `
            UPDATE users
            SET
              requested_role = 'doctor',
              role = $2,
              role_request_status = $3,
              account_status = $4,
              role_requested_at = COALESCE($5, role_requested_at),
              role_approved_at = $6,
              role_rejected_at = $7,
              role_reject_reason = $8,
              role_info_request_at = $9,
              role_info_request_message = $10,
              organization_id = COALESCE($11, organization_id),
              firebase_claims = COALESCE(users.firebase_claims, '{}'::jsonb) || $12::jsonb,
              updated_at = now()
            WHERE id = $1 OR firebase_uid = $1 OR lower(email) = lower($1)
            RETURNING *
          `,
          [
            id,
            patch.role || "patient",
            patch.roleRequestStatus || "pending",
            patch.accountStatus || "active",
            optionalTimestamp(patch.roleRequestedAt),
            optionalTimestamp(patch.roleApprovedAt),
            optionalTimestamp(patch.roleRejectedAt),
            optional(patch.roleRejectReason),
            optionalTimestamp(patch.roleInfoRequestAt),
            optional(patch.roleInfoRequestMessage),
            patch.organizationId === undefined ? null : patch.organizationId,
            JSON.stringify(nextClaims),
          ]
        );
        return result.rows[0] ? rowToUser(result.rows[0]) : null;
      });
      if (hasSql && !sqlUser) {
        return null;
      }
      const user = sqlUser
        ? syncArrayItem(getDb().users, sqlUser)
        : getDb().users.find((item) => item.id === id || item.firebaseUid === id || String(item.email || "").toLowerCase() === id.toLowerCase());
      if (!user) {
        return null;
      }
      Object.assign(user, patch, {
        requestedRole: "doctor",
        updatedAt: nowIso(),
      });
      syncArrayItem(getDb().users, user);
      await saveDb();
      return user;
    },

    async resubmitDoctorRequest(identifier, patch = {}) {
      const id = String(identifier || "");
      const submittedAt = patch.roleRequestedAt || nowIso();
      const nextClaims = { roleInfoRequiredFields: [] };
      if (patch.registrationReason) {
        nextClaims.registrationReason = patch.registrationReason;
      }
      if (patch.workspaceType) {
        nextClaims.workspaceType = patch.workspaceType;
      }
      if (patch.accountType) {
        nextClaims.accountType = patch.accountType;
      }
      if (patch.clinicSuggestion) {
        nextClaims.clinicSuggestion = patch.clinicSuggestion;
      }
      const hasSql = Boolean(getPool());
      const sqlUser = await withSql(async (pool) => {
        const result = await pool.query(
          `
            UPDATE users
            SET
              requested_role = 'doctor',
              role = $2,
              role_request_status = 'pending',
              account_status = 'active',
              role_requested_at = $3,
              role_approved_at = NULL,
              role_rejected_at = NULL,
              role_reject_reason = '',
              role_info_request_at = NULL,
              role_info_request_message = '',
              name = COALESCE(NULLIF($4, ''), name),
              phone = COALESCE(NULLIF($5, ''), phone),
              license = COALESCE(NULLIF($6, ''), license),
              hospital = COALESCE(NULLIF($7, ''), hospital),
              department = COALESCE(NULLIF($8, ''), department),
              organization_id = COALESCE(NULLIF($9, ''), organization_id),
              firebase_claims = COALESCE(users.firebase_claims, '{}'::jsonb) || $10::jsonb,
              updated_at = now()
            WHERE id = $1 OR firebase_uid = $1 OR lower(email) = lower($1)
            RETURNING *
          `,
          [
            id,
            patch.role || "patient",
            optionalTimestamp(submittedAt),
            patch.name || "",
            patch.phone || "",
            patch.license || "",
            patch.hospital || "",
            patch.department || patch.specialty || "",
            patch.organizationId || "",
            JSON.stringify(nextClaims),
          ]
        );
        return result.rows[0] ? rowToUser(result.rows[0]) : null;
      });
      if (hasSql && !sqlUser) {
        return null;
      }
      const user = sqlUser
        ? syncArrayItem(getDb().users, sqlUser)
        : getDb().users.find((item) => item.id === id || item.firebaseUid === id || String(item.email || "").toLowerCase() === id.toLowerCase());
      if (!user) {
        return null;
      }
      Object.assign(user, {
        requestedRole: "doctor",
        role: patch.role || "patient",
        roleRequestStatus: "pending",
        accountStatus: "active",
        roleRequestedAt: submittedAt,
        roleApprovedAt: "",
        roleRejectedAt: "",
        roleRejectReason: "",
        roleInfoRequestAt: "",
        roleInfoRequestMessage: "",
        roleInfoRequiredFields: [],
        name: patch.name || user.name,
        phone: patch.phone || user.phone,
        license: patch.license || user.license,
        hospital: patch.hospital || user.hospital,
        department: patch.department || patch.specialty || user.department,
        organizationId: patch.organizationId || user.organizationId,
        registrationReason: patch.registrationReason || user.registrationReason || "",
        workspaceType: patch.workspaceType || user.workspaceType || "",
        accountType: patch.accountType || user.accountType || "",
        clinicSuggestion: patch.clinicSuggestion || user.clinicSuggestion || "",
        updatedAt: nowIso(),
      });
      syncArrayItem(getDb().users, user);
      await saveDb();
      return user;
    },

    async listApprovedDoctors() {
      const runtimeUsers = getDb()
        .users.filter((user) => user.requestedRole === "doctor" && user.roleRequestStatus === "approved");
      const sqlUsers = await withSql(async (pool) => {
        const result = await pool.query(
          `
            SELECT * FROM users
            WHERE requested_role = 'doctor' AND role_request_status = 'approved'
            ORDER BY COALESCE(role_approved_at, updated_at) DESC
          `
        );
        return result.rows.map(rowToUser);
      });
      if (sqlUsers) {
        for (const user of sqlUsers) {
          syncArrayItem(getDb().users, user);
        }
        return mergeSqlListWithRuntime(runtimeUsers, sqlUsers)
          .sort((a, b) => String(b.roleApprovedAt || b.updatedAt || "").localeCompare(String(a.roleApprovedAt || a.updatedAt || "")));
      }
      return runtimeUsers
        .sort((a, b) => String(b.roleApprovedAt || b.updatedAt || "").localeCompare(String(a.roleApprovedAt || a.updatedAt || "")));
    },

    async deleteById(userId) {
      const id = String(userId || "");
      if (!id) return false;

      await withSql(async (pool) => {
        await pool.query("BEGIN");
        try {
          await pool.query("DELETE FROM notification_devices WHERE user_id = $1", [id]);
          await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [id]);
          await pool.query("DELETE FROM memberships WHERE user_id = $1", [id]);
          await pool.query("DELETE FROM doctor_patient_access WHERE doctor_user_id = $1", [id]);
          await pool.query("UPDATE doctor_patient_access SET granted_by_user_id = NULL WHERE granted_by_user_id = $1", [id]);
          await pool.query("UPDATE device_claims SET created_by_user_id = NULL WHERE created_by_user_id = $1", [id]);
          await pool.query("UPDATE device_claims SET claimed_by_user_id = NULL WHERE claimed_by_user_id = $1", [id]);
          await pool.query("UPDATE devices SET paired_user_id = NULL WHERE paired_user_id = $1", [id]);
          await pool.query("UPDATE patients SET owner_user_id = NULL WHERE owner_user_id = $1", [id]);
          await pool.query("UPDATE scan_sessions SET created_by_user_id = NULL WHERE created_by_user_id = $1", [id]);
          await pool.query("UPDATE notifications SET user_id = NULL WHERE user_id = $1", [id]);
          await pool.query("DELETE FROM users WHERE id = $1", [id]);
          await pool.query("COMMIT");
        } catch (err) {
          await pool.query("ROLLBACK");
          throw err;
        }
      });

      const db = getDb();
      const user = db.users.find((item) => item.id === id);
      db.users = db.users.filter((item) => item.id !== id);
      db.memberships = db.memberships.filter((item) => item.userId !== id);
      db.sessions = db.sessions.filter((item) => item.userId !== id);
      db.authSessions = db.authSessions.filter((item) => item.userId !== id);
      db.notificationDevices = db.notificationDevices.filter((item) => item.userId !== id);
      db.doctorPatientAccess = db.doctorPatientAccess.filter((item) => item.doctorUserId !== id && item.doctorId !== id);
      for (const item of db.doctorPatientAccess) {
        if (item.grantedByUserId === id) item.grantedByUserId = "";
      }
      for (const item of db.devices) {
        if (item.pairedUserId === id) item.pairedUserId = "";
      }
      for (const item of db.patients) {
        if (item.ownerUserId === id) item.ownerUserId = "";
      }
      for (const item of db.scans) {
        if (item.createdByUserId === id) item.createdByUserId = "";
      }
      for (const item of db.notifications) {
        if (item.userId === id) item.userId = "";
      }
      await saveDb();
      return Boolean(user);
    },
  };

  const organizations = {
    async upsert(organization) {
      syncArrayItem(getDb().organizations, organization);
      await upsertOrganizationSql(organization);
      await saveDb();
      return organization;
    },
  };

  const memberships = {
    async ensureForUser(user) {
      if (!user || !user.organizationId) return null;
      let membership = getDb().memberships.find(
        (item) => item.userId === user.id && item.organizationId === user.organizationId
      );
      if (!membership) {
        membership = {
          id: createId("mbr"),
          organizationId: user.organizationId,
          userId: user.id,
          role: user.role || "patient",
          createdAt: nowIso(),
        };
        getDb().memberships.push(membership);
      } else {
        membership.role = user.role || membership.role || "patient";
      }
      await upsertMembershipSql(membership);
      await saveDb();
      return membership;
    },
  };

  const notifications = {
    async list() {
      const sqlNotifications = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200");
        return result.rows.map(rowToNotification);
      });
      if (sqlNotifications && sqlNotifications.length > 0) {
        const db = getDb();
        db.notifications = sqlNotifications;
        return sqlNotifications;
      }
      return getDb().notifications;
    },

    async create(input) {
      const notification = {
        id: input.id || createId("noti"),
        userId: input.userId || "",
        organizationId: input.organizationId || "",
        type: input.type || "info",
        title: input.title || "",
        message: input.message || "",
        channel: input.channel || "in_app",
        deliveryStatus: input.deliveryStatus || "ready",
        pushStatus: input.pushStatus || "ready",
        pushSentAt: input.pushSentAt || "",
        pushFailedAt: input.pushFailedAt || "",
        pushErrorMessage: input.pushErrorMessage || "",
        pushAttempts: Array.isArray(input.pushAttempts) ? input.pushAttempts : [],
        read: Boolean(input.read),
        readAt: input.readAt || "",
        createdAt: input.createdAt || nowIso(),
        updatedAt: nowIso(),
      };
      syncArrayItem(getDb().notifications, notification);
      getDb().notifications = getDb().notifications.slice(0, 200);
      await upsertNotificationSql(notification);
      await saveDb();
      return notification;
    },

    async markAllRead(context) {
      const now = nowIso();
      for (const notification of getDb().notifications) {
        notification.read = true;
        notification.readAt = notification.readAt || now;
        notification.updatedAt = now;
      }
      await withSql((pool) => pool.query("UPDATE notifications SET read_at = COALESCE(read_at, now()), updated_at = now()"));
      await auditLogs.append({
        action: "notification.read",
        actorUserId: context && context.actor ? context.actor.id : "",
        organizationId: context ? context.organizationId : "",
        resourceType: "notification",
        resourceId: "all",
        ip: context ? context.ip : "",
        userAgent: context ? context.userAgent : "",
        metadata: { scope: "all" },
      });
      await saveDb();
      return getDb().notifications;
    },

    async markRead(id, context) {
      const notification = getDb().notifications.find((item) => item.id === id);
      if (!notification) {
        return null;
      }
      notification.read = true;
      notification.readAt = notification.readAt || nowIso();
      notification.updatedAt = nowIso();
      await upsertNotificationSql(notification);
      await auditLogs.append({
        action: "notification.read",
        actorUserId: context && context.actor ? context.actor.id : "",
        organizationId: notification.organizationId || (context ? context.organizationId : ""),
        resourceType: "notification",
        resourceId: notification.id,
        ip: context ? context.ip : "",
        userAgent: context ? context.userAgent : "",
      });
      await saveDb();
      return notification;
    },

    async delete(id, context) {
      const db = getDb();
      const notification = db.notifications.find((item) => item.id === id);
      if (!notification) {
        return null;
      }
      db.notifications = db.notifications.filter((item) => item.id !== id);
      await withSql((pool) => pool.query("DELETE FROM notifications WHERE id = $1", [id]));
      await auditLogs.append({
        action: "notification.delete",
        actorUserId: context && context.actor ? context.actor.id : "",
        organizationId: notification.organizationId || (context ? context.organizationId : ""),
        resourceType: "notification",
        resourceId: notification.id,
        ip: context ? context.ip : "",
        userAgent: context ? context.userAgent : "",
      });
      await saveDb();
      return notification;
    },
  };

  const patients = {
    async list() {
      const sqlPatients = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM patients ORDER BY updated_at DESC, created_at DESC");
        return result.rows.map(rowToPatient);
      });
      if (sqlPatients && sqlPatients.length > 0) {
        getDb().patients = mergeSqlListWithRuntime(getDb().patients, sqlPatients);
        return getDb().patients;
      }
      return getDb().patients;
    },

    async findById(id) {
      const patientId = String(id || "");
      const sqlPatient = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM patients WHERE id = $1 LIMIT 1", [patientId]);
        return result.rows[0] ? rowToPatient(result.rows[0]) : null;
      });
      if (sqlPatient) {
        return syncArrayItem(getDb().patients, sqlPatient);
      }
      return getDb().patients.find((patient) => patient.id === patientId) || null;
    },

    async save(patient) {
      patient.updatedAt = patient.updatedAt || nowIso();
      syncArrayItem(getDb().patients, patient);
      await upsertPatientSql(patient);
      await saveDb();
      return patient;
    },

    async delete(id) {
      const patientId = String(id || "");
      const db = getDb();
      const patient = db.patients.find((item) => item.id === patientId) || null;
      db.patients = db.patients.filter((item) => item.id !== patientId);
      await withSql((pool) => pool.query("DELETE FROM patients WHERE id = $1", [patientId]));
      await saveDb();
      return patient;
    },
  };

  const patientShares = {
    async listForPatient(patientId, options = {}) {
      const id = String(patientId || "");
      if (!id) return [];
      const includeRevoked = Boolean(options.includeRevoked);
      const runtimeShares = patientShareItems().filter(
        (grant) => grant.patientId === id && (includeRevoked || !grant.revokedAt)
      );
      const sqlShares = await withSql(async (pool) => {
        const result = await pool.query(
          `
            SELECT * FROM doctor_patient_access
            WHERE patient_id = $1
              AND ($2::boolean = true OR revoked_at IS NULL)
            ORDER BY created_at DESC
          `,
          [id, includeRevoked]
        );
        return result.rows.map(rowToPatientShare);
      });
      if (sqlShares) {
        const merged = new Map(runtimeShares.map((share) => [share.id, share]));
        for (const share of sqlShares) {
          const synced = syncArrayItem(patientShareItems(), share);
          merged.set(synced.id, synced);
        }
        return Array.from(merged.values()).sort(
          (left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
        );
      }
      return runtimeShares;
    },

    async findForPatient(patientId, shareId) {
      const id = String(patientId || "");
      const grantId = String(shareId || "");
      if (!id || !grantId) return null;
      const sqlShare = await withSql(async (pool) => {
        const result = await pool.query(
          "SELECT * FROM doctor_patient_access WHERE id = $1 AND patient_id = $2 LIMIT 1",
          [grantId, id]
        );
        return result.rows[0] ? rowToPatientShare(result.rows[0]) : null;
      });
      if (sqlShare) {
        return syncArrayItem(patientShareItems(), sqlShare);
      }
      return patientShareItems().find((grant) => grant.id === grantId && grant.patientId === id) || null;
    },

    async save(grant) {
      grant.doctorUserId = grant.doctorUserId || grant.doctorId || "";
      grant.doctorId = grant.doctorId || grant.doctorUserId || "";
      grant.accessLevel = grant.accessLevel || "read";
      grant.scope = grant.scope || (Array.isArray(grant.scanIds) && grant.scanIds.length ? "selected_scans" : "patient_profile");
      grant.scanIds = Array.isArray(grant.scanIds) ? grant.scanIds : [];
      grant.createdAt = grant.createdAt || nowIso();
      grant.updatedAt = grant.updatedAt || nowIso();
      syncArrayItem(patientShareItems(), grant);
      getDb().doctorPatientAccess = patientShareItems().slice(0, 1000);
      await upsertPatientShareSql(grant);
      await saveDb();
      return grant;
    },

    async revoke(patientId, shareId, actorUserId = "") {
      const grant = await this.findForPatient(patientId, shareId);
      if (!grant) return null;
      grant.revokedAt = grant.revokedAt || nowIso();
      grant.revokedByUserId = actorUserId || grant.revokedByUserId || "";
      grant.updatedAt = nowIso();
      syncArrayItem(patientShareItems(), grant);
      await upsertPatientShareSql(grant);
      await saveDb();
      return grant;
    },
  };

  const devices = {
    async list() {
      const sqlDevices = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM devices ORDER BY updated_at DESC, created_at DESC");
        return result.rows.map(rowToDevice);
      });
      if (sqlDevices && sqlDevices.length > 0) {
        getDb().devices = mergeSqlListWithRuntime(getDb().devices, sqlDevices);
        return getDb().devices;
      }
      return getDb().devices;
    },

    async findById(id) {
      const deviceId = String(id || "");
      const sqlDevice = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM devices WHERE id = $1 LIMIT 1", [deviceId]);
        return result.rows[0] ? rowToDevice(result.rows[0]) : null;
      });
      if (sqlDevice) {
        return syncArrayItem(getDb().devices, sqlDevice);
      }
      return getDb().devices.find((device) => device.id === deviceId) || null;
    },

    async save(device) {
      device.updatedAt = device.updatedAt || nowIso();
      syncArrayItem(getDb().devices, device);
      await upsertDeviceSql(device);
      await saveDb();
      return device;
    },

    async delete(id) {
      const deviceId = String(id || "");
      const db = getDb();
      const device = db.devices.find((item) => item.id === deviceId) || null;
      db.devices = db.devices.filter((item) => item.id !== deviceId);
      await withSql((pool) => pool.query("DELETE FROM devices WHERE id = $1", [deviceId]));
      await saveDb();
      return device;
    },
  };

  const scans = {
    async list(filters = {}) {
      const sqlScans = await withSql(async (pool) => {
        const where = [];
        const params = [];
        function add(field, value) {
          if (value === undefined || value === null || value === "") return;
          params.push(value);
          where.push(`${field} = $${params.length}`);
        }
        add("organization_id", filters.organizationId);
        add("patient_id", filters.patientId);
        add("device_id", filters.deviceId);
        add("status", filters.status);
        if (filters.createdFrom) {
          params.push(filters.createdFrom);
          where.push(`created_at >= $${params.length}::timestamptz`);
        }
        if (filters.createdTo) {
          params.push(filters.createdTo);
          where.push(`created_at <= $${params.length}::timestamptz`);
        }
        const limit = Math.min(200, Math.max(1, Number(filters.limit || 50)));
        params.push(limit);
        const result = await pool.query(
          `
            SELECT * FROM scan_sessions
            ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
            ORDER BY COALESCE(started_at, created_at) DESC
            LIMIT $${params.length}
          `,
          params
        );
        return result.rows.map(rowToScan);
      });
      if (sqlScans && sqlScans.length > 0) {
        for (const scan of sqlScans) {
          syncArrayItem(getDb().scans, scan);
        }
        return sqlScans;
      }
      return getDb().scans;
    },

    async findById(id) {
      const scanId = String(id || "");
      const sqlScan = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM scan_sessions WHERE id = $1 LIMIT 1", [scanId]);
        return result.rows[0] ? rowToScan(result.rows[0]) : null;
      });
      if (sqlScan) {
        return syncArrayItem(getDb().scans, sqlScan);
      }
      return getDb().scans.find((scan) => scan.id === scanId) || null;
    },

    async save(scan) {
      scan.updatedAt = scan.updatedAt || nowIso();
      syncArrayItem(getDb().scans, scan);
      await upsertScanSql(scan);
      await saveDb();
      return scan;
    },

    async delete(id) {
      const scanId = String(id || "");
      if (!scanId) {
        return { deleted: false, scanId };
      }
      await withSql(async (pool) => {
        await pool.query("DELETE FROM ai_results WHERE scan_id = $1", [scanId]);
        await pool.query("DELETE FROM audio_files WHERE scan_id = $1", [scanId]);
        await pool.query("DELETE FROM scan_sessions WHERE id = $1", [scanId]);
      });
      getDb().aiResults = getDb().aiResults.filter((item) => item.scanId !== scanId);
      getDb().audioFiles = getDb().audioFiles.filter((item) => item.scanId !== scanId);
      getDb().scans = getDb().scans.filter((scan) => scan.id !== scanId);
      await saveDb();
      return { deleted: true, scanId };
    },
  };

  const audioFiles = {
    async save(audioFile) {
      syncArrayItem(getDb().audioFiles, audioFile);
      getDb().audioFiles = getDb().audioFiles.slice(0, 1000);
      await insertAudioFileSql(audioFile);
      await saveDb();
      return audioFile;
    },

    async findByScanId(scanId) {
      const id = String(scanId || "");
      const sqlAudio = await withSql(async (pool) => {
        const result = await pool.query("SELECT * FROM audio_files WHERE scan_id = $1 ORDER BY created_at DESC LIMIT 1", [id]);
        return result.rows[0] ? rowToAudioFile(result.rows[0]) : null;
      });
      if (sqlAudio) {
        return syncArrayItem(getDb().audioFiles, sqlAudio);
      }
      return getDb().audioFiles.find((file) => file.scanId === id) || null;
    },
  };

  const aiResults = {
    async save(aiResult) {
      aiResult.updatedAt = aiResult.updatedAt || nowIso();
      syncArrayItem(getDb().aiResults, aiResult);
      getDb().aiResults = getDb().aiResults.slice(0, 1000);
      await upsertAiResultSql(aiResult);
      await saveDb();
      return aiResult;
    },
  };

  const deviceEvents = {
    async append(event) {
      const item = {
        id: event.id || createId("devevt"),
        deviceId: event.deviceId,
        eventType: event.eventType || "event",
        payload: event.payload || {},
        createdAt: event.createdAt || nowIso(),
      };
      getDb().deviceEvents = Array.isArray(getDb().deviceEvents) ? getDb().deviceEvents : [];
      getDb().deviceEvents.unshift(item);
      getDb().deviceEvents = getDb().deviceEvents.slice(0, 1000);
      await insertDeviceEventSql(item);
      await saveDb();
      return item;
    },
  };

  const notificationDevices = {
    async register(input) {
      const existing = getDb().notificationDevices.find(
        (item) => item.userId === input.userId && item.fcmToken === input.fcmToken
      );
      const item = existing || {
        id: input.id || createId("ndev"),
        createdAt: nowIso(),
      };
      item.userId = input.userId;
      item.platform = input.platform || "android";
      item.fcmToken = input.fcmToken;
      item.enabled = input.enabled !== false;
      item.updatedAt = nowIso();
      syncArrayItem(getDb().notificationDevices, item);
      await upsertNotificationDeviceSql(item);
      await saveDb();
      return item;
    },

    async listForUser(userId) {
      const id = String(userId || "");
      if (!id) return [];
      const sqlDevices = await withSql(async (pool) => {
        const result = await pool.query(
          "SELECT * FROM notification_devices WHERE user_id = $1 AND enabled = true ORDER BY updated_at DESC",
          [id]
        );
        return result.rows.map(rowToNotificationDevice);
      });
      if (sqlDevices) {
        for (const device of sqlDevices) {
          syncArrayItem(getDb().notificationDevices, device);
        }
        return sqlDevices;
      }
      return getDb().notificationDevices.filter((item) => item.userId === id && item.enabled !== false);
    },

    async disableToken(userId, fcmToken) {
      const id = String(userId || "");
      const token = String(fcmToken || "");
      if (!id || !token) return null;
      const device = getDb().notificationDevices.find((item) => item.userId === id && item.fcmToken === token);
      if (!device) return null;
      device.enabled = false;
      device.updatedAt = nowIso();
      await upsertNotificationDeviceSql(device);
      await saveDb();
      return device;
    },
  };

  const auditLogs = {
    async append(input) {
      const log = {
        id: input.id || createId("audit"),
        actorUserId: input.actorUserId || "",
        organizationId: input.organizationId || "",
        action: input.action || "unknown",
        resourceType: input.resourceType || "",
        resourceId: input.resourceId || "",
        ip: input.ip || "",
        userAgent: input.userAgent || "",
        metadata: input.metadata || {},
        createdAt: input.createdAt || nowIso(),
      };
      getDb().auditLogs.unshift(log);
      getDb().auditLogs = getDb().auditLogs.slice(0, 1000);
      await withSql((pool) =>
        pool.query(
          `
            INSERT INTO audit_logs (
              id, actor_user_id, organization_id, action, resource_type, resource_id, ip, user_agent, metadata, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')::inet, $8, $9::jsonb, $10)
            ON CONFLICT (id) DO NOTHING
          `,
          [
            log.id,
            optional(log.actorUserId),
            optional(log.organizationId),
            log.action,
            optional(log.resourceType),
            optional(log.resourceId),
            log.ip || "",
            optional(log.userAgent),
            JSON.stringify(log.metadata || {}),
            log.createdAt,
          ]
        )
      );
      await saveDb();
      return log;
    },
  };

  return {
    auditLogs,
    async hydrateCoreState() {
      const hydrated = await withSql(async (pool) => {
        const [organizationResult, userResult, membershipResult, patientResult, patientShareResult, deviceResult, scanResult, audioResult, aiResult, deviceEventResult, notificationDeviceResult, notificationResult, auditResult] = await Promise.all([
          pool.query("SELECT * FROM organizations ORDER BY created_at ASC"),
          pool.query("SELECT * FROM users ORDER BY created_at ASC"),
          pool.query("SELECT * FROM memberships ORDER BY created_at ASC"),
          pool.query("SELECT * FROM patients ORDER BY updated_at DESC, created_at DESC"),
          pool.query("SELECT * FROM doctor_patient_access ORDER BY created_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM devices ORDER BY updated_at DESC, created_at DESC"),
          pool.query("SELECT * FROM scan_sessions ORDER BY COALESCE(started_at, created_at) DESC LIMIT 500"),
          pool.query("SELECT * FROM audio_files ORDER BY created_at DESC LIMIT 500"),
          pool.query("SELECT * FROM ai_results ORDER BY created_at DESC LIMIT 500"),
          pool.query("SELECT * FROM device_events ORDER BY created_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM notification_devices ORDER BY updated_at DESC LIMIT 1000"),
          pool.query("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 200"),
          pool.query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000"),
        ]);
        return {
          organizations: organizationResult.rows.map(rowToOrganization),
          users: userResult.rows.map(rowToUser),
          memberships: membershipResult.rows.map(rowToMembership),
          patients: patientResult.rows.map(rowToPatient),
          doctorPatientAccess: patientShareResult.rows.map(rowToPatientShare),
          devices: deviceResult.rows.map(rowToDevice),
          scans: scanResult.rows.map(rowToScan),
          audioFiles: audioResult.rows.map(rowToAudioFile),
          aiResults: aiResult.rows.map(rowToAiResult),
          deviceEvents: deviceEventResult.rows.map(rowToDeviceEvent),
          notificationDevices: notificationDeviceResult.rows.map(rowToNotificationDevice),
          notifications: notificationResult.rows.map(rowToNotification),
          auditLogs: auditResult.rows.map(rowToAuditLog),
        };
      });

      if (!hydrated) {
        return null;
      }

      const db = getDb();
      const counts = {};
      for (const key of ["organizations", "users", "memberships", "patients", "doctorPatientAccess", "devices", "scans", "audioFiles", "aiResults", "deviceEvents", "notificationDevices", "notifications", "auditLogs"]) {
        const items = hydrated[key].filter(Boolean);
        counts[key] = items.length;
        // Normalized SQL rows stay authoritative for queryable collections.
        // Keep forward-compatible runtime metadata only for rows that still
        // exist in SQL; an empty SQL table must clear stale runtime rows.
        const runtimeItems = new Map((db[key] || []).map((item) => [item.id, item]));
        db[key] = items.map((item) => ({ ...runtimeItems.get(item.id), ...item }));
      }
      return counts;
    },
    memberships,
    notifications,
    patients,
    patientShares,
    devices,
    scans,
    audioFiles,
    aiResults,
    deviceEvents,
    notificationDevices,
    organizations,
    users,
  };
}

module.exports = {
  createRepositories,
};
